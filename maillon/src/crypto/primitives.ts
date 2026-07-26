/**
 * Enveloppe des primitives cryptographiques.
 *
 * Tout passe par ce module afin que (a) le choix des primitives soit vérifiable
 * en un seul endroit, et (b) la source d'aléa soit injectable — indispensable
 * pour rendre les tests de réseau déterministes.
 *
 * Bibliothèques : @noble/* — implémentations auditées, en TypeScript pur, donc
 * identiques sur Node, navigateur et React Native, sans binaire natif.
 */
import { xchacha20poly1305, chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes as nobleRandomBytes } from "@noble/hashes/utils.js";
import { concat, u64LE } from "../bytes.js";

export const KEY_SIZE = 32;
export const XCHACHA_NONCE_SIZE = 24;
export const CHACHA_NONCE_SIZE = 12;
export const AEAD_TAG_SIZE = 16;

/** Source d'aléa. Substituable par un générateur à graine dans les tests. */
export type Rng = (length: number) => Uint8Array;

export const systemRng: Rng = (length) => nobleRandomBytes(length);

/**
 * Générateur déterministe à graine — **tests uniquement**.
 *
 * ChaCha20 en mode compteur sur la graine : reproductible, et suffisamment
 * bien distribué pour que les tests de routage soient représentatifs.
 */
export function seededRng(seed: number | Uint8Array): Rng {
  const key =
    typeof seed === "number" ? sha256(u64LE(seed)) : seed.length === KEY_SIZE ? seed : sha256(seed);
  let counter = 0n;
  return (length) => {
    const nonce = new Uint8Array(CHACHA_NONCE_SIZE);
    nonce.set(u64LE(counter++), 4);
    // Chiffrer des zéros produit le flux de clé.
    return chacha20poly1305(key, nonce).encrypt(new Uint8Array(length)).slice(0, length);
  };
}

export function hash(...parts: Uint8Array[]): Uint8Array {
  return sha256(concat(...parts));
}

export function mac(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

export function kdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length = KEY_SIZE): Uint8Array {
  return hkdf(sha256, ikm, salt, info, length);
}

// ---------------------------------------------------------------------------
// Accord de clés
// ---------------------------------------------------------------------------

export interface KeyPair {
  readonly secretKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

export function generateX25519(rng: Rng = systemRng): KeyPair {
  const secretKey = rng(KEY_SIZE);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function x25519PublicKey(secretKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secretKey);
}

/**
 * Diffie-Hellman X25519.
 *
 * `getSharedSecret` de noble rejette déjà les points de faible ordre, qui
 * produiraient un secret partagé entièrement nul.
 */
export function dh(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secretKey, publicKey);
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export function generateEd25519(rng: Rng = systemRng): KeyPair {
  const secretKey = rng(KEY_SIZE);
  return { secretKey, publicKey: ed25519.getPublicKey(secretKey) };
}

export function ed25519PublicKey(secretKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(secretKey);
}

export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, secretKey);
}

export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    // Une signature ou une clé mal formée est un échec de vérification,
    // pas une exception à propager.
    return false;
  }
}

/**
 * Clé d'accord X25519 dérivée de la clé de signature Ed25519.
 *
 * Une seule identité à sauvegarder, à afficher en QR et à vérifier. La
 * conversion birationnelle Edwards → Montgomery est exactement ce que
 * `toMontgomerySecret` réalise, si bien que la clé publique X25519
 * correspondante reste calculable à partir de la seule clé publique Ed25519.
 */
export function agreementKeyFromIdentity(ed25519SecretKey: Uint8Array): KeyPair {
  const secretKey = ed25519.utils.toMontgomerySecret(ed25519SecretKey);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function agreementPublicFromIdentityPublic(ed25519PublicKey: Uint8Array): Uint8Array {
  return ed25519.utils.toMontgomery(ed25519PublicKey);
}

// ---------------------------------------------------------------------------
// AEAD
// ---------------------------------------------------------------------------

/**
 * XChaCha20-Poly1305 : nonce de 24 octets, donc un tirage aléatoire n'a aucun
 * risque réaliste de collision. C'est le bon choix quand plusieurs appareils
 * chiffrent sous une même clé de canal sans compteur partagé.
 */
export function aeadEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array,
  rng: Rng = systemRng,
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const nonce = rng(XCHACHA_NONCE_SIZE);
  const cipher = associatedData
    ? xchacha20poly1305(key, nonce, associatedData)
    : xchacha20poly1305(key, nonce);
  return { nonce, ciphertext: cipher.encrypt(plaintext) };
}

/** Retourne `null` si l'authentification échoue — jamais d'exception. */
export function aeadDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  associatedData?: Uint8Array,
): Uint8Array | null {
  try {
    const cipher = associatedData
      ? xchacha20poly1305(key, nonce, associatedData)
      : xchacha20poly1305(key, nonce);
    return cipher.decrypt(ciphertext);
  } catch {
    return null;
  }
}

/**
 * AEAD de la spécification Noise : ChaCha20-Poly1305, nonce
 * `0x00000000 || LE64(n)`.
 */
export function noiseEncrypt(
  key: Uint8Array,
  counter: bigint,
  plaintext: Uint8Array,
  associatedData: Uint8Array,
): Uint8Array {
  return chacha20poly1305(key, noiseNonce(counter), associatedData).encrypt(plaintext);
}

export function noiseDecrypt(
  key: Uint8Array,
  counter: bigint,
  ciphertext: Uint8Array,
  associatedData: Uint8Array,
): Uint8Array | null {
  try {
    return chacha20poly1305(key, noiseNonce(counter), associatedData).decrypt(ciphertext);
  } catch {
    return null;
  }
}

function noiseNonce(counter: bigint): Uint8Array {
  const nonce = new Uint8Array(CHACHA_NONCE_SIZE);
  nonce.set(u64LE(counter), 4);
  return nonce;
}

// ---------------------------------------------------------------------------
// Mots de passe
// ---------------------------------------------------------------------------

/**
 * Dérivation de clé de canal depuis un mot de passe.
 *
 * Argon2id, coûteux à dessein : le mot de passe d'un canal public est la seule
 * barrière, et un attaquant qui capture des trames peut tenter un dictionnaire
 * hors-ligne. Les paramètres visent ~100 ms sur un téléphone de milieu de
 * gamme.
 */
export function deriveChannelKey(
  password: string,
  channelName: string,
  params: { t?: number; m?: number; p?: number } = {},
): Uint8Array {
  return argon2id(password, `maillon/canal/v1/${channelName}`, {
    t: params.t ?? 3,
    m: params.m ?? 65_536,
    p: params.p ?? 1,
    dkLen: KEY_SIZE,
  });
}

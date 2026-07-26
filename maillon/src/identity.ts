/**
 * Identité de nœud et identifiants éphémères — voir docs/PROTOCOL.md §1.
 *
 * Une identité est purement locale : aucun numéro, aucun courriel, aucun
 * enregistrement auprès de qui que ce soit. Elle peut être jetée et regénérée
 * à tout moment.
 */
import { toHex, u64LE } from "./bytes.js";
import {
  agreementKeyFromIdentity,
  agreementPublicFromIdentityPublic,
  ed25519PublicKey,
  generateEd25519,
  hash,
  kdf,
  type KeyPair,
  type Rng,
  systemRng,
} from "./crypto/primitives.js";
import { ID_SIZE } from "./wire.js";

export const FINGERPRINT_SIZE = 8;
export const EPOCH_SECONDS = 900;

const EPH_SALT = new TextEncoder().encode("maillon/eph/v1");

export enum AnonymityMode {
  /**
   * Les identifiants éphémères sont dérivés de la clé d'identité. Un contact
   * qui connaît votre clé publique peut vous retrouver ; un inconnu ne peut pas
   * corréler vos identifiants d'une époque à l'autre.
   */
  DISCOVERABLE = "discoverable",
  /**
   * Identifiants purement aléatoires. Même vos contacts ne vous découvrent plus
   * passivement — la mise en relation exige un échange explicite (QR).
   */
  STRICT = "strict",
}

export interface Identity {
  /** Ed25519 — signature et identité à long terme. */
  readonly signing: KeyPair;
  /** X25519 dérivée de la précédente — accord de clés. */
  readonly agreement: KeyPair;
  /** SHA-256 de la clé publique de signature, tronqué. Vérification hors-bande. */
  readonly fingerprint: Uint8Array;
}

/** Vue publique d'une identité, telle qu'échangée par QR ou NFC. */
export interface PublicIdentity {
  readonly signingPublicKey: Uint8Array;
  readonly agreementPublicKey: Uint8Array;
  readonly fingerprint: Uint8Array;
}

export function generateIdentity(rng: Rng = systemRng): Identity {
  const signing = generateEd25519(rng);
  return {
    signing,
    agreement: agreementKeyFromIdentity(signing.secretKey),
    fingerprint: fingerprintOf(signing.publicKey),
  };
}

/** Reconstruit une identité depuis la seule graine sauvegardée (32 octets). */
export function identityFromSecret(signingSecretKey: Uint8Array): Identity {
  const signing = { secretKey: signingSecretKey, publicKey: ed25519PublicKey(signingSecretKey) };
  return {
    signing,
    agreement: agreementKeyFromIdentity(signingSecretKey),
    fingerprint: fingerprintOf(signing.publicKey),
  };
}

export function fingerprintOf(signingPublicKey: Uint8Array): Uint8Array {
  return hash(signingPublicKey).slice(0, FINGERPRINT_SIZE);
}

export function publicIdentityOf(identity: Identity): PublicIdentity {
  return {
    signingPublicKey: identity.signing.publicKey,
    agreementPublicKey: identity.agreement.publicKey,
    fingerprint: identity.fingerprint,
  };
}

/** Vue publique reconstruite depuis la seule clé de signature (contenu d'un QR). */
export function publicIdentityFromSigningKey(signingPublicKey: Uint8Array): PublicIdentity {
  return {
    signingPublicKey,
    agreementPublicKey: agreementPublicFromIdentityPublic(signingPublicKey),
    fingerprint: fingerprintOf(signingPublicKey),
  };
}

export function currentEpoch(nowMs: number): number {
  return Math.floor(nowMs / 1000 / EPOCH_SECONDS);
}

/**
 * Identifiant éphémère de 6 octets pour une époque donnée.
 *
 * Déterministe à partir de la clé publique : deux contacts calculent le même
 * identifiant sans jamais avoir à le transmettre.
 */
export function ephemeralIdFor(signingPublicKey: Uint8Array, epoch: number): Uint8Array {
  return kdf(signingPublicKey, EPH_SALT, u64LE(epoch), ID_SIZE);
}

/**
 * Fenêtre d'identifiants acceptés autour de l'époque courante.
 *
 * Les horloges dérivent et une trame relayée peut arriver longtemps après son
 * émission : refuser tout ce qui n'est pas de l'époque exacte casserait la
 * livraison en bord d'époque. On accepte donc `±slack` époques.
 */
export function acceptableEphemeralIds(
  signingPublicKey: Uint8Array,
  nowMs: number,
  slack = 1,
): Uint8Array[] {
  const epoch = currentEpoch(nowMs);
  const ids: Uint8Array[] = [];
  for (let d = -slack; d <= slack; d++) ids.push(ephemeralIdFor(signingPublicKey, epoch + d));
  return ids;
}

/**
 * Empreinte lisible à voix haute, pour vérifier un contact de vive voix.
 * Six groupes de quatre chiffres — le même format que l'on dicte au téléphone.
 */
export function fingerprintWords(fingerprint: Uint8Array): string {
  const hex = toHex(fingerprint);
  return (hex.match(/.{1,4}/g) ?? []).join(" ");
}

/** Résout l'identifiant éphémère propre au nœud selon son mode d'anonymat. */
export function ownEphemeralId(
  identity: Identity,
  nowMs: number,
  mode: AnonymityMode,
  rng: Rng = systemRng,
  strictCache?: Map<number, Uint8Array>,
): Uint8Array {
  if (mode === AnonymityMode.DISCOVERABLE) {
    return ephemeralIdFor(identity.signing.publicKey, currentEpoch(nowMs));
  }
  // En mode strict l'identifiant est aléatoire, mais doit rester stable sur la
  // durée d'une époque : changer d'identifiant à chaque trame rendrait toute
  // conversation impossible.
  const epoch = currentEpoch(nowMs);
  const cached = strictCache?.get(epoch);
  if (cached !== undefined) return cached;
  const fresh = rng(ID_SIZE);
  strictCache?.set(epoch, fresh);
  return fresh;
}

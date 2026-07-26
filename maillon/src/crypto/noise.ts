/**
 * Poignée de main Noise, motif XX — voir docs/PROTOCOL.md §5.1.
 *
 *     -> e
 *     <- e, ee, s, es
 *     -> s, se
 *
 * Implémentation fidèle à la spécification Noise (révision 34) pour
 * `Noise_XX_25519_ChaChaPoly_SHA256`. Ce module reste générique : il ne connaît
 * rien de Maillon. La liaison avec l'identité Ed25519 est faite par
 * `src/session.ts`.
 *
 * Rappel de la convention Noise sur les jetons : la première lettre désigne la
 * clé de l'initiateur, la seconde celle du répondeur. `es` vaut donc
 * DH(éphémère de l'initiateur, statique du répondeur), quel que soit le côté
 * qui calcule.
 */
import { concat } from "../bytes.js";
import {
  AEAD_TAG_SIZE,
  KEY_SIZE,
  dh,
  generateX25519,
  hash,
  kdf,
  mac,
  noiseDecrypt,
  noiseEncrypt,
  systemRng,
  type KeyPair,
  type Rng,
} from "./primitives.js";

const PROTOCOL_NAME = "Noise_XX_25519_ChaChaPoly_SHA256";
const EMPTY = new Uint8Array(0);
const ROOT_SALT = new TextEncoder().encode("maillon/root/v1");

export class NoiseError extends Error {}

/**
 * `HKDF` de la spécification Noise : la clé de chaînage sert de sel,
 * l'entrée sert d'IKM, `info` est vide.
 */
function noiseHkdf(chainingKey: Uint8Array, input: Uint8Array, outputs: 2 | 3): Uint8Array[] {
  // Dérivation explicite plutôt qu'un appel HKDF générique, afin que la
  // correspondance avec le pseudo-code de la spécification reste vérifiable.
  const tempKey = mac(chainingKey, input);
  const o1 = mac(tempKey, new Uint8Array([1]));
  const o2 = mac(tempKey, concat(o1, new Uint8Array([2])));
  if (outputs === 2) return [o1, o2];
  return [o1, o2, mac(tempKey, concat(o2, new Uint8Array([3])))];
}

/** `SymmetricState` de la spécification. */
class SymmetricState {
  private ck: Uint8Array;
  private h: Uint8Array;
  private k: Uint8Array | undefined;
  private n = 0n;

  constructor(prologue: Uint8Array) {
    const name = new TextEncoder().encode(PROTOCOL_NAME);
    // Le nom du protocole fait exactement 32 octets ici, mais on suit la règle
    // générale de la spécification (hacher si plus long, compléter sinon).
    this.h = name.length <= KEY_SIZE ? concat(name, new Uint8Array(KEY_SIZE - name.length)) : hash(name);
    this.ck = this.h;
    this.mixHash(prologue);
  }

  mixHash(data: Uint8Array): void {
    this.h = hash(this.h, data);
  }

  mixKey(input: Uint8Array): void {
    const [ck, k] = noiseHkdf(this.ck, input, 2);
    this.ck = ck!;
    this.k = k!;
    this.n = 0n;
  }

  get handshakeHash(): Uint8Array {
    return this.h;
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    if (this.k === undefined) {
      // Avant le premier mixKey il n'y a pas de clé : la charge circule en clair
      // mais reste couverte par le hachage de transcription.
      this.mixHash(plaintext);
      return plaintext;
    }
    const ciphertext = noiseEncrypt(this.k, this.n++, plaintext, this.h);
    this.mixHash(ciphertext);
    return ciphertext;
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    if (this.k === undefined) {
      this.mixHash(ciphertext);
      return ciphertext;
    }
    const plaintext = noiseDecrypt(this.k, this.n++, ciphertext, this.h);
    if (plaintext === null) throw new NoiseError("échec d'authentification pendant la poignée de main");
    this.mixHash(ciphertext);
    return plaintext;
  }

  split(): { first: Uint8Array; second: Uint8Array } {
    const [first, second] = noiseHkdf(this.ck, EMPTY, 2);
    return { first: first!, second: second! };
  }
}

export interface NoiseSessionKeys {
  /** Racine du double cliquet — voir src/crypto/ratchet.ts. */
  readonly rootKey: Uint8Array;
  readonly sendKey: Uint8Array;
  readonly receiveKey: Uint8Array;
  /** Empreinte de transcription : identique des deux côtés, lie la session. */
  readonly handshakeHash: Uint8Array;
  /** Clé statique X25519 du pair, apprise pendant la poignée de main. */
  readonly remoteStaticKey: Uint8Array;
}

export class NoiseHandshake {
  private readonly symmetric: SymmetricState;
  private readonly staticKey: KeyPair;
  private readonly ephemeral: KeyPair;
  private remoteStatic: Uint8Array | undefined;
  private remoteEphemeral: Uint8Array | undefined;
  private step = 0;
  private complete = false;

  private constructor(
    readonly isInitiator: boolean,
    staticKey: KeyPair,
    rng: Rng,
    prologue: Uint8Array,
  ) {
    this.symmetric = new SymmetricState(prologue);
    this.staticKey = staticKey;
    this.ephemeral = generateX25519(rng);
  }

  static initiator(staticKey: KeyPair, rng: Rng = systemRng, prologue: Uint8Array = EMPTY): NoiseHandshake {
    return new NoiseHandshake(true, staticKey, rng, prologue);
  }

  static responder(staticKey: KeyPair, rng: Rng = systemRng, prologue: Uint8Array = EMPTY): NoiseHandshake {
    return new NoiseHandshake(false, staticKey, rng, prologue);
  }

  get isComplete(): boolean {
    return this.complete;
  }

  get remoteStaticKey(): Uint8Array | undefined {
    return this.remoteStatic;
  }

  /** Vrai si c'est notre tour d'émettre. */
  get isMyTurn(): boolean {
    if (this.complete) return false;
    return this.isInitiator ? this.step % 2 === 0 : this.step % 2 === 1;
  }

  writeMessage(payload: Uint8Array = EMPTY): Uint8Array {
    if (this.complete) throw new NoiseError("poignée de main déjà terminée");
    if (!this.isMyTurn) throw new NoiseError(`ce n'est pas notre tour d'émettre (étape ${this.step})`);

    if (this.isInitiator && this.step === 0) return this.writeMessage1(payload);
    if (!this.isInitiator && this.step === 1) return this.writeMessage2(payload);
    if (this.isInitiator && this.step === 2) return this.writeMessage3(payload);
    throw new NoiseError(`étape de poignée de main inattendue ${this.step}`);
  }

  readMessage(message: Uint8Array): Uint8Array {
    if (this.complete) throw new NoiseError("poignée de main déjà terminée");
    if (this.isMyTurn) throw new NoiseError(`ce n'est pas notre tour de lire (étape ${this.step})`);

    if (!this.isInitiator && this.step === 0) return this.readMessage1(message);
    if (this.isInitiator && this.step === 1) return this.readMessage2(message);
    if (!this.isInitiator && this.step === 2) return this.readMessage3(message);
    throw new NoiseError(`étape de poignée de main inattendue ${this.step}`);
  }

  // -- message 1 : -> e ----------------------------------------------------

  private writeMessage1(payload: Uint8Array): Uint8Array {
    this.symmetric.mixHash(this.ephemeral.publicKey);
    const out = concat(this.ephemeral.publicKey, this.symmetric.encryptAndHash(payload));
    this.step = 1;
    return out;
  }

  private readMessage1(message: Uint8Array): Uint8Array {
    if (message.length < KEY_SIZE) throw new NoiseError("message 1 tronqué");
    this.remoteEphemeral = message.slice(0, KEY_SIZE);
    this.symmetric.mixHash(this.remoteEphemeral);
    const payload = this.symmetric.decryptAndHash(message.slice(KEY_SIZE));
    this.step = 1;
    return payload;
  }

  // -- message 2 : <- e, ee, s, es -----------------------------------------

  private writeMessage2(payload: Uint8Array): Uint8Array {
    const re = this.requireRemoteEphemeral();
    this.symmetric.mixHash(this.ephemeral.publicKey);
    this.symmetric.mixKey(dh(this.ephemeral.secretKey, re)); // ee
    const encryptedStatic = this.symmetric.encryptAndHash(this.staticKey.publicKey); // s
    this.symmetric.mixKey(dh(this.staticKey.secretKey, re)); // es
    const out = concat(this.ephemeral.publicKey, encryptedStatic, this.symmetric.encryptAndHash(payload));
    this.step = 2;
    return out;
  }

  private readMessage2(message: Uint8Array): Uint8Array {
    const encryptedStaticSize = KEY_SIZE + AEAD_TAG_SIZE;
    if (message.length < KEY_SIZE + encryptedStaticSize) throw new NoiseError("message 2 tronqué");
    this.remoteEphemeral = message.slice(0, KEY_SIZE);
    this.symmetric.mixHash(this.remoteEphemeral);
    this.symmetric.mixKey(dh(this.ephemeral.secretKey, this.remoteEphemeral)); // ee
    this.remoteStatic = this.symmetric.decryptAndHash(message.slice(KEY_SIZE, KEY_SIZE + encryptedStaticSize)); // s
    this.symmetric.mixKey(dh(this.ephemeral.secretKey, this.remoteStatic)); // es
    const payload = this.symmetric.decryptAndHash(message.slice(KEY_SIZE + encryptedStaticSize));
    this.step = 2;
    return payload;
  }

  // -- message 3 : -> s, se ------------------------------------------------

  private writeMessage3(payload: Uint8Array): Uint8Array {
    const re = this.requireRemoteEphemeral();
    const encryptedStatic = this.symmetric.encryptAndHash(this.staticKey.publicKey); // s
    this.symmetric.mixKey(dh(this.staticKey.secretKey, re)); // se
    const out = concat(encryptedStatic, this.symmetric.encryptAndHash(payload));
    this.step = 3;
    this.complete = true;
    return out;
  }

  private readMessage3(message: Uint8Array): Uint8Array {
    const encryptedStaticSize = KEY_SIZE + AEAD_TAG_SIZE;
    if (message.length < encryptedStaticSize) throw new NoiseError("message 3 tronqué");
    this.remoteStatic = this.symmetric.decryptAndHash(message.slice(0, encryptedStaticSize)); // s
    this.symmetric.mixKey(dh(this.ephemeral.secretKey, this.remoteStatic)); // se
    const payload = this.symmetric.decryptAndHash(message.slice(encryptedStaticSize));
    this.step = 3;
    this.complete = true;
    return payload;
  }

  private requireRemoteEphemeral(): Uint8Array {
    if (this.remoteEphemeral === undefined) throw new NoiseError("clé éphémère du pair inconnue");
    return this.remoteEphemeral;
  }

  /** Clés de session finales. À n'appeler qu'une fois la poignée de main terminée. */
  finish(): NoiseSessionKeys {
    if (!this.complete) throw new NoiseError("poignée de main incomplète");
    if (this.remoteStatic === undefined) throw new NoiseError("clé statique du pair non apprise");
    const { first, second } = this.symmetric.split();
    const handshakeHash = this.symmetric.handshakeHash;
    return {
      // Le hachage de transcription entre dans la racine : deux sessions ne
      // peuvent pas partager de racine sans avoir vu le même échange.
      rootKey: kdf(concat(first, second), ROOT_SALT, handshakeHash),
      sendKey: this.isInitiator ? first : second,
      receiveKey: this.isInitiator ? second : first,
      handshakeHash,
      remoteStaticKey: this.remoteStatic,
    };
  }
}

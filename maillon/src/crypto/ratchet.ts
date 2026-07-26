/**
 * Double cliquet — voir docs/PROTOCOL.md §5.2.
 *
 * Deux cliquets imbriqués :
 *   - symétrique, à chaque message  → confidentialité persistante par message ;
 *   - Diffie-Hellman, à chaque changement de sens → sécurité post-compromission.
 *
 * Particularité imposée par le maillage : **les messages arrivent dans un ordre
 * arbitraire.** Un cliquet strictement séquentiel serait inutilisable ici. Les
 * clés de message sautées sont donc conservées, dans des bornes strictes, pour
 * qu'une trame arrivée en retard reste déchiffrable.
 */
import { concat, readU32BE, toHex, writeU32BE } from "../bytes.js";
import {
  KEY_SIZE,
  XCHACHA_NONCE_SIZE,
  aeadDecrypt,
  dh,
  generateX25519,
  kdf,
  mac,
  systemRng,
  x25519PublicKey,
  type KeyPair,
  type Rng,
} from "./primitives.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";

/** clé publique du cliquet (32) + numéro de la chaîne précédente (4) + numéro (4) */
export const RATCHET_HEADER_SIZE = KEY_SIZE + 8;

const ROOT_INFO = new TextEncoder().encode("maillon/ratchet-root/v1");
const MESSAGE_INFO = new TextEncoder().encode("maillon/ratchet-msg/v1");
const INIT_SALT = new TextEncoder().encode("maillon/ratchet-init/v1");
const EMPTY_SALT = new Uint8Array(KEY_SIZE);

/** Nombre maximal de messages sautés tolérés dans une même chaîne. */
export const MAX_SKIP_PER_CHAIN = 512;
/** Plafond global de clés sautées conservées, pour borner la mémoire. */
export const MAX_SKIPPED_KEYS = 2048;

export class RatchetError extends Error {}

export interface RatchetHeader {
  readonly ratchetPublicKey: Uint8Array;
  /** Longueur de la chaîne d'émission précédente — permet de savoir quoi sauter. */
  readonly previousChainLength: number;
  readonly messageNumber: number;
}

export function encodeRatchetHeader(header: RatchetHeader): Uint8Array {
  const out = new Uint8Array(RATCHET_HEADER_SIZE);
  out.set(header.ratchetPublicKey, 0);
  writeU32BE(out, KEY_SIZE, header.previousChainLength);
  writeU32BE(out, KEY_SIZE + 4, header.messageNumber);
  return out;
}

export function decodeRatchetHeader(buf: Uint8Array): RatchetHeader {
  if (buf.length < RATCHET_HEADER_SIZE) throw new RatchetError("en-tête de cliquet tronqué");
  return {
    ratchetPublicKey: buf.slice(0, KEY_SIZE),
    previousChainLength: readU32BE(buf, KEY_SIZE),
    messageNumber: readU32BE(buf, KEY_SIZE + 4),
  };
}

/** Cliquet de chaîne symétrique : une clé de message, une clé de chaîne suivante. */
function advanceChain(chainKey: Uint8Array): { nextChainKey: Uint8Array; messageKey: Uint8Array } {
  return {
    messageKey: mac(chainKey, new Uint8Array([1])),
    nextChainKey: mac(chainKey, new Uint8Array([2])),
  };
}

/** Cliquet Diffie-Hellman : nouvelle racine et nouvelle clé de chaîne. */
function advanceRoot(rootKey: Uint8Array, dhOutput: Uint8Array): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const derived = kdf(dhOutput, rootKey, ROOT_INFO, KEY_SIZE * 2);
  return { rootKey: derived.slice(0, KEY_SIZE), chainKey: derived.slice(KEY_SIZE) };
}

/**
 * Clé et nonce dérivés de la clé de message.
 *
 * La clé de message est unique par message, donc le nonce dérivé l'est aussi :
 * la réutilisation de nonce est structurellement impossible, et l'on économise
 * 24 octets sur chaque trame en n'ayant pas à le transmettre.
 */
function messageKeyMaterial(messageKey: Uint8Array): { key: Uint8Array; nonce: Uint8Array } {
  const material = kdf(messageKey, EMPTY_SALT, MESSAGE_INFO, KEY_SIZE + XCHACHA_NONCE_SIZE);
  return { key: material.slice(0, KEY_SIZE), nonce: material.slice(KEY_SIZE) };
}

/**
 * Paire de cliquet initiale, dérivée de la racine issue de la poignée de main.
 *
 * Les deux pairs la calculent — c'est acceptable puisqu'elle ne dépend que d'un
 * secret qu'ils partagent déjà, et elle est remplacée dès le premier pas de
 * cliquet.
 */
function initialRatchetKey(rootKey: Uint8Array): KeyPair {
  const secretKey = kdf(rootKey, INIT_SALT, new Uint8Array(0), KEY_SIZE);
  return { secretKey, publicKey: x25519PublicKey(secretKey) };
}

export interface RatchetMessage {
  readonly header: RatchetHeader;
  readonly ciphertext: Uint8Array;
}

/**
 * État du double cliquet pour une session.
 *
 * Le cliquet est **asymétrique par construction** : l'initiateur de la poignée
 * de main possède d'emblée une chaîne d'émission, le répondeur n'en obtient une
 * qu'après avoir reçu un premier message. C'est le fonctionnement normal du
 * double cliquet ; `src/session.ts` s'en accommode en faisant émettre à
 * l'initiateur un message de confirmation dès la fin de la poignée de main.
 */
/**
 * État mutable d'un cliquet, isolé dans un objet propre afin de pouvoir en
 * prendre un instantané. Voir `DoubleRatchet.decrypt` pour la raison.
 */
interface RatchetState {
  rootKey: Uint8Array;
  sending: KeyPair;
  remoteRatchetKey: Uint8Array | undefined;
  sendingChainKey: Uint8Array | undefined;
  receivingChainKey: Uint8Array | undefined;
  sendCount: number;
  receiveCount: number;
  previousSendCount: number;
  /** clé = hex(clé publique du cliquet distant) || ":" || numéro de message */
  skipped: Map<string, Uint8Array>;
  skippedOrder: string[];
}

/** Copie de travail. Les Uint8Array ne sont jamais mutées, donc partageables. */
function cloneState(state: RatchetState): RatchetState {
  return {
    ...state,
    skipped: new Map(state.skipped),
    skippedOrder: [...state.skippedOrder],
  };
}

/**
 * État du double cliquet pour une session.
 *
 * Le cliquet est **asymétrique par construction** : l'initiateur de la poignée
 * de main possède d'emblée une chaîne d'émission, le répondeur n'en obtient une
 * qu'après avoir reçu un premier message. C'est le fonctionnement normal du
 * double cliquet ; `src/session.ts` s'en accommode en faisant émettre à
 * l'initiateur un message de confirmation dès la fin de la poignée de main.
 */
export class DoubleRatchet {
  private state: RatchetState;

  private constructor(
    rootKey: Uint8Array,
    sending: KeyPair,
    remoteRatchetKey: Uint8Array | undefined,
    private readonly rng: Rng,
  ) {
    this.state = {
      rootKey,
      sending,
      remoteRatchetKey,
      sendingChainKey: undefined,
      receivingChainKey: undefined,
      sendCount: 0,
      receiveCount: 0,
      previousSendCount: 0,
      skipped: new Map(),
      skippedOrder: [],
    };
  }

  /** Côté initiateur : dispose immédiatement d'une chaîne d'émission. */
  static initiator(rootKey: Uint8Array, rng: Rng = systemRng): DoubleRatchet {
    const remote = initialRatchetKey(rootKey).publicKey;
    const ratchet = new DoubleRatchet(rootKey, generateX25519(rng), remote, rng);
    const advanced = advanceRoot(rootKey, dh(ratchet.state.sending.secretKey, remote));
    ratchet.state.rootKey = advanced.rootKey;
    ratchet.state.sendingChainKey = advanced.chainKey;
    return ratchet;
  }

  /** Côté répondeur : chaîne d'émission créée au premier message reçu. */
  static responder(rootKey: Uint8Array, rng: Rng = systemRng): DoubleRatchet {
    return new DoubleRatchet(rootKey, initialRatchetKey(rootKey), undefined, rng);
  }

  get canSend(): boolean {
    return this.state.sendingChainKey !== undefined;
  }

  get skippedKeyCount(): number {
    return this.state.skipped.size;
  }

  encrypt(plaintext: Uint8Array, associatedData: Uint8Array = new Uint8Array(0)): RatchetMessage {
    const chainKey = this.state.sendingChainKey;
    if (chainKey === undefined) {
      throw new RatchetError(
        "chaîne d'émission absente : le répondeur doit avoir reçu un message avant de pouvoir émettre",
      );
    }
    const { nextChainKey, messageKey } = advanceChain(chainKey);
    this.state.sendingChainKey = nextChainKey;

    const header: RatchetHeader = {
      ratchetPublicKey: this.state.sending.publicKey,
      previousChainLength: this.state.previousSendCount,
      messageNumber: this.state.sendCount,
    };
    this.state.sendCount++;

    const { key, nonce } = messageKeyMaterial(messageKey);
    const aad = concat(associatedData, encodeRatchetHeader(header));
    return { header, ciphertext: xchacha20poly1305(key, nonce, aad).encrypt(plaintext) };
  }

  /**
   * Retourne `null` si le message est indéchiffrable — jamais d'exception sur
   * une trame hostile.
   *
   * **Toute mutation d'état est différée jusqu'au succès de l'authentification.**
   * C'est une exigence de sécurité, pas une élégance : un pas de cliquet DH
   * remplace la racine, la chaîne de réception et la paire de clés locale. S'il
   * était appliqué sur la foi du seul en-tête — qui n'est pas encore
   * authentifié à ce stade — n'importe qui pourrait détruire définitivement une
   * session en injectant une unique trame forgée portant une clé publique de
   * cliquet inventée. Dans un maillage ouvert où tout le monde peut émettre,
   * ce serait un déni de service à un paquet.
   */
  decrypt(message: RatchetMessage, associatedData: Uint8Array = new Uint8Array(0)): Uint8Array | null {
    const aad = concat(associatedData, encodeRatchetHeader(message.header));

    // 1. Message en retard dont la clé avait été conservée.
    const lookupKey = skippedLookupKey(message.header.ratchetPublicKey, message.header.messageNumber);
    const storedKey = this.state.skipped.get(lookupKey);
    if (storedKey !== undefined) {
      const plaintext = tryDecrypt(storedKey, message.ciphertext, aad);
      if (plaintext !== null) dropSkipped(this.state, lookupKey);
      return plaintext;
    }

    // 2. À partir d'ici on travaille sur un instantané, jeté en cas d'échec.
    const draft = cloneState(this.state);

    const isNewRatchetKey =
      draft.remoteRatchetKey === undefined ||
      toHex(draft.remoteRatchetKey) !== toHex(message.header.ratchetPublicKey);

    try {
      if (isNewRatchetKey) {
        if (draft.receivingChainKey !== undefined) {
          // Terminer l'ancienne chaîne avant d'en changer, sinon les messages
          // encore en vol sur cette chaîne deviendraient indéchiffrables.
          skipUntil(draft, message.header.previousChainLength);
        }
        performDhRatchet(draft, message.header.ratchetPublicKey, this.rng);
      }
      if (draft.receivingChainKey === undefined) return null;
      skipUntil(draft, message.header.messageNumber);
    } catch (error) {
      if (error instanceof RatchetError) return null;
      throw error;
    }

    const receivingChainKey = draft.receivingChainKey;
    if (receivingChainKey === undefined) return null;

    const { nextChainKey, messageKey } = advanceChain(receivingChainKey);
    const plaintext = tryDecrypt(messageKey, message.ciphertext, aad);
    if (plaintext === null) return null; // instantané abandonné, état intact

    draft.receivingChainKey = nextChainKey;
    draft.receiveCount = message.header.messageNumber + 1;
    this.state = draft; // validation
    return plaintext;
  }
}

function tryDecrypt(messageKey: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array | null {
  const { key, nonce } = messageKeyMaterial(messageKey);
  return aeadDecrypt(key, nonce, ciphertext, aad);
}

function performDhRatchet(state: RatchetState, remoteRatchetKey: Uint8Array, rng: Rng): void {
  state.previousSendCount = state.sendCount;
  state.sendCount = 0;
  state.receiveCount = 0;
  state.remoteRatchetKey = remoteRatchetKey;

  const incoming = advanceRoot(state.rootKey, dh(state.sending.secretKey, remoteRatchetKey));
  state.rootKey = incoming.rootKey;
  state.receivingChainKey = incoming.chainKey;

  // Nouvelle paire locale, tirée au hasard : c'est ce pas qui procure la
  // sécurité post-compromission. La dériver de la racine serait une faute —
  // un attaquant ayant capturé l'état pourrait alors prédire toutes les clés
  // de cliquet ultérieures, ce qui annulerait précisément la propriété
  // recherchée.
  state.sending = generateX25519(rng);
  const outgoing = advanceRoot(state.rootKey, dh(state.sending.secretKey, remoteRatchetKey));
  state.rootKey = outgoing.rootKey;
  state.sendingChainKey = outgoing.chainKey;
}

/** Conserve les clés des messages non encore reçus jusqu'à `target`. */
function skipUntil(state: RatchetState, target: number): void {
  const remoteKey = state.remoteRatchetKey;
  if (state.receivingChainKey === undefined || remoteKey === undefined) return;
  if (target <= state.receiveCount) return;
  if (target - state.receiveCount > MAX_SKIP_PER_CHAIN) {
    throw new RatchetError(
      `saut de ${target - state.receiveCount} messages demandé, maximum ${MAX_SKIP_PER_CHAIN}`,
    );
  }
  while (state.receiveCount < target) {
    const { nextChainKey, messageKey } = advanceChain(state.receivingChainKey);
    state.receivingChainKey = nextChainKey;
    storeSkipped(state, remoteKey, state.receiveCount, messageKey);
    state.receiveCount++;
  }
}

function skippedLookupKey(remoteRatchetKey: Uint8Array, messageNumber: number): string {
  return `${toHex(remoteRatchetKey)}:${messageNumber}`;
}

function storeSkipped(
  state: RatchetState,
  remoteRatchetKey: Uint8Array,
  messageNumber: number,
  messageKey: Uint8Array,
): void {
  const key = skippedLookupKey(remoteRatchetKey, messageNumber);
  if (state.skipped.has(key)) return;
  state.skipped.set(key, messageKey);
  state.skippedOrder.push(key);
  // Éviction en file : les clés les plus anciennes correspondent aux messages
  // les moins susceptibles d'arriver encore.
  while (state.skippedOrder.length > MAX_SKIPPED_KEYS) {
    const evicted = state.skippedOrder.shift();
    if (evicted !== undefined) state.skipped.delete(evicted);
  }
}

function dropSkipped(state: RatchetState, key: string): void {
  state.skipped.delete(key);
  const index = state.skippedOrder.indexOf(key);
  if (index >= 0) state.skippedOrder.splice(index, 1);
}

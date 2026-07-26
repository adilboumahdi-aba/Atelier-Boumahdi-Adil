/**
 * Session chiffrée entre deux nœuds : poignée de main Noise XX, puis double
 * cliquet.
 *
 * Ce module apporte la pièce que Noise XX ne fournit pas seul : **la liaison
 * entre la clé statique X25519 de la poignée de main et l'identité Ed25519
 * vérifiable.** Noise XX authentifie que le pair possède bien la clé statique
 * qu'il présente, mais ne dit rien de *qui* c'est. Chaque camp transmet donc sa
 * clé publique Ed25519 dans la charge chiffrée de la poignée de main, et
 * l'autre vérifie que sa conversion en X25519 redonne exactement la clé
 * statique déjà authentifiée. Un imposteur devrait pour cela posséder la clé
 * privée correspondant à l'identité qu'il usurpe.
 */
import { timingSafeEqual, toHex } from "./bytes.js";
import { NoiseError, NoiseHandshake } from "./crypto/noise.js";
import { pad, unpad } from "./crypto/padding.js";
import { KEY_SIZE, agreementPublicFromIdentityPublic, systemRng, type Rng } from "./crypto/primitives.js";
import {
  DoubleRatchet,
  RATCHET_HEADER_SIZE,
  decodeRatchetHeader,
  encodeRatchetHeader,
} from "./crypto/ratchet.js";
import {
  publicIdentityFromSigningKey,
  type Identity,
  type PublicIdentity,
} from "./identity.js";

export class SessionError extends Error {}

export enum SessionState {
  HANDSHAKING = "handshaking",
  ESTABLISHED = "established",
  FAILED = "failed",
}

/** Degré de confiance dans l'identité du pair. */
export enum PeerTrust {
  /**
   * Identité cryptographiquement cohérente, mais jamais confirmée hors-bande.
   * Le chiffrement est réel ; l'interlocuteur, lui, reste à vérifier.
   */
  UNVERIFIED = "unverified",
  /** Empreinte confirmée hors-bande — QR, NFC ou lecture à voix haute. */
  VERIFIED = "verified",
}

export interface SessionOptions {
  readonly rng?: Rng;
  /**
   * Identité attendue du pair, si connue d'avance. Fournie, elle est imposée :
   * une divergence fait échouer la session au lieu de l'établir avec un inconnu.
   */
  readonly expectedPeer?: PublicIdentity;
}

export class MeshSession {
  private state = SessionState.HANDSHAKING;
  private handshake: NoiseHandshake | undefined;
  private ratchet: DoubleRatchet | undefined;
  private peer: PublicIdentity | undefined;
  private trust = PeerTrust.UNVERIFIED;

  private constructor(
    private readonly identity: Identity,
    readonly isInitiator: boolean,
    private readonly rng: Rng,
    private readonly expectedPeer: PublicIdentity | undefined,
  ) {}

  /** Ouvre une session et produit le message 1 de la poignée de main. */
  static initiate(
    identity: Identity,
    options: SessionOptions = {},
  ): { session: MeshSession; handshakeMessage: Uint8Array } {
    const rng = options.rng ?? systemRng;
    const session = new MeshSession(identity, true, rng, options.expectedPeer);
    session.handshake = NoiseHandshake.initiator(identity.agreement, rng);
    return { session, handshakeMessage: session.handshake.writeMessage() };
  }

  /** Accepte une session entrante et produit le message 2. */
  static accept(
    identity: Identity,
    message1: Uint8Array,
    options: SessionOptions = {},
  ): { session: MeshSession; handshakeMessage: Uint8Array } {
    const rng = options.rng ?? systemRng;
    const session = new MeshSession(identity, false, rng, options.expectedPeer);
    session.handshake = NoiseHandshake.responder(identity.agreement, rng);
    try {
      session.handshake.readMessage(message1);
      // La charge du message 2 porte notre identité : chiffrée, donc invisible
      // d'un observateur passif.
      return {
        session,
        handshakeMessage: session.handshake.writeMessage(identity.signing.publicKey),
      };
    } catch (error) {
      session.state = SessionState.FAILED;
      throw new SessionError(`poignée de main entrante refusée : ${describe(error)}`);
    }
  }

  get sessionState(): SessionState {
    return this.state;
  }

  get isEstablished(): boolean {
    return this.state === SessionState.ESTABLISHED;
  }

  get peerIdentity(): PublicIdentity | undefined {
    return this.peer;
  }

  get peerTrust(): PeerTrust {
    return this.trust;
  }

  /**
   * Consomme un message de poignée de main. Retourne le message suivant à
   * émettre, ou `null` quand il n'y a plus rien à envoyer.
   */
  advanceHandshake(message: Uint8Array): Uint8Array | null {
    const handshake = this.handshake;
    if (handshake === undefined || this.state !== SessionState.HANDSHAKING) {
      throw new SessionError("aucune poignée de main en cours");
    }
    try {
      const payload = handshake.readMessage(message);

      if (this.isInitiator) {
        // Message 2 lu : la charge contient l'identité Ed25519 du répondeur.
        this.bindPeerIdentity(payload, handshake.remoteStaticKey);
        const message3 = handshake.writeMessage(this.identity.signing.publicKey);
        this.establish();
        return message3;
      }

      // Message 3 lu : la charge contient l'identité Ed25519 de l'initiateur.
      this.bindPeerIdentity(payload, handshake.remoteStaticKey);
      this.establish();
      return null;
    } catch (error) {
      this.state = SessionState.FAILED;
      if (error instanceof SessionError) throw error;
      if (error instanceof NoiseError) throw new SessionError(`poignée de main échouée : ${error.message}`);
      throw error;
    }
  }

  /**
   * Vérifie que la clé Ed25519 annoncée correspond bien à la clé statique
   * X25519 authentifiée par Noise — c'est tout l'intérêt de l'opération.
   */
  private bindPeerIdentity(payload: Uint8Array, remoteStaticKey: Uint8Array | undefined): void {
    if (remoteStaticKey === undefined) {
      throw new SessionError("clé statique du pair absente de la poignée de main");
    }
    if (payload.length !== KEY_SIZE) {
      throw new SessionError(
        `charge d'identité de ${payload.length} octets, ${KEY_SIZE} attendus`,
      );
    }
    let derived: Uint8Array;
    try {
      derived = agreementPublicFromIdentityPublic(payload);
    } catch {
      throw new SessionError("clé d'identité du pair mal formée");
    }
    if (!timingSafeEqual(derived, remoteStaticKey)) {
      // Le pair présente une identité dont il ne détient pas la clé privée.
      throw new SessionError("l'identité annoncée ne correspond pas à la clé authentifiée");
    }

    const peer = publicIdentityFromSigningKey(payload);

    if (this.expectedPeer !== undefined) {
      if (!timingSafeEqual(peer.fingerprint, this.expectedPeer.fingerprint)) {
        throw new SessionError(
          `identité inattendue : empreinte ${toHex(peer.fingerprint)}, ` +
            `${toHex(this.expectedPeer.fingerprint)} attendue`,
        );
      }
      this.trust = PeerTrust.VERIFIED;
    }
    this.peer = peer;
  }

  private establish(): void {
    const handshake = this.handshake;
    if (handshake === undefined) throw new SessionError("aucune poignée de main en cours");
    const keys = handshake.finish();
    this.ratchet = this.isInitiator
      ? DoubleRatchet.initiator(keys.rootKey, this.rng)
      : DoubleRatchet.responder(keys.rootKey, this.rng);
    this.state = SessionState.ESTABLISHED;
    this.handshake = undefined;
  }

  /** Marque le pair comme vérifié après confirmation hors-bande de l'empreinte. */
  confirmFingerprint(fingerprint: Uint8Array): boolean {
    if (this.peer === undefined) return false;
    if (!timingSafeEqual(this.peer.fingerprint, fingerprint)) return false;
    this.trust = PeerTrust.VERIFIED;
    return true;
  }

  /** Vrai si la session peut émettre — voir la note d'asymétrie du cliquet. */
  get canSend(): boolean {
    return this.ratchet?.canSend === true;
  }

  /** Chiffre un message applicatif. Sortie : en-tête de cliquet || texte chiffré. */
  encrypt(plaintext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
    const ratchet = this.requireRatchet();
    const message = ratchet.encrypt(pad(plaintext), associatedData);
    const out = new Uint8Array(RATCHET_HEADER_SIZE + message.ciphertext.length);
    out.set(encodeRatchetHeader(message.header), 0);
    out.set(message.ciphertext, RATCHET_HEADER_SIZE);
    return out;
  }

  /** Déchiffre un message applicatif. `null` si la trame est illégitime. */
  decrypt(wire: Uint8Array, associatedData?: Uint8Array): Uint8Array | null {
    const ratchet = this.requireRatchet();
    if (wire.length <= RATCHET_HEADER_SIZE) return null;
    let header;
    try {
      header = decodeRatchetHeader(wire.subarray(0, RATCHET_HEADER_SIZE));
    } catch {
      return null;
    }
    const plaintext = ratchet.decrypt(
      { header, ciphertext: wire.slice(RATCHET_HEADER_SIZE) },
      associatedData,
    );
    if (plaintext === null) return null;
    try {
      return unpad(plaintext);
    } catch {
      return null;
    }
  }

  private requireRatchet(): DoubleRatchet {
    if (this.ratchet === undefined || this.state !== SessionState.ESTABLISHED) {
      throw new SessionError(`session non établie (état : ${this.state})`);
    }
    return this.ratchet;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

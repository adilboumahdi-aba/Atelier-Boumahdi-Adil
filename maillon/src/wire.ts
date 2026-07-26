/**
 * Format binaire des trames — voir docs/PROTOCOL.md §2.
 *
 * Ce module ne connaît ni la crypto, ni le routage, ni le transport : il ne
 * fait que traduire des structures en octets et réciproquement.
 */
import { concat, readU16BE, toHex, writeU16BE } from "./bytes.js";

export const PROTOCOL_VERSION = 1;

/** version|type, drapeaux, ttl, packetId(6), src(6), dst(6), fragIndex, fragCount */
export const HEADER_SIZE = 23;

export const ID_SIZE = 6;
export const PACKET_ID_SIZE = 6;

/** Clé de déduplication et de stockage : packetId || fragIndex. */
export const FRAME_KEY_SIZE = PACKET_ID_SIZE + 1;

/** MTU ATT négociée typique sur iOS ; plancher sûr pour tous les transports BLE. */
export const BLE_MAX_FRAME = 185;

export const DEFAULT_TTL = 7;
export const MAX_TTL = 15;

/** Diffusion générale : identifiant destinataire tout à zéro. */
export const BROADCAST_ID: Uint8Array = new Uint8Array(ID_SIZE);

export enum FrameType {
  HELLO = 0,
  HANDSHAKE = 1,
  MESSAGE = 2,
  ACK = 3,
  DIGEST = 4,
  WANT = 5,
  SOS = 6,
  FRAG_NACK = 7,
  LAN_BEACON = 8,
}

export const Flags = {
  ENCRYPTED: 0x01,
  SIGNED: 0x02,
  RELAYABLE: 0x04,
  PRIORITY: 0x08,
  SUPERNODE: 0x10,
  PADDED: 0x20,
} as const;

export interface Frame {
  readonly version: number;
  readonly type: FrameType;
  readonly flags: number;
  readonly ttl: number;
  readonly packetId: Uint8Array;
  readonly src: Uint8Array;
  readonly dst: Uint8Array;
  readonly fragIndex: number;
  readonly fragCount: number;
  readonly payload: Uint8Array;
}

export class WireError extends Error {}

export function hasFlag(frame: Frame, flag: number): boolean {
  return (frame.flags & flag) !== 0;
}

export function isBroadcast(frame: Frame): boolean {
  for (let i = 0; i < ID_SIZE; i++) if (frame.dst[i] !== 0) return false;
  return true;
}

/** packetId || fragIndex — distingue les fragments d'un même paquet. */
export function frameKey(frame: Frame): Uint8Array {
  const key = new Uint8Array(FRAME_KEY_SIZE);
  key.set(frame.packetId, 0);
  key[PACKET_ID_SIZE] = frame.fragIndex;
  return key;
}

export function frameKeyHex(frame: Frame): string {
  return toHex(frameKey(frame));
}

export function encodeFrame(frame: Frame): Uint8Array {
  if (frame.version < 0 || frame.version > 15) throw new WireError("version hors de 0..15");
  if (frame.type < 0 || frame.type > 15) throw new WireError("type hors de 0..15");
  if (frame.ttl < 0 || frame.ttl > 0xff) throw new WireError("ttl hors de 0..255");
  if (frame.packetId.length !== PACKET_ID_SIZE) throw new WireError("packetId doit faire 6 octets");
  if (frame.src.length !== ID_SIZE) throw new WireError("src doit faire 6 octets");
  if (frame.dst.length !== ID_SIZE) throw new WireError("dst doit faire 6 octets");
  if (frame.fragCount < 1 || frame.fragCount > 0xff) throw new WireError("fragCount doit être dans 1..255");
  if (frame.fragIndex >= frame.fragCount) throw new WireError("fragIndex hors des limites de fragCount");

  const out = new Uint8Array(HEADER_SIZE + frame.payload.length);
  out[0] = ((frame.version & 0x0f) << 4) | (frame.type & 0x0f);
  out[1] = frame.flags & 0xff;
  out[2] = frame.ttl;
  out.set(frame.packetId, 3);
  out.set(frame.src, 9);
  out.set(frame.dst, 15);
  out[21] = frame.fragIndex;
  out[22] = frame.fragCount;
  out.set(frame.payload, HEADER_SIZE);
  return out;
}

export function decodeFrame(buf: Uint8Array): Frame {
  if (buf.length < HEADER_SIZE) {
    throw new WireError(`trame tronquée : ${buf.length} octets, minimum ${HEADER_SIZE}`);
  }
  const version = buf[0]! >> 4;
  if (version !== PROTOCOL_VERSION) {
    throw new WireError(`version de protocole non prise en charge : ${version}`);
  }
  const fragCount = buf[22]!;
  const fragIndex = buf[21]!;
  if (fragCount < 1) throw new WireError("fragCount vaut zéro");
  if (fragIndex >= fragCount) throw new WireError("fragIndex hors des limites de fragCount");

  return {
    version,
    type: (buf[0]! & 0x0f) as FrameType,
    flags: buf[1]!,
    ttl: buf[2]!,
    // `slice` copie : la trame décodée ne doit pas aliaser le tampon du transport,
    // que l'appelant peut réutiliser.
    packetId: buf.slice(3, 9),
    src: buf.slice(9, 15),
    dst: buf.slice(15, 21),
    fragIndex,
    fragCount,
    payload: buf.slice(HEADER_SIZE),
  };
}

/** Trame identique, TTL décrémenté — utilisé par le relais. */
export function withDecrementedTtl(frame: Frame): Frame {
  return { ...frame, ttl: Math.max(0, frame.ttl - 1) };
}

export function withFlags(frame: Frame, flags: number): Frame {
  return { ...frame, flags: frame.flags | flags };
}

export function maxPayloadPerFragment(maxFrameSize: number): number {
  const usable = maxFrameSize - HEADER_SIZE;
  if (usable < 1) throw new WireError(`maxFrameSize ${maxFrameSize} ne laisse aucune place à la charge utile`);
  return usable;
}

/**
 * Découpe une charge utile en fragments partageant le même `packetId`.
 * Les fragments sont des trames autonomes : un relais les achemine sans
 * jamais avoir à les réassembler.
 */
export function fragment(frame: Frame, maxFrameSize: number): Frame[] {
  const perFragment = maxPayloadPerFragment(maxFrameSize);
  if (frame.payload.length <= perFragment) {
    return [{ ...frame, fragIndex: 0, fragCount: 1 }];
  }
  const count = Math.ceil(frame.payload.length / perFragment);
  if (count > 255) {
    throw new WireError(
      `la charge utile de ${frame.payload.length} octets exige ${count} fragments, maximum 255 pour maxFrameSize=${maxFrameSize}`,
    );
  }
  const frames: Frame[] = [];
  for (let i = 0; i < count; i++) {
    frames.push({
      ...frame,
      fragIndex: i,
      fragCount: count,
      payload: frame.payload.slice(i * perFragment, (i + 1) * perFragment),
    });
  }
  return frames;
}

interface PendingReassembly {
  readonly parts: Array<Uint8Array | undefined>;
  readonly count: number;
  received: number;
  bytes: number;
  expiresAt: number;
  template: Frame;
}

export interface ReassemblerOptions {
  /** Délai de garde avant abandon d'un paquet incomplet. */
  readonly timeoutMs?: number;
  /** Nombre maximal de paquets partiels suivis simultanément. */
  readonly maxPending?: number;
  /** Garde-fou mémoire par paquet. */
  readonly maxMessageBytes?: number;
}

export interface ReassemblyStats {
  readonly pending: number;
  readonly completed: number;
  readonly expired: number;
  readonly duplicateFragments: number;
}

/**
 * Réassemble les fragments au destinataire final.
 *
 * Borné dans les deux dimensions — nombre de paquets partiels et octets par
 * paquet — car un pair hostile peut inonder de premiers fragments de paquets
 * qui ne seront jamais complétés.
 */
export class Reassembler {
  private readonly pending = new Map<string, PendingReassembly>();
  private readonly timeoutMs: number;
  private readonly maxPending: number;
  private readonly maxMessageBytes: number;
  private completed = 0;
  private expired = 0;
  private duplicateFragments = 0;

  constructor(options: ReassemblerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxPending = options.maxPending ?? 256;
    this.maxMessageBytes = options.maxMessageBytes ?? 1 << 20;
  }

  /** Retourne la trame complète lorsque le dernier fragment arrive, sinon `null`. */
  push(frame: Frame, now: number): Frame | null {
    if (frame.fragCount === 1) return frame;

    this.evictExpired(now);
    const key = toHex(frame.packetId);
    let entry = this.pending.get(key);

    if (entry === undefined) {
      if (this.pending.size >= this.maxPending) {
        // Évincer le paquet partiel le plus proche de l'expiration plutôt que
        // de rejeter le nouveau : un flot de fragments orphelins ne doit pas
        // bloquer indéfiniment le trafic légitime.
        this.evictOldest();
      }
      entry = {
        parts: new Array<Uint8Array | undefined>(frame.fragCount),
        count: frame.fragCount,
        received: 0,
        bytes: 0,
        expiresAt: now + this.timeoutMs,
        template: frame,
      };
      this.pending.set(key, entry);
    } else if (entry.count !== frame.fragCount) {
      // fragCount incohérent pour un même packetId : trame forgée ou collision
      // d'identifiant. On abandonne le paquet plutôt que d'assembler du bruit.
      this.pending.delete(key);
      return null;
    }

    if (entry.parts[frame.fragIndex] !== undefined) {
      this.duplicateFragments++;
      return null;
    }
    if (entry.bytes + frame.payload.length > this.maxMessageBytes) {
      this.pending.delete(key);
      return null;
    }

    entry.parts[frame.fragIndex] = frame.payload;
    entry.received++;
    entry.bytes += frame.payload.length;

    if (entry.received < entry.count) return null;

    this.pending.delete(key);
    this.completed++;
    return {
      ...entry.template,
      fragIndex: 0,
      fragCount: 1,
      payload: concat(...(entry.parts as Uint8Array[])),
    };
  }

  /** Index des fragments encore attendus, pour émettre un `FRAG_NACK`. */
  missingFragments(packetId: Uint8Array): number[] {
    const entry = this.pending.get(toHex(packetId));
    if (entry === undefined) return [];
    const missing: number[] = [];
    for (let i = 0; i < entry.count; i++) if (entry.parts[i] === undefined) missing.push(i);
    return missing;
  }

  evictExpired(now: number): void {
    for (const [key, entry] of this.pending) {
      if (entry.expiresAt <= now) {
        this.pending.delete(key);
        this.expired++;
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.pending) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) {
      this.pending.delete(oldestKey);
      this.expired++;
    }
  }

  stats(): ReassemblyStats {
    return {
      pending: this.pending.size,
      completed: this.completed,
      expired: this.expired,
      duplicateFragments: this.duplicateFragments,
    };
  }
}

/** Encodage d'une liste d'index de fragments manquants (charge d'un FRAG_NACK). */
export function encodeFragNack(packetId: Uint8Array, missing: readonly number[]): Uint8Array {
  const out = new Uint8Array(PACKET_ID_SIZE + 2 + missing.length);
  out.set(packetId, 0);
  writeU16BE(out, PACKET_ID_SIZE, missing.length);
  for (let i = 0; i < missing.length; i++) out[PACKET_ID_SIZE + 2 + i] = missing[i]!;
  return out;
}

export function decodeFragNack(payload: Uint8Array): { packetId: Uint8Array; missing: number[] } {
  if (payload.length < PACKET_ID_SIZE + 2) throw new WireError("charge FRAG_NACK tronquée");
  const count = readU16BE(payload, PACKET_ID_SIZE);
  if (payload.length < PACKET_ID_SIZE + 2 + count) throw new WireError("FRAG_NACK plus court que son propre compte");
  const missing: number[] = [];
  for (let i = 0; i < count; i++) missing.push(payload[PACKET_ID_SIZE + 2 + i]!);
  return { packetId: payload.slice(0, PACKET_ID_SIZE), missing };
}

/**
 * Magasin de relais — stockage-transfert, docs/PROTOCOL.md §4.
 *
 * Un message destiné à un nœud momentanément absent n'est pas perdu : les nœuds
 * du trajet le conservent et le remettent à la prochaine rencontre. C'est ce qui
 * rend le réseau *tolérant aux délais* plutôt que dépendant d'un chemin
 * instantané de bout en bout.
 */
import { BloomFilter } from "./bloom.js";
import { frameKey, frameKeyHex, type Frame } from "./wire.js";

/** Priorités d'éviction. Un appel de détresse doit partir en dernier. */
export enum StorePriority {
  BULK = 0,
  NORMAL = 1,
  HIGH = 2,
  EMERGENCY = 3,
}

export interface RelayStoreOptions {
  /** Plafond d'entrées. Un téléphone garde peu, un super-nœud beaucoup. */
  readonly maxEntries?: number;
  readonly defaultTtlMs?: number;
}

interface StoredFrame {
  readonly frame: Frame;
  readonly priority: StorePriority;
  readonly storedAt: number;
  readonly expiresAt: number;
}

export interface RelayStoreStats {
  readonly size: number;
  readonly stored: number;
  readonly expired: number;
  readonly evicted: number;
  readonly delivered: number;
}

export class RelayStore {
  private readonly entries = new Map<string, StoredFrame>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private stored = 0;
  private expired = 0;
  private evicted = 0;
  private delivered = 0;

  constructor(options: RelayStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 512;
    this.defaultTtlMs = options.defaultTtlMs ?? 12 * 3600_000;
  }

  put(
    frame: Frame,
    now: number,
    priority: StorePriority = StorePriority.NORMAL,
    ttlMs = this.defaultTtlMs,
  ): boolean {
    const key = frameKeyHex(frame);
    if (this.entries.has(key)) return false;
    if (this.entries.size >= this.maxEntries && !this.evictOne(priority)) {
      // Magasin plein et rien de moins prioritaire à sacrifier : on refuse
      // plutôt que d'écarter une trame plus importante.
      return false;
    }
    this.entries.set(key, { frame, priority, storedAt: now, expiresAt: now + ttlMs });
    this.stored++;
    return true;
  }

  has(keyHex: string): boolean {
    return this.entries.has(keyHex);
  }

  get(keyHex: string): Frame | undefined {
    return this.entries.get(keyHex)?.frame;
  }

  delete(keyHex: string): boolean {
    return this.entries.delete(keyHex);
  }

  get size(): number {
    return this.entries.size;
  }

  frames(): Frame[] {
    return [...this.entries.values()].map((entry) => entry.frame);
  }

  evictExpired(now: number): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        removed++;
      }
    }
    this.expired += removed;
    return removed;
  }

  /**
   * Évince une entrée pour faire place à une trame de priorité `incoming`.
   * Cible la priorité la plus basse, et parmi elles la plus ancienne.
   */
  private evictOne(incoming: StorePriority): boolean {
    let victimKey: string | undefined;
    let victimPriority = StorePriority.EMERGENCY + 1;
    let victimStoredAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries) {
      if (entry.priority < victimPriority || (entry.priority === victimPriority && entry.storedAt < victimStoredAt)) {
        victimKey = key;
        victimPriority = entry.priority;
        victimStoredAt = entry.storedAt;
      }
    }
    if (victimKey === undefined || victimPriority > incoming) return false;
    this.entries.delete(victimKey);
    this.evicted++;
    return true;
  }

  /** Résumé compact des trames détenues, à placer dans une trame DIGEST. */
  digest(): BloomFilter {
    const filter = BloomFilter.forItems(Math.max(1, this.entries.size));
    for (const entry of this.entries.values()) filter.add(frameKey(entry.frame));
    return filter;
  }

  /**
   * Trames que le pair ne possède manifestement pas, d'après son résumé.
   *
   * Les plus prioritaires d'abord : si le contact est bref, ce sont elles qui
   * doivent passer.
   */
  framesMissingFrom(peerDigest: BloomFilter, limit = Number.POSITIVE_INFINITY): Frame[] {
    const missing: StoredFrame[] = [];
    for (const entry of this.entries.values()) {
      if (!peerDigest.mightContain(frameKey(entry.frame))) missing.push(entry);
    }
    missing.sort((a, b) => b.priority - a.priority || a.storedAt - b.storedAt);
    const selected = missing.slice(0, limit === Number.POSITIVE_INFINITY ? undefined : limit);
    this.delivered += selected.length;
    return selected.map((entry) => entry.frame);
  }

  stats(): RelayStoreStats {
    return {
      size: this.entries.size,
      stored: this.stored,
      expired: this.expired,
      evicted: this.evicted,
      delivered: this.delivered,
    };
  }
}

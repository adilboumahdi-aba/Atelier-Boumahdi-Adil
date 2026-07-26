/**
 * Cache de déduplication.
 *
 * Dans une inondation, chaque nœud reçoit la même trame par plusieurs chemins.
 * Ce cache assure deux fonctions distinctes : ne pas retraiter une trame déjà
 * vue, et **compter combien de voisins l'ont rediffusée** — c'est ce compteur
 * qui permet à un nœud de renoncer à émettre quand le voisinage est déjà
 * couvert (docs/PROTOCOL.md §3, étape 5).
 */

interface SeenEntry {
  expiresAt: number;
  heard: number;
}

export interface SeenCacheOptions {
  readonly maxEntries?: number;
  readonly ttlMs?: number;
}

export class SeenCache {
  private readonly entries = new Map<string, SeenEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(options: SeenCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 8192;
    this.ttlMs = options.ttlMs ?? 300_000;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Enregistre une trame vue pour la première fois. Retourne `false` si déjà connue. */
  add(key: string, now: number): boolean {
    if (this.entries.has(key)) return false;
    if (this.entries.size >= this.maxEntries) {
      // Map préserve l'ordre d'insertion : la première clé est la plus ancienne.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { expiresAt: now + this.ttlMs, heard: 0 });
    return true;
  }

  /** Compte une rediffusion entendue depuis un voisin. Retourne le total. */
  noteHeard(key: string): number {
    const entry = this.entries.get(key);
    if (entry === undefined) return 0;
    entry.heard++;
    return entry.heard;
  }

  heardCount(key: string): number {
    return this.entries.get(key)?.heard ?? 0;
  }

  evictExpired(now: number): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.entries.size;
  }
}

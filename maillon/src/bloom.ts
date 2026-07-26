/**
 * Filtre de Bloom pour la réconciliation anti-entropie — docs/PROTOCOL.md §4.
 *
 * À la rencontre d'un pair, chaque camp résume les trames qu'il détient en un
 * filtre compact. Le pair teste **ses propres** clés contre ce filtre : celles
 * qui en sont absentes sont assurément inconnues de l'émetteur, et lui sont
 * poussées.
 *
 * Le filtre produit des faux positifs mais jamais de faux négatifs : une trame
 * peut donc être omise à une rencontre et transmise à la suivante. C'est le bon
 * compromis pour du routage épidémique — on échange une convergence un peu plus
 * lente contre une consommation de bande passante bien moindre qu'une
 * réinondation aveugle.
 */
import { readU16BE, writeU16BE } from "./bytes.js";
import { hash } from "./crypto/primitives.js";

/** SHA-256 fournit 32 octets, soit au plus huit index de 4 octets. */
const MAX_HASH_COUNT = 8;

export class BloomError extends Error {}

export class BloomFilter {
  private constructor(
    private readonly bits: Uint8Array,
    readonly hashCount: number,
  ) {}

  /** Filtre dimensionné pour `expected` éléments au taux de faux positifs visé. */
  static forItems(expected: number, falsePositiveRate = 0.02): BloomFilter {
    const safeExpected = Math.max(1, expected);
    // m = -n·ln(p)/ (ln 2)²  ; k = (m/n)·ln 2
    const bitCount = Math.ceil((-safeExpected * Math.log(falsePositiveRate)) / Math.LN2 ** 2);
    const byteCount = Math.max(1, Math.ceil(bitCount / 8));
    const hashCount = Math.min(
      MAX_HASH_COUNT,
      Math.max(1, Math.round(((byteCount * 8) / safeExpected) * Math.LN2)),
    );
    return new BloomFilter(new Uint8Array(byteCount), hashCount);
  }

  static withCapacity(byteCount: number, hashCount: number): BloomFilter {
    if (byteCount < 1) throw new BloomError("filtre de Bloom vide");
    if (hashCount < 1 || hashCount > MAX_HASH_COUNT) {
      throw new BloomError(`hashCount ${hashCount} hors de 1..${MAX_HASH_COUNT}`);
    }
    return new BloomFilter(new Uint8Array(byteCount), hashCount);
  }

  get byteLength(): number {
    return this.bits.length;
  }

  add(item: Uint8Array): void {
    for (const index of this.indices(item)) {
      this.bits[index >> 3] = this.bits[index >> 3]! | (1 << (index & 7));
    }
  }

  mightContain(item: Uint8Array): boolean {
    for (const index of this.indices(item)) {
      if ((this.bits[index >> 3]! & (1 << (index & 7))) === 0) return false;
    }
    return true;
  }

  private indices(item: Uint8Array): number[] {
    const digest = hash(item);
    const bitCount = this.bits.length * 8;
    const out: number[] = [];
    for (let i = 0; i < this.hashCount; i++) {
      const offset = i * 4;
      const value =
        (digest[offset]! << 24) |
        (digest[offset + 1]! << 16) |
        (digest[offset + 2]! << 8) |
        digest[offset + 3]!;
      out.push((value >>> 0) % bitCount);
    }
    return out;
  }

  /** hashCount (1 o) || nombre d'octets (2 o) || bits — charge d'une trame DIGEST. */
  encode(): Uint8Array {
    const out = new Uint8Array(3 + this.bits.length);
    out[0] = this.hashCount;
    writeU16BE(out, 1, this.bits.length);
    out.set(this.bits, 3);
    return out;
  }

  static decode(buf: Uint8Array): BloomFilter {
    if (buf.length < 3) throw new BloomError("charge de filtre de Bloom tronquée");
    const hashCount = buf[0]!;
    const byteCount = readU16BE(buf, 1);
    if (hashCount < 1 || hashCount > MAX_HASH_COUNT) {
      throw new BloomError(`hashCount ${hashCount} hors bornes`);
    }
    if (buf.length < 3 + byteCount) throw new BloomError("filtre de Bloom plus court que sa longueur déclarée");
    return new BloomFilter(buf.slice(3, 3 + byteCount), hashCount);
  }
}

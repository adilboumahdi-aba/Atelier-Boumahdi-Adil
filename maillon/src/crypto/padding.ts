/**
 * Complétion par paliers de taille — voir docs/PROTOCOL.md §5.4.
 *
 * Le chiffrement protège le contenu, pas la longueur. Sans complétion, un
 * observateur distingue « ok » (2 octets) de « rendez-vous annulé » (18 octets)
 * sans rien déchiffrer, ce qui suffit souvent à reconstituer une conversation.
 *
 * La complétion s'applique **avant** le chiffrement : le remplissage est donc
 * indiscernable du contenu dans le texte chiffré, et sa valeur n'importe pas.
 */
import { readU32BE, writeU32BE } from "../bytes.js";

/** Paliers en octets. Un message est complété jusqu'au premier palier suffisant. */
export const PADDING_BUCKETS: readonly number[] = [64, 256, 1024, 4096, 16_384, 65_536];

const LENGTH_PREFIX = 4;

export class PaddingError extends Error {}

export function bucketFor(length: number): number {
  const needed = length + LENGTH_PREFIX;
  for (const bucket of PADDING_BUCKETS) if (needed <= bucket) return bucket;
  // Au-delà du dernier palier, on complète au multiple supérieur du plus grand
  // palier : la granularité reste grossière sans plafonner la taille utile.
  const largest = PADDING_BUCKETS[PADDING_BUCKETS.length - 1]!;
  return Math.ceil(needed / largest) * largest;
}

export function pad(payload: Uint8Array): Uint8Array {
  const bucket = bucketFor(payload.length);
  const out = new Uint8Array(bucket);
  writeU32BE(out, 0, payload.length);
  out.set(payload, LENGTH_PREFIX);
  return out;
}

export function unpad(padded: Uint8Array): Uint8Array {
  if (padded.length < LENGTH_PREFIX) throw new PaddingError("charge complétée tronquée");
  const length = readU32BE(padded, 0);
  if (length > padded.length - LENGTH_PREFIX) {
    throw new PaddingError(`longueur déclarée ${length} au-delà de la charge de ${padded.length} octets`);
  }
  return padded.slice(LENGTH_PREFIX, LENGTH_PREFIX + length);
}

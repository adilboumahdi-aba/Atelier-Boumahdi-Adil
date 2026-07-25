/* GeoField — téléchargement de zones cartographiques pour l'usage hors ligne. */

import * as db from './db.js';
import { BASEMAPS } from './map.js';

/* ---------------------------------------------------------------- maths tuiles */

export function lngToTileX(lng, z) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

export function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/** Liste des tuiles couvrant une emprise pour une plage de zooms. */
export function tilesForBounds(bounds, minZoom, maxZoom, cap = 20000) {
  const list = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x1 = lngToTileX(bounds.west, z);
    const x2 = lngToTileX(bounds.east, z);
    const y1 = latToTileY(bounds.north, z);
    const y2 = latToTileY(bounds.south, z);
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        list.push({ z, x, y });
        if (list.length >= cap) return { tiles: list, truncated: true };
      }
    }
  }
  return { tiles: list, truncated: false };
}

/** Estimation du nombre de tuiles et du poids (≈ 18 ko/tuile raster). */
export function estimate(bounds, minZoom, maxZoom) {
  const { tiles, truncated } = tilesForBounds(bounds, minZoom, maxZoom, 200000);
  return { count: tiles.length, bytes: tiles.length * 18000, truncated };
}

function tileUrl(template, { z, x, y }) {
  return template.replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', '');
}

/* ---------------------------------------------------------------- téléchargement */

/**
 * Télécharge et met en cache une zone.
 * @returns {{promise: Promise, abort: Function}}
 */
export function downloadArea({ bounds, basemapId, minZoom, maxZoom, concurrency = 6, onProgress }) {
  const def = BASEMAPS[basemapId] || BASEMAPS.osm;
  const topZoom = Math.min(maxZoom, def.maxZoom);
  const { tiles, truncated } = tilesForBounds(bounds, minZoom, topZoom);

  let aborted = false;
  let done = 0, saved = 0, skipped = 0, failed = 0, bytes = 0;
  let cursor = 0;

  async function worker() {
    while (!aborted && cursor < tiles.length) {
      const t = tiles[cursor++];
      try {
        const existing = await db.getTile(def.id, t.z, t.x, t.y);
        if (existing) {
          skipped++;
        } else {
          const res = await fetch(tileUrl(def.url, t), { mode: 'cors', cache: 'no-store' });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          await db.putTile(def.id, t.z, t.x, t.y, blob);
          saved++;
          bytes += blob.size;
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 5 === 0 || done === tiles.length) {
        onProgress?.({ done, total: tiles.length, saved, skipped, failed, bytes });
      }
    }
  }

  const promise = (async () => {
    onProgress?.({ done: 0, total: tiles.length, saved, skipped, failed, bytes });
    await Promise.all(Array.from({ length: concurrency }, worker));
    return { total: tiles.length, done, saved, skipped, failed, bytes, aborted, truncated };
  })();

  return { promise, abort() { aborted = true; }, total: tiles.length };
}

export function formatBytes(b) {
  if (!b) return '0 o';
  const units = ['o', 'ko', 'Mo', 'Go'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

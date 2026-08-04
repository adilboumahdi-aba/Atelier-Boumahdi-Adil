/* GeoField — rendu d'une carte statique (PNG) à partir des tuiles en cache.
   Utilisé pour les rapports PDF : fonctionne hors ligne si la zone a été téléchargée. */

import * as db from './db.js';
import { BASEMAPS } from './map.js';
import { getTemplate } from './templates.js';

const TILE = 256;

function projectPx(lat, lng, z) {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function pickZoom(bounds, width, height, maxZoom) {
  for (let z = maxZoom; z >= 1; z--) {
    const a = projectPx(bounds.north, bounds.west, z);
    const b = projectPx(bounds.south, bounds.east, z);
    if (Math.abs(b.x - a.x) <= width && Math.abs(b.y - a.y) <= height) return z;
  }
  return 1;
}

async function tileImage(def, z, x, y) {
  let blob = await db.getTile(def.id, z, x, y);
  if (!blob && navigator.onLine) {
    try {
      const url = def.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        blob = await res.blob();
        db.putTile(def.id, z, x, y, blob);
      }
    } catch { /* la tuile restera vide */ }
  }
  if (!blob) return null;
  try {
    if (window.createImageBitmap) return await createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });
    return img;
  } catch { return null; }
}

/**
 * Génère une image PNG (dataURL) centrée sur les objets fournis.
 * @param {Array} features objets du projet
 * @param {Object} opts {width, height, basemapId, padding, highlightId}
 */
export async function renderStaticMap(features, opts = {}) {
  const width = opts.width || 900;
  const height = opts.height || 560;
  const padding = opts.padding ?? 48;
  const def = BASEMAPS[opts.basemapId] || BASEMAPS.osm;

  const pts = features.flatMap((f) => f.coords);
  if (!pts.length) return null;

  let north = -90, south = 90, east = -180, west = 180;
  for (const p of pts) {
    north = Math.max(north, p.lat); south = Math.min(south, p.lat);
    east = Math.max(east, p.lng); west = Math.min(west, p.lng);
  }
  // Marge minimale pour un point isolé.
  if (north - south < 0.0008) { north += 0.0004; south -= 0.0004; }
  if (east - west < 0.0008) { east += 0.0004; west -= 0.0004; }

  const bounds = { north, south, east, west };
  const z = Math.min(pickZoom(bounds, width - padding * 2, height - padding * 2, def.maxZoom), def.maxZoom);

  const tl = projectPx(north, west, z);
  const br = projectPx(south, east, z);
  const originX = (tl.x + br.x) / 2 - width / 2;
  const originY = (tl.y + br.y) / 2 - height / 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(0, 0, width, height);

  const x0 = Math.floor(originX / TILE);
  const x1 = Math.floor((originX + width) / TILE);
  const y0 = Math.floor(originY / TILE);
  const y1 = Math.floor((originY + height) / TILE);
  const max = 2 ** z;

  const jobs = [];
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= max) continue;
      const wrapped = ((tx % max) + max) % max;
      jobs.push(tileImage(def, z, wrapped, ty).then((img) => {
        if (img) ctx.drawImage(img, tx * TILE - originX, ty * TILE - originY, TILE, TILE);
      }));
    }
  }
  await Promise.all(jobs);

  const toPx = (p) => {
    const q = projectPx(p.lat, p.lng, z);
    return { x: q.x - originX, y: q.y - originY };
  };

  // Géométries
  for (const f of features) {
    const tpl = getTemplate(f.template);
    if (f.type === 'point') continue;
    ctx.beginPath();
    f.coords.forEach((p, i) => {
      const q = toPx(p);
      i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
    });
    if (f.type === 'polygon') {
      ctx.closePath();
      ctx.fillStyle = hexAlpha(tpl.color, 0.25);
      ctx.fill();
    }
    ctx.strokeStyle = tpl.color;
    ctx.lineWidth = f.id === opts.highlightId ? 5 : 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Points par-dessus, numérotés
  features.forEach((f, i) => {
    if (f.type !== 'point') return;
    const tpl = getTemplate(f.template);
    const q = toPx(f.coords[0]);
    ctx.beginPath();
    ctx.arc(q.x, q.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = tpl.color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    if (opts.numbered) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), q.x, q.y + 0.5);
    }
  });

  drawScaleBar(ctx, width, height, z, (north + south) / 2);
  drawAttribution(ctx, width, height, def.attribution);

  return canvas.toDataURL('image/jpeg', 0.85);
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function drawScaleBar(ctx, width, height, z, lat) {
  const mPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
  const targets = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const target = targets.find((t) => t / mPerPx > 60) || 5000;
  const px = target / mPerPx;
  const x = 14, y = height - 18;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x - 6, y - 16, px + 60, 24);
  ctx.strokeStyle = '#1d1b16';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + px, y);
  ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 3);
  ctx.moveTo(x + px, y - 5); ctx.lineTo(x + px, y + 3);
  ctx.stroke();
  ctx.fillStyle = '#1d1b16';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(target >= 1000 ? `${target / 1000} km` : `${target} m`, x + px + 8, y + 3);
}

function drawAttribution(ctx, width, height, text) {
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(width - w - 4, height - 16, w + 4, 16);
  ctx.fillStyle = '#4a463c';
  ctx.fillText(text, width - 8, height - 5);
}

/* GeoField — capture photo géolocalisée, redimensionnement et vignettes. */

import { state, addPhoto } from './store.js';
import * as gps from './gps.js';

const MAX_EDGE = 1600;
const THUMB_EDGE = 320;
const QUALITY = 0.82;

/** Ouvre l'appareil photo (ou la galerie) et renvoie la liste des fichiers choisis. */
export function pickImages({ camera = true, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (camera) input.capture = 'environment';
    if (multiple) input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(Array.from(input.files || []));
      input.remove();
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file); } catch { /* repli ci-dessous */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function drawScaled(bitmap, maxEdge) {
  const w = bitmap.width, h = bitmap.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas, quality = QUALITY) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Traite un fichier image : compression + vignette, puis enregistrement
 * avec la position GPS et le cap du moment.
 */
export async function capture(file, { featureId = null, note = '' } = {}) {
  const bitmap = await loadBitmap(file);
  const full = await toBlob(drawScaled(bitmap, MAX_EDGE));
  const thumb = await toBlob(drawScaled(bitmap, THUMB_EDGE), 0.7);
  if (bitmap.close) bitmap.close();

  let position = gps.current();
  if (!position) {
    try { position = await gps.once({ timeout: 8000 }); } catch { position = null; }
  }

  return addPhoto({
    featureId,
    blob: full,
    thumb,
    position,
    heading: state.heading ?? position?.heading ?? null,
    note,
  });
}

/** Capture en série : renvoie les photos enregistrées. */
export async function captureMany(files, opts) {
  const out = [];
  for (const file of files) out.push(await capture(file, opts));
  return out;
}

const urlCache = new Map();

/** URL objet mémorisée pour un blob (évite de recréer une URL à chaque rendu). */
export function blobUrl(id, blob) {
  if (!blob) return '';
  if (urlCache.has(id)) return urlCache.get(id);
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function releaseUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

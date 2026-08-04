/* GeoField — acquisition GPS et boussole. */

import { state, emit, on, setPreference } from './store.js';
import { distance } from './geo.js';

let watchId = null;
let orientationBound = false;
let lastFix = null;

/** Historique court des positions pour le moyennage de point. */
const buffer = [];
const BUFFER_MAX = 60;

export function isTracking() { return watchId !== null; }

export function start() {
  if (watchId !== null) return;
  if (!navigator.geolocation) {
    emit('gps:error', { message: 'Géolocalisation non disponible sur cet appareil.' });
    return;
  }
  watchId = navigator.geolocation.watchPosition(onFix, onError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 30000,
  });
  emit('gps:state', 'starting');
}

export function stop() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
  emit('gps:state', 'stopped');
}

function onFix(pos) {
  const c = pos.coords;
  const fix = {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy,
    altitude: c.altitude,
    altitudeAccuracy: c.altitudeAccuracy,
    heading: Number.isFinite(c.heading) ? c.heading : null,
    speed: Number.isFinite(c.speed) ? c.speed : null,
    ts: pos.timestamp,
  };
  lastFix = fix;
  state.position = fix;
  buffer.push(fix);
  if (buffer.length > BUFFER_MAX) buffer.shift();
  emit('gps:fix', fix);
}

function onError(err) {
  const messages = {
    1: 'Accès à la position refusé. Autorise la localisation dans les réglages du navigateur.',
    2: 'Position indisponible. Vérifie que le GPS est activé et sors à découvert.',
    3: 'Délai dépassé pour obtenir une position.',
  };
  emit('gps:error', { code: err.code, message: messages[err.code] || err.message });
}

export function current() { return lastFix; }

/** Position instantanée (promesse), sans démarrer le suivi continu. */
export function once(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Géolocalisation non disponible'));
    navigator.geolocation.getCurrentPosition(
      (pos) => { onFix(pos); resolve(lastFix); },
      (err) => { onError(err); reject(err); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000, ...options },
    );
  });
}

/**
 * Moyenne N positions successives pour améliorer la précision d'un point levé.
 * Renvoie {lat,lng,accuracy,altitude,samples,spread}.
 */
export function average(samples = 10, onProgress) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Géolocalisation non disponible'));
    const taken = [];
    const id = navigator.geolocation.watchPosition((pos) => {
      onFix(pos);
      taken.push(lastFix);
      onProgress?.(taken.length, samples, lastFix);
      if (taken.length >= samples) {
        navigator.geolocation.clearWatch(id);
        resolve(reduceSamples(taken));
      }
    }, (err) => {
      navigator.geolocation.clearWatch(id);
      onError(err);
      reject(err);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  });
}

function reduceSamples(list) {
  // Pondération par l'inverse du carré de la précision : les fixes fiables pèsent plus.
  let wSum = 0, lat = 0, lng = 0, alt = 0, altW = 0;
  for (const f of list) {
    const w = 1 / Math.max(1, f.accuracy) ** 2;
    wSum += w; lat += f.lat * w; lng += f.lng * w;
    if (Number.isFinite(f.altitude)) { alt += f.altitude * w; altW += w; }
  }
  const mean = { lat: lat / wSum, lng: lng / wSum };
  const spread = Math.max(...list.map((f) => distance(mean, f)));
  const accuracy = Math.min(...list.map((f) => f.accuracy));
  return {
    ...mean,
    accuracy,
    altitude: altW ? alt / altW : null,
    samples: list.length,
    spread,
  };
}

/* ---------------------------------------------------------------- boussole */

export async function enableCompass() {
  if (orientationBound) return true;
  const needsPermission = typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (needsPermission) {
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') return false;
    } catch { return false; }
  }
  const handler = (e) => {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
    else if (typeof e.alpha === 'number') heading = (360 - e.alpha) % 360;
    if (heading !== null) {
      state.heading = heading;
      emit('compass', heading);
    }
  };
  window.addEventListener('deviceorientationabsolute', handler, true);
  window.addEventListener('deviceorientation', handler, true);
  orientationBound = true;
  await setPreference('compass', true);
  return true;
}

/* ---------------------------------------------------------------- mode marche */

/**
 * Enregistre un tracé en marchant. Chaque position retenue est espacée
 * d'au moins `minDistance` mètres et sous le seuil de précision demandé.
 */
export function createWalkRecorder({ minDistance = 3, maxAccuracy = 25, onPoint }) {
  const pts = [];
  let paused = false;

  const off = onFixListener((fix) => {
    if (paused) return;
    if (fix.accuracy > maxAccuracy) return;
    const last = pts[pts.length - 1];
    if (last && distance(last, fix) < minDistance) return;
    const p = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, altitude: fix.altitude };
    pts.push(p);
    onPoint?.(p, pts);
  });

  return {
    points: pts,
    pause() { paused = true; },
    resume() { paused = false; },
    get paused() { return paused; },
    undo() { pts.pop(); onPoint?.(null, pts); },
    stop() { off(); return pts; },
  };
}

// Relais interne : un seul abonnement au store, redistribué aux enregistreurs actifs.
const fixListeners = new Set();
function onFixListener(fn) {
  fixListeners.add(fn);
  return () => fixListeners.delete(fn);
}
on('gps:fix', (fix) => fixListeners.forEach((fn) => fn(fix)));

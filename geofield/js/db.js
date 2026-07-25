/* GeoField — couche de persistance IndexedDB.
   Tout est stocké localement sur l'appareil : l'app fonctionne 100 % hors ligne. */

const DB_NAME = 'geofield';
const DB_VERSION = 1;

const STORES = {
  projects: { keyPath: 'id', indexes: [['updatedAt', 'updatedAt']] },
  features: { keyPath: 'id', indexes: [['projectId', 'projectId'], ['updatedAt', 'updatedAt']] },
  photos:   { keyPath: 'id', indexes: [['projectId', 'projectId'], ['featureId', 'featureId']] },
  tiles:    { keyPath: 'key' },
  settings: { keyPath: 'key' },
};

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [idxName, path] of def.indexes || []) store.createIndex(idxName, path);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export function put(store, value) { return tx(store, 'readwrite', (s) => s.put(value)); }
export function get(store, key)   { return tx(store, 'readonly',  (s) => s.get(key)); }
export function del(store, key)   { return tx(store, 'readwrite', (s) => s.delete(key)); }
export function all(store)        { return tx(store, 'readonly',  (s) => s.getAll()); }
export function count(store)      { return tx(store, 'readonly',  (s) => s.count()); }
export function clear(store)      { return tx(store, 'readwrite', (s) => s.clear()); }

export function byIndex(store, index, value) {
  return tx(store, 'readonly', (s) => s.index(index).getAll(value));
}

export function putMany(store, values) {
  return tx(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); return null; });
}

export function deleteByIndex(store, index, value) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const req = t.objectStore(store).index(index).openCursor(IDBKeyRange.only(value));
    let n = 0;
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { cur.delete(); n++; cur.continue(); }
    };
    t.oncomplete = () => resolve(n);
    t.onerror = () => reject(t.error);
  }));
}

/* ---------------------------------------------------------------- réglages */

export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row === undefined ? fallback : row.value;
}

export function setSetting(key, value) {
  return put('settings', { key, value });
}

/* ---------------------------------------------------------------- tuiles hors ligne */

export function tileKey(layerId, z, x, y) { return `${layerId}/${z}/${x}/${y}`; }

export async function getTile(layerId, z, x, y) {
  const row = await get('tiles', tileKey(layerId, z, x, y));
  return row ? row.blob : null;
}

export function putTile(layerId, z, x, y, blob) {
  return put('tiles', { key: tileKey(layerId, z, x, y), layerId, z, blob, savedAt: Date.now() });
}

export async function tileStats() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('tiles', 'readonly');
    const req = t.objectStore('tiles').openCursor();
    let n = 0, bytes = 0;
    const byLayer = {};
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        const v = cur.value;
        n++;
        bytes += v.blob?.size || 0;
        byLayer[v.layerId] = (byLayer[v.layerId] || 0) + 1;
        cur.continue();
      }
    };
    t.oncomplete = () => resolve({ count: n, bytes, byLayer });
    t.onerror = () => reject(t.error);
  });
}

export function clearTiles(layerId) {
  if (!layerId) return clear('tiles');
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction('tiles', 'readwrite');
    const req = t.objectStore('tiles').openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        if (cur.value.layerId === layerId) cur.delete();
        cur.continue();
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  }));
}

/* ---------------------------------------------------------------- quota */

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota, ratio: quota ? usage / quota : 0 };
}

/** Demande le stockage persistant pour éviter l'éviction du cache par le navigateur. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/* ---------------------------------------------------------------- identifiants */

export function uid(prefix = 'f') {
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  return prefix + '_' + Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
}

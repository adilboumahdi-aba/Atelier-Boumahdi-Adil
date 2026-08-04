/* GeoField — service worker : met en cache l'app (HTML/CSS/JS/Leaflet) pour un lancement
   hors ligne complet. Les tuiles cartographiques sont gérées séparément dans IndexedDB (db.js),
   pas ici, pour rester maîtres de leur cycle de vie et de leur volume. */

const CACHE = 'geofield-shell-v1';

const SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/db.js',
  './js/geo.js',
  './js/gps.js',
  './js/map.js',
  './js/store.js',
  './js/templates.js',
  './js/forms.js',
  './js/photos.js',
  './js/offline.js',
  './js/exporter.js',
  './js/staticmap.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Les fonds de carte distants (tuiles) ne passent pas par ce cache : gérés par IndexedDB.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});

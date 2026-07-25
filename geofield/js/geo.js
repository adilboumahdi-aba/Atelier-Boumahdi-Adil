/* GeoField — géodésie, projections et formatage de coordonnées.
   Aucune dépendance externe : tout est calculé ici pour rester utilisable hors ligne. */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const R_EARTH = 6378137;

/* ---------------------------------------------------------------- ellipsoïdes */

const ELLIPSOIDS = {
  GRS80:       { a: 6378137,     f: 1 / 298.257222101 },
  WGS84:       { a: 6378137,     f: 1 / 298.257223563 },
  CLARKE1880:  { a: 6378249.2,   b: 6356515 },
};

function ellipsoid(def) {
  const a = def.a;
  const f = def.f !== undefined ? def.f : (a - def.b) / a;
  const e2 = f * (2 - f);
  return { a, f, e2, e: Math.sqrt(e2) };
}

/* ---------------------------------------------------------------- géodésie de base */

/** Distance orthodromique en mètres entre deux {lat,lng}. */
export function distance(p1, p2) {
  const lat1 = p1.lat * D2R, lat2 = p2.lat * D2R;
  const dLat = (p2.lat - p1.lat) * D2R;
  const dLng = (p2.lng - p1.lng) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Longueur cumulée d'une polyligne [{lat,lng}, ...] en mètres. */
export function pathLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1], pts[i]);
  return total;
}

/** Aire géodésique d'un polygone [{lat,lng}, ...] en m². */
export function polygonArea(pts) {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    area += (p2.lng - p1.lng) * D2R *
            (2 + Math.sin(p1.lat * D2R) + Math.sin(p2.lat * D2R));
  }
  return Math.abs(area * R_EARTH * R_EARTH / 2);
}

/** Azimut (0-360°, nord géographique) de p1 vers p2. */
export function bearing(p1, p2) {
  const lat1 = p1.lat * D2R, lat2 = p2.lat * D2R;
  const dLng = (p2.lng - p1.lng) * D2R;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Point situé à `dist` mètres et `brng` degrés de `p`. */
export function destination(p, dist, brng) {
  const d = dist / R_EARTH;
  const b = brng * D2R;
  const lat1 = p.lat * D2R, lng1 = p.lng * D2R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1),
                                 Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * R2D, lng: ((lng2 * R2D + 540) % 360) - 180 };
}

/** Écarts Est/Nord en mètres entre une position et une cible (pour l'implantation). */
export function deltaEN(from, to) {
  const dist = distance(from, to);
  const brg = bearing(from, to) * D2R;
  return { east: dist * Math.sin(brg), north: dist * Math.cos(brg), dist, bearing: brg * R2D };
}

/* ---------------------------------------------------------------- Helmert 3 paramètres */

function geodeticToCartesian(lat, lng, h, ell) {
  const φ = lat * D2R, λ = lng * D2R;
  const N = ell.a / Math.sqrt(1 - ell.e2 * Math.sin(φ) ** 2);
  return {
    x: (N + h) * Math.cos(φ) * Math.cos(λ),
    y: (N + h) * Math.cos(φ) * Math.sin(λ),
    z: (N * (1 - ell.e2) + h) * Math.sin(φ),
  };
}

function cartesianToGeodetic(x, y, z, ell) {
  const λ = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let φ = Math.atan2(z, p * (1 - ell.e2));
  for (let i = 0; i < 6; i++) {
    const N = ell.a / Math.sqrt(1 - ell.e2 * Math.sin(φ) ** 2);
    φ = Math.atan2(z + ell.e2 * N * Math.sin(φ), p);
  }
  const N = ell.a / Math.sqrt(1 - ell.e2 * Math.sin(φ) ** 2);
  return { lat: φ * R2D, lng: λ * R2D, h: p / Math.cos(φ) - N };
}

/** Applique une translation géocentrique (dx,dy,dz en mètres) entre deux ellipsoïdes. */
function datumShift(lat, lng, from, to, d) {
  const c = geodeticToCartesian(lat, lng, 0, from);
  return cartesianToGeodetic(c.x + d[0], c.y + d[1], c.z + d[2], to);
}

/* ---------------------------------------------------------------- Lambert conique conforme */

function lccParams(cfg) {
  const ell = ellipsoid(cfg.ellipsoid);
  const { a, e } = ell;
  const φ0 = cfg.lat0 * D2R, φ1 = cfg.lat1 * D2R, φ2 = (cfg.lat2 ?? cfg.lat1) * D2R;
  const m = (φ) => Math.cos(φ) / Math.sqrt(1 - ell.e2 * Math.sin(φ) ** 2);
  const t = (φ) => Math.tan(Math.PI / 4 - φ / 2) /
                   Math.pow((1 - e * Math.sin(φ)) / (1 + e * Math.sin(φ)), e / 2);

  const n = Math.abs(φ1 - φ2) < 1e-10
    ? Math.sin(φ1)                                        // 1SP
    : Math.log(m(φ1) / m(φ2)) / Math.log(t(φ1) / t(φ2));  // 2SP

  const k0 = cfg.k0 ?? 1;
  const F = m(φ1) / (n * Math.pow(t(φ1), n));
  const ρ0 = a * k0 * F * Math.pow(t(φ0), n);
  return { ell, n, F, ρ0, k0, t, λ0: cfg.lon0 * D2R, x0: cfg.x0, y0: cfg.y0 };
}

function lccForward(lat, lng, cfg) {
  const P = lccParams(cfg);
  const ρ = P.ell.a * P.k0 * P.F * Math.pow(P.t(lat * D2R), P.n);
  const θ = P.n * (((lng * D2R - P.λ0 + Math.PI) % (2 * Math.PI)) - Math.PI);
  return { x: P.x0 + ρ * Math.sin(θ), y: P.y0 + P.ρ0 - ρ * Math.cos(θ) };
}

function lccInverse(x, y, cfg) {
  const P = lccParams(cfg);
  const dx = x - P.x0;
  const dy = P.ρ0 - (y - P.y0);
  const sign = P.n >= 0 ? 1 : -1;
  const ρ = sign * Math.hypot(dx, dy);
  const t = Math.pow(ρ / (P.ell.a * P.k0 * P.F), 1 / P.n);
  const θ = Math.atan2(sign * dx, sign * dy);
  const e = P.ell.e;
  let φ = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 10; i++) {
    φ = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - e * Math.sin(φ)) / (1 + e * Math.sin(φ)), e / 2));
  }
  return { lat: φ * R2D, lng: (θ / P.n + P.λ0) * R2D };
}

/* ---------------------------------------------------------------- UTM (WGS84) */

function utmForward(lat, lng, forceZone) {
  const ell = ellipsoid(ELLIPSOIDS.WGS84);
  const zone = forceZone || Math.floor((lng + 180) / 6) + 1;
  const λ0 = ((zone - 1) * 6 - 180 + 3) * D2R;
  const k0 = 0.9996;
  const φ = lat * D2R, λ = lng * D2R;
  const e2 = ell.e2, ep2 = e2 / (1 - e2);
  const N = ell.a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
  const T = Math.tan(φ) ** 2;
  const C = ep2 * Math.cos(φ) ** 2;
  const A = Math.cos(φ) * (λ - λ0);
  const M = ell.a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * φ
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * φ)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * φ)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * φ));

  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6
      + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let y = k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
      + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) y += 10000000;

  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  const band = lat >= -80 && lat < 84 ? bands[Math.floor((lat + 80) / 8)] : '?';
  return { x, y, zone, band, hemi: lat >= 0 ? 'N' : 'S' };
}

/* ---------------------------------------------------------------- systèmes disponibles */

const L93 = {
  ellipsoid: ELLIPSOIDS.GRS80,
  lat0: 46.5, lat1: 44, lat2: 49, lon0: 3, x0: 700000, y0: 6600000,
};

const MAROC_NORD = {
  ellipsoid: ELLIPSOIDS.CLARKE1880,
  lat0: 33.3, lat1: 33.3, lon0: -5.4, k0: 0.999625769, x0: 500000, y0: 300000,
};

const MAROC_SUD = {
  ellipsoid: ELLIPSOIDS.CLARKE1880,
  lat0: 29.7, lat1: 29.7, lon0: -5.4, k0: 0.999615596, x0: 500000, y0: 300000,
};

// Merchich → WGS84 (EPSG towgs84). On applique l'inverse pour aller de WGS84 vers Merchich.
const MERCHICH_TO_WGS84 = [31, 146, 47];

const CRS = {
  wgs84: {
    id: 'wgs84', label: 'WGS84 (degrés décimaux)', short: 'WGS84', unit: '°',
    forward: (lat, lng) => ({ x: lng, y: lat }),
    format: (lat, lng) => `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`,
    inverse: (x, y) => ({ lat: y, lng: x }),
  },
  dms: {
    id: 'dms', label: 'WGS84 (degrés minutes secondes)', short: 'DMS', unit: '',
    forward: (lat, lng) => ({ x: lng, y: lat }),
    format: (lat, lng) => `${toDMS(lat, 'lat')}  ${toDMS(lng, 'lng')}`,
    inverse: (x, y) => ({ lat: y, lng: x }),
  },
  l93: {
    id: 'l93', label: 'Lambert 93 — France (EPSG:2154)', short: 'L93', unit: 'm',
    forward: (lat, lng) => lccForward(lat, lng, L93),
    inverse: (x, y) => lccInverse(x, y, L93),
    format: (lat, lng) => {
      const p = lccForward(lat, lng, L93);
      return `E ${p.x.toFixed(2)} m   N ${p.y.toFixed(2)} m`;
    },
  },
  maroc_nord: {
    id: 'maroc_nord', label: 'Lambert Maroc Nord (EPSG:26191)', short: 'Maroc N', unit: 'm',
    forward: (lat, lng) => {
      const g = datumShift(lat, lng, ellipsoid(ELLIPSOIDS.WGS84), ellipsoid(ELLIPSOIDS.CLARKE1880),
                           MERCHICH_TO_WGS84.map((v) => -v));
      return lccForward(g.lat, g.lng, MAROC_NORD);
    },
    inverse: (x, y) => {
      const g = lccInverse(x, y, MAROC_NORD);
      return datumShift(g.lat, g.lng, ellipsoid(ELLIPSOIDS.CLARKE1880), ellipsoid(ELLIPSOIDS.WGS84),
                        MERCHICH_TO_WGS84);
    },
    format: (lat, lng) => {
      const p = CRS.maroc_nord.forward(lat, lng);
      return `X ${p.x.toFixed(2)} m   Y ${p.y.toFixed(2)} m`;
    },
  },
  maroc_sud: {
    id: 'maroc_sud', label: 'Lambert Maroc Sud (EPSG:26192)', short: 'Maroc S', unit: 'm',
    forward: (lat, lng) => {
      const g = datumShift(lat, lng, ellipsoid(ELLIPSOIDS.WGS84), ellipsoid(ELLIPSOIDS.CLARKE1880),
                           MERCHICH_TO_WGS84.map((v) => -v));
      return lccForward(g.lat, g.lng, MAROC_SUD);
    },
    inverse: (x, y) => {
      const g = lccInverse(x, y, MAROC_SUD);
      return datumShift(g.lat, g.lng, ellipsoid(ELLIPSOIDS.CLARKE1880), ellipsoid(ELLIPSOIDS.WGS84),
                        MERCHICH_TO_WGS84);
    },
    format: (lat, lng) => {
      const p = CRS.maroc_sud.forward(lat, lng);
      return `X ${p.x.toFixed(2)} m   Y ${p.y.toFixed(2)} m`;
    },
  },
  utm: {
    id: 'utm', label: 'UTM / WGS84 (zone automatique)', short: 'UTM', unit: 'm',
    forward: (lat, lng) => utmForward(lat, lng),
    format: (lat, lng) => {
      const p = utmForward(lat, lng);
      return `${p.zone}${p.band}  E ${p.x.toFixed(1)}  N ${p.y.toFixed(1)}`;
    },
  },
};

export const CRS_LIST = Object.values(CRS).map((c) => ({ id: c.id, label: c.label, short: c.short }));

/** Formate une position dans le système demandé. */
export function formatCoords(lat, lng, crsId = 'wgs84') {
  return (CRS[crsId] || CRS.wgs84).format(lat, lng);
}

/** Convertit WGS84 vers les coordonnées projetées du système demandé. */
export function project(lat, lng, crsId) {
  const c = CRS[crsId] || CRS.wgs84;
  return c.forward(lat, lng);
}

/** Convertit des coordonnées projetées vers WGS84. Renvoie null si non supporté. */
export function unproject(x, y, crsId) {
  const c = CRS[crsId] || CRS.wgs84;
  return c.inverse ? c.inverse(x, y) : null;
}

export function crsSupportsInput(crsId) {
  return Boolean((CRS[crsId] || CRS.wgs84).inverse);
}

/* ---------------------------------------------------------------- formatage */

export function toDMS(value, axis) {
  const hemi = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'O');
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(2).padStart(5, '0')}"${hemi}`;
}

export function formatDistance(m) {
  if (!isFinite(m)) return '—';
  if (m < 1) return `${(m * 100).toFixed(0)} cm`;
  if (m < 1000) return `${m.toFixed(m < 100 ? 2 : 1)} m`;
  return `${(m / 1000).toFixed(3)} km`;
}

export function formatArea(m2) {
  if (!isFinite(m2)) return '—';
  if (m2 < 10000) return `${m2.toFixed(m2 < 100 ? 2 : 1)} m²`;
  if (m2 < 1000000) return `${(m2 / 10000).toFixed(4)} ha  (${m2.toFixed(0)} m²)`;
  return `${(m2 / 1000000).toFixed(4)} km²`;
}

export function formatBearing(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return `${deg.toFixed(1)}° ${dirs[Math.round(deg / 22.5) % 16]}`;
}

/** Parse « 34.02 », « 34°01'12"N », « 34 1 12 N ». */
export function parseCoord(str) {
  const s = String(str).trim().replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const m = s.match(/^(-?\d+(?:\.\d+)?)[°\s]+(\d+(?:\.\d+)?)['\s]*(?:(\d+(?:\.\d+)?)["\s]*)?\s*([NSEWO])?$/i);
  if (!m) return NaN;
  const sign = /[SWO]/i.test(m[4] || '') || parseFloat(m[1]) < 0 ? -1 : 1;
  const val = Math.abs(parseFloat(m[1])) + parseFloat(m[2]) / 60 + (parseFloat(m[3]) || 0) / 3600;
  return sign * val;
}

/** Classe de qualité d'une précision GPS en mètres. */
export function accuracyClass(acc) {
  if (acc == null) return { key: 'unknown', label: 'Inconnue' };
  if (acc <= 3) return { key: 'good', label: 'Excellente' };
  if (acc <= 10) return { key: 'ok', label: 'Correcte' };
  if (acc <= 30) return { key: 'poor', label: 'Moyenne' };
  return { key: 'bad', label: 'Faible' };
}

/* ---------------------------------------------------------------- géométrie utilitaire */

export function boundsOf(latlngs) {
  if (!latlngs.length) return null;
  let n = -90, s = 90, e = -180, w = 180;
  for (const p of latlngs) {
    n = Math.max(n, p.lat); s = Math.min(s, p.lat);
    e = Math.max(e, p.lng); w = Math.min(w, p.lng);
  }
  return { north: n, south: s, east: e, west: w };
}

export function centroid(latlngs) {
  if (!latlngs.length) return null;
  const sum = latlngs.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / latlngs.length, lng: sum.lng / latlngs.length };
}

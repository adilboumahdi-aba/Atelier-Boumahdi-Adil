/* GeoField — carte, fonds de plan hors ligne, rendu des objets et outils de dessin. */

import * as db from './db.js';
import { state, on, emit } from './store.js';
import { getTemplate } from './templates.js';
import { pathLength, polygonArea, formatDistance, formatArea } from './geo.js';

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

export const BASEMAPS = {
  osm: {
    id: 'osm', label: 'Plan OSM', maxZoom: 19,
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
  },
  satellite: {
    id: 'satellite', label: 'Satellite', maxZoom: 19,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics',
  },
  topo: {
    id: 'topo', label: 'Topographique', maxZoom: 17,
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap, © OpenStreetMap',
  },
  clair: {
    id: 'clair', label: 'Fond clair', maxZoom: 19,
    url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '© CARTO, © OpenStreetMap',
  },
};

/* ---------------------------------------------------------------- couche hors ligne */

const OfflineTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
    L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));

    const layerId = this.options.layerId;
    db.getTile(layerId, coords.z, coords.x, coords.y).then((blob) => {
      if (blob) {
        tile._objectUrl = URL.createObjectURL(blob);
        tile.dataset.source = 'cache';
        tile.src = tile._objectUrl;
      } else if (navigator.onLine) {
        tile.dataset.source = 'network';
        tile.src = this.getTileUrl(coords);
      } else {
        tile.dataset.source = 'missing';
        tile.classList.add('tile-missing');
        tile.src = BLANK;
      }
    }).catch(() => { tile.src = navigator.onLine ? this.getTileUrl(coords) : BLANK; });

    return tile;
  },

  _removeTile(key) {
    const tile = this._tiles[key];
    if (tile?.el?._objectUrl) URL.revokeObjectURL(tile.el._objectUrl);
    L.TileLayer.prototype._removeTile.call(this, key);
  },
});

/* ---------------------------------------------------------------- carte */

export let map = null;
let baseLayer = null;
const layers = {
  features: null,
  draft: null,
  measure: null,
  gps: null,
  stakeout: null,
};
let gpsMarker = null;
let gpsCircle = null;
const featureLayers = new Map();   // featureId -> layer

export function initMap(elementId) {
  map = L.map(elementId, {
    zoomControl: false,
    attributionControl: true,
    tap: true,
    maxZoom: 22,
  }).setView([34.0209, -6.8416], 13);

  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  layers.features = L.layerGroup().addTo(map);
  layers.draft = L.layerGroup().addTo(map);
  layers.measure = L.layerGroup().addTo(map);
  layers.stakeout = L.layerGroup().addTo(map);
  layers.gps = L.layerGroup().addTo(map);

  setBasemap(state.basemap || 'osm');

  on('features:changed', renderFeatures);
  on('gps:fix', renderPosition);

  map.on('click', (e) => emit('map:click', e.latlng));
  map.on('moveend', () => emit('map:moved', map.getBounds()));

  return map;
}

export function setBasemap(id) {
  const def = BASEMAPS[id] || BASEMAPS.osm;
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = new OfflineTileLayer(def.url, {
    layerId: def.id,
    maxZoom: 22,
    maxNativeZoom: def.maxZoom,
    attribution: def.attribution,
    crossOrigin: 'anonymous',
  });
  baseLayer.addTo(map);
  baseLayer.bringToBack();
  return def;
}

export function currentBasemap() {
  return BASEMAPS[state.basemap] || BASEMAPS.osm;
}

/* ---------------------------------------------------------------- rendu des objets */

function pointIcon(tpl, selected) {
  return L.divIcon({
    className: 'gf-pin' + (selected ? ' is-selected' : ''),
    html: `<span class="gf-pin__dot" style="--pin:${tpl.color}">${tpl.icon}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function renderFeatures() {
  layers.features.clearLayers();
  featureLayers.clear();
  for (const f of state.features) addFeatureLayer(f);
}

function addFeatureLayer(f) {
  const tpl = getTemplate(f.template);
  let layer;

  if (f.type === 'point') {
    layer = L.marker(f.coords[0], { icon: pointIcon(tpl), riseOnHover: true });
  } else if (f.type === 'line') {
    layer = L.polyline(f.coords, { color: tpl.color, weight: 4, opacity: 0.9 });
  } else {
    layer = L.polygon(f.coords, { color: tpl.color, weight: 3, fillColor: tpl.color, fillOpacity: 0.22 });
  }

  layer.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    emit('feature:selected', f.id);
  });
  layer.addTo(layers.features);
  featureLayers.set(f.id, layer);
}

export function highlightFeature(id) {
  for (const [fid, layer] of featureLayers) {
    const f = state.features.find((x) => x.id === fid);
    if (!f) continue;
    const tpl = getTemplate(f.template);
    const selected = fid === id;
    if (f.type === 'point') layer.setIcon(pointIcon(tpl, selected));
    else layer.setStyle({ weight: selected ? 6 : (f.type === 'line' ? 4 : 3), dashArray: selected ? '8 6' : null });
  }
}

export function zoomTo(feature, maxZoom = 19) {
  if (!feature?.coords?.length) return;
  if (feature.type === 'point') map.setView(feature.coords[0], Math.max(map.getZoom(), 18));
  else map.fitBounds(L.latLngBounds(feature.coords), { padding: [40, 40], maxZoom });
}

export function fitAll() {
  const pts = state.features.flatMap((f) => f.coords);
  if (!pts.length) return false;
  map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 19 });
  return true;
}

/* ---------------------------------------------------------------- position GPS */

let followMode = true;
export function setFollow(v) { followMode = v; emit('map:follow', v); }
export function isFollowing() { return followMode; }

function renderPosition(fix) {
  const latlng = [fix.lat, fix.lng];
  if (!gpsMarker) {
    gpsMarker = L.marker(latlng, {
      icon: L.divIcon({ className: 'gf-gps', html: '<span class="gf-gps__dot"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(layers.gps);
    gpsCircle = L.circle(latlng, { radius: fix.accuracy, color: '#1f3a5f', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(layers.gps);
  } else {
    gpsMarker.setLatLng(latlng);
    gpsCircle.setLatLng(latlng).setRadius(fix.accuracy);
  }
  if (followMode) map.setView(latlng, Math.max(map.getZoom(), 17), { animate: true, duration: 0.4 });
}

/* ---------------------------------------------------------------- outil de dessin */

/**
 * Dessin manuel : l'utilisateur tape la carte pour poser des sommets.
 * Renvoie un contrôleur avec addVertex / undo / finish / cancel.
 */
export function createDrawer({ type, onChange }) {
  const pts = [];
  let preview = null;
  const vertexMarkers = [];

  function refresh() {
    if (preview) layers.draft.removeLayer(preview);
    preview = null;
    if (type === 'line' && pts.length >= 2) {
      preview = L.polyline(pts, { color: '#c0392b', weight: 4, dashArray: '6 6' });
    } else if (type === 'polygon' && pts.length >= 3) {
      preview = L.polygon(pts, { color: '#c0392b', weight: 3, dashArray: '6 6', fillOpacity: 0.15 });
    } else if (type === 'polygon' && pts.length === 2) {
      preview = L.polyline(pts, { color: '#c0392b', weight: 3, dashArray: '6 6' });
    }
    if (preview) preview.addTo(layers.draft);
    onChange?.(pts, metrics());
  }

  function metrics() {
    if (type === 'line') return { length: pathLength(pts), vertices: pts.length };
    if (type === 'polygon') return {
      area: pts.length >= 3 ? polygonArea(pts) : 0,
      perimeter: pts.length >= 2 ? pathLength([...pts, pts[0]]) : 0,
      vertices: pts.length,
    };
    return { vertices: pts.length };
  }

  function addVertex(latlng, meta = {}) {
    const p = { lat: latlng.lat, lng: latlng.lng, ...meta };
    pts.push(p);
    const m = L.circleMarker(p, {
      radius: 6, color: '#fff', weight: 2, fillColor: '#c0392b', fillOpacity: 1,
    }).addTo(layers.draft);
    vertexMarkers.push(m);
    refresh();
    return p;
  }

  const clickHandler = (latlng) => { if (type !== 'point') addVertex(latlng); };
  const off = on('map:click', clickHandler);

  function clean() {
    off();
    layers.draft.clearLayers();
  }

  return {
    type,
    points: pts,
    addVertex,
    metrics,
    undo() {
      pts.pop();
      const m = vertexMarkers.pop();
      if (m) layers.draft.removeLayer(m);
      refresh();
    },
    setPoints(list) {
      pts.length = 0;
      vertexMarkers.forEach((m) => layers.draft.removeLayer(m));
      vertexMarkers.length = 0;
      list.forEach((p) => addVertex(p));
    },
    finish() { const out = pts.slice(); clean(); return out; },
    cancel() { clean(); },
  };
}

/* ---------------------------------------------------------------- mesure rapide */

let measureTool = null;

export function startMeasure(mode, onUpdate) {
  stopMeasure();
  const pts = [];
  let line = null, poly = null;
  const labels = [];

  const off = on('map:click', (latlng) => {
    pts.push({ lat: latlng.lat, lng: latlng.lng });
    draw();
  });

  function draw() {
    layers.measure.clearLayers();
    labels.length = 0;
    pts.forEach((p, i) => {
      L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: '#0e7490', fillOpacity: 1 })
        .addTo(layers.measure);
      if (i > 0) {
        const seg = pathLength([pts[i - 1], p]);
        const mid = { lat: (pts[i - 1].lat + p.lat) / 2, lng: (pts[i - 1].lng + p.lng) / 2 };
        L.marker(mid, {
          icon: L.divIcon({ className: 'gf-measure-label', html: formatDistance(seg), iconSize: null }),
          interactive: false,
        }).addTo(layers.measure);
      }
    });
    if (mode === 'area' && pts.length >= 3) {
      poly = L.polygon(pts, { color: '#0e7490', weight: 3, fillOpacity: 0.2, dashArray: '6 4' }).addTo(layers.measure);
    } else if (pts.length >= 2) {
      line = L.polyline(pts, { color: '#0e7490', weight: 3, dashArray: '6 4' }).addTo(layers.measure);
    }
    onUpdate?.(result());
  }

  function result() {
    return {
      mode,
      points: pts.length,
      length: pathLength(pts),
      closedLength: pts.length >= 3 ? pathLength([...pts, pts[0]]) : 0,
      area: mode === 'area' && pts.length >= 3 ? polygonArea(pts) : 0,
      pts: pts.slice(),
    };
  }

  measureTool = {
    mode,
    result,
    addPoint(latlng) { pts.push({ lat: latlng.lat, lng: latlng.lng }); draw(); },
    undo() { pts.pop(); draw(); },
    stop() { off(); layers.measure.clearLayers(); measureTool = null; },
  };
  onUpdate?.(result());
  return measureTool;
}

export function stopMeasure() {
  if (measureTool) measureTool.stop();
}

export function activeMeasure() { return measureTool; }

/* ---------------------------------------------------------------- implantation */

let stakeoutLine = null;

export function drawStakeout(from, to) {
  layers.stakeout.clearLayers();
  if (!from || !to) return;
  stakeoutLine = L.polyline([from, to], { color: '#6d28d9', weight: 3, dashArray: '10 6' }).addTo(layers.stakeout);
  L.circleMarker(to, { radius: 9, color: '#6d28d9', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(layers.stakeout);
}

export function clearStakeout() {
  layers.stakeout.clearLayers();
  stakeoutLine = null;
}

/* ---------------------------------------------------------------- divers */

export function tempMarker(latlng, opts = {}) {
  return L.circleMarker(latlng, {
    radius: 8, color: '#fff', weight: 2, fillColor: opts.color || '#c0392b', fillOpacity: 1,
  }).addTo(layers.draft);
}

export function clearDraft() { layers.draft.clearLayers(); }

export { formatDistance, formatArea };

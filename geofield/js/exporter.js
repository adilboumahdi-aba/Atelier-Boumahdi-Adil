/* GeoField — exports (GeoJSON, CSV, GPX, KML, sauvegarde) et rapport imprimable. */

import * as db from './db.js';
import { state, listProjectPhotos } from './store.js';
import { getTemplate, formatValue } from './templates.js';
import { formatCoords, formatDistance, formatArea, project, CRS_LIST } from './geo.js';
import { blobToDataUrl, dataUrlToBlob } from './photos.js';
import { renderStaticMap } from './staticmap.js';

/* ---------------------------------------------------------------- téléchargement */

export function download(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function slug(str) {
  return (str || 'projet').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function baseName(project = state.project) {
  return `geofield-${slug(project?.name)}-${stamp()}`;
}

/* ---------------------------------------------------------------- GeoJSON */

export function toGeoJSON(features = state.features, project = state.project) {
  return {
    type: 'FeatureCollection',
    name: project?.name || 'GeoField',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    metadata: {
      generator: 'GeoField v1',
      project: project?.name,
      client: project?.client,
      reference: project?.reference,
      exportedAt: new Date().toISOString(),
    },
    features: features.map((f) => ({
      type: 'Feature',
      id: f.id,
      geometry: geometryOf(f),
      properties: {
        nom: f.name || '',
        modele: getTemplate(f.template).label,
        modele_id: f.template,
        ...f.props,
        ...Object.fromEntries((f.custom || []).map((c) => [c.key, c.value])),
        precision_m: f.accuracy,
        altitude_m: f.altitude,
        longueur_m: f.metrics?.length ? +f.metrics.length.toFixed(3) : undefined,
        perimetre_m: f.metrics?.perimeter ? +f.metrics.perimeter.toFixed(3) : undefined,
        surface_m2: f.metrics?.area ? +f.metrics.area.toFixed(2) : undefined,
        source: f.source,
        auteur: f.author || '',
        photos: (f.photos || []).length,
        cree_le: new Date(f.createdAt).toISOString(),
        modifie_le: new Date(f.updatedAt).toISOString(),
      },
    })),
  };
}

function geometryOf(f) {
  const ring = f.coords.map((p) => [+p.lng.toFixed(8), +p.lat.toFixed(8)]);
  if (f.type === 'point') return { type: 'Point', coordinates: ring[0] };
  if (f.type === 'line') return { type: 'LineString', coordinates: ring };
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
}

export function exportGeoJSON() {
  download(`${baseName()}.geojson`, JSON.stringify(toGeoJSON(), null, 2), 'application/geo+json');
}

/* ---------------------------------------------------------------- CSV */

export function toCSV(features = state.features, crsId = state.crs) {
  const propKeys = [...new Set(features.flatMap((f) => Object.keys(f.props || {})))];
  const customKeys = [...new Set(features.flatMap((f) => (f.custom || []).map((c) => c.key)))];
  const projected = crsId !== 'wgs84' && crsId !== 'dms';
  const crsLabel = CRS_LIST.find((c) => c.id === crsId)?.short || 'proj';

  const header = [
    'id', 'nom', 'modele', 'type', 'latitude', 'longitude',
    ...(projected ? [`${crsLabel}_X`, `${crsLabel}_Y`] : []),
    'altitude_m', 'precision_m', 'longueur_m', 'perimetre_m', 'surface_m2',
    'sommets', 'source', 'auteur', 'photos', 'cree_le', 'modifie_le',
    ...propKeys, ...customKeys,
  ];

  const rows = features.map((f) => {
    const c = f.type === 'point' ? f.coords[0] : centroidOf(f.coords);
    const p = projected ? project(c.lat, c.lng, crsId) : null;
    const custom = Object.fromEntries((f.custom || []).map((x) => [x.key, x.value]));
    return [
      f.id, f.name, getTemplate(f.template).label, f.type,
      c.lat.toFixed(8), c.lng.toFixed(8),
      ...(projected ? [p.x.toFixed(3), p.y.toFixed(3)] : []),
      f.altitude != null ? f.altitude.toFixed(2) : '',
      f.accuracy != null ? f.accuracy.toFixed(1) : '',
      f.metrics?.length?.toFixed(3) ?? '',
      f.metrics?.perimeter?.toFixed(3) ?? '',
      f.metrics?.area?.toFixed(2) ?? '',
      f.coords.length, f.source, f.author, (f.photos || []).length,
      new Date(f.createdAt).toISOString(), new Date(f.updatedAt).toISOString(),
      ...propKeys.map((k) => f.props?.[k] ?? ''),
      ...customKeys.map((k) => custom[k] ?? ''),
    ];
  });

  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Séparateur point-virgule : ouverture directe dans Excel en locale FR.
  return '\uFEFF' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

function centroidOf(pts) {
  const s = pts.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: s.lat / pts.length, lng: s.lng / pts.length };
}

export function exportCSV() {
  download(`${baseName()}.csv`, toCSV(), 'text/csv');
}

/* ---------------------------------------------------------------- GPX */

export function toGPX(features = state.features, project = state.project) {
  const esc = (s) => String(s || '').replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

  const wpts = features.filter((f) => f.type === 'point').map((f) => `
  <wpt lat="${f.coords[0].lat.toFixed(8)}" lon="${f.coords[0].lng.toFixed(8)}">
    ${f.altitude != null ? `<ele>${f.altitude.toFixed(2)}</ele>` : ''}
    <time>${new Date(f.createdAt).toISOString()}</time>
    <name>${esc(f.name || getTemplate(f.template).label)}</name>
    <desc>${esc(describe(f))}</desc>
    <sym>Flag</sym>
  </wpt>`).join('');

  const trks = features.filter((f) => f.type !== 'point').map((f) => {
    const pts = f.type === 'polygon' ? [...f.coords, f.coords[0]] : f.coords;
    return `
  <trk>
    <name>${esc(f.name || getTemplate(f.template).label)}</name>
    <desc>${esc(describe(f))}</desc>
    <trkseg>${pts.map((p) => `<trkpt lat="${p.lat.toFixed(8)}" lon="${p.lng.toFixed(8)}"></trkpt>`).join('')}</trkseg>
  </trk>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoField v1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(project?.name)}</name><time>${new Date().toISOString()}</time></metadata>${wpts}${trks}
</gpx>`;
}

export function exportGPX() {
  download(`${baseName()}.gpx`, toGPX(), 'application/gpx+xml');
}

/* ---------------------------------------------------------------- KML */

export function toKML(features = state.features, project = state.project) {
  const esc = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const kmlColor = (hex) => 'ff' + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);

  const styles = [...new Set(features.map((f) => f.template))].map((id) => {
    const t = getTemplate(id);
    return `<Style id="${id}">
      <IconStyle><color>${kmlColor(t.color)}</color><scale>1.1</scale></IconStyle>
      <LineStyle><color>${kmlColor(t.color)}</color><width>3</width></LineStyle>
      <PolyStyle><color>66${kmlColor(t.color).slice(2)}</color></PolyStyle>
    </Style>`;
  }).join('');

  const placemarks = features.map((f) => {
    const coords = f.coords.map((p) => `${p.lng.toFixed(8)},${p.lat.toFixed(8)},${f.altitude || 0}`);
    let geom;
    if (f.type === 'point') geom = `<Point><coordinates>${coords[0]}</coordinates></Point>`;
    else if (f.type === 'line') geom = `<LineString><coordinates>${coords.join(' ')}</coordinates></LineString>`;
    else geom = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${[...coords, coords[0]].join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    const data = Object.entries(f.props || {}).map(([k, v]) =>
      `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join('');
    return `<Placemark>
      <name>${esc(f.name || getTemplate(f.template).label)}</name>
      <description>${esc(describe(f))}</description>
      <styleUrl>#${f.template}</styleUrl>
      <ExtendedData>${data}</ExtendedData>
      ${geom}
    </Placemark>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<name>${esc(project?.name)}</name>${styles}${placemarks}
</Document></kml>`;
}

export function exportKML() {
  download(`${baseName()}.kml`, toKML(), 'application/vnd.google-earth.kml+xml');
}

function describe(f) {
  const tpl = getTemplate(f.template);
  const parts = tpl.fields
    .map((field) => [field.label, formatValue(field, f.props?.[field.id])])
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} : ${v}`);
  if (f.metrics?.length) parts.push(`Longueur : ${formatDistance(f.metrics.length)}`);
  if (f.metrics?.area) parts.push(`Surface : ${formatArea(f.metrics.area)}`);
  return parts.join(' | ');
}

/* ---------------------------------------------------------------- sauvegarde / restauration */

export async function exportBackup({ includePhotos = true, onProgress } = {}) {
  const projects = state.project ? [state.project] : await db.all('projects');
  const ids = new Set(projects.map((p) => p.id));
  const features = (await db.all('features')).filter((f) => ids.has(f.projectId));
  let photos = [];

  if (includePhotos) {
    const raw = (await db.all('photos')).filter((p) => ids.has(p.projectId));
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      photos.push({
        ...p,
        blob: await blobToDataUrl(p.blob),
        thumb: p.thumb ? await blobToDataUrl(p.thumb) : null,
      });
      onProgress?.(i + 1, raw.length);
    }
  }

  const payload = {
    format: 'geofield-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects, features, photos,
  };
  download(`${baseName()}-sauvegarde.json`, JSON.stringify(payload), 'application/json');
  return { projects: projects.length, features: features.length, photos: photos.length };
}

export async function importBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.format !== 'geofield-backup') throw new Error('Fichier de sauvegarde non reconnu.');

  const idMap = new Map();
  for (const p of data.projects || []) {
    const newId = db.uid('prj');
    idMap.set(p.id, newId);
    await db.put('projects', { ...p, id: newId, name: `${p.name} (importé)`, updatedAt: Date.now() });
  }
  const featureMap = new Map();
  for (const f of data.features || []) {
    const newId = db.uid('ft');
    featureMap.set(f.id, newId);
    await db.put('features', { ...f, id: newId, projectId: idMap.get(f.projectId) || f.projectId, photos: [] });
  }
  for (const ph of data.photos || []) {
    const newId = db.uid('ph');
    const featureId = featureMap.get(ph.featureId) || null;
    await db.put('photos', {
      ...ph,
      id: newId,
      projectId: idMap.get(ph.projectId) || ph.projectId,
      featureId,
      blob: typeof ph.blob === 'string' ? dataUrlToBlob(ph.blob) : ph.blob,
      thumb: typeof ph.thumb === 'string' ? dataUrlToBlob(ph.thumb) : ph.thumb,
    });
    if (featureId) {
      const f = await db.get('features', featureId);
      if (f) await db.put('features', { ...f, photos: [...(f.photos || []), newId] });
    }
  }
  return {
    projects: (data.projects || []).length,
    features: (data.features || []).length,
    photos: (data.photos || []).length,
    firstProjectId: idMap.values().next().value,
  };
}

/** Import d'un GeoJSON externe dans le projet courant. */
export async function importGeoJSON(file, { addFeature }) {
  const data = JSON.parse(await file.text());
  const list = data.type === 'FeatureCollection' ? data.features : [data];
  let n = 0;
  for (const gf of list) {
    const g = gf.geometry;
    if (!g) continue;
    const props = { ...gf.properties };
    const name = props.nom || props.name || props.Name || '';
    delete props.nom; delete props.name; delete props.Name;

    const toLatLng = (c) => ({ lat: c[1], lng: c[0] });
    const push = async (type, coords) => {
      await addFeature({
        type, coords,
        template: props.modele_id || 'generique',
        name,
        props: {},
        source: 'import',
      });
      n++;
    };

    if (g.type === 'Point') await push('point', [toLatLng(g.coordinates)]);
    else if (g.type === 'MultiPoint') for (const c of g.coordinates) await push('point', [toLatLng(c)]);
    else if (g.type === 'LineString') await push('line', g.coordinates.map(toLatLng));
    else if (g.type === 'MultiLineString') for (const l of g.coordinates) await push('line', l.map(toLatLng));
    else if (g.type === 'Polygon') await push('polygon', g.coordinates[0].slice(0, -1).map(toLatLng));
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) await push('polygon', p[0].slice(0, -1).map(toLatLng));
  }
  return n;
}

/* ---------------------------------------------------------------- rapport imprimable */

export async function buildReport({ features = state.features, project = state.project,
                                    crsId = state.crs, withPhotos = true, basemapId = state.basemap } = {}) {
  const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const mapImg = await renderStaticMap(features, { basemapId, numbered: true, width: 1000, height: 620 });

  const photos = withPhotos ? await listProjectPhotos(project.id) : [];
  const photoData = new Map();
  for (const p of photos) {
    photoData.set(p.id, await blobToDataUrl(p.thumb || p.blob));
  }

  const totals = features.reduce((a, f) => {
    if (f.type === 'line') a.length += f.metrics?.length || 0;
    if (f.type === 'polygon') a.area += f.metrics?.area || 0;
    a[f.type]++;
    return a;
  }, { point: 0, line: 0, polygon: 0, length: 0, area: 0 });

  const crsLabel = CRS_LIST.find((c) => c.id === crsId)?.label || 'WGS84';

  const rows = features.map((f, i) => {
    const c = f.type === 'point' ? f.coords[0] : centroidOf(f.coords);
    const tpl = getTemplate(f.template);
    const detail = tpl.fields
      .map((field) => [field.label, formatValue(field, f.props?.[field.id])])
      .filter(([, v]) => v)
      .map(([k, v]) => `<span class="kv"><b>${esc(k)} :</b> ${esc(v)}</span>`)
      .join('');
    const metric = f.type === 'line' ? formatDistance(f.metrics?.length || 0)
      : f.type === 'polygon' ? formatArea(f.metrics?.area || 0) : '—';
    const pics = (f.photos || []).map((id) => photoData.get(id)).filter(Boolean)
      .map((src) => `<img class="thumb" src="${src}" alt="">`).join('');
    return `<tr>
      <td class="num">${i + 1}</td>
      <td>
        <div class="ft-name">${esc(f.name || tpl.label)}</div>
        <div class="ft-tpl">${tpl.icon} ${esc(tpl.label)}</div>
        ${detail ? `<div class="ft-detail">${detail}</div>` : ''}
        ${pics ? `<div class="ft-photos">${pics}</div>` : ''}
      </td>
      <td class="mono">${esc(formatCoords(c.lat, c.lng, crsId))}<br>
        <span class="muted">${f.accuracy != null ? `± ${f.accuracy.toFixed(1)} m` : ''}
        ${f.altitude != null ? ` · alt ${f.altitude.toFixed(1)} m` : ''}</span></td>
      <td class="mono">${metric}</td>
      <td class="muted small">${new Date(f.createdAt).toLocaleString('fr-FR')}<br>${esc(f.author || '')}</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Rapport — ${esc(project?.name)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; color: #1d1b16; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 2px solid #1f3a5f; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 22px 0 8px; color: #1f3a5f;
       border-bottom: 1px solid #d9d2c2; padding-bottom: 4px; }
  .meta { color: #6b6558; font-size: 11px; }
  .brand { text-align: right; font-size: 11px; color: #6b6558; }
  .brand b { display: block; font-size: 14px; color: #1f3a5f; letter-spacing: .08em; }
  .cards { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .card { flex: 1 1 110px; border: 1px solid #d9d2c2; border-radius: 6px; padding: 8px 10px; background: #faf8f3; }
  .card span { display: block; font-size: 10px; text-transform: uppercase;
               letter-spacing: .06em; color: #6b6558; }
  .card b { font-size: 16px; }
  .map { width: 100%; border: 1px solid #d9d2c2; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; background: #f0ece2; border-bottom: 1.5px solid #c9c0ac;
       padding: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  td { border-bottom: 1px solid #e6e0d2; padding: 6px; vertical-align: top; }
  tr { break-inside: avoid; }
  .num { font-weight: 700; color: #1f3a5f; width: 26px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; white-space: nowrap; }
  .ft-name { font-weight: 600; }
  .ft-tpl { color: #6b6558; font-size: 10px; }
  .ft-detail { margin-top: 3px; }
  .kv { display: inline-block; margin-right: 10px; font-size: 10.5px; }
  .ft-photos { margin-top: 5px; display: flex; gap: 4px; flex-wrap: wrap; }
  .thumb { height: 54px; border-radius: 3px; border: 1px solid #d9d2c2; }
  .muted { color: #6b6558; }
  .small { font-size: 10px; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #d9d2c2;
           font-size: 10px; color: #6b6558; display: flex; justify-content: space-between; }
  .noprint { position: fixed; bottom: 16px; right: 16px; z-index: 10; }
  .noprint button { font: inherit; padding: 10px 18px; border-radius: 999px;
                    border: 0; background: #1f3a5f; color: #fff; cursor: pointer;
                    box-shadow: 0 3px 12px rgba(0,0,0,.28); }
  @media print { .noprint { display: none; } }
</style></head>
<body>
<div class="noprint"><button onclick="window.print()">Imprimer / PDF</button></div>
<header>
  <div>
    <h1>${esc(project?.name || 'Relevé de terrain')}</h1>
    <div class="meta">
      ${project?.client ? `Client : ${esc(project.client)} · ` : ''}
      ${project?.reference ? `Réf. ${esc(project.reference)} · ` : ''}
      Édité le ${new Date().toLocaleString('fr-FR')}
    </div>
    <div class="meta">Système de coordonnées : ${esc(crsLabel)}</div>
  </div>
  <div class="brand"><b>GeoField</b>Relevé terrain géoréférencé</div>
</header>

${project?.description ? `<p class="meta">${esc(project.description)}</p>` : ''}

<div class="cards">
  <div class="card"><span>Objets levés</span><b>${features.length}</b></div>
  <div class="card"><span>Points</span><b>${totals.point}</b></div>
  <div class="card"><span>Linéaires</span><b>${totals.line} · ${formatDistance(totals.length)}</b></div>
  <div class="card"><span>Surfaces</span><b>${totals.polygon} · ${formatArea(totals.area)}</b></div>
  <div class="card"><span>Photos</span><b>${photos.length}</b></div>
</div>

${mapImg ? `<h2>Plan de situation</h2><img class="map" src="${mapImg}" alt="Carte du relevé">` : ''}

<h2>Inventaire des objets levés</h2>
<table>
  <thead><tr><th>N°</th><th>Objet</th><th>Coordonnées</th><th>Métrique</th><th>Saisie</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5" class="muted">Aucun objet levé.</td></tr>'}</tbody>
</table>

<footer>
  <span>${esc(project?.name)} — ${features.length} objet(s)</span>
  <span>Généré par GeoField · les positions sont issues du GPS de l'appareil</span>
</footer>
</body></html>`;
}

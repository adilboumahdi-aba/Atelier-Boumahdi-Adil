/* GeoField — état applicatif et opérations métier au-dessus d'IndexedDB. */

import * as db from './db.js';
import { pathLength, polygonArea, centroid, boundsOf } from './geo.js';

const listeners = new Map();

export const state = {
  project: null,
  features: [],
  position: null,      // dernière position GPS {lat,lng,accuracy,altitude,heading,speed,ts}
  heading: null,       // cap boussole
  crs: 'wgs84',
  basemap: 'osm',
  author: '',
  online: navigator.onLine,
};

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, payload) {
  (listeners.get(event) || []).forEach((fn) => {
    try { fn(payload); } catch (err) { console.error(`[store] listener ${event}`, err); }
  });
  if (event !== '*') emit('*', { event, payload });
}

/* ---------------------------------------------------------------- projets */

export async function listProjects() {
  const projects = await db.all('projects');
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createProject(data) {
  const now = Date.now();
  const project = {
    id: db.uid('prj'),
    name: data.name || 'Nouveau projet',
    client: data.client || '',
    reference: data.reference || '',
    description: data.description || '',
    crs: data.crs || 'wgs84',
    createdAt: now,
    updatedAt: now,
  };
  await db.put('projects', project);
  emit('projects:changed');
  return project;
}

export async function updateProject(patch) {
  const project = { ...state.project, ...patch, updatedAt: Date.now() };
  await db.put('projects', project);
  state.project = project;
  emit('project:changed', project);
  emit('projects:changed');
  return project;
}

export async function openProject(id) {
  const project = await db.get('projects', id);
  if (!project) throw new Error('Projet introuvable');
  state.project = project;
  state.crs = project.crs || 'wgs84';
  state.features = await loadFeatures(id);
  await db.setSetting('activeProjectId', id);
  emit('project:changed', project);
  emit('features:changed', state.features);
  return project;
}

export async function deleteProject(id) {
  await db.deleteByIndex('features', 'projectId', id);
  await db.deleteByIndex('photos', 'projectId', id);
  await db.del('projects', id);
  if (state.project?.id === id) {
    state.project = null;
    state.features = [];
    await db.setSetting('activeProjectId', null);
    emit('project:changed', null);
    emit('features:changed', []);
  }
  emit('projects:changed');
}

export async function projectStats(id) {
  const features = await db.byIndex('features', 'projectId', id);
  const photos = await db.byIndex('photos', 'projectId', id);
  return {
    features: features.length,
    points: features.filter((f) => f.type === 'point').length,
    lines: features.filter((f) => f.type === 'line').length,
    polygons: features.filter((f) => f.type === 'polygon').length,
    photos: photos.length,
    length: features.filter((f) => f.type === 'line').reduce((a, f) => a + (f.metrics?.length || 0), 0),
    area: features.filter((f) => f.type === 'polygon').reduce((a, f) => a + (f.metrics?.area || 0), 0),
  };
}

/* ---------------------------------------------------------------- objets levés */

export function loadFeatures(projectId) {
  return db.byIndex('features', 'projectId', projectId)
           .then((list) => list.sort((a, b) => b.createdAt - a.createdAt));
}

export function computeMetrics(type, coords) {
  if (type === 'line') {
    return { length: pathLength(coords), vertices: coords.length };
  }
  if (type === 'polygon') {
    return {
      area: polygonArea(coords),
      perimeter: pathLength([...coords, coords[0]]),
      vertices: coords.length,
    };
  }
  return {};
}

export async function addFeature({ type, coords, template, name, props, source, accuracy, altitude }) {
  const now = Date.now();
  const feature = {
    id: db.uid('ft'),
    projectId: state.project.id,
    type,
    template: template || 'generique',
    name: name || '',
    coords,                                   // [{lat,lng}, ...]
    props: props || {},
    custom: [],                               // champs libres [{key,value}]
    metrics: computeMetrics(type, coords),
    source: source || 'map',                  // 'gps' | 'map' | 'walk' | 'import' | 'coords'
    accuracy: accuracy ?? null,
    altitude: altitude ?? null,
    author: state.author || '',
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.put('features', feature);
  state.features.unshift(feature);
  touchProject();
  emit('features:changed', state.features);
  emit('feature:added', feature);
  return feature;
}

export async function updateFeature(id, patch) {
  const idx = state.features.findIndex((f) => f.id === id);
  if (idx < 0) return null;
  const feature = { ...state.features[idx], ...patch, updatedAt: Date.now() };
  if (patch.coords) feature.metrics = computeMetrics(feature.type, patch.coords);
  await db.put('features', feature);
  state.features[idx] = feature;
  touchProject();
  emit('features:changed', state.features);
  emit('feature:updated', feature);
  return feature;
}

export async function deleteFeature(id) {
  await db.deleteByIndex('photos', 'featureId', id);
  await db.del('features', id);
  state.features = state.features.filter((f) => f.id !== id);
  touchProject();
  emit('features:changed', state.features);
  emit('feature:deleted', id);
}

export function getFeature(id) {
  return state.features.find((f) => f.id === id) || null;
}

export function featureCenter(feature) {
  return feature.type === 'point' ? feature.coords[0] : centroid(feature.coords);
}

export function featuresBounds(features = state.features) {
  const pts = features.flatMap((f) => f.coords);
  return boundsOf(pts);
}

function touchProject() {
  if (!state.project) return;
  state.project.updatedAt = Date.now();
  db.put('projects', state.project);
}

/* ---------------------------------------------------------------- photos */

export async function addPhoto({ featureId, blob, thumb, position, heading, note }) {
  const photo = {
    id: db.uid('ph'),
    projectId: state.project.id,
    featureId: featureId || null,
    blob,
    thumb,
    lat: position?.lat ?? null,
    lng: position?.lng ?? null,
    accuracy: position?.accuracy ?? null,
    altitude: position?.altitude ?? null,
    heading: heading ?? null,
    note: note || '',
    author: state.author || '',
    createdAt: Date.now(),
  };
  await db.put('photos', photo);
  if (featureId) {
    const f = getFeature(featureId);
    if (f) await updateFeature(featureId, { photos: [...(f.photos || []), photo.id] });
  }
  emit('photos:changed', photo);
  return photo;
}

export function listPhotos(featureId) {
  return db.byIndex('photos', 'featureId', featureId);
}

export function listProjectPhotos(projectId = state.project?.id) {
  return db.byIndex('photos', 'projectId', projectId);
}

export async function deletePhoto(id) {
  const photo = await db.get('photos', id);
  await db.del('photos', id);
  if (photo?.featureId) {
    const f = getFeature(photo.featureId);
    if (f) await updateFeature(photo.featureId, { photos: (f.photos || []).filter((p) => p !== id) });
  }
  emit('photos:changed', null);
}

/* ---------------------------------------------------------------- préférences */

export async function loadPreferences() {
  state.crs = await db.getSetting('crs', 'wgs84');
  state.basemap = await db.getSetting('basemap', 'osm');
  state.author = await db.getSetting('author', '');
  return state;
}

export async function setPreference(key, value) {
  state[key] = value;
  await db.setSetting(key, value);
  emit('prefs:changed', { key, value });
}

window.addEventListener('online', () => { state.online = true; emit('network', true); });
window.addEventListener('offline', () => { state.online = false; emit('network', false); });

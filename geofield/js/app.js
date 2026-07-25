/* GeoField — orchestration de l'interface (écran projets + écran carte). */

import * as store from './store.js';
import * as db from './db.js';
import * as geo from './geo.js';
import * as gpsMod from './gps.js';
import * as mapMod from './map.js';
import * as offline from './offline.js';
import * as photos from './photos.js';
import * as forms from './forms.js';
import * as exporter from './exporter.js';
import { TEMPLATE_LIST, getTemplate, templatesFor, summarize, formatValue } from './templates.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ================================================================ démarrage */

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstallPrompt = e; });

async function boot() {
  await store.loadPreferences();
  db.requestPersistence();
  fillCrsSelects();
  fillZoomSelects();
  wireProjectsScreen();
  wireMapScreen();
  wireSheets();
  registerServiceWorker();

  const activeId = await db.getSetting('activeProjectId', null);
  await renderProjectsList();

  if (activeId) {
    try { await enterProject(activeId); return; } catch { /* projet supprimé entre-temps */ }
  }
  showScreen('projects');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();

/* ================================================================ écrans */

function showScreen(name) {
  $$('.screen').forEach((s) => s.classList.remove('is-active'));
  $(`#screen-${name}`).classList.add('is-active');
}

/* ================================================================ toasts */

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ` is-${type}` : '');
  el.textContent = message;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

/* ================================================================ feuilles (bottom sheets) */

let openSheetEl = null;

function openSheet(id) {
  closeSheet();
  const el = $(`#${id}`);
  el.classList.add('is-open');
  $('#scrim').classList.add('is-visible');
  openSheetEl = el;
}

function closeSheet() {
  if (openSheetEl) openSheetEl.classList.remove('is-open');
  $('#scrim').classList.remove('is-visible');
  openSheetEl = null;
}

function wireSheets() {
  $('#scrim').addEventListener('click', closeSheet);
  $$('.sheet [data-close]').forEach((btn) => btn.addEventListener('click', closeSheet));
}

/* ================================================================ écran projets */

function fillCrsSelects() {
  const options = geo.CRS_LIST.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
  ['#p-crs', '#s-crs', '#g-crs'].forEach((sel) => { $(sel).innerHTML = options; });
}

function fillZoomSelects() {
  const opts = (lo, hi, sel) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    .map((z) => `<option value="${z}" ${z === sel ? 'selected' : ''}>${z}</option>`).join('');
  $('#dl-min').innerHTML = opts(10, 19, 14);
  $('#dl-max').innerHTML = opts(10, 19, 18);
}

async function renderProjectsList() {
  const list = await store.listProjects();
  const el = $('#projects-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state">Aucun projet pour l\'instant. Crée ton premier chantier.</div>';
    return;
  }
  el.innerHTML = '';
  for (const p of list) {
    const stats = await store.projectStats(p.id);
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div>
        <div class="project-card__name">${escapeHtml(p.name)}</div>
        <div class="project-card__meta">${escapeHtml(p.client || 'Sans client')} ·
          ${stats.features} objet(s) · ${new Date(p.updatedAt).toLocaleDateString('fr-FR')}</div>
      </div>
      <div class="project-card__arrow">›</div>`;
    card.addEventListener('click', () => enterProject(p.id));
    el.appendChild(card);
  }
}

function wireProjectsScreen() {
  $('#btn-new-project').addEventListener('click', () => {
    $('#form-project-title').textContent = 'Nouveau projet';
    $('#form-project').dataset.mode = 'create';
    $('#form-project').reset();
    $('#p-crs').value = 'wgs84';
    $('#form-project').classList.remove('hidden');
  });

  $('#btn-cancel-project').addEventListener('click', () => {
    $('#form-project').classList.add('hidden');
  });

  $('#form-project').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: $('#p-name').value.trim(),
      client: $('#p-client').value.trim(),
      reference: $('#p-ref').value.trim(),
      crs: $('#p-crs').value,
      description: $('#p-desc').value.trim(),
    };
    if (!data.name) return;
    if ($('#form-project').dataset.mode === 'edit') {
      await store.updateProject(data);
      toast('Projet mis à jour');
      $('#form-project').classList.add('hidden');
      await renderProjectsList();
      updateTopbar();
    } else {
      const p = await store.createProject(data);
      $('#form-project').classList.add('hidden');
      await enterProject(p.id);
    }
  });

  $('#btn-import-backup').addEventListener('click', () => triggerFileInput('.json', async (file) => {
    try {
      const res = await exporter.importBackup(file);
      toast(`Restauré : ${res.projects} projet(s), ${res.features} objet(s)`, 'success');
      await renderProjectsList();
    } catch (err) {
      toast('Sauvegarde invalide : ' + err.message, 'error');
    }
  }));

  $('#btn-about').addEventListener('click', () => {
    toast('GeoField v1 — relevé de terrain hors ligne, sans compte, sans serveur.');
  });

  updateStorageInfo();
}

async function updateStorageInfo() {
  const est = await db.storageEstimate();
  if (!est) return;
  const pct = Math.round(est.ratio * 100);
  $('#storage-info').textContent =
    `Stockage utilisé sur cet appareil : ${offline.formatBytes(est.usage)} (~${pct}% du quota alloué au navigateur).`;
}

function triggerFileInput(accept, onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.remove(); }, { once: true });
  document.body.appendChild(input);
  input.click();
}

async function enterProject(id) {
  await store.openProject(id);
  updateTopbar();
  showScreen('map');
  if (!mapMod.map) {
    mapMod.initMap('map');
    setupAfterMapReady();
  }
  mapMod.renderFeatures();
  if (!mapMod.fitAll()) mapMod.map.setView([34.0209, -6.8416], 13);
  gpsMod.start();
}

function updateTopbar() {
  const p = store.state.project;
  if (!p) return;
  $('#project-name').textContent = p.name;
  $('#project-sub').textContent = p.client || p.reference || '';
  $('#menu-project-name').textContent = p.name;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================================================================ écran carte : GPS & HUD */

let mapReady = false;

function setupAfterMapReady() {
  if (mapReady) return;
  mapReady = true;

  store.on('gps:fix', updateGpsHud);
  store.on('gps:error', (e) => toast(e.message, 'error'));
  store.on('network', (online) => {
    $('#chip-net').classList.toggle('is-offline', !online);
    $('#chip-net').title = online ? 'En ligne' : 'Hors ligne — les nouvelles tuiles ne se chargeront pas';
  });
  store.on('compass', (heading) => {
    $('#north-arrow').style.transform = `rotate(${-heading}deg)`;
  });
  store.on('feature:selected', (id) => openFeatureSheet(id));
  mapMod.map.on('dragstart', () => mapMod.setFollow(false));

  $('#chip-net').classList.toggle('is-offline', !navigator.onLine);
}

function updateGpsHud(fix) {
  $('#gps-hud').hidden = false;
  const cls = geo.accuracyClass(fix.accuracy);
  const badge = $('#gps-quality');
  badge.textContent = cls.label;
  badge.className = 'gps-hud__badge' + (cls.key === 'poor' ? ' is-poor' : cls.key === 'bad' ? ' is-bad' : '');
  $('#gps-accuracy').textContent = `± ${fix.accuracy.toFixed(1)} m`;
  $('#gps-alt').textContent = fix.altitude != null ? `alt. ${fix.altitude.toFixed(0)} m` : 'alt. —';
  $('#gps-coords').textContent = geo.formatCoords(fix.lat, fix.lng, store.state.crs);
}

/* ================================================================ carte : boutons flottants */

function wireMapScreen() {
  $('#btn-menu').addEventListener('click', () => {
    renderMenuStats();
    openSheet('sheet-menu');
  });

  $('#btn-locate').addEventListener('click', () => {
    mapMod.setFollow(true);
    const fix = gpsMod.current();
    if (fix) mapMod.map.setView([fix.lat, fix.lng], Math.max(mapMod.map.getZoom(), 17));
    else toast('Acquisition de la position en cours…');
  });

  $('#btn-fit').addEventListener('click', () => {
    if (!mapMod.fitAll()) toast('Aucun objet à afficher pour le moment.');
  });

  $('#btn-layers').addEventListener('click', () => { renderLayersSheet(); openSheet('sheet-layers'); });

  $('#btn-north').addEventListener('click', async () => {
    const ok = await gpsMod.enableCompass();
    toast(ok ? 'Boussole activée' : 'Boussole non disponible sur cet appareil');
  });

  $$('.act').forEach((btn) => btn.addEventListener('click', () => onAction(btn.dataset.act)));

  wireDrawBar();
  wireMeasureBar();
  wireStakeBar();
  wireMenuSheet();
  wireExportSheet();
  wireSettingsSheet();
  wireGotoSheet();
  wireFeatureSheet();
  wireListSheet();
  wireLightbox();

  // Suivi de la carte : désactive le mode "centrer" dès que l'utilisateur bouge la carte à la main.
  document.addEventListener('DOMContentLoaded', () => {});
}

let activeAction = null;
let activeDrawer = null;

function setActiveAction(name) {
  activeAction = name;
  $$('.act').forEach((b) => b.classList.toggle('is-active', b.dataset.act === name));
}

async function onAction(name) {
  if (name === 'list') { renderFeaturesList(); openSheet('sheet-list'); return; }
  if (name === 'photo') { await quickPhoto(); return; }
  if (name === 'measure') { openMeasure(activeMeasureMode()); return; }
  if (['point', 'line', 'polygon'].includes(name)) { openDrawing(name); return; }
}

function activeMeasureMode() { return 'distance'; }

/* ---------------------------------------------------------------- dessin */

function openDrawing(type) {
  if (!mapMod.map) return;
  setActiveAction(type);
  mapMod.stopMeasure();
  $('#measure-bar').classList.add('hidden');
  mapMod.clearStakeout();
  $('#stake-bar').classList.add('hidden');

  const titles = { point: 'Nouveau point', line: 'Nouvelle ligne', polygon: 'Nouvelle surface' };
  $('#draw-title').textContent = titles[type];
  $('#draw-metrics').textContent = type === 'point' ? 'Tape la carte ou utilise le GPS' : '0 sommet';
  $('#draw-gps').classList.toggle('hidden', false);
  $('#draw-walk').classList.toggle('hidden', type === 'point');
  $('#draw-bar').classList.remove('hidden');

  activeDrawer = mapMod.createDrawer({
    type,
    onChange: (pts, metrics) => updateDrawMetrics(type, pts, metrics),
  });

  if (type === 'point') {
    // Un seul tap suffit : on intercepte le prochain clic carte comme sommet unique.
    const off = store.on('map:click', (latlng) => {
      activeDrawer.setPoints([{ lat: latlng.lat, lng: latlng.lng }]);
      off();
    });
    activeDrawer._offPointTap = off;
  }
}

function updateDrawMetrics(type, pts, metrics) {
  if (type === 'point') {
    $('#draw-metrics').textContent = pts.length ? geo.formatCoords(pts[0].lat, pts[0].lng, store.state.crs) : '—';
  } else if (type === 'line') {
    $('#draw-metrics').textContent = `${pts.length} sommet(s) · ${geo.formatDistance(metrics.length)}`;
  } else {
    $('#draw-metrics').textContent = `${pts.length} sommet(s) · ${geo.formatArea(metrics.area || 0)}`;
  }
}

function wireDrawBar() {
  $('#draw-gps').addEventListener('click', async () => {
    if (!activeDrawer) return;
    if (activeDrawer.type === 'point') {
      const n = Number(localStorage.getItem('gf_samples') || 10);
      if (n <= 1) {
        const fix = gpsMod.current();
        if (!fix) return toast('Position GPS pas encore disponible.');
        activeDrawer.setPoints([{ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, altitude: fix.altitude }]);
        return;
      }
      $('#draw-gps').disabled = true;
      try {
        const avg = await gpsMod.average(n, (done, total) => {
          $('#draw-gps').textContent = `Mesure ${done}/${total}…`;
        });
        activeDrawer.setPoints([{ lat: avg.lat, lng: avg.lng, accuracy: avg.accuracy, altitude: avg.altitude }]);
        toast(`Point moyenné sur ${avg.samples} mesures (± ${avg.accuracy.toFixed(1)} m)`, 'success');
      } catch {
        toast('Impossible d\'obtenir la position.', 'error');
      } finally {
        $('#draw-gps').disabled = false;
        $('#draw-gps').textContent = '+ Sommet GPS';
      }
      return;
    }
    const fix = gpsMod.current();
    if (!fix) return toast('Position GPS pas encore disponible.');
    activeDrawer.addVertex({ lat: fix.lat, lng: fix.lng }, { accuracy: fix.accuracy });
  });

  let walker = null;
  $('#draw-walk').addEventListener('click', () => {
    if (!activeDrawer) return;
    if (walker) {
      walker.stop();
      walker = null;
      $('#draw-walk').textContent = '▶ Marche';
      toast('Enregistrement de la marche arrêté');
      return;
    }
    const minDistance = Number(localStorage.getItem('gf_walk_dist') || 3);
    walker = gpsMod.createWalkRecorder({
      minDistance,
      onPoint: (p) => { if (p) activeDrawer.addVertex(p, { accuracy: p.accuracy }); },
    });
    $('#draw-walk').textContent = '⏸ Marche…';
    toast('Marche autour de la parcelle — un sommet est ajouté à chaque pas.');
  });

  $('#draw-undo').addEventListener('click', () => activeDrawer?.undo());

  $('#draw-cancel').addEventListener('click', () => {
    activeDrawer?._offPointTap?.();
    activeDrawer?.cancel();
    activeDrawer = null;
    walker?.stop(); walker = null;
    $('#draw-bar').classList.add('hidden');
    setActiveAction(null);
  });

  $('#draw-finish').addEventListener('click', () => {
    if (!activeDrawer) return;
    const type = activeDrawer.type;
    const min = type === 'point' ? 1 : type === 'line' ? 2 : 3;
    const pts = activeDrawer.finish();
    walker?.stop(); walker = null;
    $('#draw-bar').classList.add('hidden');
    setActiveAction(null);
    if (pts.length < min) return toast(`Il faut au moins ${min} sommet(s).`);
    openFeatureSheetForNew(type, pts);
  });
}

/* ---------------------------------------------------------------- mesure */

let measureCtl = null;

function openMeasure(mode) {
  setActiveAction('measure');
  $('#draw-bar').classList.add('hidden');
  activeDrawer = null;
  mapMod.clearStakeout();
  $('#stake-bar').classList.add('hidden');

  $('#measure-title').textContent = mode === 'area' ? 'Mesure de surface' : 'Mesure de distance';
  $('#measure-bar').classList.remove('hidden');
  measureCtl = mapMod.startMeasure(mode, (res) => updateMeasureResult(res));
}

function updateMeasureResult(res) {
  if (!res.points) { $('#measure-result').textContent = 'Tape la carte pour poser des points'; return; }
  const parts = [`${res.points} pt`];
  if (res.mode === 'area' && res.points >= 3) parts.push(geo.formatArea(res.area));
  else parts.push(geo.formatDistance(res.length));
  $('#measure-result').textContent = parts.join(' · ');
}

function wireMeasureBar() {
  $('#measure-gps').addEventListener('click', () => {
    const fix = gpsMod.current();
    if (!fix) return toast('Position GPS pas encore disponible.');
    measureCtl?.addPoint({ lat: fix.lat, lng: fix.lng });
  });
  $('#measure-undo').addEventListener('click', () => measureCtl?.undo());
  $('#measure-close').addEventListener('click', () => {
    mapMod.stopMeasure();
    measureCtl = null;
    $('#measure-bar').classList.add('hidden');
    setActiveAction(null);
  });
  $('#measure-save').addEventListener('click', () => {
    const res = measureCtl?.result();
    if (!res || res.points < 2) return toast('Ajoute au moins deux points.');
    const type = res.mode === 'area' && res.points >= 3 ? 'polygon' : 'line';
    const pts = res.pts;
    mapMod.stopMeasure();
    measureCtl = null;
    $('#measure-bar').classList.add('hidden');
    setActiveAction(null);
    openFeatureSheetForNew(type, pts, { template: 'mesure' });
  });
}

/* ---------------------------------------------------------------- implantation */

let stakeTarget = null;
let stakeTimer = null;

function startStakeout(feature) {
  stakeTarget = feature;
  $('#draw-bar').classList.add('hidden');
  $('#measure-bar').classList.add('hidden');
  $('#stake-name').textContent = feature.name || getTemplate(feature.template).label;
  $('#stake-bar').classList.remove('hidden');
  mapMod.setFollow(false);
  updateStakeout();
  stakeTimer = setInterval(updateStakeout, 1000);
}

function updateStakeout() {
  const fix = gpsMod.current();
  if (!fix || !stakeTarget) return;
  const target = store.featureCenter(stakeTarget);
  const d = geo.deltaEN(fix, target);
  $('#stake-dist').textContent = geo.formatDistance(d.dist);
  $('#stake-de').textContent = `${d.east >= 0 ? '+' : ''}${d.east.toFixed(1)} m`;
  $('#stake-dn').textContent = `${d.north >= 0 ? '+' : ''}${d.north.toFixed(1)} m`;
  $('#stake-az').textContent = `${d.bearing.toFixed(0)}°`;
  const heading = store.state.heading || 0;
  $('#stake-arrow').style.transform = `rotate(${d.bearing - heading}deg)`;
  mapMod.drawStakeout(fix, target);
  if (d.dist < 0.5) $('#stake-dist').style.color = 'var(--green)';
  else $('#stake-dist').style.color = '';
}

function stopStakeout() {
  clearInterval(stakeTimer);
  stakeTimer = null;
  stakeTarget = null;
  mapMod.clearStakeout();
  $('#stake-bar').classList.add('hidden');
}

function wireStakeBar() {
  $('#stake-close').addEventListener('click', stopStakeout);
  $('#stake-mark').addEventListener('click', async () => {
    if (!stakeTarget) return;
    const props = { ...stakeTarget.props, implante: true };
    await store.updateFeature(stakeTarget.id, { props });
    toast('Marqué comme implanté', 'success');
    stopStakeout();
  });
}

/* ---------------------------------------------------------------- photo rapide */

async function quickPhoto() {
  const files = await photos.pickImages({ camera: true, multiple: false });
  if (!files.length) return;
  toast('Enregistrement de la photo…');
  try {
    await photos.capture(files[0]);
    toast('Photo enregistrée avec sa position', 'success');
  } catch (err) {
    toast('Échec de la capture : ' + err.message, 'error');
  }
}

/* ================================================================ fiche objet */

let editingFeatureId = null;
let pendingNewFeature = null;

function openFeatureSheetForNew(type, coords, opts = {}) {
  editingFeatureId = null;
  pendingNewFeature = { type, coords };
  const candidates = templatesFor(type);
  const defaultTpl = opts.template && candidates.some((t) => t.id === opts.template) ? opts.template : candidates[0]?.id || 'generique';

  $('#feature-sheet-title').textContent = 'Nouvelle fiche';
  $('#f-name').value = '';
  fillTemplateSelect(type, defaultTpl);
  forms.renderFields($('#f-fields'), defaultTpl, {});
  forms.renderCustomFields($('#f-custom'), []);
  $('#f-photos').innerHTML = '';
  $('#btn-delete-feature').classList.add('hidden');
  $('#btn-stake-feature').classList.toggle('hidden', type !== 'point');
  renderGeoSummary(type, coords);
  openSheet('sheet-feature');
}

function openFeatureSheet(id) {
  const f = store.getFeature(id);
  if (!f) return;
  editingFeatureId = id;
  pendingNewFeature = null;
  mapMod.highlightFeature(id);

  $('#feature-sheet-title').textContent = f.name || getTemplate(f.template).label;
  $('#f-name').value = f.name || '';
  fillTemplateSelect(f.type, f.template);
  forms.renderFields($('#f-fields'), f.template, f.props);
  forms.renderCustomFields($('#f-custom'), f.custom || []);
  $('#btn-delete-feature').classList.remove('hidden');
  $('#btn-stake-feature').classList.toggle('hidden', f.type !== 'point');
  renderGeoSummary(f.type, f.coords, f);
  renderFeaturePhotos(f);
  openSheet('sheet-feature');
}

function fillTemplateSelect(geomType, selected) {
  const list = templatesFor(geomType);
  $('#f-template').innerHTML = list.map((t) =>
    `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('');
  $('#f-template').onchange = () => {
    const current = editingFeatureId ? store.getFeature(editingFeatureId) : null;
    forms.renderFields($('#f-fields'), $('#f-template').value, current?.props || {});
  };
}

function renderGeoSummary(type, coords, feature = null) {
  const crs = store.state.crs;
  let html;
  if (type === 'point') {
    const p = coords[0];
    const accuracy = feature?.accuracy ?? p.accuracy;
    const altitude = feature?.altitude ?? p.altitude;
    html = `${geo.formatCoords(p.lat, p.lng, crs)}`;
    if (accuracy != null) html += ` · précision ± ${accuracy.toFixed(1)} m`;
    if (altitude != null) html += ` · alt. ${altitude.toFixed(1)} m`;
  } else if (type === 'line') {
    const len = feature?.metrics?.length ?? geo.pathLength(coords);
    html = `Ligne · ${coords.length} sommets · ${geo.formatDistance(len)}`;
  } else {
    const area = feature?.metrics?.area ?? geo.polygonArea(coords);
    const per = feature?.metrics?.perimeter ?? geo.pathLength([...coords, coords[0]]);
    html = `Surface · ${coords.length} sommets · ${geo.formatArea(area)} · périmètre ${geo.formatDistance(per)}`;
  }
  $('#feature-geo').textContent = html;
}

function renderFeaturePhotos(feature) {
  store.listPhotos(feature.id).then((list) => {
    const el = $('#f-photos');
    el.innerHTML = '';
    for (const ph of list) {
      const div = document.createElement('div');
      div.className = 'photo-thumb';
      const img = document.createElement('img');
      img.src = photos.blobUrl(ph.id, ph.thumb || ph.blob);
      img.addEventListener('click', () => openLightbox(ph));
      div.appendChild(img);
      el.appendChild(div);
    }
  });
}

function wireFeatureSheet() {
  $('#btn-add-custom').addEventListener('click', () => forms.addCustomRow($('#f-custom')));

  $('#btn-photo-cam').addEventListener('click', () => addPhotoToFeature(true));
  $('#btn-photo-lib').addEventListener('click', () => addPhotoToFeature(false));

  $('#btn-save-feature').addEventListener('click', async () => {
    const template = $('#f-template').value;
    const props = forms.readFields($('#f-fields'), template);
    const custom = forms.readCustomFields($('#f-custom'));
    const name = $('#f-name').value.trim();

    if (editingFeatureId) {
      await store.updateFeature(editingFeatureId, { template, props, custom, name });
      toast('Fiche mise à jour', 'success');
    } else if (pendingNewFeature) {
      const p0 = pendingNewFeature.coords[0];
      const fix = gpsMod.current();
      const feature = await store.addFeature({
        type: pendingNewFeature.type,
        coords: pendingNewFeature.coords,
        template, props, name,
        source: pendingNewFeature.coords.length === 1 ? 'gps' : 'map',
        accuracy: pendingNewFeature.type === 'point' ? (p0.accuracy ?? fix?.accuracy) : null,
        altitude: pendingNewFeature.type === 'point' ? (p0.altitude ?? fix?.altitude) : null,
      });
      if (custom.length) await store.updateFeature(feature.id, { custom });
      toast('Objet enregistré', 'success');
    }
    pendingNewFeature = null;
    closeSheet();
  });

  $('#btn-delete-feature').addEventListener('click', async () => {
    if (!editingFeatureId) return;
    if (!confirm('Supprimer définitivement cette fiche et ses photos ?')) return;
    await store.deleteFeature(editingFeatureId);
    toast('Fiche supprimée');
    closeSheet();
  });

  $('#btn-stake-feature').addEventListener('click', () => {
    const f = editingFeatureId ? store.getFeature(editingFeatureId) : null;
    if (!f) return toast('Enregistre d\'abord la fiche pour lancer le guidage.');
    closeSheet();
    startStakeout(f);
  });
}

async function addPhotoToFeature(camera) {
  const files = await photos.pickImages({ camera, multiple: !camera });
  if (!files.length) return;

  // Une fiche pas encore enregistrée n'a pas d'id : on la crée dès la première photo
  // pour ne jamais laisser une photo orpheline (sans objet auquel se rattacher).
  if (!editingFeatureId && pendingNewFeature) {
    const template = $('#f-template').value;
    const feature = await store.addFeature({
      type: pendingNewFeature.type,
      coords: pendingNewFeature.coords,
      template,
      props: forms.readFields($('#f-fields'), template),
      name: $('#f-name').value.trim(),
      source: pendingNewFeature.coords.length === 1 ? 'gps' : 'map',
    });
    editingFeatureId = feature.id;
    pendingNewFeature = null;
    $('#btn-delete-feature').classList.remove('hidden');
    $('#feature-sheet-title').textContent = feature.name || getTemplate(feature.template).label;
  }

  toast('Enregistrement…');
  for (const file of files) {
    await photos.capture(file, { featureId: editingFeatureId });
  }
  renderFeaturePhotos(store.getFeature(editingFeatureId));
  toast('Photo(s) ajoutée(s)', 'success');
}

/* ================================================================ liste des objets */

function wireListSheet() {
  $('#list-search').addEventListener('input', renderFeaturesList);
  $('#list-filter').addEventListener('change', renderFeaturesList);
  $('#list-filter').innerHTML = '<option value="">Tous les modèles</option>' +
    TEMPLATE_LIST.map((t) => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('');
}

function renderFeaturesList() {
  const q = $('#list-search').value.trim().toLowerCase();
  const filter = $('#list-filter').value;
  const list = store.state.features.filter((f) => {
    if (filter && f.template !== filter) return false;
    if (!q) return true;
    return (f.name || '').toLowerCase().includes(q) || summarize(f).toLowerCase().includes(q);
  });

  const stats = { point: 0, line: 0, polygon: 0 };
  store.state.features.forEach((f) => stats[f.type]++);
  $('#list-stats').innerHTML = `
    <div class="stat"><span>Points</span><b>${stats.point}</b></div>
    <div class="stat"><span>Lignes</span><b>${stats.line}</b></div>
    <div class="stat"><span>Surfaces</span><b>${stats.polygon}</b></div>`;

  const el = $('#features-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state">Aucun objet ne correspond.</div>';
    return;
  }
  el.innerHTML = '';
  for (const f of list) {
    const tpl = getTemplate(f.template);
    const row = document.createElement('div');
    row.className = 'feature-item';
    const metric = f.type === 'line' ? geo.formatDistance(f.metrics?.length || 0)
      : f.type === 'polygon' ? geo.formatArea(f.metrics?.area || 0) : '';
    row.innerHTML = `
      <div class="feature-item__icon" style="background:${tpl.color}">${tpl.icon}</div>
      <div class="feature-item__body">
        <div class="feature-item__title">${escapeHtml(f.name || tpl.label)}</div>
        <div class="feature-item__sub">${escapeHtml(summarize(f)) || tpl.label}</div>
        <div class="feature-item__meta">${metric ? metric + ' · ' : ''}${new Date(f.createdAt).toLocaleDateString('fr-FR')}</div>
      </div>`;
    row.addEventListener('click', () => {
      closeSheet();
      mapMod.zoomTo(f);
      setTimeout(() => openFeatureSheet(f.id), 250);
    });
    el.appendChild(row);
  }
}

/* ================================================================ menu principal */

function wireMenuSheet() {
  $('#mi-goto').addEventListener('click', () => { closeSheet(); openSheet('sheet-goto'); });
  $('#mi-crs').addEventListener('click', () => { closeSheet(); openSettingsAt('crs'); });
  $('#mi-export').addEventListener('click', () => { closeSheet(); openSheet('sheet-export'); });
  $('#mi-report').addEventListener('click', async () => { closeSheet(); await runExport('report'); });
  $('#mi-settings').addEventListener('click', () => { closeSheet(); openSettingsAt(); });
  $('#mi-import').addEventListener('click', () => {
    closeSheet();
    triggerFileInput('.geojson,.json', async (file) => {
      try {
        const n = await exporter.importGeoJSON(file, { addFeature: store.addFeature });
        toast(`${n} objet(s) importé(s)`, 'success');
        mapMod.fitAll();
      } catch (err) {
        toast('Import impossible : ' + err.message, 'error');
      }
    });
  });
  $('#mi-edit-project').addEventListener('click', () => {
    closeSheet();
    const p = store.state.project;
    $('#p-name').value = p.name;
    $('#p-client').value = p.client || '';
    $('#p-ref').value = p.reference || '';
    $('#p-crs').value = p.crs || 'wgs84';
    $('#p-desc').value = p.description || '';
    $('#form-project-title').textContent = 'Modifier le projet';
    $('#form-project').dataset.mode = 'edit';
    showScreen('projects');
    $('#form-project').classList.remove('hidden');
    renderProjectsList();
  });
  $('#mi-projects').addEventListener('click', async () => {
    closeSheet();
    gpsMod.stop();
    await renderProjectsList();
    showScreen('projects');
  });
}

function renderMenuStats() {
  store.projectStats(store.state.project.id).then((s) => {
    $('#menu-stats').innerHTML = `
      <div class="stat"><span>Objets</span><b>${s.features}</b></div>
      <div class="stat"><span>Linéaire</span><b>${geo.formatDistance(s.length)}</b></div>
      <div class="stat"><span>Surface</span><b>${geo.formatArea(s.area)}</b></div>
      <div class="stat"><span>Photos</span><b>${s.photos}</b></div>`;
  });
}

/* ================================================================ export */

function wireExportSheet() {
  $$('.menu-item[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => runExport(btn.dataset.export));
  });
}

async function runExport(kind) {
  if (!store.state.features.length && kind !== 'backup') {
    toast('Aucun objet à exporter pour ce projet.');
    return;
  }
  $('#export-status').textContent = 'Préparation…';
  try {
    if (kind === 'geojson') exporter.exportGeoJSON();
    else if (kind === 'csv') exporter.exportCSV();
    else if (kind === 'gpx') exporter.exportGPX();
    else if (kind === 'kml') exporter.exportKML();
    else if (kind === 'backup') {
      const res = await exporter.exportBackup({
        onProgress: (i, n) => { $('#export-status').textContent = `Photos : ${i}/${n}`; },
      });
      toast(`Sauvegarde : ${res.features} objet(s), ${res.photos} photo(s)`, 'success');
    } else if (kind === 'report') {
      const html = await exporter.buildReport();
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
      else {
        exporter.download(`${exporter.baseName()}-rapport.html`, html, 'text/html');
        toast('Fenêtre bloquée — le rapport a été téléchargé en HTML.');
      }
    }
    $('#export-status').textContent = 'Terminé.';
  } catch (err) {
    $('#export-status').textContent = '';
    toast('Échec de l\'export : ' + err.message, 'error');
  }
}

/* ================================================================ réglages */

function openSettingsAt() {
  $('#s-author').value = store.state.author || '';
  $('#s-crs').value = store.state.crs;
  updateSettingsStorage();
  openSheet('sheet-settings');
}

function wireSettingsSheet() {
  $('#s-author').addEventListener('change', () => store.setPreference('author', $('#s-author').value.trim()));
  $('#s-crs').addEventListener('change', () => {
    store.setPreference('crs', $('#s-crs').value);
    if (editingFeatureId) { /* rafraîchi à la prochaine ouverture */ }
  });
  $('#s-samples').addEventListener('change', () => localStorage.setItem('gf_samples', $('#s-samples').value));
  $('#s-walk-dist').addEventListener('change', () => localStorage.setItem('gf_walk_dist', $('#s-walk-dist').value));
  $('#s-sun').addEventListener('change', () => document.body.classList.toggle('sun-mode', $('#s-sun').checked));
  $('#s-compass').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const ok = await gpsMod.enableCompass();
      if (!ok) { e.target.checked = false; toast('Boussole non disponible ou refusée.'); }
    }
  });
  $('#btn-persist').addEventListener('click', async () => {
    const ok = await db.requestPersistence();
    toast(ok ? 'Stockage persistant activé.' : 'Le navigateur n\'a pas accordé la persistance.', ok ? 'success' : 'error');
  });
}

async function updateSettingsStorage() {
  const est = await db.storageEstimate();
  const tiles = await db.tileStats();
  $('#settings-storage').textContent = est
    ? `${offline.formatBytes(est.usage)} utilisés · ${tiles.count} tuiles en cache (${offline.formatBytes(tiles.bytes)})`
    : '';
}

/* ================================================================ aller à des coordonnées */

function wireGotoSheet() {
  $('#g-crs').addEventListener('change', updateGotoLabels);
  updateGotoLabels();

  $('#btn-goto-view').addEventListener('click', () => {
    const p = readGotoPoint();
    if (!p) return toast('Coordonnées invalides.');
    mapMod.setFollow(false);
    mapMod.map.setView([p.lat, p.lng], 18);
    closeSheet();
  });

  $('#btn-goto-create').addEventListener('click', () => {
    const p = readGotoPoint();
    if (!p) return toast('Coordonnées invalides.');
    mapMod.map.setView([p.lat, p.lng], 18);
    closeSheet();
    openFeatureSheetForNew('point', [p], { template: 'implantation' });
  });
}

function updateGotoLabels() {
  const crsId = $('#g-crs').value;
  const supportsInput = geo.crsSupportsInput(crsId) || crsId === 'wgs84' || crsId === 'dms';
  $('#g-x-label').textContent = crsId === 'wgs84' || crsId === 'dms' ? 'Longitude' : 'X / Est';
  $('#g-y-label').textContent = crsId === 'wgs84' || crsId === 'dms' ? 'Latitude' : 'Y / Nord';
  $('#g-x').disabled = $('#g-y').disabled = !supportsInput;
  if (!supportsInput) toast('Ce système ne permet pas encore la saisie inverse — utilise WGS84.');
}

function readGotoPoint() {
  const crsId = $('#g-crs').value;
  const xRaw = $('#g-x').value.trim();
  const yRaw = $('#g-y').value.trim();
  if (!xRaw || !yRaw) return null;

  if (crsId === 'wgs84' || crsId === 'dms') {
    const lng = geo.parseCoord(xRaw);
    const lat = geo.parseCoord(yRaw);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  }
  const x = parseFloat(xRaw.replace(',', '.'));
  const y = parseFloat(yRaw.replace(',', '.'));
  if (!isFinite(x) || !isFinite(y)) return null;
  const p = geo.unproject(x, y, crsId);
  return p;
}

/* ================================================================ fonds de carte / hors ligne */

function renderLayersSheet() {
  const el = $('#basemaps');
  el.innerHTML = '';
  for (const b of Object.values(mapMod.BASEMAPS)) {
    const card = document.createElement('div');
    card.className = 'basemap-card' + (store.state.basemap === b.id ? ' is-active' : '');
    card.textContent = b.label;
    card.addEventListener('click', async () => {
      mapMod.setBasemap(b.id);
      await store.setPreference('basemap', b.id);
      renderLayersSheet();
      updateDownloadEstimate();
    });
    el.appendChild(card);
  }
  updateDownloadEstimate();
  updateTileStats();
}

function currentBounds() {
  const b = mapMod.map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}

function updateDownloadEstimate() {
  const min = Number($('#dl-min').value);
  const max = Number($('#dl-max').value);
  const est = offline.estimate(currentBounds(), min, max);
  $('#dl-estimate').textContent = `≈ ${est.count.toLocaleString('fr-FR')} tuiles · ${offline.formatBytes(est.bytes)}`
    + (est.truncated ? ' (zone très large — réduis-la ou baisse le zoom max)' : '');
}

let activeDownload = null;

function wireLayersDownload() {
  $('#dl-min').addEventListener('change', updateDownloadEstimate);
  $('#dl-max').addEventListener('change', updateDownloadEstimate);

  $('#btn-download').addEventListener('click', () => {
    const min = Number($('#dl-min').value);
    const max = Number($('#dl-max').value);
    if (min > max) return toast('Le zoom minimum doit être inférieur ou égal au maximum.');
    $('#dl-progress').classList.remove('hidden');
    $('#btn-download').classList.add('hidden');
    $('#btn-download-abort').classList.remove('hidden');

    activeDownload = offline.downloadArea({
      bounds: currentBounds(),
      basemapId: store.state.basemap,
      minZoom: min, maxZoom: max,
      onProgress: (p) => {
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        $('#dl-bar').style.width = pct + '%';
      },
    });
    activeDownload.promise.then((res) => {
      $('#dl-progress').classList.add('hidden');
      $('#btn-download').classList.remove('hidden');
      $('#btn-download-abort').classList.add('hidden');
      toast(res.aborted ? 'Téléchargement interrompu.' : `${res.saved} tuiles enregistrées (${res.failed} échecs).`, res.aborted ? '' : 'success');
      updateTileStats();
    });
  });

  $('#btn-download-abort').addEventListener('click', () => activeDownload?.abort());

  $('#btn-clear-tiles').addEventListener('click', async () => {
    if (!confirm('Supprimer toutes les tuiles mises en cache ?')) return;
    await db.clearTiles(store.state.basemap);
    toast('Cache vidé pour ce fond de carte.');
    updateTileStats();
  });
}

async function updateTileStats() {
  const s = await db.tileStats();
  $('#tile-stats').textContent = s.count
    ? `${s.count.toLocaleString('fr-FR')} tuiles en cache · ${offline.formatBytes(s.bytes)} au total.`
    : 'Aucune tuile hors ligne enregistrée.';
}

/* ================================================================ visionneuse photo */

let currentLightboxPhoto = null;

function openLightbox(photo) {
  currentLightboxPhoto = photo;
  $('#lb-img').src = photos.blobUrl(photo.id + '_full', photo.blob);
  const parts = [];
  if (photo.lat != null) parts.push(geo.formatCoords(photo.lat, photo.lng, store.state.crs));
  if (photo.accuracy != null) parts.push(`± ${photo.accuracy.toFixed(1)} m`);
  parts.push(new Date(photo.createdAt).toLocaleString('fr-FR'));
  if (photo.author) parts.push(photo.author);
  $('#lb-meta').textContent = parts.join(' · ');
  $('#lightbox').classList.add('is-open');
}

function wireLightbox() {
  $('#lb-close').addEventListener('click', () => $('#lightbox').classList.remove('is-open'));
  $('#lb-delete').addEventListener('click', async () => {
    if (!currentLightboxPhoto) return;
    if (!confirm('Supprimer cette photo ?')) return;
    await store.deletePhoto(currentLightboxPhoto.id);
    $('#lightbox').classList.remove('is-open');
    if (editingFeatureId) renderFeaturePhotos(store.getFeature(editingFeatureId));
    toast('Photo supprimée');
  });
}

wireLayersDownload();

// ==========================
// script.js (Optimized v2.0)
// ==========================

/*
  Optimization Highlights:
  ------------------------
  ✅ Cached DOM lookups (fewer getElementById calls)
  ✅ Cached admin GeoJSON + dataset option templates
  ✅ Reuse existing overlay layers (less Leaflet overhead)
  ✅ Centralized event wiring
  ✅ Reduced redundant fitBounds and logging
  ✅ Clean separation of init + runtime logic
*/

const BACKEND = window.BACKEND_URL || 'https://hafrepo-2.onrender.com';
const DEBUG = true;
const log = (...a) => { if (DEBUG) console.log(...a); };

// Cached global state
let map, drawnItems, boundaryLayer;
let overlayLayers = [];
let overlayVisible = true;
let selectedGeometry = null;
let selectedFeatureGeoJSON = null;
let selectedFeatureName = null;
const overlayPaneName = 'overlayPane';
const adminCache = {};
const indexOptionCache = {};

// Cached DOM references
const DOM = {};

// --------------------------
// Static Configs
// --------------------------
const ADMIN_SOURCES = {
  adm1: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_1_gcs.geojson",
  adm2: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_2_gcs.geojson",
  adm3: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson"
};

const DATASET_CONFIG = {
  landcover: { label: "Select land cover", indices: [{ v: 'dynamic', t: 'Dynamic World (10m)' }], yearRange: [2015, new Date().getFullYear() - 1] },
  sentinel2: { label: "Select vegetation index", indices: [{ v: 'NDVI', t: 'NDVI' }, { v: 'NDWI', t: 'NDWI' }, { v: 'NBR', t: 'NBR' }, { v: 'NDBI', t: 'NDBI' }, { v: 'NDCI', t: 'NDCI' }], yearRange: [2015, new Date().getFullYear() - 1] },
  landsat: { label: "Select vegetation index", indices: [{ v: 'NDVI', t: 'NDVI' }, { v: 'NDWI', t: 'NDWI' }, { v: 'NBR', t: 'NBR' }, { v: 'NDBI', t: 'NDBI' }], yearRange: [1984, new Date().getFullYear() - 1] },
  modis: { label: "Select vegetation index", indices: [{ v: 'NDVI', t: 'NDVI' }, { v: 'NDWI', t: 'NDWI' }, { v: 'NBR', t: 'NBR' }, { v: 'NDBI', t: 'NDBI' }], yearRange: [2000, new Date().getFullYear() - 1] },
  climate: { label: "Select drought index", indices: [{ v: 'SPI', t: 'SPI' }, { v: 'VHI', t: 'VHI' }], yearRange: [1981, new Date().getFullYear() - 1] }
};

// --------------------------
// Map + Pane Utilities
// --------------------------
function getPropName(level) {
  return { adm1: "ADM1_EN", adm2: "ADM2_EN", adm3: "ADM3_EN" }[level] || "ADM1_EN";
}

function ensureOverlayPane() {
  if (!map) return;
  if (!map.getPane(overlayPaneName)) {
    const p = map.createPane(overlayPaneName);
    p.style.zIndex = 650;
  }
}

function setOverlayVisibility(visible) {
  overlayLayers.forEach(t => t.setOpacity?.(visible ? 1 : 0));
}

// --------------------------
// Map Initialization
// --------------------------
function initMap() {
  map = L.map('map', { center: [9.145, 40.4897], zoom: 6 });
  ensureOverlayPane();

  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  }).addTo(map);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri & contributors', maxZoom: 19
  });
  L.control.layers({ "Street": street, "Satellite": sat }, null, { collapsed: false }).addTo(map);

  // Overlay toggle UI
  const OverlayControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: () => {
      const div = L.DomUtil.create('div', 'overlay-ui');
      div.innerHTML = `<label style="display:flex;align-items:center;gap:6px;">
        <input id="overlayToggle" type="checkbox" checked /> Overlay</label>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  map.addControl(new OverlayControl());

  // Draw control
  drawnItems = new L.FeatureGroup().addTo(map);
  const drawControl = new L.Control.Draw({
    draw: { rectangle: true, polygon: false, circle: false, marker: false, polyline: false },
    edit: { featureGroup: drawnItems }
  });
  map.addControl(drawControl);

  map.on('draw:created', e => {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    selectedGeometry = e.layer.toGeoJSON().geometry;
    selectedFeatureGeoJSON = selectedFeatureName = null;
    boundaryLayer?.resetStyle?.();
    log('Area drawn');
  });
  map.on('draw:deleted', () => selectedGeometry = null);

  // Legend control
  const legendControl = L.control({ position: 'bottomleft' });
  legendControl.onAdd = function () {
    this._div = L.DomUtil.create('div', 'info legend');
    Object.assign(this._div.style, { background: 'white', padding: '10px', borderRadius: '5px', boxShadow: '0 0 10px rgba(0,0,0,0.4)', maxWidth: '300px' });
    this.update('');
    return this._div;
  };
  legendControl.update = html => this._div.innerHTML = html || '';
  legendControl.addTo(map);
  window._updateLegend = legendControl.update.bind(legendControl);

  // Overlay toggle handler
  document.addEventListener('change', ev => {
    if (ev.target?.id === 'overlayToggle') {
      overlayVisible = ev.target.checked;
      setOverlayVisibility(overlayVisible);
    }
  });
}

// --------------------------
// Overlay Management
// --------------------------
function addOverlayTile(tileUrl, opts = {}) {
  ensureOverlayPane();
  if (overlayLayers[0]) {
    overlayLayers[0].setUrl(tileUrl);
    return overlayLayers[0];
  }
  const tl = L.tileLayer(tileUrl, { ...opts, pane: overlayPaneName }).addTo(map);
  overlayLayers = [tl];
  tl.setOpacity(overlayVisible ? 1 : 0);
  return tl;
}

// --------------------------
// UI Population
// --------------------------
function populateIndexOptions(datasetKey) {
  const sel = DOM.indexSelect;
  if (!sel) return;
  if (indexOptionCache[datasetKey]) {
    sel.innerHTML = indexOptionCache[datasetKey];
    return;
  }
  const cfg = DATASET_CONFIG[datasetKey];
  const html = ['<option value="">', (cfg ? cfg.label : 'Select sub dataset'), '</option>'];
  if (cfg?.indices) cfg.indices.forEach(opt => html.push(`<option value="${opt.v}">${opt.t}</option>`));
  sel.innerHTML = html.join('');
  indexOptionCache[datasetKey] = sel.innerHTML;
}

function populateMonths(selectEl) {
  if (!selectEl) return;
  const monthNames = ['01 (Jan)', '02 (Feb)', '03 (Mar)', '04 (Apr)', '05 (May)', '06 (Jun)',
    '07 (Jul)', '08 (Aug)', '09 (Sep)', '10 (Oct)', '11 (Nov)', '12 (Dec)'];
  selectEl.innerHTML = monthNames.map((t, i) => `<option value="${i + 1}">${t}</option>`).join('');
}

function populateDays(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = Array.from({ length: 31 }, (_, d) => `<option value="${d + 1}">${d + 1}</option>`).join('');
}

function populateYearsForDataset(datasetKey) {
  const { fromYear: yFrom, toYear: yTo } = DOM;
  if (!yFrom || !yTo) return;
  const cfg = DATASET_CONFIG[datasetKey];
  const [min, max] = cfg?.yearRange || [2000, new Date().getFullYear()];
  const opts = Array.from({ length: max - min + 1 }, (_, i) => {
    const y = max - i;
    return `<option value="${y}">${y}</option>`;
  }).join('');
  yFrom.innerHTML = yTo.innerHTML = opts;
  const defaultYear = Math.min(max, new Date().getFullYear() - 1);
  yFrom.value = yTo.value = defaultYear;
}

// --------------------------
// Admin Level Handling
// --------------------------
async function loadAdmin(level, signal) {
  if (adminCache[level]) return adminCache[level];
  try {
    log('Fetching admin boundaries for', level);
    const r = await fetch(ADMIN_SOURCES[level], { signal });
    if (!r.ok) throw new Error('Failed: ' + r.status);
    const json = await r.json();
    return adminCache[level] = json;
  } catch (err) {
    console.error('loadAdmin error', err);
    return null;
  }
}

async function populateFeatureSelect(level) {
  const sel = DOM.featureSelect;
  if (!sel) return;
  sel.innerHTML = `<option value="">Loading...</option>`;
  const data = await loadAdmin(level);
  if (!data?.features) {
    sel.innerHTML = '<option value="">Select feature</option>';
    return;
  }
  const propName = getPropName(level);
  const unique = [...new Set(data.features.map(f => f.properties?.[propName]?.trim()).filter(Boolean))].sort();
  sel.innerHTML = ['<option value="">Select feature</option>', ...unique.map(n => `<option value="${n}">${n}</option>`)].join('');

  boundaryLayer && map.removeLayer(boundaryLayer);
  boundaryLayer = L.geoJSON(data, {
    style: { color: "#3388ff", weight: 1, fillOpacity: 0 },
    onEachFeature: (feature, layer) => {
      const nm = feature.properties?.[propName]?.trim() || '(no name)';
      layer.bindPopup(nm);
      layer.on('click', () => {
        boundaryLayer.resetStyle();
        layer.setStyle({ color: 'red', weight: 2, fillOpacity: 0.08 });
        selectedFeatureGeoJSON = feature;
        selectedFeatureName = nm;
        sel.value = nm;
      });
    }
  }).addTo(map);
  try { map.fitBounds(boundaryLayer.getBounds(), { maxZoom: 7 }); } catch {}
}

// --------------------------
// Request Builder
// --------------------------
function buildRequestBody() {
  const ds = DOM.datasetSelect?.value || '';
  const idx = DOM.indexSelect?.value || '';
  const fy = DOM.fromYear?.value, fm = DOM.fromMonth?.value, fd = DOM.fromDay?.value;
  const ty = DOM.toYear?.value, tm = DOM.toMonth?.value, td = DOM.toDay?.value;
  if (!ds) return alert('Choose a dataset');
  const body = {
    dataset: ds === 'ndvi' ? 'sentinel2' : ds === 'dw' ? 'landcover' : ds,
    index: idx,
    startDate: `${fy}-${fm.padStart(2, '0')}-${fd.padStart(2, '0')}`,
    endDate: `${ty}-${tm.padStart(2, '0')}-${td.padStart(2, '0')}`
  };
  if (selectedGeometry) body.geometry = selectedGeometry;
  else if (selectedFeatureGeoJSON) body.geometry = selectedFeatureGeoJSON.geometry;
  else {
    const b = map.getBounds();
    body.bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  }
  return body;
}

// --------------------------
// Legend Handling
// --------------------------
function showLegend(index, dataset, legendData = {}) {
  const updateLegend = window._updateLegend || ((html) => { document.getElementById('legend').innerHTML = html; });
  let html = `<h4 style="margin:0 0 6px;">${index || dataset}</h4>
              <div style="font-size:12px;margin-bottom:6px;">Dataset: ${dataset}</div>`;
  if (dataset === 'landcover' && legendData.unique_classes) {
    html += `<h4>Land Cover Classes (AOI)</h4>` + legendData.unique_classes.map(c =>
      `<div style="display:flex;align-items:center;margin:4px 0;">
        <span style="width:18px;height:18px;background:${c.color || '#ccc'};border:1px solid #999;margin-right:8px;"></span>${c.name}</div>`).join('');
  } else if (legendData.meta?.palette?.length && legendData.meta.min !== undefined) {
    const { palette, min, max } = legendData.meta;
    html += `<div style="height:18px;border:1px solid #ccc;margin:8px 0;background:linear-gradient(to right,${palette.join(',')})"></div>
             <div style="display:flex;justify-content:space-between;font-size:12px;">
             <span>${min.toFixed(2)}</span><span>${((min + max) / 2).toFixed(2)}</span><span>${max.toFixed(2)}</span></div>`;
  } else {
    html += `<div style="font-size:12px;color:#888;">No legend available</div>`;
  }
  updateLegend(html);
}

// --------------------------
// Backend Requests
// --------------------------
async function viewSelection() {
  const body = buildRequestBody();
  if (!body) return;
  try {
    const r = await fetch(`${BACKEND}/gee_layers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      alert(`View failed: ${(data?.detail || data?.message || r.status)}`);
      showLegend(body.index, body.dataset, data?.legend || {});
      return;
    }
    const tileUrl = data.tiles || data.mode_tiles || data.tile;
    if (!tileUrl) return alert('No tiles returned.');
    addOverlayTile(tileUrl, { attribution: data.attribution || '' });
    showLegend(body.index, body.dataset, body.dataset === 'landcover' ? { unique_classes: data.unique_classes || [] } : data.legend || {});
    if (data.bounds?.length === 4) {
      const b = data.bounds;
      map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { maxZoom: 12 });
    } else if (selectedFeatureGeoJSON || selectedGeometry) {
      map.fitBounds(L.geoJSON(selectedFeatureGeoJSON?.geometry || selectedGeometry).getBounds(), { maxZoom: 12 });
    }
    alert('Visualization added.');
  } catch (err) {
    console.error(err);
    alert('View failed: ' + err.message);
  }
}

async function downloadSelection() {
  const body = buildRequestBody();
  if (!body) return;
  try {
    const r = await fetch(`${BACKEND}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const safeName = (selectedFeatureName || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');
    const filename = `${body.dataset}_${body.index || 'all'}_${body.startDate}_to_${body.endDate}${safeName ? '_' + safeName : ''}.tif`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    alert(`Download started: ${filename}`);
  } catch (err) {
    console.error('downloadSelection error', err);
    alert('Download failed: ' + err.message);
  }
}

// --------------------------
// Initialization
// --------------------------
document.addEventListener('DOMContentLoaded', async () => {
  [
    'datasetSelect', 'indexSelect', 'fromYear', 'toYear', 'fromMonth', 'toMonth',
    'fromDay', 'toDay', 'adminLevel', 'featureSelect', 'viewSelectionBtn', 'downloadSelectionBtn'
  ].forEach(id => DOM[id] = document.getElementById(id));

  initMap();
  ensureOverlayPane();

  populateMonths(DOM.fromMonth);
  populateMonths(DOM.toMonth);
  populateDays(DOM.fromDay);
  populateDays(DOM.toDay);
  Object.assign(DOM, { fromMonth: { value: '7' }, toMonth: { value: '9' }, fromDay: { value: '1' }, toDay: { value: '30' } });

  DOM.datasetSelect?.addEventListener('change', e => {
    populateIndexOptions(e.target.value);
    populateYearsForDataset(e.target.value);
  });
  DOM.adminLevel?.addEventListener('change', e => populateFeatureSelect(e.target.value));
  DOM.featureSelect?.addEventListener('change', async e => {
    const name = e.target.value;
    if (!name || !boundaryLayer) return;
    boundaryLayer.eachLayer(layer => {
      const n = layer.feature.properties?.[getPropName(DOM.adminLevel.value)]?.trim();
      if (n === name) {
        boundaryLayer.resetStyle();
        layer.setStyle({ color: 'red', weight: 2, fillOpacity: 0.08 });
        selectedFeatureGeoJSON = layer.feature;
        selectedFeatureName = name;
        map.fitBounds(layer.getBounds(), { maxZoom: 10 });
      }
    });
  });
  DOM.viewSelectionBtn?.addEventListener('click', viewSelection);
  DOM.downloadSelectionBtn?.addEventListener('click', downloadSelection);
});

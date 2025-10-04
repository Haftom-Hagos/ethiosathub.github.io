// script.js (full updated version)


const BACKEND = (window.BACKEND_URL || 'https://hafrepo-2.onrender.com');

let map;
let drawnItems;
const overlayPaneName = 'overlayPane';
let overlayLayers = []; // tile layers returned from backend
let overlayVisible = true;

let selectedGeometry = null;
let selectedFeatureGeoJSON = null;
let selectedFeatureName = null;

let boundaryLayer = null;
const adminCache = {}; // cache for adm1/adm2/adm3

// Admin geojson sources (replace with your canonical URLs if different)
const ADMIN_SOURCES = {
  adm1: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_1_gcs.geojson",
  adm2: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_2_gcs.geojson",
  adm3: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson"
};

// Dataset config (used to populate indexSelect and year ranges)
const DATASET_CONFIG = {
  landcover: {
    label: "Select land cover",
    indices: [{ v: 'dynamic', t: 'Dynamic World (10m)' }],
    yearRange: [2015, new Date().getFullYear() - 1]
  },
  sentinel2: {
    label: "Select vegetation index",
    indices: [
      { v: 'NDVI', t: 'NDVI' },
      { v: 'NDWI', t: 'NDWI' },
      { v: 'NBR', t: 'NBR' },
      { v: 'NDBI', t: 'NDBI' },
      { v: 'NDCI', t: 'NDCI' }
    ],
    yearRange: [2015, new Date().getFullYear() - 1]
  },
  landsat: {
    label: "Select vegetation index",
    indices: [
      { v: 'NDVI', t: 'NDVI' },
      { v: 'NDWI', t: 'NDWI' },
      { v: 'NBR', t: 'NBR' },
      { v: 'NDBI', t: 'NDBI' }
    ],
    yearRange: [1984, new Date().getFullYear() - 1]
  },
  modis: {
    label: "Select vegetation index",
    indices: [
      { v: 'NDVI', t: 'NDVI' },
      { v: 'NDWI', t: 'NDWI' },
      { v: 'NBR', t: 'NBR' },
      { v: 'NDBI', t: 'NDBI' }
    ],
    yearRange: [2000, new Date().getFullYear() - 1]
  },
  climate: {
    label: "Select drought index",
    indices: [
      { v: 'SPI', t: 'SPI' },
      { v: 'VHI', t: 'VHI' }
    ],
    yearRange: [1981, new Date().getFullYear() - 1]
  }
};

// Map utilities
function getPropName(level) {
  if (level === "adm1") return "ADM1_EN";
  if (level === "adm2") return "ADM2_EN";
  if (level === "adm3") return "ADM3_EN";
  return "ADM1_EN";
}

function ensureOverlayPane() {
  if (!map) return;
  if (!map.getPane(overlayPaneName)) {
    const p = map.createPane(overlayPaneName);
    p.style.zIndex = 650; // above tile pane
  }
}

// Initialize map, basemaps, draw controls, legend, overlay toggle
function initMap() {
  map = L.map('map', { center: [9.145, 40.4897], zoom: 6 });
  ensureOverlayPane();

  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri & contributors',
    maxZoom: 19
  });

  const baseLayers = { "Street": street, "Satellite": sat };
  L.control.layers(baseLayers, null, { collapsed: false }).addTo(map);

  // small overlay control (topright), placed under the basemap control visually
  const OverlayControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const div = L.DomUtil.create('div', 'overlay-ui');
      div.style.background = 'white';
      div.style.padding = '6px';
      div.style.marginTop = '6px';
      div.style.borderRadius = '4px';
      div.style.boxShadow = '0 0 6px rgba(0,0,0,0.2)';
      div.innerHTML = `<label style="display:flex;align-items:center;gap:6px;"><input id="overlayToggle" type="checkbox" checked /> Overlay</label>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  map.addControl(new OverlayControl());

  // Feature drawing
  drawnItems = new L.FeatureGroup().addTo(map);
  const drawControl = new L.Control.Draw({
    draw: { polygon: false, circle: false, marker: false, polyline: false, rectangle: true },
    edit: { featureGroup: drawnItems }
  });
  map.addControl(drawControl);

  map.on('draw:created', e => {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    selectedGeometry = e.layer.toGeoJSON().geometry;
    selectedFeatureGeoJSON = null;
    selectedFeatureName = null;
    if (boundaryLayer) boundaryLayer.resetStyle();
    console.log('Area drawn');
  });

  map.on('draw:deleted', () => {
    selectedGeometry = null;
  });

  // Legend control with white background
  const legendControl = L.control({ position: 'bottomleft' });
  legendControl.onAdd = function () {
    this._div = L.DomUtil.create('div', 'info legend');
    this._div.style.backgroundColor = 'white';
    this._div.style.padding = '10px';
    this._div.style.borderRadius = '5px';
    this._div.style.boxShadow = '0 0 10px rgba(0,0,0,0.4)';
    this._div.style.maxWidth = '300px';
    this.update('');
    return this._div;
  };
  legendControl.update = function (html) {
    this._div.innerHTML = html || '';
  };
  legendControl.addTo(map);

  // expose a helper to update legend from other functions
  window._updateLegend = legendControl.update.bind(legendControl);

  // overlay toggle wiring (listen for DOM changes on overlayToggle)
  document.addEventListener('change', (ev) => {
    if (ev.target && ev.target.id === 'overlayToggle') {
      overlayVisible = ev.target.checked;
      setOverlayVisibility(overlayVisible);
    }
  });
}

// Handle overlay visibility without removing layers
function setOverlayVisibility(visible) {
  overlayLayers.forEach(t => {
    try { t.setOpacity(visible ? 1 : 0); } catch (e) {}
  });
}

// Add overlay tile to overlay pane and remember it
function addOverlayTile(tileUrl, opts = {}) {
  ensureOverlayPane();
  const options = Object.assign({}, opts, { pane: overlayPaneName });
  const tl = L.tileLayer(tileUrl, options).addTo(map);
  overlayLayers.push(tl);
  try { tl.setOpacity(overlayVisible ? 1 : 0); } catch (e) {}
  return tl;
}

// Populate indexSelect based on DATASET_CONFIG
function populateIndexOptions(datasetKey) {
  const sel = document.getElementById('indexSelect');
  if (!sel) return;
  sel.innerHTML = '';
  if (!datasetKey) {
    sel.innerHTML = '<option value="">Select sub dataset</option>';
    return;
  }
  const cfg = DATASET_CONFIG[datasetKey];
  const defaultText = cfg ? cfg.label : 'Select sub dataset';
  sel.innerHTML = `<option value="">${defaultText}</option>`;
  if (cfg && Array.isArray(cfg.indices)) {
    cfg.indices.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.t;
      sel.appendChild(o);
    });
  }
}

// Populate months/days/years controls
function populateMonths(selectEl) {
  const monthNames = ['01 (Jan)', '02 (Feb)', '03 (Mar)', '04 (Apr)', '05 (May)', '06 (Jun)',
    '07 (Jul)', '08 (Aug)', '09 (Sep)', '10 (Oct)', '11 (Nov)', '12 (Dec)'];
  selectEl.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = monthNames[m - 1];
    selectEl.appendChild(opt);
  }
}

function populateDays(selectEl) {
  selectEl.innerHTML = '';
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement('option');
    opt.value = String(d);
    opt.textContent = String(d);
    selectEl.appendChild(opt);
  }
}

function populateYearsForDataset(datasetKey) {
  const yFrom = document.getElementById('fromYear');
  const yTo = document.getElementById('toYear');
  if (!yFrom || !yTo) return;
  const cfg = DATASET_CONFIG[datasetKey];
  const range = cfg && cfg.yearRange ? cfg.yearRange : [2000, new Date().getFullYear()];
  const maxYear = Math.max(range[1], new Date().getFullYear());
  const minYear = range[0];
  yFrom.innerHTML = '';
  yTo.innerHTML = '';
  for (let y = maxYear; y >= minYear; y--) {
    const o1 = document.createElement('option'); o1.value = String(y); o1.textContent = String(y);
    const o2 = o1.cloneNode(true);
    yFrom.appendChild(o1);
    yTo.appendChild(o2);
  }
  // sensible defaults
  const defaultYear = Math.min(maxYear, new Date().getFullYear() - 1);
  yFrom.value = String(defaultYear);
  yTo.value = String(defaultYear);
}

// Load admin GeoJSON for a level, with caching
async function loadAdmin(level) {
  if (!ADMIN_SOURCES[level]) return null;
  if (adminCache[level]) return adminCache[level];
  try {
    console.log('Fetching admin boundaries for', level, ADMIN_SOURCES[level]);
    const r = await fetch(ADMIN_SOURCES[level]);
    if (!r.ok) throw new Error('Failed to fetch admin data: ' + r.status);
    const json = await r.json();
    adminCache[level] = json;
    return json;
  } catch (err) {
    console.error('loadAdmin error', err);
    return null;
  }
}

// Populate the featureSelect options based on admin level and draw boundaryLayer
async function populateFeatureSelect(level) {
  const sel = document.getElementById('featureSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading...</option>';
  const data = await loadAdmin(level);
  if (!data || !data.features) {
    sel.innerHTML = '<option value="">Select feature</option>';
    return;
  }
  const propName = getPropName(level);
  // collect unique names
  const names = data.features.map(f => String((f.properties && f.properties[propName]) || '').trim()).filter(n => n);
  const unique = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Select feature</option>';
  unique.forEach(n => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  });

  // Add/replace boundaryLayer for this level (clickable)
  try {
    if (boundaryLayer) {
      map.removeLayer(boundaryLayer);
      boundaryLayer = null;
    }
  } catch (e) {}
  boundaryLayer = L.geoJSON(data, {
    style: { color: "#3388ff", weight: 1, fillOpacity: 0 },
    onEachFeature: (feature, layer) => {
      const nm = (feature.properties && feature.properties[propName]) ? String(feature.properties[propName]).trim() : '(no name)';
      layer.bindPopup(nm);
      layer.on('click', () => {
        try { boundaryLayer.resetStyle(); } catch (e) {}
        try { layer.setStyle({ color: 'red', weight: 2, fillOpacity: 0.08 }); } catch (e) {}
        selectedFeatureGeoJSON = feature;
        selectedFeatureName = nm;
        // set select box value (if present)
        const selElem = document.getElementById('featureSelect');
        if (selElem) selElem.value = nm;
      });
    }
  }).addTo(map);

  // Zoom to layer bounds (don't over-zoom)
  try {
    if (boundaryLayer && boundaryLayer.getBounds && boundaryLayer.getBounds().isValid()) {
      map.fitBounds(boundaryLayer.getBounds(), { maxZoom: 7 });
    }
  } catch (e) {
    console.warn('fitBounds failed for boundaryLayer', e);
  }
}

// Build request body for backend, including geometry or bbox
function buildRequestBody() {
  const dataset = document.getElementById('datasetSelect') ? document.getElementById('datasetSelect').value : '';
  const index = document.getElementById('indexSelect') ? document.getElementById('indexSelect').value : '';
  const fy = document.getElementById('fromYear') ? document.getElementById('fromYear').value : '';
  const fm = document.getElementById('fromMonth') ? document.getElementById('fromMonth').value : '';
  const fd = document.getElementById('fromDay') ? document.getElementById('fromDay').value : '';
  const ty = document.getElementById('toYear') ? document.getElementById('toYear').value : '';
  const tm = document.getElementById('toMonth') ? document.getElementById('toMonth').value : '';
  const td = document.getElementById('toDay') ? document.getElementById('toDay').value : '';
  if (!dataset) { alert('Choose a dataset'); return null; }
  const startDate = `${fy}-${String(fm).padStart(2, '0')}-${String(fd).padStart(2, '0')}`;
  const endDate = `${ty}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}`;

  // Map UI dataset names to backend dataset keys if needed (example)
  let backendDataset = dataset;
  if (dataset === 'ndvi') backendDataset = 'sentinel2';
  if (dataset === 'dw') backendDataset = 'landcover';

  const body = { dataset: backendDataset, index, startDate, endDate };

  if (selectedGeometry) body.geometry = selectedGeometry;
  else if (selectedFeatureGeoJSON) body.geometry = selectedFeatureGeoJSON.geometry;
  else {
    const b = map.getBounds();
    body.bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  }
  return body;
}

// Legend rendering: dynamic colors from backend
function showLegend(index, dataset, legendData = {}) {
  if (!window._updateLegend) {
    const el = document.getElementById('legend');
    if (!el) {
      console.error('Legend element not found');
      return;
    }
    window._updateLegend = (html) => { el.innerHTML = html; };
  }

  let html = `<h4 style="margin:0 0 6px 0;">${index || dataset}</h4>`;
  html += `<div style="font-size:12px;margin-bottom:6px;">Dataset: ${dataset}</div>`;

  // Landcover: discrete classes
  if (dataset === 'landcover' && legendData.unique_classes && Array.isArray(legendData.unique_classes)) {
    const uniqueClasses = legendData.unique_classes.map((c, i) => ({
      id: c.id || i,
      name: c.name || `Class ${i + 1}`,
      color: c.color || '#ccc'
    }));
    html += `<h4 style="margin:0 0 6px 0;">Land Cover Classes (AOI)</h4>`;
    uniqueClasses.forEach(c => {
      html += `<div style="display:flex;align-items:center;margin:4px 0;">
                 <span style="width:18px;height:18px;background:${c.color};display:inline-block;margin-right:8px;border:1px solid #999;"></span>${c.name}
               </div>`;
    });
  // Continuous indices: colorbar
  } else if (legendData.meta && Array.isArray(legendData.meta.palette) && legendData.meta.palette.length > 0 && legendData.meta.min !== undefined && legendData.meta.max !== undefined) {
    const gradient = legendData.meta.palette.join(',');
    html += `
      <div style="height:18px;border-radius:3px;overflow:hidden;border:1px solid #ccc;margin:8px 0;">
        <div style="width:100%;height:100%;background:linear-gradient(to right,${gradient})"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span>${Number(legendData.meta.min).toFixed(2)}</span>
        <span>${Number((legendData.meta.min + legendData.meta.max) / 2).toFixed(2)}</span>
        <span>${Number(legendData.meta.max).toFixed(2)}</span>
      </div>
    `;
  } else {
    // Fallback for debugging
    console.warn('No valid legend data provided:', { legendData });
    html += `<div style="font-size:12px;color:#888;">
               No legend available. Check backend response for unique_classes or legend.meta.
             </div>`;
  }

  window._updateLegend(html);
}

async function viewSelection() {
  const body = buildRequestBody();
  if (!body) return;
  try {
    const r = await fetch(`${BACKEND}/gee_layers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    let data = null;
    try {
      data = await r.json();
      console.log('Backend response:', data); // Log full response for debugging
    } catch (e) {
      console.error('Failed to parse backend response:', e);
      data = null;
    }

    if (!r.ok) {
      const msg = (data && (data.detail || data.message)) || `Status ${r.status}`;
      console.error('Backend returned error:', msg);
      if (String(msg).toLowerCase().includes('no modis lst')) {
        alert("VHI computation failed: No MODIS LST (MOD11A2) images found for the selected period/area. Try expanding date range or selecting a larger AOI.");
      } else {
        alert("View failed: " + msg);
      }
      // Update legend even on error if data is available
      if (data) showLegend(body.index, body.dataset, body.dataset === 'landcover' ? data : data.legend || {});
      //if (data && data.legend) showLegend(body.index, body.dataset, data.legend);
      return;
    }

    const tileUrl = data && (data.tiles || data.mode_tiles || data.tile);
    if (!tileUrl) {
      console.error('No tiles in response:', data);
      alert("No tiles returned by backend.");
      showLegend(body.index, body.dataset, body.dataset === 'landcover' ? data : data.legend || {});
      //if (data && data.legend) showLegend(body.index, body.dataset, data.legend);
      return;
    }

    // Clear existing overlay layers
    overlayLayers.forEach(layer => {
      try { map.removeLayer(layer); } catch (e) {}
    });
    overlayLayers = [];

    addOverlayTile(tileUrl, { attribution: data.attribution || '' });
    showLegend(body.index, body.dataset, data.legend || {});

    // Fit to bounds if backend provided them
    if (data && data.bounds && Array.isArray(data.bounds) && data.bounds.length === 4) {
      try {
        const b = data.bounds; // [west, south, east, north]
        map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { maxZoom: 12 });
      } catch (e) { console.warn('fitBounds from backend bounds failed', e); }
    } else {
      try {
        if (selectedFeatureGeoJSON) {
          const gj = L.geoJSON(selectedFeatureGeoJSON.geometry);
          map.fitBounds(gj.getBounds(), { maxZoom: 12 });
        } else if (selectedGeometry) {
          const gj = L.geoJSON(selectedGeometry);
          map.fitBounds(gj.getBounds(), { maxZoom: 12 });
        }
      } catch (e) { /* ignore */ }
    }

    alert('Visualization added.');
  } catch (err) {
    console.error('viewSelection error', err);
    alert('View failed: ' + (err.message || err));
  }
}

// DOWNLOAD: request /download and save .tif (append selected feature name)
async function downloadSelection() {
  const body = buildRequestBody();
  if (!body) return;
  try {
    const r = await fetch(`${BACKEND}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(txt || `Download failed [${r.status}]`);
    }
    const blob = await r.blob();
    // filename: dataset_index_start_to_end_feature.tif
    let filename = `${body.dataset}_${body.index || 'all'}_${body.startDate}_to_${body.endDate}`;
    if (selectedFeatureName) {
      const safe = selectedFeatureName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');
      filename += `_${safe}`;
    }
    filename += '.tif';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); document.body.removeChild(link); }, 1500);
    alert('Download started: ' + filename);
  } catch (err) {
    console.error('downloadSelection error', err);
    alert('Download failed: ' + (err.message || err));
  }
}

// --- Initialization & wiring
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initMap();
    ensureOverlayPane();

    // populate months & days
    const fromMonth = document.getElementById('fromMonth');
    const toMonth = document.getElementById('toMonth');
    const fromDay = document.getElementById('fromDay');
    const toDay = document.getElementById('toDay');
    if (fromMonth && toMonth && fromDay && toDay) {
      populateMonths(fromMonth);
      populateMonths(toMonth);
      populateDays(fromDay);
      populateDays(toDay);
      // sensible defaults
      fromMonth.value = '7';
      toMonth.value = '9';
      fromDay.value = '1';
      toDay.value = '30';
    }

     // dataset select wiring
    const ds = document.getElementById('datasetSelect');
    if (ds) {
      ds.addEventListener('change', (e) => {
        const value = e.target.value;
        populateIndexOptions(value);
        populateYearsForDataset(value);
      });
    }

    // admin level wiring
    const adminLevel = document.getElementById('adminLevel');
    if (adminLevel) {
      // Add placeholder option if it doesn't exist
      if (!Array.from(adminLevel.options).some(opt => opt.value === '')) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select admin level';
        adminLevel.insertBefore(placeholder, adminLevel.firstChild);
      }
      adminLevel.value = '';
      adminLevel.addEventListener('change', async (e) => {
        const lvl = e.target.value;
        const sel = document.getElementById('featureSelect');
        if (sel) sel.innerHTML = `<option value="">Loading ${lvl}...</option>`;
        await populateFeatureSelect(lvl);
      });
    }

    // feature select wiring (highlight on select)
    const featureSel = document.getElementById('featureSelect');
    if (featureSel) {
      featureSel.addEventListener('change', async (e) => {
        const name = (e.target.value || '').trim();
        selectedFeatureName = name || null;
        if (!name) {
          if (boundaryLayer) boundaryLayer.resetStyle();
          selectedFeatureGeoJSON = null;
          return;
        }
        const level = document.getElementById('adminLevel') ? document.getElementById('adminLevel').value || '' : '';
        const data = await loadAdmin(level);
        if (!data) return;
        const prop = getPropName(level);
        const feat = data.features.find(f => {
          const p = f.properties && f.properties[prop] ? String(f.properties[prop]).trim() : '';
          return p === name;
        });
        if (feat) {
          selectedFeatureGeoJSON = feat;
          if (boundaryLayer) {
            boundaryLayer.resetStyle();
            boundaryLayer.eachLayer(l => {
              if (l.feature === feat) {
                try { l.setStyle({ color: 'red', weight: 2, fillOpacity: 0.00 }); } catch (e) {}
                try { map.fitBounds(l.getBounds(), { maxZoom: 10 }); } catch (e) {}
              }
            });
          }
        } else {
          console.warn('Selected feature not found in loaded admin data:', name);
        }
      });
    }

    // view & download buttons
    const viewBtn = document.getElementById('viewSelectionBtn');
    if (viewBtn) viewBtn.addEventListener('click', viewSelection);
    const downloadBtn = document.getElementById('downloadSelectionBtn');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadSelection);

    // initial dataset & years population:
    const initialDataset = (ds && ds.value) ? ds.value : '';
    if (ds && !ds.value) ds.value = initialDataset;

    // Only populate options if a dataset is selected
    if (initialDataset) {
      populateIndexOptions(initialDataset);
      populateYearsForDataset(initialDataset);
    } else {
      indexSelect.innerHTML = '<option value="">Select sub dataset</option>';
    }

    // initial admin level feature load: default to HTML selection 
    const initialAdmin = (adminLevel && adminLevel.value) ? adminLevel.value : '';
    await populateFeatureSelect(initialAdmin);
    console.log('script.js initialized (admin level:', initialAdmin || 'none', ', dataset:', initialDataset, ')');
  } catch (err) {
    console.error('Initialization failed', err);
  }
});





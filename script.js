// script.js - CLEAN, aligned with the HTML above
// - dataset -> index population
// - adminLevel drives featureSelect (ADM1_EN/ADM2_EN/ADM3_EN)
// - time selects populated
// - overlay toggle added under layer control
// - overlay tiles added to an overlay pane so they stay above basemaps
// - view/download calling backend endpoints (gee_layers / download)

const BACKEND = (window.BACKEND_URL || 'https://hafrepo-2.onrender.com');

let map, drawnItems, overlayPaneName = 'overlayPane', overlayLayers = [], overlayVisible = true;
let selectedGeometry = null, selectedFeatureGeoJSON = null, selectedFeatureName = null;
let boundaryLayer = null;

// Admin geojson sources (public raw URLs)
const ADMIN_SOURCES = {
  adm1: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_1_gcs.geojson",
  adm2: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_2_gcs.geojson",
  adm3: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson"
};
const adminCache = {}; // cache fetched features per level

// Dataset config to populate indexSelect & year ranges
const DATASET_CONFIG = {
  landcover: { label: "Land cover", indices: [{v:'dynamic', t:'Dynamic World (10m)'}], yearRange: [2015, new Date().getFullYear()-1] },
  sentinel2: { label: "Sentinel-2", indices:[{v:'NDVI', t:'NDVI'},{v:'NDWI', t:'NDWI'},{v:'NBR',t:'NBR'},{v:'NDBI',t:'NDBI'},{v:'NDCI',t:'NDCI'}], yearRange:[2015,new Date().getFullYear()-1] },
  landsat: { label: "Landsat", indices:[{v:'NDVI',t:'NDVI'},{v:'NDWI',t:'NDWI'},{v:'NBR',t:'NBR'},{v:'NDBI',t:'NDBI'}], yearRange:[1984,new Date().getFullYear()-1] },
  modis: { label:"MODIS", indices:[{v:'NDVI',t:'NDVI'},{v:'NDWI',t:'NDWI'},{v:'NBR',t:'NBR'},{v:'NDBI',t:'NDBI'},{v:'NDCI',t:'NDCI'}], yearRange:[2000,new Date().getFullYear()-1] },
  climate: { label:"Climate", indices:[{v:'SPI',t:'SPI'},{v:'VHI',t:'VHI'}], yearRange:[1981,new Date().getFullYear()-1] }
};

// Utility: property name for admin level
function getPropName(level) {
  if (level === "adm1") return "ADM1_EN";
  if (level === "adm2") return "ADM2_EN";
  if (level === "adm3") return "ADM3_EN";
  return "ADM1_EN";
}

// Create overlay pane so overlay tile-layers always render above base maps
function ensureOverlayPane() {
  if (!map) return;
  if (!map.getPane(overlayPaneName)) {
    const p = map.createPane(overlayPaneName);
    p.style.zIndex = 650; // above tile pane
  }
}

// Initialize Leaflet map, base layers, draw control, legend control and overlay toggle
function initMap() {
  map = L.map('map', { center: [9.145, 40.4897], zoom: 6 });
  ensureOverlayPane();

  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' });

  const baseLayers = { "Street": street, "Satellite": sat };
  L.control.layers(baseLayers, {}, { collapsed: false }).addTo(map);

  // small overlay toggle control (placed under basemap control visually)
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
      // prevent map interactions when cursor is over control
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  map.addControl(new OverlayControl());

  // overlayLayers array will hold tile layers produced from backend; we keep them in the overlay pane
  overlayLayers = [];

  // Draw control (rectangle only)
  drawnItems = new L.FeatureGroup().addTo(map);
  const drawControl = new L.Control.Draw({
    draw: { polygon:false, polyline:false, circle:false, marker:false, rectangle:true },
    edit: { featureGroup: drawnItems }
  });
  map.addControl(drawControl);

  map.on('draw:created', (e) => {
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

  // Legend control placed bottomleft; white background
  const legendControl = L.control({ position: 'bottomleft' });
  legendControl.onAdd = function () {
    this._div = L.DomUtil.create('div', 'legend-box');
    this._div.style.background = 'white';
    this._div.style.padding = '8px';
    this._div.style.borderRadius = '6px';
    this._div.style.boxShadow = '0 0 8px rgba(0,0,0,0.2)';
    this._div.style.maxWidth = '260px';
    this.update('');
    return this._div;
  };
  legendControl.update = function (html) {
    this._div.innerHTML = html || '';
  };
  legendControl.addTo(map);

  // expose a small helper to update legend from other functions
  window._updateLegend = legendControl.update.bind(legendControl);

  // overlay toggle wiring (DOM exists because control added)
  document.addEventListener('change', (ev) => {
    if (ev.target && ev.target.id === 'overlayToggle') {
      overlayVisible = ev.target.checked;
      setOverlayVisibility(overlayVisible);
    }
  });
}

// set opacity to show/hide overlays without removing them (so we don't lose them)
function setOverlayVisibility(visible) {
  overlayLayers.forEach(t => {
    try { t.setOpacity(visible ? 0.85 : 0); } catch (e) { }
  });
}

// Add a tile URL returned by backend to overlay pane and remember it
function addOverlayTile(tileUrl, opts = {}) {
  ensureOverlayPane();
  const options = Object.assign({}, opts, { pane: overlayPaneName });
  const tl = L.tileLayer(tileUrl, options).addTo(map); // add directly to map
  overlayLayers.push(tl);
  // ensure current visibility state is respected
  try { tl.setOpacity(overlayVisible ? 0.85 : 0); } catch (e) { }
  return tl;
}

// Fill indexSelect based on dataset
function populateIndexOptions(datasetKey) {
  const sel = document.getElementById('indexSelect');
  sel.innerHTML = '';
  if (!datasetKey) {
    sel.innerHTML = '<option value="">Select sub dataset</option>';
    return;
  }
  const cfg = DATASET_CONFIG[datasetKey];
  const defaultText = cfg ? cfg.label : 'Select sub dataset';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = defaultText;
  sel.appendChild(first);
  if (cfg && Array.isArray(cfg.indices)) {
    cfg.indices.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.t;
      sel.appendChild(o);
    });
  }
}

// Populate time selects (months/days/years)
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
  let range = DATASET_CONFIG[datasetKey] && DATASET_CONFIG[datasetKey].yearRange ? DATASET_CONFIG[datasetKey].yearRange : [2000, new Date().getFullYear()];
  // make sure max is this year at latest
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

// Load admin geojson for a level and cache it
async function loadAdmin(level) {
  if (!ADMIN_SOURCES[level]) return null;
  if (adminCache[level]) return adminCache[level];
  try {
    const r = await fetch(ADMIN_SOURCES[level]);
    if (!r.ok) throw new Error('Failed to fetch admin data');
    const json = await r.json();
    adminCache[level] = json;
    return json;
  } catch (err) {
    console.error('loadAdmin error', err);
    return null;
  }
}

// Populate the featureSelect options based on selected admin level
async function populateFeatureSelect(level) {
  const sel = document.getElementById('featureSelect');
  sel.innerHTML = '<option value="">Loading...</option>';
  const data = await loadAdmin(level);
  if (!data || !data.features) {
    sel.innerHTML = '<option value="">No features</option>';
    return;
  }
  const propName = getPropName(level);
  // collect names uniquely and sorted
  const names = data.features.map(f => f.properties[propName]).filter(Boolean);
  const unique = Array.from(new Set(names)).sort((a,b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Select feature</option>';
  unique.forEach(n => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  });

  // create or update boundary layer for click selection & highlighting
  try {
    if (boundaryLayer) {
      map.removeLayer(boundaryLayer);
      boundaryLayer = null;
    }
  } catch (e) {}
  boundaryLayer = L.geoJSON(data, {
    style: { color: "#3388ff", weight: 1, fillOpacity: 0 },
    onEachFeature: function (feature, layer) {
      const nm = feature.properties[propName] || '(no name)';
      layer.bindPopup(nm);
      layer.on('click', () => {
        boundaryLayer.resetStyle();
        layer.setStyle({ color:'red', weight:2, fillOpacity:0.08 });
        selectedFeatureGeoJSON = feature;
        selectedFeatureName = nm;
        // update select UI to the clicked feature if present
        const selElem = document.getElementById('featureSelect');
        try { selElem.value = nm; } catch(e) {}
      });
    }
  }).addTo(map);
}

// Build request body for backend
function buildRequestBody() {
  const dataset = document.getElementById('datasetSelect').value;
  const index = document.getElementById('indexSelect').value || '';
  const fy = document.getElementById('fromYear').value;
  const fm = document.getElementById('fromMonth').value;
  const fd = document.getElementById('fromDay').value;
  const ty = document.getElementById('toYear').value;
  const tm = document.getElementById('toMonth').value;
  const td = document.getElementById('toDay').value;
  if (!dataset) { alert('Choose a dataset'); return null; }
  const startDate = `${fy}-${String(fm).padStart(2,'0')}-${String(fd).padStart(2,'0')}`;
  const endDate = `${ty}-${String(tm).padStart(2,'0')}-${String(td).padStart(2,'0')}`;
  const body = { dataset: dataset, index: index, startDate, endDate };

  if (selectedGeometry) body.geometry = selectedGeometry;
  else if (selectedFeatureGeoJSON) body.geometry = selectedFeatureGeoJSON.geometry;
  else {
    const b = map.getBounds();
    body.bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  }
  return body;
}

// Show simple legend: landcover (filtered classes) or continuous colorbar
function showLegend(index, dataset, uniqueClasses = null, meta = {}) {
  let html = `<h4 style="margin:0 0 6px 0;">${index || dataset}</h4><div style="font-size:12px;margin-bottom:6px;">Dataset: ${dataset}</div>`;
  if (dataset === 'landcover' && Array.isArray(uniqueClasses)) {
    // Dynamic World mapping (id->name/color)
    const all = [
      {id:0,name:'water',color:'#419bdf'},{id:1,name:'trees',color:'#397d49'},{id:2,name:'grass',color:'#88b053'},
      {id:3,name:'flooded_vegetation',color:'#7a87c6'},{id:4,name:'crops',color:'#e49635'},{id:5,name:'shrub_and_scrub',color:'#dfc35a'},
      {id:6,name:'built',color:'#c4281b'},{id:7,name:'bare',color:'#a59b8f'},{id:8,name:'snow_and_ice',color:'#b39fe1'}
    ];
    let found = false;
    uniqueClasses.forEach(c => {
      // accept either id or name
      let entry = typeof c === 'number' ? all.find(a=>a.id===c) : all.find(a=>a.name===String(c));
      if (entry) {
        html += `<div style="display:flex;align-items:center;margin:4px 0;"><span style="width:18px;height:18px;background:${entry.color};display:inline-block;margin-right:8px;border:1px solid #999;"></span>${entry.name}</div>`;
        found = true;
      } else {
        html += `<div style="display:flex;align-items:center;margin:4px 0;"><span style="width:18px;height:18px;background:#ccc;display:inline-block;margin-right:8px;border:1px solid #999;"></span>${c}</div>`;
        found = true;
      }
    });
    if (!found) html += `<div style="font-size:12px;">No classes in AOI</div>`;
  } else if (['NDVI','NDWI','NBR','NDBI','NDCI','SPI','VHI'].includes(index)) {
    // continuous colorbar (red->yellow->green)
    let min = (meta && typeof meta.min !== 'undefined') ? meta.min : (index === 'VHI' ? 0 : -1);
    let max = (meta && typeof meta.max !== 'undefined') ? meta.max : (index === 'VHI' ? 100 : 1);
    if (index === 'SPI' && typeof meta.min === 'undefined') { min = -3; max = 3; }
    html += `<div style="height:18px;border-radius:3px;overflow:hidden;border:1px solid #ccc;margin:8px 0;">
               <div style="width:100%;height:100%;background:linear-gradient(to right,#d73027,#fee08b,#1a9850)"></div>
             </div>
             <div style="display:flex;justify-content:space-between;font-size:12px;">
               <span>${Number(min).toFixed(2)}</span><span>${Number((min+max)/2).toFixed(2)}</span><span>${Number(max).toFixed(2)}</span>
             </div>`;
  } else {
    html += `<div style="font-size:12px;">No legend available</div>`;
  }

  // update HTML legend (we also expose _updateLegend earlier)
  if (window._updateLegend) window._updateLegend(html);
  else {
    const el = document.getElementById('legend');
    if (el) el.innerHTML = html;
  }
}

// VIEW selection: call backend /gee_layers and add tile overlay
async function viewSelection() {
  const body = buildRequestBody();
  if (!body) return;
  try {
    const r = await fetch(`${BACKEND}/gee_layers`, {
      method: "POST",
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(()=>null);
    if (!r.ok) {
      const msg = (data && (data.detail || data.message)) || 'Backend error';
      if (msg.toLowerCase().includes('no modis lst')) {
        alert("VHI failed: No MODIS LST (MOD11A2) for the selected period/area — try a broader date range or larger AOI.");
      } else {
        alert("View failed: " + msg);
      }
      // still update legend when backend returns unique_classes/meta
      if (data) showLegend(body.index, body.dataset, data.unique_classes, data.meta || {});
      return;
    }
    // success
    // remove/hide previous overlays? We keep them but add new; user can toggle by overlay checkbox
    const tileUrl = (data && (data.tiles || data.mode_tiles || data.tile)) || null;
    if (!tileUrl) {
      alert("No tiles returned from backend.");
      // update legend if possible
      if (data) showLegend(body.index, body.dataset, data.unique_classes, data.meta || {});
      return;
    }
    addOverlayTile(tileUrl, { attribution: data.attribution || '', opacity: 0.85 });
    // update legend with any meta or unique_classes
    showLegend(body.index, body.dataset, data.unique_classes, data.meta || {});
    // If backend provided bounds prefer them
    if (data && data.bounds && Array.isArray(data.bounds) && data.bounds.length === 4) {
      try {
        const b = data.bounds; // [west, south, east, north]
        map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { maxZoom: 12 });
      } catch (e) {}
    } else {
      // else fit to selected feature or geometry
      try {
        if (selectedFeatureGeoJSON) {
          map.fitBounds(L.geoJSON(selectedFeatureGeoJSON.geometry).getBounds(), { maxZoom: 12 });
        } else if (selectedGeometry) {
          map.fitBounds(L.geoJSON(selectedGeometry).getBounds(), { maxZoom: 12 });
        }
      } catch (e) {}
    }
    alert('Visualization added.');
  } catch (err) {
    console.error('viewSelection err', err);
    alert('View failed: ' + (err.message || err));
  }
}

// Download: POST to /download and save file; include selectedFeatureName in filename
async function downloadSelection() {
  const body = buildRequestBody();
  if (!body) return;
  try {
    const r = await fetch(`${BACKEND}/download`, {
      method: "POST",
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(txt || 'Download failed');
    }
    const blob = await r.blob();
    let name = `${body.dataset}_${body.index || 'all'}_${body.startDate}_to_${body.endDate}`;
    if (selectedFeatureName) {
      // sanitize
      const safe = selectedFeatureName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');
      name += `_${safe}`;
    }
    name += '.tif';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=>{ URL.revokeObjectURL(link.href); document.body.removeChild(link); }, 1500);
    alert('Download started: ' + name);
  } catch (err) {
    console.error('download err', err);
    alert('Download failed: ' + (err.message || err));
  }
}

// --- initialization & event wiring
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // map and controls
    initMap();

    // populate months/days and initial years
    populateMonths(document.getElementById('fromMonth'));
    populateMonths(document.getElementById('toMonth'));
    populateDays(document.getElementById('fromDay'));
    populateDays(document.getElementById('toDay'));

    // dataset -> index options, and set years for dataset
    const ds = document.getElementById('datasetSelect');
    ds.addEventListener('change', (e) => {
      const value = e.target.value;
      populateIndexOptions(value);
      populateYearsForDataset(value);
    });

    // admin level -> feature list
    const adminLevel = document.getElementById('adminLevel');
    adminLevel.addEventListener('change', async (e) => {
      const level = e.target.value || 'adm3';
      // update label of featureSelect (for UX) - we can't change the <select> placeholder text easily,
      // but we can set the first option accordingly:
      const sel = document.getElementById('featureSelect');
      sel.innerHTML = `<option value="">Loading ${level}...</option>`;
      await populateFeatureSelect(level);
    });

    // when user picks a feature from select, highlight appropriate boundary (we also set by clicking layer)
    const featureSel = document.getElementById('featureSelect');
    featureSel.addEventListener('change', async (e) => {
      const name = e.target.value;
      selectedFeatureName = name || null;
      if (!name) {
        if (boundaryLayer) boundaryLayer.resetStyle();
        selectedFeatureGeoJSON = null;
        return;
      }
      // ensure the currently loaded admin level data has this feature
      const level = document.getElementById('adminLevel').value || 'adm3';
      const data = await loadAdmin(level);
      if (!data) return;
      const prop = getPropName(level);
      const feat = data.features.find(f => (f.properties[prop] && f.properties[prop] === name));
      if (feat) {
        selectedFeatureGeoJSON = feat;
        // highlight
        if (boundaryLayer) {
          boundaryLayer.resetStyle();
          // find the layer inside boundaryLayer that matches the feature and style it
          boundaryLayer.eachLayer(l => {
            if (l.feature === feat) {
              try { l.setStyle({ color:'red', weight:2, fillOpacity:0.08 }); } catch(e){}
              try { map.fitBounds(l.getBounds(), { maxZoom: 10 }); } catch(e) {}
            }
          });
        }
      } else {
        console.warn('Feature not found in loaded admin collection', name);
      }
    });

    // view & download buttons
    document.getElementById('viewSelectionBtn').addEventListener('click', viewSelection);
    document.getElementById('downloadSelectionBtn').addEventListener('click', downloadSelection);

    // initial defaults: set dataset to sentinel2 (or keep empty)
    // populate index and years based on default dataset
    const initialDataset = ds.value || 'sentinel2';
    if (!ds.value) ds.value = initialDataset;
    populateIndexOptions(initialDataset);
    populateYearsForDataset(initialDataset);

    // populate admin level features initially (adm3)
    await populateFeatureSelect(document.getElementById('adminLevel').value || 'adm3');

    console.log('UI initialized');
  } catch (err) {
    console.error('init error', err);
  }
});

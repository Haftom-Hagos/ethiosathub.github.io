// script.js (rewritten with fixes)

const BACKEND = (window.BACKEND_URL || 'https://hafrepo-2.onrender.com');

let map, drawnItems, overlayGroup, currentTileLayer, overlayCheckbox;
let selectedGeometry = null;
let selectedFeatureGeoJSON = null;

// Dataset config
const DATASET_CONFIG = {
  landcover: {
    label: "Land cover",
    indicesLabel: "Select land cover",
    indices: [{ v: 'dynamic_world', t: 'Dynamic World (10m)' }],
    yearRange: [2015, new Date().getFullYear()]
  },
  sentinel2: {
    label: "Sentinel-2",
    indicesLabel: "Select vegetation index",
    indices: [
      { v: 'NDVI', t: 'NDVI' },
      { v: 'NDWI', t: 'NDWI' },
      { v: 'NBR', t: 'NBR' },
      { v: 'NDBI', t: 'NDBI' },
      { v: 'NDCI', t: 'NDCI' }
    ],
    yearRange: [2015, new Date().getFullYear()]
  },
  landsat: {
    label: "Landsat (5–9)",
    indicesLabel: "Select vegetation index",
    indices: [
      { v: 'NDVI', t: 'NDVI' },
      { v: 'NDWI', t: 'NDWI' },
      { v: 'NBR', t: 'NBR' },
      { v: 'NDBI', t: 'NDBI' }
    ],
    yearRange: [1984, new Date().getFullYear()]
  },
  modis: {
    label: "MODIS",
    indicesLabel: "Select vegetation index",
    indices: [
      { v: 'NDVI', t: 'NDVI' },
      { v: 'NDWI', t: 'NDWI' },
      { v: 'NBR', t: 'NBR' },
      { v: 'NDBI', t: 'NDBI' },
      { v: 'NDCI', t: 'NDCI' }
    ],
    yearRange: [2000, new Date().getFullYear()]
  },
  climate: {
    label: "Climate",
    indicesLabel: "Select drought index",
    indices: [
      { v: 'SPI', t: 'SPI' },
      { v: 'VHI', t: 'VHI' }
    ],
    yearRange: [1981, new Date().getFullYear()]
  }
};

// Admin boundaries sources
const ADMIN_SOURCES = {
  adm1: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_1_gcs.geojson",
  adm2: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_2_gcs.geojson",
  adm3: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson"
};
let adminCache = {};

// Init map
function initMap() {
  map = L.map('map', { center: [9, 39], zoom: 6 });
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

  overlayGroup = L.layerGroup().addTo(map);
  drawnItems = new L.FeatureGroup().addTo(map);

  const baseLayers = { Street: street, Satellite: sat };
  const overlayLayers = {};

  // Add checkbox for visualization toggle
  overlayCheckbox = L.control.layers(baseLayers, overlayLayers, { collapsed: false }).addTo(map);

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
  });

  map.on('draw:deleted', () => {
    selectedGeometry = null;
  });
}

// Legend control inside map
const legendControl = L.control({ position: 'bottomleft' });
legendControl.onAdd = function () {
  this._div = L.DomUtil.create('div', 'info legend');
  this.update();
  return this._div;
};
legendControl.update = function (html) {
  this._div.innerHTML = html || '';
};
legendControl.addTo(map);

// UI populators
function populateIndexOptions(datasetKey) {
  const sel = document.getElementById('indexSelect');
  sel.innerHTML = '';
  if (!datasetKey) {
    sel.innerHTML = '<option value="">Select sub dataset</option>';
    return;
  }
  const cfg = DATASET_CONFIG[datasetKey];
  const defaultText = cfg.indicesLabel;
  sel.innerHTML = `<option value="">${defaultText}</option>`;
  cfg.indices.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.v; o.textContent = opt.t;
    sel.appendChild(o);
  });
}

function populateYearMonthDay(prefix, yearRange) {
  const ySel = document.getElementById(prefix + 'Year');
  const mSel = document.getElementById(prefix + 'Month');
  const dSel = document.getElementById(prefix + 'Day');
  ySel.innerHTML = '';
  for (let y = yearRange[1]; y >= yearRange[0]; y--) {
    let o = document.createElement('option');
    o.value = y; o.textContent = y;
    ySel.appendChild(o);
  }
  mSel.innerHTML = '';
  const monthNames = [
    '01 (Jan)', '02 (Feb)', '03 (Mar)', '04 (Apr)', '05 (May)', '06 (Jun)',
    '07 (Jul)', '08 (Aug)', '09 (Sep)', '10 (Oct)', '11 (Nov)', '12 (Dec)'
  ];
  for (let m = 1; m <= 12; m++) {
    let o = document.createElement('option');
    o.value = m; o.textContent = monthNames[m-1];
    mSel.appendChild(o);
  }
  updateDays(prefix);
}

function updateDays(prefix) {
  const y = parseInt(document.getElementById(prefix + 'Year').value);
  const m = parseInt(document.getElementById(prefix + 'Month').value);
  const dSel = document.getElementById(prefix + 'Day');
  dSel.innerHTML = '';
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    let o = document.createElement('option');
    o.value = d; o.textContent = d;
    dSel.appendChild(o);
  }
}

// Load admin features
async function loadAdminFeatures(level) {
  if (!ADMIN_SOURCES[level]) return [];
  if (adminCache[level]) return adminCache[level];
  try {
    const res = await fetch(ADMIN_SOURCES[level]);
    const data = await res.json();
    adminCache[level] = data;
    return data;
  } catch (err) {
    console.error("Admin fetch failed", err);
    return null;
  }
}

async function populateAdminFeatures(level) {
  const sel = document.getElementById('featureSelect');
  sel.innerHTML = '<option value="">-- pick feature --</option>';
  const data = await loadAdminFeatures(level);
  if (!data) return;
  data.features.forEach((f, idx) => {
    let name;
    if (level === "adm1") name = f.properties.NAME_1 || f.properties.ADM1_EN;
    else if (level === "adm2") name = f.properties.NAME_2 || f.properties.ADM2_EN;
    else if (level === "adm3") name = f.properties.NAME_3 || f.properties.ADM3_EN;
    if (!name) return;
    const o = document.createElement('option');
    o.value = idx;
    o.textContent = name;
    sel.appendChild(o);
  });
}

// Request body builder
function buildRequestBody() {
  const dataset = document.getElementById('datasetSelect').value;
  const index = document.getElementById('indexSelect').value;
  const fromY = document.getElementById('fromYear').value;
  const fromM = document.getElementById('fromMonth').value;
  const fromD = document.getElementById('fromDay').value;
  const toY = document.getElementById('toYear').value;
  const toM = document.getElementById('toMonth').value;
  const toD = document.getElementById('toDay').value;

  const startDate = `${fromY}-${String(fromM).padStart(2, '0')}-${String(fromD).padStart(2, '0')}`;
  const endDate = `${toY}-${String(toM).padStart(2, '0')}-${String(toD).padStart(2, '0')}`;

  let body = { dataset, index, startDate, endDate };

  if (selectedGeometry) body.geometry = selectedGeometry;
  else if (selectedFeatureGeoJSON) body.geometry = selectedFeatureGeoJSON.geometry;
  else {
    const b = map.getBounds();
    body.bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  }
  return body;
}

// Legend
function showLegend(index, dataset) {
  legendControl.update(`<h4>${index}</h4><div class="small">Dataset: ${dataset}</div>`);
}

// View
async function viewSelection() {
  const body = buildRequestBody();
  if (!body.dataset || !body.index) { alert("Select dataset and option"); return; }
  try {
    const res = await fetch(`${BACKEND}/gee_layers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    overlayGroup.clearLayers();
    if (currentTileLayer) { map.removeLayer(currentTileLayer); currentTileLayer = null; }
    const tileUrl = data.tiles || data.mode_tiles;
    if (!tileUrl) { alert("No tiles returned"); return; }
    currentTileLayer = L.tileLayer(tileUrl, { opacity: 1.0 }).addTo(overlayGroup);

    // Add to overlay toggle
    overlayCheckbox.addOverlay(currentTileLayer, "Visualization Layer");

    showLegend(body.index, body.dataset);

    if (body.geometry) {
      const gj = L.geoJSON(body.geometry);
      map.fitBounds(gj.getBounds(), { maxZoom: 10 });
    } else if (body.bbox) {
      map.fitBounds([[body.bbox.south, body.bbox.west], [body.bbox.north, body.bbox.east]]);
    }
  } catch (err) {
    console.error("View failed", err);
    alert("View failed: " + err.message);
  }
}

// Download
async function downloadSelection() {
  const body = buildRequestBody();
  if (!body.dataset || !body.index) { alert("Select dataset and option"); return; }
  try {
    const res = await fetch(`${BACKEND}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const filename = `${body.dataset}_${body.index}_${body.startDate}_to_${body.endDate}.tif`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); document.body.removeChild(link); }, 1500);
  } catch (err) {
    console.error("Download failed", err);
    alert("Download failed: " + err.message);
  }
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  initMap();

  const initialYrRange = [2025, 2025];
  populateYearMonthDay("from", initialYrRange);
  populateYearMonthDay("to", initialYrRange);
  document.getElementById('fromMonth').value = '10';
  document.getElementById('toMonth').value = '10';
  updateDays("from");
  updateDays("to");
  document.getElementById('fromDay').value = '1';
  document.getElementById('toDay').value = '31';

  document.getElementById('datasetSelect').addEventListener('change', e => {
    const ds = e.target.value;
    populateIndexOptions(ds);
    if (ds) {
      const yr = DATASET_CONFIG[ds].yearRange;
      populateYearMonthDay("from", yr);
      populateYearMonthDay("to", yr);
      document.getElementById('fromYear').value = yr[1];
      document.getElementById('toYear').value = yr[1];
      document.getElementById('fromMonth').value = '10';
      document.getElementById('toMonth').value = '10';
      updateDays("from");
      updateDays("to");
      document.getElementById('fromDay').value = '1';
      document.getElementById('toDay').value = '31';
    }
  });

  ["fromYear","fromMonth"].forEach(id => document.getElementById(id).addEventListener("change", () => updateDays("from")));
  ["toYear","toMonth"].forEach(id => document.getElementById(id).addEventListener("change", () => updateDays("to")));

  document.getElementById('adminLevel').addEventListener('change', e => populateAdminFeatures(e.target.value));
  document.getElementById('featureSelect').addEventListener('change', async e => {
    const idx = e.target.value;
    const lvl = document.getElementById('adminLevel').value;
    const data = await loadAdminFeatures(lvl);
    if (!idx || !data) { selectedFeatureGeoJSON = null; return; }
    const feat = data.features[parseInt(idx)];
    if (feat) {
      selectedFeatureGeoJSON = feat;
      drawnItems.clearLayers();
      const l = L.geoJSON(feat, { style: { color: 'red', weight: 2, fillOpacity: 0.1 } }).addTo(map);
      map.fitBounds(l.getBounds());
    }
  });

  document.getElementById('viewBtn').addEventListener('click', viewSelection);
  document.getElementById('downloadBtn').addEventListener('click', downloadSelection);

  populateAdminFeatures("adm3");
});

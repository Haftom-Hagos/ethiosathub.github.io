// script.js (rewritten with fixes, merged map and overlay tick box from provided code)

const BACKEND = (window.BACKEND_URL || 'https://hafrepo-2.onrender.com');

let map, drawnItems, overlayGroup, overlayCheckbox, boundaryLayer, selectedFeatureLayer;
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

// Helper to get property name for admin level
function getPropName(level) {
  if (level === "adm1") return "NAME_1";
  if (level === "adm2") return "NAME_2";
  if (level === "adm3") return "NAME_3";
  return "NAME_1"; // fallback
}

// Init map (merged with provided code for base maps, satellite, overlay tick box via group)
function initMap() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) {
    console.error('Map div not found!');
    return;
  }
  console.log('Map div found, size:', mapDiv.offsetHeight, mapDiv.offsetWidth);  // Debug log

  map = L.map('map', { center: [9, 39], zoom: 6 });
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);
  console.log('Basemap added');  // Debug log

  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Esri & contributors'
  });

  overlayGroup = L.layerGroup().addTo(map);
  drawnItems = new L.FeatureGroup().addTo(map);

  const baseLayers = { "Street": street, "Satellite": sat };
  const overlayLayers = { "Visualization Layer": overlayGroup };

  // Layer control with overlays (tick box for overlay group)
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
    if (boundaryLayer) boundaryLayer.resetStyle(); // Clear admin highlight
    console.log('Area drawn');
  });

  map.on('draw:deleted', () => {
    selectedGeometry = null;
    if (selectedFeatureGeoJSON && boundaryLayer) {
      boundaryLayer.resetStyle();
      selectedFeatureGeoJSON = null;
    }
  });

  map.invalidateSize();  // Force resize check
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

// Enhanced showLegend with hardcoded palettes for key datasets/indices
function showLegend(index, dataset) {
  let html = `<h4>${index}</h4><div class="small">Dataset: ${dataset}</div>`;
  if (dataset === 'landcover') {
    const classes = ['water', 'trees', 'grass', 'flooded_vegetation', 'crops', 'shrub_and_scrub', 'built', 'bare', 'snow_and_ice'];
    const colors = ['419bdf', '397d49', '88b053', '7a87c6', 'e49635', 'dfc35a', 'c4281b', 'a59b8f', 'b39fe1'];
    html = `<h4>Land Cover Classes</h4>`;
    classes.forEach((cls, i) => {
      html += `<div style="display: flex; align-items: center;"><span style="display: inline-block; width: 20px; height: 20px; background: #${colors[i]}; margin-right: 5px;"></span>${cls}</div>`;
    });
  } else if (index === 'NDVI' || index === 'NDCI') {
    html += `
      <div style="display: flex; align-items: center; margin-bottom: 5px;">
        <span style="display: inline-block; width: 20px; height: 20px; background: red; margin-right: 5px;"></span> Low (-1 to 0)
      </div>
      <div style="display: flex; align-items: center; margin-bottom: 5px;">
        <span style="display: inline-block; width: 20px; height: 20px; background: yellow; margin-right: 5px;"></span> Medium (0)
      </div>
      <div style="display: flex; align-items: center;">
        <span style="display: inline-block; width: 20px; height: 20px; background: green; margin-right: 5px;"></span> High (0 to 1)
      </div>
    `;
  }
  // Add more for other indices as needed
  legendControl.update(html);
}

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
  if (!ADMIN_SOURCES[level]) return null;
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

// Enhanced populateAdminFeatures to also add boundary layer to map with click interactions
async function populateAdminFeatures(level) {
  const sel = document.getElementById('featureSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- pick feature --</option>';
  const data = await loadAdminFeatures(level);
  if (!data) return;

  const prop = getPropName(level);
  data.features.forEach(f => {
    let name = f.properties[prop] || f.properties[prop.toLowerCase()] || f.properties[prop.replace('_EN', '')] || '';
    if (!name) return;
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });

  // Add boundary layer to map
  if (boundaryLayer) map.removeLayer(boundaryLayer);
  boundaryLayer = L.geoJSON(data, {
    style: { color: "#3388ff", weight: 1, fillOpacity: 0 },
    onEachFeature: (feature, layer) => {
      const name = feature.properties[prop] || feature.properties[prop.toLowerCase()] || feature.properties[prop.replace('_EN', '')] || '';
      layer.bindPopup(`<b>${name}</b>`);
      layer.on('click', () => {
        boundaryLayer.resetStyle();
        layer.setStyle({ color: "red", weight: 2, fillOpacity: 0.1 });
        layer.openPopup();
        selectedFeatureGeoJSON = feature;
        document.getElementById('featureSelect').value = name;
        // Clear drawn area
        drawnItems.clearLayers();
        selectedGeometry = null;
      });
    }
  }).addTo(map);

  if (boundaryLayer.getLayers().length > 0) {
    map.fitBounds(boundaryLayer.getBounds(), { maxZoom: 7 });
  }
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
    const tileUrl = data.tiles || data.mode_tiles;
    if (!tileUrl) { alert("No tiles returned"); return; }
    const currentTileLayer = L.tileLayer(tileUrl, { opacity: 1.0 }).addTo(overlayGroup);

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

  // Admin level change: repopulate features and boundaries
  const adminLevelEl = document.getElementById('adminLevel');
  if (adminLevelEl) {
    adminLevelEl.addEventListener('change', e => {
      const level = e.target.value;
      populateAdminFeatures(level);
    });
  }

  // Feature select change: highlight on map via boundary layer
  document.getElementById('featureSelect').addEventListener('change', async e => {
    const name = e.target.value;
    if (!name) {
      if (selectedFeatureGeoJSON && boundaryLayer) {
        boundaryLayer.resetStyle();
        selectedFeatureGeoJSON = null;
      }
      return;
    }
    const lvl = document.getElementById('adminLevel').value;
    const data = await loadAdminFeatures(lvl);
    if (!data) return;
    const prop = getPropName(lvl);
    const feat = data.features.find(f => {
      return f.properties[prop] === name || f.properties[prop.toLowerCase()] === name || f.properties[prop.replace('_EN', '')] === name;
    });
    if (feat) {
      selectedFeatureGeoJSON = feat;
      // Find and highlight the corresponding layer
      const targetLayer = boundaryLayer.getLayers().find(l => l.feature === feat);
      if (targetLayer) {
        boundaryLayer.resetStyle();
        targetLayer.setStyle({ color: "red", weight: 2, fillOpacity: 0.1 });
        targetLayer.openPopup();
      }
      // Clear drawn
      drawnItems.clearLayers();
      selectedGeometry = null;
      map.fitBounds(L.geoJSON(feat).getBounds(), { maxZoom: 10 });
    }
  });

  document.getElementById('viewBtn').addEventListener('click', viewSelection);
  document.getElementById('downloadBtn').addEventListener('click', downloadSelection);

  populateAdminFeatures("adm3");
});

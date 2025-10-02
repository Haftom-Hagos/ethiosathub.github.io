// script.js (updated to fix issues: adapt to HTML districtSelect/adm3 only, always-on overlay, initial date 2024, legend colorbar, white bg, filename with district, etc.)

const BACKEND = (window.BACKEND_URL || 'https://hafrepo-2.onrender.com');

let map, drawnItems, overlayGroup, overlayCheckbox, boundaryLayer, selectedFeatureLayer;
let selectedGeometry = null;
let selectedFeatureGeoJSON = null;
let selectedDistrictName = null; // For filename

// Dataset config (adjust yearRange max to current-1 for safety)
const DATASET_CONFIG = {
  landcover: {
    label: "Land cover",
    indicesLabel: "Select land cover",
    indices: [{ v: 'dynamic_world', t: 'Dynamic World (10m)' }],
    yearRange: [2015, new Date().getFullYear() - 1]
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
    yearRange: [2015, new Date().getFullYear() - 1]
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
    yearRange: [1984, new Date().getFullYear() - 1]
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
    yearRange: [2000, new Date().getFullYear() - 1]
  },
  climate: {
    label: "Climate",
    indicesLabel: "Select drought index",
    indices: [
      { v: 'SPI', t: 'SPI' },
      { v: 'VHI', t: 'VHI' }
    ],
    yearRange: [1981, new Date().getFullYear() - 1]
  }
};

// Admin boundaries sources (only adm3 for districtSelect)
const ADMIN_SOURCES = {
  adm3: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson"
};
let adminCache = {};

// Legend control (global definition)
let legendControl;

// Init map
function initMap() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) {
    console.error('Map div not found!');
    return;
  }
  console.log('Map div found, size:', mapDiv.offsetHeight, mapDiv.offsetWidth);

  map = L.map('map', { center: [9.145, 40.4897], zoom: 6 });
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);
  console.log('Basemap added');

  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Esri & contributors'
  });

  overlayGroup = L.layerGroup().addTo(map); // Always added to map, for always-on
  drawnItems = new L.FeatureGroup().addTo(map);

  const baseLayers = { "Street": street, "Satellite": sat };
  // Note: No overlay in control to keep always on; if needed, add separate toggle

  overlayCheckbox = L.control.layers(baseLayers, null, { collapsed: false }).addTo(map); // No overlays in control

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
    selectedDistrictName = null;
    if (boundaryLayer) boundaryLayer.resetStyle();
    console.log('Area drawn');
  });

  map.on('draw:deleted', () => {
    selectedGeometry = null;
    if (selectedFeatureGeoJSON && boundaryLayer) {
      boundaryLayer.resetStyle();
      selectedFeatureGeoJSON = null;
      selectedDistrictName = null;
    }
  });

  // Legend control with white background
  legendControl = L.control({ position: 'bottomleft' });
  legendControl.onAdd = function () {
    this._div = L.DomUtil.create('div', 'info legend');
    this._div.style.backgroundColor = 'white';
    this._div.style.padding = '10px';
    this._div.style.borderRadius = '5px';
    this._div.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    this.update();
    return this._div;
  };
  legendControl.update = function (html) {
    this._div.innerHTML = html || '';
  };
  legendControl.addTo(map);

  map.invalidateSize();
}

// Updated showLegend: colorbar for veg indices, filtered classes for landcover
function showLegend(index, dataset, uniqueClasses = null) {
  if (!legendControl) return;
  let html = `<h4>${index}</h4><div class="small">Dataset: ${dataset}</div>`;
  if (dataset === 'landcover' && uniqueClasses) {
    const allClasses = ['water', 'trees', 'grass', 'flooded_vegetation', 'crops', 'shrub_and_scrub', 'built', 'bare', 'snow_and_ice'];
    const allColors = ['#419bdf', '#397d49', '#88b053', '#7a87c6', '#e49635', '#dfc35a', '#c4281b', '#a59b8f', '#b39fe1'];
    html = `<h4>Land Cover Classes (AOI)</h4>`;
    uniqueClasses.forEach(clsId => {
      const cls = allClasses[clsId];
      const color = allColors[clsId];
      html += `<div style="display: flex; align-items: center;"><span style="display: inline-block; width: 20px; height: 20px; background: ${color}; margin-right: 5px;"></span>${cls}</div>`;
    });
  } else if (['NDVI', 'NDWI', 'NBR', 'NDBI', 'NDCI', 'SPI', 'VHI'].includes(index)) {
    // Colorbar for continuous indices
    html += `
      <div style="background: linear-gradient(to right, #d73027, #fee08b, #1a9850); height: 20px; margin: 10px 0; border-radius: 3px;"></div>
      <div style="text-align: center; font-size: 12px;">Low &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; High</div>
    `;
  }
  legendControl.update(html);
}

// UI populators (unchanged except for district)
function populateIndexOptions(datasetKey) {
  const sel = document.getElementById('indexSelect');
  if (!sel) return; // Not used in HTML
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
  if (!ySel || !mSel || !dSel) return;
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
  if (!dSel) return;
  dSel.innerHTML = '';
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    let o = document.createElement('option');
    o.value = d; o.textContent = d;
    dSel.appendChild(o);
  }
}

// Load admin features (only adm3)
async function loadAdminFeatures() {
  const level = 'adm3';
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

// Populate districts dropdown and boundary layer
async function populateDistricts() {
  const sel = document.getElementById('districtSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select a district</option>';
  const data = await loadAdminFeatures();
  if (!data) return;

  data.features.forEach(f => {
    const name = f.properties.ADM3_EN || '';
    if (!name) return;
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });

  // Add boundary layer
  if (boundaryLayer) map.removeLayer(boundaryLayer);
  boundaryLayer = L.geoJSON(data, {
    style: { color: "#3388ff", weight: 1, fillOpacity: 0 },
    onEachFeature: (feature, layer) => {
      const name = feature.properties.ADM3_EN || '';
      layer.bindPopup(`<b>${name}</b>`);
      layer.on('click', () => {
        boundaryLayer.resetStyle();
        layer.setStyle({ color: "red", weight: 2, fillOpacity: 0.1 });
        layer.openPopup();
        selectedFeatureGeoJSON = feature;
        selectedDistrictName = name;
        document.getElementById('districtSelect').value = name;
        drawnItems.clearLayers();
        selectedGeometry = null;
      });
    }
  }).addTo(map);

  if (boundaryLayer.getLayers().length > 0) {
    map.fitBounds(boundaryLayer.getBounds(), { maxZoom: 7 });
  }
}

// Request body builder (adapt to district)
function buildRequestBody() {
  const dataset = document.getElementById('datasetSelect').value;
  const index = document.getElementById('indexSelect').value || 'NDVI'; // Default for ndvi dataset
  const yearEl = document.getElementById('yearSelect');
  const mStartEl = document.getElementById('monthStart');
  const mEndEl = document.getElementById('monthEnd');
  if (!yearEl || !mStartEl || !mEndEl) return null;

  const year = parseInt(yearEl.value, 10);
  const ms = parseInt(mStartEl.value, 10);
  const me = parseInt(mEndEl.value, 10);
  const mStart = Math.min(ms, me);
  const mEnd = Math.max(ms, me);
  const startDate = `${year}-${String(mStart).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mEnd, 0).getDate();
  const endDate = `${year}-${String(mEnd).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let body = { dataset: dataset === 'ndvi' ? 'sentinel2' : (dataset === 'dw' ? 'landcover' : dataset), index, startDate, endDate };

  if (selectedGeometry) body.geometry = selectedGeometry;
  else if (selectedFeatureGeoJSON) body.geometry = selectedFeatureGeoJSON.geometry;
  else {
    const b = map.getBounds();
    body.bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  }
  return body;
}

// View (updated for backend response with unique_classes, force overlay visible)
async function viewSelection() {
  const body = buildRequestBody();
  if (!body || !body.dataset) { alert("Select dataset"); return; }
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
    const currentTileLayer = L.tileLayer(tileUrl, { opacity: 0.8 }).addTo(overlayGroup); // Always added, opacity for visibility

    // Force overlay visible (since no toggle in control)
    overlayGroup.setOpacity(1.0);

    showLegend(body.index, body.dataset, data.unique_classes);

    let bounds;
    if (selectedFeatureGeoJSON) {
      const gj = L.geoJSON(selectedFeatureGeoJSON.geometry);
      bounds = gj.getBounds();
    } else if (selectedGeometry) {
      bounds = L.geoJSON(selectedGeometry).getBounds();
    } else {
      bounds = map.getBounds();
    }
    map.fitBounds(bounds);

    alert(`${body.dataset.toUpperCase()} visualized!`);
  } catch (err) {
    console.error("View failed", err);
    alert("View failed: " + err.message);
  }
}

// Download (add district name to filename)
async function downloadSelection() {
  const body = buildRequestBody();
  if (!body || !body.dataset) { alert("Select dataset"); return; }
  try {
    const res = await fetch(`${BACKEND}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    let filename = `${body.dataset}_${body.index}_${body.startDate}_to_${body.endDate}`;
    if (selectedDistrictName) filename += `_${selectedDistrictName}`;
    filename += '.tif';
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

// Init (adapt to HTML: yearSelect, monthStart/End, districtSelect, viewSelectionBtn, downloadSelectionBtn)
document.addEventListener("DOMContentLoaded", () => {
  try {
    initMap();

    // Initial date: 2024 for data availability
    const yearSelect = document.getElementById('yearSelect');
    const monthStart = document.getElementById('monthStart');
    const monthEnd = document.getElementById('monthEnd');
    if (yearSelect && monthStart && monthEnd) {
      const currentYear = new Date().getFullYear() - 1; // 2024
      for (let y = currentYear; y >= 2016; y--) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        yearSelect.appendChild(opt);
      }
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (let m = 1; m <= 12; m++) {
        const opt1 = document.createElement('option');
        opt1.value = String(m);
        opt1.textContent = `${String(m).padStart(2, '0')} (${monthNames[m - 1]})`;
        monthStart.appendChild(opt1);
        monthEnd.appendChild(opt1.cloneNode(true));
      }
      yearSelect.value = String(currentYear);
      monthStart.value = '7'; // July for summer data
      monthEnd.value = '9'; // Sept
    }

    // Dataset change (show geeOptions, but no indexSelect in HTML)
    const datasetSelect = document.getElementById('datasetSelect');
    const geeOptions = document.getElementById('geeOptions');
    if (datasetSelect && geeOptions) {
      datasetSelect.addEventListener('change', () => {
        const value = datasetSelect.value;
        geeOptions.style.display = (value === 'ndvi' || value === 'dw') ? 'inline-block' : 'none';
        // Clear selections
        document.getElementById('districtSelect').value = '';
        selectedDistrictName = null;
        selectedFeatureGeoJSON = null;
        if (boundaryLayer) boundaryLayer.resetStyle();
        drawnItems.clearLayers();
        selectedGeometry = null;
        overlayGroup.clearLayers();
      });
    }

    // District select change
    const districtSelect = document.getElementById('districtSelect');
    if (districtSelect) {
      districtSelect.addEventListener('change', async e => {
        const name = e.target.value;
        if (!name) {
          if (selectedFeatureGeoJSON && boundaryLayer) {
            boundaryLayer.resetStyle();
            selectedFeatureGeoJSON = null;
            selectedDistrictName = null;
          }
          return;
        }
        const data = await loadAdminFeatures();
        if (!data) return;
        const feat = data.features.find(f => f.properties.ADM3_EN === name);
        if (feat) {
          selectedFeatureGeoJSON = feat;
          selectedDistrictName = name;
          const targetLayer = boundaryLayer.getLayers().find(l => l.feature === feat);
          if (targetLayer) {
            boundaryLayer.resetStyle();
            targetLayer.setStyle({ color: "red", weight: 2, fillOpacity: 0.1 });
            targetLayer.openPopup();
          }
          drawnItems.clearLayers();
          selectedGeometry = null;
          map.fitBounds(L.geoJSON(feat).getBounds(), { maxZoom: 10 });
        }
      });
    }

    document.getElementById('viewSelectionBtn').addEventListener('click', viewSelection);
    document.getElementById('downloadSelectionBtn').addEventListener('click', downloadSelection);

    populateDistricts();
  } catch (err) {
    console.error('Init failed:', err);
  }
});

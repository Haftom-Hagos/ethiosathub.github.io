// script.js (complete updated version with debugging logs for districts/boundaries)
// - Ensures overlay always on top (custom pane)
// - Better handling for VHI/SPI backend messages and missing tiles
// - Landcover legend shows only classes present in AOI
// - Vegetation indices use continuous colorbar with backend min/max when available
// - White background behind legends
// - Download filename includes selected feature name
// - Extra debugging logs for districts/boundaries

const BACKEND = (window.BACKEND_URL || 'https://hafrepo-2.onrender.com');

let map, drawnItems, overlayGroup, overlayPaneName = 'overlayPane', boundaryLayer, selectedFeatureLayer;
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
    label: "Landsat (4–8)",
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

// Admin boundaries sources
const ADMIN_SOURCES = {
  adm1: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_1_gcs.geojson",
  adm2: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_2_gcs.geojson",
  adm3: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson"
};
let adminCache = {};

// Helper to get property name for admin level
function getPropName(level) {
  if (level === "adm1") return "ADM1_EN";
  if (level === "adm2") return "ADM2_EN";
  if (level === "adm3") return "ADM3_EN";
  return "NAME_1"; // fallback
}

// Legend control (global definition)
let legendControl;

// Create or ensure overlay pane exists and has higher z-index so overlays are on top
function ensureOverlayPane() {
  if (!map) return;
  // Create pane if not exists
  try {
    if (!map.getPane(overlayPaneName)) {
      const p = map.createPane(overlayPaneName);
      // Put this above normal tile pane (tilePane default z-index ~200)
      p.style.zIndex = 650;
      // Allow pointer events to pass through unless overlay has its own interactivity
      p.style.pointerEvents = 'auto';
      console.log('Created overlay pane with zIndex', p.style.zIndex);
    }
  } catch (err) {
    console.warn('Could not create overlay pane (already exists?)', err);
  }
}

// Init map
function initMap() {
  const mapDiv = document.getElementById('map');
  if (!mapDiv) {
    console.error('Map div not found!');
    return;
  }
  console.log('Map div found, size:', mapDiv.offsetHeight, mapDiv.offsetWidth);

  map = L.map('map', { center: [9.145, 40.4897], zoom: 6 });
  ensureOverlayPane();

  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);
  console.log('Street basemap added');

  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Esri & contributors'
  });

  // overlayGroup holds result tileLayers and is added to overlay pane to always be over basemaps
  overlayGroup = L.layerGroup([], { pane: overlayPaneName }).addTo(map); // Always added to map, for always-on
  drawnItems = new L.FeatureGroup().addTo(map);

  const baseLayers = { "Street": street, "Satellite": sat };
  overlayCheckbox = L.control.layers(baseLayers, null, { collapsed: false }).addTo(map);

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
    this._div.style.maxWidth = '260px';
    this.update();
    return this._div;
  };
  legendControl.update = function (html) {
    this._div.innerHTML = html || '';
  };
  legendControl.addTo(map);

  map.invalidateSize();
}

// Show legend: for landcover use uniqueClasses, for continuous indices show colorbar using min/max if provided
function showLegend(index, dataset, uniqueClasses = null, meta = {}) {
  if (!legendControl) return;
  let html = `<h4 style="margin:0 0 6px 0;">${index}</h4><div class="small" style="margin-bottom:6px;">Dataset: ${dataset}</div>`;
  if (dataset === 'landcover' && Array.isArray(uniqueClasses)) {
    // Map Dynamic World class ids to names/colors (Dynamic World class order reference)
    const allClasses = [
      { id: 0, name: 'water', color: '#419bdf' },
      { id: 1, name: 'trees', color: '#397d49' },
      { id: 2, name: 'grass', color: '#88b053' },
      { id: 3, name: 'flooded_vegetation', color: '#7a87c6' },
      { id: 4, name: 'crops', color: '#e49635' },
      { id: 5, name: 'shrub_and_scrub', color: '#dfc35a' },
      { id: 6, name: 'built', color: '#c4281b' },
      { id: 7, name: 'bare', color: '#a59b8f' },
      { id: 8, name: 'snow_and_ice', color: '#b39fe1' }
    ];
    html = `<h4 style="margin:0 0 6px 0;">Land Cover Classes (AOI)</h4>`;
    // Ensure numbers
    const ids = uniqueClasses.map(x => parseInt(x, 10)).filter(n => !isNaN(n));
    // If backend returned strings like ['trees','water'], try to map by name
    const namesToInclude = uniqueClasses.filter(x => isNaN(parseInt(x, 10)));
    let foundAny = false;
    ids.forEach(clsId => {
      const clsObj = allClasses.find(c => c.id === clsId);
      if (clsObj) {
        html += `<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="display:inline-block;width:20px;height:20px;background:${clsObj.color};margin-right:8px;border:1px solid #999;"></span>${clsObj.name}</div>`;
        foundAny = true;
      }
    });
    // If backend returned names instead of ids, include those
    namesToInclude.forEach(name => {
      const clsObj = allClasses.find(c => c.name === String(name));
      if (clsObj) {
        html += `<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="display:inline-block;width:20px;height:20px;background:${clsObj.color};margin-right:8px;border:1px solid #999;"></span>${clsObj.name}</div>`;
        foundAny = true;
      } else {
        // if unknown string, display raw
        html += `<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="display:inline-block;width:20px;height:20px;background:#ccc;margin-right:8px;border:1px solid #999;"></span>${name}</div>`;
        foundAny = true;
      }
    });

    if (!foundAny) {
      html += `<div>No landcover classes detected in the selected AOI.</div>`;
    }
  } else if (['NDVI', 'NDWI', 'NBR', 'NDBI', 'NDCI', 'SPI', 'VHI'].includes(index)) {
    // Continuous colorbar
    // Try to use meta.min / meta.max from backend if available
    let min = (typeof meta.min !== 'undefined') ? meta.min : -1;
    let max = (typeof meta.max !== 'undefined') ? meta.max : 1;

    // For SPI might be wider range; if backend provided scale use it
    if (index === 'SPI' && (typeof meta.min === 'undefined' && typeof meta.max === 'undefined')) {
      min = -3; max = 3;
    }
    if (index === 'VHI' && (typeof meta.min === 'undefined' && typeof meta.max === 'undefined')) {
      min = 0; max = 100; // Vegetation Health Index often 0-100
    }

    // colors: red -> yellow -> green
    html += `
      <div style="height:18px; margin:8px 0; border-radius:3px; overflow:hidden; border:1px solid #ccc;">
        <div style="width:100%; height:100%; background: linear-gradient(to right, #d73027, #fee08b, #1a9850);"></div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12px;">
        <span>${Number(min).toFixed(2)}</span>
        <span>${Number((min + max) / 2).toFixed(2)}</span>
        <span>${Number(max).toFixed(2)}</span>
      </div>
    `;
    html += `<div style="font-size:12px; margin-top:6px;">Color: low → high</div>`;
  } else {
    // Fallback
    html += `<div>No legend available for ${index}</div>`;
  }

  legendControl.update(html);
}

// UI populators
function populateIndexOptions(datasetKey) {
  const sel = document.getElementById('indexSelect');
  if (!sel) return;
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
    console.log('Fetching admin boundaries from:', ADMIN_SOURCES[level]);
    const res = await fetch(ADMIN_SOURCES[level]);
    if (!res.ok) {
      console.error('Fetch failed with status:', res.status);
      return null;
    }
    const data = await res.json();
    console.log('Fetched data.features length:', data.features ? data.features.length : 'no features');
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
  if (!sel) {
    console.error('districtSelect not found!');
    return;
  }
  sel.innerHTML = '<option value="">Select a district</option>';
  const data = await loadAdminFeatures();
  if (!data || !data.features || data.features.length === 0) {
    console.error('No features in data');
    return;
  }

  data.features.forEach((f, idx) => {
    const name = f.properties.ADM3_EN || f.properties.NAME_3 || '';
    if (!name) {
      console.log('No name for feature', idx);
      return;
    }
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
  console.log('Populated', sel.options.length - 1, 'districts');

  // Add boundary layer
  if (boundaryLayer) {
    try { map.removeLayer(boundaryLayer); } catch(e) { console.warn('Removing old boundary layer failed', e); }
  }
  boundaryLayer = L.geoJSON(data, {
    style: { color: "#3388ff", weight: 1, fillOpacity: 0 },
    onEachFeature: (feature, layer) => {
      const name = feature.properties.ADM3_EN || feature.properties.NAME_3 || '';
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
        console.log('Selected district via click:', name);
      });
    }
  }).addTo(map);
  console.log('Boundary layer added with', boundaryLayer.getLayers().length, 'layers');

  if (boundaryLayer.getLayers().length > 0) {
    try {
      map.fitBounds(boundaryLayer.getBounds(), { maxZoom: 7 });
      console.log('Fit bounds to boundaries');
    } catch (err) {
      console.warn('fitBounds failed for boundary layer', err);
    }
  } else {
    console.error('No layers in boundaryLayer');
  }
}

// Request body builder (adapt to district)
function buildRequestBody() {
  const dataset = document.getElementById('datasetSelect').value;
  const index = document.getElementById('indexSelect').value || 'NDVI';
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

// Utility: add tile layer to overlay pane with robust error handling
function addOverlayTile(tileUrl, tileOptions = {}) {
  if (!tileUrl) return null;
  // Always add overlay tiles to overlay pane to keep on top
  const opts = Object.assign({}, tileOptions, { pane: overlayPaneName });
  const tileLayer = L.tileLayer(tileUrl, opts);
  overlayGroup.addLayer(tileLayer);
  console.log('Overlay tile added with url prefix:', tileUrl.slice(0, 80));
  return tileLayer;
}

// View (updated for backend response with unique_classes, force overlay visible, improved error handling)
async function viewSelection() {
  const body = buildRequestBody();
  if (!body || !body.dataset) { alert("Select dataset"); return; }
  try {
    const res = await fetch(`${BACKEND}/gee_layers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    // Try to parse both success and error JSON
    let data;
    try {
      data = await res.json();
    } catch (e) {
      const txt = await res.text();
      throw new Error('Unexpected backend response: ' + txt);
    }

    if (!res.ok) {
      // Backend returned an error JSON - show detailed message and suggestions
      const msg = data.detail || data.message || JSON.stringify(data);
      console.error('Backend error:', msg);
      // Specific helpful messaging for common failure types
      if (msg && msg.toLowerCase().includes('no modis lst')) {
        alert("VHI computation failed: No MODIS LST (MOD11A2) images found for the selected date/area. Try expanding the date range, selecting a different year, or choosing a larger AOI.");
      } else {
        alert("View failed: " + msg);
      }
      return;
    }

    // clear previous overlay tiles
    overlayGroup.clearLayers();

    // backend may return one of: tiles, mode_tiles, tile
    const tileUrl = data.tiles || data.mode_tiles || data.tile || null;
    if (!tileUrl) {
      // no tiles returned; show message with possible backend info
      const backendMsg = data.detail || data.message || 'No tiles returned by backend';
      console.warn('No tile URL in backend response', data);
      alert("No tiles returned: " + backendMsg);
      // Update legend if backend gave unique classes info so user still sees legend
      try { showLegend(body.index, body.dataset, data.unique_classes, data.meta || {}); } catch(e) {}
      return;
    }

    // Add tile layer to overlay pane so it's always on top of basemaps
    const tileOpts = { opacity: 0.85, attribution: data.attribution || '' };
    const currentTileLayer = addOverlayTile(tileUrl, tileOpts);

    // If backend sends meta including min/max for legend, pass it
    try {
      showLegend(body.index, body.dataset, data.unique_classes, data.meta || {});
    } catch (e) {
      console.warn('showLegend failed', e);
      showLegend(body.index, body.dataset, data.unique_classes);
    }

    // Fit bounds if available from backend (preferred) otherwise from selected feature/geometry
    let bounds = null;
    if (data.bounds && Array.isArray(data.bounds) && data.bounds.length === 4) {
      // expecting [west, south, east, north]
      const b = data.bounds;
      try { bounds = L.latLngBounds([ [b[1], b[0]], [b[3], b[2]] ]); } catch(e) { bounds = null; }
    }

    if (!bounds) {
      if (selectedFeatureGeoJSON) {
        const gj = L.geoJSON(selectedFeatureGeoJSON.geometry);
        bounds = gj.getBounds();
      } else if (selectedGeometry) {
        bounds = L.geoJSON(selectedGeometry).getBounds();
      } else {
        bounds = map.getBounds();
      }
    }

    if (bounds && bounds.isValid && bounds.isValid()) {
      try {
        map.fitBounds(bounds, { maxZoom: 12 });
      } catch (err) {
        console.warn('fitBounds failed', err);
      }
    }

    // Provide success feedback in console and small UI alert
    console.log(`${body.dataset.toUpperCase()} visualized! tileUrl:`, tileUrl);
    alert(`${body.dataset.toUpperCase()} visualized!`);
  } catch (err) {
    console.error("View failed", err);
    // If err.message contains backend JSON text, present it
    alert("View failed: " + (err.message || err));
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
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || 'Download request failed');
    }
    const blob = await res.blob();
    // Build filename and sanitize selectedDistrictName for filesystem
    function sanitize(name) {
      if (!name) return '';
      return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');
    }
    let filename = `${body.dataset}_${body.index}_${body.startDate}_to_${body.endDate}`;
    if (selectedDistrictName) filename += `_${sanitize(selectedDistrictName)}`;
    filename += '.tif';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); document.body.removeChild(link); }, 1500);
    console.log('Download started for', filename);
  } catch (err) {
    console.error("Download failed", err);
    alert("Download failed: " + (err.message || err));
  }
}

// Init (adapt to HTML: yearSelect, monthStart/End, districtSelect, viewSelectionBtn, downloadSelectionBtn)
document.addEventListener("DOMContentLoaded", () => {
  try {
    initMap();
    ensureOverlayPane();

    // Initial date: currentYear-1 for data availability
    const yearSelect = document.getElementById('yearSelect');
    const monthStart = document.getElementById('monthStart');
    const monthEnd = document.getElementById('monthEnd');
    if (yearSelect && monthStart && monthEnd) {
      const currentYear = new Date().getFullYear() - 1;
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

    // Dataset change (show geeOptions etc.)
    const datasetSelect = document.getElementById('datasetSelect');
    const geeOptions = document.getElementById('geeOptions');
    if (datasetSelect && geeOptions) {
      datasetSelect.addEventListener('change', () => {
        const value = datasetSelect.value;
        // show options only for certain datasets (adjust as needed)
        geeOptions.style.display = (value === 'ndvi' || value === 'dw' || value === 'climate') ? 'inline-block' : 'none';
        // Clear selections and overlays on dataset change
        document.getElementById('districtSelect').value = '';
        selectedDistrictName = null;
        selectedFeatureGeoJSON = null;
        if (boundaryLayer) boundaryLayer.resetStyle();
        drawnItems.clearLayers();
        selectedGeometry = null;
        overlayGroup.clearLayers();
        // Update indexSelect options
        populateIndexOptions(value);
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
        const feat = data.features.find(f => (f.properties.ADM3_EN && f.properties.ADM3_EN === name) || (f.properties.NAME_3 && f.properties.NAME_3 === name));
        if (feat) {
          selectedFeatureGeoJSON = feat;
          selectedDistrictName = name;
          // Find corresponding layer in boundaryLayer and style it
          let targetLayer = null;
          if (boundaryLayer && boundaryLayer.getLayers) {
            const layers = boundaryLayer.getLayers();
            for (let i = 0; i < layers.length; i++) {
              if (layers[i].feature && layers[i].feature === feat) {
                targetLayer = layers[i];
                break;
              }
            }
          }
          if (targetLayer) {
            boundaryLayer.resetStyle();
            targetLayer.setStyle({ color: "red", weight: 2, fillOpacity: 0.1 });
            try { targetLayer.openPopup(); } catch(e) {}
          } else {
            console.log('Selected feature layer not found in boundaryLayer - styling skipped');
          }
          drawnItems.clearLayers();
          selectedGeometry = null;
          try { map.fitBounds(L.geoJSON(feat).getBounds(), { maxZoom: 10 }); } catch(e) { console.warn('fitBounds for selected district failed', e); }
          console.log('District selected from dropdown:', name);
        } else {
          console.warn('District not found in admin features for name:', name);
        }
      });
    }

    const viewBtn = document.getElementById('viewSelectionBtn');
    if (viewBtn) viewBtn.addEventListener('click', viewSelection);
    const downloadBtn = document.getElementById('downloadSelectionBtn');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadSelection);

    populateDistricts();
  } catch (err) {
    console.error('Init failed:', err);
  }
});

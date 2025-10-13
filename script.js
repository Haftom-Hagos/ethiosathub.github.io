// Optimized script.js
const BACKEND = window.BACKEND_URL || 'https://hafrepo-2.onrender.com';
const OVERLAY_PANE = 'overlayPane';

// Constants
const ADMIN_SOURCES = {
  adm1: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_1_gcs.geojson",
  adm2: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_2_gcs.geojson",
  adm3: "https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson"
};

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

const MONTH_NAMES = ['01 (Jan)', '02 (Feb)', '03 (Mar)', '04 (Apr)', '05 (May)', '06 (Jun)',
  '07 (Jul)', '08 (Aug)', '09 (Sep)', '10 (Oct)', '11 (Nov)', '12 (Dec)'];

const PROP_MAP = { adm1: 'ADM1_EN', adm2: 'ADM2_EN', adm3: 'ADM3_EN' };

// State management
const state = {
  map: null,
  drawnItems: null,
  overlayLayers: [],
  overlayVisible: true,
  selectedGeometry: null,
  selectedFeatureGeoJSON: null,
  selectedFeatureName: null,
  boundaryLayer: null,
  adminCache: {},
  legendControl: null
};

// Utility: Debounce function
const debounce = (fn, delay = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// Utility: Get property name for admin level
const getPropName = (level) => PROP_MAP[level] || 'ADM1_EN';

// Utility: Create option element
const createOption = (value, text) => {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  return opt;
};

// Map: Ensure overlay pane exists
const ensureOverlayPane = () => {
  if (!state.map || state.map.getPane(OVERLAY_PANE)) return;
  const pane = state.map.createPane(OVERLAY_PANE);
  pane.style.zIndex = 650;
};

// Map: Set overlay visibility
const setOverlayVisibility = (visible) => {
  const opacity = visible ? 1 : 0;
  state.overlayLayers.forEach(layer => {
    try { layer.setOpacity(opacity); } catch (e) { /* ignore */ }
  });
};

// Map: Add overlay tile
const addOverlayTile = (tileUrl, opts = {}) => {
  ensureOverlayPane();
  const layer = L.tileLayer(tileUrl, { ...opts, pane: OVERLAY_PANE }).addTo(state.map);
  state.overlayLayers.push(layer);
  setOverlayVisibility(state.overlayVisible);
  return layer;
};

// Map: Clear overlay layers
const clearOverlayLayers = () => {
  state.overlayLayers.forEach(layer => {
    try { state.map.removeLayer(layer); } catch (e) { /* ignore */ }
  });
  state.overlayLayers = [];
};

// Admin: Load admin GeoJSON with caching
const loadAdmin = async (level) => {
  if (!ADMIN_SOURCES[level]) return null;
  if (state.adminCache[level]) return state.adminCache[level];

  try {
    const response = await fetch(ADMIN_SOURCES[level]);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    const data = await response.json();
    state.adminCache[level] = data;
    return data;
  } catch (err) {
    console.error('loadAdmin error:', err);
    return null;
  }
};

// UI: Populate select with options
const populateSelect = (selectId, options, defaultText = 'Select') => {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  select.innerHTML = `<option value="">${defaultText}</option>`;
  options.forEach(opt => select.appendChild(createOption(opt.value, opt.text)));
};

// UI: Populate index options
const populateIndexOptions = (datasetKey) => {
  const config = DATASET_CONFIG[datasetKey];
  const defaultText = config?.label || 'Select sub dataset';
  const options = config?.indices?.map(i => ({ value: i.v, text: i.t })) || [];
  populateSelect('indexSelect', options, defaultText);
};

// UI: Populate months
const populateMonths = (selectEl) => {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  MONTH_NAMES.forEach((name, idx) => {
    selectEl.appendChild(createOption(String(idx + 1), name));
  });
};

// UI: Populate days
const populateDays = (selectEl) => {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  for (let d = 1; d <= 31; d++) {
    selectEl.appendChild(createOption(String(d), String(d)));
  }
};

// UI: Populate years for dataset
const populateYearsForDataset = (datasetKey) => {
  const config = DATASET_CONFIG[datasetKey];
  const [minYear, maxYear] = config?.yearRange || [2000, new Date().getFullYear()];
  
  const options = [];
  for (let y = maxYear; y >= minYear; y--) {
    options.push({ value: String(y), text: String(y) });
  }
  
  populateSelect('fromYear', options, '');
  populateSelect('toYear', options, '');
  
  const defaultYear = String(Math.min(maxYear, new Date().getFullYear() - 1));
  const fromYear = document.getElementById('fromYear');
  const toYear = document.getElementById('toYear');
  if (fromYear) fromYear.value = defaultYear;
  if (toYear) toYear.value = defaultYear;
};

// Features: Populate feature select
const populateFeatureSelect = async (level) => {
  const select = document.getElementById('featureSelect');
  if (!select) return;
  
  select.innerHTML = '<option value="">Loading...</option>';
  
  const data = await loadAdmin(level);
  if (!data?.features) {
    select.innerHTML = '<option value="">Select feature</option>';
    return;
  }
  
  const propName = getPropName(level);
  const names = [...new Set(
    data.features
      .map(f => String(f.properties?.[propName] || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  
  populateSelect('featureSelect', 
    names.map(n => ({ value: n, text: n })), 
    'Select feature'
  );
  
  // Update boundary layer
  if (state.boundaryLayer) {
    state.map.removeLayer(state.boundaryLayer);
  }
  
  state.boundaryLayer = L.geoJSON(data, {
    style: { color: "#3388ff", weight: 1, fillOpacity: 0 },
    onEachFeature: (feature, layer) => {
      const name = String(feature.properties?.[propName] || '(no name)').trim();
      layer.bindPopup(name);
      layer.on('click', () => {
        if (state.boundaryLayer) state.boundaryLayer.resetStyle();
        layer.setStyle({ color: 'red', weight: 2, fillOpacity: 0.08 });
        state.selectedFeatureGeoJSON = feature;
        state.selectedFeatureName = name;
        
        const featureSelect = document.getElementById('featureSelect');
        if (featureSelect) featureSelect.value = name;
      });
    }
  }).addTo(state.map);
  
  // Fit bounds
  if (state.boundaryLayer?.getBounds()?.isValid()) {
    state.map.fitBounds(state.boundaryLayer.getBounds(), { maxZoom: 7 });
  }
};

// Request: Build request body
const buildRequestBody = () => {
  const getValue = (id) => document.getElementById(id)?.value || '';
  
  const dataset = getValue('datasetSelect');
  if (!dataset) {
    alert('Choose a dataset');
    return null;
  }
  
  const index = getValue('indexSelect');
  const startDate = `${getValue('fromYear')}-${getValue('fromMonth').padStart(2, '0')}-${getValue('fromDay').padStart(2, '0')}`;
  const endDate = `${getValue('toYear')}-${getValue('toMonth').padStart(2, '0')}-${getValue('toDay').padStart(2, '0')}`;
  
  // Map UI dataset names to backend
  const backendDataset = dataset === 'ndvi' ? 'sentinel2' : dataset === 'dw' ? 'landcover' : dataset;
  
  const body = { dataset: backendDataset, index, startDate, endDate };
  
  if (state.selectedGeometry) {
    body.geometry = state.selectedGeometry;
  } else if (state.selectedFeatureGeoJSON) {
    body.geometry = state.selectedFeatureGeoJSON.geometry;
  } else {
    const bounds = state.map.getBounds();
    body.bbox = {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth()
    };
  }
  
  return body;
};

// Legend: Show legend
const showLegend = (index, dataset, legendData = {}) => {
  if (!state.legendControl) return;
  
  let html = `<h4 style="margin:0 0 6px 0;">${index || dataset}</h4>`;
  html += `<div style="font-size:12px;margin-bottom:6px;">Dataset: ${dataset}</div>`;
  
  // Landcover discrete classes
  if (dataset === 'landcover' && Array.isArray(legendData.unique_classes)) {
    html += `<h4 style="margin:0 0 6px 0;">Land Cover Classes (AOI)</h4>`;
    legendData.unique_classes.forEach((c, i) => {
      // Handle both hex colors and RGB arrays
      let color = '#ccc';
      if (c.color) {
        if (typeof c.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.color)) {
          color = c.color;
        } else if (Array.isArray(c.color) && c.color.length >= 3) {
          // Convert RGB array to hex
          const [r, g, b] = c.color;
          color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
      }
      const name = c.name || `Class ${i + 1}`;
      html += `<div style="display:flex;align-items:center;margin:4px 0;">
                 <span style="width:18px;height:18px;background:${color};display:inline-block;margin-right:8px;border:1px solid #999;"></span>${name}
               </div>`;
    });
  } else if (legendData.meta?.palette?.length && legendData.meta.min !== undefined && legendData.meta.max !== undefined) {
    // Continuous gradient
    const { palette, min, max } = legendData.meta;
    const gradient = palette.join(',');
    const mid = ((min + max) / 2).toFixed(2);
    
    html += `
      <div style="height:18px;border-radius:3px;overflow:hidden;border:1px solid #ccc;margin:8px 0;">
        <div style="width:100%;height:100%;background:linear-gradient(to right,${gradient})"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span>${min.toFixed(2)}</span>
        <span>${mid}</span>
        <span>${max.toFixed(2)}</span>
      </div>`;
  } else {
    html += `<div style="font-size:12px;color:#888;">No legend available</div>`;
  }
  
  state.legendControl.update(html);
};

// Actions: View selection
const viewSelection = async () => {
  const body = buildRequestBody();
  if (!body) return;
  
  try {
    const response = await fetch(`${BACKEND}/gee_layers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      const msg = data?.detail || data?.message || `Status ${response.status}`;
      if (msg.toLowerCase().includes('no modis lst')) {
        alert("VHI computation failed: No MODIS LST images found. Try expanding date range or selecting a larger AOI.");
      } else {
        alert(`View failed: ${msg}`);
      }
      if (data) {
        const legendData = body.dataset === 'landcover' 
          ? { unique_classes: data.unique_classes || [] }
          : data.legend || {};
        showLegend(body.index, body.dataset, legendData);
      }
      return;
    }
    
    const tileUrl = data?.tiles || data?.mode_tiles || data?.tile;
    if (!tileUrl) {
      alert("No tiles returned by backend.");
      return;
    }
    
    clearOverlayLayers();
    addOverlayTile(tileUrl, { attribution: data.attribution || '' });
    
    const legendData = body.dataset === 'landcover'
      ? { unique_classes: data.unique_classes || [] }
      : data.legend || {};
    showLegend(body.index, body.dataset, legendData);
    
    // Fit bounds
    if (Array.isArray(data.bounds) && data.bounds.length === 4) {
      const [west, south, east, north] = data.bounds;
      state.map.fitBounds([[south, west], [north, east]], { maxZoom: 12 });
    } else if (state.selectedFeatureGeoJSON || state.selectedGeometry) {
      const geom = state.selectedFeatureGeoJSON?.geometry || state.selectedGeometry;
      const gj = L.geoJSON(geom);
      state.map.fitBounds(gj.getBounds(), { maxZoom: 12 });
    }
    
    alert('Visualization added.');
  } catch (err) {
    console.error('viewSelection error:', err);
    alert(`View failed: ${err.message}`);
  }
};

// Actions: Download selection
const downloadSelection = async () => {
  const body = buildRequestBody();
  if (!body) return;
  
  try {
    const response = await fetch(`${BACKEND}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Download failed [${response.status}]`);
    }
    
    const blob = await response.blob();
    const safeName = state.selectedFeatureName?.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_') || '';
    const filename = `${body.dataset}_${body.index || 'all'}_${body.startDate}_to_${body.endDate}${safeName ? '_' + safeName : ''}.tif`;
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);
    }, 1500);
    
    alert(`Download started: ${filename}`);
  } catch (err) {
    console.error('downloadSelection error:', err);
    alert(`Download failed: ${err.message}`);
  }
};

// Map: Initialize
const initMap = () => {
  state.map = L.map('map', { center: [9.145, 40.4897], zoom: 6 });
  ensureOverlayPane();
  
  // Basemaps
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(state.map);
  
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri & contributors',
    maxZoom: 19
  });
  
  L.control.layers({ Street: street, Satellite: satellite }, null, { collapsed: false }).addTo(state.map);
  
  // Overlay control
  const OverlayControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: () => {
      const div = L.DomUtil.create('div', 'overlay-ui');
      Object.assign(div.style, {
        background: 'white',
        padding: '6px',
        marginTop: '6px',
        borderRadius: '4px',
        boxShadow: '0 0 6px rgba(0,0,0,0.2)'
      });
      div.innerHTML = `<label style="display:flex;align-items:center;gap:6px;"><input id="overlayToggle" type="checkbox" checked /> Overlay</label>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  state.map.addControl(new OverlayControl());
  
  // Drawing controls
  state.drawnItems = new L.FeatureGroup().addTo(state.map);
  const drawControl = new L.Control.Draw({
    draw: { polygon: false, circle: false, marker: false, polyline: false, rectangle: true },
    edit: { featureGroup: state.drawnItems }
  });
  state.map.addControl(drawControl);
  
  state.map.on('draw:created', (e) => {
    state.drawnItems.clearLayers();
    state.drawnItems.addLayer(e.layer);
    state.selectedGeometry = e.layer.toGeoJSON().geometry;
    state.selectedFeatureGeoJSON = null;
    state.selectedFeatureName = null;
    if (state.boundaryLayer) state.boundaryLayer.resetStyle();
  });
  
  state.map.on('draw:deleted', () => {
    state.selectedGeometry = null;
  });
  
  // Legend control
  state.legendControl = L.control({ position: 'bottomleft' });
  state.legendControl.onAdd = function() {
    this._div = L.DomUtil.create('div', 'info legend');
    Object.assign(this._div.style, {
      backgroundColor: 'white',
      padding: '10px',
      borderRadius: '5px',
      boxShadow: '0 0 10px rgba(0,0,0,0.4)',
      maxWidth: '300px'
    });
    this.update('');
    return this._div;
  };
  state.legendControl.update = function(html) {
    this._div.innerHTML = html || '';
  };
  state.legendControl.addTo(state.map);
};

// Event: Feature select change
const handleFeatureSelectChange = debounce(async (name) => {
  state.selectedFeatureName = name || null;
  
  if (!name) {
    if (state.boundaryLayer) state.boundaryLayer.resetStyle();
    state.selectedFeatureGeoJSON = null;
    return;
  }
  
  const level = document.getElementById('adminLevel')?.value || '';
  const data = await loadAdmin(level);
  if (!data) return;
  
  const propName = getPropName(level);
  const feature = data.features.find(f => 
    String(f.properties?.[propName] || '').trim() === name
  );
  
  if (feature) {
    state.selectedFeatureGeoJSON = feature;
    
    if (state.boundaryLayer) {
      state.boundaryLayer.resetStyle();
      state.boundaryLayer.eachLayer(layer => {
        if (layer.feature === feature) {
          layer.setStyle({ color: 'red', weight: 2, fillOpacity: 0 });
          state.map.fitBounds(layer.getBounds(), { maxZoom: 10 });
        }
      });
    }
  }
}, 200);

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initMap();
    
    // Populate date controls
    const fromMonth = document.getElementById('fromMonth');
    const toMonth = document.getElementById('toMonth');
    const fromDay = document.getElementById('fromDay');
    const toDay = document.getElementById('toDay');
    
    if (fromMonth && toMonth && fromDay && toDay) {
      populateMonths(fromMonth);
      populateMonths(toMonth);
      populateDays(fromDay);
      populateDays(toDay);
      
      // Set defaults
      fromMonth.value = '7';
      toMonth.value = '9';
      fromDay.value = '1';
      toDay.value = '30';
    }
    
    // Dataset select handler
    const datasetSelect = document.getElementById('datasetSelect');
    if (datasetSelect) {
      datasetSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        populateIndexOptions(value);
        populateYearsForDataset(value);
      });
      
      // Initialize if dataset pre-selected
      if (datasetSelect.value) {
        populateIndexOptions(datasetSelect.value);
        populateYearsForDataset(datasetSelect.value);
      }
    }
    
    // Admin level handler
    const adminLevel = document.getElementById('adminLevel');
    if (adminLevel) {
      if (!Array.from(adminLevel.options).some(opt => opt.value === '')) {
        adminLevel.insertBefore(createOption('', 'Select admin level'), adminLevel.firstChild);
      }
      adminLevel.value = '';
      
      adminLevel.addEventListener('change', async (e) => {
        await populateFeatureSelect(e.target.value);
      });
    }
    
    // Feature select handler
    const featureSelect = document.getElementById('featureSelect');
    if (featureSelect) {
      featureSelect.addEventListener('change', (e) => {
        handleFeatureSelectChange(e.target.value?.trim());
      });
    }
    
    // Overlay toggle handler
    document.addEventListener('change', (e) => {
      if (e.target?.id === 'overlayToggle') {
        state.overlayVisible = e.target.checked;
        setOverlayVisibility(state.overlayVisible);
      }
    });
    
    // Action buttons
    document.getElementById('viewSelectionBtn')?.addEventListener('click', viewSelection);
    document.getElementById('downloadSelectionBtn')?.addEventListener('click', downloadSelection);
    
    console.log('App initialized successfully');
  } catch (err) {
    console.error('Initialization failed:', err);
  }
});

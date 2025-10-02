// script.js (complete)
const BACKEND = (window.BACKEND_URL || 'https://your-backend.example.com'); // change to your backend
let map, drawnItems, overlayGroup, currentTileLayer;
let selectedGeometry = null;
let selectedFeatureGeoJSON = null;

// dataset -> indices mapping and year ranges
const DATASET_CONFIG = {
  landcover: {
    label: "Land cover",
    indicesLabel: "Select land cover",
    indices: [{v:'dynamic_world', t:'Dynamic World (10m)'}],
    yearRange: [2020, new Date().getFullYear()] // DW available from ~2020
  },
  sentinel2: {
    label: "Sentinel-2",
    indicesLabel: "Select vegetation index",
    indices: [
      {v:'NDVI', t:'NDVI'},
      {v:'EVI', t:'EVI (not implemented here)'},
      {v:'NDBI', t:'NDBI'},
      {v:'NDWI', t:'NDWI'},
      {v:'NBR', t:'NBR'},
      {v:'NDCI', t:'NDCI'}
    ],
    yearRange: [2015, new Date().getFullYear()]
  },
  landsat8: {
    label: "Landsat 8",
    indicesLabel: "Select vegetation index",
    indices: [
      {v:'NDVI', t:'NDVI'},
      {v:'NDBI', t:'NDBI'},
      {v:'NDWI', t:'NDWI'},
      {v:'NBR', t:'NBR'},
      {v:'NDCI', t:'NDCI'} ],
    yearRange: [2013, new Date().getFullYear()]
  },
  modis: {
    label: "MODIS",
    indicesLabel: "Select vegetation index",
    indices: [
      {v:'NDVI', t:'NDVI'},
      {v:'NDWI', t:'NDWI'},
      {v:'NBR', t:'NBR'},
      {v:'NDBI', t:'NDBI'},
      {v:'NDCI', t:'NDCI'} ],
    yearRange: [2000, new Date().getFullYear()]
  },
  climate: {
    label: "Climate",
    indicesLabel: "Select drought index",
    indices: [
      {v:'SPI', t:'SPI'},
      {v:'VHI', t:'VHI'}
    ],
    yearRange: [1981, new Date().getFullYear()]
  }
};

function initMap() {
  map = L.map('map', { center: [9.0, 39.0], zoom: 6 });
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
  L.control.layers({'Street': street, 'Satellite': satellite}, null, {collapsed:false}).addTo(map);

  overlayGroup = L.layerGroup().addTo(map);

  // drawing control (rectangle)
  drawnItems = new L.FeatureGroup().addTo(map);
  const drawControl = new L.Control.Draw({
    draw: { polygon:false, polyline:false, marker:false, circle:false, rectangle:true },
    edit: { featureGroup: drawnItems }
  });
  map.addControl(drawControl);

  map.on('draw:created', function(e){
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    selectedGeometry = e.layer.toGeoJSON().geometry;
    // clear selected feature from admin list
    document.getElementById('featureSelect').value = '';
    selectedFeatureGeoJSON = null;
  });

  map.on('draw:edited', function(e){
    const layers = e.layers;
    layers.eachLayer(layer => {
      selectedGeometry = layer.toGeoJSON().geometry;
    });
  });

  map.on('draw:deleted', function(){
    selectedGeometry = null;
  });

  map.on('baselayerchange', () => {
    // make sure overlays stay visible
    if (overlayGroup && !map.hasLayer(overlayGroup)) map.addLayer(overlayGroup);
    if (currentTileLayer && currentTileLayer.bringToFront) currentTileLayer.bringToFront();
  });
}

// UI helpers
function populateIndexOptions(datasetKey) {
  const indexSelect = document.getElementById('indexSelect');
  const indexLabel = document.getElementById('indexLabel');
  indexSelect.innerHTML = '';
  if (!datasetKey) {
    indexLabel.textContent = 'Select option';
    indexSelect.innerHTML = '<option value="">-- choose --</option>';
    return;
  }
  const cfg = DATASET_CONFIG[datasetKey];
  indexLabel.textContent = cfg.indicesLabel;
  cfg.indices.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.v;
    o.textContent = opt.t;
    indexSelect.appendChild(o);
  });
}

function populateYears(datasetKey) {
  const sel = document.getElementById('yearSelect');
  sel.innerHTML = '';
  const cfg = DATASET_CONFIG[datasetKey] || { yearRange: [2000, new Date().getFullYear()] };
  const [start, end] = cfg.yearRange;
  for (let y = end; y >= start; y--) {
    const o = document.createElement('option'); o.value = String(y); o.textContent = String(y); sel.appendChild(o);
  }
}

function populateMonths() {
  const m = document.getElementById('monthSelect');
  m.innerHTML = '';
  for (let i=1;i<=12;i++){
    const o = document.createElement('option'); o.value = String(i); o.textContent = String(i).padStart(2,'0'); m.appendChild(o);
  }
}

function populateDaysForMonth(year, month) {
  const d = document.getElementById('daySelect');
  d.innerHTML = '';
  const lastDay = new Date(year, month, 0).getDate();
  for (let i=1;i<=lastDay;i++){
    const o = document.createElement('option'); o.value = String(i); o.textContent = String(i).padStart(2,'0'); d.appendChild(o);
  }
}

// Admin features loader (levels 1/2/3)
let adminGeojson = null; // loaded once
async function loadAdminGeojson() {
  if (adminGeojson) return adminGeojson;
  try {
    const url = 'https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson';
    const r = await fetch(url);
    const data = await r.json();
    adminGeojson = data;
    return data;
  } catch (err) {
    console.error('Failed to load admin GeoJSON', err);
    return null;
  }
}

async function populateAdminFeatures(levelKey) {
  const sel = document.getElementById('featureSelect');
  sel.innerHTML = '<option value="">-- choose feature --</option>';
  const data = await loadAdminGeojson();
  if (!data) return;
  // admin GeoJSON currently has ADM1/ADM2/ADM3 properties; adapt as needed
  data.features.forEach(f => {
    let name = '';
    if (levelKey === 'adm1') name = f.properties.ADM1_EN || f.properties.ADM1 || f.properties.NAME_1;
    if (levelKey === 'adm2') name = f.properties.ADM2_EN || f.properties.ADM2 || f.properties.NAME_2;
    if (levelKey === 'adm3') name = f.properties.ADM3_EN || f.properties.ADM3 || f.properties.NAME_3;
    if (!name) return;
    // avoid duplicates
    if (![...sel.options].some(o => o.text === name)) {
      const o = document.createElement('option'); o.value = name; o.textContent = name; sel.appendChild(o);
    }
  });
}

// build request body for gee endpoints using selected UI values
function buildRequestBody() {
  const dataset = document.getElementById('datasetSelect').value;
  const index = document.getElementById('indexSelect').value;
  const year = document.getElementById('yearSelect').value;
  const month = document.getElementById('monthSelect').value;
  const day = document.getElementById('daySelect').value;

  let startDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  let endDate = startDate; // single-day by default (you could expand to whole month)

  let bbox = null;
  if (selectedGeometry) {
    // use geometry drawn
  } else if (selectedFeatureGeoJSON) {
    // pass geometry
  } else {
    // default to current map bounds
    const b = map.getBounds();
    bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  }

  const body = { dataset, index, startDate, endDate };
  if (selectedGeometry) body.geometry = selectedGeometry;
  else if (selectedFeatureGeoJSON) body.geometry = selectedFeatureGeoJSON.geometry;
  else body.bbox = bbox;
  return body;
}

// show legend in sidebar (simple)
function showLegend(index, vis_params, dataset) {
  const el = document.getElementById('index-legend');
  el.style.display = 'block';
  if (dataset === 'landcover') {
    // basic dynamic world legend example
    el.innerHTML = `<h4>Land cover (Dynamic World)</h4>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div><span style="display:inline-block;width:18px;height:12px;background:#419bdf;margin-right:8px"></span>Water</div>
        <div><span style="display:inline-block;width:18px;height:12px;background:#397d49;margin-right:8px"></span>Trees</div>
        <div><span style="display:inline-block;width:18px;height:12px;background:#88b053;margin-right:8px"></span>Grass</div>
        <div><span style="display:inline-block;width:18px;height:12px;background:#e49635;margin-right:8px"></span>Crops</div>
      </div>`;
    return;
  }
  // default simple legend
  el.innerHTML = `<h4>${index}</h4><div class="small">Visualization from ${dataset}</div>`;
}

// perform visualization request
async function viewSelection() {
  const body = buildRequestBody();
  if (!body.dataset || !body.index) { alert('Select dataset and option'); return; }
  try {
    const res = await fetch(`${BACKEND}/gee_layers`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    if (!res.ok) { const t = await res.text(); throw new Error(t); }
    const data = await res.json();
    // clear previous overlay
    overlayGroup.clearLayers();
    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
      currentTileLayer = null;
    }
    const tileUrl = data.mode_tiles || data.tiles || data.mode_tiles || data.mode_tiles || data.tile || data.tiles;
    const tiles = tileUrl || data.tiles;
    if (!tiles) {
      alert('Backend did not return tiles for visualization');
      return;
    }
    currentTileLayer = L.tileLayer(tiles, { opacity: 0.85 }).addTo(overlayGroup);
    showLegend(body.index, data.vis_params, body.dataset);
    // zoom to geometry if available
    if (body.geometry) {
      try {
        const gj = body.geometry;
        const layer = L.geoJSON(gj);
        map.fitBounds(layer.getBounds(), { maxZoom: 12 });
      } catch (e) { /* ignore */ }
    } else if (body.bbox) {
      map.fitBounds([[body.bbox.south, body.bbox.west],[body.bbox.north, body.bbox.east]]);
    }
  } catch (err) {
    console.error('View error', err);
    alert('View failed: ' + err.message);
  }
}

// perform download request
async function downloadSelection() {
  const body = buildRequestBody();
  if (!body.dataset || !body.index) { alert('Select dataset and option'); return; }

  try {
    const res = await fetch(`${BACKEND}/download`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg);
    }
    const blob = await res.blob();
    const filename = `${body.dataset}_${body.index}_${body.startDate}.tif`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=> {
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);
    }, 1500);
  } catch (err) {
    console.error('Download error', err);
    alert('Download failed: ' + (err.message || err));
  }
}

// initialize UI wiring
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  populateMonths();
  populateIndexOptions();
  populateYears('sentinel2'); // defaults
  populateDaysForMonth(new Date().getFullYear(), 1);

  document.getElementById('datasetSelect').addEventListener('change', (e) => {
    const ds = e.target.value;
    populateIndexOptions(ds);
    populateYears(ds);
    const year = document.getElementById('yearSelect').value;
    populateDaysForMonth(parseInt(year,10), parseInt(document.getElementById('monthSelect').value,10));
  });

  document.getElementById('monthSelect').addEventListener('change', (e) => {
    const year = parseInt(document.getElementById('yearSelect').value,10);
    const month = parseInt(e.target.value,10);
    populateDaysForMonth(year, month);
  });

  document.getElementById('yearSelect').addEventListener('change', (e) => {
    const year = parseInt(e.target.value,10);
    const month = parseInt(document.getElementById('monthSelect').value,10);
    populateDaysForMonth(year, month);
  });

  document.getElementById('viewBtn').addEventListener('click', viewSelection);
  document.getElementById('downloadBtn').addEventListener('click', downloadSelection);

  document.getElementById('adminLevel').addEventListener('change', (e) => {
    populateAdminFeatures(e.target.value);
  });

  document.getElementById('featureSelect').addEventListener('change', async (e) => {
    const name = e.target.value;
    if (!name) {
      selectedFeatureGeoJSON = null;
      return;
    }
    const data = await loadAdminGeojson();
    const feat = data.features.find(f => (f.properties.ADM3_EN === name || f.properties.ADM2_EN === name || f.properties.ADM1_EN === name || f.properties.ADM3 === name));
    if (!feat) {
      // try other matches
      const f2 = data.features.find(f => JSON.stringify(f.properties).includes(name));
      if (f2) selectedFeatureGeoJSON = f2;
      else selectedFeatureGeoJSON = null;
    } else selectedFeatureGeoJSON = feat;

    // show selection on map
    if (selectedFeatureGeoJSON) {
      drawnItems.clearLayers();
      const layer = L.geoJSON(selectedFeatureGeoJSON, { style:{ color:'red', weight:2, fillOpacity:0.1 } }).addTo(map);
      map.fitBounds(layer.getBounds());
    }
  });

  // preload admin features default
  populateAdminFeatures('adm3');
});

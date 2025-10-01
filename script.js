// script.js (complete)
const BACKEND_URL = 'https://hafrepo-2.onrender.com'; // keep your backend URL

let map, drawnItems, overlayGroup;
let selectedArea = null;
let selectedDistrict = null;
let selectedDistrictGeoJSON = null;
let currentLayers = {};   // { ndvi: L.TileLayer, dw: L.TileLayer }
let currentDataset = null;

function getSelectedDateRange() {
    const yearEl = document.getElementById('yearSelect');
    const mStartEl = document.getElementById('monthStart');
    const mEndEl = document.getElementById('monthEnd');
    if (!yearEl || !mStartEl || !mEndEl) return null;

    const year = parseInt(yearEl.value, 10);
    const ms = parseInt(mStartEl.value, 10);
    const me = parseInt(mEndEl.value, 10);
    const mStart = Math.min(ms, me);
    const mEnd = Math.max(ms, me);

    const startDate = `${year}-${String(mStart).padStart(2,'0')}-01`;
    const lastDay = new Date(year, mEnd, 0).getDate();
    const endDate = `${year}-${String(mEnd).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    return { startDate, endDate };
}

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=> {
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
    }, 2000);
}

function updateOverlayOpacity() {
    const toggle = document.getElementById('overlay-toggle');
    const opacity = (toggle && toggle.checked) ? 1.0 : 0.0;
    Object.values(currentLayers).forEach(l => {
        if (l && l.setOpacity) l.setOpacity(opacity);
    });
}

function updateNDVILegend() {
    const el = document.getElementById('ndvi-legend');
    if (!el) return;
    el.innerHTML = `
      <h4>NDVI legend</h4>
      <div style="display:flex; gap:8px; align-items:center;">
        <div style="width:18px;height:12px;background:#d73027"></div><small>-1 (low)</small>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <div style="width:18px;height:12px;background:#fee08b"></div><small>0 (medium)</small>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <div style="width:18px;height:12px;background:#1a9850"></div><small>1 (high)</small>
      </div>
    `;
}

function updateDWLegend(legendData) {
    const el = document.getElementById('dw-legend');
    if (!el) return;
    if (!legendData || !legendData.classes || !legendData.colors) {
        el.innerHTML = `<h4>Land Cover</h4><div>No legend available</div>`;
        return;
    }
    el.innerHTML = '<h4>Land Cover Classes</h4>' + legendData.classes.map((c, i) => {
        const color = legendData.colors[i] ? `#${legendData.colors[i]}` : '#ccc';
        return `<div style="display:flex;gap:8px;align-items:center;"><div style="width:18px;height:12px;background:${color}"></div><small>${c}</small></div>`;
    }).join('');
}

function ensureOverlayPresent() {
    // Make sure overlayGroup is on the map (fixes disappearance when basemapchanged)
    if (!map) return;
    if (!map.hasLayer(overlayGroup)) map.addLayer(overlayGroup);
    // bring overlay tile layers to front
    Object.values(currentLayers).forEach(l => { if (l && l.bringToFront) l.bringToFront(); });
}

function initializeMap() {
    if (map) return;

    map = L.map('map', { center:[9.145,40.4897], zoom:6, layers: [] });

    const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });

    // Add layer control for base maps only. Overlays will be managed manually (prevents odd removal on basemap change).
    const baseMaps = { "Street Map": streetMap, "Satellite Map": satelliteMap };
    L.control.layers(baseMaps, null, { collapsed: false }).addTo(map);

    // Overlay group where we will add NDVI/DW tile layers. Keep this separate.
    overlayGroup = L.layerGroup().addTo(map);

    // Load admin boundaries and populate district dropdown
    fetch('https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson')
      .then(r => r.json())
      .then(data => {
          const boundaryLayer = L.geoJSON(data, {
              style: { color:'#3388ff', weight:1, fillOpacity:0 },
              onEachFeature: (feature, layer) => {
                  const sel = document.getElementById('districtSelect');
                  const opt = document.createElement('option');
                  opt.value = feature.properties.ADM3_EN;
                  opt.textContent = feature.properties.ADM3_EN;
                  sel.appendChild(opt);

                  layer.on('click', () => {
                      if (selectedDistrict) map.removeLayer(selectedDistrict);
                      selectedDistrict = L.geoJSON(feature, { style: { color:'red', weight:2, fillOpacity:0.1 } }).addTo(map);
                      selectedDistrictGeoJSON = feature;
                      document.getElementById('districtSelect').value = feature.properties.ADM3_EN;
                      drawnItems.clearLayers();
                      selectedArea = null;
                      ensureOverlayPresent();
                  });
              }
          }).addTo(map);
          map.fitBounds(boundaryLayer.getBounds());
      })
      .catch(err => console.error('Failed to load boundary:', err));

    // Draw control
    drawnItems = new L.FeatureGroup().addTo(map);
    const drawControl = new L.Control.Draw({
        draw: { rectangle: true, polygon: false, circle: false, marker: false, polyline: false },
        edit: { featureGroup: drawnItems }
    });
    map.addControl(drawControl);

    map.on('draw:created', e => {
        drawnItems.clearLayers();
        selectedArea = e.layer;
        drawnItems.addLayer(selectedArea);
        if (selectedDistrict) { map.removeLayer(selectedDistrict); selectedDistrict = null; selectedDistrictGeoJSON = null; document.getElementById('districtSelect').value = ''; }
        // clear current visual overlays to avoid confusion
        overlayGroup.clearLayers();
        currentLayers = {};
        currentDataset = null;
        ensureOverlayPresent();
    });

    map.on('baselayerchange', () => {
        // ensure our overlay group remains visible and its tiles on top after a basemap change
        ensureOverlayPresent();
    });

    // overlay toggle
    const overlayToggle = document.getElementById('overlay-toggle');
    if (overlayToggle) {
        overlayToggle.addEventListener('change', updateOverlayOpacity);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // populate years/months
    const yearSelect = document.getElementById('yearSelect');
    const monthStart = document.getElementById('monthStart');
    const monthEnd = document.getElementById('monthEnd');
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2016; y--) {
        const o = document.createElement('option'); o.value = String(y); o.text = String(y); yearSelect.appendChild(o);
    }
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let m=1;m<=12;m++){
        const o = document.createElement('option'); o.value = String(m); o.text = `${String(m).padStart(2,'0')} (${monthNames[m-1]})`; monthStart.appendChild(o);
        monthEnd.appendChild(o.cloneNode(true));
    }
    yearSelect.value = String(currentYear); monthStart.value = '1'; monthEnd.value = '12';

    try {
        initializeMap();
    } catch (err) {
        console.error('Map init failed', err);
        const md = document.getElementById('map'); if (md) md.innerHTML = '<p style="color:red">Map failed to initialize</p>';
    }

    // --- View Selection ---
    document.getElementById('viewSelectionBtn').addEventListener('click', async () => {
        const dataset = document.getElementById('datasetSelect').value;
        if (!(dataset === 'ndvi' || dataset === 'dw')) { alert('Select NDVI or DW'); return; }

        let bounds;
        if (selectedDistrict) bounds = selectedDistrict.getBounds();
        else if (selectedArea) bounds = selectedArea.getBounds();
        else { alert('Select district or draw area'); return; }

        const dateRange = getSelectedDateRange();
        if (!dateRange) { alert('Invalid dates'); return; }

        // build body
        const body = { ...dateRange, bbox: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } };
        if (selectedDistrictGeoJSON) body.geometry = selectedDistrictGeoJSON.geometry;
        if (selectedArea) body.geometry = selectedArea.toGeoJSON().geometry;

        try {
            const res = await fetch(`${BACKEND_URL}/gee_layers`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();

            // clear previous overlays
            overlayGroup.clearLayers();
            currentLayers = {};
            currentDataset = dataset;

            if (dataset === 'ndvi' && data.ndvi && data.ndvi.tiles) {
                const turl = data.ndvi.tiles;
                currentLayers.ndvi = L.tileLayer(turl, { opacity:1.0, attribution: 'NDVI' }).addTo(overlayGroup);
                updateNDVILegend();
                document.getElementById('ndvi-legend').style.display = 'block';
                document.getElementById('dw-legend').style.display = 'none';
            } else if (dataset === 'dw' && data.dw && data.dw.mode_tiles) {
                currentLayers.dw = L.tileLayer(data.dw.mode_tiles, { opacity:0.85, attribution: 'DW (mode)' }).addTo(overlayGroup);
                updateDWLegend(data.dw.legend || {});
                document.getElementById('ndvi-legend').style.display = 'none';
                document.getElementById('dw-legend').style.display = 'block';
            } else {
                alert('Backend returned no layer URLs for the selected dataset');
                return;
            }

            // ensure overlays visible and on top
            ensureOverlayPresent();
            updateOverlayOpacity();
            map.fitBounds(bounds);
            alert(`${dataset.toUpperCase()} added to map`);
        } catch (err) {
            console.error('ViewSelection error', err);
            alert('Failed to load layer: ' + err.message);
        }
    });

    // --- Download Selection ---
    document.getElementById('downloadSelectionBtn').addEventListener('click', async () => {
        const dataset = document.getElementById('datasetSelect').value;
        let bounds;
        if (selectedDistrict) bounds = selectedDistrict.getBounds();
        else if (selectedArea) bounds = selectedArea.getBounds();
        else { alert('Select district or draw area'); return; }

        const dateRange = getSelectedDateRange();
        if (!dateRange) { alert('Invalid dates'); return; }

        const body = { ...dateRange, bbox: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } };
        if (selectedDistrictGeoJSON) body.geometry = selectedDistrictGeoJSON.geometry;
        if (selectedArea) body.geometry = selectedArea.toGeoJSON().geometry;

        try {
            if (dataset === 'ndvi') {
                const res = await fetch(`${BACKEND_URL}/ndvi/download`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
                if (!res.ok) throw new Error(await res.text());
                const blob = await res.blob();
                downloadBlob(blob, `NDVI_${dateRange.startDate}_to_${dateRange.endDate}.tif`);
            } else if (dataset === 'dw') {
                // DW download endpoint added in backend
                const res = await fetch(`${BACKEND_URL}/dw/download`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
                if (!res.ok) throw new Error(await res.text());
                const blob = await res.blob();
                downloadBlob(blob, `DW_${dateRange.startDate}_to_${dateRange.endDate}.tif`);
            } else {
                alert('Select NDVI or DW to download');
                return;
            }
        } catch (err) {
            console.error('Download error', err);
            alert('Download failed: ' + err.message);
        }
    });

    // district dropdown changes
    document.getElementById('districtSelect').addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) {
            if (selectedDistrict) map.removeLayer(selectedDistrict);
            selectedDistrict = null;
            selectedDistrictGeoJSON = null;
            return;
        }
        // fetch geojson and select the feature
        fetch('https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson')
          .then(r => r.json())
          .then(data => {
              const feature = data.features.find(f => f.properties.ADM3_EN === val);
              if (!feature) return;
              if (selectedDistrict) map.removeLayer(selectedDistrict);
              selectedDistrict = L.geoJSON(feature, { style:{ color:'red', weight:2, fillOpacity:0.1 } }).addTo(map);
              selectedDistrictGeoJSON = feature;
              if (selectedArea) { drawnItems.clearLayers(); selectedArea = null; }
              map.fitBounds(selectedDistrict.getBounds());
              ensureOverlayPresent();
          });
    });
});

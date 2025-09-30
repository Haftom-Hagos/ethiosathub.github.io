let map, drawnItems, selectedArea, ndviLayer, landcoverLayer, districtLayer, highlighted;

const BACKEND_URL = 'https://hafrepo-2.onrender.com'; // Render backend URL

function getSelectedDateRange() {
    const yearEl = document.getElementById('yearSelect');
    const mStartEl = document.getElementById('monthStart');
    const mEndEl = document.getElementById('monthEnd');
    if (!yearEl || !mStartEl || !mEndEl) {
        console.error('Date selection elements not found');
        return null;
    }

    const year = parseInt(yearEl.value, 10);
    const ms = parseInt(mStartEl.value, 10);
    const me = parseInt(mEndEl.value, 10);
    const mStart = Math.min(ms, me);
    const mEnd = Math.max(ms, me);

    const startDate = `${year}-${String(mStart).padStart(2, '0')}-01`;
    const lastDay = new Date(year, mEnd, 0).getDate();
    const endDate = `${year}-${String(mEnd).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return { startDate, endDate };
}

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function initializeMap() {
    if (map) return;

    map = L.map('map', {
        center: [9.145, 40.4897],
        zoom: 6,
        layers: []
    });

    // Base maps
    const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    const satelliteMap = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Esri & contributors' }
    );

    const baseMaps = {
        "Street Map": streetMap,
        "Satellite Map": satelliteMap
    };

    // Add Admin Level-3 boundaries
    fetch('https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson')
      .then(res => res.json())
      .then(data => {
        const boundaryLayer = L.geoJSON(data, {
          style: {
            color: "#3388ff",
            weight: 1,
            fillOpacity: 0
          },
          onEachFeature: (feature, layer) => {
            layer.on('click', () => {
              // Highlight clicked district
              boundaryLayer.resetStyle();
              layer.setStyle({
                color: "red",
                weight: 2,
                fillOpacity: 0.1
              });

              // Optional: popup with district name
              if (feature.properties) {
                layer.bindPopup(`<b>${feature.properties.ADM3_EN}</b>`).openPopup();
              }

              // Here you can call your NDVI or land cover function for this polygon
              console.log("Clicked district:", feature.properties.ADM3_EN);
            });
          }
        }).addTo(map);

    // Zoom map to Ethiopia boundary
    map.fitBounds(boundaryLayer.getBounds());
  })
  .catch(err => console.error("Failed to load boundaries:", err));


    // --- Land Cover layer (Esri ImageServer) ---
    landcoverLayer = L.esri.imageMapLayer({
        url: "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer",
        attribution: "Esri, Impact Observatory, Microsoft"
    });

    // --- Drawing tools (still allow manual draw) ---
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        draw: { rectangle: true, polygon: false, circle: false, marker: false, polyline: false },
        edit: { featureGroup: drawnItems }
    });
    map.addControl(drawControl);

    map.on('draw:created', (e) => {
        drawnItems.clearLayers();
        selectedArea = e.layer;
        drawnItems.addLayer(selectedArea);
        if (ndviLayer) map.removeLayer(ndviLayer);
        console.log('Area drawn:', selectedArea.getBounds().toBBoxString());
    });

    // --- Layer control ---
    const overlayMaps = {
        "Land Cover (Sentinel-2)": landcoverLayer
        // NDVI layer will be added dynamically after request
    };

    L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

    // --- NDVI button (visualize) ---
    document.getElementById('viewNdviBtn').addEventListener('click', async () => {
        if (!selectedArea) {
            alert('Please select a district or draw an area first!');
            return;
        }
        const dateRange = getSelectedDateRange();
        if (!dateRange) {
            alert('Invalid date range');
            return;
        }

        const bounds = selectedArea.getBounds();
        const bbox = {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
        };

        try {
            const res = await fetch(`${BACKEND_URL}/ndvi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bbox, ...dateRange })
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (ndviLayer) map.removeLayer(ndviLayer);
            ndviLayer = L.imageOverlay(url, bounds).addTo(map);
            alert('NDVI visualized on the map!');
        } catch (err) {
            console.error('NDVI fetch error:', err);
            alert('Failed to fetch NDVI: ' + err.message);
        }
    });

    // --- NDVI button (download) ---
    document.getElementById('ndviBtn').addEventListener('click', async () => {
        if (!selectedArea) {
            alert('Please select a district or draw an area first!');
            return;
        }
        const dateRange = getSelectedDateRange();
        if (!dateRange) {
            alert('Invalid date range');
            return;
        }

        const bounds = selectedArea.getBounds();
        const bbox = {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
        };

        if (bbox.east - bbox.west > 2 || bbox.north - bbox.south > 2) {
            alert('Please draw a smaller area (max 2°x2°).');
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/ndvi/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bbox, ...dateRange })
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            downloadBlob(blob, `NDVI_${dateRange.startDate}_to_${dateRange.endDate}.tif`);
        } catch (err) {
            console.error('NDVI download error:', err);
            alert('Failed to download NDVI: ' + err.message);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const yearSelect = document.getElementById('yearSelect');
    const monthStart = document.getElementById('monthStart');
    const monthEnd = document.getElementById('monthEnd');

    if (yearSelect && monthStart && monthEnd) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= 2016; y--) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            yearSelect.appendChild(opt);
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (let m = 1; m <= 12; m++) {
            const opt1 = document.createElement('option');
            opt1.value = String(m);
            opt1.textContent = `${String(m).padStart(2, '0')} (${monthNames[m - 1]})`;
            monthStart.appendChild(opt1);
            monthEnd.appendChild(opt1.cloneNode(true));
        }

        yearSelect.value = String(currentYear);
        monthStart.value = '1';
        monthEnd.value = '12';
    }
    initializeMap();
});





const BACKEND_URL = 'https://hafrepo-2.onrender.com'; // Render backend URL 

let map, ndviLayer, dwLayer, drawnItems, selectedArea, selectedDistrict, selectedDistrictGeoJSON;
let currentLayers = {}; // Store layer refs for toggling
let currentDataset = null; // Track current visualized dataset ('ndvi' or 'dw')
let overlayGroup; // Group for overlays to preserve on basemap switch

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

function updateOverlayToggle() {
    const overlayToggle = document.getElementById('overlay-toggle');
    if (overlayToggle && currentLayers[currentDataset]) {
        currentLayers[currentDataset].setOpacity(overlayToggle.checked ? 1 : 0);
    }
}

function updateNDLegend() {
    const legendDiv = document.getElementById('ndvi-legend');
    if (!legendDiv) return;
    legendDiv.innerHTML = `
        <h4>NDVI Legend</h4>
        <div style="display: flex; align-items: center; margin-bottom: 5px;">
            <span style="display: inline-block; width: 20px; height: 20px; background: red; margin-right: 5px;"></span> Low (-1)
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 5px;">
            <span style="display: inline-block; width: 20px; height: 20px; background: yellow; margin-right: 5px;"></span> Medium (0)
        </div>
        <div style="display: flex; align-items: center;">
            <span style="display: inline-block; width: 20px; height: 20px; background: green; margin-right: 5px;"></span> High (1)
        </div>
    `;
}

function updateDWLegend(legendData) {
    if (!legendData || !document.getElementById('dw-legend')) return;

    const legendDiv = document.getElementById('dw-legend');
    legendDiv.innerHTML = '<h4>Land Cover Classes</h4>' + 
        legendData.classes.map((cls, i) => 
            `<div style="display: flex; align-items: center;"><span style="display: inline-block; width: 20px; height: 20px; background: #${legendData.colors[i]}; margin-right: 5px;"></span>${cls}</div>`
        ).join('');
}

function initializeMap() {
    if (map) return;

    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error('Map div not found!');
        return;
    }
    console.log('Map div found, size:', mapDiv.offsetHeight, mapDiv.offsetWidth);  // Debug log

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
    console.log('Basemap added');  // Debug log

    const satelliteMap = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Esri & contributors' }
    );

    // Overlay group for visualized layers (preserved on basemap switch)
    overlayGroup = L.layerGroup().addTo(map);

    const baseMaps = {
        "Street Map": streetMap,
        "Satellite Map": satelliteMap
    };

    // Layer control with overlays
    L.control.layers(baseMaps, { "Overlay": overlayGroup }, { collapsed: false }).addTo(map);

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
            const districtSelect = document.getElementById('districtSelect');
            const opt = document.createElement('option');
            opt.value = feature.properties.ADM3_EN;
            opt.textContent = feature.properties.ADM3_EN;
            districtSelect.appendChild(opt);

            layer.on('click', () => {
              boundaryLayer.resetStyle();
              layer.setStyle({
                color: "red",
                weight: 2,
                fillOpacity: 0.1
              });

              if (feature.properties) {
                layer.bindPopup(`<b>${feature.properties.ADM3_EN}</b>`).openPopup();
                selectedDistrict = layer;
                selectedDistrictGeoJSON = feature; 
                document.getElementById('districtSelect').value = feature.properties.ADM3_EN;
              }
            });
          }
        }).addTo(map);

        map.fitBounds(boundaryLayer.getBounds());
      })
      .catch(err => console.error("Failed to load boundaries:", err));

    // Drawing tools
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
        // Clear visualized layers on draw
        overlayGroup.clearLayers();
        currentLayers = {};
        currentDataset = null;
        updateOverlayToggle();
        console.log('Area drawn:', selectedArea.getBounds().toBBoxString());
        document.getElementById('districtSelect').value = '';
        selectedDistrict = null;
        selectedDistrictGeoJSON = null;
    });

    map.invalidateSize();  // Force resize check
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

    try {
        initializeMap();
    } catch (err) {
        console.error('Map init failed:', err);
        const mapDiv = document.getElementById('map');
        if (mapDiv) mapDiv.innerHTML = '<p style="color:red;">Map failed to load—check console.</p>';
    }

    // Overlay toggle event listener
    const overlayToggle = document.getElementById('overlay-toggle');
    if (overlayToggle) {
        overlayToggle.addEventListener('change', updateOverlayToggle);
    }

    // --- View Selection ---
    document.getElementById('viewSelectionBtn').addEventListener('click', async () => {
        const datasetSelect = document.getElementById('datasetSelect').value;
        const isGEE = datasetSelect === 'ndvi' || datasetSelect === 'dw';

        if (!isGEE) {
            alert('Please select NDVI or Dynamic World and a district or draw an area!');
            return;
        }

        let bounds;
        if (selectedDistrict) {
            bounds = selectedDistrict.getBounds();
        } else if (selectedArea) {
            bounds = selectedArea.getBounds();
        } else {
            alert('No valid area selected!');
            return;
        }

        const dateRange = getSelectedDateRange();
        if (!dateRange) {
            alert('Invalid date range');
            return;
        }

        try {
            // Prepare body for /gee_layers
            const body = { ...dateRange, bbox: {
                west: bounds.getWest(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                north: bounds.getNorth()
            }};
            if (selectedDistrict && selectedDistrictGeoJSON) {
                body.geometry = selectedDistrictGeoJSON.geometry;
            }

            const res = await fetch(`${BACKEND_URL}/gee_layers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
            const data = await res.json();

            // Clear previous
            overlayGroup.clearLayers();
            currentLayers = {};
            currentDataset = datasetSelect;

            // Add layer based on dataset
            if (datasetSelect === 'ndvi' && data.ndvi && data.ndvi.tiles) {
                currentLayers.ndvi = L.tileLayer(data.ndvi.tiles, { 
                    opacity: 1.0,
                    attribution: 'NDVI from GEE'
                });
                currentLayers.ndvi.addTo(overlayGroup);
                updateNDLegend();
                document.getElementById('ndvi-legend').style.display = 'block';
                document.getElementById('dw-legend').style.display = 'none';
            } else if (datasetSelect === 'dw' && data.dw && data.dw.mode_tiles) {
                currentLayers.dw = L.tileLayer(data.dw.mode_tiles, { 
                    opacity: 0.8,
                    attribution: 'DW Mode from GEE'
                });
                currentLayers.dw.addTo(overlayGroup);
                updateDWLegend(data.dw.legend);
                document.getElementById('ndvi-legend').style.display = 'none';
                document.getElementById('dw-legend').style.display = 'block';
            }

            // Default toggle on
            if (document.getElementById('overlay-toggle')) document.getElementById('overlay-toggle').checked = true;
            updateOverlayToggle();

            map.fitBounds(bounds);
            alert(`${datasetSelect.toUpperCase()} layer visualized on the map! Use toggle to show/hide.`);
        } catch (err) {
            console.error('GEE layers fetch error:', err);
            alert('Failed to fetch layers: ' + err.message);
        }
    });

    // --- Download Selection ---
    document.getElementById('downloadSelectionBtn').addEventListener('click', async () => {
        const datasetSelect = document.getElementById('datasetSelect').value;
        const isNDVI = datasetSelect === 'ndvi' && (selectedArea || selectedDistrict);

        if (!isNDVI) {
            alert('Please select NDVI and a district or draw an area for download!');
            return;
        }

        let bounds;
        if (selectedDistrict) {
            bounds = selectedDistrict.getBounds();
        } else if (selectedArea) {
            bounds = selectedArea.getBounds();
        } else {
            alert('No valid area selected!');
            return;
        }

        if (bounds.getEast() - bounds.getWest() > 2 || bounds.getNorth() - bounds.getSouth() > 2) {
            alert('Please select a smaller area (max 2°x2°).');
            return;
        }

        const dateRange = getSelectedDateRange();
        if (!dateRange) {
            alert('Invalid date range');
            return;
        }

        try {
            const body = { ...dateRange };
            if (selectedDistrict && selectedDistrictGeoJSON) {
                body.geometry = selectedDistrictGeoJSON.geometry;
                body.bbox = {
                    west: bounds.getWest(),
                    south: bounds.getSouth(),
                    east: bounds.getEast(),
                    north: bounds.getNorth()
                };
            } else {
                body.bbox = {
                    west: bounds.getWest(),
                    south: bounds.getSouth(),
                    east: bounds.getEast(),
                    north: bounds.getNorth()
                };
            }

            const res = await fetch(`${BACKEND_URL}/ndvi/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
            const blob = await res.blob();
            downloadBlob(blob, `NDVI_${dateRange.startDate}_to_${dateRange.endDate}.tif`);
        } catch (err) {
            console.error('NDVI download error:', err);
            alert('Failed to download NDVI: ' + err.message);
        }
    });

    // District dropdown selection
    document.getElementById('districtSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            drawnItems.clearLayers();
            selectedArea = null;
            // Clear visualized layers on district change
            overlayGroup.clearLayers();
            currentLayers = {};
            currentDataset = null;
            updateOverlayToggle();
            fetch('https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson')
                .then(res => res.json())
                .then(data => {
                    const feature = data.features.find(f => f.properties.ADM3_EN === e.target.value);
                    if (feature) {
                        if (selectedDistrict) map.removeLayer(selectedDistrict);
                        selectedDistrict = L.geoJSON(feature, {
                            style: { color: "red", weight: 2, fillOpacity: 0.1 }
                        }).addTo(map);
                        selectedDistrictGeoJSON = feature; 
                        map.fitBounds(selectedDistrict.getBounds());
                    }
                });
        } else {
            if (selectedDistrict) {
                map.removeLayer(selectedDistrict);
                selectedDistrict = null;
                selectedDistrictGeoJSON = null;
            }
        }
    });
});

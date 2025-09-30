const BACKEND_URL = 'https://hafrepo-2.onrender.com'; // Render backend URL

let map, landcoverLayer, ndviLayer, drawnItems, selectedArea, boundaryLayer;

function getSelectedDateRange() {
    const mode = document.querySelector('input[name="mode"]:checked')?.value;
    if (mode === 'landcover') {
        const yearEl = document.getElementById('landcoverYearSelect');
        if (!yearEl) {
            console.error('Land cover year selection element not found');
            return null;
        }
        const year = parseInt(yearEl.value, 10);
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        return { startDate, endDate, year };
    } else {
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
            boundaryLayer = L.geoJSON(data, {
                style: {
                    color: "#3388ff",
                    weight: 1,
                    fillOpacity: 0
                },
                onEachFeature: (feature, layer) => {
                    layer.on('click', () => {
                        boundaryLayer.resetStyle();
                        layer.setStyle({
                            color: "red",
                            weight: 2,
                            fillOpacity: 0.1
                        });
                        selectedArea = layer; // Set selectedArea for district
                        if (feature.properties) {
                            layer.bindPopup(`<b>${feature.properties.ADM3_EN}</b>`).openPopup();
                        }
                        console.log("Clicked district:", feature.properties.ADM3_EN);
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
        if (ndviLayer) map.removeLayer(ndviLayer);
        if (landcoverLayer) map.removeLayer(landcoverLayer);
        console.log('Area drawn:', selectedArea.getBounds().toBBoxString());
    });

    // Layer control
    const overlayMaps = {};
    L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);

    // Mode toggle visibility
    document.querySelectorAll('input[name="mode"]').forEach(input => {
        input.addEventListener('change', () => {
            const ndviControls = document.getElementById('ndviControls');
            const landcoverControls = document.getElementById('landcoverControls');
            if (input.value === 'ndvi') {
                ndviControls.style.display = 'block';
                landcoverControls.style.display = 'none';
            } else {
                ndviControls.style.display = 'none';
                landcoverControls.style.display = 'block';
            }
        });
    });

    // View Selection button
    document.getElementById('viewSelectionBtn').addEventListener('click', async () => {
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

        const mode = document.querySelector('input[name="mode"]:checked')?.value;
        try {
            if (mode === 'ndvi') {
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
                if (landcoverLayer) map.removeLayer(landcoverLayer);
                ndviLayer = L.imageOverlay(url, bounds).addTo(map);
                alert('NDVI visualized on the map!');
            } else {
                const res = await fetch(`${BACKEND_URL}/landcover`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bbox, year: dateRange.year })
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || `HTTP ${res.status}`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                if (landcoverLayer) map.removeLayer(landcoverLayer);
                if (ndviLayer) map.removeLayer(ndviLayer);
                landcoverLayer = L.imageOverlay(url, bounds).addTo(map);
                alert(`Land Cover for ${dateRange.year} visualized on the map!`);
            }
        } catch (err) {
            console.error(`${mode.toUpperCase()} fetch error:`, err);
            alert(`Failed to fetch ${mode.toUpperCase()}: ${err.message}`);
        }
    });

    // Download Selection button
    document.getElementById('downloadSelectionBtn').addEventListener('click', async () => {
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

        const mode = document.querySelector('input[name="mode"]:checked')?.value;
        try {
            if (mode === 'ndvi') {
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
            } else {
                const res = await fetch(`${BACKEND_URL}/landcover/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bbox, year: dateRange.year })
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || `HTTP ${res.status}`);
                }
                const blob = await res.blob();
                downloadBlob(blob, `LandCover_${dateRange.year}.tif`);
            }
        } catch (err) {
            console.error(`${mode.toUpperCase()} download error:`, err);
            alert(`Failed to download ${mode.toUpperCase()}: ${err.message}`);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const yearSelect = document.getElementById('yearSelect');
    const monthStart = document.getElementById('monthStart');
    const monthEnd = document.getElementById('monthEnd');
    const landcoverYearSelect = document.getElementById('landcoverYearSelect');

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

    if (landcoverYearSelect) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= 2017; y--) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            landcoverYearSelect.appendChild(opt);
        }
        landcoverYearSelect.value = String(currentYear);
    }

    // Initialize with NDVI controls visible
    document.getElementById('ndviControls').style.display = 'block';
    document.getElementById('landcoverControls').style.display = 'none';

    initializeMap();
});

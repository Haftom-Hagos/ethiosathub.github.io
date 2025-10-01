const BACKEND_URL = 'https://hafrepo-2.onrender.com'; // Render backend URL 

let map, landcoverLayer, ndviLayer, dwModeLayer, dwProbLayer, drawnItems, selectedArea, selectedDistrict, selectedDistrictGeoJSON;
let currentLayers = {}; // Store layer refs for toggling
let dwLegend = null;

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

function getYearTimeRange(year) {
    const start = new Date(year, 0, 1).getTime();
    const end = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
    return `${start},${end}`;
}

function calculateNativePixelSize(bounds) {
    const lat = (bounds.getSouth() + bounds.getNorth()) / 2;
    const cosLat = Math.cos(lat * Math.PI / 180);
    const width_deg = bounds.getEast() - bounds.getWest();
    const height_deg = bounds.getNorth() - bounds.getSouth();
    const width_m = width_deg * 111319.9 * cosLat;
    const height_m = height_deg * 111319.9;
    const resolution = 10; // meters per pixel
    let width_px = Math.ceil(width_m / resolution);
    let height_px = Math.ceil(height_m / resolution);
    const max = 10000; // service limit
    if (width_px > max || height_px > max) {
        const scale = Math.max(width_px / max, height_px / max);
        width_px = Math.ceil(width_px / scale);
        height_px = Math.ceil(height_px / scale);
    }
    return `${width_px},${height_px}`;
}

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function updateLayerToggles() {
    // Toggle NDVI
    const ndviToggle = document.getElementById('ndvi-toggle');
    if (ndviToggle && currentLayers.ndvi) {
        currentLayers.ndvi.setOpacity(ndviToggle.checked ? 1 : 0);
    }

    // Toggle DW Mode
    const dwModeToggle = document.getElementById('dw-mode-toggle');
    if (dwModeToggle && currentLayers['dw-mode']) {
        currentLayers['dw-mode'].setOpacity(dwModeToggle.checked ? 0.8 : 0);
    }

    // Toggle DW Prob
    const dwProbToggle = document.getElementById('dw-prob-toggle');
    if (dwProbToggle && currentLayers['dw-prob']) {
        currentLayers['dw-prob'].setOpacity(dwProbToggle.checked ? 0.8 : 0);
    }
}

function updateLegend(legendData) {
    if (!legendData || !document.getElementById('legend')) return;

    const legendDiv = document.getElementById('legend');
    legendDiv.innerHTML = '<h4>Land Cover Classes</h4>' + 
        legendData.classes.map((cls, i) => 
            `<div style="display: flex; align-items: center;"><span style="display: inline-block; width: 20px; height: 20px; background: #${legendData.colors[i]}; margin-right: 5px;"></span>${cls}</div>`
        ).join('');
    dwLegend = legendData; // Cache for later use
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
        if (ndviLayer) map.removeLayer(ndviLayer);
        // Clear GEE layers on draw
        Object.values(currentLayers).forEach(layer => map.removeLayer(layer));
        currentLayers = {};
        updateLayerToggles();
        console.log('Area drawn:', selectedArea.getBounds().toBBoxString());
        document.getElementById('districtSelect').value = '';
        selectedDistrict = null;
        selectedDistrictGeoJSON = null;
    });

    L.control.layers(baseMaps, {}, { collapsed: false }).addTo(map);
}

document.addEventListener('DOMContentLoaded', () => {
    const yearSelect = document.getElementById('yearSelect');
    const monthStart = document.getElementById('monthStart');
    const monthEnd = document.getElementById('monthEnd');
    const yearSelectLC = document.getElementById('yearSelectLC');

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

    if (yearSelectLC) {
        const lcYears = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
        lcYears.forEach(year => {
            const opt = document.createElement('option');
            opt.value = year;
            opt.textContent = year;
            yearSelectLC.appendChild(opt);
        });
        yearSelectLC.value = '2024';
    }

    initializeMap();

    // Layer toggles event listeners (add these if checkboxes exist in HTML)
    ['ndvi-toggle', 'dw-mode-toggle', 'dw-prob-toggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', updateLayerToggles);
        }
    });

    // --- View Selection ---
    document.getElementById('viewSelectionBtn').addEventListener('click', async () => {
        const datasetSelect = document.getElementById('datasetSelect').value;
        const yearLC = document.getElementById('yearSelectLC').value;
        const districtValue = document.getElementById('districtSelect').value;
        const isLandCover = datasetSelect === 'landcover' && yearLC && districtValue;
        const isGEE = datasetSelect === 'ndvi' || datasetSelect === 'dw'; // New: 'ndvi' or 'dw' for GEE layers
        const isNDVI = datasetSelect === 'ndvi' && (selectedArea || selectedDistrict);

        if (!isLandCover && !isGEE) {
            alert('Please select a dataset and a district or draw an area!');
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

        const imageBounds = [[bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]];

        if (isLandCover) {
            // Existing Land Cover logic (unchanged)
            try {
                const time = getYearTimeRange(yearLC);
                const renderingRule = JSON.stringify({rasterFunction: "Cartographic Renderer for Visualization and Analysis"});
                const params = new URLSearchParams({
                    bbox: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
                    bboxSR: '4326',
                    imageSR: '4326',
                    size: '1024,1024',
                    format: 'png',
                    transparent: true,
                    f: 'image',
                    time: time,
                    renderingRule: renderingRule
                });

                if (selectedDistrict && selectedDistrictGeoJSON) {
                    params.set('geometryType', 'esriGeometryPolygon');
                    params.set('geometry', JSON.stringify(selectedDistrictGeoJSON.geometry));
                }

                const res = await fetch(`https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?${params.toString()}`);
                if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);

                if (landcoverLayer) map.removeLayer(landcoverLayer);
                landcoverLayer = L.imageOverlay(url, imageBounds, { opacity: 0.8 }).addTo(map);
                map.fitBounds(bounds);
                alert('Land Cover visualized on the map!');
            } catch (err) {
                console.error('Land Cover visualization error:', err);
                alert('Failed to visualize Land Cover: ' + err.message);
            }
        } else if (isGEE) {
            const dateRange = getSelectedDateRange();
            if (!dateRange) {
                alert('Invalid date range');
                return;
            }

            try {
                // Prepare body for /gee_layers (same as NDVI but no separate geometry handling)
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

                // Remove old layers
                Object.values(currentLayers).forEach(layer => map.removeLayer(layer));
                currentLayers = {};

                // Add NDVI if requested
                if (datasetSelect === 'ndvi' && data.ndvi && data.ndvi.tiles) {
                    currentLayers.ndvi = L.tileLayer(data.ndvi.tiles, { 
                        opacity: 1.0,
                        attribution: 'NDVI from GEE'
                    }).addTo(map);
                }

                // Add DW layers if 'dw' selected
                if (datasetSelect === 'dw' && data.dw) {
                    if (data.dw.mode_tiles) {
                        currentLayers['dw-mode'] = L.tileLayer(data.dw.mode_tiles, { 
                            opacity: 0.8,
                            attribution: 'DW Mode from GEE'
                        }).addTo(map);
                    }
                    if (data.dw.prob_tiles) {
                        currentLayers['dw-prob'] = L.tileLayer(data.dw.prob_tiles, { 
                            opacity: 0.8,
                            attribution: 'DW Prob from GEE'
                        }).addTo(map);
                    }
                    updateLegend(data.dw.legend);
                }

                // Default toggles: Show NDVI if added, hide DW initially
                if (document.getElementById('ndvi-toggle')) document.getElementById('ndvi-toggle').checked = !!currentLayers.ndvi;
                if (document.getElementById('dw-mode-toggle')) document.getElementById('dw-mode-toggle').checked = false;
                if (document.getElementById('dw-prob-toggle')) document.getElementById('dw-prob-toggle').checked = false;
                updateLayerToggles();

                map.fitBounds(bounds);
                alert(`${datasetSelect.toUpperCase()} layers visualized on the map! Use toggles to switch.`);
            } catch (err) {
                console.error('GEE layers fetch error:', err);
                alert('Failed to fetch GEE layers: ' + err.message);
            }
        }
    });

    // --- Download Selection ---
    document.getElementById('downloadSelectionBtn').addEventListener('click', async () => {
        const datasetSelect = document.getElementById('datasetSelect').value;
        const yearLC = document.getElementById('yearSelectLC').value;
        const districtValue = document.getElementById('districtSelect').value;
        const isLandCover = datasetSelect === 'landcover' && yearLC && districtValue;
        const isNDVI = datasetSelect === 'ndvi' && (selectedArea || selectedDistrict);
        // Note: No download for DW yet—extend backend later

        if (!isLandCover && !isNDVI) {
            alert('Please select a dataset and a district or draw an area!');
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

        if (isLandCover) {
            // Existing Land Cover download (unchanged)
            try {
                const time = getYearTimeRange(yearLC);
                const size = calculateNativePixelSize(bounds);
                const params = new URLSearchParams({
                    bbox: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
                    bboxSR: '4326',
                    imageSR: '4326',
                    size: size,
                    format: 'tiff',
                    pixelType: 'U8',
                    compression: 'lzw',
                    f: 'image',
                    time: time
                });

                if (selectedDistrict && selectedDistrictGeoJSON) {
                    params.set('geometryType', 'esriGeometryPolygon');
                    params.set('geometry', JSON.stringify(selectedDistrictGeoJSON.geometry));
                }

                const res = await fetch(`https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?${params.toString()}`);
                if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
                const blob = await res.blob();
                downloadBlob(blob, `LandCover_${yearLC}_${districtValue || 'area'}.tif`);
            } catch (err) {
                console.error('Land Cover download error:', err);
                alert('Failed to download Land Cover: ' + err.message);
            }
        } else if (isNDVI) {
            // Existing NDVI download (unchanged)
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
        }
    });



    } else if (datasetSelect === 'dw') {
    const dateRange = getSelectedDateRange();
    if (!dateRange) {
        alert('Invalid date range');
        return;
    }
    try {
        const body = { ...dateRange, bbox: { ... } };  // Same as view
        if (selectedDistrict && selectedDistrictGeoJSON) {
            body.geometry = selectedDistrictGeoJSON.geometry;
        }
        body.layer_type = document.getElementById('dw-mode-toggle').checked ? 'mode' : 'prob';  // Toggle-based
        const res = await fetch(`${BACKEND_URL}/dw_download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const layerType = body.layer_type === 'prob' ? 'Prob' : 'Mode';
        downloadBlob(blob, `DynamicWorld_${layerType}_${dateRange.startDate}_to_${dateRange.endDate}.png`);
    } catch (err) {
        console.error('DW download error:', err);
        alert('Failed to download DW: ' + err.message);
    }

    

    // District dropdown selection
    document.getElementById('districtSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            drawnItems.clearLayers();
            selectedArea = null;
            // Clear GEE layers on district change
            Object.values(currentLayers).forEach(layer => map.removeLayer(layer));
            currentLayers = {};
            updateLayerToggles();
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


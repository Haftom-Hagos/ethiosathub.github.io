const BACKEND_URL = 'https://hafrepo-2.onrender.com'; // Render backend URL 

let map, landcoverLayer, ndviLayer, drawnItems, selectedArea, selectedDistrict, selectedDistrictGeoJSON;

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

function toEsriGeometry(geoJsonGeom) {
    let rings = [];
    if (geoJsonGeom.type === 'Polygon') {
        rings = geoJsonGeom.coordinates;
    } else if (geoJsonGeom.type === 'MultiPolygon') {
        geoJsonGeom.coordinates.forEach(polygon => {
            rings.push(...polygon);
        });
    }
    return {
        rings: rings,
        spatialReference: { wkid: 4326 }
    };
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
            const districtSelect = document.getElementById('districtSelect');
            const opt = document.createElement('option');
            opt.value = feature.properties.ADM3_EN;
            opt.textContent = feature.properties.ADM3_EN;
            districtSelect.appendChild(opt);

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
                selectedDistrict = layer;
                selectedDistrictGeoJSON = feature; // Store GeoJSON for clipping
                document.getElementById('districtSelect').value = feature.properties.ADM3_EN;
              }
            });
          }
        }).addTo(map);

        // Zoom map to Ethiopia boundary
        map.fitBounds(boundaryLayer.getBounds());
      })
      .catch(err => console.error("Failed to load boundaries:", err));

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
        document.getElementById('districtSelect').value = '';
        selectedDistrict = null;
        selectedDistrictGeoJSON = null;
    });

    // --- Layer control ---
    const overlayMaps = {};
    L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);
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

    // Populate land cover year dropdown
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

    // --- View Selection button ---
    document.getElementById('viewSelectionBtn').addEventListener('click', async () => {
        const datasetSelect = document.getElementById('datasetSelect').value;
        const yearLC = document.getElementById('yearSelectLC').value;
        const districtValue = document.getElementById('districtSelect').value;
        const isLandCover = datasetSelect === 'landcover' && yearLC && districtValue;
        const isNDVI = datasetSelect === 'ndvi' && (selectedArea || selectedDistrict);

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

        const bboxStr = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        const imageBounds = [[bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]];

        if (isLandCover) {
            try {
                const mosaicRule = JSON.stringify({ where: `Year = ${yearLC}` });
                const renderingRule = JSON.stringify({ rasterFunction: "Cartographic Renderer for Visualization and Analysis" });
                const params = new URLSearchParams({
                    bbox: bboxStr,
                    bboxSR: '4326',
                    imageSR: '4326',
                    size: '1024,1024',
                    format: 'png',
                    transparent: true,
                    f: 'image',
                    mosaicRule: mosaicRule,
                    renderingRule: renderingRule
                });

                if (selectedDistrict && selectedDistrictGeoJSON) {
                    const esriGeom = JSON.stringify(toEsriGeometry(selectedDistrictGeoJSON.geometry));
                    params.append('geometry', esriGeom);
                    params.append('geometryType', 'esriGeometryPolygon');
                }

                const res = await fetch(`https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?${params.toString()}`);
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || `HTTP ${res.status}`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);

                if (landcoverLayer) {
                    map.removeLayer(landcoverLayer);
                }
                landcoverLayer = L.imageOverlay(url, imageBounds, { opacity: 0.8 }).addTo(map);
                map.fitBounds(bounds);
                alert('Land Cover visualized on the map!');
            } catch (err) {
                console.error('Land Cover visualization error:', err);
                alert('Failed to visualize Land Cover: ' + err.message);
            }
        } else if (isNDVI) {
            const dateRange = getSelectedDateRange();
            if (!dateRange) {
                alert('Invalid date range');
                return;
            }

            try {
                const body = { bbox: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }, ...dateRange };
                // If a district is selected, include its geometry for clipping
                if (selectedDistrict && selectedDistrictGeoJSON) {
                    body.geometry = selectedDistrictGeoJSON.geometry;
                }
                const res = await fetch(`${BACKEND_URL}/ndvi`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || `HTTP ${res.status}`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                if (ndviLayer) {
                    map.removeLayer(ndviLayer);
                }
                ndviLayer = L.imageOverlay(url, imageBounds, { opacity: 1.0 }).addTo(map);
                map.fitBounds(bounds);
                alert('NDVI visualized on the map!');
            } catch (err) {
                console.error('NDVI fetch error:', err);
                alert('Failed to fetch NDVI: ' + err.message);
            }
        }
    });

    // --- Download Selection button ---
    document.getElementById('downloadSelectionBtn').addEventListener('click', async () => {
        const datasetSelect = document.getElementById('datasetSelect').value;
        const yearLC = document.getElementById('yearSelectLC').value;
        const districtValue = document.getElementById('districtSelect').value;
        const isLandCover = datasetSelect === 'landcover' && yearLC && districtValue;
        const isNDVI = datasetSelect === 'ndvi' && (selectedArea || selectedDistrict);

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

        const bboxStr = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

        if (bounds.getEast() - bounds.getWest() > 2 || bounds.getNorth() - bounds.getSouth() > 2) {
            alert('Please select a smaller area (max 2°x2°).');
            return;
        }

        if (isLandCover) {
            try {
                const mosaicRule = JSON.stringify({ where: `Year = ${yearLC}` });
                const params = new URLSearchParams({
                    bbox: bboxStr,
                    bboxSR: '4326',
                    imageSR: '4326',
                    size: '2048,2048',
                    format: 'tiff',
                    f: 'image',
                    mosaicRule: mosaicRule
                });

                if (selectedDistrict && selectedDistrictGeoJSON) {
                    const esriGeom = JSON.stringify(toEsriGeometry(selectedDistrictGeoJSON.geometry));
                    params.append('geometry', esriGeom);
                    params.append('geometryType', 'esriGeometryPolygon');
                }

                const res = await fetch(`https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?${params.toString()}`);
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || `HTTP ${res.status}`);
                }
                const blob = await res.blob();
                downloadBlob(blob, `LandCover_${yearLC}_${districtValue || 'area'}.tif`);
            } catch (err) {
                console.error('Land Cover download error:', err);
                alert('Failed to download Land Cover: ' + err.message);
            }
        } else if (isNDVI) {
            const dateRange = getSelectedDateRange();
            if (!dateRange) {
                alert('Invalid date range');
                return;
            }

            try {
                const body = { bbox: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }, ...dateRange };
                if (selectedDistrict && selectedDistrictGeoJSON) {
                    body.geometry = selectedDistrictGeoJSON.geometry;
                }
                const res = await fetch(`${BACKEND_URL}/ndvi/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
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
        }
    });

    // District selection from dropdown
    document.getElementById('districtSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            drawnItems.clearLayers();
            selectedArea = null;
            fetch('https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson')
                .then(res => res.json())
                .then(data => {
                    const feature = data.features.find(f => f.properties.ADM3_EN === e.target.value);
                    if (feature) {
                        if (selectedDistrict) map.removeLayer(selectedDistrict);
                        selectedDistrict = L.geoJSON(feature, {
                            style: {
                                color: "red",
                                weight: 2,
                                fillOpacity: 0.1
                            }
                        }).addTo(map);
                        selectedDistrictGeoJSON = feature; // Store GeoJSON for clipping
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

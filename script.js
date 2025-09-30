
const BACKEND_URL = 'https://hafrepo-2.onrender.com'; // Render backend URL 

let map, landcoverLayer, ndviLayer, drawnItems, selectedArea, selectedDistrict, selectedDistrictGeoJSON;

// Proj4js for coordinate transformation
const proj4 = window.proj4;
proj4.defs('EPSG:32636', '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32637', '+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32638', '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs');

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

function getUTMZone(longitude) {
    const zone = Math.floor((longitude + 180) / 6) + 1;
    if (zone <= 36) return '32636'; // UTM zone 36N
    else if (zone >= 38) return '32638'; // UTM zone 38N
    return '32637'; // UTM zone 37N (default)
}

function calculateUTMPixelSize(bounds) {
    const centroid_lon = (bounds.getWest() + bounds.getEast()) / 2;
    const utmSR = `EPSG:${getUTMZone(centroid_lon)}`;
    const sw = proj4('EPSG:4326', utmSR, [bounds.getWest(), bounds.getSouth()]);
    const ne = proj4('EPSG:4326', utmSR, [bounds.getEast(), bounds.getNorth()]);
    
    const width_m = ne[0] - sw[0];
    const height_m = ne[1] - sw[1];
    const resolution = 10;
    let width_px = Math.ceil(width_m / resolution);
    let height_px = Math.ceil(height_m / resolution);
    const max_pixels = 10000;
    let is_scaled = false;

    if (width_px > max_pixels || height_px > max_pixels) {
        is_scaled = true;
        const scale = Math.max(width_px / max_pixels, height_px / max_pixels);
        width_px = Math.ceil(width_px / scale);
        height_px = Math.ceil(height_px / scale);
    }

    const res_x = width_m / width_px;
    const res_y = height_m / height_px;
    return { size: `${width_px},${height_px}`, res_x, res_y, is_scaled, utmSR };
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
    rings = rings.map(ring => {
        const area = ring.reduce((sum, pt, i, arr) => {
            const next = arr[(i + 1) % arr.length];
            return sum + (pt[0] * next[1] - next[0] * pt[1]);
        }, 0);
        return area < 0 ? ring.reverse() : ring;
    });
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

function estimateResolution(bounds, width_px, height_px) {
    const lat = (bounds.getSouth() + bounds.getNorth()) / 2;
    const cosLat = Math.cos(lat * Math.PI / 180);
    const width_deg = bounds.getEast() - bounds.getWest();
    const height_deg = bounds.getNorth() - bounds.getSouth();
    const width_m = width_deg * 111319.9 * cosLat;
    const height_m = height_deg * 111319.9;
    const res_x = width_m / width_px;
    const res_y = height_m / height_px;
    return { res_x, res_y };
}

function initializeMap() {
    if (map) return;

    map = L.map('map', {
        center: [9.145, 40.4897],
        zoom: 6,
        layers: []
    });

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
                console.log('Selected district geometry:', feature.geometry);
              }
            });
          }
        }).addTo(map);

        map.fitBounds(boundaryLayer.getBounds());
      })
      .catch(err => console.error("Failed to load boundaries:", err));

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
                const time = getYearTimeRange(yearLC);
                const renderingRule = JSON.stringify({rasterFunction: "Cartographic Renderer for Visualization and Analysis"});
                const params = new URLSearchParams({
                    bbox: bboxStr,
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
                    const esriGeom = JSON.stringify(toEsriGeometry(selectedDistrictGeoJSON.geometry));
                    params.append('geometry', esriGeom);
                    params.append('geometryType', 'esriGeometryPolygon');
                    console.log('Land Cover visualization: Sending geometry', esriGeom);
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
                let alertMsg = 'Land Cover visualized on the map!';
                if (selectedDistrict && selectedDistrictGeoJSON) {
                    alertMsg += '\nShould be clipped to district boundary.';
                }
                alert(alertMsg);
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
                if (selectedDistrict && selectedDistrictGeoJSON) {
                    body.geometry = selectedDistrictGeoJSON.geometry;
                    console.log('NDVI visualization: Sending geometry', body.geometry);
                }
                console.log('NDVI request body:', JSON.stringify(body));
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
                if (blob.size === 0) {
                    console.error('NDVI visualization: Empty PNG received');
                    throw new Error('Empty PNG received');
                }
                const url = URL.createObjectURL(blob);
                if (ndviLayer) {
                    map.removeLayer(ndviLayer);
                }
                ndviLayer = L.imageOverlay(url, imageBounds, { opacity: 1.0 }).addTo(map);
                map.fitBounds(bounds);
                let alertMsg = 'NDVI visualized on the map!';
                if (selectedDistrict && selectedDistrictGeoJSON) {
                    alertMsg += '\nShould be clipped to district boundary.';
                }
                alert(alertMsg);
            } catch (err) {
                console.error('NDVI fetch error:', err);
                alert('Failed to fetch NDVI: ' + err.message);
            }
        }
    });

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
                const time = getYearTimeRange(yearLC);
                const { size, res_x, res_y, is_scaled, utmSR } = calculateUTMPixelSize(bounds);
                console.log(`Calculated pixels: ${size}, Estimated resolution: X=${res_x.toFixed(2)}m, Y=${res_y.toFixed(2)}m, UTM SR: ${utmSR}, Scaled: ${is_scaled}`);
                
                const params = new URLSearchParams({
                    bbox: bboxStr,
                    bboxSR: '4326',
                    imageSR: utmSR,
                    size: size,
                    format: 'tiff',
                    pixelType: 'U8',
                    compression: 'LZW',
                    noDataInterpretation: 'esriNoDataMatchAny',
                    interpolation: 'RSP_NearestNeighbor',
                    f: 'json',
                    time: time
                });

                if (selectedDistrict && selectedDistrictGeoJSON) {
                    const esriGeom = JSON.stringify(toEsriGeometry(selectedDistrictGeoJSON.geometry));
                    params.append('geometry', esriGeom);
                    params.append('geometryType', 'esriGeometryPolygon');
                    console.log('Land Cover download: Sending geometry', esriGeom);
                }

                // Get metadata
                const metadataRes = await fetch(`https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?${params.toString()}`);
                if (!metadataRes.ok) {
                    const errorText = await metadataRes.text();
                    throw new Error(errorText || `HTTP ${metadataRes.status}`);
                }
                const metadata = await metadataRes.json();
                console.log('Server metadata:', metadata);

                const server_width_px = metadata.width;
                const server_height_px = metadata.height;
                const { res_x: server_res_x, res_y: server_res_y } = estimateResolution(bounds, server_width_px, server_height_px);
                console.log(`Server output resolution: X=${server_res_x.toFixed(2)}m, Y=${server_res_y.toFixed(2)}m, Pixels: ${server_width_px}x${server_height_px}`);

                // Download image
                params.set('f', 'image');
                const res = await fetch(`https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?${params.toString()}`);
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || `HTTP ${res.status}`);
                }
                const blob = await res.blob();
                if (blob.size < 1024) {
                    console.error('Land Cover download: TIFF is too small or empty');
                    // Retry without geometry
                    params.delete('geometry');
                    params.delete('geometryType');
                    console.log('Retrying Land Cover download without geometry');
                    const retryRes = await fetch(`https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?${params.toString()}`);
                    if (!retryRes.ok) {
                        const errorText = await retryRes.text();
                        throw new Error(errorText || `HTTP ${retryRes.status}`);
                    }
                    const retryBlob = await retryRes.blob();
                    if (retryBlob.size < 1024) {
                        console.error('Land Cover retry: TIFF is still too small or empty');
                        throw new Error('Land Cover TIFF is empty');
                    }
                    downloadBlob(retryBlob, `LandCover_${yearLC}_${districtValue}.tif`);
                    let alertMsg = `Downloaded Land Cover TIFF (unclipped due to server issue). Estimated resolution: ${server_res_x.toFixed(2)}m x ${server_res_y.toFixed(2)}m`;
                    if (is_scaled) {
                        alertMsg += '\nNote: Area is large, resolution may be coarser than 10m due to server limits. Try a smaller area.';
                    }
                    alert(alertMsg);
                    return;
                }

                // Fallback: Post-process Land Cover TIFF
                if (selectedDistrict && selectedDistrictGeoJSON) {
                    const formData = new FormData();
                    formData.append('tiff', blob, 'temp.tif');
                    formData.append('geometry', JSON.stringify(selectedDistrictGeoJSON.geometry));
                    console.log('Land Cover: Sending TIFF to /mask_tiff for clipping', selectedDistrictGeoJSON.geometry);
                    const maskRes = await fetch(`${BACKEND_URL}/mask_tiff`, {
                        method: 'POST',
                        body: formData
                    });
                    if (!maskRes.ok) {
                        console.warn('Backend masking failed, using server output:', await maskRes.text());
                        downloadBlob(blob, `LandCover_${yearLC}_${districtValue}.tif`);
                        alert(`Downloaded Land Cover TIFF (server clipping may not have worked). Estimated resolution: ${server_res_x.toFixed(2)}m x ${server_res_y.toFixed(2)}m`);
                    } else {
                        const maskedBlob = await maskRes.blob();
                        if (maskedBlob.size < 1024) {
                            console.error('Land Cover: Masked TIFF is too small or empty');
                            downloadBlob(blob, `LandCover_${yearLC}_${districtValue}.tif`);
                            alert(`Downloaded Land Cover TIFF (clipping failed). Estimated resolution: ${server_res_x.toFixed(2)}m x ${server_res_y.toFixed(2)}m`);
                        } else {
                            downloadBlob(maskedBlob, `LandCover_${yearLC}_${districtValue}.tif`);
                            let alertMsg = `Downloaded Land Cover TIFF, clipped to district boundary. Estimated resolution: ${server_res_x.toFixed(2)}m x ${server_res_y.toFixed(2)}m`;
                            if (is_scaled) {
                                alertMsg += '\nNote: Area is large, resolution may be coarser than 10m due to server limits. Try a smaller area.';
                            }
                            alert(alertMsg);
                        }
                    }
                } else {
                    downloadBlob(blob, `LandCover_${yearLC}_${districtValue || 'area'}.tif`);
                    let alertMsg = `Downloaded Land Cover TIFF. Estimated resolution: ${server_res_x.toFixed(2)}m x ${server_res_y.toFixed(2)}m`;
                    if (is_scaled) {
                        alertMsg += '\nNote: Area is large, resolution may be coarser than 10m due to server limits. Try a smaller area.';
                    }
                    alert(alertMsg);
                }
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
                    console.log('NDVI download: Sending geometry', body.geometry);
                }
                console.log('NDVI download request body:', JSON.stringify(body));
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
                if (blob.size < 1024) {
                    console.error('NDVI download: TIFF is too small or empty');
                    throw new Error('NDVI TIFF is empty');
                }
                downloadBlob(blob, `NDVI_${dateRange.startDate}_to_${dateRange.endDate}.tif`);
                let alertMsg = `Downloaded NDVI TIFF.`;
                if (selectedDistrict && selectedDistrictGeoJSON) {
                    alertMsg += '\nShould be clipped to district boundary.';
                }
                alert(alertMsg);
            } catch (err) {
                console.error('NDVI download error:', err);
                alert('Failed to download NDVI: ' + err.message);
            }
        }
    });

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
                        selectedDistrictGeoJSON = feature;
                        map.fitBounds(selectedDistrict.getBounds());
                        console.log('Selected district geometry:', feature.geometry);
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

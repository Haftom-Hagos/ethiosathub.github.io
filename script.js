let map, drawnItems, selectedArea;

// Add your Sentinel Hub CLIENT_ID from your dashboard
const SENTINEL_HUB_CLIENT_ID = '62cbf745-c1c9-473e-b88a-cbb3a0ae4f75'; // Get this from sentinel-hub.com
function initializeMap() {
    if (!map) {
        map = L.map('map').setView([9.145, 40.4897], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);

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
        });

        // NDVI custom script (simplified for real-time)
        const ndviEvalscript = `
            //VERSION=3
            function setup() {
                return {
                    input: ["B04", "B08"],
                    output: { bands: 1 }
                };
            }
            function evaluatePixel(sample) {
                let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
                return [ndvi];
            }
        `;

        // Land Cover (using TRUE_COLOR as placeholder; customize if needed)
        const landCoverEvalscript = `
            //VERSION=3
            function setup() {
                return {
                    input: ["B04", "B03", "B02"],
                    output: { bands: 3 }
                };
            }
            function evaluatePixel(sample) {
                return [sample.B04, sample.B03, sample.B02];
            }
        `;

        function getSentinelHubUrl(bbox, evalscript, layerType) {
            const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${SENTINEL_HUB_CLIENT_ID}`;
            const timeRange = '2023-01-01/2025-02-21'; // Adjust to latest available data
            return `${baseUrl}?service=WMS&request=GetMap&layers=SENTINEL2_L2A&format=image/png&width=512&height=512&bbox=${bbox}&srs=EPSG:4326&time=${timeRange}&evalscript=${encodeURIComponent(evalscript)}`;
        }

        function downloadImage(url, filename) {
            console.log("Fetching URL:", url);
            fetch(url)
                .then(response => {
                    console.log("Response status:", response.status);
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    console.log("Blob size:", blob.size, "bytes");
                    if (blob.size < 1024) { // Check if less than 1KB
                        throw new Error("Received an invalid or empty image.");
                    }
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = filename;
                    link.click();
                })
                .catch(error => {
                    console.error("Download failed:", error);
                    alert("Error downloading map: " + error.message);
                });
        }

        document.getElementById('ndviBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = getSentinelHubUrl(bbox, ndviEvalscript, 'NDVI');
            downloadImage(url, 'NDVI_Map.png');
        });

        document.getElementById('landCoverBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = getSentinelHubUrl(bbox, landCoverEvalscript, 'LandCover');
            downloadImage(url, 'LandCover_Map.png');
        });
    }
}

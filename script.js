let map, drawnItems, selectedArea;

// Replace with your Sentinel Hub CLIENT_ID
const SENTINEL_HUB_CLIENT_ID = '62cbf745-c1c9-473e-b88a-cbb3a0ae4f75'; // Your ID

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

        // NDVI Evalscript with RGB output
        const ndviEvalscript = `
            //VERSION=3
            function setup() {
                return {
                    input: ["B04", "B08", "dataMask"],
                    output: { bands: 4 } // RGBA for PNG
                };
            }
            function evaluatePixel(sample) {
                let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
                // Simple color ramp: green for high NDVI, gray for low
                let r = ndvi < 0 ? 128 : Math.min(255 * (1 - ndvi), 255);
                let g = ndvi > 0 ? Math.min(255 * ndvi, 255) : 128;
                let b = 128;
                return [r / 255, g / 255, b / 255, sample.dataMask]; // Normalize to 0-1 for PNG
            }
        `;

        // Land Cover Evalscript (True Color as proxy)
        const landCoverEvalscript = `
            //VERSION=3
            function setup() {
                return {
                    input: ["B04", "B03", "B02", "dataMask"],
                    output: { bands: 4 } // RGBA for PNG
                };
            }
            function evaluatePixel(sample) {
                return [sample.B04 * 2.5, sample.B03 * 2.5, sample.B02 * 2.5, sample.dataMask]; // Enhance brightness
            }
        `;

        function getSentinelHubUrl(bbox, evalscript) {
            const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${SENTINEL_HUB_CLIENT_ID}`;
            const timeRange = '2023-01-01/2025-02-20'; // Up to yesterday
            // Remove layers parameter, rely on evalscript
            return `${baseUrl}?service=WMS&request=GetMap&format=image/png&width=512&height=512&bbox=${bbox}&crs=EPSG:4326&time=${timeRange}&evalscript=${encodeURIComponent(evalscript)}&transparent=true`;
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
                    if (blob.size < 1024) {
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
            const url = getSentinelHubUrl(bbox, ndviEvalscript);
            downloadImage(url, 'NDVI_Map.png');
        });

        document.getElementById('landCoverBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = getSentinelHubUrl(bbox, landCoverEvalscript);
            downloadImage(url, 'LandCover_Map.png');
        });
    }
}

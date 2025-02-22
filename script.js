let map, drawnItems, selectedArea;

// Replace with your Sentinel Hub INSTANCE ID
const SENTINEL_HUB_INSTANCE_ID = 'c34e4a71-86d3-459b-84fc-07075d6b2737'; // Your Instance ID

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

        function getSentinelHubUrl(bbox, layer) {
            const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${SENTINEL_HUB_INSTANCE_ID}`;
            const timeRange = '2023-01-01/2025-02-20'; // Up to yesterday
            return `${baseUrl}?service=WMS&request=GetMap&layers=${layer}&format=image/png&width=512&height=512&bbox=${bbox}&crs=EPSG:4326&time=${timeRange}&transparent=true&version=1.3.0`;
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

        // Use configured layer names
        document.getElementById('ndviBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = getSentinelHubUrl(bbox, 'NDVI'); // Replace with your configured layer name
            downloadImage(url, 'NDVI_Map.png');
        });

        document.getElementById('landCoverBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = getSentinelHubUrl(bbox, 'TRUE-COLOR-S2L2A'); // Replace with your configured layer name
            downloadImage(url, 'LandCover_Map.png');
        });
    }
}

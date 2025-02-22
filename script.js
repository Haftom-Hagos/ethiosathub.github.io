let map, drawnItems, selectedArea;

// Replace with your Sentinel Hub CLIENT_ID from your dashboard
const SENTINEL_HUB_CLIENT_ID = 'YOUR_CLIENT_ID_HERE'; // Get this from sentinel-hub.com

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

        // Sentinel Hub real-time NDVI layer
        const ndviLayer = L.tileLayer.wms('https://services.sentinel-hub.com/ogc/wms/' + SENTINEL_HUB_CLIENT_ID, {
            layers: 'NDVI',
            format: 'image/png',
            transparent: true,
            maxZoom: 19
        });

        // Sentinel Hub real-time Land Cover layer (using a custom script for simplicity)
        const landCoverLayer = L.tileLayer.wms('https://services.sentinel-hub.com/ogc/wms/' + SENTINEL_HUB_CLIENT_ID, {
            layers: 'TRUE_COLOR', // Placeholder; customize with a land cover script if needed
            format: 'image/png',
            transparent: true,
            maxZoom: 19
        });

        function downloadImage(url, filename) {
            fetch(url)
                .then(response => response.blob())
                .then(blob => {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = filename;
                    link.click();
                })
                .catch(error => {
                    console.error("Download failed:", error);
                    alert("Error downloading map: " + error);
                });
        }

        document.getElementById('ndviBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = `https://services.sentinel-hub.com/ogc/wms/${SENTINEL_HUB_CLIENT_ID}?service=WMS&request=GetMap&layers=NDVI&format=image/png&width=512&height=512&bbox=${bbox}&srs=EPSG:4326`;
            map.addLayer(ndviLayer); // Show on map
            downloadImage(url, 'NDVI_Map.png');
        });

        document.getElementById('landCoverBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = `https://services.sentinel-hub.com/ogc/wms/${SENTINEL_HUB_CLIENT_ID}?service=WMS&request=GetMap&layers=TRUE_COLOR&format=image/png&width=512&height=512&bbox=${bbox}&srs=EPSG:4326`;
            map.addLayer(landCoverLayer); // Show on map
            downloadImage(url, 'LandCover_Map.png');
        });
    }
}

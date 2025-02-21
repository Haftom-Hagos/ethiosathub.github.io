// Global variable for the map
let map;

window.addEventListener('load', () => {
    console.log("Page loaded, checking GEE...");
    if (typeof ee === 'undefined') {
        console.error("GEE library not loaded. Check script tags in HTML or network connectivity.");
        alert("GEE failed to load. Check console for details.");
    } else {
        console.log("Attempting to initialize GEE...");
        ee.initialize(null, null, () => {
            console.log("GEE initialized successfully!");
        }, (error) => {
            console.error("GEE initialization failed:", error);
            alert("GEE failed to initialize: " + error + ". Please authenticate with Google Earth Engine.");
        });
    }
});

function initializeMap() {
    if (!map) {
        map = L.map('map').setView([9.145, 40.4897], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        const drawControl = new L.Control.Draw({
            draw: { rectangle: true, polygon: false, circle: false, marker: false, polyline: false },
            edit: { featureGroup: drawnItems }
        });
        map.addControl(drawControl);

        let selectedArea = null;
        map.on('draw:created', (e) => {
            drawnItems.clearLayers();
            selectedArea = e.layer;
            drawnItems.addLayer(selectedArea);
        });

        function calculateNDVI(geometry) {
            console.log("Calculating NDVI...");
            const sentinel2 = ee.ImageCollection('COPERNICUS/S2')
                .filterBounds(geometry)
                .filterDate('2023-01-01', '2023-12-31')
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
                .median();
            const ndvi = sentinel2.normalizedDifference(['B8', 'B4']).rename('NDVI');
            return ndvi.clip(geometry);
        }

        function downloadImage(image, filename) {
            console.log("Generating download URL for", filename);
            image.getDownloadURL({
                name: filename,
                scale: 30,
                region: selectedArea.toGeoJSON().geometry,
                format: 'GeoTIFF'
            }, (url) => {
                console.log("Download URL generated:", url);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
            }, (error) => {
                console.error("Download failed:", error);
                alert('Error generating download: ' + error);
            });
        }

        document.getElementById('ndviBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const geometry = ee.Geometry.Rectangle(selectedArea.getBounds().toBBoxArray());
            const ndviImage = calculateNDVI(geometry);
            downloadImage(ndviImage, 'NDVI_Map');
        });

        document.getElementById('landCoverBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const geometry = ee.Geometry.Rectangle(selectedArea.getBounds().toBBoxArray());
            const landCover = ee.Image('COPERNICUS/S2_LC').clip(geometry);
            downloadImage(landCover, 'LandCover_Map');
        });
    }
}

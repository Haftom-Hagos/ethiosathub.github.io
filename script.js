// Global variable for the map
let map;

// Initialize the map for the Maps tab
function initializeMap() {
    if (!map) {
        map = L.map('map').setView([9.145, 40.4897], 6); // Center on Ethiopia
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);

        // Add drawing capability (rectangle only)
        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        const drawControl = new L.Control.Draw({
            draw: {
                rectangle: true,
                polygon: false,
                circle: false,
                marker: false,
                polyline: false
            },
            edit: {
                featureGroup: drawnItems
            }
        });
        map.addControl(drawControl);

        let selectedArea = null;
        map.on('draw:created', (e) => {
            drawnItems.clearLayers();
            selectedArea = e.layer;
            drawnItems.addLayer(selectedArea);
        });

        // Google Earth Engine Initialization
        ee.initialize(null, null, () => {
            console.log("Google Earth Engine initialized!");
        }, (error) => {
            console.error("GEE Initialization failed:", error);
        });

        // Function to calculate NDVI
        function calculateNDVI(geometry) {
            const sentinel2 = ee.ImageCollection('COPERNICUS/S2')
                .filterBounds(geometry)
                .filterDate('2023-01-01', '2023-12-31')
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
                .median();

            const ndvi = sentinel2.normalizedDifference(['B8', 'B4']).rename('NDVI');
            return ndvi.clip(geometry);
        }

        // Function to download image
        function downloadImage(image, filename) {
            image.getDownloadURL({
                name: filename,
                scale: 30, // Resolution in meters
                region: selectedArea.toGeoJSON().geometry,
                format: 'GeoTIFF'
            }, (url) => {
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
            }, (error) => {
                alert('Error generating download: ' + error);
            });
        }

        // Button Event Listeners
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

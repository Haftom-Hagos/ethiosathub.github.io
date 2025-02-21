// Initialize the map
var map = L.map('map').setView([9.145, 40.489673], 6);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Layers object to store the GeoJSON layers
var layers = {
    ethiopia: null,
    zone: null,
    region: null,
    river: null
};

// Function to load GeoJSON file
function loadGeoJSON(url, styleOptions, layerName) {
    fetch(url)
        .then(response => response.json())
        .then(data => {
            // Make shapes hollow (only borders)
            styleOptions.fill = false;

            layers[layerName] = L.geoJSON(data, {
                style: styleOptions
            });
            layers[layerName].addTo(map);
        })
        .catch(error => console.error('Error loading the GeoJSON file:', error));
}

// Load GeoJSON files and add initial layers to the map
loadGeoJSON('ethiopia.geojson', { color: 'blue', weight: 2 }, 'ethiopia');
loadGeoJSON('eth_zone.geojson', { color: 'green', weight: 2 }, 'zone');
loadGeoJSON('eth_reg.geojson', { color: 'red', weight: 2 }, 'region');
// loadGeoJSON('clipped_rivers_ethiopia.geojson', { color: 'blue', weight: 2 }, 'river'); 

// Function to toggle layers
function toggleLayer(layerName, checked) {
    if (checked) {
        map.addLayer(layers[layerName]);
    } else {
        map.removeLayer(layers[layerName]);
    }
}

// Event listeners for checkboxes
document.getElementById('ethiopia').addEventListener('change', function(event) {
    toggleLayer('ethiopia', event.target.checked);
});

document.getElementById('zone').addEventListener('change', function(event) {
    toggleLayer('zone', event.target.checked);
});

document.getElementById('region').addEventListener('change', function(event) {
    toggleLayer('region', event.target.checked);
});

// document.getElementById('river').addEventListener('change', function(event) {
//    toggleLayer('river', event.target.checked);
//}); 
// Create a layer to hold drawn shapes
var drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Add drawing controls (rectangle only for simplicity)
var drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
        polygon: false, // No polygons
        marker: false, // No markers
        circle: false, // No circles
        polyline: false, // No lines
        rectangle: true // Just rectangles
    }
});
map.addControl(drawControl);

// When a rectangle is drawn, grab the coordinates
map.on('draw:created', function(e) {
    var layer = e.layer;
    drawnItems.addLayer(layer);
    var bounds = layer.getBounds();
    var coords = {
        northEast: bounds.getNorthEast(), // Top-right corner
        southWest: bounds.getSouthWest() // Bottom-left corner
    };
    console.log("Selected Area:", coords); // For now, log it—later, use it!
});
// Initialize Leaflet Map
const map = L.map('map').setView([9.145, 40.4897], 6); // Center on Ethiopia
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// Variable to store user-selected area
let selectedArea = null;

// Add drawing capability (simple rectangle for now)
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
        scale: 30,
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

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


// Initialize the map globally
var map;

// Function to initialize or update the map
function initializeMap() {
    if (!map) {
        // Initialize the map if it's not already initialized
        map = L.map('map').setView([9.145, 40.489673], 6);

        // Add OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    }

    // Load GeoJSON layers and add to the map
    loadGeoJSON('ethiopia.geojson', { color: 'blue', weight: 2 }, 'ethiopia');
    loadGeoJSON('eth_zone.geojson', { color: 'green', weight: 2 }, 'zone');
    loadGeoJSON('eth_reg.geojson', { color: 'red', weight: 2 }, 'region');
    loadGeoJSON('clipped_rivers_ethiopia.geojson', { color: 'blue', weight: 2 }, 'river');

    // Event listener for OpenStreetMap checkbox
    document.getElementById('osm').addEventListener('change', function(event) {
        if (event.target.checked) {
            map.addLayer(osmLayer);
        } else {
            map.removeLayer(osmLayer);
        }
    });

    // Store map globally so it can be accessed and reused
    window.map = map;

    // Initial layer added
    var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

// Function to load GeoJSON file
function loadGeoJSON(url, styleOptions, layerName) {
    fetch(url)
        .then(response => response.json())
        .then(data => {
            // Adjust style options to make shapes hollow
            styleOptions.fill = false;

            layers[layerName] = L.geoJSON(data, {
                style: styleOptions
            });
            layers[layerName].addTo(map);
        })
        .catch(error => console.error('Error loading the GeoJSON file:', error));
}

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

document.getElementById('river').addEventListener('change', function(event) {
    toggleLayer('river', event.target.checked);
});

// Show default tab on page load
document.getElementById("home").style.display = "block";

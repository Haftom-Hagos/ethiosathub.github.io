// Initialize the map
var map = L.map('map').setView([9.145, 40.489673], 6);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Load the GeoJSON file
fetch('ethiopia.geojson')
    .then(response => response.json())
    .then(data => {
        // Add the GeoJSON layer to the map
        L.geoJSON(data).addTo(map);
    })
    .catch(error => console.log('Error loading the GeoJSON file:', error));

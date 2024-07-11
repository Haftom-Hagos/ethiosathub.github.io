// Initialize the map
var map = L.map('map').setView([9.145, 40.489673], 6);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Function to load GeoJSON file
function loadGeoJSON(url, styleOptions) {
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('GeoJSON data loaded successfully from ' + url);
            L.geoJSON(data, {
                style: styleOptions
            }).addTo(map);
        })
        .catch(error => console.error('Error loading the GeoJSON file:', error));
}

// Load GeoJSON files
loadGeoJSON('ethiopia.geojson', {color: 'blue', weight: 2});
loadGeoJSON('eth_zone.geojson', {color: 'green', weight: 2});
loadGeoJSON('eth_reg.geojson', {color: 'red', weight: 2});

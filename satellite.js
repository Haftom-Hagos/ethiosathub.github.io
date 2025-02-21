// Initialize Leaflet Map
const map = L.map('map').setView([9.145, 40.4897], 6); // Center on Ethiopia
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// Variable to store user-selected area
let selectedArea = null;

// Add drawing capability
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
    alert('Google Earth Engine initialization failed. Check the console for details.');
});

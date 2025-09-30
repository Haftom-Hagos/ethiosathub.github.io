// script.js

// --------------------- MAP INIT ---------------------
const map = L.map('map').setView([9.145, 40.489673], 6); // Center on Ethiopia

// Base layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Layer holders
let landCoverLayer;
let districtLayer;
let drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// --------------------- DISTRICT GEOJSON ---------------------
const districtSelect = document.getElementById('districtSelect');
let districtsData;

// Load districts from GitHub (GCS)
fetch('https://raw.githubusercontent.com/Haftom-Hagos/ethiosathub.github.io/main/data/ethiopia_admin_level_3_gcs_simplified.geojson')
.then(res => res.json())
.then(data => {
    districtsData = data;
    // Populate dropdown
    data.features.forEach(f => {
        let option = document.createElement('option');
        option.value = f.properties.ADM3_EN;
        option.textContent = f.properties.ADM3_EN;
        districtSelect.appendChild(option);
    });

    // Add district boundaries to map
    districtLayer = L.geoJSON(districtsData, {
        style: { color: "#000", weight: 1, fill: false }
    }).addTo(map);
});

// --------------------- YEAR DROPDOWN ---------------------
const yearSelect = document.getElementById('yearSelect');
const landCoverYears = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]; // example years
landCoverYears.forEach(y => {
    let option = document.createElement('option');
    option.value = y;
    option.textContent = y;
    yearSelect.appendChild(option);
});

// --------------------- DRAW CONTROL ---------------------
const drawControl = new L.Control.Draw({
    draw: {
        polygon: true,
        rectangle: true,
        circle: false,
        polyline: false,
        marker: false,
        circlemarker: false
    },
    edit: {
        featureGroup: drawnItems
    }
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, function (e) {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
});

// --------------------- VIEW & DOWNLOAD SELECTION ---------------------
const viewBtn = document.getElementById('viewSelectionBtn');
const downloadBtn = document.getElementById('downloadSelectionBtn');

viewBtn.addEventListener('click', () => {
    // Clear previous layers
    if (landCoverLayer) map.removeLayer(landCoverLayer);

    // Determine if user drew polygon or selected district
    if (drawnItems.getLayers().length > 0) {
        // NDVI for drawn polygon
        const drawnGeoJSON = drawnItems.toGeoJSON();
        viewNDVI(drawnGeoJSON);
    } else if (districtSelect.value) {
        // Land Cover or NDVI for selected district
        const districtFeature = districtsData.features.find(f => f.properties.ADM3_EN === districtSelect.value);
        const selectedYear = yearSelect.value;

        if (selectedYear) {
            // LAND COVER
            viewLandCover(districtFeature, selectedYear);
        } else {
            // NDVI
            viewNDVI(districtFeature);
        }
    } else {
        alert("Please draw an area or select a district to view.");
    }
});

downloadBtn.addEventListener('click', () => {
    if (drawnItems.getLayers().length > 0) {
        const drawnGeoJSON = drawnItems.toGeoJSON();
        downloadNDVI(drawnGeoJSON);
    } else if (districtSelect.value) {
        const districtFeature = districtsData.features.find(f => f.properties.ADM3_EN === districtSelect.value);
        const selectedYear = yearSelect.value;

        if (selectedYear) {
            downloadLandCover(districtFeature, selectedYear);
        } else {
            downloadNDVI(districtFeature);
        }
    } else {
        alert("Please draw an area or select a district to download.");
    }
});

// --------------------- LAND COVER FUNCTIONS ---------------------
function viewLandCover(districtFeature, year) {
    // Remove previous land cover layer
    if (landCoverLayer) map.removeLayer(landCoverLayer);

    // Example: Construct GeoTIFF URL based on year
    const url = `https://your-server.com/landcover/${year}.tif`; // replace with actual path

    // Use a tile layer or GeoTIFF plugin to show only district
    // For demo, we just highlight the district
    landCoverLayer = L.geoJSON(districtFeature, {
        style: { color: 'green', weight: 2, fillOpacity: 0.3 }
    }).addTo(map);

    map.fitBounds(landCoverLayer.getBounds());
}

function downloadLandCover(districtFeature, year) {
    const url = `https://your-server.com/landcover/${year}.tif`; // replace with actual path
    // Simple download by opening link (can be improved)
    const link = document.createElement('a');
    link.href = url;
    link.download = `landcover_${year}_${districtFeature.properties.ADM3_EN}.tif`;
    link.click();
}

// --------------------- NDVI FUNCTIONS ---------------------
function viewNDVI(areaFeature) {
    // Here, connect to NDVI service (like your GEE app)
    // For demo: highlight area
    if (landCoverLayer) map.removeLayer(landCoverLayer);
    landCoverLayer = L.geoJSON(areaFeature, {
        style: { color: 'red', weight: 2, fillOpacity: 0.3 }
    }).addTo(map);
    map.fitBounds(landCoverLayer.getBounds());
}

function downloadNDVI(areaFeature) {
    // Here, connect to NDVI download endpoint
    alert("NDVI download for selected area is not implemented yet."); 
}

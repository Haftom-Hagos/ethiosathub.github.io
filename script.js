let map, drawnItems, selectedArea, ndviLayer;

const BACKEND_URL = 'https://hafrepo.onrender.com'; // Render backend URL

function getSelectedDateRange() {
    const yearEl = document.getElementById('yearSelect');
    const mStartEl = document.getElementById('monthStart');
    const mEndEl = document.getElementById('monthEnd');
    if (!yearEl || !mStartEl || !mEndEl) return null;

    const year = parseInt(yearEl.value, 10);
    const ms = parseInt(mStartEl.value, 10);
    const me = parseInt(mEndEl.value, 10);
    const mStart = Math.min(ms, me);
    const mEnd = Math.max(ms, me);

    const startDate = `${year}-${String(mStart).padStart(2, '0')}-01`;
    const lastDay = new Date(year, mEnd, 0).getDate();
    const endDate = `${year}-${String(mEnd).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return { startDate, endDate };
}

function addGEELayer(mapId, token) {
    const url = `https://earthengine.googleapis.com/map/${mapId}/{z}/{x}/{y}?token=${token}`;
    ndviLayer = L.tileLayer(url, { maxZoom: 18, attribution: 'Google Earth Engine' }).addTo(map);
}

function downloadImage(url, filename) {
    fetch(url)
        .then(res => res.blob())
        .then(blob => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
        })
        .catch(err => alert('Error downloading map: ' + err.message));
}

function initializeMap() {
    if (map) return;

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
        if (ndviLayer) map.removeLayer(ndviLayer);
    });

    // View NDVI
    document.getElementById('viewNdviBtn').addEventListener('click', () => {
        if (!selectedArea) return alert('Please draw an area on the map first!');
        const dateRange = getSelectedDateRange();
        const bounds = selectedArea.getBounds();
        const bbox = {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
        };

        fetch(`${BACKEND_URL}/ndvi`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bbox, ...dateRange })
        })
        .then(res => res.json())
        .then(data => {
            if (data.mapId && data.token) {
                if (ndviLayer) map.removeLayer(ndviLayer);
                addGEELayer(data.mapId, data.token);
                alert('NDVI visualized on the map!');
            } else if (data.error) {
                alert(data.error);
            }
        })
        .catch(err => alert('Failed to fetch NDVI: ' + err.message));
    });

    // Download NDVI
    document.getElementById('ndviBtn').addEventListener('click', () => {
        if (!selectedArea) return alert('Please draw an area on the map first!');
        const dateRange = getSelectedDateRange();
        const bounds = selectedArea.getBounds();
        const bbox = {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
        };

        fetch(`${BACKEND_URL}/downloadNDVI`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bbox, ...dateRange })
        })
        .then(res => res.json())
        .then(data => {
            if (data.url) {
                downloadImage(data.url, 'NDVI_Map.tif');
            } else if (data.message) {
                alert(data.message);
            }
        })
        .catch(err => alert('Failed to download NDVI: ' + err.message));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const yearSelect = document.getElementById('yearSelect');
    const monthStart = document.getElementById('monthStart');
    const monthEnd = document.getElementById('monthEnd');

    if (yearSelect && monthStart && monthEnd) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= 2016; y--) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            yearSelect.appendChild(opt);
        }

        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        for (let m = 1; m <= 12; m++) {
            const opt1 = document.createElement('option');
            opt1.value = String(m);
            opt1.textContent = `${String(m).padStart(2,'0')} (${monthNames[m-1]})`;
            monthStart.appendChild(opt1);
            monthEnd.appendChild(opt1.cloneNode(true));
        }

        yearSelect.value = String(currentYear);
        monthStart.value = '1';
        monthEnd.value = '12';
    }
});

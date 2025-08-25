let map, drawnItems, selectedArea, ndviLayer;

const BACKEND_URL = 'https://hafrepo-2.onrender.com'; // Render backend URL

function getSelectedDateRange() {
    const yearEl = document.getElementById('yearSelect');
    const mStartEl = document.getElementById('monthStart');
    const mEndEl = document.getElementById('monthEnd');
    if (!yearEl || !mStartEl || !mEndEl) {
        console.error('Date selection elements not found');
        return null;
    }

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

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
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
        console.log('Area drawn:', selectedArea.getBounds().toBBoxString());
    });

    // View NDVI
    document.getElementById('viewNdviBtn').addEventListener('click', async () => {
        if (!selectedArea) {
            alert('Please draw an area on the map first!');
            console.error('No area selected');
            return;
        }
        const dateRange = getSelectedDateRange();
        if (!dateRange) {
            alert('Invalid date range');
            console.error('Invalid date range');
            return;
        }
        const bounds = selectedArea.getBounds();
        const bbox = {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
        };
        console.log('Sending NDVI request:', { bbox, ...dateRange });

        try {
            const res = await fetch(`${BACKEND_URL}/ndvi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bbox, ...dateRange })
            });
            if (!res.ok) {
                const errorText = await res.text();
                console.error('NDVI request failed:', res.status, errorText);
                throw new Error(errorText || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (ndviLayer) map.removeLayer(ndviLayer);
            ndviLayer = L.imageOverlay(url, bounds).addTo(map);
            console.log('NDVI image displayed');
            alert('NDVI visualized on the map!');
        } catch (err) {
            console.error('NDVI fetch error:', err);
            alert('Failed to fetch NDVI: ' + err.message);
        }
    });

    // Download NDVI
    document.getElementById('ndviBtn').addEventListener('click', async () => {
        if (!selectedArea) {
            alert('Please draw an area on the map first!');
            console.error('No area selected');
            return;
        }
        const dateRange = getSelectedDateRange();
        if (!dateRange) {
            alert('Invalid date range');
            console.error('Invalid date range');
            return;
        }
        const bounds = selectedArea.getBounds();
        const bbox = {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
        };
        if (bbox.east - bbox.west > 2 || bbox.north - bbox.south > 2) {
            alert('Please draw a smaller area (max 2°x2°).');
            console.error('Area too large:', bbox);
            return;
        }
        console.log('Sending NDVI download request:', { bbox, ...dateRange });

        try {
            const res = await fetch(`${BACKEND_URL}/ndvi/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bbox, ...dateRange })
            });
            if (!res.ok) {
                const errorText = await res.text();
                console.error('NDVI download failed:', res.status, errorText);
                throw new Error(errorText || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            downloadBlob(blob, `NDVI_${dateRange.startDate}_to_${dateRange.endDate}.tif`);
            console.log('NDVI downloaded');
        } catch (err) {
            console.error('NDVI download error:', err);
            alert('Failed to download NDVI: ' + err.message);
        }
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

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (let m = 1; m <= 12; m++) {
            const opt1 = document.createElement('option');
            opt1.value = String(m);
            opt1.textContent = `${String(m).padStart(2, '0')} (${monthNames[m - 1]})`;
            monthStart.appendChild(opt1);
            monthEnd.appendChild(opt1.cloneNode(true));
        }

        yearSelect.value = String(currentYear);
        monthStart.value = '1';
        monthEnd.value = '12';
    } else {
        console.error('Date selection elements not found in DOM');
    }
    initializeMap();
    console.log('Map initialized');
});

let map, drawnItems, selectedArea, ndviLayer, landCoverLayer;

function initializeMap() {
    if (!map) {
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
            // Remove existing layers before adding new ones
            if (ndviLayer) map.removeLayer(ndviLayer);
            if (landCoverLayer) map.removeLayer(landCoverLayer);
        });

        function addGEELayer(mapId, token, name) {
            const url = `https://earthengine.googleapis.com/map/${mapId}/{z}/{x}/{y}?token=${token}`;
            const layer = L.tileLayer(url, {
                maxZoom: 18,
                attribution: 'Google Earth Engine'
            });
            layer.addTo(map);
            if (name === 'NDVI') ndviLayer = layer;
            else if (name === 'Land Cover') landCoverLayer = layer;
            return layer;
        }

        function downloadImage(url, filename) {
            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = filename;
                    link.click();
                })
                .catch(error => {
                    console.error("Download failed:", error);
                    alert("Error downloading map: " + error.message);
                });
        }

        // Download NDVI Map
        document.getElementById('ndviBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = {
                west: bounds.getWest(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                north: bounds.getNorth()
            };
            fetch('https://ethiosathub-gee-cf19aa5b98a7.herokuapp.com/getNDVI', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bbox })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.url) {
                    downloadImage(data.url, 'NDVI_Map.png');
                } else if (data.error) {
                    alert(data.error);
                }
            })
            .catch(error => {
                console.error("API call failed:", error);
                alert("Failed to fetch NDVI: " + error.message);
            });
        });

        // Download Land Cover Map
        document.getElementById('landCoverBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = {
                west: bounds.getWest(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                north: bounds.getNorth()
            };
            fetch('https://ethiosathub-gee-cf19aa5b98a7.herokuapp.com/getLandCover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bbox })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.url) {
                    downloadImage(data.url, 'LandCover_Map.png');
                } else if (data.error) {
                    alert(data.error);
                }
            })
            .catch(error => {
                console.error("API call failed:", error);
                alert("Failed to fetch Land Cover: " + error.message);
            });
        });

        // View NDVI Map
        document.getElementById('viewNdviBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = {
                west: bounds.getWest(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                north: bounds.getNorth()
            };
            fetch('https://ethiosathub-gee-cf19aa5b98a7.herokuapp.com/viewNDVI', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bbox })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.mapId && data.token) {
                    if (ndviLayer) map.removeLayer(ndviLayer);
                    addGEELayer(data.mapId, data.token, 'NDVI');
                    alert('NDVI visualized on the map!');
                } else if (data.error) {
                    alert(data.error);
                }
            })
            .catch(error => {
                console.error("API call failed:", error);
                alert("Failed to fetch NDVI visualization: " + error.message);
            });
        });

        // View Land Cover Map
        document.getElementById('viewLandCoverBtn').addEventListener('click', () => {
            if (!selectedArea) {
                alert('Please draw an area on the map first!');
                return;
            }
            const bounds = selectedArea.getBounds();
            const bbox = {
                west: bounds.getWest(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                north: bounds.getNorth()
            };
            fetch('https://ethiosathub-gee-cf19aa5b98a7.herokuapp.com/viewLandCover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bbox })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.mapId && data.token) {
                    if (landCoverLayer) map.removeLayer(landCoverLayer);
                    addGEELayer(data.mapId, data.token, 'Land Cover');
                    alert('Land Cover visualized on the map!');
                } else if (data.error) {
                    alert(data.error);
                }
            })
            .catch(error => {
                console.error("API call failed:", error);
                alert("Failed to fetch Land Cover visualization: " + error.message);
            });
        });
    }
}



document.addEventListener('DOMContentLoaded', () => {
    const galleryItems = document.querySelectorAll('.gallery-item');

    galleryItems.forEach(item => {
        item.addEventListener('click', () => {
            // Toggle zoomed class on the clicked item
            item.classList.toggle('zoomed');
            document.body.classList.toggle('zoomed');

            // If zoomed, add a click-outside listener to close
            if (item.classList.contains('zoomed')) {
                document.addEventListener('click', function closeZoom(e) {
                    if (!item.contains(e.target)) {
                        item.classList.remove('zoomed');
                        document.body.classList.remove('zoomed');
                        document.removeEventListener('click', closeZoom);
                    }
                });
            }
        });
    });
});

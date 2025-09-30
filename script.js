<!DOCTYPE html>
<html>
<head>
    <title>Ethiopia Satellite Data</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/@esri/leaflet@3.0.12/dist/esri-leaflet.js"></script>
    <script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
    <style>
        #map { height: 600px; width: 100%; }
        #controls { margin: 10px; }
        #ndviControls, #landcoverControls { margin-top: 10px; }
    </style>
</head>
<body>
    <div id="controls">
        <div>
            <label><input type="radio" name="mode" value="ndvi" checked> NDVI</label>
            <label><input type="radio" name="mode" value="landcover"> Land Cover</label>
        </div>
        <div id="ndviControls">
            <label>Year: <select id="yearSelect"></select></label>
            <label>Start Month: <select id="monthStart"></select></label>
            <label>End Month: <select id="monthEnd"></select></label>
        </div>
        <div id="landcoverControls">
            <label>Year: <select id="landcoverYearSelect"></select></label>
        </div>
        <button id="viewSelectionBtn">View Selection</button>
        <button id="downloadSelectionBtn">Download Selection</button>
    </div>
    <div id="map"></div>
    <script src="script.js"></script>
</body>
</html>

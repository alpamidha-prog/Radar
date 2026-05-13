// Configuration
const API_URLS = {
    ADSB_LOL: 'https://api.adsb.lol/v2/lat/64.9/lon/26.0/dist/800',
    OPENSKY: 'https://opensky-network.org/api/states/all?lamin=59.8&lomin=20.6&lamax=70.1&lomax=31.6'
};
const PROXIES = [
    '', // Direct
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?'
];
const UPDATE_INTERVAL = 15000;

// State
let flightMarkers = {};
let selectedFlightIcao = null;
let currentSource = 'ADSB_LOL';
let weatherLayer = null;
let radarTimestamps = [];
let radarLayers = {}; // Cache for layers
let currentRadarIndex = 0;
let animationTimer = null;
let isAnimating = false;

// Initialize Map
const map = L.map('map', {
    zoomControl: false, // Custom position
    attributionControl: false // Custom position
}).setView([64.9, 26.0], 5); // Center of Finland

// Controls
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.control.attribution({ position: 'bottomright' }).addTo(map);

// Dark Theme Tile Layer (CartoDB Dark Matter)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// SVG Path for an airplane (pointing straight UP = 0 degrees heading)
const planeSvgPath = "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z";

/**
 * Create a custom Leaflet DivIcon with the airplane SVG rotated to its heading
 */
function createPlaneIcon(heading, isSelected = false) {
    const selectedClass = isSelected ? 'selected' : '';
    return L.divIcon({
        html: `<div class="plane-marker ${selectedClass}" style="transform: rotate(${heading}deg);">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                   <path d="${planeSvgPath}" />
                 </svg>
               </div>`,
        className: '', // remove leaflet default background
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
    });
}

/**
 * Update the UI Side Panel with selected flight info
 */
function updateSidePanel(flightData) {
    const panel = document.getElementById('selected-flight');
    
    if (!flightData) {
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');
    
    // Normalize data (handle both adsb.lol and OpenSky formats)
    let info = {};
    if (flightData.source === 'ADSB_LOL') {
        info = {
            callsign: (flightData.flight || 'Unknown').trim(),
            country: flightData.t || 'Unknown', // adsb.lol uses 't' for type, country not always available
            altFt: flightData.alt_baro || 0,
            speedKt: Math.round(flightData.gs || 0),
            heading: flightData.track || 0,
            vRateFtMin: flightData.baro_rate || 0
        };
    } else {
        // OpenSky
        const alt = flightData[7] || 0;
        const vel = flightData[9] || 0;
        const vRate = flightData[11] || 0;
        info = {
            callsign: (flightData[1] || 'Unknown').trim(),
            country: flightData[2] || 'Unknown',
            altFt: Math.round(alt * 3.28084),
            speedKt: Math.round(vel * 1.94384),
            heading: flightData[10] || 0,
            vRateFtMin: Math.round(vRate * 196.85)
        };
    }

    document.getElementById('detail-callsign').innerText = info.callsign || 'N/A';
    document.getElementById('detail-country').innerText = info.country;
    document.getElementById('detail-altitude').innerText = `${info.altFt.toLocaleString()} ft`;
    document.getElementById('detail-velocity').innerText = `${info.speedKt.toLocaleString()} kt`;
    document.getElementById('detail-heading').innerText = `${Math.round(info.heading)}°`;
    
    // Format vertical rate with sign
    let vRateText = 'Level';
    if (info.vRateFtMin > 50) vRateText = `+${info.vRateFtMin} ft/min ↗`;
    else if (info.vRateFtMin < -50) vRateText = `${info.vRateFtMin} ft/min ↘`;
    
    document.getElementById('detail-vrate').innerText = vRateText;
}

/**
 * Fetch latest data with proxy fallback and source switching
 */
async function updateFlightData() {
    const urls = [
        API_URLS.ADSB_LOL,
        API_URLS.OPENSKY
    ];
    
    let success = false;
    let data = null;
    let usedSource = 'ADSB_LOL';

    for (const url of urls) {
        for (const proxy of PROXIES) {
            try {
                const response = await fetch(proxy + encodeURIComponent(url), {
                    signal: AbortSignal.timeout(5000)
                });
                if (response.ok) {
                    data = await response.json();
                    usedSource = url === API_URLS.ADSB_LOL ? 'ADSB_LOL' : 'OPENSKY';
                    success = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        if (success) break;
    }

    if (!success) {
        console.error('All fetch attempts failed');
        setConnectionStatus(false);
        return;
    }

    setConnectionStatus(true);
    const timeSpan = document.getElementById('last-updated');
    timeSpan.innerText = new Date().toLocaleTimeString();

    let flights = [];
    if (usedSource === 'ADSB_LOL') {
        flights = data.ac || [];
    } else {
        flights = data.states || [];
    }

    const totalFlightsEl = document.getElementById('total-flights');
    totalFlightsEl.innerText = flights.length;
    
    const currentIcaos = new Set();
    
    flights.forEach(f => {
        // Normalize coordinates and identification
        let flight = f;
        let icao, lat, lon, heading, callsign, altFt;

        if (usedSource === 'ADSB_LOL') {
            icao = flight.hex;
            lat = flight.lat;
            lon = flight.lon;
            heading = flight.track || 0;
            callsign = (flight.flight || '').trim() || icao;
            altFt = flight.alt_baro || 0;
            flight.source = 'ADSB_LOL';
        } else {
            icao = flight[0];
            callsign = (flight[1] || '').trim() || icao;
            lon = flight[5];
            lat = flight[6];
            heading = flight[10] || 0;
            altFt = Math.round((flight[7] || 0) * 3.28084);
            flight.source = 'OPENSKY';
        }

        if (lat === null || lon === null) return;
        currentIcaos.add(icao);

        const isSelected = (selectedFlightIcao === icao);
        const icon = createPlaneIcon(heading, isSelected);

        if (flightMarkers[icao]) {
            const marker = flightMarkers[icao];
            marker.setLatLng([lat, lon]);
            marker.setIcon(icon);
            marker.flightData = flight;
            if (marker.isPopupOpen()) {
                marker.setPopupContent(`<strong>${callsign}</strong><br>Alt: ${altFt.toLocaleString()} ft`);
            }
        } else {
            const popupContent = `<strong>${callsign}</strong><br>Alt: ${altFt.toLocaleString()} ft`;
            const marker = L.marker([lat, lon], { icon: icon }).bindPopup(popupContent);
            marker.flightData = flight;
            
            marker.on('click', () => {
                if (selectedFlightIcao && flightMarkers[selectedFlightIcao]) {
                    const prevMarker = flightMarkers[selectedFlightIcao];
                    const prevHeading = prevMarker.flightData.source === 'ADSB_LOL' ? 
                                       prevMarker.flightData.track : prevMarker.flightData[10];
                    prevMarker.setIcon(createPlaneIcon(prevHeading || 0, false));
                }
                selectedFlightIcao = icao;
                marker.setIcon(createPlaneIcon(heading, true));
                updateSidePanel(marker.flightData);
            });

            flightMarkers[icao] = marker;
            marker.addTo(map);
        }

        if (isSelected) updateSidePanel(flight);
    });

    // Remove stale
    Object.keys(flightMarkers).forEach(icao => {
        if (!currentIcaos.has(icao)) {
            map.removeLayer(flightMarkers[icao]);
            delete flightMarkers[icao];
            if (selectedFlightIcao === icao) {
                selectedFlightIcao = null;
                updateSidePanel(null);
            }
        }
    });
}

function clearAllMarkers() {
    Object.values(flightMarkers).forEach(marker => map.removeLayer(marker));
    flightMarkers = {};
    if (selectedFlightIcao) {
        selectedFlightIcao = null;
        updateSidePanel(null);
    }
}

function setConnectionStatus(isLive) {
    const indicator = document.getElementById('live-indicator');
    const statusText = document.getElementById('connection-status');
    
    if (isLive) {
        indicator.classList.remove('error');
        statusText.innerText = 'Live';
    } else {
        indicator.classList.add('error');
        statusText.innerText = 'Error';
        document.getElementById('last-updated').innerText = 'Connection Lost';
    }
}

// Map click deselects
map.on('click', (e) => {
    // If clicking on map background (not a marker)
    if (selectedFlightIcao && flightMarkers[selectedFlightIcao]) {
        const marker = flightMarkers[selectedFlightIcao];
        const heading = marker.flightData[10] || 0;
        marker.setIcon(createPlaneIcon(heading, false));
        
        selectedFlightIcao = null;
        updateSidePanel(null);
    }
});

/**
 * RainViewer Weather Radar Integration
 */
async function initWeatherRadar() {
    try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await response.json();
        
        if (data && data.radar && data.radar.past) {
            radarTimestamps = data.radar.past;
            
            // Clean up old layers that are no longer in the timestamps
            const validTimes = new Set(radarTimestamps.map(t => t.time));
            Object.keys(radarLayers).forEach(t => {
                if (!validTimes.has(parseInt(t))) {
                    if (map.hasLayer(radarLayers[t])) map.removeLayer(radarLayers[t]);
                    delete radarLayers[t];
                }
            });

            // Initialize current index to the latest
            currentRadarIndex = radarTimestamps.length - 1;
            showRadarFrame(currentRadarIndex);
        }
    } catch (error) {
        console.error('Failed to initialize weather radar:', error);
    }
}

function showRadarFrame(index) {
    if (!radarTimestamps.length) return;
    
    const timestamp = radarTimestamps[index].time;
    const radarUrl = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/{z}/{x}/{y}/1/1_1.png`;
    
    // Update or create main weatherLayer
    if (!weatherLayer) {
        weatherLayer = L.tileLayer(radarUrl, {
            opacity: 0.6,
            zIndex: 100
        });
        
        // If toggle is already on, add it
        if (document.getElementById('weather-toggle').checked) {
            weatherLayer.addTo(map);
        }
    } else {
        weatherLayer.setUrl(radarUrl);
    }

    // Update Timestamp UI
    const date = new Date(timestamp * 1000);
    document.getElementById('radar-timestamp').innerText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toggleAnimation() {
    const playBtn = document.getElementById('rain-play-pause');
    
    if (isAnimating) {
        clearInterval(animationTimer);
        isAnimating = false;
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        playBtn.classList.remove('active');
    } else {
        isAnimating = true;
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        playBtn.classList.add('active');
        
        animationTimer = setInterval(() => {
            currentRadarIndex++;
            if (currentRadarIndex >= radarTimestamps.length) {
                currentRadarIndex = 0;
            }
            showRadarFrame(currentRadarIndex);
        }, 1000); // 1 frame per second
    }
}

// Global Event Listeners for Weather
document.getElementById('weather-toggle').addEventListener('change', (e) => {
    const playBtn = document.getElementById('rain-play-pause');
    const weatherInfo = document.getElementById('weather-info');
    
    if (e.target.checked) {
        if (weatherLayer) weatherLayer.addTo(map);
        playBtn.classList.remove('hidden');
        weatherInfo.classList.remove('hidden');
    } else {
        if (weatherLayer) map.removeLayer(weatherLayer);
        playBtn.classList.add('hidden');
        weatherInfo.classList.add('hidden');
        
        // Stop animation if it was running
        if (isAnimating) toggleAnimation();
    }
});

document.getElementById('rain-play-pause').addEventListener('click', toggleAnimation);

// Initialization
updateFlightData();
initWeatherRadar();
setInterval(updateFlightData, UPDATE_INTERVAL);
// Refresh weather data list every 10 minutes
setInterval(initWeatherRadar, 600000);

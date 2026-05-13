# ✈️ FI Radar - Live Flight Tracker

A premium, real-time flight tracking application focused on the Finland region. This project integrates live transponder data with meteorological radar overlays to provide a comprehensive situational awareness dashboard.

![GitHub repo size](https://img.shields.io/github/repo-size/alpamidha-prog/Radar?style=for-the-badge)
![GitHub last commit](https://img.shields.io/github/last-commit/alpamidha-prog/Radar?style=for-the-badge)

## 🌟 Features

- **Live Flight Tracking**: Real-time position updates for aircraft over Finland using the OpenSky Network API.
- **Interactive Map**: Built with Leaflet.js, featuring a custom dark-themed map (CartoDB Dark Matter).
- **Detailed Flight Info**: Click any aircraft to see its callsign, origin country, altitude (ft), ground speed (kt), and vertical rate.
- **Weather Radar Overlay**: Integration with RainViewer API to show precipitation patterns.
- **Animated Radar**: Playback feature for the last 2 hours of weather data to track storm movements.
- **Responsive Glassmorphic UI**: A modern, sleek side panel with a blurred background effect.
- **CORS Reliability**: Built-in fallback to a CORS proxy to ensure data loads across all environments.

## 🚀 Getting Started

### Prerequisites
No installation is required! This is a static web application.

### Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/alpamidha-prog/Radar.git
   ```
2. Open `index.html` in any modern web browser.

## 🛠️ Tech Stack

- **Core**: HTML5, CSS3, JavaScript (ES6+)
- **Mapping**: [Leaflet.js](https://leafletjs.com/)
- **Data APIs**: 
  - [OpenSky Network](https://opensky-network.org/) (Flight Data)
  - [RainViewer](https://www.rainviewer.com/api.html) (Weather Radar)
- **Typography**: [Outfit](https://fonts.google.com/specimen/Outfit) via Google Fonts

## 📡 Data Handling
The app fetches flight data every **15 seconds** to stay within API rate limits while maintaining high accuracy. If a direct connection to OpenSky is blocked by your browser's CORS policy, the app automatically switches to a secure proxy.

## 📝 License
This project is for educational purposes. Data usage is subject to the terms of OpenSky Network and RainViewer.

---
Created with ❤️ for real-time aviation enthusiasts.

# MAVE Bus Tracking

Simple web application for real-time bus tracking in Vale do Ave region (northern Portugal).

## Features

- Search and select bus stops
- Filter by bus number to see all stops on that line (in route order)
- Real-time bus arrival countdowns
- Favorite stops (saved in cookies)
- "Perto de mim" tab: your location on a map plus all stops within an adjustable radius (200 m – 5 km, default 2 km), sorted by distance with walking time
- Mobile-friendly responsive design
- Portuguese interface

## Technology

- Pure HTML5, CSS3, JavaScript (ES6+)
- Bootstrap 5 (via CDN)
- Leaflet + OpenStreetMap tiles (lazy-loaded only when the "Perto de mim" tab is opened)
- Geolocation requires HTTPS (GitHub Pages) or `localhost`
- No build process required

## Local Development

Serve the app locally with Python:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## API

Uses the MAVE bus tracking API at `https://mave.elevensystems.pt/api`

**Note**: This is an unofficial reverse-engineered API. Endpoints and data formats may change without notice.

## License

MIT

## Credits

- MAVE (Mobilidade de Ave) for public transport services
- Eleven Systems for the tracking platform

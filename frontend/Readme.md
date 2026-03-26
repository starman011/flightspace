# SkyDot Frontend

React 18 + Vite frontend for SkyDot real-time flight radar.

## Setup

```bash
npm install
npm run dev     # starts at http://localhost:5173
npm run build   # production build (target < 250KB gzip)
```

## Stack

- React 18 (UI)
- Leaflet 1.9 + react-leaflet (map)
- Vite (build tool)
- Space Mono (typography)
- CartoDB Positron/DarkMatter tiles (free, minimal)

## Architecture

- `src/hooks/` — WebSocket, session, aircraft state
- `src/components/Map/` — Leaflet map + Canvas aircraft markers
- `src/components/DetailPanel/` — Click-to-reveal flight details
- `src/components/SearchBar/` — Callsign / flight search
- `src/components/Filters/` — Type + altitude filters
- `src/components/StatusBar/` — Connection status indicator
- `src/utils/` — Interpolation, formatters

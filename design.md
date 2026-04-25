# ObjectTracer — Design Document & Platform Vision

> **Living document.** Every feature, screen, and interaction is governed by this file.
> Last updated: 2026-03-21

---

## Part I — Platform Vision

### 1.1 What SkyDot Is

SkyDot is a **space-centric real-time observatory** — a single cinematic viewport into the solar system and everything moving through it. The default view is the heliocentric solar system. The Earth is one of nine objects in that system. When a user selects a filter that is Earth-bound (flights, ships), the camera smoothly navigates inward and locks onto Earth, presenting the familiar globe view. When the user clears that filter, the camera zooms back out to the solar system.

**One scene. One camera. Every scale.**

### 1.2 Scope of Tracked Objects

| Category | Source | Notes |
|---|---|---|
| **Commercial flights** | OpenSky Network (free) | Existing — ADSB positions |
| **Maritime vessels** | AISStream.io (free) | Existing — AIS positions |
| **Satellites** | CelesTrak TLE (free) | Existing — SGP4 propagated |
| **Near-Earth asteroids** | NASA NeoWs API (free key) | Daily close-approach list + orbital elements |
| **All tracked NEOs / comets** | NASA Horizons API (free) | Ephemeris for named bodies |
| **Planets** | NASA Horizons / Le Système Solaire API (free) | Real-time heliocentric positions |
| **ISS** | Open Notify API (free, no auth) | `http://api.open-notify.org/iss-now.json` |
| **Rocket launches & missions** | Launch Library 2 / LL2 (free, 15 req/hr) | Upcoming + past launches |
| **Crewed missions** | Open Notify + LL2 | People in space, mission status |
| **Space weather** | NASA DONKI (free key) | Solar flares, geomagnetic storms |

### 1.3 Camera Behaviour by Filter

| Active filter | Camera position | Map texture |
|---|---|---|
| None (default) | Heliocentric — shows full solar system | Planet spheres with NASA textures |
| Flights / Ships / Satellites | Zoomed to Earth orbit (~500 km) | NASA GIBS Earth imagery tiles |
| Rockets & missions | Follows mission path or hovers at launch site | Earth or deep space depending on mission phase |
| Asteroids | Shows inner solar system, NEO orbit paths highlighted | Heliocentric with orbital ellipses |
| Planets | Heliocentric, selected planet highlighted + info panel | Planet's own texture map |

### 1.4 Data-First, Decoration-Second

Every visual element must correspond to a real data point. No decorative orbits, no fake asteroid fields, no illustrative debris. If it is on screen it is tracked. If it is not tracked, it is not on screen.

---

## Part II — Design System: Celestial Precision

### 2.1 Creative North Star — "The Astral Observer"

This design system rejects the boxy nature of traditional SaaS dashboards in favour of an expansive, cinematic interface that mirrors the vastness of space. It is designed to feel like a high-end physical console where data does not just sit on a screen but floats within a vacuum. We achieve this through **intentional asymmetry**, where heavy data visualisations are balanced by wide dead space, and **tonal depth**, where the interface feels layered like planetary rings rather than a flat sheet. Breaking the rigid 12-column grid with overlapping elements and offset typography creates an experience that is bespoke, technical, and premium.

---

### 2.2 Colour & Atmospheric Tones

```
surface-dim              #0f1419   Deep space — the void
surface                  #0f1419   Base background
surface-container-low    #171c22   Structural sections
surface-container        #1e2329   Mid-level containers
surface-container-high   #262a30   Primary data containers
surface-container-highest #30353b  Hover / active focal points
surface-variant          #3b494c   Ghost borders, subtle edges
surface-tint             #00daf3   Atmospheric highlight colour

primary                  #c3f5ff   Starlight — high-energy text / active state
primary-container        #00e5ff   Gradient endpoint / glows
on-primary               #00363d   Text on primary backgrounds

secondary                #b2ccd2   Secondary text
on-secondary             #1c353b

tertiary-container       #22ef7e   Active tracking chip
error-container          #93000a   Signal lost chip
on-surface               #dfe3eb   Body text — never pure white
outline-variant          #3b494c   Ghost border base colour
```

#### The "No-Line" Rule
Standard 1px solid borders are **strictly prohibited** for sectioning. Define boundaries through **Atmospheric Shifts**. Move from `surface-container-low` (#171c22) to `surface-container-high` (#262a30). The contrast between hex values provides all the separation needed — no lines, no wireframes.

#### The "Glass & Gradient" Rule
Use `backdrop-filter: blur(12px–20px)` combined with `surface-variant` at 40% opacity for floating elements. For primary CTAs, apply the **Starlight Gradient**: `linear-gradient(135deg, #c3f5ff, #00e5ff)`. This provides a pressurised, high-tech glow that flat colours lack.

---

### 2.3 Typography: The Technical Editorial

| Scale | Font | Size | Weight | Tracking | Usage |
|---|---|---|---|---|---|
| `display-lg` | Space Grotesk | 3.5rem | 700 | -0.02em | Mission briefing headlines |
| `display-md` | Space Grotesk | 2.25rem | 700 | -0.02em | Section titles |
| `headline` | Space Grotesk | 1.5rem | 600 | -0.01em | Panel headers |
| `title` | Space Grotesk | 1.125rem | 600 | 0 | Component titles |
| `body-lg` | Inter | 1rem | 400 | 0 | Primary descriptions |
| `body-md` | Inter | 0.875rem | 400 | 0 | Panel body — line-height 1.6 |
| `label-md` | IBM Plex Mono | 0.75rem | 400 | 0.04em | Coordinates, timestamps |
| `label-sm` | IBM Plex Mono | 0.625rem | 400 | 0.06em | HUD overlays, IDs, telemetry |

**Rules:**
- All coordinates, timestamps, tracking IDs, altitudes, velocities → **IBM Plex Mono**
- All user-facing descriptions → **Inter**
- All headlines and panel titles → **Space Grotesk**
- Never use pure `#ffffff` — always `on-surface` (#dfe3eb)

---

### 2.4 Elevation & Depth: Tonal Layering

In space there is no "down", only "away." Achieve lift by stacking tonal backgrounds, never with shadows.

| Layer | Background | Usage |
|---|---|---|
| Void | `#0f1419` | Base canvas — the 3D scene renders here |
| Structure | `#171c22` | Sidebar, control panels |
| Component | `#262a30` | Cards, detail panels |
| Interactive | `#30353b` | Hover state, active element highlight |

**Ambient shadow for floating modals only:**
```css
box-shadow: 0 20px 50px rgba(0, 218, 243, 0.05);
```

**Ghost Border fallback (accessibility):**
```css
border: 1px solid rgba(59, 73, 76, 0.15);
```

**Glassmorphism — all floating navigation:**
```css
backdrop-filter: blur(10px);
background: rgba(23, 28, 34, 0.7);
```

---

### 2.5 Component Specifications

#### Buttons: High-Energy Nodes

| Type | Background | Text | Border |
|---|---|---|---|
| Primary | `linear-gradient(135deg, #c3f5ff, #00e5ff)` | `#00363d` | none |
| Secondary | `#30353b` | `#c3f5ff` | Ghost border |
| Danger | `#93000a` | `#ffdad6` | none |
| Ghost | transparent | `#c3f5ff` | Ghost border |

Hover: increase `backdrop-filter` blur or `surface-tint` intensity. Never simple lighten/darken.

#### Input Fields: Telemetry Slots

```css
background: #0f1419;
border: 1px solid rgba(59, 73, 76, 0.15);
font-family: 'IBM Plex Mono';
color: #dfe3eb;
```

Focus state: border glows to 100% `#00e5ff` opacity.

#### Status Chips

| State | Background | Glow |
|---|---|---|
| Active / Tracking | `#22ef7e` at 15% opacity | `0 0 8px rgba(34, 239, 126, 0.4)` |
| Signal Lost | `#93000a` at 20% opacity | `0 0 8px rgba(147, 0, 10, 0.3)` |
| Approaching (NEO) | `#ff6b35` at 15% opacity | `0 0 8px rgba(255, 107, 53, 0.4)` |
| In Orbit | `#c3f5ff` at 10% opacity | none |

#### Cards & Lists: The No-Divider Rule

Forbid divider lines between list items. Use **vertical white space** (`1.4rem` gaps) and background shifts. Each orbital object in a list is a `surface-container-low` card floating on `surface` background, separated by vacuum.

#### The "Orbital HUD"

A bespoke semi-transparent overlay positioned in viewport corners using `label-sm` monospaced type. Displays real-time system data: camera altitude, tracked object count, data feed latency, current scale (e.g. `1 WU = 6,371 km`). Always present. Always visible. Acts as a constant technical frame.

```
┌─ TOP LEFT ─────────────────────┐
│ ALT  12,742 km                 │
│ LAT  28.6°N  LON  77.2°E       │
│ SCALE  1u = 6,371km            │
└────────────────────────────────┘
                    ┌─ TOP RIGHT ────────────────┐
                    │ TRACKED  4,821             │
                    │ FEED     WS 38ms           │
                    │ UTC  2026-03-21 14:22:07   │
                    └────────────────────────────┘
```

---

### 2.6 Motion & Animation

All transitions must feel gravitational — heavy objects move slowly, small objects snap.

| Type | Duration | Easing | Usage |
|---|---|---|---|
| Camera fly-to | 1400ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Filter-triggered camera zoom |
| Panel slide-in | 320ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Detail panel, info cards |
| Element drift | 80ms | `linear` | Particle/entity position tick |
| Fade in | 400ms | `ease-out` | New tracked object appearing |
| Chip pulse | 2000ms | `ease-in-out` infinite | Active tracking state |

**Drift-in principle:** Elements should appear to drift into place. Use long `400ms ease-out` fade-ins, never pop-in. Dark matter (empty space) is intentional and part of the design — resist filling it.

---

### 2.7 The Asymmetry Principle

Do not centre-align everything. Asymmetrical layouts create a sense of movement and orbit.

- **Detail panel**: right-aligned (desktop), bottom-anchored (mobile)
- **HUD overlays**: corners only, never centred
- **Search bar**: 40% from left at desktop, full-width on mobile
- **Filter controls**: upper-left cluster, not a symmetric toolbar
- **Planet labels**: offset 15–20px from sphere edge, not centred on it

---

### 2.8 Do's and Don'ts

**DO:**
- Use extreme scale contrast — pair `display-lg` headline with a `label-sm` technical tag directly below it
- Leave empty space — in a space-centric UI, empty space is dark matter. It is functional
- Use subtle animations — elements should drift into place with long smooth cubic-beziers
- Represent every visible object with real tracked data
- Use IBM Plex Mono for all numerical telemetry without exception

**DON'T:**
- Use pure white (`#ffffff`) — use `on-surface` (#dfe3eb) to prevent eye strain
- Use 100% opaque borders — they trap the eye and break the airy feel of the void
- Use standard Material or Bootstrap shadows — they feel earth-bound
- Use divider lines between list items
- Add decorative elements that do not represent real data
- Use rounded corners greater than 4px on data containers (panels, cards)
- Animate the camera without easing — snapping is jarring in a space simulation

---

## Part III — Screen Architecture

### 3.1 Primary Viewport

The entire application is one viewport: the Three.js scene. There is no separate "page" for the solar system vs the globe. The camera navigates between scales.

```
┌──────────────────────────────────────────────────────────────┐
│  [HUD: top-left]              [HUD: top-right]               │
│                                                              │
│           ← Three.js scene fills 100vw × 100vh →            │
│              (Solar system / Earth Globe / Deep space)       │
│                                                              │
│  [Filter rail: left edge]     [Detail panel: right edge]     │
│                                                              │
│  [Search bar: floating, 40% from left]                       │
│                                                              │
│  [Status bar: bottom, fixed, semi-transparent]               │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Filter Rail (Left Edge)

Vertical icon strip. Each icon = a tracked object category. Clicking a category:
1. Activates that category's filter chip
2. Triggers camera animation to appropriate scale (Earth orbit, heliocentric, etc.)
3. Updates the detail panel to show objects of that type

| Icon | Category | Camera destination |
|---|---|---|
| ✈ | Flights | Earth — 500 km altitude |
| 🚢 | Ships | Earth — 50 km altitude (ocean surface) |
| 🛰 | Satellites | Earth — 2,000 km altitude |
| ☄ | Asteroids / NEOs | Inner solar system — heliocentric |
| 🚀 | Rockets & Missions | Dynamic — follows mission |
| 🪐 | Planets | Full solar system — heliocentric |
| 🌍 | Earth Details | Earth — surface level |

Multiple filters can be active simultaneously. Earth-bound filters (flights, ships, satellites) share the Earth camera. Space filters (asteroids, planets) share the heliocentric camera. If both are active, camera defaults to heliocentric with Earth highlighted.

### 3.3 Detail Panel

Right-anchored sliding panel (320px desktop, bottom-sheet on mobile). Shows:
- **Object header**: name / callsign / designation in `headline`
- **Object photo** (aircraft: planespotters.net, planets: NASA Photojournal)
- **Telemetry grid**: key-value pairs in `label-md` mono
- **Track button**: `◎ track` / `⊙ tracking` (green when active, camera follows object)
- **Orbit visualisation**: shows object's orbital path overlaid on scene when applicable

### 3.4 Planet Detail Panels

When a planet is selected the panel shows:
- NASA planetary fact sheet data (mass, diameter, gravity, moons, day length)
- Current heliocentric distance from Sun (live via Horizons API)
- Active missions orbiting or on the surface
- Any approaching asteroids in the planet's vicinity

---

## Part IV — Data Architecture

### 4.1 Backend Data Sources

| Source | Endpoint | Auth | Rate limit | Cadence |
|---|---|---|---|---|
| OpenSky Network | `https://opensky-network.org/api/states/all` | Basic (optional) | 10 req/min unauth | 15s |
| AISStream.io | WebSocket | API key (env) | Unlimited stream | Real-time |
| CelesTrak TLE | `https://celestrak.org/SOCRATES/` | None | Reasonable use | 1hr |
| NASA NeoWs | `https://api.nasa.gov/neo/rest/v1/feed` | API key (env) | 1000/hr | 1hr |
| NASA Horizons | `https://ssd.jpl.nasa.gov/api/horizons.api` | None | Reasonable use | 5min (planets) |
| Le Système Solaire | `https://api.le-systeme-solaire.net/rest/bodies/` | None | None | Static |
| Open Notify ISS | `http://api.open-notify.org/iss-now.json` | None | None | 5s |
| Open Notify People | `http://api.open-notify.org/astros.json` | None | None | 1hr |
| Launch Library 2 | `https://ll.thespacedevs.com/2.2.0/launch/upcoming/` | None (15/hr) | 15 req/hr | 15min |
| NASA DONKI | `https://api.nasa.gov/DONKI/` | API key (env) | 1000/hr | 1hr |

### 4.2 Redis Key Namespace

```
aircraft:live          HASH   icao24 → LiveAircraft JSON
satellite:live         HASH   id → SatellitePosition JSON
ship:live              HASH   mmsi → ShipPosition JSON
asteroid:live          HASH   id → AsteroidPosition JSON (NEO current positions)
asteroid:approach      HASH   id → CloseApproachData JSON
planet:positions       HASH   name → PlanetPosition JSON (heliocentric xyz)
mission:live           HASH   id → MissionStatus JSON
iss:position           STRING LivePosition JSON (5s TTL)
people:space           STRING PeopleInSpace JSON (1hr TTL)
launch:upcoming        STRING LaunchList JSON (15min TTL)
```

### 4.3 WebSocket Message Types

Extending the existing WS protocol:

```json
{ "type": "snapshot", "category": "all|flights|satellites|asteroids|planets|missions", "data": {...} }
{ "type": "delta", "data": { "updated": [...], "removed": [...] } }
{ "type": "solar_system", "data": { "planets": [...], "asteroids_active": N } }
{ "type": "neo_alert", "data": { "id": "...", "name": "...", "approach_date": "...", "miss_distance_km": N } }
```

---

## Part V — Planet Texture Sources

All textures must be scientifically accurate NASA/ESA imagery. No artist interpretations for base planet surfaces.

| Body | Source | Resolution |
|---|---|---|
| Earth (day) | NASA Visible Earth Blue Marble | 8192×4096 |
| Earth (night) | NASA Black Marble | 8192×4096 |
| Earth (clouds) | NASA Visible Earth cloud layer | 8192×4096 |
| Moon | NASA CGI Moon Kit | 8192×4096 |
| Mars | NASA Viking / MOLA colour | 8192×4096 |
| Venus | NASA Magellan radar + colour | 4096×2048 |
| Mercury | NASA MESSENGER | 4096×2048 |
| Jupiter | NASA Cassini flyby | 4096×2048 |
| Saturn | NASA Cassini | 4096×2048 |
| Saturn rings | NASA PDS ring data | 1024×1 (ring cross-section) |
| Uranus | NASA Voyager 2 | 2048×1024 |
| Neptune | NASA Voyager 2 | 2048×1024 |
| Sun | NASA SDO AIA imagery (updated) | 2048×1024 |

Fallback: Solar System Scope public textures (`https://www.solarsystemscope.com/textures/`) — CC BY 4.0.

---

## Part VI — Feature Parity Checklist

Before any release, all of the following must be verified:

- [ ] Solar system visible as default view with all 8 planets + Sun
- [ ] Planets show accurate real-time positions (not static)
- [ ] Filter "Flights" transitions camera to Earth and shows ADSB aircraft
- [ ] Filter "Ships" transitions camera to ocean-level Earth view
- [ ] Filter "Satellites" transitions camera to LEO belt view
- [ ] Filter "Asteroids" shows heliocentric view with NEO orbit paths
- [ ] Filter "Rockets & Missions" shows launch manifest + live mission positions
- [ ] ISS is always visible and tracked when satellite filter is active
- [ ] NEO close-approach alert fires for objects < 7.5 million km
- [ ] Planet click → detail panel with NASA fact sheet data
- [ ] Planet click → shows active missions at that planet
- [ ] Track mode follows any object across any camera scale
- [ ] HUD shows correct altitude, lat/lon, tracked count, feed latency
- [ ] Glassmorphism applied to all floating UI elements
- [ ] Zero divider lines anywhere in the UI
- [ ] All numerical data in IBM Plex Mono
- [ ] Camera transitions use specified easing (1400ms cubic-bezier)
- [ ] No dummy or seed data — all objects from live APIs
- [ ] Responsive: works on mobile (375px) with bottom-sheet panels

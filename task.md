# ObjectTracer Feature Roadmap

## Status Legend
- [ ] Not started
- [x] Done
- [~] In progress

---

## HIGH IMPACT — Drive Organic Traffic

### 1. Shareable Deep Links
- [x] URL-based routing: `/flight/:icao24`, `/launch/:id`, `/airport/:iata`
- [x] Share button on DetailPanel — copies link to clipboard
- [x] Open shared link → auto-fly to object + open panel
- [x] Dynamic canonical/OG/title/description meta tags per SPA route (JS-based)

### 2. Push Notifications for Launches
- [x] Browser Push API integration (service worker)
- [x] "Notify me" button on launch cards
- [x] Send notification 30 min + 5 min before launch
- [x] Notification click → opens app at launch

### 3. Historical Flight Playback
- [x] Backend: store flight trail snapshots (last 24h)
- [x] Timeline scrubber UI in DetailPanel
- [x] Replay trail animation on globe
- [x] "Yesterday's path" for any tracked flight

### 4. Weather Overlay on Globe
- [ ] Fetch live cloud/storm data (OpenWeatherMap or similar)
- [ ] Cloud cover texture layer on 3D globe
- [ ] Toggle in filter rail: weather on/off
- [ ] Storm/hurricane markers with info popup

### 5. Social Presence
- [x] "X people tracking this flight" live counter via WebSocket
- [x] "X people watching this launch" counter
- [x] Anonymous — no login required to contribute count
- [x] Show on DetailPanel and LaunchPanel

---

## MEDIUM IMPACT — Enhance Experience

### 6. Aircraft Photos
- [x] Integrate Planespotters.net API (free, non-commercial)
- [x] Show aircraft photo in DetailPanel identity section
- [x] Fallback: tries hex, then registration-based lookup
- [x] Lazy load with error handling

### 7. Airline Logos
- [x] Airline IATA code from adsbdb API + OpenFlights ICAO→IATA mapping
- [x] Small logo icon next to callsign in DetailPanel (pics.avs.io CDN)
- [ ] Logo in search results dropdown

### 8. Flight Alerts
- [ ] "Alert me when this flight lands" button
- [ ] Backend: monitor tracked flight status changes
- [ ] Browser notification on landing/takeoff
- [ ] Alert history in profile panel

### 9. Airport Departures Board
- [x] Backend endpoint: `/api/v1/airports/:iata/departures`
- [x] Tab switch in AirportPanel: Arrivals | Departures
- [x] Same card format as arrivals (no ETA for departures)

### 10. Starlink Satellite Constellation
- [ ] Fetch Starlink TLE data (CelesTrak/Space-Track)
- [ ] Render Starlink satellites as distinct category on globe
- [ ] Filter toggle: "Starlink" in satellite category
- [ ] Starlink train visualization (recently launched groups)

---

## SEO & GROWTH — Visibility

### 11. Route-Based Landing Pages
- [ ] React Router with `/flight/:id`, `/launch/:id`, `/airport/:iata`, `/satellite/:name`
- [ ] Each route = Google-indexable page
- [ ] Pre-render or SSR for meta tags (react-snap or Vite SSR)
- [ ] Internal linking between related pages

### 12. Blog / Event Content
- [ ] `/blog` route with markdown-rendered posts
- [ ] Event-driven posts: "Watch [Launch] live on ObjectTracer"
- [ ] Auto-generate launch preview posts from API data
- [ ] RSS feed for blog

### 13. PWA Install Prompt
- [x] "Add to Home Screen" banner with custom UI
- [x] Show after 30s engagement, dismiss suppresses 30 days
- [x] Custom install UI (slide-up banner, not browser default)
- [x] Track install via localStorage flag

---

## UI CHANGES
- [x] Desktop BottomBar pill — icon nav with filters, scales, search, audio, LIVE toggle
- [x] BottomBar section labels (Track / Scale / Actions) + spring animations + hover tooltips
- [x] BottomBar intro mode — all labels visible for first 3s, active labels always shown
- [x] BottomBar collapsible — auto-collapse after 6s, hover expand, preview pill
- [x] TopRightPill — profile avatar (Google photo) + hamburger menu
- [x] Hamburger menu dropdown — About, Contact, FAQs, Donate pages
- [x] Static pages — About, Contact (form), FAQ, Donate (all modal overlays)
- [x] ProfilePanel banner — blurred Google profile photo + circular avatar
- [x] Mobile filter/action icons in CommandCenterOverlay grab zone (LIVE, search, audio)
- [x] Haptic feedback on mobile taps (global event delegation)
- [x] Overlap fixes — 10 bottom-positioned elements repositioned above BottomBar
- [x] Stream panel cleared below TopRightPill (top: 68px)
- [x] Mobile grab bar centered (flex-direction: column)
- [x] Deleted legacy components: StatusBar, FilterRail, HUD, OrbitalMapBar, AmbientAudio, Filters

---

## COMPLETED
- [x] Green glow on globe — reverted radial-gradient to cyan, reduced opacity
- [x] SEO overhaul — meta tags, sitemap, manifest, JSON-LD, Search Console verified
- [x] Color scheme — cyan → lime green (#b2ff1a) + jet black across 32 files
- [x] Hero auto-hide — PLANETARY OBSERVER collapses after 5s on desktop
- [x] DetailPanel tile contrast — alternating black/grey backgrounds
- [x] ISS crew proxy — backend endpoint to avoid mixed content
- [x] ISS live stream auto-discovery — YouTube scraper with keyword validation
- [x] Font update — monospace for smaller text/headings

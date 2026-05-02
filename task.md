# ObjectTracer Feature Roadmap

## Status Legend
- [ ] Not started
- [x] Done
- [~] In progress

---

## HIGH IMPACT — Drive Organic Traffic

### 1. Shareable Deep Links
- [ ] URL-based routing: `/flight/:callsign`, `/launch/:id`, `/airport/:iata`
- [ ] Share button on DetailPanel — copies link to clipboard
- [ ] Open shared link → auto-fly to object + open panel
- [ ] OG meta tags per route (SSR or prerender for social cards)

### 2. Push Notifications for Launches
- [ ] Browser Push API integration (service worker)
- [ ] "Notify me" button on launch cards
- [ ] Send notification 30 min + 5 min before launch
- [ ] Notification click → opens app at launch

### 3. Historical Flight Playback
- [ ] Backend: store flight trail snapshots (last 24h)
- [ ] Timeline scrubber UI in DetailPanel
- [ ] Replay trail animation on globe
- [ ] "Yesterday's path" for any tracked flight

### 4. Weather Overlay on Globe
- [ ] Fetch live cloud/storm data (OpenWeatherMap or similar)
- [ ] Cloud cover texture layer on 3D globe
- [ ] Toggle in filter rail: weather on/off
- [ ] Storm/hurricane markers with info popup

### 5. Social Presence
- [ ] "X people tracking this flight" live counter via WebSocket
- [ ] "X people watching this launch" counter
- [ ] Anonymous — no login required to contribute count
- [ ] Show on DetailPanel and LaunchPanel

---

## MEDIUM IMPACT — Enhance Experience

### 6. Aircraft Photos
- [ ] Integrate Planespotters.net API (free, non-commercial)
- [ ] Show aircraft photo in DetailPanel identity section
- [ ] Fallback placeholder for missing photos
- [ ] Lazy load with blur-up

### 7. Airline Logos
- [ ] Airline logo dataset (IATA codes → logo URLs)
- [ ] Small logo icon next to callsign in DetailPanel
- [ ] Logo in search results dropdown

### 8. Flight Alerts
- [ ] "Alert me when this flight lands" button
- [ ] Backend: monitor tracked flight status changes
- [ ] Browser notification on landing/takeoff
- [ ] Alert history in profile panel

### 9. Airport Departures Board
- [ ] Backend endpoint: `/api/v1/airports/:iata/departures`
- [ ] Tab switch in AirportPanel: Arrivals | Departures
- [ ] Same card format as arrivals with destination info

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
- [ ] "Add to Home Screen" banner/button
- [ ] Show after 2nd visit or 30s engagement
- [ ] Custom install UI (not just browser default)
- [ ] Track install rate

---

## UI CHANGES (pending user input)
- [ ] (awaiting user's UI change requests)

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

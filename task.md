# ObjectTracer Feature Roadmap

## BEST-IN-CLASS DESIGN BACKLOG — 2026-07-28
From impeccable `critique` (degraded single-context) + slop detector + apple-design/emil
lenses. Goal: move from "clean & compliant" to best-in-class. Ordered by leverage.

### Tier 1 — Identity elevation (biggest visual lift)
- [x] T1. Accent discipline: lime #b2ff1a is acid/"gamer". Reserve pure lime for LIVE
  state only; introduce a calmer primary (e.g. desaturated ice/cyan) for general
  interactive, so the palette reads "premium observatory" not "hacker terminal".
  Collapse the 3 accent families (lime + teal route + violet deep-space) to one
  disciplined interactive accent + category tints.
- [x] T2. Typography hierarchy: everything is font-mono → flat, terminal-flat. Pair a
  refined display/text face for titles + body (Space Grotesk already loaded / add one),
  keep mono for numeric/data ONLY. Set a real type scale + optical sizing on large titles.
- [x] T3. Layered depth: all glass islands read the same elevation. Grade shadow/blur/
  scale subtly across z-bands (nav < panel < modal) so the eye reads hierarchy; add a
  faint inner-highlight gradient beyond the top rim for true material depth.

### Tier 2 — Slop removal (detector-confirmed AI tells)
- [x] T4. Side-tab accent borders (detector ×4): CommandCenterOverlay feed cards use
  3–4px lime/amber `border-left`. The single most recognizable AI tell. Replace with a
  left inset dot, a tinted fill, or nothing.
- [x] T5. Bounce/elastic easing (detector ×7): cubic-bezier overshoot ≥1.4 on pills/
  nudge/dropdown/AirportBoard reads toy. Tune to ease-out-expo or gentle spring (≤1.2).
- [x] T6. Gradient text (detector ×1): MoonPanel:146 — remove; solid ink.
- [x] T7. Layout-property animation (detector ×8): remaining max-width/width/height
  transitions (BottomBar:253, DetailPanel:1066, MoonPanel:535, TourGuide:117) → transform
  or grid-rows morph.
- [x] T8. Delete stale duplicate files: `CommandCenterOverlay 2.jsx`, `.module 2.css`
  (same class as the DeepSpacePanel 2 dupes already removed) — they drift + inflate scans.

### Tier 3 — Density & composition
- [ ] T9. Chrome restraint / "island soup": too many floating surfaces compete with the
  globe. Desktop: merge/hide secondary islands by default (WindLegend, FleetCard on idle);
  auto-fade chrome after N s of no interaction, reveal on move — let the globe breathe.
- [ ] T10. Mobile thumb-zone: BottomBar + sheet + Go-Live chip + locate all crowd the
  bottom. Rationalize into one bottom system; raise reading type from 10–11px.
- [ ] T11. Spacing rhythm: enforce the 4/8/12/16/24 scale everywhere; kill remaining
  literal paddings so vertical rhythm is uniform.
- [ ] T12. One icon system: mix of Material Symbols font + inline SVG. Standardize on
  inline SVG (consistent 1.6–2 stroke, sizes) app-wide.

### Tier 4 — States & finish
- [ ] T13. Deliberate empty/no-result/error states (search no-match, feed empty, no
  flights in view, offline) — with personality, not blank text.
- [ ] T14. Contrast pass: caption alphas 0.34–0.40 on glass over bright globe regions may
  fail 4.5:1; verify + lift where needed.
- [ ] T15. Motion language unification: entrances vary (translateY / scale / translateX).
  Standardize enter/exit per surface-type from token easings + durations.
- [ ] T16. Consolidate DESIGN.md: root `DESIGN.md` (old "SkyDot/Astral Observer") conflicts
  with `design/DESIGN.md` (current Apple-glass system). Retire/merge the stale one.


## APPLE-DESIGN AUDIT BACKLOG — 2026-07-16
Full findings: multi-agent audit vs design/DESIGN.md (nav, cards/sheets, pages, globe HUD).
Five systemic issues repeat across the app; fix globally first, then per-component.

### Systemic (fix once, fixes everywhere)
- [x] S1. Reduced-motion: only AirportBoard honors it. Add ONE global
  `@media (prefers-reduced-motion: reduce)` guard (tokens/global) killing all
  infinite loops (pillFlow, scalePillFlow, sonarPing, livePulse, ctaDot,
  heroDrift, kenburns, gradientFlow, fleetPulse) + reducing entrances to opacity fade.
- [x] S2. Focus-visible: none in the app. Add global ring (2px lime, offset 2px)
  on button/a/input/textarea/[role=button]; box-shadow variant for glass inputs.
- [x] S3. Keyboard access: content rows are `<div onClick>` (asteroid table, flight
  rows, search results, airport rows, tour dots). Convert to `<button>`/role+key handlers.
- [x] S4. 44px touch targets on mobile: closes (28-36px), pill toggles, sheet-state
  toggle (28), filterIconBtn, mapToggle (~19), PWABanner buttons. Grow hit areas via ::after inset.
- [x] S5. Z-band tokens: define --z-overlay/nav/panel/page in tokens.css; snap all
  rogue values (60, 80, 85, 300, 380, 500, 600) to a band. LaunchPanel/ProfilePanel/DeepSpacePanel
  are below nav band → nav floats over open panels.

### Glass + tokens sweep
- [~] Gloss-rim + glass tokens (done: SearchBar, AirportPanel, DetailPanel, LaunchPanel,
  ProfilePanel, DeepSpacePanel, AirlineFleetCard, tooltips; remaining: TopRightPill dropdown,
  BottomBar popover/tooltip, WaitlistPopup, PWABanner, FlightPage/Planes cards). Orig list:
  4 side panels (DetailPanel/AirportPanel/LaunchPanel/ProfilePanel), TopRightPill dropdown,
  BottomBar popover/tooltip, AircraftTooltip/DESITooltip, AirlineFleetCard, WaitlistPopup,
  PWABanner, DeepSpacePanel, FlightPage/Planes cards.
- [ ] Radii to the 4 roles: replace --radius-md/-lg + literals (20/16/13/12/11/8/6/5/4px)
  with --r-card/inset/tight/pill across LaunchPanel, ProfilePanel, DeepSpacePanel, ContextBanner, banners.

### Rogue accents + emoji (constitution violations)
- [x] Kill non-lime interactive accents: AirportPanel blue #4C8CE4, DeepSpacePanel indigo
  #818cf8, WaitlistPage indigo gradient border → lime. Keep red only for genuine hazard.
- [x] Remove emoji: ContextBanner ✈ default, AirportPanel 🛬 + ↗/✓/× textContent swap,
  DeepSpaceGuide 👆🖱🔄 → inline SVGs.

### Motion-rule violations (the "sluggish" pattern)
- [x] WarpOverlay animates width/height 1→900px per frame → fixed-size + transform:scale.
- [ ] BottomBar label reveal tweens max-width on blurred pill; PagesPill labelIn animates
  max-width + display toggle; mobile width tween → grid 0fr/1fr morph.
- [ ] BottomBar collapse/expand abrupt + `transition: all` + filter animation → crossfade/FLIP;
  suppress auto-collapse while focus inside or popover open.
- [x] AirportPanel: NO mobile block (renders 360px rail on phone) → bottom sheet like siblings.
- [x] ProfilePanel `if(!open) return null` kills slide transition → keep mounted, class-driven.
- [x] BlogPage tiles `animation: forwards` replays on tab/filter/load-more → run once.
- [ ] Modals (BetaWelcome/WaitlistPopup/PWABanner) vanish in one frame → orchestrated exit.

### Apple-polish enhancements (subtle motion, transform/opacity only)
- [ ] Search palette: spring-scale entrance + staggered rows.
- [ ] Dropdowns/menus: grow from origin corner, item stagger, :active scale(.96) press.
- [ ] Cards/rows: crossfade + 2px hover lift; list entrances stagger 30ms/item (cap 8).
- [ ] Copy-confirm: icon crossfade to check (scale .6→1), not glyph swap.
- [ ] Deference: WindLegend/AirlineFleetCard/DeepSpaceGuide dim+sink when a panel opens.
- [ ] Cleanup: delete stale `DeepSpacePanel 2.jsx` / `.module 2.css`; em-dashes in TourGuide/DeepSpaceGuide copy.

## POLISH BACKLOG — 2026-07-01
- [x] Greet page — bento image+text; removed alpha + all emoji (SVG); concise; mobile-safe; red close
- [x] "Our mission" waitlist popup — mobile-safe (fixed card + inner scroll), night-sky hero, concise, red close always visible
- [x] Website performance audit — done, see specs/perf-audit-2026-07-03.md (~16MB eager assets found)
  - [x] Perf fix: ambient-space.mp3 (5.6MB) no longer downloads at boot (preload=none)
  - [x] Perf fix: defer moon.jpg (3.6MB) to moon-scale entry (4K kept for close-range quality)
  - [x] Perf fix: defer planet textures (~6MB) to solar-scale entry
  - [x] Perf fix: delete unreferenced logo-full.svg (505KB)
  - [x] Perf fix: React.lazy route pages — 9 pages split (index 107→92KB gz, css 42→34KB gz); DeepSpacePanel kept eager (always-rendered fade animation)
  - [x] Perf fix: hero JPGs recompressed q48 same dims (1.6MB→742KB; WebP skipped — no encoder on box, JPEG kept filenames/code untouched)
- [ ] Globe interaction + zoom in/out more fluid
- [x] Space feed sometimes opens on its own — fixed (removed 3s auto-re-expand)
- [x] Space feed opens after closing aircraft card — fixed (overlay now hides via visibility, not display:none; display toggle restarted the feedSlideIn entry animation, flashing the collapsed feed open)
- [ ] Map pan is sluggish — improve
- [x] Every close cross on the site → RED cross (global [aria-label=Close] rule)
- [x] Mobile: top pill collapses to active tile + expand toggle
- [x] Footer: RED close cross at top-right
- [x] Mission launchpad click → fly back to Earth first, then show launchpad — fixed (locate-pad now switches scale to Earth, then flies to pad after the 800ms scale flight)
- [x] Deep-space directory → open full-screen — fixed (removed stale 256px --sidebar-w offset; inset:0 + 1400px centered content cap)
- [x] Live fleets — aircraft-type + airline pics to search/filter, with text labels — done (airline chips: pics.avs.io logos via new IATA tuple field; type chips: Wikipedia family thumbs fetched once on tab open)
- [x] Mobile: locate button raised above footer button
- [x] Desktop feed right-side gradient glitch — fixed (90deg/200% linear flow)
- [x] Airport icon — circle with plane logo; airport name shown on globe — done (SVG plane-in-circle replaces ✈ glyph; full name appears from ~500km zoom)



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
- [x] Logo in search results dropdown — done (backend derives airline_iata from callsign prefix; pics.avs.io logo in flight rows, hidden on load error)

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

## SEO IMPROVEMENT BACKLOG — 2026-07-28 (claude-seo methodology; reviewable in /admin → SEO)

Sequenced by impact. Shipped items reflect current production.

### Shipped
- [x] Per-route SSR for crawlers (edge middleware) — crawlability/indexation
- [x] Entity JSON-LD: Flight / Airport / Airline / Launch (+ FAQPage on entity pages)
- [x] Blog/Article @graph enriched: dateModified, description, wordCount, mainEntityOfPage, series, BreadcrumbList
- [x] Sitemaps (main + launches + blog) with lastmod; robots.txt
- [x] Per-route canonical + OG/Twitter
- [x] Core Web Vitals baseline (boot trim, compositor motion, lazy-chunk reload recovery)

### Open — prioritized
- [ ] P0 Named Person author on Engineering blog (E-E-A-T) — NEEDS name + title from owner
- [ ] P0 BreadcrumbList on entity pages (flight/airport/airline)
- [ ] P0 Bot-render /faq, /about, /contact (add to SSR matcher; FAQPage schema on /faq)
- [ ] P1 Answer-block formatting (question H2 + 40–60 word lead; 134–167 word citable passages) for AI search
- [ ] P1 Image SEO pass (alt text, width/height for CLS, WebP/AVIF)
- [ ] P1 Organization sameAs (socials) + VideoObject on engineering posts with embeds
- [ ] P1 CWV field-data + Coverage monitoring after each deploy
- [ ] P2 RSS feed + blog pagination crawl signals

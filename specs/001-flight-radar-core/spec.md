# Feature Specification: SkyDot — Real-Time Flight Radar Core

**Feature Branch**: `001-flight-radar-core`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "SkyDot Real-Time Flight Radar Core"

---

## Problem Statement

Existing flight tracking websites are cluttered, ad-heavy, and overwhelming. They prioritize
data density over usability, creating an experience that feels like an air traffic control
console rather than something a curious person would enjoy browsing. Users who simply want to
see "what's flying overhead" are buried in controls, pop-ups, and premium upsells.

**Core Value Proposition**: Open the page. See the sky. That's it.

---

## Target Users

- **Casual aviation enthusiasts** — People who enjoy watching planes and want a calming,
  visual way to see what's flying.
- **Travelers** — People tracking a specific flight for a friend or family member.
- **Design-conscious users** — People who appreciate beautiful, minimal interfaces and would
  keep SkyDot open as a "living poster."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First Visit: Instant Map (Priority: P1)

A first-time visitor opens the page and immediately sees a live map of aircraft with no
barriers, no account required, no onboarding.

**Why this priority**: This is the entire product promise. If the map doesn't appear
immediately, there is no SkyDot. Everything else is progressive disclosure on top of this.

**Independent Test**: Open a fresh browser with no cookies. Navigate to the app. The world
map renders with live aircraft visible — nothing else is needed to validate the core
experience.

**Acceptance Scenarios**:

1. **Given** a first-time visitor navigates to the app, **When** the page loads,
   **Then** the world map renders with aircraft visible within 3 seconds, with no modal,
   sign-up prompt, or onboarding screen appearing.

2. **Given** the user has allowed location access, **When** the map loads,
   **Then** the map is centered on their approximate location at a reasonable zoom level.

3. **Given** the user has denied location access, **When** the map loads,
   **Then** the map defaults to a world view showing all continents.

4. **Given** the page has loaded, **When** the user does nothing,
   **Then** aircraft positions update automatically every 5 seconds without any user action.

---

### User Story 2 — Aircraft Visualization: Dot Projection (Priority: P1)

Aircraft on the map are displayed as minimalistic dot-projection glyphs with directional
indicators, evoking the halftone/dot-matrix aesthetic of newspaper printing.

**Why this priority**: Visual identity is core to the product. Without the newspaper-dot
aesthetic, SkyDot is just another flight radar.

**Independent Test**: Open the map with live data and verify that aircraft appear as small
geometric glyphs (not icons, not images), rotate to reflect heading, interpolate smoothly
between updates, and fade when stale.

**Acceptance Scenarios**:

1. **Given** aircraft are visible on the map, **When** viewing at any zoom level,
   **Then** each aircraft appears as a small geometric glyph with a directional indicator
   pointing in the direction of travel — never a photorealistic icon.

2. **Given** an aircraft's position updates, **When** the new position arrives,
   **Then** the glyph moves smoothly to the new position with no visible jump.

3. **Given** an aircraft has not sent a position update in more than 60 seconds,
   **When** viewing the map, **Then** the glyph visually fades.

4. **Given** an aircraft has not sent a position update in more than 120 seconds,
   **When** viewing the map, **Then** the glyph is removed entirely.

5. **Given** the map is zoomed out to a world-level view with many aircraft in proximity,
   **When** viewing dense regions, **Then** overlapping aircraft cluster into a density
   indicator rather than rendering every individual glyph.

6. **Given** a helicopter and a fixed-wing aircraft are both on the map,
   **When** viewing them, **Then** they display distinct glyph styles.

---

### User Story 3 — Flight Details: Click to Reveal (Priority: P2)

Clicking any aircraft glyph reveals a minimal detail panel with flight information,
without navigating away from the map.

**Why this priority**: High-value secondary interaction. Not required to see the map,
but critical for the "tracking a specific flight" use case.

**Independent Test**: Click any visible aircraft. A detail panel appears with callsign,
route (if available), altitude, speed, and aircraft type. Press Escape or click the map
to dismiss it.

**Acceptance Scenarios**:

1. **Given** aircraft are visible on the map, **When** the user clicks a glyph,
   **Then** a minimal detail panel opens showing: Callsign, Origin → Destination (if known),
   Altitude, Speed, Aircraft type, Airline (if known).

2. **Given** the detail panel is open, **When** viewing it,
   **Then** it displays the aircraft's recent flight path for the last 30 minutes as a
   simple trail on the map.

3. **Given** the detail panel is open, **When** the user clicks elsewhere on the map or
   presses Escape, **Then** the detail panel closes.

4. **Given** the detail panel is open, **When** viewing it,
   **Then** it uses the same dot-projection aesthetic — text only, no rounded cards,
   no shadows.

---

### User Story 4 — Search: Find a Flight (Priority: P2)

A user can search for a specific flight by number or identifier and be taken directly
to it on the map.

**Why this priority**: Core use case for travelers tracking a specific flight. Not required
for casual browsing, but essential for a significant user segment.

**Independent Test**: Activate search, type a known callsign, select the result. The map
centers on that aircraft and opens its detail panel.

**Acceptance Scenarios**:

1. **Given** the user activates search (via icon or keyboard shortcut),
   **When** they type a callsign, flight number, or identifier,
   **Then** matching results appear as a compact list within 1 second.

2. **Given** search results are displayed, **When** the user selects a result,
   **Then** the map centers on that aircraft and opens its detail panel automatically.

3. **Given** no aircraft match the search term, **When** search is submitted,
   **Then** a clean "No flights found" message appears with no error state.

4. **Given** a result has been selected, **When** the selection is made,
   **Then** the search bar closes automatically.

---

### User Story 5 — Filters: Focus the View (Priority: P3)

A user can apply simple filters to reduce visual noise and focus on aircraft types
or altitude ranges of interest.

**Why this priority**: Enhances the experience for enthusiasts but is not required for
the core use case.

**Independent Test**: Apply "helicopters only" filter. Only helicopter glyphs remain
visible. Apply high-altitude filter. Low-altitude traffic disappears. Filters persist
on page refresh within the same session.

**Acceptance Scenarios**:

1. **Given** the filter controls are accessible, **When** the user selects "Planes only",
   **Then** helicopter glyphs are hidden from the map immediately.

2. **Given** the filter controls are accessible, **When** the user selects an altitude
   range (Low < 10,000ft / Mid 10,000–30,000ft / High > 30,000ft / All),
   **Then** aircraft outside that range are hidden without a page reload.

3. **Given** filters are active, **When** viewing the filter icon,
   **Then** a minimal visual indicator shows that filters are active.

4. **Given** the user has set filters, **When** they return within the same session,
   **Then** their filters are still applied.

---

### User Story 6 — Anonymous Session: Zero-Friction Entry (Priority: P1)

Visitors use the full app without ever creating an account. Their preferences and map
state persist automatically across visits.

**Why this priority**: Core to the product principle. Any friction here breaks the
"open the page, see the sky" promise.

**Independent Test**: Visit the app fresh. Use filters and pan the map. Close and reopen
the browser. The map position and filters are restored without login.

**Acceptance Scenarios**:

1. **Given** a new visitor arrives, **When** the page loads,
   **Then** an anonymous session is created silently — no prompt, no notice.

2. **Given** the user has changed filters or map position, **When** they return within
   30 days, **Then** their last map position, zoom, active filters, and theme preference
   are restored.

3. **Given** the user is on an anonymous session, **When** browsing the app,
   **Then** no sign-up prompt, banner, or modal ever appears.

---

### User Story 7 — Optional Sign-In: Persistent Preferences (Priority: P3)

Users who want their preferences to follow them across devices can optionally create
an account. Sign-in is never required and never pushed.

**Why this priority**: Nice-to-have for power users. Must not compromise the
anonymous-first experience.

**Independent Test**: Sign in. Verify anonymous session data carries over. Sign out.
Verify anonymous mode resumes with a fresh session.

**Acceptance Scenarios**:

1. **Given** the user finds the sign-in option, **When** they sign in,
   **Then** all data from their anonymous session (preferences, history) migrates to
   their account — nothing is lost.

2. **Given** an authenticated user is signed in, **When** browsing,
   **Then** they have access to: saved watchlist of favorite flights, persistent
   preferences across devices, and their last 50 viewed flights.

3. **Given** an authenticated user signs out, **When** the sign-out completes,
   **Then** they return to anonymous mode with a fresh anonymous session.

4. **Given** the sign-in entry point, **When** viewing any page,
   **Then** it is a subtle corner link — never a modal, banner, or interstitial.

---

### User Story 8 — Real-Time Updates: Live Data Stream (Priority: P1)

The map reflects live aircraft positions updating continuously, giving the experience
of a living, breathing map.

**Why this priority**: Without live updates, the map is a static picture. Real-time
is the product.

**Independent Test**: Open the app and observe aircraft positions updating every 5 seconds.
Simulate a connection drop. A "reconnecting" indicator appears. Reconnect. The map resyncs
to current positions.

**Acceptance Scenarios**:

1. **Given** the page has loaded, **When** the live connection is established,
   **Then** the user receives the current state of all aircraft within 1 second.

2. **Given** the live connection is active, **When** positions change,
   **Then** updated positions arrive at least every 5 seconds.

3. **Given** the live connection drops, **When** the disconnection is detected,
   **Then** a subtle "Reconnecting..." indicator appears and the client automatically
   retries with increasing delays between attempts (max 30 seconds between retries).

4. **Given** the client reconnects after a disconnection, **When** the connection is
   restored, **Then** the map resyncs to the current full state of all aircraft.

---

### User Story 9 — Responsive Design: Any Device (Priority: P2)

The app works seamlessly on mobile, tablet, and desktop without degradation.

**Why this priority**: A significant share of casual users will visit from a phone.
The "living poster" use case demands desktop quality.

**Independent Test**: Open on a mobile browser. Pinch to zoom, pan. Tap an aircraft.
Detail panel appears as bottom sheet. Search is accessible. No horizontal scroll.

**Acceptance Scenarios**:

1. **Given** a mobile user opens the app, **When** they interact with the map,
   **Then** pinch-to-zoom and pan gestures work as expected.

2. **Given** a mobile user taps an aircraft, **When** the detail panel opens,
   **Then** it appears as a bottom sheet covering the lower portion of the screen.

3. **Given** a desktop user clicks an aircraft, **When** the detail panel opens,
   **Then** it appears as a side panel without obscuring the map entirely.

4. **Given** any screen size, **When** the app is open,
   **Then** there is no horizontal scrolling and all controls are accessible.

---

### Edge Cases

- What happens when the upstream data source is unavailable? Last known positions are shown
  with a visible "Data delayed" indicator. The app never crashes or shows a blank error screen.
- What happens when an anonymous session cookie expires? A new session is created silently
  on the next visit; preferences reset to defaults with no error.
- What happens when an aircraft has no callsign or route data? The detail panel shows only
  the fields that are available; missing fields are omitted, not shown as "Unknown."
- What happens when two aircraft overlap and cannot be individually clicked? Clicking the
  cluster presents a small list of the aircraft in that group.
- What happens if the data source provides conflicting position records for the same
  aircraft? The most recent timestamp wins; older records are discarded.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display live aircraft positions on an interactive world map
  without requiring user action after page load.
- **FR-002**: The system MUST represent aircraft as minimal geometric glyphs with
  directional indicators — never photorealistic icons or images.
- **FR-003**: Aircraft glyphs MUST rotate to reflect the aircraft's current heading.
- **FR-004**: Aircraft positions MUST interpolate smoothly between data updates
  with no visible jumping.
- **FR-005**: Aircraft with no position update for 60 seconds MUST fade visually;
  those silent for 120 seconds MUST be removed from the map.
- **FR-006**: The system MUST create an anonymous session automatically on first visit,
  persisted via a secure cookie for 30 days.
- **FR-007**: The system MUST restore the user's last map position, zoom, active filters,
  and theme preference on return visits within the session lifetime.
- **FR-008**: The system MUST deliver position updates at a minimum rate of once every
  5 seconds during an active session.
- **FR-009**: On initial connection, the client MUST receive the full current state of all
  tracked aircraft before incremental updates begin.
- **FR-010**: The client MUST automatically reconnect if the live connection drops, with a
  maximum retry interval of 30 seconds.
- **FR-011**: The system MUST allow users to click any aircraft to reveal its detail panel,
  showing available flight information and a 30-minute path trail.
- **FR-012**: The system MUST support search by callsign, flight number, and aircraft
  identifier, returning results within 1 second.
- **FR-013**: The system MUST support filtering aircraft by type (planes / helicopters / all)
  and altitude range (low / mid / high / all), applied instantly without page reload.
- **FR-014**: Sign-in MUST be entirely optional and accessible only via a subtle corner
  link — never a modal, interstitial, or recurring prompt.
- **FR-015**: On sign-in, the system MUST migrate all anonymous session data to the
  authenticated account without any data loss.
- **FR-016**: Authenticated users MUST be able to maintain a saved flight watchlist and
  access the last 50 flights they viewed.
- **FR-017**: The system MUST degrade gracefully when the upstream data source is
  unavailable, showing last known data with a visible staleness indicator.
- **FR-018**: Dense aircraft clusters at low zoom levels MUST aggregate into a visual
  density indicator rather than rendering every individual glyph.
- **FR-019**: The detail panel MUST be dismissible by clicking outside it or pressing Escape.
- **FR-020**: The system MUST expose a health status endpoint for operational monitoring.
- **FR-021**: User data export and deletion capabilities MUST be available to any
  authenticated user on request.

### Key Entities

- **Aircraft**: A trackable flying object with a unique identifier (ICAO24 + callsign),
  current position (latitude, longitude, altitude), velocity, heading, type
  (plane/helicopter), and staleness state.
- **Flight**: An aircraft operating a specific route at a point in time, with origin,
  destination, airline, and a sequence of timestamped position records.
- **Anonymous Session**: A temporary user identity with a unique ID, creation timestamp,
  expiry (30 days), and stored preferences (map state, filters, theme).
- **User Account**: An authenticated identity linked to one or more past anonymous sessions,
  with a watchlist of saved flights and persistent preferences.
- **Position Record**: A timestamped snapshot of an aircraft's location and state, forming
  the path trail visible in the detail panel.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users see live aircraft on the map within 3 seconds of navigating to the page.
- **SC-002**: The map renders 1,000 aircraft simultaneously without visible lag or dropped
  frames.
- **SC-003**: Aircraft positions update at least every 5 seconds during an active session.
- **SC-004**: The full app is usable on a slow mobile connection with no degraded core
  experience (map loads, aircraft visible, detail panel works).
- **SC-005**: Average user session duration exceeds 2 minutes, indicating users find value
  and stay to explore.
- **SC-006**: Bounce rate (users who leave without any interaction) is below 40%.
- **SC-007**: Mobile usability score (touch interactions, viewport fit, no horizontal scroll)
  rates above 90 out of 100.
- **SC-008**: The system supports at least 100 simultaneous users on free-tier infrastructure
  without performance degradation.
- **SC-009**: A user can locate a specific flight by name and view its detail panel in
  under 30 seconds from a cold page load.
- **SC-010**: After a live connection drop, the map resyncs to the current state within
  5 seconds of reconnection.

---

## Out of Scope (v1)

- Flight path prediction or ETA calculations
- Airport information pages
- Airline fleet tracking
- Push or email notifications
- Native mobile applications
- Premium or paid feature tiers
- Multi-language support
- Flight replay or historical playback
- Weather overlay
- 3D globe view

---

## Data Requirements

### Position Data

The system requires access to a continuously updated feed of global aircraft positions
including: unique identifier, callsign, position (latitude/longitude/altitude), velocity,
heading, and on-ground status. Updates must be available at minimum every 10–15 seconds.

### Enrichment Data

- Aircraft type registry mapping identifiers to aircraft categories (plane, helicopter).
- Airline/operator registry mapping codes to human-readable airline names.
- Route inference from callsign patterns where direct route data is unavailable.

### Fallback Source

A secondary position data source must be available to handle primary source outages or
rate limits, enabling automatic failover with no visible disruption to users.

---

## Assumptions

1. **Domain**: Deployment domain is TBD — to be confirmed when the app is ready for
   production release. Development and testing will use a temporary host.

2. **OAuth Providers**: Google and Apple are the two supported sign-in providers at launch.
   Additional providers can be added later without architectural changes.

3. **Geographic Scope**: The app shows global flight data from day one. No regional
   restriction is applied at launch.

4. **Session storage**: Anonymous session preferences are stored server-side, linked to
   the session cookie — ensuring persistence across browsers on the same device.

5. **Authentication**: Email/password and Google OAuth are the only authentication methods
   at launch. Password reset via email is included.

6. **Data source access**: Authenticated API credentials for the primary data source will
   be obtained before launch to support production polling rates.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Primary data source rate limiting | No live data | Cache last known state; auto-failover to secondary source; show staleness indicator |
| Free-tier storage limits reached | Data loss | Auto-purge position records older than 24 hours; monitor usage proactively |
| Traffic spike exceeding free tier | Degraded experience | CDN caching for static assets; connection limits on live stream; graceful queuing |
| Map rendering too heavy for budget | Slow initial load | Evaluate lightweight map options; lazy-load map tiles after first paint |
| Helicopter type data sparse | Poor helicopter display | Document known limitation; fall back to generic aircraft glyph gracefully |

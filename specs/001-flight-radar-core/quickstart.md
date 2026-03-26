# Quickstart Validation — SkyDot

> Step-by-step scenarios to validate each phase of implementation.

---

## Scenario 1: Backend Boots Successfully

**Phase**: 1 (Foundation)

**Steps:**
1. Start Go backend with valid DB + Redis connection strings
2. Send `GET /api/v1/health`

**Expected:**
```json
{ "status": "ok", "services": { "database": "ok", "redis": "ok", "opensky": "ok" } }
```

**Failure mode**: If any service shows `"degraded"`, check connection strings and network access.

---

## Scenario 2: OpenSky Data Flows into Redis

**Phase**: 1 (Foundation)

**Steps:**
1. Start backend
2. Wait 15 seconds
3. Check Redis: `HLEN aircraft:live`

**Expected:** Value > 0 (typically 3000-8000 depending on time of day)

**Failure mode**: If 0, check OpenSky credentials and rate limiting. Check backend logs for poller errors.

---

## Scenario 3: WebSocket Connection + Snapshot

**Phase**: 2 (Real-Time Layer)

**Steps:**
1. Create anonymous session: `POST /api/v1/session`
2. Connect WebSocket: `ws://localhost:8080/ws?token=<token>`
3. Listen for first message

**Expected:** Message with `type: "snapshot"` containing aircraft array with count > 0.

**Failure mode**: If connection rejected, check session token. If snapshot empty, check Redis state.

---

## Scenario 4: Delta Updates Arrive

**Phase**: 2 (Real-Time Layer)

**Steps:**
1. Establish WebSocket connection (Scenario 3)
2. Wait 5-10 seconds after snapshot

**Expected:** Message with `type: "delta"` containing `updated` and/or `removed` arrays.

**Failure mode**: If no deltas, check broadcast goroutine. Verify Redis data is being updated by poller.

---

## Scenario 5: Map Renders with Aircraft

**Phase**: 5 (Frontend Map)

**Steps:**
1. Open `http://localhost:5173` in browser
2. Wait for page load

**Expected:**
- Map fills viewport within 1.5s
- Aircraft dots appear within 3s
- Dots show directional indicators
- No modals, pop-ups, or sign-up prompts

**Failure mode**: If map loads but no dots, check WebSocket connection in DevTools Network tab. If map doesn't load, check Vite dev server and tile URL.

---

## Scenario 6: Click Aircraft → Detail Panel

**Phase**: 6 (Frontend Interaction)

**Steps:**
1. With map showing aircraft (Scenario 5)
2. Click on any aircraft dot

**Expected:**
- Detail panel slides in from the right (desktop) or bottom (mobile)
- Shows: callsign, altitude, speed, heading
- Shows trail line on map for last 30 minutes
- Clicking elsewhere closes the panel

**Failure mode**: If no panel, check click handler binding. If no data, check REST API `/aircraft/:icao24` response.

---

## Scenario 7: Search for a Flight

**Phase**: 6 (Frontend Interaction)

**Steps:**
1. Press `/` key to open search
2. Type "UAL" (partial callsign)

**Expected:**
- Search results appear as compact list
- Results show callsign + aircraft type
- Selecting a result centers map on that aircraft

**Failure mode**: If no results, check search API endpoint. If results but map doesn't move, check `flyTo` integration.

---

## Scenario 8: Filters Work

**Phase**: 6 (Frontend Interaction)

**Steps:**
1. With map showing aircraft
2. Open filter panel
3. Select "Helicopters only"

**Expected:**
- Only helicopter dots remain visible
- Plane dots disappear instantly
- Filter indicator shows active state

**Failure mode**: If all aircraft disappear, helicopter detection might not be working — check type code mapping.

---

## Scenario 9: Full Deployment Smoke Test

**Phase**: 7 (Deployment)

**Steps:**
1. Open production URL in fresh browser (incognito)
2. Wait for load
3. Click an aircraft
4. Search for a callsign
5. Toggle a filter
6. Refresh the page — verify session persists

**Expected:** All interactions work as in development. Session cookie persists across refresh. HTTPS enforced. No console errors.

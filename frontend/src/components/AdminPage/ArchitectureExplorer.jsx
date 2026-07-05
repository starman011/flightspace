import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './ArchitectureExplorer.module.css'

// ── Layer taxonomy — one color per architectural layer ────────────────────
const LAYERS = {
  client:     { label: 'CLIENT',      hue: '#7dd3fc' },
  router:     { label: 'ROUTER',      hue: '#c4b5fd' },
  middleware: { label: 'MIDDLEWARE',  hue: '#fbbf24' },
  controller: { label: 'CONTROLLER',  hue: '#b2ff1a' },
  worker:     { label: 'WORKER',      hue: '#f0abfc' },
  postgres:   { label: 'POSTGRES',    hue: '#60a5fa' },
  redis:      { label: 'REDIS',       hue: '#f87171' },
  external:   { label: 'EXTERNAL',    hue: '#fb923c' },
  websocket:  { label: 'WEBSOCKET',   hue: '#34d399' },
  response:   { label: 'RESPONSE',    hue: '#e2e8f0' },
}

// ── Feature flows — every file, function and query is real (from the repo) ──
const FLOWS = [
  {
    id: 'contact',
    name: 'Contact form',
    tagline: 'User sends a message from /contact',
    steps: [
      { layer: 'client', file: 'frontend/src/components/StaticPages/ContactPage.jsx',
        fn: 'onSubmit()',
        desc: 'User types name, email, message and hits Send. The component fires fetch(POST /api/v1/contact) with the form JSON.' },
      { layer: 'router', file: 'backend/src/routes/index.go',
        fn: 'mux.Handle("POST /api/v1/contact", …)',
        desc: 'Go 1.22 pattern router matches method + path and hands the request to the wrapped handler chain.' },
      { layer: 'middleware', file: 'backend/src/middlewares/ratelimit.go',
        fn: 'RateLimit(rdb)',
        desc: 'Per-IP counter in Redis. Over the limit → 429 and the request never reaches the controller.' },
      { layer: 'controller', file: 'backend/src/controllers/contact.go',
        fn: 'ContactController.Submit()',
        desc: 'Validates the payload (name/email/message present, sane lengths). Bad input → 400 with a field error.' },
      { layer: 'postgres', file: 'backend/src/db/postgres.go (pgx pool)',
        fn: 'INSERT INTO contact_messages (name, email, message)',
        desc: 'Message is persisted first — email delivery can fail, the database record cannot.' },
      { layer: 'external', file: 'backend/src/controllers/contact.go',
        fn: 'sendContactEmail() → POST api.resend.com/emails',
        desc: 'Fire-and-forget goroutine notifies the admin inbox via Resend. Errors are logged, never surfaced to the user.' },
      { layer: 'response', file: 'ContactPage.jsx',
        fn: '200 → "Message sent"',
        desc: 'The row now appears in /admin under the Contact form tab (AdminController.ListMessages).' },
    ],
  },
  {
    id: 'live-aircraft',
    name: 'Live aircraft on the globe',
    tagline: 'The always-on pipeline behind the 3D view',
    steps: [
      { layer: 'external', file: 'adsb.lol open data feed',
        fn: 'Poller.fetchAdsbLol() — every 5s',
        desc: 'Background worker pulls the global ADS-B state: thousands of aircraft with position, altitude, speed, callsign.' },
      { layer: 'worker', file: 'backend/src/controllers/poller.go',
        fn: 'parseAdsbAircraft() → storeInRedis()',
        desc: 'Raw feed is normalized into LiveAircraft models, then pipelined into Redis with HSET aircraft:live per ICAO24.' },
      { layer: 'redis', file: 'backend/src/db/redis.go',
        fn: 'HSET aircraft:live — hot state, 30s TTL semantics',
        desc: 'Redis is the single source of "right now". removeStale() drops aircraft silent for 120s.' },
      { layer: 'postgres', file: 'backend/src/controllers/poller.go',
        fn: 'storePositions() / storeTrails() / archiveTrails()',
        desc: 'Positions append to Postgres for the 24h trail history and playback scrubber — warm data tier.' },
      { layer: 'websocket', file: 'backend/src/controllers/ws_hub.go',
        fn: 'Hub.Run() — 5s ticker → broadcast()',
        desc: 'Hub diffs current state vs lastState and pushes deltas to every connected client; new clients get a full snapshot first (sendSnapshot).' },
      { layer: 'client', file: 'frontend/src/hooks/useWebSocket.js → useAircraft.js',
        fn: 'onSnapshot / onDelta',
        desc: 'The aircraft Map updates, Globe.jsx writes new positions into the InstancedMesh — one draw call for 12K planes, interpolated between ticks.' },
    ],
  },
  {
    id: 'search',
    name: 'Flight search',
    tagline: 'Typing a callsign in the search bar',
    steps: [
      { layer: 'client', file: 'frontend/src/components/SearchBar/SearchBar.jsx',
        fn: 'search() — 300ms debounce',
        desc: 'Local airport list matches instantly; live flights go to GET /api/v1/aircraft/search?q=.' },
      { layer: 'router', file: 'backend/src/routes/index.go',
        fn: 'rateLimit(authOpt(aircraft.Search))',
        desc: 'Handler chain: rate limit, then optional auth — search works logged-out, but a valid JWT attaches the user.' },
      { layer: 'middleware', file: 'backend/src/middlewares/auth.go',
        fn: 'AuthOptional(jwtSecret)',
        desc: 'Parses the Bearer token if present; invalid tokens don\'t block the request, they just mean anonymous.' },
      { layer: 'controller', file: 'backend/src/controllers/aircraft.go',
        fn: 'AircraftController.Search()',
        desc: 'HGETALL the Redis live set, score every aircraft (exact callsign 100, prefix 50, contains 10), derive airline_iata from the callsign prefix map.' },
      { layer: 'redis', file: 'aircraft:live hash',
        fn: 'HGetAll → in-memory scoring',
        desc: 'No SQL involved — search only ever sees aircraft that are airborne right now.' },
      { layer: 'response', file: 'SearchBar.jsx',
        fn: 'results[] → dropdown',
        desc: 'Rows render with the airline logo (pics.avs.io), type and altitude; clicking one selects the flight on the globe.' },
    ],
  },
  {
    id: 'admin-reply',
    name: 'Admin replies to a message',
    tagline: 'From the /admin inbox to the user\'s inbox',
    steps: [
      { layer: 'client', file: 'frontend/src/components/AdminPage/AdminPage.jsx',
        fn: 'POST /api/v1/admin/messages/{id}/reply',
        desc: 'Reply body sent with the Bearer session token from the signed-in Google account.' },
      { layer: 'middleware', file: 'backend/src/middlewares/auth.go',
        fn: 'AuthRequired(jwtSecret)',
        desc: 'No valid JWT → 401 before any admin code runs.' },
      { layer: 'controller', file: 'backend/src/controllers/admin.go',
        fn: 'isAdmin() → Reply()',
        desc: 'Second gate: the JWT\'s email must equal ADMIN_EMAIL. Auth alone is not authorization.' },
      { layer: 'external', file: 'backend/src/controllers/admin.go',
        fn: 'POST api.resend.com/emails',
        desc: 'Reply is delivered via Resend (send-scope API key; reading inbound mail needs the separate RESEND_READ_API_KEY).' },
      { layer: 'postgres', file: 'contact_messages table',
        fn: 'UPDATE … SET replied_at = NOW(), reply_body = $2',
        desc: 'Thread state persists — the inbox shows the message as replied with the stored body.' },
    ],
  },
  {
    id: 'journal',
    name: 'Space Journal post',
    tagline: 'How a NASA APOD becomes a crawlable page',
    steps: [
      { layer: 'worker', file: 'backend/src/controllers/blog_poller.go',
        fn: 'daily APOD fetch',
        desc: 'Worker pulls NASA\'s Astronomy Picture of the Day and INSERTs a row into blog_posts (slug, title, intro, explanation, image).' },
      { layer: 'router', file: 'backend/src/routes/index.go',
        fn: 'GET /api/v1/blog/{slug}',
        desc: 'Public, rate-limited endpoint serving one post.' },
      { layer: 'controller', file: 'backend/src/controllers/blog_controller.go',
        fn: 'GetBlogPost() — Cache-Control 300s',
        desc: 'Single Postgres SELECT by slug; 5-minute CDN caching keeps repeat hits off the database.' },
      { layer: 'client', file: 'frontend/middleware.js (Vercel Edge)',
        fn: 'renderBlogPost()',
        desc: 'Crawlers get full server-rendered HTML: article, JSON-LD, related-post links (3 topic + 3 rotation + prev/next). Humans get the SPA view.' },
      { layer: 'response', file: 'Googlebot',
        fn: 'index → impressions',
        desc: 'Every post links 6+ siblings, so the crawler can walk the whole journal without touching the sitemap.' },
    ],
  },
  {
    id: 'google-auth',
    name: 'Sign in with Google',
    tagline: 'OAuth credential to app session',
    steps: [
      { layer: 'client', file: 'frontend/src/components/Auth/AuthModal.jsx',
        fn: 'POST /api/v1/auth/google { credential }',
        desc: 'Google Identity Services hands the app an ID token after the account chooser.' },
      { layer: 'middleware', file: 'backend/src/middlewares/ratelimit.go',
        fn: 'RateLimit(rdb)',
        desc: 'Auth endpoints are rate-limited but never require an existing session.' },
      { layer: 'controller', file: 'backend/src/controllers/oauth.go',
        fn: 'OAuthController.GoogleLogin()',
        desc: 'Verifies the ID token signature and audience against Google\'s keys, then upserts the user by email.' },
      { layer: 'postgres', file: 'users table',
        fn: 'INSERT … ON CONFLICT (email) DO UPDATE',
        desc: 'Anonymous session data migrates to the account — no data loss on first sign-in (Article III).' },
      { layer: 'response', file: 'AuthModal.jsx → TopRightPill',
        fn: 'JWT session token',
        desc: 'golang-jwt signs the session; the avatar appears top-right and authed endpoints accept the Bearer token.' },
    ],
  },
]

const STEP_MS = 1400   // autoplay cadence per step

export default function ArchitectureExplorer() {
  const [flowId, setFlowId] = useState(FLOWS[0].id)
  const [active, setActive] = useState(0)     // highest lit step
  const [playing, setPlaying] = useState(true)
  const timerRef = useRef(null)

  const flow = FLOWS.find(f => f.id === flowId)

  const restart = useCallback((id) => {
    if (id) setFlowId(id)
    setActive(0)
    setPlaying(true)
  }, [])

  useEffect(() => {
    if (!playing) return
    if (active >= flow.steps.length - 1) { setPlaying(false); return }
    timerRef.current = setTimeout(() => setActive(a => a + 1), STEP_MS)
    return () => clearTimeout(timerRef.current)
  }, [playing, active, flow])

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Pick a feature and watch the request walk through the real architecture —
        every file, function and query below exists in the repo.
      </p>

      <div className={styles.picker}>
        {FLOWS.map(f => (
          <button
            key={f.id}
            className={`${styles.pick} ${f.id === flowId ? styles.pickOn : ''}`}
            onClick={() => restart(f.id)}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className={styles.flowHead}>
        <div>
          <span className={styles.flowName}>{flow.name}</span>
          <span className={styles.flowTag}>{flow.tagline}</span>
        </div>
        <div className={styles.controls}>
          <button className={styles.ctl} onClick={() => { setPlaying(false); setActive(a => Math.max(0, a - 1)) }} aria-label="Previous step">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          {playing ? (
            <button className={styles.ctl} onClick={() => setPlaying(false)} aria-label="Pause">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            </button>
          ) : (
            <button className={styles.ctl} onClick={() => (active >= flow.steps.length - 1 ? restart() : setPlaying(true))} aria-label="Play">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
            </button>
          )}
          <button className={styles.ctl} onClick={() => { setPlaying(false); setActive(a => Math.min(flow.steps.length - 1, a + 1)) }} aria-label="Next step">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <ol className={styles.steps}>
        {flow.steps.map((s, i) => {
          const layer = LAYERS[s.layer]
          const lit = i <= active
          const current = i === active
          return (
            <li
              key={i}
              className={`${styles.step} ${lit ? styles.stepLit : ''} ${current ? styles.stepNow : ''}`}
              style={{ '--hue': layer.hue }}
              onClick={() => { setPlaying(false); setActive(i) }}
            >
              <span className={styles.rail}>
                <span className={styles.dot} />
                {i < flow.steps.length - 1 && <span className={styles.line} />}
              </span>
              <div className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.layer}>{layer.label}</span>
                  <span className={styles.file}>{s.file}</span>
                </div>
                <p className={styles.fn}>{s.fn}</p>
                <p className={styles.desc}>{s.desc}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

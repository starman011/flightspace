import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './ArchitectureExplorer.module.css'

// ── Layer taxonomy — the classic backend layering, one color each ──────────
// This codebase is stdlib-first (constitution Art. II §2.3): the SERVICE and
// REPOSITORY responsibilities live INLINE in the controller file rather than
// in separate classes. The walkthrough still labels those steps so you can
// see which lines of the controller are playing which architectural role.
const LAYERS = {
  client:     { label: 'CLIENT',     hue: '#7dd3fc', tip: 'Browser code — React components, fetch calls' },
  network:    { label: 'NETWORK',    hue: '#94a3b8', tip: 'What HTTP itself does between browser and server' },
  router:     { label: 'ROUTER',     hue: '#c4b5fd', tip: 'Matches method + URL to a handler function' },
  middleware: { label: 'MIDDLEWARE', hue: '#fbbf24', tip: 'Wraps handlers — runs before them (rate limit, auth, CORS)' },
  controller: { label: 'CONTROLLER', hue: '#b2ff1a', tip: 'Handler: parses the request, orchestrates, writes the response' },
  service:    { label: 'SERVICE',    hue: '#5eead4', tip: 'Business rules — validation, decisions (inline here)' },
  repository: { label: 'REPOSITORY', hue: '#60a5fa', tip: 'The code that talks to the database (inline here, via pgx)' },
  postgres:   { label: 'POSTGRES',   hue: '#818cf8', tip: 'The database engine itself' },
  redis:      { label: 'REDIS',      hue: '#f87171', tip: 'In-memory store — hot state, counters' },
  external:   { label: 'EXTERNAL',   hue: '#fb923c', tip: 'Third-party APIs (Resend, NASA, adsb.lol)' },
  worker:     { label: 'WORKER',     hue: '#f0abfc', tip: 'Background goroutine — no HTTP request involved' },
  websocket:  { label: 'WEBSOCKET',  hue: '#34d399', tip: 'Persistent 2-way connection — server pushes' },
  response:   { label: 'RESPONSE',   hue: '#e2e8f0', tip: 'The journey back — status code, JSON, UI update' },
}

// ── Feature flows — every file, function, query and code line is real ──────
const FLOWS = [
  {
    id: 'contact',
    name: 'Contact form',
    tagline: 'Full journey: a click → Postgres row → email — 11 stops',
    steps: [
      { layer: 'client', file: 'frontend/src/components/StaticPages/ContactPage.jsx',
        fn: 'The click',
        code: `fetch(API + '/api/v1/contact', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({ name, email, message }),\n})`,
        desc: 'The Send button\'s onClick gathers the three state variables the user typed and serializes them to a JSON string. fetch() hands that to the browser\'s network stack. Nothing about the backend exists in the frontend except this URL contract.' },
      { layer: 'network', file: 'the browser + api.objecttracer.com',
        fn: 'HTTP POST crosses the wire',
        code: `POST /api/v1/contact HTTP/2\nHost: api.objecttracer.com\nContent-Type: application/json\n\n{"name":"…","email":"…","message":"…"}`,
        desc: 'The frontend (Vercel) and backend (Railway) are different origins, so the browser enforces CORS: for this content type it first sends an OPTIONS preflight asking "may I POST here?". The cors.go middleware answers with Access-Control-Allow-Origin, and only then does the real POST fly.' },
      { layer: 'router', file: 'backend/src/routes/index.go',
        fn: 'Route registration (happens once, at server boot)',
        code: `mux.Handle("POST /api/v1/contact",\n  rateLimit(http.HandlerFunc(contact.Submit)))`,
        desc: 'Go\'s net/http ServeMux is the router: a table from "METHOD /path" patterns to handler functions. Note the onion wrapping — rateLimit(...) takes the Submit handler and returns a NEW handler that runs its own code first. That\'s all middleware is: a function that eats a handler and returns a handler.' },
      { layer: 'middleware', file: 'backend/src/middlewares/ratelimit.go',
        fn: 'RateLimit(rdb) — the outer onion layer',
        code: `ip := extractIP(r)\nkey := fmt.Sprintf("rate:%s", ip)\ncount, err := increment(r.Context(), rdb, key, rateLimitWindow)\nif err != nil { /* Redis down → 503, fail closed */ }`,
        desc: 'Before Submit ever runs: extract the caller\'s IP, INCR a Redis counter keyed rate:{ip} with an expiry window. Over the limit → 429 Too Many Requests and the chain stops here. Detail worth stealing: if Redis is unreachable it fails CLOSED (503) — an attacker can\'t disable rate limiting by taking Redis down.' },
      { layer: 'controller', file: 'backend/src/controllers/contact.go',
        fn: 'ContactController.Submit(w, r) — parse the request',
        code: `r.Body = http.MaxBytesReader(w, r.Body, 8192)\nvar body struct {\n  Name    string \`json:"name"\`\n  Email   string \`json:"email"\`\n  Message string \`json:"message"\`\n}\nif err := json.NewDecoder(r.Body).Decode(&body); err != nil {\n  utils.Error(w, http.StatusBadRequest, "invalid json")\n  return\n}`,
        desc: 'Every Go handler has the same signature: (http.ResponseWriter, *http.Request). First defensive move: cap the body at 8KB so nobody posts a 2GB "message". Then decode the JSON straight into an anonymous struct — the struct tags map JSON keys to fields. Malformed JSON → 400 and we\'re done.' },
      { layer: 'service', file: 'backend/src/controllers/contact.go (inline — same function)',
        fn: 'Business rules: is this message acceptable?',
        code: `email, err := utils.NormalizeEmail(body.Email)\nif err != nil { utils.Error(w, 400, "invalid email"); return }\nif len(body.Message) < 5  { utils.Error(w, 400, "message too short"); return }\nif len(body.Message) > 4000 { utils.Error(w, 400, "message too long"); return }`,
        desc: 'This is the "service layer" — the business decisions — even though it isn\'t a separate class here (stdlib-first codebase, no ceremony). Trim whitespace, normalize the email, enforce 5–4000 chars. Each failure returns a specific 400 message the frontend can show. Rule of thumb: the controller parses, the service DECIDES.' },
      { layer: 'repository', file: 'backend/src/controllers/contact.go (inline, via db/postgres.go pool)',
        fn: 'Persist — the only line that knows SQL',
        code: `cc.pool.Exec(r.Context(),\n  \`INSERT INTO contact_messages (name, email, message)\n   VALUES ($1, $2, $3)\`,\n  body.Name, email, body.Message)`,
        desc: 'The repository role: translate "save this message" into SQL. cc.pool is a pgx connection pool created once at boot (db/postgres.go) — handlers borrow a connection and return it. The $1/$2/$3 placeholders are parameterized queries: user input NEVER gets concatenated into SQL, which kills SQL injection dead. r.Context() means if the client disconnects, the query gets cancelled too.' },
      { layer: 'postgres', file: 'Postgres (Neon)',
        fn: 'The database engine does its job',
        code: `INSERT 0 1  -- one row written, WAL-logged, durable`,
        desc: 'Postgres parses the statement, plans it, writes the row plus a write-ahead-log entry so the data survives a crash. When Exec returns without error, the message is durably stored — this is the moment the feature has "worked" even if everything after fails.' },
      { layer: 'external', file: 'backend/src/controllers/contact.go',
        fn: 'go sendContactEmail(…) — side effect, off the critical path',
        code: `go sendContactEmail(body.Name, email, body.Message)\n// inside: POST https://api.resend.com/emails\n// errors are logged, never returned to the user`,
        desc: 'The go keyword launches a goroutine — the email notification to the admin runs concurrently and the HTTP response does NOT wait for Resend. Deliberate ordering: DB write first (must succeed), email second (nice to have). If Resend is down the user still gets a success — the message is safe in Postgres.' },
      { layer: 'response', file: 'backend/src/utils → ContactPage.jsx',
        fn: 'The journey back',
        code: `utils.JSON(w, http.StatusOK, map[string]string{"status": "sent"})\n// browser: res.ok → setState('sent')`,
        desc: 'The controller serializes {"status":"sent"} with a 200, the middleware chain unwinds (rate-limit headers already set), the browser\'s fetch promise resolves, and React swaps the form for a success state. Total round trip: ~100-200ms, one Redis INCR, one Postgres INSERT.' },
      { layer: 'client', file: 'frontend/src/components/AdminPage/AdminPage.jsx',
        fn: 'Epilogue — where the message surfaces',
        code: `GET /api/v1/admin/messages  → AdminController.ListMessages()\nSELECT … FROM contact_messages ORDER BY created_at DESC`,
        desc: 'Later, the admin inbox reads the same table through its own guarded path (AuthRequired middleware + isAdmin email check). One table, two flows: the public write path you just walked, and the private read path.' },
    ],
  },
  {
    id: 'live-aircraft',
    name: 'Live aircraft on the globe',
    tagline: 'No request at all — a worker pipeline pushes to you',
    steps: [
      { layer: 'worker', file: 'backend/src/controllers/poller.go',
        fn: 'Poller.Start() — a loop, not a handler',
        code: `ticker := time.NewTicker(5 * time.Second)\nfor { <-ticker.C; p.poll(ctx, &backoff) }`,
        desc: 'This flow inverts everything: no user clicks anything. A goroutine started at server boot wakes every 5 seconds. Workers like this are how you handle data that changes whether or not anyone is watching.' },
      { layer: 'external', file: 'adsb.lol open ADS-B network',
        fn: 'Poller.fetchAdsbLol()',
        code: `GET https://api.adsb.lol/v2/…  → thousands of aircraft\nparseAdsbAircraft(raw) → []models.LiveAircraft`,
        desc: 'One upstream fetch per tick returns the world\'s ADS-B picture. parseAdsbAircraft normalizes the vendor\'s shape into our own model struct — never let a third party\'s JSON schema leak into your domain; when the vendor changes, only the parser changes.' },
      { layer: 'redis', file: 'backend/src/controllers/poller.go → db/redis.go',
        fn: 'storeInRedis() — the hot tier',
        code: `pipe := rdb.Pipeline()\nfor _, a := range aircraft {\n  pipe.HSet(ctx, "aircraft:live", a.ID, jsonBytes)\n}\npipe.Exec(ctx)`,
        desc: 'All writes go through one pipelined round trip instead of 12,000 individual commands. Redis holds only "right now" — removeStale() deletes aircraft silent for 120s. Search, fleet queries and the WebSocket hub all read this single hash.' },
      { layer: 'repository', file: 'backend/src/controllers/poller.go',
        fn: 'storePositions() / storeTrails() — the warm tier',
        code: `INSERT INTO positions (icao24, lat, lon, alt, ts) VALUES …\n-- append-only; historical positions are never mutated`,
        desc: 'The same tick also appends to Postgres for the 24h trail history and playback. Two stores, two jobs: Redis answers "where is it now?", Postgres answers "where has it been?" (constitution Art. VIII data tiers).' },
      { layer: 'websocket', file: 'backend/src/controllers/ws_hub.go',
        fn: 'Hub.Run() — the broadcaster',
        code: `case <-ticker.C:   // every 5s\n  h.broadcast(ctx)  // diff vs h.lastState → send deltas\n// new client? sendSnapshot(c) — full state once`,
        desc: 'The Hub keeps every open WebSocket in a map. Each tick it diffs current Redis state against what it last sent and pushes only the CHANGES. New connections get one full snapshot first. Snapshot+delta is the standard trick for real-time feeds — full state is too big to resend every 5s.' },
      { layer: 'client', file: 'frontend/src/hooks/useWebSocket.js → useAircraft.js → Globe.jsx',
        fn: 'onSnapshot / onDelta → InstancedMesh',
        code: `aircraft.set(delta.id, updated)   // Map, not array\nplaneMesh.setMatrixAt(slot, matrix)  // one GPU buffer write`,
        desc: 'The browser merges deltas into a Map keyed by ICAO24, and the render loop writes new matrices into the InstancedMesh — 12,000 planes, one draw call, positions interpolated between ticks so motion looks continuous.' },
    ],
  },
  {
    id: 'search',
    name: 'Flight search',
    tagline: 'Read path: Redis only, no SQL anywhere',
    steps: [
      { layer: 'client', file: 'frontend/src/components/SearchBar/SearchBar.jsx',
        fn: 'Debounced input',
        code: `clearTimeout(debounceRef.current)\ndebounceRef.current = setTimeout(async () => {\n  fetch(\`/api/v1/aircraft/search?q=\${q}&limit=8\`)\n}, 300)`,
        desc: 'Every keystroke resets a 300ms timer; only when you pause does the request fire. Without this, typing "emirates" would fire 8 requests. Local airport matching happens instantly from a bundled list — only live flights need the server.' },
      { layer: 'router', file: 'backend/src/routes/index.go',
        fn: 'Two middleware layers this time',
        code: `mux.Handle("GET /api/v1/aircraft/search",\n  rateLimit(authOpt(http.HandlerFunc(aircraft.Search))))`,
        desc: 'Read the wrapping inside-out: the handler is wrapped by authOpt, which is wrapped by rateLimit. Request order is therefore rateLimit → authOpt → Search. Order matters: you want to reject flooders before doing JWT crypto.' },
      { layer: 'middleware', file: 'backend/src/middlewares/auth.go',
        fn: 'AuthOptional(jwtSecret)',
        code: `token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")\n// valid → user claims into r.Context(); invalid → continue anonymous`,
        desc: 'Optional auth parses the JWT if present and stuffs the user into the request context — but never blocks. Search works logged out. Compare AuthRequired on admin routes, which 401s instead. Same file, two policies.' },
      { layer: 'controller', file: 'backend/src/controllers/aircraft.go',
        fn: 'AircraftController.Search() — validate, then score',
        code: `q := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("q")))\nif q == "" { utils.Error(w, 400, "query parameter 'q' is required") }\nif len(q) > 100 { utils.Error(w, 400, "query too long") }`,
        desc: 'Query params get the same distrust as JSON bodies: required, length-capped, normalized to uppercase once so every comparison downstream is cheap.' },
      { layer: 'redis', file: 'aircraft:live hash',
        fn: 'The whole dataset in one call',
        code: `raw, _ := ac.rdb.HGetAll(ctx, "aircraft:live")\n// ~12K entries → unmarshal → score in a plain loop`,
        desc: 'HGETALL pulls every live aircraft; the controller scores matches in memory: exact callsign = 100, prefix = 50, contains = 10, then sorts and slices. Searching only what\'s airborne right now means Redis IS the index — no SQL, no Elasticsearch, nothing to keep in sync.' },
      { layer: 'service', file: 'backend/src/controllers/aircraft.go (inline)',
        fn: 'Enrichment before the response',
        code: `if iata, ok := data.AirlineICAOtoIATA[callsign[:3]]; ok {\n  sr.AirlineIATA = &iata\n}`,
        desc: 'A pure in-memory map lookup turns the callsign prefix (UAE…) into the IATA code (EK) that the frontend needs for the logo CDN. Enrichment lives server-side so the client never bundles the OpenFlights dataset.' },
      { layer: 'response', file: 'SearchBar.jsx',
        fn: '200 → dropdown',
        code: `{"results":[{"icao24":"…","callsign":"UAE202",\n  "airline_iata":"EK","altitude":38000,…}]}`,
        desc: 'React maps results to rows — airline logo, callsign, type, altitude. Click one → setSelectedIcao24 → the globe flies to the plane. The search response and the click handler share nothing but the icao24 string.' },
    ],
  },
  {
    id: 'admin-reply',
    name: 'Admin replies to a message',
    tagline: 'Auth vs authorization — two different gates',
    steps: [
      { layer: 'client', file: 'frontend/src/components/AdminPage/AdminPage.jsx',
        fn: 'Authenticated request',
        code: `fetch(\`/api/v1/admin/messages/\${id}/reply\`, {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${sessionToken}\` },\n  body: JSON.stringify({ body: reply }),\n})`,
        desc: 'The Bearer token is the JWT issued at Google sign-in. It travels in a header on every admin call — the server holds no session memory (stateless auth): everything needed to verify you is inside the signed token.' },
      { layer: 'middleware', file: 'backend/src/middlewares/auth.go',
        fn: 'AuthRequired(jwtSecret) — gate #1: who are you?',
        code: `claims, err := jwt.Parse(token, secret)\nif err != nil { utils.Error(w, 401, "unauthorized"); return }`,
        desc: 'Verifies the token\'s signature with the server\'s secret and checks expiry. Tampered or stale token → 401 before any admin code runs. This answers identity — it does NOT answer permission.' },
      { layer: 'service', file: 'backend/src/controllers/admin.go',
        fn: 'isAdmin() — gate #2: are you ALLOWED?',
        code: `func (ac *AdminController) isAdmin(r *http.Request) bool {\n  // JWT email must equal the ADMIN_EMAIL env var\n}`,
        desc: 'Authorization is a business rule, so it lives with the business logic: any valid signed-in user passes gate #1, but only the allowlisted email passes gate #2. Confusing these two gates is a classic security bug — authentication is not authorization.' },
      { layer: 'external', file: 'backend/src/controllers/admin.go → Reply()',
        fn: 'Send the reply via Resend',
        code: `POST https://api.resend.com/emails\nAuthorization: Bearer RESEND_API_KEY   // send-scope key`,
        desc: 'Unlike the contact flow, here the email IS the feature — so it runs on the critical path and its failure becomes an error response. War story encoded in the env: send-scope keys can\'t READ mail; importing inbound email needs the separate RESEND_READ_API_KEY.' },
      { layer: 'repository', file: 'contact_messages table',
        fn: 'Record the thread state',
        code: `UPDATE contact_messages\nSET replied_at = NOW(), reply_body = $2,\n    read_at = COALESCE(read_at, NOW())\nWHERE id = $1`,
        desc: 'COALESCE(read_at, NOW()) is a nice micro-pattern: set read_at only if it\'s still NULL — replying implies reading, without stomping an earlier timestamp.' },
      { layer: 'response', file: 'AdminPage.jsx',
        fn: '200 → inbox updates',
        code: `setItems(items => items.map(m =>\n  m.id === id ? { ...m, replied_at: new Date().toISOString() } : m))`,
        desc: 'The UI updates optimistically from the response instead of refetching the whole list — one less round trip, same end state.' },
    ],
  },
  {
    id: 'journal',
    name: 'Space Journal post',
    tagline: 'Write path is a worker; read path is cached SQL + SSR',
    steps: [
      { layer: 'worker', file: 'backend/src/controllers/blog_poller.go',
        fn: 'Daily APOD ingestion',
        code: `GET https://api.nasa.gov/planetary/apod?api_key=…\nINSERT INTO blog_posts (slug, date, title, intro,\n  explanation, image_url, …)`,
        desc: 'A scheduled worker turns NASA\'s Astronomy Picture of the Day into a row in blog_posts. The slug (2026-07-04-pathfinder-on-mars) is derived from date + title and becomes the permanent URL.' },
      { layer: 'router', file: 'backend/src/routes/index.go',
        fn: 'Public read endpoint',
        code: `mux.Handle("GET /api/v1/blog/{slug}",\n  rateLimit(http.HandlerFunc(blog.GetBlogPost)))`,
        desc: 'Go 1.22 path parameters: {slug} in the pattern, r.PathValue("slug") in the handler. No third-party router needed.' },
      { layer: 'repository', file: 'backend/src/controllers/blog_controller.go',
        fn: 'GetBlogPost() — one SELECT, then cache headers',
        code: `SELECT slug, date, title, intro, explanation, image_url, …\nFROM blog_posts WHERE slug = $1\n-- response: Cache-Control: public, max-age=300`,
        desc: 'A single indexed lookup. The Cache-Control header means Vercel\'s edge and browsers can reuse the answer for 5 minutes — the DB sees a fraction of actual traffic. Caching at the HTTP layer beats caching in code: no invalidation logic to write.' },
      { layer: 'client', file: 'frontend/middleware.js (Vercel Edge)',
        fn: 'renderBlogPost() — SSR for everyone',
        code: `const [pr, lr] = await Promise.all([\n  fetch(\`/api/v1/blog/\${slug}\`),\n  fetch('/api/v1/blog?limit=50'),   // for related links\n])`,
        desc: 'The edge function fetches the post AND the archive list in parallel, renders full HTML (article, JSON-LD, 3 topic-related + 3 rotation-picked sibling links, prev/next), injects the SPA scripts, and serves the same document to crawlers and humans.' },
      { layer: 'response', file: 'Googlebot / reader',
        fn: 'Crawlable, linked, indexed',
        code: `<h2>More from the Space Journal</h2>\n<ul class="cards">…6 sibling posts…</ul>`,
        desc: 'Because every post links six siblings, a crawler entering anywhere can walk the entire journal — no post is a dead end reachable only from the sitemap.' },
    ],
  },
  {
    id: 'google-auth',
    name: 'Sign in with Google',
    tagline: 'Trust delegation: verify Google\'s signature, issue your own',
    steps: [
      { layer: 'client', file: 'frontend/src/components/Auth/AuthModal.jsx',
        fn: 'Google hands you a credential',
        code: `POST /api/v1/auth/google\n{ "credential": "eyJhbGciOiJSUzI1NiIs…" }`,
        desc: 'Google Identity Services runs the account chooser and gives the page a signed ID token (a JWT signed by GOOGLE, not by us). The frontend forwards it — it can\'t verify anything itself; verification needs Google\'s public keys and must happen server-side.' },
      { layer: 'controller', file: 'backend/src/controllers/oauth.go',
        fn: 'OAuthController.GoogleLogin() — verify before trusting',
        code: `payload, err := idtoken.Validate(ctx, credential, googleClientID)\n// checks: RSA signature vs Google's JWKS, expiry,\n// audience == OUR client ID`,
        desc: 'Three checks, all mandatory: the signature proves Google issued it, the expiry proves it\'s fresh, and the audience check proves it was issued for THIS app — without it, a token stolen from any other Google-login site would work here.' },
      { layer: 'repository', file: 'users table',
        fn: 'Upsert the user',
        code: `INSERT INTO users (email, name, avatar_url)\nVALUES ($1, $2, $3)\nON CONFLICT (email) DO UPDATE SET name = $2, avatar_url = $3`,
        desc: 'ON CONFLICT makes first sign-in and returning sign-in the same statement — no "does this user exist?" race condition. The anonymous session\'s data migrates to the account (constitution Art. III: no data loss at sign-in).' },
      { layer: 'service', file: 'backend/src/controllers/oauth.go (inline)',
        fn: 'Issue OUR token',
        code: `token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)\nsigned, _ := token.SignedString([]byte(jwtSecret))`,
        desc: 'Google\'s token is swapped for the app\'s own JWT (email, user id, expiry) signed with the server secret. From here on, auth middleware only ever checks OUR signature — Google is out of the loop until the token expires.' },
      { layer: 'response', file: 'AuthModal.jsx → TopRightPill.jsx',
        fn: 'Session established',
        code: `localStorage.setItem('session', token)\n// every later call: Authorization: Bearer <token>`,
        desc: 'The avatar appears top-right, and every authed endpoint (watchlist, pinned launches, admin) reads identity from the Bearer header. Stateless: the server stores no sessions, restarts lose nothing.' },
    ],
  },
]

const STEP_MS = 2600   // teaching pace — slower than the old 1.4s

export default function ArchitectureExplorer() {
  const [flowId, setFlowId] = useState(FLOWS[0].id)
  const [active, setActive] = useState(0)
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
        Pick a feature and follow the request from the click to the database and
        back. Every file, function, query and code line below is real. The badges
        follow classic layering — in this stdlib-first codebase the SERVICE and
        REPOSITORY roles live inline in the controller, and each step shows exactly
        which lines play which role.
      </p>

      <div className={styles.legend}>
        {Object.values(LAYERS).map(l => (
          <span key={l.label} className={styles.legendItem} style={{ '--hue': l.hue }} title={l.tip}>
            {l.label}
          </span>
        ))}
      </div>

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
                  <span className={styles.layer} title={layer.tip}>{layer.label}</span>
                  <span className={styles.file}>{s.file}</span>
                </div>
                <p className={styles.fn}>{s.fn}</p>
                {s.code && <pre className={styles.code}>{s.code}</pre>}
                <p className={styles.desc}>{s.desc}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

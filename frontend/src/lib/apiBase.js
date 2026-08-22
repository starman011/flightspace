// Normalised API base URL.
//
// VITE_API_URL is configured per environment, and production had it set with a
// trailing slash. Every call site builds requests as `${API}/api/v1/...`, so
// that one slash produced `//api/v1/...`. The edge answers a double slash with
// a 301 to the single-slash path — and a browser following a 301 rewrites POST
// to GET. `POST /api/v1/session` therefore arrived as a GET and came back 405,
// so session creation failed forever behind the retry loop while every GET
// endpoint kept working. That combination reads like a partial backend outage
// and is not one.
//
// Strip the slash once, here, so no call site can reintroduce it and no
// environment can be misconfigured into the same failure.
const stripTrailingSlash = (url) => (url || '').replace(/\/+$/, '')

export const API_BASE = stripTrailingSlash(import.meta.env.VITE_API_URL)

// Same value, but falling back to the page's own origin for the callers that
// need an absolute base even when VITE_API_URL is unset (WebSocket, asteroids).
export const API_ORIGIN = API_BASE || `${location.protocol}//${location.host}`

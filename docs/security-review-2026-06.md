# ObjectTracer — Security Review & Penetration Test Report

**Date:** 2026-06-27
**Scope:** Full application — Go backend (Railway), Vite SPA + Vercel Edge Middleware (SSR), infra config (CSP, headers, CORS, Permissions-Policy).
**Method:** Test-suite execution, static analysis (auth, injection, SSRF, secrets, headers), dependency audit, and review of the existing `security_pentest_test.go` suite.

---

## Executive summary

**Overall posture: strong.** The backend follows defensive best practices throughout (parameterized SQL, validated input, allowlist CORS, full security-header set, bcrypt, correctly-validated JWTs, Redis rate-limiting, secrets required from env with no insecure defaults). The app already ships a substantial in-repo pentest suite.

This review found **no critical or high-severity exploitable issues**. Two items were **fixed during the review**; the remainder are low-priority / informational.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Outdated `react-router` (known advisories) | High (advisory) / Low (practical, SPA) | **Fixed** (`npm audit fix`) |
| 2 | SSR `canonical`/`og:url` not HTML-escaped | Low (not currently exploitable) | **Fixed** (escaped) |
| 3 | `vite`/`esbuild` dev-tooling advisories | Low (dev-only, not shipped) | Open (optional) |
| 4 | `openskyEnabled` diagnostic field leaks config presence | Informational | Open (optional) |
| 5 | `esc()` does not escape single quotes | Low (double-quoted attrs only) | Accepted |

---

## Test results

- **Frontend (vitest):** 78/78 passing.
- **Backend (`go test ./...`):** all packages pass, including `security_pentest_test.go`.
- **Existing pentest coverage** (already in the repo — excellent): JWT `alg:none`, alg-confusion, tampered payload, expired, missing claims, type escalation, signature stripping, crafted header; email SQLi / XSS / homoglyph / boundary / case-fold / protocol-injection; clickjacking, CSP enforcement, all security headers, HSTS, CORS (arbitrary origin, null origin, preflight, wildcard-not-used), auth bypass (empty/garbage bearer).
- **Dependency audit:** `npm audit --omit=dev` → **0 vulnerabilities** after fix.

---

## Findings (detail)

### 1. Outdated react-router — **Fixed**
`npm audit` flagged `react-router 7.x` with High-severity advisories (turbo-stream deserialization RCE, protocol-relative open redirect, single-fetch DoS/CSRF). **Practical risk was low** — these affect react-router's *server/SSR/loader* features, and ObjectTracer is a pure client-side SPA. Patched via `npm audit fix` (in-semver bump). Production audit is now clean.

### 2. SSR canonical/og:url not escaped — **Fixed**
In `frontend/middleware.js` `html()`, `title`/`desc`/`og:image` were escaped but `canonical` and `og:url` (built from path params like `/flight/${icao24}`) were not. **Not currently exploitable** — every renderer sanitizes or constrains its input (`renderFlight` strips icao24 to `[a-f0-9]`, `renderAirport` length-caps IATA to 3–4 chars, route/launch/asteroid/city/blog look up known dataset entries and bail otherwise). Escaped anyway to close the attribute-injection class (defense-in-depth).

### 3. vite/esbuild dev advisories — Open (optional)
Remaining `npm audit` items (1 high, 1 moderate) are in **build tooling** (`esbuild` dev-server request advisory, `vite`). These are **devDependencies — not in the production bundle and not reachable by users**. Fixing requires `npm audit fix --force` (a `vite` major bump) which risks build breakage. **Recommendation:** schedule a deliberate Vite upgrade; not urgent.

### 4. `openskyEnabled` diagnostic — Informational
The `/airports/{iata}/arrivals|departures` responses include `"openskyEnabled": true/false`. This only reveals whether OpenSky creds are configured (no secret value). Harmless; remove once OpenSky integration is settled.

### 5. `esc()` single-quote — Accepted
`esc()` escapes `& < > "` but not `'`. All SSR attributes use double quotes, so this is not a vector. No change needed.

---

## Strong controls verified (no action needed)

**Authentication / sessions**
- JWT HS256 with **signing-method validation** (`*jwt.SigningMethodHMAC` check) — blocks `alg:none` and RS/HS confusion.
- `JWT_SECRET` **required from env**, app refuses to start if empty — **no hardcoded default**.
- Passwords: **bcrypt** with an explicit 72-byte truncation guard.
- Session cookies: **HttpOnly + Secure (TLS-aware) + SameSite=Lax**.
- Admin endpoints gated by `ADMIN_SECRET` Bearer check that **fails closed** when unset.

**Injection / SSRF**
- SQL via pgx — **no string-concatenated queries** found (parameterized).
- **No `os/exec`** / command execution anywhere.
- All outbound server fetches use **fixed, hardcoded hosts** (adsbdb, NASA, OpenSky, adsb.lol, Resend, SIMBAD, …) — **no user-controlled host → no SSRF**.
- `icao24` validated against `^[0-9a-f]{6}$`; `iata` length-capped & uppercased.

**Transport / headers / CORS**
- Full security-header middleware: `X-Frame-Options: DENY`, `nosniff`, HSTS (2y, preload), strict API CSP (`default-src 'none'`), COOP, CORP, `Referrer-Policy: no-referrer`, server-banner removed.
- CORS is **allowlist-based** (`ALLOWED_ORIGINS` env) and only sends `Allow-Credentials: true` for allowed origins — **never wildcard-with-credentials**; null origin rejected (tested).
- Frontend CSP (vercel.json) is strict (script-src `'self'` + GTM/accounts only — no `unsafe-inline` scripts).
- `Permissions-Policy: camera=(self), microphone=(), geolocation=(self)` — least-privilege.

**Abuse / rate limiting**
- Redis-backed **100 req/min per IP**, with `Retry-After` + `X-RateLimit-*` headers.

---

## Recommendations (priority order)

1. **Deploy the two fixes** in this review (already committed/pushed): escaped canonical + patched react-router.
2. **Plan a Vite/esbuild upgrade** to clear the dev-only advisories (low urgency).
3. **(Optional)** Remove the `openskyEnabled` diagnostic field once OpenSky is stable.
4. **Keep the pentest suite in CI** — run `go test ./...` + `npm audit --omit=dev` on every PR to catch regressions.
5. **Rotate `JWT_SECRET`/`ADMIN_SECRET`** if either was ever committed or shared; confirm they're long & random in Railway.

---

*No critical or high-severity exploitable vulnerabilities were identified. The application demonstrates a mature, defense-in-depth security posture.*

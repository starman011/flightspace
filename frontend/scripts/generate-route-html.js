/**
 * Post-build: generate per-route HTML files with correct meta tags.
 *
 * Googlebot first-pass reads raw HTML before executing JS.
 * Social crawlers (Facebook, Twitter, LinkedIn) never execute JS.
 * Without this, every route serves identical root-page meta → duplicate content.
 *
 * For each static route in ROUTE_META, this script:
 * 1. Reads dist/index.html as template
 * 2. Replaces title, description, canonical, OG, and Twitter meta
 * 3. Writes to dist/{route}/index.html
 *
 * Vercel serves static files before rewrite rules, so these take priority
 * over the catch-all "/(.*) → /index.html" rewrite.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { ROUTE_META } from '../src/utils/routing.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const BASE_URL = 'https://www.objecttracer.com'

// Single source of truth: ROUTE_META is imported from src/utils/routing.js
// (also used at runtime), so prerendered bot HTML and hydrated titles cannot
// drift. Only these static landing routes are prerendered here — dynamic and
// middleware-SSR routes are handled elsewhere.
const STATIC_ROUTES = [
  // '/globe' is the SPA's own root — '/' now serves the static marketing page,
  // so the shell written to dist/index.html describes the globe.
  '/globe', '/launches', '/solar-system', '/deep-space', '/moon', '/asteroids',
  '/faq', '/about', '/contact', '/waitlist', '/planes', '/flight',
]

// Noscript content per route (meaningful text for non-JS crawlers)
const NOSCRIPT_CONTENT = {
  '/globe':        'ObjectTracer is a real-time interactive 3D globe for tracking live flights (ADS-B), ships (AIS), the ISS, satellites, rocket launches, near-Earth asteroids, and DESI deep-space galaxies. Free and open to everyone.',
  '/launches':     'Track upcoming rocket launches with live countdowns, mission details, vehicle specs, and launch pad locations. Get push notifications before launches.',
  '/solar-system': 'Explore the solar system with real-time planet positions, orbital paths, and interactive 3D visualization of all major planets.',
  '/deep-space':   'Explore the DESI deep-space galaxy catalog featuring millions of galaxies, the cosmic web, and 3D visualization of large-scale structure.',
  '/moon':         'Explore the Moon with lunar landing sites, real-time orbital data, and surface visualization including Apollo, Luna, and Chang\'e missions.',
  '/asteroids':    'Track near-Earth asteroids in real-time using NASA NeoWs data. See asteroid orbits, close approaches, and size comparisons on a 3D globe.',
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function generateRouteHtml(template, route, meta) {
  let html = template
  const fullUrl = `${BASE_URL}${route}`
  const escapedTitle = escapeHtml(meta.title)
  const escapedDesc = escapeHtml(meta.description)

  // Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapedTitle}</title>`
  )

  // Replace meta description
  html = html.replace(
    /<meta name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapedDesc}" />`
  )

  // Replace the static canonical (index.html hardcodes the homepage fallback —
  // the old "insert after comment" regex silently no-opped once that landed,
  // shipping canonical="/" on every prerendered route)
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${fullUrl}" />`
  )

  // Replace OG tags
  html = html.replace(
    /<meta property="og:url"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:url"         content="${fullUrl}" />`
  )
  html = html.replace(
    /<meta property="og:title"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:title"       content="${escapedTitle}" />`
  )
  html = html.replace(
    /<meta property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${escapedDesc}" />`
  )

  // Replace Twitter tags
  html = html.replace(
    /<meta name="twitter:url"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:url"         content="${fullUrl}" />`
  )
  html = html.replace(
    /<meta name="twitter:title"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:title"       content="${escapedTitle}" />`
  )
  html = html.replace(
    /<meta name="twitter:description"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${escapedDesc}" />`
  )

  // Replace JSON-LD url
  html = html.replace(
    /"url": "https:\/\/www\.objecttracer\.com\/"/,
    `"url": "${fullUrl}"`
  )

  // Add noscript content before closing </body>
  const noscriptText = NOSCRIPT_CONTENT[route] || NOSCRIPT_CONTENT['/globe']
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"></div>\n    <noscript><div style="padding:40px;max-width:720px;margin:auto;font-family:sans-serif;color:#ccc;background:#0a0e14"><h1>${escapedTitle}</h1><p>${escapeHtml(noscriptText)}</p><p>JavaScript is required to use ObjectTracer. Please enable JavaScript in your browser.</p><nav><a href="/" style="color:#bce419">Home</a> · <a href="/launches" style="color:#bce419">Launches</a> · <a href="/solar-system" style="color:#bce419">Solar System</a> · <a href="/deep-space" style="color:#bce419">Deep Space</a> · <a href="/moon" style="color:#bce419">Moon</a> · <a href="/asteroids" style="color:#bce419">Asteroids</a></nav></div></noscript>`
  )

  return html
}

// ── Main ──
const template = readFileSync(join(DIST, 'index.html'), 'utf-8')

for (const route of STATIC_ROUTES) {
  const meta = ROUTE_META[route]
  const html = generateRouteHtml(template, route, meta)

  if (route === '/globe') {
    // dist/index.html is the shell the SPA rewrite serves for every app route,
    // so the globe's metadata belongs on it.
    writeFileSync(join(DIST, 'index.html'), html)
    console.log(`  ✓ /globe (SPA shell index.html)`)
  } else {
    // Create route directory + index.html
    const routeDir = join(DIST, route.slice(1)) // remove leading /
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(join(routeDir, 'index.html'), html)
    console.log(`  ✓ ${route}`)
  }
}

console.log(`\n  Generated ${STATIC_ROUTES.length} route-specific HTML files`)

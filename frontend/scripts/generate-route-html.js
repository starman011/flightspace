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

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const BASE_URL = 'https://www.objecttracer.com'

// Mirror of ROUTE_META from src/utils/routing.js (keep in sync)
const ROUTE_META = {
  '/':             { title: 'ObjectTracer — Live Flight Tracker, ISS, Satellites & Deep Space on 3D Globe',
                     description: 'Track live flights, ships, ISS, satellites, rocket launches, asteroids, and DESI galaxies on a real-time interactive 3D globe.' },
  '/launches':     { title: 'Rocket Launch Tracker — Live Countdown & Mission Manifest | ObjectTracer',
                     description: 'Track upcoming rocket launches with live countdowns, mission details, and launch pad locations on a 3D globe.' },
  '/solar-system': { title: 'Solar System Explorer — Live Planet Positions | ObjectTracer',
                     description: 'Explore real-time positions of planets in our solar system with an interactive 3D visualization.' },
  '/deep-space':   { title: 'Deep Space — DESI Galaxy Catalog & Cosmic Web | ObjectTracer',
                     description: 'Explore the DESI deep-space galaxy catalog and cosmic web structure in an interactive 3D visualization.' },
  '/moon':         { title: 'Moon Tracker — Lunar Surface & Orbit View | ObjectTracer',
                     description: 'Explore the Moon with real-time orbital data and surface visualization on an interactive 3D globe.' },
  '/asteroids':    { title: 'Near-Earth Asteroid Tracker — NASA NeoWs Data | ObjectTracer',
                     description: 'Track near-Earth asteroids in real-time using NASA NeoWs data on an interactive 3D globe.' },
  // Pages below previously served the raw SPA shell (homepage title + canonical)
  // to non-bot crawlers — now each gets its own static HTML with self-canonical.
  '/faq':          { title: 'FAQ — ObjectTracer Live Flight & Space Tracker',
                     description: 'Answers to common questions about ObjectTracer: live flight tracking, ISS and satellite views, data sources, and how the free 3D globe works.' },
  '/about':        { title: 'About ObjectTracer — Real-Time Flight & Space Tracking',
                     description: 'ObjectTracer tracks every flying thing on one real-time 3D globe: planes, ships, the ISS, satellites, rocket launches, asteroids, and galaxies. Free, no login.' },
  '/contact':      { title: 'Contact ObjectTracer',
                     description: 'Get in touch with the ObjectTracer team — questions, feedback, data corrections, and partnership inquiries.' },
  '/waitlist':     { title: 'Join the ObjectTracer Waitlist',
                     description: 'Sign up for early access to new ObjectTracer features: flight alerts, weather overlays, and more.' },
  '/planes':       { title: 'Live Fleet Tracker — Airlines & Aircraft Types | ObjectTracer',
                     description: 'See every airborne aircraft of any airline or aircraft type right now — live fleets tracked from ADS-B on a free 3D globe.' },
  '/flight':       { title: 'Flights Near You — Live Flight Discovery | ObjectTracer',
                     description: 'Discover flights near your location in real time: departures, arrivals, and overhead aircraft on a free live 3D map.' },
}

// Noscript content per route (meaningful text for non-JS crawlers)
const NOSCRIPT_CONTENT = {
  '/':             'ObjectTracer is a real-time interactive 3D globe for tracking live flights (ADS-B), ships (AIS), the ISS, satellites, rocket launches, near-Earth asteroids, and DESI deep-space galaxies. Free and open to everyone.',
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
  const noscriptText = NOSCRIPT_CONTENT[route] || NOSCRIPT_CONTENT['/']
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"></div>\n    <noscript><div style="padding:40px;max-width:720px;margin:auto;font-family:sans-serif;color:#ccc;background:#0a0e14"><h1>${escapedTitle}</h1><p>${escapeHtml(noscriptText)}</p><p>JavaScript is required to use ObjectTracer. Please enable JavaScript in your browser.</p><nav><a href="/" style="color:#b2ff1a">Home</a> · <a href="/launches" style="color:#b2ff1a">Launches</a> · <a href="/solar-system" style="color:#b2ff1a">Solar System</a> · <a href="/deep-space" style="color:#b2ff1a">Deep Space</a> · <a href="/moon" style="color:#b2ff1a">Moon</a> · <a href="/asteroids" style="color:#b2ff1a">Asteroids</a></nav></div></noscript>`
  )

  return html
}

// ── Main ──
const template = readFileSync(join(DIST, 'index.html'), 'utf-8')

for (const [route, meta] of Object.entries(ROUTE_META)) {
  const html = generateRouteHtml(template, route, meta)

  if (route === '/') {
    // Overwrite root index.html with noscript + canonical
    writeFileSync(join(DIST, 'index.html'), html)
    console.log(`  ✓ / (root index.html)`)
  } else {
    // Create route directory + index.html
    const routeDir = join(DIST, route.slice(1)) // remove leading /
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(join(routeDir, 'index.html'), html)
    console.log(`  ✓ ${route}`)
  }
}

console.log(`\n  Generated ${Object.keys(ROUTE_META).length} route-specific HTML files`)

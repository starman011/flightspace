// Vercel Edge Middleware — dynamic bot rendering for flight and airport pages.
// Googlebot (and other crawlers) receive pre-rendered HTML with SEO meta + real data.
// Human visitors pass through to the Vite SPA (vercel.json rewrite → index.html).

export const config = {
  matcher: ['/', '/flight/:path*', '/airport/:path*', '/airline/:path*', '/launch/:path*', '/route/:path*', '/asteroid/:path*', '/city/:path*', '/satellite/:path*', '/flights/:path*', '/blog', '/blog/:path*', '/engineering', '/faq', '/sitemap-launches.xml', '/sitemap-blog.xml', '/iss'],
}

const BOT_RE =
  /googlebot|google-inspectiontool|googleother|applebot|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|rogerbot|embedly|quora|outbrain|pinterestbot|semrushbot|ahrefsbot|mj12bot|dotbot/i

import { AIRPORTS } from './src/components/Globe/airportData.js'
import { airlineFromCs, aircraftName } from './src/data/flightLabels.js'

const API  = 'https://api.objecttracer.com'
const SITE = 'https://www.objecttracer.com'

// Full 930-airport lookup (name, city, lat/lon, tier) for content on every page
const AIRPORT_FULL = Object.fromEntries(AIRPORTS.map(a => [a.iata, a]))
// Deterministic per-page sibling selection: each page links a DIFFERENT slice
// of the catalog (seeded by its own slug), so the internal link graph reaches
// all 930 airports / 44 airlines instead of the same 10 hubs from every page.
function seedHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }
function rotatePick(arr, seed, n) {
  if (!arr.length) return []
  const start = seed % arr.length, step = (seed % 37) + 7
  const out = [], used = new Set()
  for (let i = 0; out.length < Math.min(n, arr.length); i++) {
    const idx = (start + i * step) % arr.length
    if (!used.has(idx)) { used.add(idx); out.push(arr[idx]) }
  }
  return out
}
function airportLinksHtml(seedStr, excludeIata, n = 6) {
  const pool = AIRPORTS.filter(a => a.iata !== excludeIata)
  return rotatePick(pool, seedHash(seedStr), n)
    .map(a => `<a href="${SITE}/airport/${a.iata}">${esc(a.city)} (${a.iata})</a>`).join(' · ')
}
function airlineLinksHtml(seedStr, excludeSlug, n = 4) {
  const pool = Object.entries(AIRLINE_MAP).filter(([s]) => s !== excludeSlug)
  return rotatePick(pool, seedHash(seedStr), n)
    .map(([s, a]) => `<a href="${SITE}/airline/${s}">${esc(a.name)}</a>`).join(' · ')
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url)
  const parts = pathname.split('/').filter(Boolean)

  // Sitemaps are public XML — serve to ALL user agents (not just bots),
  // so plain fetches and Google's sitemap fetcher both receive valid XML.
  if (pathname === '/sitemap-launches.xml') {
    return renderLaunchSitemap()
  }
  if (pathname === '/sitemap-blog.xml') {
    return renderBlogSitemap()
  }

  const ua = request.headers.get('user-agent') || ''
  const isBot = BOT_RE.test(ua)
  // App-first routes: humans get the instant SPA; crawlers still get rendered
  // HTML. Everything else (including the homepage) is true SSR — same HTML for
  // everyone, SPA scripts injected, React takes over after first paint.
  if (!isBot && (pathname === '/planes' || pathname === '/flight')) return

  if (parts[0] === 'flight' && parts[1]) {
    return renderFlight(parts[1])
  }
  if (parts[0] === 'airport' && parts[1]) {
    return renderAirport(parts[1].toUpperCase())
  }
  if (parts[0] === 'airline' && parts[1]) {
    return renderAirline(parts[1].toLowerCase())
  }
  if (parts[0] === 'launch' && parts[1]) {
    return renderLaunch(parts[1].toLowerCase())
  }
  if (parts[0] === 'route' && parts[1]) {
    return renderRoute(parts[1].toUpperCase())
  }
  if (parts[0] === 'asteroid' && parts[1]) {
    return renderAsteroid(parts[1])
  }
  if (parts[0] === 'city' && parts[1]) {
    return renderCity(parts[1].toLowerCase())
  }
  if (parts[0] === 'satellite' && parts[1]) {
    return renderSatellite(parts[1].toLowerCase())
  }
  if (parts[0] === 'flights' && parts[1]) {
    const slug = parts[1].toLowerCase()
    if (REGION_INFO[slug]) return renderFlightsOver(slug)
    if (CITY_AIRPORTS[slug]) return renderCity(slug)         // canonical → /city/{slug}
    const iata = slug.toUpperCase()
    if (AIRPORT_FULL[iata]) return renderAirport(iata)       // canonical → /airport/{IATA}
    return renderFlightsOver(slug)                            // unknown → SPA fallback
  }
  if (pathname === '/flight') {
    return renderFlightNear()
  }
  if (pathname === '/planes') {
    return renderPlanes()
  }
  if (pathname === '/iss') {
    return renderISS()
  }
  if (pathname === '/faq') {
    return renderFaq()
  }
  if (pathname === '/blog') {
    return renderBlogFeed()
  }
  if (pathname === '/engineering') {
    return renderEngineeringFeed()
  }
  if (parts[0] === 'blog' && parts[1]) {
    return renderBlogPost(parts.slice(1).join('/'))
  }
  if (pathname === '/') {
    return renderHome()
  }
}

// ── Flight renderer ──────────────────────────────────────────────────────────

async function renderFlight(raw) {
  const icao24 = raw.toLowerCase().replace(/[^a-f0-9]/g, '')
  if (!icao24) return

  const [detailRes, routeRes] = await Promise.allSettled([
    fetch(`${API}/api/v1/aircraft/${icao24}`, { headers: { 'x-render': 'bot' } }),
    fetch(`${API}/api/v1/aircraft/${icao24}/route`, { headers: { 'x-render': 'bot' } }),
  ])

  let detail = null
  let route  = null
  if (detailRes.status === 'fulfilled' && detailRes.value.ok) {
    try { detail = await detailRes.value.json() } catch (_) {}
  }
  if (routeRes.status === 'fulfilled' && routeRes.value.ok) {
    try { route = await routeRes.value.json() } catch (_) {}
  }

  const callsign  = detail?.callsign      || icao24.toUpperCase()
  const reg       = detail?.registration  || ''
  const aircraft  = detail?.type_description || ''
  const operator  = detail?.operator      || ''
  const airborne  = detail?.current && !detail.current.on_ground
  const alt       = detail?.current?.altitude ? Math.round(detail.current.altitude) + ' ft' : null
  const spd       = detail?.current?.velocity  ? Math.round(detail.current.velocity)  + ' kts' : null

  const originIATA = route?.departure_iata || ''
  const originName = route?.departure_name || originIATA
  const destIATA   = route?.arrival_iata   || ''
  const destName   = route?.arrival_name   || destIATA
  const routeStr   = originName && destName ? `${originName} → ${destName}` : originName || destName || ''

  const title = routeStr
    ? `Track ${callsign} — ${routeStr} | ObjectTracer`
    : `Track ${callsign} Live Flight | ObjectTracer`

  const descParts = [`Track ${callsign} live on ObjectTracer's real-time 3D globe.`]
  if (operator)  descParts.push(`Operated by ${operator}.`)
  if (aircraft)  descParts.push(`Aircraft: ${aircraft}${reg ? ` (${reg})` : ''}.`)
  if (routeStr)  descParts.push(`Route: ${routeStr}.`)
  if (airborne)  descParts.push(`Currently airborne${alt ? ` at ${alt}` : ''}${spd ? `, ${spd}` : ''}.`)
  else if (detail) descParts.push('Currently on the ground.')
  descParts.push('ADS-B tracking with altitude, speed, and route.')
  const desc = descParts.join(' ')

  const canonical = `${SITE}/flight/${icao24}`

  const flightLd = { '@type': 'Flight', identifier: icao24, flightNumber: callsign, url: canonical }
  if (operator)   flightLd.provider          = { '@type': 'Airline', name: operator }
  if (originName) flightLd.departureAirport  = { '@type': 'Airport', name: originName, ...(originIATA ? { iataCode: originIATA } : {}) }
  if (destName)   flightLd.arrivalAirport    = { '@type': 'Airport', name: destName,   ...(destIATA   ? { iataCode: destIATA   } : {}) }
  const jsonLd = { '@context': 'https://schema.org', '@graph': [
    flightLd,
    crumbLd([['Home', `${SITE}/`], ['Live Flights', `${SITE}/flight`], [`${callsign} flight`, canonical]]),
  ] }

  const rows = [
    operator && `<tr><th>Airline</th><td>${esc(operator)}</td></tr>`,
    aircraft && `<tr><th>Aircraft</th><td>${esc(aircraft)}${reg ? ` (${esc(reg)})` : ''}</td></tr>`,
    routeStr && `<tr><th>Route</th><td>${esc(routeStr)}</td></tr>`,
    airborne && alt && `<tr><th>Altitude</th><td>${esc(alt)}</td></tr>`,
    airborne && spd && `<tr><th>Speed</th><td>${esc(spd)}</td></tr>`,
  ].filter(Boolean).join('\n')

  const status = airborne
    ? `Currently airborne${alt ? ` at ${alt}` : ''}${spd ? `, ${spd}` : ''}.`
    : detail ? 'Currently on the ground.'
    : 'Live data unavailable — aircraft may be outside ADS-B coverage.'

  return html(canonical, title, desc, jsonLd, `
    <h1>Track ${esc(callsign)} Live</h1>
    <p>${esc(status)}</p>
    ${rows ? `<table>${rows}</table>` : ''}
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>
    <p style="margin-top:32px">
      ObjectTracer provides real-time ADS-B flight tracking on an interactive 3D globe.
      Track any flight worldwide with live position, altitude, speed, and route history.
      Also tracks ships, ISS, satellites, rocket launches, asteroids, and deep-space galaxies.
    </p>`)
}

// ── Airport renderer ─────────────────────────────────────────────────────────

async function renderAirport(iata) {
  if (!iata || iata.length < 3 || iata.length > 4) return

  const [arrRes, depRes] = await Promise.allSettled([
    fetch(`${API}/api/v1/airports/${iata}/arrivals`,   { headers: { 'x-render': 'bot' } }),
    fetch(`${API}/api/v1/airports/${iata}/departures`, { headers: { 'x-render': 'bot' } }),
  ])

  let arrivals   = []
  let departures = []
  let recentArr  = []
  let recentDep  = []
  if (arrRes.status === 'fulfilled' && arrRes.value.ok) {
    try { const d = await arrRes.value.json(); arrivals = Array.isArray(d) ? d : (d.arrivals || []); recentArr = d.recentArrivals || [] } catch (_) {}
  }
  if (depRes.status === 'fulfilled' && depRes.value.ok) {
    try { const d = await depRes.value.json(); departures = Array.isArray(d) ? d : (d.departures || []); recentDep = d.recentDepartures || [] } catch (_) {}
  }

  const canonical = `${SITE}/airport/${iata}`
  const info     = AIRPORT_INFO[iata]
  const full     = AIRPORT_FULL[iata]
  const fullName = info ? info.name : (full ? `${full.name} Airport` : `${iata} Airport`)
  const cityName = info ? info.city : (full ? full.city : iata)
  const country  = info ? info.country : ''
  const apLabel  = `${cityName} ${iata} Airport`
  const where    = country ? `${cityName}, ${country}` : cityName
  // Lead with the IATA phrase users actually type ("jfk arrivals", "jfk departures")
  const title = `${iata} Arrivals & Departures — ${cityName} Airport Live Flight Status | ObjectTracer`
  const desc  = `${iata} arrivals and departures live: real-time flight status at ${fullName}, ${cityName}, tracked from ADS-B on a free 3D map. Watch every inbound and outbound flight as it moves.`

  // Varied "about" opener (rotates by IATA hash) so 930 pages aren't identical
  let h = 0; for (let i = 0; i < iata.length; i++) h = (h * 31 + iata.charCodeAt(i)) >>> 0
  const abouts = [
    `${fullName} (${iata}) sits in ${where}. ObjectTracer plots every aircraft heading to and from it on a real-time 3D globe, so you can watch ${cityName}'s skies live instead of reading a static table.`,
    `Want to know what's flying over ${cityName} right now? ${fullName} (${iata}) is one of thousands of airports ObjectTracer follows live — each inbound and outbound flight is drawn on the globe with its altitude, speed and route.`,
    `${fullName} (${iata}) serves ${where}. This page tracks its arrivals and departures in real time from open ADS-B data, then maps each flight in 3D — click any aircraft for its full route, speed and altitude.`,
    `Every plane approaching or leaving ${fullName} (${iata}) in ${where} is shown here live. ObjectTracer turns raw ADS-B signals into a moving map of ${cityName}'s air traffic, updated continuously.`,
  ]
  const about = abouts[h % abouts.length]

  const faqs = [
    [`How many flights are at ${iata} right now?`, `ObjectTracer is currently tracking ${arrivals.length} arrivals and ${departures.length} departures around ${fullName} (${iata}), updated live from ADS-B data.`],
    [`Can I track ${iata} flights live for free?`, `Yes. ObjectTracer shows live arrivals, departures and aircraft positions for ${cityName} (${iata}) on a free interactive 3D globe — no signup required.`],
    [`What is the airport code ${iata}?`, `${iata} is the IATA code for ${fullName}${where ? `, located in ${where}` : ''}.`],
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Airport', iataCode: iata, name: fullName, url: canonical,
        ...(country ? { address: { '@type': 'PostalAddress', addressLocality: cityName, addressCountry: country } } : {}),
        ...(full ? { geo: { '@type': 'GeoCoordinates', latitude: full.lat, longitude: full.lon } } : {}) },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      crumbLd([['Home', `${SITE}/`], [`${fullName} (${iata})`, canonical]]),
    ],
  }

  const flLink = (f) => {
    const cs = f.callsign || f.icao24 || ''
    const al = airlineFromCs(cs)
    const label = al ? `${al} ${esc(cs)}` : esc(cs)
    return f.icao24 ? `<a href="${SITE}/flight/${f.icao24}">${al ? esc(al) + ' ' : ''}${esc(cs)}</a>` : label
  }
  const fmtAlt = (f) => (f.alt_ft ? Math.round(f.alt_ft).toLocaleString() + ' ft' : '—')
  const aptCity = (code) => {
    if (!code) return ''
    const i = AIRPORT_INFO[code] || AIRPORT_FULL[code]
    return i ? `${i.city} (${code})` : code
  }
  const arrRow = (f) => {
    const eta = (f.eta_min != null && f.eta_min > 0) ? `in ${Math.round(f.eta_min)} min` : 'on approach'
    const from = f.origin ? esc(aptCity(f.origin)) : (esc(aircraftName(f.type)) || '—')
    return `<tr><td>${flLink(f)}</td><td>${from}</td><td>${eta}</td><td>${fmtAlt(f)}</td></tr>`
  }
  const depRow = (f) => {
    const to = f.dest ? esc(aptCity(f.dest)) : (esc(aircraftName(f.type)) || '—')
    return `<tr><td>${flLink(f)}</td><td>${to}</td><td>climbing out</td><td>${fmtAlt(f)}</td></tr>`
  }
  const arrThead = '<tr><th>Flight</th><th>From</th><th>ETA</th><th>Altitude</th></tr>'
  const depThead = '<tr><th>Flight</th><th>To</th><th>Status</th><th>Altitude</th></tr>'
  const arrRows = arrivals.slice(0, 18).map(arrRow).join('\n')
  const depRows = departures.slice(0, 18).map(depRow).join('\n')

  // Recent completed flights from OpenSky (real origin/destination + time).
  const peerCell = (p) => {
    if (!p) return '—'
    return p.length === 3 ? `<a href="${SITE}/airport/${esc(p)}">${esc(p)}</a>` : esc(p)
  }
  const recentRow = (f) => {
    const cs = f.callsign || f.icao24 || ''
    const al = airlineFromCs(cs)
    const link = f.icao24 ? `<a href="${SITE}/flight/${f.icao24}">${al ? esc(al) + ' ' : ''}${esc(cs)}</a>` : esc(cs)
    return `<tr><td>${link}</td><td>${peerCell(f.peer)}</td><td>${esc(f.time_utc || '—')} UTC</td></tr>`
  }
  const recentArrRows = recentArr.slice(0, 20).map(recentRow).join('\n')
  const recentDepRows = recentDep.slice(0, 20).map(recentRow).join('\n')

  // Aggressive interlinking: nearby airports + the region(s) this airport sits in.
  const nearbyLinks = nearbyAirports(iata)
    .map(b => `<a href="${SITE}/airport/${b.iata}">${esc(b.city || b.name)} (${b.iata})</a>`).join(' · ')
  const regionLinks = regionsForAirport(iata, country)
    .map(s => `<a href="${SITE}/flights/${s}">Flights over ${esc(REGION_INFO[s].name)}</a>`).join(' · ')
  const _citySlug = IATA_TO_CITY_SLUG[iata]
  const cityPageLink = _citySlug
    ? `<a href="${SITE}/city/${_citySlug}">All ${esc(CITY_AIRPORTS[_citySlug].name)} airports</a>`
    : ''

  return html(canonical, title, desc, jsonLd, `
    <h1>${esc(iata)} Arrivals &amp; Departures — ${esc(fullName)}</h1>
    <p>Real-time arrivals, departures and flight status for ${esc(fullName)}${info ? `, ${esc(cityName)}, ${esc(info.country)}` : ''}.
       ${arrivals.length} arrivals and ${departures.length} departures are currently tracked via ADS-B.</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>
    ${arrRows ? `<h2>Live Arrivals at ${esc(cityName)} ${esc(iata)} Airport</h2><table>${arrThead}${arrRows}</table>` : ''}
    ${depRows ? `<h2>Live Departures from ${esc(cityName)} ${esc(iata)} Airport</h2><table>${depThead}${depRows}</table>` : ''}
    ${recentArrRows ? `<h2>Recent Arrivals at ${esc(cityName)} ${esc(iata)} Airport</h2><table><tr><th>Flight</th><th>From</th><th>Arrived</th></tr>${recentArrRows}</table>` : ''}
    ${recentDepRows ? `<h2>Recent Departures from ${esc(cityName)} ${esc(iata)} Airport</h2><table><tr><th>Flight</th><th>To</th><th>Departed</th></tr>${recentDepRows}</table>` : ''}
    <h2>About ${esc(apLabel)}</h2>
    <p>${esc(about)}</p>
    <h2>${esc(iata)} — Frequently Asked Questions</h2>
    ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}
    ${cityPageLink ? `<p>${cityPageLink} — live arrivals &amp; departures across the metro.</p>` : ''}
    ${nearbyLinks ? `<h2>Airports near ${esc(cityName)}</h2><p>${nearbyLinks}.</p>` : ''}
    ${regionLinks ? `<h2>Regional flight trackers</h2><p>${regionLinks}.</p>` : ''}
    <h2>Track more on ObjectTracer</h2>
    <p>
      Other busy airports:
      ${airportLinksHtml(iata, iata)}.
      Airlines: ${airlineLinksHtml(iata, null)}.
      Or open the <a href="${SITE}/">live 3D globe</a> to watch ${esc(cityName)}'s traffic alongside the ISS, satellites and rocket launches.
    </p>`)
}

// ── Airline renderer ─────────────────────────────────────────────────────────

const AIRLINE_MAP = {
  // Americas
  'american-airlines':  { icao: 'AAL', iata: 'AA',  name: 'American Airlines' },
  'delta':              { icao: 'DAL', iata: 'DL',  name: 'Delta Air Lines' },
  'united':             { icao: 'UAL', iata: 'UA',  name: 'United Airlines' },
  'southwest':          { icao: 'SWA', iata: 'WN',  name: 'Southwest Airlines' },
  'alaska-airlines':    { icao: 'ASA', iata: 'AS',  name: 'Alaska Airlines' },
  'jetblue':            { icao: 'JBU', iata: 'B6',  name: 'JetBlue Airways' },
  'spirit':             { icao: 'NKS', iata: 'NK',  name: 'Spirit Airlines' },
  'frontier':           { icao: 'FFT', iata: 'F9',  name: 'Frontier Airlines' },
  'air-canada':         { icao: 'ACA', iata: 'AC',  name: 'Air Canada' },
  'westjet':            { icao: 'WJA', iata: 'WS',  name: 'WestJet' },
  'latam':              { icao: 'LAN', iata: 'LA',  name: 'LATAM Airlines' },
  'azul':               { icao: 'AZU', iata: 'AD',  name: 'Azul Brazilian Airlines' },
  'gol':                { icao: 'GLO', iata: 'G3',  name: 'GOL Linhas Aéreas' },
  // Europe
  'british-airways':    { icao: 'BAW', iata: 'BA',  name: 'British Airways' },
  'lufthansa':          { icao: 'DLH', iata: 'LH',  name: 'Lufthansa' },
  'air-france':         { icao: 'AFR', iata: 'AF',  name: 'Air France' },
  'klm':                { icao: 'KLM', iata: 'KL',  name: 'KLM Royal Dutch Airlines' },
  'ryanair':            { icao: 'RYR', iata: 'FR',  name: 'Ryanair' },
  'easyjet':            { icao: 'EZY', iata: 'U2',  name: 'easyJet' },
  'iberia':             { icao: 'IBE', iata: 'IB',  name: 'Iberia' },
  'swiss':              { icao: 'SWR', iata: 'LX',  name: 'Swiss International Air Lines' },
  'turkish-airlines':   { icao: 'THY', iata: 'TK',  name: 'Turkish Airlines' },
  'wizz-air':           { icao: 'WZZ', iata: 'W6',  name: 'Wizz Air' },
  'norwegian':          { icao: 'NAX', iata: 'DY',  name: 'Norwegian Air Shuttle' },
  'tap':                { icao: 'TAP', iata: 'TP',  name: 'TAP Air Portugal' },
  'finnair':            { icao: 'FIN', iata: 'AY',  name: 'Finnair' },
  // Middle East
  'emirates':           { icao: 'UAE', iata: 'EK',  name: 'Emirates' },
  'qatar-airways':      { icao: 'QTR', iata: 'QR',  name: 'Qatar Airways' },
  'etihad':             { icao: 'ETD', iata: 'EY',  name: 'Etihad Airways' },
  'flydubai':           { icao: 'FDB', iata: 'FZ',  name: 'flydubai' },
  'air-arabia':         { icao: 'ABY', iata: 'G9',  name: 'Air Arabia' },
  // Asia-Pacific
  'singapore-airlines': { icao: 'SIA', iata: 'SQ',  name: 'Singapore Airlines' },
  'cathay-pacific':     { icao: 'CPA', iata: 'CX',  name: 'Cathay Pacific' },
  'japan-airlines':     { icao: 'JAL', iata: 'JL',  name: 'Japan Airlines' },
  'ana':                { icao: 'ANA', iata: 'NH',  name: 'All Nippon Airways' },
  'korean-air':         { icao: 'KAL', iata: 'KE',  name: 'Korean Air' },
  'air-asia':           { icao: 'AXM', iata: 'AK',  name: 'AirAsia' },
  'qantas':             { icao: 'QFA', iata: 'QF',  name: 'Qantas' },
  // India
  'indigo':             { icao: 'IGO', iata: '6E',  name: 'IndiGo' },
  'air-india':          { icao: 'AIC', iata: 'AI',  name: 'Air India' },
  'spicejet':           { icao: 'SEJ', iata: 'SG',  name: 'SpiceJet' },
  'vistara':            { icao: 'VTI', iata: 'UK',  name: 'Vistara' },
  'akasa-air':          { icao: 'QAL', iata: 'QP',  name: 'Akasa Air' },
  'air-india-express':  { icao: 'IAX', iata: 'IX',  name: 'Air India Express' },
}

async function renderAirline(slug) {
  const airline = AIRLINE_MAP[slug]
  if (!airline) return // unknown airline → pass to SPA

  const canonical = `${SITE}/airline/${slug}`

  // Search for all currently tracked flights for this airline by ICAO prefix
  let flights = []
  try {
    const res = await fetch(`${API}/api/v1/aircraft/search?q=${airline.icao}&limit=50`, {
      headers: { 'x-render': 'bot' },
    })
    if (res.ok) {
      const data = await res.json()
      flights = Array.isArray(data) ? data : (data.results || data.aircraft || [])
    }
  } catch (_) {}

  const count = flights.length
  // "{airline} flight status" is the #1 query family for these pages — lead with it
  const title = `${airline.name} Flight Status & Live Tracker (${airline.iata}) | ObjectTracer`
  const desc  = `${airline.name} flight status live: track every ${airline.name} (${airline.iata}/${airline.icao}) flight in real time — position, altitude, speed and route on a free live map, straight from ADS-B.`

  const faqs = [
    [`How can I track ${airline.name} flights live?`, `Open ObjectTracer's 3D globe — every ${airline.name} (${airline.iata}) aircraft currently broadcasting ADS-B is plotted in real time with its position, altitude, speed and route. Click any flight for full details.`],
    [`What are ${airline.name}'s airline codes?`, `${airline.name} uses IATA code ${airline.iata} and ICAO code ${airline.icao}. Its flights use callsigns beginning with ${airline.icao}.`],
    [`Is ${airline.name} flight tracking free?`, `Yes — ObjectTracer tracks all ${airline.name} flights worldwide for free on an interactive 3D globe, with no signup required.`],
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Airline', name: airline.name, iataCode: airline.iata, icaoCode: airline.icao, url: canonical },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      crumbLd([['Home', `${SITE}/`], [`${airline.name} flights`, canonical]]),
    ],
  }

  const flightRows = flights.slice(0, 20).map(f => {
    const cs   = f.callsign || f.icao24 || ''
    const link = f.icao24 ? `<a href="${SITE}/flight/${f.icao24}">${esc(cs)}</a>` : esc(cs)
    const ac   = f.type_description || aircraftName(f.type) || '—'
    const alt  = f.altitude ? Math.round(f.altitude).toLocaleString() + ' ft' : '—'
    const status = f.on_ground ? 'On ground' : 'In flight'
    return `<tr><td>${link}</td><td>${esc(ac)}</td><td>${esc(alt)}</td><td>${status}</td></tr>`
  }).join('\n')

  // Airline logo via avs.io CDN (already in CSP allowlist)
  const logoHtml = `<img src="https://pics.avs.io/200/60/${esc(airline.iata)}.png" alt="${esc(airline.name)} logo" style="height:40px;object-fit:contain;margin-bottom:12px;border-radius:4px" onerror="this.style.display='none'" /><br>`

  const body = `
    ${logoHtml}
    <h1>${esc(airline.name)} Flight Status — Live Tracker (${esc(airline.iata)})</h1>
    <p>${count > 0 ? `${count} ${esc(airline.name)} aircraft currently tracked via ADS-B.` : `No ${esc(airline.name)} flights currently in ADS-B coverage. Check back during peak hours.`}</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>
    ${flightRows ? `
    <h2>Currently Tracked Flights</h2>
    <table>
      <tr><th>Flight</th><th>Aircraft</th><th>Altitude</th><th>Status</th></tr>
      ${flightRows}
    </table>` : ''}
    <p style="margin-top:32px">
      ObjectTracer tracks all ${esc(airline.name)} flights worldwide in real-time using ADS-B data.
      Click any flight to see its live position, route history, altitude, speed, and aircraft details on an interactive 3D globe.
      ${esc(airline.name)} aircraft broadcast their position on the 1090&nbsp;MHz ADS-B frequency; ObjectTracer decodes that feed and plots each ${esc(airline.icao)}-prefixed callsign on the globe as it moves.
    </p>
    <h2>How to track ${esc(airline.name)} flights</h2>
    <ol>
      <li>Open the live 3D globe and search the ${esc(airline.name)} callsign (e.g. <strong>${esc(airline.icao)}123</strong>) or flight number.</li>
      <li>Click the aircraft to open its panel — live altitude, ground speed, heading, origin and destination.</li>
      <li>Follow the full route line from departure to arrival, colour-coded by altitude.</li>
    </ol>
    <h2>Frequently asked questions</h2>
    ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}
    <p style="margin-top:32px;font-size:14px;opacity:.8">
      Track more: Airports
      ${airportLinksHtml(slug, null)}.
      Airlines: ${airlineLinksHtml(slug, slug)}.
      Or open the <a href="${SITE}/">live 3D tracker</a>.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── Provider / airline image maps ────────────────────────────────────────────

// Launch provider logos (Wikipedia Commons — stable, free)
const PROVIDER_LOGOS = {
  'SpaceX':                    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/SpaceX_logo_black.svg/400px-SpaceX_logo_black.svg.png',
  'Rocket Lab':                'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Rocket_Lab_Logo.svg/400px-Rocket_Lab_Logo.svg.png',
  'United Launch Alliance':    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/ULA_logo.svg/400px-ULA_logo.svg.png',
  'Arianespace':               'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Arianespace_logo.svg/400px-Arianespace_logo.svg.png',
  'Blue Origin':               'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Blue_Origin_logo.svg/400px-Blue_Origin_logo.svg.png',
  'ISRO':                      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Indian_Space_Research_Organisation_Logo.svg/300px-Indian_Space_Research_Organisation_Logo.svg.png',
  'China Aerospace Science and Technology Corporation': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/CASC_logo.png/200px-CASC_logo.png',
  'China Aerospace Science & Industry Corporation': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/CASC_logo.png/200px-CASC_logo.png',
  'Northrop Grumman':          'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Northrop_Grumman_Logo.svg/400px-Northrop_Grumman_Logo.svg.png',
  'Mitsubishi Heavy Industries':'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Mitsubishi_logo.svg/200px-Mitsubishi_logo.svg.png',
}

// ── Launch renderer ───────────────────────────────────────────────────────────

function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[|&]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100)
}

// Evergreen page for launches no longer in the live feed — title from the slug
// (e.g. falcon-9-block-5-starlink-group-10-43 → "Falcon 9 Block 5 Starlink Group 10 43")
function renderPastLaunch(slug) {
  if (!/^[a-z0-9-]{4,120}$/.test(slug)) return // garbage slug → SPA/404 path
  const name = slug.split('-').map(w => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
  const canonical = `${SITE}/launch/${slug}`
  const title = `${name} Launch — Mission Archive | ObjectTracer`
  const desc  = `${name}: past rocket launch tracked live on ObjectTracer. See upcoming launches with live countdowns, pad locations and mission details on the free 3D globe.`
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: `${name} Launch`, url: canonical, description: desc,
  }
  const body = `
    <h1>${esc(name)}</h1>
    <p>This mission has launched. ObjectTracer tracked it live — countdown, launch pad location and mission details — as it happened.</p>
    <p>Rocket launches appear here with live countdowns before liftoff and stay tracked through orbit. Watch the next one live:</p>
    <a class="cta" href="${SITE}/launches">See Upcoming Launches →</a>
    <h2>Keep exploring</h2>
    <p><a href="${SITE}/launches">Launch schedule &amp; countdowns</a> · <a href="${SITE}/satellite/starlink">Starlink tracker</a> · <a href="${SITE}/iss">ISS live tracker</a> · <a href="${SITE}/">Live 3D globe</a></p>`
  return html(canonical, title, desc, jsonLd, body, 'LAUNCH ARCHIVE')
}

async function renderLaunch(slug) {
  let launches = []
  try {
    const res = await fetch(`${API}/api/v1/launches`, { headers: { 'x-render': 'bot' } })
    if (res.ok) {
      const data = await res.json()
      launches = [...(data.upcoming || []), ...(data.recent || [])]
    }
  } catch (_) {}

  // Match slug against all launches
  const launch = launches.find(l => slugify(l.name) === slug)
  // Launch left the live feed (completed weeks ago) → render an evergreen
  // archive page instead of falling through to the SPA shell, whose homepage
  // canonical made Google file these URLs as duplicates.
  if (!launch) return renderPastLaunch(slug)

  const canonical = `${SITE}/launch/${slug}`
  const isPast    = launch.is_past
  const net       = launch.net ? new Date(launch.net) : null
  const dateStr   = net ? net.toUTCString().replace(' GMT', ' UTC') : 'TBD'
  const status    = launch.status || launch.status_abbr || ''
  const rocket    = launch.rocket || ''
  const provider  = launch.provider || ''
  const mission   = launch.mission_name || launch.name
  const missionDesc = launch.mission_desc || ''
  const pad       = launch.pad || ''
  const orbit     = launch.orbit || ''

  const title = isPast
    ? `${mission} Launch — ${rocket} | ObjectTracer`
    : `${mission} Live Launch Tracker — Countdown & Watch | ObjectTracer`

  const descParts = [
    isPast
      ? `Watch the ${mission} launch replay on ObjectTracer.`
      : `Track the ${mission} launch live on ObjectTracer. Real-time countdown, launch pad location, and mission details.`,
    rocket    && `Rocket: ${rocket}.`,
    provider  && `Provider: ${provider}.`,
    orbit     && `Target orbit: ${orbit}.`,
    !isPast   && net && `Launch window: ${dateStr}.`,
    pad       && `Launch pad: ${pad}.`,
  ].filter(Boolean).join(' ')

  // Launch window end: NET + 1h (most launch windows). Satisfies Event.endDate.
  const endISO = net ? new Date(net.getTime() + 60 * 60 * 1000).toISOString() : null
  const padCountry = pad && pad.includes(',') ? pad.split(',').pop().trim() : (pad || 'Earth')
  const faqs = [
    [`When does ${mission} launch?`, isPast
      ? `${mission} launched on ${dateStr}${pad ? ` from ${pad}` : ''}.`
      : `The ${mission} launch window opens ${dateStr}${pad ? ` from ${pad}` : ''}. ObjectTracer shows a live countdown to lift-off.`],
    [`What rocket is launching ${mission}?`, `${mission} ${isPast ? 'flew' : 'is set to fly'} on a ${rocket || 'launch vehicle'}${provider ? ` operated by ${provider}` : ''}${orbit ? `, targeting ${orbit}` : ''}.`],
    [`How can I ${isPast ? 'watch the replay of' : 'track'} ${mission} live?`, `Open ObjectTracer's 3D globe to see the launch pad location${isPast ? '' : ', a real-time countdown'} and the rocket's trajectory. ${isPast ? 'The mission is marked complete.' : 'Tracking begins automatically near lift-off.'}`],
  ]
  const eventLd = {
    '@type': 'Event',
    name: mission,
    url: canonical,
    description: missionDesc || descParts,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    image: [PROVIDER_LOGOS[provider] || `${SITE}/og-image.png`],
    ...(net ? { startDate: net.toISOString() } : {}),
    ...(endISO ? { endDate: endISO } : {}),
    location: {
      '@type': 'Place',
      name: pad || 'Launch Pad',
      address: { '@type': 'PostalAddress', addressCountry: padCountry, name: pad || 'Launch Pad' },
      ...(launch.pad_lat && launch.pad_lon ? {
        geo: { '@type': 'GeoCoordinates', latitude: launch.pad_lat, longitude: launch.pad_lon }
      } : {}),
    },
    performer: { '@type': 'Organization', name: provider || rocket || 'Launch Provider' },
    organizer: { '@type': 'Organization', name: provider || 'Launch Provider', url: canonical },
  }
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [eventLd, { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
  }

  // Countdown or elapsed
  const now = Date.now()
  const msUntil = net ? net.getTime() - now : null
  let countdownHtml = ''
  if (!isPast && msUntil !== null && msUntil > 0) {
    const d = Math.floor(msUntil / 86400000)
    const h = Math.floor((msUntil % 86400000) / 3600000)
    const m = Math.floor((msUntil % 3600000) / 60000)
    countdownHtml = `<p style="font-size:1.1rem;color:#b2ff1a;margin:12px 0">
      T-${d}d ${h}h ${m}m until launch
    </p>`
  } else if (isPast) {
    countdownHtml = `<p style="color:rgba(178,255,26,0.6);margin:12px 0">Launch completed · ${dateStr}</p>`
  }

  const rows = [
    rocket   && `<tr><th>Rocket</th><td>${esc(rocket)}</td></tr>`,
    provider && `<tr><th>Provider</th><td>${esc(provider)}</td></tr>`,
    orbit    && `<tr><th>Target Orbit</th><td>${esc(orbit)}</td></tr>`,
    status   && `<tr><th>Status</th><td>${esc(status)}</td></tr>`,
    net      && `<tr><th>Launch Time</th><td>${esc(dateStr)}</td></tr>`,
    pad      && `<tr><th>Launch Pad</th><td>${esc(pad)}</td></tr>`,
  ].filter(Boolean).join('\n')

  const providerLogo = PROVIDER_LOGOS[provider] || null
  const logoHtml = providerLogo
    ? `<img src="${providerLogo}" alt="${esc(provider)} logo" style="height:36px;object-fit:contain;margin-bottom:16px;filter:brightness(0) invert(1);opacity:0.85" /><br>`
    : ''

  const body = `
    ${logoHtml}
    <h1>${esc(mission)}</h1>
    ${countdownHtml}
    <a class="cta" href="${canonical}">Track Live on 3D Globe →</a>
    ${rows ? `<table style="margin-top:20px">${rows}</table>` : ''}
    ${missionDesc ? `<h2>Mission</h2><p>${esc(missionDesc)}</p>` : ''}
    <p style="margin-top:32px">
      ObjectTracer tracks every rocket launch worldwide with real-time 3D globe visualization.
      View the launch pad location, track the rocket's trajectory live, and explore mission details.
    </p>

    <h2>How to ${isPast ? 'view' : 'track'} ${esc(mission)}</h2>
    <ol>
      <li>Open the live 3D globe — the launch pad${pad ? ` (${esc(pad)})` : ''} is pinned at its real coordinates.</li>
      <li>${isPast ? 'Review the mission timeline and trajectory.' : 'Watch the live countdown to lift-off and the planned ascent path.'}</li>
      <li>Explore ${esc(provider || 'the provider')}'s other missions and the global launch schedule.</li>
    </ol>

    <h2>Frequently asked questions</h2>
    ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}

    <p style="margin-top:32px;font-size:14px;opacity:.8">
      Explore more: <a href="${SITE}/launches">all rocket launches</a> ·
      <a href="${SITE}/iss">ISS tracker</a> ·
      <a href="${SITE}/asteroids">near-Earth asteroids</a> ·
      <a href="${SITE}/">live 3D globe</a>.
    </p>`

  return html(canonical, title, descParts, jsonLd, body)
}

// ── Asteroid renderer ─────────────────────────────────────────────────────────

function asteroidSlug(name) {
  return name.replace(/[()]/g, '').trim().toLowerCase().replace(/\s+/g, '-')
}

async function renderAsteroid(slug) {
  let asteroids = []
  try {
    const res = await fetch(`${API}/api/v1/asteroids`, { headers: { 'x-render': 'bot' } })
    if (res.ok) {
      const data = await res.json()
      asteroids = Array.isArray(data) ? data : (data.asteroids || data.data || [])
    }
  } catch (_) {}

  const asteroid = asteroids.find(a => asteroidSlug(a.name) === slug)
  if (!asteroid) return

  const canonical = `${SITE}/asteroid/${slug}`
  const isPHA     = asteroid.pha
  const diamMin   = asteroid.diam_min ? (asteroid.diam_min * 1000).toFixed(1) : null
  const diamMax   = asteroid.diam_max ? (asteroid.diam_max * 1000).toFixed(1) : null
  const diamStr   = diamMin && diamMax ? `${diamMin}–${diamMax} m` : null
  const missKm    = asteroid.miss_km  ? Math.round(asteroid.miss_km).toLocaleString() : null
  const missLd    = asteroid.miss_ld  ? Number(asteroid.miss_ld).toFixed(3) : null
  const velKps    = asteroid.vel_kps  ? Number(asteroid.vel_kps).toFixed(2) : null
  const velKmh    = asteroid.vel_kps  ? Math.round(asteroid.vel_kps * 3600).toLocaleString() : null
  const approachDate = asteroid.approach_date || null

  const cleanName = asteroid.name.replace(/[()]/g, '').trim()

  const title = isPHA
    ? `${cleanName} — Potentially Hazardous Asteroid Tracker | ObjectTracer`
    : `${cleanName} — Near-Earth Asteroid Close Approach | ObjectTracer`

  const desc = [
    `Track asteroid ${cleanName} on ObjectTracer's real-time 3D globe.`,
    approachDate && `Close approach: ${approachDate}.`,
    missKm && `Miss distance: ${missKm} km (${missLd} lunar distances).`,
    velKmh && `Velocity: ${velKmh} km/h.`,
    diamStr && `Estimated diameter: ${diamStr}.`,
    isPHA ? 'Classified as a Potentially Hazardous Asteroid (PHA) by NASA.' : 'Near-Earth Object tracked by NASA NeoWs.',
  ].filter(Boolean).join(' ')

  // approachDate like "2026-Apr-23 16:31" → ISO; endDate +1h.
  const apIso = approachDate ? (() => { const d = new Date(approachDate.replace(' ', 'T') + 'Z'); return isNaN(d) ? null : d } )() : null
  const apEnd = apIso ? new Date(apIso.getTime() + 60 * 60 * 1000) : null
  const faqs = [
    [`Will asteroid ${cleanName} hit Earth?`, missKm
      ? `No. ${cleanName} passes Earth at a safe distance of about ${missKm} km — ${missLd} times the Earth–Moon distance. ${isPHA ? 'NASA lists it as a Potentially Hazardous Asteroid because of its size and orbit, but this approach poses no impact risk.' : 'NASA does not classify it as hazardous.'}`
      : `${cleanName} is a tracked near-Earth object; NASA's CNEOS monitors its orbit. ${isPHA ? 'It is flagged Potentially Hazardous by size and orbit class, not because of an imminent impact.' : 'It is not classified as hazardous.'}`],
    [`How big is asteroid ${cleanName}?`, diamStr
      ? `${cleanName} has an estimated diameter of ${diamStr}, based on its brightness as measured by NASA.`
      : `${cleanName}'s exact size is uncertain; NASA estimates it from the asteroid's brightness and distance.`],
    [`When is ${cleanName}'s closest approach to Earth?`, approachDate
      ? `${cleanName} makes its close approach on ${approachDate} UTC${velKmh ? `, travelling at about ${velKmh} km/h relative to Earth` : ''}.`
      : `ObjectTracer shows ${cleanName}'s approach geometry on the 3D globe using NASA NeoWs data.`],
  ]
  const eventLd = {
    '@type': 'Event',
    name: `${cleanName} Close Approach`,
    url: canonical,
    description: desc,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    image: [`${SITE}/og-image.png`],
    ...(apIso ? { startDate: apIso.toISOString() } : {}),
    ...(apEnd ? { endDate: apEnd.toISOString() } : {}),
    location: {
      '@type': 'Place',
      name: 'Near-Earth space',
      address: { '@type': 'PostalAddress', addressCountry: 'Earth orbit', name: 'Near-Earth space' },
    },
    performer: { '@type': 'Organization', name: 'NASA CNEOS' },
    organizer: { '@type': 'Organization', name: 'NASA Center for Near Earth Object Studies', url: 'https://cneos.jpl.nasa.gov/' },
  }
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [eventLd, { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
  }

  const rows = [
    approachDate && `<tr><th>Close Approach</th><td>${esc(approachDate)} UTC</td></tr>`,
    missKm       && `<tr><th>Miss Distance</th><td>${missKm} km <span style="opacity:.5">(${missLd} Lunar Distances)</span></td></tr>`,
    velKmh       && `<tr><th>Velocity</th><td>${velKmh} km/h <span style="opacity:.5">(${velKps} km/s)</span></td></tr>`,
    diamStr      && `<tr><th>Est. Diameter</th><td>${esc(diamStr)}</td></tr>`,
    `<tr><th>Hazardous</th><td style="color:${isPHA ? '#ff6b6b' : '#b2ff1a'}">${isPHA ? '⚠ Potentially Hazardous' : '✓ Not Hazardous'}</td></tr>`,
    `<tr><th>NASA ID</th><td style="opacity:.5">${esc(asteroid.id)}</td></tr>`,
  ].filter(Boolean).join('\n')

  const body = `
    <h1>${esc(cleanName)}</h1>
    ${isPHA ? `<p style="color:#ff6b6b;font-family:var(--font-mono);font-size:.85rem;letter-spacing:.1em;margin:0 0 16px">
      ⚠ POTENTIALLY HAZARDOUS ASTEROID
    </p>` : ''}
    <p>${esc(desc.split('.')[0])}.</p>
    <a class="cta" href="${canonical}">Track on 3D Globe →</a>

    <h2>Close Approach Data</h2>
    <table>${rows}</table>

    <h2>What is ${esc(cleanName)}?</h2>
    <p>
      ${esc(cleanName)} is a near-Earth asteroid${isPHA ? ' classified as Potentially Hazardous by NASA' : ''}.
      ${diamStr ? `It has an estimated diameter of ${esc(diamStr)}.` : ''}
      ${missKm ? `During its closest approach it will pass within ${missKm} km of Earth — ${missLd} times the distance from Earth to the Moon.` : ''}
      ObjectTracer visualises this asteroid in real-time on an interactive 3D globe using NASA NeoWs data.
    </p>
    <p style="margin-top:16px">
      Track all near-Earth asteroids including PHAs, NEOs, and close approach objects on
      <a href="${SITE}/asteroids">ObjectTracer's Asteroid Tracker</a>.
    </p>

    <h2>${isPHA ? 'What is a Potentially Hazardous Asteroid?' : 'What is a Near-Earth Object?'}</h2>
    <p>
      ${isPHA
        ? `A Potentially Hazardous Asteroid (PHA) is a near-Earth object larger than ~140 m that can pass within 0.05 AU (about 19.5 lunar distances) of Earth's orbit. The label reflects size and orbit geometry — it does not mean an impact is expected. NASA's CNEOS continuously refines each PHA's trajectory.`
        : `A Near-Earth Object (NEO) is an asteroid or comet whose orbit brings it close to Earth's. NASA tracks thousands of them via the NeoWs program, measuring miss distance in lunar distances (LD) — one LD is the average Earth–Moon distance, about 384,400 km.`}
    </p>

    <h2>Frequently asked questions</h2>
    ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}

    <p style="margin-top:32px;font-size:14px;opacity:.8">
      Explore more: <a href="${SITE}/asteroids">all near-Earth asteroids</a> ·
      <a href="${SITE}/iss">ISS tracker</a> ·
      <a href="${SITE}/launches">rocket launches</a> ·
      <a href="${SITE}/">live 3D globe</a>.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── City renderer ─────────────────────────────────────────────────────────────

const CITY_AIRPORTS = {
  'new-york':          { name: 'New York',          country: 'USA',          airports: ['JFK','LGA','EWR'] },
  'london':            { name: 'London',             country: 'UK',           airports: ['LHR','LGW'] },
  'paris':             { name: 'Paris',              country: 'France',       airports: ['CDG'] },
  'chicago':           { name: 'Chicago',            country: 'USA',          airports: ['ORD','MDW'] },
  'los-angeles':       { name: 'Los Angeles',        country: 'USA',          airports: ['LAX'] },
  'san-francisco':     { name: 'San Francisco',      country: 'USA',          airports: ['SFO','SJC','OAK'] },
  'miami':             { name: 'Miami',              country: 'USA',          airports: ['MIA','FLL'] },
  'dallas':            { name: 'Dallas',             country: 'USA',          airports: ['DFW','DAL'] },
  'houston':           { name: 'Houston',            country: 'USA',          airports: ['IAH','HOU'] },
  'washington':        { name: 'Washington DC',      country: 'USA',          airports: ['DCA','IAD','BWI'] },
  'boston':            { name: 'Boston',             country: 'USA',          airports: ['BOS'] },
  'seattle':           { name: 'Seattle',            country: 'USA',          airports: ['SEA'] },
  'dubai':             { name: 'Dubai',              country: 'UAE',          airports: ['DXB','DWC'] },
  'abu-dhabi':         { name: 'Abu Dhabi',          country: 'UAE',          airports: ['AUH'] },
  'doha':              { name: 'Doha',               country: 'Qatar',        airports: ['DOH'] },
  'delhi':             { name: 'Delhi',              country: 'India',        airports: ['DEL'] },
  'mumbai':            { name: 'Mumbai',             country: 'India',        airports: ['BOM'] },
  'bengaluru':         { name: 'Bengaluru',          country: 'India',        airports: ['BLR'] },
  'hyderabad':         { name: 'Hyderabad',          country: 'India',        airports: ['HYD'] },
  'chennai':           { name: 'Chennai',            country: 'India',        airports: ['MAA'] },
  'kolkata':           { name: 'Kolkata',            country: 'India',        airports: ['CCU'] },
  'kochi':             { name: 'Kochi',              country: 'India',        airports: ['COK'] },
  'ahmedabad':         { name: 'Ahmedabad',          country: 'India',        airports: ['AMD'] },
  'pune':              { name: 'Pune',               country: 'India',        airports: ['PNQ'] },
  'goa':               { name: 'Goa',                country: 'India',        airports: ['GOI'] },
  'jaipur':            { name: 'Jaipur',             country: 'India',        airports: ['JAI'] },
  'singapore':         { name: 'Singapore',          country: 'Singapore',    airports: ['SIN'] },
  'hong-kong':         { name: 'Hong Kong',          country: 'China',        airports: ['HKG'] },
  'tokyo':             { name: 'Tokyo',              country: 'Japan',        airports: ['NRT','HND'] },
  'seoul':             { name: 'Seoul',              country: 'South Korea',  airports: ['ICN','GMP'] },
  'beijing':           { name: 'Beijing',            country: 'China',        airports: ['PEK','PKX'] },
  'shanghai':          { name: 'Shanghai',           country: 'China',        airports: ['PVG','SHA'] },
  'bangkok':           { name: 'Bangkok',            country: 'Thailand',     airports: ['BKK','DMK'] },
  'kuala-lumpur':      { name: 'Kuala Lumpur',       country: 'Malaysia',     airports: ['KUL'] },
  'istanbul':          { name: 'Istanbul',           country: 'Turkey',       airports: ['IST','SAW'] },
  'amsterdam':         { name: 'Amsterdam',          country: 'Netherlands',  airports: ['AMS'] },
  'frankfurt':         { name: 'Frankfurt',          country: 'Germany',      airports: ['FRA'] },
  'munich':            { name: 'Munich',             country: 'Germany',      airports: ['MUC'] },
  'madrid':            { name: 'Madrid',             country: 'Spain',        airports: ['MAD'] },
  'rome':              { name: 'Rome',               country: 'Italy',        airports: ['FCO','CIA'] },
  'zurich':            { name: 'Zurich',             country: 'Switzerland',  airports: ['ZRH'] },
  'sydney':            { name: 'Sydney',             country: 'Australia',    airports: ['SYD'] },
  'toronto':           { name: 'Toronto',            country: 'Canada',       airports: ['YYZ'] },
  'johannesburg':      { name: 'Johannesburg',       country: 'South Africa', airports: ['JNB'] },
}

// IATA → city slug, so each airport page can link up to its city flight page.
const IATA_TO_CITY_SLUG = {}
for (const [slug, c] of Object.entries(CITY_AIRPORTS)) {
  for (const ia of c.airports) IATA_TO_CITY_SLUG[ia] = slug
}

async function renderCity(slug) {
  const city = CITY_AIRPORTS[slug]
  if (!city) return

  const canonical = `${SITE}/city/${slug}`
  const iataList  = city.airports

  // Fetch arrivals for the first airport to show live flights
  let flights = []
  try {
    const res = await fetch(`${API}/api/v1/airports/${iataList[0]}/arrivals`, { headers: { 'x-render': 'bot' } })
    if (res.ok) {
      const d = await res.json()
      flights = Array.isArray(d) ? d : (d.arrivals || [])
    }
  } catch (_) {}

  const title = `${city.name} Flights — All Airports, Live Arrivals & Departures | ObjectTracer`
  const desc  = `Flights to and from ${city.name}, ${city.country}: live arrivals and departures across ${iataList.join(', ')}, tracked in real time on ObjectTracer's 3D globe.`
  const cityRegion = COUNTRY_TO_REGION[city.country]
  const cityRegionLink = cityRegion ? `Regional tracker: <a href="${SITE}/flights/${cityRegion}">Flights over ${esc(REGION_INFO[cityRegion].name)}</a>.` : ''
  const otherCityLinks = Object.entries(CITY_AIRPORTS).filter(([s]) => s !== slug)
    .map(([s, c]) => `<a href="${SITE}/city/${s}">${esc(c.name)}</a>`).join(' · ')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${city.name} Live Flight Tracker`,
    url: canonical,
    description: desc,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ObjectTracer', item: SITE },
        { '@type': 'ListItem', position: 2, name: `${city.name} Flights`, item: canonical },
      ],
    },
  }

  const airportLinks = iataList.map(iata => {
    const info = AIRPORT_INFO[iata]
    const name = info ? info.name : `${iata} Airport`
    return `<li><a href="${SITE}/airport/${iata}">${esc(name)} (${iata})</a></li>`
  }).join('\n')

  const flightRows = flights.slice(0, 10).map(f => {
    const cs = f.callsign || f.icao24 || ''
    const link = f.icao24 ? `<a href="${SITE}/flight/${f.icao24}">${esc(cs)}</a>` : esc(cs)
    return `<tr><td>${link}</td><td>${esc(f.origin || f.departure_iata || '—')}</td><td>${esc(f.alt_ft ? Math.round(f.alt_ft) + ' ft' : '—')}</td></tr>`
  }).join('\n')

  const body = `
    <h1>${esc(city.name)} Live Flights</h1>
    <p>Real-time ADS-B flight tracking for all ${esc(city.name)}, ${esc(city.country)} airports on ObjectTracer's interactive 3D globe.</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>

    <h2>Airports in ${esc(city.name)}</h2>
    <ul style="padding-left:20px;line-height:2">${airportLinks}</ul>

    ${flightRows ? `
    <h2>Live Arrivals at ${esc(iataList[0])}</h2>
    <table>
      <tr><th>Flight</th><th>From</th><th>Altitude</th></tr>
      ${flightRows}
    </table>` : ''}

    ${cityRegionLink ? `<p>${cityRegionLink}</p>` : ''}

    <h2>Flights at other cities</h2>
    <p>${otherCityLinks}.</p>

    <p style="margin-top:24px">
      ObjectTracer tracks all flights arriving at and departing from ${esc(city.name)} airports in real-time.
      View aircraft positions on a 3D globe with altitude, speed, route history, and aircraft details.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── Satellite renderer ────────────────────────────────────────────────────────

const SATELLITE_INFO = {
  'iss':   { name: 'International Space Station', altKm: 408, periodMin: 92.68, speedKmh: 27600,
    desc: 'The ISS is a habitable artificial satellite in low Earth orbit, serving as a space research lab.', redirect: '/iss' },
  'hubble': { name: 'Hubble Space Telescope', altKm: 547, periodMin: 95.4, speedKmh: 27300,
    desc: 'The Hubble Space Telescope is a large space telescope launched in 1990, orbiting Earth at 547 km.' },
  'starlink': { name: 'Starlink Satellite Constellation', altKm: 550, periodMin: 95.5, speedKmh: 27000,
    desc: 'Starlink is a satellite internet constellation operated by SpaceX providing broadband coverage.' },
  'tiangong': { name: 'Tiangong Space Station', altKm: 390, periodMin: 92, speedKmh: 27600,
    desc: 'Tiangong is China\'s modular space station in low Earth orbit, housing Chinese taikonauts.' },
  'james-webb-space-telescope': { name: 'James Webb Space Telescope', altKm: 1500000, periodMin: null, speedKmh: null,
    desc: 'The JWST orbits the Sun at the L2 Lagrange point, 1.5 million km from Earth.' },
}

async function renderSatellite(slug) {
  if (slug === 'iss') return renderISS()

  const sat = SATELLITE_INFO[slug]
  if (!sat) return

  const canonical = `${SITE}/satellite/${slug}`
  // Lead with the short query phrase ("starlink tracker"), full name after the dash
  const shortName = slug.length <= 4 ? slug.toUpperCase() : slug.charAt(0).toUpperCase() + slug.slice(1)
  const title = `${shortName} Tracker — ${sat.name} Live Position & Map | ObjectTracer`
  const desc  = `${sat.desc} Track ${sat.name} live on ObjectTracer's interactive 3D globe.${sat.altKm ? ` Orbits at ~${sat.altKm} km altitude.` : ''}`

  const faqs = [
    [`How can I track ${sat.name} live?`, `Open ObjectTracer's 3D globe — ${sat.name} is plotted at its real-time orbital position, and you can follow its ground track as it circles Earth. No signup required.`],
    sat.altKm
      ? [`How high does ${sat.name} orbit?`, `${sat.name} orbits at roughly ${sat.altKm.toLocaleString()} km altitude${sat.periodMin ? `, completing one orbit about every ${sat.periodMin} minutes` : ''}.`]
      : [`What is ${sat.name}?`, `${sat.desc} ObjectTracer plots its live orbital position on an interactive 3D globe.`],
    sat.speedKmh
      ? [`How fast does ${sat.name} travel?`, `${sat.name} moves at about ${sat.speedKmh.toLocaleString()} km/h relative to the ground — fast enough to cross a continent in minutes.`]
      : [`Is ${sat.name} tracking free?`, `Yes — ObjectTracer tracks ${sat.name} and other satellites live and free on a 3D globe.`],
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: `${sat.name} Live Tracker`, url: canonical, description: desc },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  }

  const rows = [
    sat.altKm && `<tr><th>Altitude</th><td>~${sat.altKm.toLocaleString()} km</td></tr>`,
    sat.periodMin && `<tr><th>Orbital Period</th><td>${sat.periodMin} minutes</td></tr>`,
    sat.speedKmh && `<tr><th>Speed</th><td>${sat.speedKmh.toLocaleString()} km/h</td></tr>`,
  ].filter(Boolean).join('\n')

  const body = `
    <h1>${esc(sat.name)} Live Tracker</h1>
    <p>${esc(sat.desc)}</p>
    <a class="cta" href="${canonical}">Track Live on 3D Globe →</a>
    ${rows ? `<h2>Orbital Data</h2><table>${rows}</table>` : ''}
    <p style="margin-top:24px">
      Track ${esc(sat.name)} in real-time on ObjectTracer's interactive 3D globe with live orbital position and trajectory.
    </p>

    <h2>How to track ${esc(sat.name)}</h2>
    <ol>
      <li>Open the live 3D globe — ${esc(sat.name)} appears at its current orbital position.</li>
      <li>Follow its ground track as it sweeps across Earth in real time.</li>
      <li>Compare its orbit with the ISS and other satellites on the same globe.</li>
    </ol>

    <h2>Frequently asked questions</h2>
    ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}

    <p style="margin-top:32px;font-size:14px;opacity:.8">
      Also track the <a href="${SITE}/iss">International Space Station (ISS)</a> ·
      <a href="${SITE}/launches">rocket launches</a> ·
      <a href="${SITE}/asteroids">near-Earth asteroids</a> ·
      <a href="${SITE}/">live 3D globe</a>.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── Flights-over-country renderer ─────────────────────────────────────────────

const REGION_INFO = {
  'india':        { name: 'India',          desc: 'one of the world\'s fastest-growing aviation markets', airports: ['DEL','BOM','BLR','MAA','HYD','CCU'] },
  'usa':          { name: 'United States',  desc: 'the world\'s largest aviation market', airports: ['JFK','LAX','ORD','ATL','DFW'] },
  'europe':       { name: 'Europe',         desc: 'home to some of the world\'s busiest airports', airports: ['LHR','CDG','AMS','FRA','MAD'] },
  'middle-east':  { name: 'Middle East',    desc: 'a major global aviation hub', airports: ['DXB','DOH','AUH','RUH'] },
  'asia':         { name: 'Asia',           desc: 'the world\'s fastest-growing aviation region', airports: ['SIN','HKG','NRT','ICN','BKK'] },
  'australia':    { name: 'Australia',      desc: 'a key aviation hub for the Asia-Pacific region', airports: ['SYD','MEL'] },
  'uk':           { name: 'United Kingdom', desc: 'a major European aviation hub', airports: ['LHR','LGW','MAN'] },
  'canada':       { name: 'Canada',         desc: 'a key North American aviation market', airports: ['YYZ','YVR','YUL'] },
  'uae':          { name: 'United Arab Emirates', desc: 'home to Dubai — one of the world\'s top transit hubs', airports: ['DXB','AUH'] },
  'singapore':    { name: 'Singapore',      desc: 'home to Changi Airport, consistently voted the world\'s best', airports: ['SIN'] },
}

// ── Interlinking maps: connect every airport page to its region + neighbours ──
const IATA_TO_REGIONS = {}
for (const [slug, r] of Object.entries(REGION_INFO)) {
  for (const ia of r.airports) (IATA_TO_REGIONS[ia] ||= []).push(slug)
}
const COUNTRY_TO_REGION = {
  'India': 'india', 'United States': 'usa', 'United Kingdom': 'uk',
  'United Arab Emirates': 'uae', 'Canada': 'canada', 'Australia': 'australia',
  'Singapore': 'singapore',
}
function regionsForAirport(iata, country) {
  const set = new Set(IATA_TO_REGIONS[iata] || [])
  if (country && COUNTRY_TO_REGION[country]) set.add(COUNTRY_TO_REGION[country])
  return [...set]
}
// Nearest airports by great-circle distance (within ~1500 km = same metro/region).
function nearbyAirports(iata, n = 6) {
  const a = AIRPORT_FULL[iata]
  if (!a) return []
  const toR = Math.PI / 180
  return Object.values(AIRPORT_FULL)
    .filter(b => b.iata !== iata && b.lat != null)
    .map(b => {
      const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2
      return { iata: b.iata, city: b.city, name: b.name, d: 2 * 6371 * Math.asin(Math.sqrt(s)) }
    })
    .filter(b => b.d < 1500)
    .sort((x, y) => x.d - y.d)
    .slice(0, n)
}

async function renderFlightsOver(slug) {
  const region = REGION_INFO[slug]
  if (!region) return

  const canonical = `${SITE}/flights/${slug}`
  const title = `Live Flights Over ${region.name} — Real-Time ADS-B Tracker | ObjectTracer`
  const desc  = `Track all live flights over ${region.name} in real-time on ObjectTracer's 3D globe. ${region.name} is ${region.desc}. Real-time ADS-B tracking with position, altitude, speed, and route.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Live Flights Over ${region.name}`,
    url: canonical,
    description: desc,
  }

  const airportLinks = region.airports.map(iata => {
    const info = AIRPORT_INFO[iata]
    return `<li><a href="${SITE}/airport/${iata}">${esc(info ? info.name : iata)} (${iata})</a></li>`
  }).join('\n')

  const body = `
    <h1>Live Flights Over ${esc(region.name)}</h1>
    <p>Track all aircraft currently flying over ${esc(region.name)} in real-time on ObjectTracer's interactive 3D globe.</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>

    <h2>Major Airports in ${esc(region.name)}</h2>
    <ul style="padding-left:20px;line-height:2">${airportLinks}</ul>

    <h2>Flights over other regions</h2>
    <p>${Object.entries(REGION_INFO).filter(([s]) => s !== slug)
        .map(([s, r]) => `<a href="${SITE}/flights/${s}">${esc(r.name)}</a>`).join(' · ')}.</p>
    <p>Or find your nearest airport on the <a href="${SITE}/flight">live flight board</a>.</p>

    <p style="margin-top:24px">
      ObjectTracer uses real-time ADS-B data to track every aircraft flying over ${esc(region.name)}.
      View live positions, altitudes, speeds, and flight routes on an interactive 3D globe.
      ${region.name} is ${esc(region.desc)}.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── Route renderer ────────────────────────────────────────────────────────────

const AIRPORT_INFO = {
  // India
  DEL:{name:'Indira Gandhi International Airport',city:'Delhi',country:'India'},
  BOM:{name:'Chhatrapati Shivaji Maharaj International Airport',city:'Mumbai',country:'India'},
  BLR:{name:'Kempegowda International Airport',city:'Bengaluru',country:'India'},
  MAA:{name:'Chennai International Airport',city:'Chennai',country:'India'},
  HYD:{name:'Rajiv Gandhi International Airport',city:'Hyderabad',country:'India'},
  CCU:{name:'Netaji Subhas Chandra Bose International Airport',city:'Kolkata',country:'India'},
  COK:{name:'Cochin International Airport',city:'Kochi',country:'India'},
  PNQ:{name:'Pune Airport',city:'Pune',country:'India'},
  AMD:{name:'Sardar Vallabhbhai Patel International Airport',city:'Ahmedabad',country:'India'},
  GOI:{name:'Goa International Airport',city:'Goa',country:'India'},
  TRV:{name:'Trivandrum International Airport',city:'Thiruvananthapuram',country:'India'},
  JAI:{name:'Jaipur International Airport',city:'Jaipur',country:'India'},
  IXC:{name:'Shaheed Bhagat Singh International Airport',city:'Chandigarh',country:'India'},
  ATQ:{name:'Sri Guru Ram Dass Jee International Airport',city:'Amritsar',country:'India'},
  LKO:{name:'Chaudhary Charan Singh International Airport',city:'Lucknow',country:'India'},
  PAT:{name:'Lok Nayak Jayaprakash Airport',city:'Patna',country:'India'},
  SXR:{name:'Sheikh ul-Alam International Airport',city:'Srinagar',country:'India'},
  IXL:{name:'Kushok Bakula Rimpochee Airport',city:'Leh',country:'India'},
  NAG:{name:'Dr. Babasaheb Ambedkar International Airport',city:'Nagpur',country:'India'},
  VTZ:{name:'Visakhapatnam Airport',city:'Visakhapatnam',country:'India'},
  CJB:{name:'Coimbatore International Airport',city:'Coimbatore',country:'India'},
  IXM:{name:'Madurai Airport',city:'Madurai',country:'India'},
  GAU:{name:'Lokpriya Gopinath Bordoloi International Airport',city:'Guwahati',country:'India'},
  IXB:{name:'Bagdogra Airport',city:'Bagdogra',country:'India'},
  BBI:{name:'Biju Patnaik International Airport',city:'Bhubaneswar',country:'India'},
  RPR:{name:'Swami Vivekananda Airport',city:'Raipur',country:'India'},
  IXR:{name:'Birsa Munda Airport',city:'Ranchi',country:'India'},
  // USA
  JFK:{name:'John F. Kennedy International Airport',city:'New York',country:'USA'},
  LAX:{name:'Los Angeles International Airport',city:'Los Angeles',country:'USA'},
  ORD:{name:"Chicago O'Hare International Airport",city:'Chicago',country:'USA'},
  ATL:{name:'Hartsfield-Jackson Atlanta International Airport',city:'Atlanta',country:'USA'},
  DFW:{name:'Dallas/Fort Worth International Airport',city:'Dallas',country:'USA'},
  DEN:{name:'Denver International Airport',city:'Denver',country:'USA'},
  SFO:{name:'San Francisco International Airport',city:'San Francisco',country:'USA'},
  SEA:{name:'Seattle-Tacoma International Airport',city:'Seattle',country:'USA'},
  MIA:{name:'Miami International Airport',city:'Miami',country:'USA'},
  BOS:{name:'Boston Logan International Airport',city:'Boston',country:'USA'},
  LAS:{name:'Harry Reid International Airport',city:'Las Vegas',country:'USA'},
  MCO:{name:'Orlando International Airport',city:'Orlando',country:'USA'},
  EWR:{name:'Newark Liberty International Airport',city:'New York',country:'USA'},
  CLT:{name:'Charlotte Douglas International Airport',city:'Charlotte',country:'USA'},
  PHX:{name:'Phoenix Sky Harbor International Airport',city:'Phoenix',country:'USA'},
  IAH:{name:'George Bush Intercontinental Airport',city:'Houston',country:'USA'},
  MSP:{name:'Minneapolis-Saint Paul International Airport',city:'Minneapolis',country:'USA'},
  DTW:{name:'Detroit Metropolitan Airport',city:'Detroit',country:'USA'},
  PHL:{name:'Philadelphia International Airport',city:'Philadelphia',country:'USA'},
  LGA:{name:'LaGuardia Airport',city:'New York',country:'USA'},
  // Europe
  LHR:{name:'London Heathrow Airport',city:'London',country:'UK'},
  LGW:{name:'London Gatwick Airport',city:'London',country:'UK'},
  CDG:{name:'Charles de Gaulle Airport',city:'Paris',country:'France'},
  AMS:{name:'Amsterdam Schiphol Airport',city:'Amsterdam',country:'Netherlands'},
  FRA:{name:'Frankfurt Airport',city:'Frankfurt',country:'Germany'},
  MUC:{name:'Munich Airport',city:'Munich',country:'Germany'},
  MAD:{name:'Adolfo Suárez Madrid–Barajas Airport',city:'Madrid',country:'Spain'},
  BCN:{name:'Barcelona–El Prat Airport',city:'Barcelona',country:'Spain'},
  FCO:{name:'Leonardo da Vinci International Airport',city:'Rome',country:'Italy'},
  IST:{name:'Istanbul Airport',city:'Istanbul',country:'Turkey'},
  ZRH:{name:'Zurich Airport',city:'Zurich',country:'Switzerland'},
  VIE:{name:'Vienna International Airport',city:'Vienna',country:'Austria'},
  DUB:{name:'Dublin Airport',city:'Dublin',country:'Ireland'},
  CPH:{name:'Copenhagen Airport',city:'Copenhagen',country:'Denmark'},
  // Middle East
  DXB:{name:'Dubai International Airport',city:'Dubai',country:'UAE'},
  AUH:{name:'Abu Dhabi International Airport',city:'Abu Dhabi',country:'UAE'},
  DOH:{name:'Hamad International Airport',city:'Doha',country:'Qatar'},
  RUH:{name:'King Khalid International Airport',city:'Riyadh',country:'Saudi Arabia'},
  // Asia-Pacific
  SIN:{name:'Singapore Changi Airport',city:'Singapore',country:'Singapore'},
  HKG:{name:'Hong Kong International Airport',city:'Hong Kong',country:'China'},
  NRT:{name:'Narita International Airport',city:'Tokyo',country:'Japan'},
  HND:{name:'Tokyo Haneda Airport',city:'Tokyo',country:'Japan'},
  ICN:{name:'Incheon International Airport',city:'Seoul',country:'South Korea'},
  PVG:{name:'Shanghai Pudong International Airport',city:'Shanghai',country:'China'},
  PEK:{name:'Beijing Capital International Airport',city:'Beijing',country:'China'},
  KUL:{name:'Kuala Lumpur International Airport',city:'Kuala Lumpur',country:'Malaysia'},
  BKK:{name:'Suvarnabhumi Airport',city:'Bangkok',country:'Thailand'},
  CGK:{name:'Soekarno-Hatta International Airport',city:'Jakarta',country:'Indonesia'},
  SYD:{name:'Sydney Kingsford Smith Airport',city:'Sydney',country:'Australia'},
  MEL:{name:'Melbourne Airport',city:'Melbourne',country:'Australia'},
  // Canada
  YYZ:{name:'Toronto Pearson International Airport',city:'Toronto',country:'Canada'},
  YVR:{name:'Vancouver International Airport',city:'Vancouver',country:'Canada'},
  YUL:{name:'Montréal-Pierre Elliott Trudeau International Airport',city:'Montreal',country:'Canada'},
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

// Airport coordinates for distance calc
const AIRPORT_COORDS = {
  DEL:[28.57,77.10],BOM:[19.09,72.87],BLR:[13.20,77.71],MAA:[12.99,80.17],HYD:[17.23,78.43],
  CCU:[22.65,88.45],COK:[10.15,76.39],PNQ:[18.58,73.91],AMD:[23.07,72.63],GOI:[15.38,73.83],
  TRV:[8.48,76.92],JAI:[26.82,75.81],IXC:[30.67,76.79],ATQ:[31.71,74.80],LKO:[26.76,80.89],
  PAT:[25.59,85.09],SXR:[33.99,74.77],IXL:[34.14,77.55],NAG:[21.09,79.05],VTZ:[17.72,83.22],
  JFK:[40.64,-73.78],LAX:[33.94,-118.41],ORD:[41.98,-87.90],ATL:[33.64,-84.43],DFW:[32.90,-97.04],
  DEN:[39.86,-104.67],SFO:[37.62,-122.38],SEA:[47.45,-122.31],MIA:[25.79,-80.29],BOS:[42.36,-71.01],
  LAS:[36.08,-115.15],MCO:[28.43,-81.31],EWR:[40.69,-74.17],CLT:[35.21,-80.94],PHX:[33.43,-112.01],
  IAH:[29.98,-95.34],MSP:[44.88,-93.22],DTW:[42.21,-83.35],PHL:[39.87,-75.24],LGA:[40.78,-73.87],
  LHR:[51.47,-0.46],LGW:[51.15,-0.19],CDG:[49.01,2.55],AMS:[52.31,4.76],FRA:[50.03,8.57],
  MUC:[48.35,11.79],MAD:[40.47,-3.56],BCN:[41.30,2.08],FCO:[41.80,12.24],IST:[41.28,28.75],
  ZRH:[47.46,8.55],VIE:[48.11,16.57],DUB:[53.42,-6.27],CPH:[55.62,12.66],
  DXB:[25.25,55.36],AUH:[24.43,54.65],DOH:[25.27,51.61],RUH:[24.96,46.70],
  SIN:[1.35,103.99],HKG:[22.31,113.92],NRT:[35.76,140.39],HND:[35.55,139.78],
  ICN:[37.47,126.45],PVG:[31.14,121.81],PEK:[40.08,116.59],KUL:[2.74,101.71],
  BKK:[13.68,100.75],CGK:[-6.13,106.66],SYD:[-33.95,151.18],MEL:[-37.67,144.84],
  YYZ:[43.68,-79.63],YVR:[49.19,-123.18],YUL:[45.47,-73.74],
}

async function renderRoute(slug) {
  // Parse "JFK-LAX" → origin=JFK, dest=LAX
  const parts = slug.split('-')
  if (parts.length < 2) return
  const origin = parts[0].toUpperCase()
  const dest   = parts[parts.length - 1].toUpperCase()
  if (origin.length !== 3 || dest.length !== 3 || origin === dest) return

  const originInfo = AIRPORT_INFO[origin]
  const destInfo   = AIRPORT_INFO[dest]
  if (!originInfo || !destInfo) return

  const canonical  = `${SITE}/route/${origin.toLowerCase()}-${dest.toLowerCase()}`
  const oc = AIRPORT_COORDS[origin]
  const dc = AIRPORT_COORDS[dest]
  const distKm = oc && dc ? haversineKm(oc[0], oc[1], dc[0], dc[1]) : null
  const distMi = distKm ? Math.round(distKm * 0.621) : null
  const flightHr = distKm ? (distKm / 850).toFixed(1) : null

  const title = `${originInfo.city} to ${destInfo.city} Flights — Live Tracker | ObjectTracer`
  const desc  = `Track live flights from ${originInfo.city} (${origin}) to ${destInfo.city} (${dest}) on ObjectTracer's real-time 3D globe.${distKm ? ` ${distKm.toLocaleString()} km route, ~${flightHr}h flight.` : ''} Real-time ADS-B tracking with position, altitude, and speed.`

  const faqs = [
    distKm
      ? [`How long is the flight from ${originInfo.city} to ${destInfo.city}?`, `The ${origin}–${dest} route covers about ${distKm.toLocaleString()} km (${distMi.toLocaleString()} mi), a flight of roughly ${flightHr} hours non-stop depending on aircraft type and winds.`]
      : [`How far is ${originInfo.city} from ${destInfo.city}?`, `ObjectTracer plots the great-circle path between ${originInfo.name} (${origin}) and ${destInfo.name} (${dest}) so you can see the distance and route on the 3D globe.`],
    [`How can I track ${originInfo.city} to ${destInfo.city} flights live?`, `Open ObjectTracer's 3D globe — every aircraft flying the ${origin}–${dest} route that is broadcasting ADS-B is shown live with its position, altitude and speed. Click any flight for full details.`],
    [`Which airports serve the ${originInfo.city}–${destInfo.city} route?`, `Flights depart from ${originInfo.name} (${origin}) in ${originInfo.city}, ${originInfo.country} and arrive at ${destInfo.name} (${dest}) in ${destInfo.city}, ${destInfo.country}.`],
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: `${originInfo.city} to ${destInfo.city} Flights`,
        url: canonical,
        description: desc,
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'ObjectTracer', item: SITE },
            { '@type': 'ListItem', position: 2, name: `${originInfo.city} Airport`, item: `${SITE}/airport/${origin}` },
            { '@type': 'ListItem', position: 3, name: `${originInfo.city} to ${destInfo.city}`, item: canonical },
          ],
        },
      },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  }

  const body = `
    <h1>${esc(originInfo.city)} → ${esc(destInfo.city)} Live Flight Tracker</h1>
    <p>Track all ${esc(origin)} to ${esc(dest)} flights live on ObjectTracer's real-time 3D globe with ADS-B data.</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>

    <h2>Route Info</h2>
    <table>
      <tr><th>Origin</th><td><a href="${SITE}/airport/${origin}">${esc(originInfo.name)}</a><br><span style="font-size:.8rem;opacity:.6">${esc(originInfo.city)}, ${esc(originInfo.country)} (${origin})</span></td></tr>
      <tr><th>Destination</th><td><a href="${SITE}/airport/${dest}">${esc(destInfo.name)}</a><br><span style="font-size:.8rem;opacity:.6">${esc(destInfo.city)}, ${esc(destInfo.country)} (${dest})</span></td></tr>
      ${distKm ? `<tr><th>Distance</th><td>${distKm.toLocaleString()} km (${distMi.toLocaleString()} mi)</td></tr>` : ''}
      ${flightHr ? `<tr><th>Flight time</th><td>~${flightHr} hours</td></tr>` : ''}
    </table>

    <p style="margin-top:24px">
      ObjectTracer tracks all ${esc(origin)}–${esc(dest)} flights live using ADS-B data.
      Click any aircraft on the globe to see its callsign, altitude, speed, aircraft type, and route history.
    </p>
    <p>
      Also track departures from <a href="${SITE}/airport/${origin}">${esc(originInfo.city)} Airport (${origin})</a>
      and arrivals at <a href="${SITE}/airport/${dest}">${esc(destInfo.city)} Airport (${dest})</a>.
    </p>

    <h2>How to track the ${esc(originInfo.city)} → ${esc(destInfo.city)} route</h2>
    <ol>
      <li>Open the live 3D globe — the great-circle path between ${esc(origin)} and ${esc(dest)} is drawn from departure to arrival.</li>
      <li>Any aircraft currently flying the route appears on the line with live altitude, speed and heading.</li>
      <li>Click a flight to open its panel — callsign, aircraft type, origin, destination and route history.</li>
    </ol>

    <h2>Frequently asked questions</h2>
    ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}

    <p style="margin-top:32px;font-size:14px;opacity:.8">
      Track more: Airports
      ${airportLinksHtml(`${origin}-${dest}`, origin)}.
      Airlines: ${airlineLinksHtml(`${origin}-${dest}`, null)}.
      Or open the <a href="${SITE}/">live 3D tracker</a>.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── Homepage renderer (bots only) ─────────────────────────────────────────────
// Rich, link-dense HTML so Google can build SITELINKS (the sub-links under the
// main result). Sitelinks are algorithmic — they need a clear section structure
// + strong internal links + brand authority. This provides the structure.
function renderFlightNear() {
  const canonical = `${SITE}/flight`
  const title = 'Flights Near You — Live Arrivals & Departures by Airport | ObjectTracer'
  const desc  = 'See live flights arriving at and departing from your nearest airport in real time on a 3D globe. Share your location or search any city, airport, or flight.'

  const airports = [
    ['JFK', 'New York'], ['LAX', 'Los Angeles'], ['LHR', 'London Heathrow'], ['DXB', 'Dubai'],
    ['DEL', 'Delhi'], ['BOM', 'Mumbai'], ['ATL', 'Atlanta'], ['SIN', 'Singapore'], ['CDG', 'Paris'], ['HND', 'Tokyo'],
  ]
  const routes = [
    ['del-bom', 'Delhi → Mumbai'], ['jfk-lax', 'New York → Los Angeles'], ['dxb-lhr', 'Dubai → London'],
    ['bom-lhr', 'Mumbai → London'], ['atl-mia', 'Atlanta → Miami'],
  ]
  const airlines = [
    ['indigo', 'IndiGo'], ['emirates', 'Emirates'], ['air-india', 'Air India'],
    ['american-airlines', 'American Airlines'], ['singapore-airlines', 'Singapore Airlines'],
  ]
  const airportLinks = airports.map(([i, c]) => `<li><a href="${SITE}/airport/${i}">${esc(c)} (${i}) — live arrivals &amp; departures</a></li>`).join('\n')
  const routeLinks   = routes.map(([s, n]) => `<li><a href="${SITE}/route/${s}">${esc(n)}</a></li>`).join('\n')
  const airlineLinks = airlines.map(([s, n]) => `<li><a href="${SITE}/airline/${s}">${esc(n)} flight tracker</a></li>`).join('\n')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: canonical,
    description: desc,
    isPartOf: { '@type': 'WebSite', name: 'ObjectTracer', url: `${SITE}/` },
  }

  const body = `
  <h1>Flights near you</h1>
  <p>${esc(desc)}</p>
  <p>Open ObjectTracer, share your location or search a city, and watch every aircraft arriving at and departing from your nearest airport — live from ADS-B. Tap any flight to track it on the interactive 3D globe.</p>
  <h2>Live airport boards</h2>
  <ul>${airportLinks}</ul>
  <h2>Popular routes</h2>
  <ul>${routeLinks}</ul>
  <h2>Airlines</h2>
  <ul>${airlineLinks}</ul>
  <p><a href="${SITE}/about">About</a> · <a href="${SITE}/faq">FAQ</a> · <a href="${SITE}/contact">Contact</a> · <a href="${SITE}/">Home</a></p>
  `
  return html(canonical, title, desc, jsonLd, body, 'FLIGHTS NEAR YOU')
}

function renderPlanes() {
  const canonical = `${SITE}/planes`
  const title = 'Live Fleet Tracker — Flights by Airline & Aircraft Type | ObjectTracer'
  const desc  = 'See how many aircraft each airline or aircraft type has airborne worldwide right now, and track any of them live on a 3D globe.'

  const airlines = [
    ['emirates', 'Emirates'], ['qatar-airways', 'Qatar Airways'], ['british-airways', 'British Airways'],
    ['lufthansa', 'Lufthansa'], ['american-airlines', 'American Airlines'], ['united', 'United'],
    ['delta', 'Delta'], ['air-france', 'Air France'], ['indigo', 'IndiGo'], ['air-india', 'Air India'],
    ['singapore-airlines', 'Singapore Airlines'], ['ryanair', 'Ryanair'],
  ]
  const airlineLinks = airlines.map(([s, n]) => `<li><a href="${SITE}/airline/${s}">${esc(n)} fleet — live flights</a></li>`).join('\n')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: canonical,
    description: desc,
    isPartOf: { '@type': 'WebSite', name: 'ObjectTracer', url: `${SITE}/` },
  }

  const body = `
  <h1>Live fleet tracker</h1>
  <p>${esc(desc)}</p>
  <p>Open ObjectTracer's fleet board, pick an airline or an aircraft type, and see every one of them airborne now — then tap any flight to follow it on the interactive 3D globe.</p>
  <h2>Track an airline fleet</h2>
  <ul>${airlineLinks}</ul>
  <p>Or find flights at your nearest airport on the <a href="${SITE}/flight">live flight board</a>.</p>
  `
  return html(canonical, title, desc, jsonLd, body, 'LIVE FLEETS')
}

function renderHome() {
  const canonical = `${SITE}/`
  const title = 'ObjectTracer — Live Flight Tracker, ISS, Satellites & Deep Space on a 3D Globe'
  const desc  = 'Track live flights, ships, the ISS, satellites, rocket launches, asteroids, and deep-space galaxies on a real-time interactive 3D globe. Free, no signup.'

  // Primary sections — the sitelink candidates Google chooses from
  const sections = [
    ['/iss',        'ISS Live Tracker',        'Track the International Space Station live with 4K NASA stream and crew'],
    ['/launches',   'Rocket Launch Tracker',   'Live countdowns and mission details for upcoming rocket launches'],
    ['/asteroids',  'Asteroid Tracker',        'Near-Earth asteroids and close approaches from NASA NeoWs data'],
    ['/solar-system','Solar System',           'Real-time planet positions in an interactive 3D solar system'],
    ['/deep-space', 'Deep Space',              'Explore the DESI galaxy catalog and the cosmic web'],
    ['/moon',       'Moon Tracker',            'Lunar surface and orbital visualization'],
    ['/about',      'About ObjectTracer',      'What ObjectTracer is and how it works'],
    ['/faq',        'FAQ',                     'Frequently asked questions about live tracking'],
    ['/contact',    'Contact',                 'Get in touch with the ObjectTracer team'],
  ]

  const popularAirlines = ['american-airlines','delta','united','emirates','british-airways','lufthansa','indigo','air-india','qatar-airways','singapore-airlines']
  const popularAirports = ['JFK','LAX','LHR','DXB','SIN','DEL','BOM','CDG','FRA','HKG']

  const sectionCards = sections.map(([href, name, blurb]) =>
    `<li><a href="${SITE}${href}"><strong>${esc(name)}</strong><span>${esc(blurb)}</span></a></li>`
  ).join('\n')

  const airlineLinks = popularAirlines.map(s =>
    `<a href="${SITE}/airline/${s}">${esc(s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</a>`
  ).join(' · ')

  const airportLinks = popularAirports.map(i =>
    `<a href="${SITE}/airport/${i}">${i}</a>`
  ).join(' · ')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#org`,
        name: 'ObjectTracer',
        url: canonical,
        logo: `${SITE}/favicon.svg`,
        description: desc,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        name: 'ObjectTracer',
        url: canonical,
        publisher: { '@id': `${SITE}/#org` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE}/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'SiteNavigationElement',
        name: sections.map(s => s[1]),
        url: sections.map(s => `${SITE}${s[0]}`),
      },
    ],
  }

  const body = `
    <h1>ObjectTracer — Live Flight &amp; Space Tracker</h1>
    <p>Track everything moving above you on one real-time 3D globe: live flights (ADS-B),
       ships (AIS), the ISS, satellites, rocket launches, near-Earth asteroids, and
       deep-space galaxies. Free, no signup, runs in your browser.</p>
    <a class="cta" href="${canonical}">Open the Live 3D Globe →</a>

    <h2>What is ObjectTracer?</h2>
    <p>ObjectTracer is a free, real-time 3D globe that tracks everything moving above you in
       one place — no signup, running entirely in your browser. It plots live aircraft from
       open ADS-B receivers worldwide, ships broadcasting over AIS, the International Space
       Station with its live NASA video feed and current crew, satellites propagated from
       published orbital elements, upcoming rocket launches with countdowns, near-Earth
       asteroids from NASA data, and a catalog of hundreds of thousands of real galaxies.
       Positions refresh every few seconds and the globe interpolates motion between updates,
       so objects glide instead of jumping. The view scales continuously from street level out
       through the Moon, the solar system, and deep space. It is genuine WebGL 3D geometry,
       built with Three.js — not a flat map image — which is why it tilts, orbits, and zooms
       without snapping between fixed levels.</p>

    <h2>Explore ObjectTracer</h2>
    <ul class="cards">
      ${sectionCards}
    </ul>

    <h2>Popular Airlines</h2>
    <p class="links">${airlineLinks}</p>

    <h2>Popular Airports</h2>
    <p class="links">${airportLinks}</p>

    <p style="margin-top:32px">
      ObjectTracer is a real-time 3D globe for tracking flights, ships, the ISS,
      satellites, rocket launches, asteroids, and galaxies — all in one place.
    </p>`

  // Custom homepage HTML (richer than the html() helper — adds card styling).
  // Served to everyone: content inside #root/.ssr paints instantly, then the
  // injected SPA scripts boot the globe and replace it.
  return spaAssets().then(assets => new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${ogImageUrl(title, desc, 'REAL-TIME 3D GLOBE')}" />
  <meta property="og:site_name" content="ObjectTracer" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${ogImageUrl(title, desc, 'REAL-TIME 3D GLOBE')}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>body{background:#050a0f;margin:0}</style>
  ${assets}
</head>
<body>
  <div id="root"></div>
  <div id="ssr-shell">
    <div class="ssr">
      <style>
        #ssr-shell{position:fixed;inset:0;z-index:99999;overflow:auto;background:#050a0f;transition:opacity .45s ease;overscroll-behavior:contain}
        .ssr{font-family:system-ui,sans-serif;color:#e8f4ff}
        .ssr .boot{height:100dvh;display:flex;align-items:center;justify-content:center}
        .ssr .bootC{display:flex;flex-direction:column;align-items:center;gap:28px}
        .ssr .lw{position:relative;width:72px;height:72px;display:flex;align-items:center;justify-content:center}
        .ssr .lring{position:absolute;inset:0;border-radius:50%;border:1.5px solid transparent;border-top-color:rgba(178,255,26,.8);border-right-color:rgba(178,255,26,.15);animation:ssrSpin 1.4s linear infinite}
        .ssr .lring::before{content:'';position:absolute;inset:8px;border-radius:50%;border:1px solid transparent;border-top-color:rgba(178,255,26,.35);animation:ssrSpinR 2.2s linear infinite}
        .ssr .ldot{width:8px;height:8px;border-radius:50%;background:rgba(178,255,26,.9);box-shadow:0 0 12px rgba(178,255,26,.6),0 0 30px rgba(178,255,26,.2);animation:ssrPulse 1.4s ease-in-out infinite}
        .ssr .lname{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.8rem;font-weight:500;letter-spacing:.35em;text-transform:uppercase;color:rgba(255,255,255,.6);margin:0;user-select:none}
        @keyframes ssrSpin{to{transform:rotate(360deg)}}
        @keyframes ssrSpinR{to{transform:rotate(-360deg)}}
        @keyframes ssrPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.75)}}
        .ssr .doc{max-width:860px;margin:0 auto;padding:32px 20px}
        .ssr a{color:#b2ff1a;text-decoration:none}.ssr h1{font-size:1.9rem;margin:0 0 12px}.ssr h2{font-size:1.15rem;margin:32px 0 12px;color:#b2ff1a}
        .ssr p{color:rgba(200,220,240,.72);line-height:1.6}
        .ssr .cta{display:inline-block;margin-top:8px;padding:12px 26px;background:#b2ff1a;color:#050a0f;font-weight:700;border-radius:8px}
        .ssr ul.cards{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
        .ssr ul.cards li a{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)}
        .ssr ul.cards li a strong{color:#fff;font-size:.98rem}
        .ssr ul.cards li a span{color:rgba(200,220,240,.55);font-size:.82rem;line-height:1.4}
        .ssr p.links{line-height:2.2}
      </style>
      <div class="boot">
        <div class="bootC">
          <div class="lw"><div class="lring"></div><div class="ldot"></div></div>
          <p class="lname">Object Tracer</p>
        </div>
      </div>
      <div class="doc">
        <main>${body}</main>
      </div>
    </div>
  </div>
</body>
</html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      'x-robots-tag': 'index, follow',
    },
  }))
}

// ── ISS renderer ─────────────────────────────────────────────────────────────

async function renderISS() {
  const canonical = `${SITE}/iss`

  // Fetch position, crew, and stream in parallel
  const [posRes, crewRes, streamRes] = await Promise.allSettled([
    fetch(`${API}/api/v1/aircraft/ISS`, { headers: { 'x-render': 'bot' } }),
    fetch(`${API}/api/v1/iss/crew`,     { headers: { 'x-render': 'bot' } }),
    fetch(`${API}/api/v1/iss/stream`,   { headers: { 'x-render': 'bot' } }),
  ])

  let pos = null, crewData = null, stream = null
  if (posRes.status === 'fulfilled' && posRes.value.ok)    { try { pos      = await posRes.value.json()    } catch (_) {} }
  if (crewRes.status === 'fulfilled' && crewRes.value.ok)  { try { crewData = await crewRes.value.json()  } catch (_) {} }
  if (streamRes.status === 'fulfilled' && streamRes.value.ok) { try { stream = await streamRes.value.json() } catch (_) {} }

  const lat    = pos?.current?.latitude
  const lon    = pos?.current?.longitude
  const issCrew = (crewData?.people || []).filter(p => p.craft === 'ISS')
  const allCrew = crewData?.people || []
  const totalInSpace = crewData?.number || allCrew.length

  // ISS well-known orbital parameters
  const ALT_KM = 408
  const SPEED_KMH = 27600
  const ORBITAL_PERIOD_MIN = 92.68

  const posStr = lat != null && lon != null
    ? `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
    : null

  const title = 'ISS Live Tracker — International Space Station Location, Crew & 4K Stream | ObjectTracer'
  const desc  = `Track the International Space Station (ISS) live on ObjectTracer's real-time 3D globe. ${issCrew.length} crew members aboard. Currently at ~${ALT_KM} km altitude, traveling at ${SPEED_KMH.toLocaleString()} km/h.${posStr ? ` Now over ${posStr}.` : ''} Watch the 4K NASA live stream.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'ISS Live Tracker — International Space Station',
    url: canonical,
    description: desc,
    about: {
      '@type': 'Thing',
      name: 'International Space Station',
      description: `The ISS orbits Earth at ~${ALT_KM} km altitude every ${ORBITAL_PERIOD_MIN} minutes at ${SPEED_KMH.toLocaleString()} km/h with ${issCrew.length} crew members aboard.`,
      sameAs: 'https://www.wikidata.org/wiki/Q159036',
    },
  }

  const crewRows = issCrew.map(p =>
    `<tr><td>👨‍🚀 ${esc(p.name)}</td><td>ISS</td></tr>`
  ).join('\n')

  const otherCraft = [...new Set(allCrew.filter(p => p.craft !== 'ISS').map(p => p.craft))]
  const otherRows = allCrew.filter(p => p.craft !== 'ISS').map(p =>
    `<tr><td>👨‍🚀 ${esc(p.name)}</td><td>${esc(p.craft)}</td></tr>`
  ).join('\n')

  const streamUrl = stream?.embed_url
    ? stream.embed_url.replace('autoplay=1', 'autoplay=0')
    : 'https://www.youtube.com/embed/21X5lGlDOfg'

  const body = `
    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/International_Space_Station_after_undocking_of_STS-132.jpg/800px-International_Space_Station_after_undocking_of_STS-132.jpg"
      alt="International Space Station"
      style="width:100%;max-width:720px;border-radius:8px;margin-bottom:20px;display:block" />

    <h1>ISS Live Tracker</h1>
    <p>Track the International Space Station in real-time — live position on a 3D globe, 4K NASA stream, crew manifest, altitude, and speed.</p>

    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>

    <h2>Current Position</h2>
    <table>
      ${posStr ? `<tr><th>Location</th><td>${esc(posStr)}</td></tr>` : ''}
      <tr><th>Altitude</th><td>~${ALT_KM} km (${Math.round(ALT_KM * 0.621)} mi)</td></tr>
      <tr><th>Speed</th><td>${SPEED_KMH.toLocaleString()} km/h (${Math.round(SPEED_KMH * 0.621).toLocaleString()} mph)</td></tr>
      <tr><th>Orbital Period</th><td>${ORBITAL_PERIOD_MIN} minutes (~16 orbits/day)</td></tr>
      <tr><th>Inclination</th><td>51.6°</td></tr>
    </table>

    <h2>Live 4K NASA Stream</h2>
    <p>Watch Earth from the ISS in 4K — NASA's High Definition Earth Viewing experiment streams live 24/7.</p>
    <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin-bottom:20px">
      <iframe src="${esc(streamUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"
        title="ISS NASA 4K Live Stream" allowfullscreen loading="lazy"></iframe>
    </div>

    <h2>ISS Crew (${issCrew.length} aboard)</h2>
    <table>
      <tr><th>Astronaut</th><th>Spacecraft</th></tr>
      ${crewRows}
    </table>

    ${otherRows ? `
    <h2>Also in Space (${otherCraft.join(', ')})</h2>
    <table>
      <tr><th>Astronaut</th><th>Spacecraft</th></tr>
      ${otherRows}
    </table>
    <p><strong>${totalInSpace} humans are currently in space.</strong></p>
    ` : ''}

    <h2>About the ISS</h2>
    <p>The International Space Station (ISS) is a modular space station in low Earth orbit.
      It is a multinational collaborative project involving NASA, Roscosmos, JAXA, ESA, and CSA.
      The ISS completes 15.5 orbits per day at approximately ${ALT_KM} km altitude, traveling at
      ${SPEED_KMH.toLocaleString()} km/h — fast enough to circle Earth in just ${ORBITAL_PERIOD_MIN} minutes.
    </p>
    <p style="margin-top:16px">
      ObjectTracer tracks the ISS live using real-time orbital data.
      View its exact position on a 3D globe, watch the 4K NASA live stream, and see the full crew manifest.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── Dynamic launch sitemap (auto-refreshes every deploy / request) ────────────

async function renderLaunchSitemap() {
  let launches = []
  try {
    const res = await fetch(`${API}/api/v1/launches`, { headers: { 'x-render': 'bot' } })
    if (res.ok) {
      const data = await res.json()
      launches = [...(data.upcoming || []), ...(data.recent || [])]
    }
  } catch (_) {}

  const seen = new Set()
  const urls = launches
    .filter(l => { const s = slugify(l.name); if (seen.has(s)) return false; seen.add(s); return true })
    .map(l => {
      const slug = slugify(l.name)
      const pri  = l.is_past ? '0.6' : '0.9'
      const freq = l.is_past ? 'weekly' : 'hourly'
      return `  <url><loc>${SITE}/launch/${slug}</loc><lastmod>${new Date().toISOString().slice(0,10)}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`
    }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, stale-while-revalidate=600',
    },
  })
}

// ── Space Journal blog ────────────────────────────────────────────────────────
async function renderBlogFeed() {
  let posts = []
  try {
    // limit=50 matches the sitemap (backend caps at 50) — the old 30 left the
    // 20 oldest sitemap posts unreachable from any HTML page
    const res = await fetch(`${API}/api/v1/blog?limit=50`, { headers: { 'x-render': 'bot' } })
    if (res.ok) { const d = await res.json(); posts = d.posts || [] }
  } catch (_) {}

  const canonical = `${SITE}/blog`
  const title = 'Space Journal — Daily Astronomy & Space Imagery | ObjectTracer'
  const desc  = 'A daily space journal featuring NASA’s Astronomy Picture of the Day — stunning cosmic imagery with the science behind each image.'
  const items = posts.map(p =>
    `<li><a href="${SITE}/blog/${esc(p.slug)}"><strong>${esc(p.title)}</strong><span>${esc(p.date)}</span></a></li>`
  ).join('\n')
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Blog', name: 'ObjectTracer Space Journal',
    url: canonical, description: desc,
  }
  const body = `
    <h1>Space Journal</h1>
    <p>Daily cosmic imagery powered by NASA's Astronomy Picture of the Day, with the science behind each image.</p>
    <ul class="cards">${items}</ul>`
  return html(canonical, title, desc, jsonLd, body, 'SPACE JOURNAL')
}

// Original, topic-aware framing around each APOD post — gives substantial
// unique content (varied per post) so the page isn't just verbatim NASA text.
function blogFraming(p) {
  const text = `${p.title} ${p.explanation || ''}`.toLowerCase()
  const has = (...ws) => ws.some(w => text.includes(w))
  const topics = []
  if (has('nebula','galaxy','cluster','cosmic','quasar','supernova','interstellar')) topics.push({ k: 'deep-space objects', href: '/deep-space', label: 'Deep Space galaxy map' })
  if (has('moon','lunar')) topics.push({ k: 'the Moon', href: '/moon', label: 'Moon tracker' })
  if (has('aurora','eclipse','corona','sunspot','solar flare')) topics.push({ k: 'solar activity', href: '/solar-system', label: 'Solar System view' })
  if (has('mars','jupiter','saturn','venus','mercury','neptune','uranus','planet')) topics.push({ k: 'the planets', href: '/solar-system', label: 'Solar System view' })
  if (has('comet','asteroid','meteor','near-earth',' neo ')) topics.push({ k: 'near-Earth objects', href: '/asteroids', label: 'Asteroid tracker' })
  if (has('space station','astronaut','cosmonaut',' iss ','crew')) topics.push({ k: 'the ISS', href: '/iss', label: 'ISS live tracker' })
  if (has('rocket','launch','spacex','falcon','starship','booster')) topics.push({ k: 'rocket launches', href: '/launches', label: 'Launch tracker' })
  if (has('star','milky way','constellation','sun')) topics.push({ k: 'the night sky', href: '/deep-space', label: 'Deep Space' })
  if (topics.length === 0) topics.push({ k: 'the cosmos', href: '/deep-space', label: 'Deep Space' })

  const seen = new Set()
  const picks = topics.filter(x => !seen.has(x.href) && seen.add(x.href)).slice(0, 3)
  const subjects = [...new Set(picks.map(x => x.k))].join(', ')

  let h = 0
  for (let i = 0; i < p.date.length; i++) h = (h * 31 + p.date.charCodeAt(i)) >>> 0
  const openers = [
    `Today's view is a window onto ${subjects}. Images like this aren't just beautiful — they're how astronomers measure distance, motion and the deep history of the universe, turning faint light into hard data.`,
    `What you're looking at ties directly to ${subjects}. Every frame the world's observatories capture adds another data point to humanity's slowly-assembling map of everything beyond our planet.`,
    `This scene highlights ${subjects}. The same physics that lets us photograph it also lets us predict where objects will be tomorrow — which is exactly what real-time tracking is built on.`,
    `Behind the picture is ${subjects}. Light that left these objects long ago is only reaching us now, which is why a single image can double as a snapshot of the distant past.`,
    `Today's highlight centers on ${subjects}. Understanding how these objects form and move is the bridge between a pretty photo and the live, data-driven sky we render on the globe.`,
  ]
  const why = openers[h % openers.length]
  const links = picks.map(x => `<a href="${SITE}${x.href}">${x.label}</a>`).join(' · ')

  return `
    <h2>Why this matters</h2>
    <p>${why}</p>
    <h2>See it live on ObjectTracer</h2>
    <p>This connects to what you can track in real time on our 3D globe — explore ${links}. Or open the <a href="${SITE}/">live globe</a> to watch flights, satellites, the ISS and spacecraft move right now.</p>`
}

// Topic keys for related-post matching — mirrors the blogFraming word lists
const BLOG_TOPICS = [
  ['deep',    ['nebula', 'galaxy', 'cluster', 'cosmic', 'quasar', 'supernova', 'interstellar']],
  ['moon',    ['moon', 'lunar']],
  ['solar',   ['aurora', 'eclipse', 'corona', 'sunspot', 'solar flare']],
  ['planets', ['mars', 'jupiter', 'saturn', 'venus', 'mercury', 'neptune', 'uranus', 'planet']],
  ['neo',     ['comet', 'asteroid', 'meteor', 'near-earth']],
  ['iss',     ['space station', 'astronaut', ' iss ', 'crew']],
  ['launch',  ['rocket', 'launch', 'spacex', 'falcon', 'starship', 'booster']],
  ['stars',   ['star', 'milky way', 'constellation', 'sun']],
]
function blogTopicKeys(p) {
  const t = `${p.title} ${p.explanation || ''}`.toLowerCase()
  return new Set(BLOG_TOPICS.filter(([, ws]) => ws.some(w => t.includes(w))).map(([k]) => k))
}

// Post→post links: 4 topic-related picks + prev/next by date. Without these,
// every post is a leaf reachable only from /blog — the classic
// "Discovered - currently not indexed" pattern.
function relatedBlogHtml(p, all) {
  if (!all.length) return ''
  const i = all.findIndex(x => x.slug === p.slug)         // all is date DESC
  const newer = i > 0 ? all[i - 1] : null
  const older = i >= 0 && i + 1 < all.length ? all[i + 1] : null
  const mine = blogTopicKeys(p)
  const pool = all.filter(x => x.slug !== p.slug && x !== older && x !== newer)
  // 3 topic-related + 3 rotation-picked from the rest: similarity alone
  // over-links popular clusters; the seeded rotation guarantees every post
  // in the archive is reachable from several siblings.
  const related = pool
    .map(x => { let s = 0; for (const k of blogTopicKeys(x)) if (mine.has(k)) s++; return { x, s } })
    .sort((a, b) => b.s - a.s || (a.x.date < b.x.date ? 1 : -1))
    .slice(0, 3).map(o => o.x)
  const rest = pool.filter(x => !related.includes(x))
  const picks = [...related, ...rotatePick(rest, seedHash(p.slug), 3)]
  const li = q => `<li><a href="${SITE}/blog/${esc(q.slug)}"><strong>${esc(q.title)}</strong><span>${esc(q.date)}</span></a></li>`
  const nav = [
    older && `<a href="${SITE}/blog/${esc(older.slug)}">← ${esc(older.title)}</a>`,
    newer && `<a href="${SITE}/blog/${esc(newer.slug)}">${esc(newer.title)} →</a>`,
  ].filter(Boolean).join(' · ')
  if (!picks.length && !nav) return ''
  return `
    <h2>More from the Space Journal</h2>
    ${picks.length ? `<ul class="cards">${picks.map(li).join('\n')}</ul>` : ''}
    ${nav ? `<p>${nav}</p>` : ''}`
}

// /engineering — public home of the weekly engineering series (anyone can read;
// only the admin can write, via the /admin Blog tab).
async function renderEngineeringFeed() {
  let posts = []
  try {
    const res = await fetch(`${API}/api/v1/blog?limit=50&category=engineering`, { headers: { 'x-render': 'bot' } })
    if (res.ok) { const d = await res.json(); posts = d.posts || [] }
  } catch (_) {}

  const canonical = `${SITE}/engineering`
  const title = 'Engineering Blog: How ObjectTracer Is Built | ObjectTracer'
  const desc  = 'Weekly engineering deep dives from the ObjectTracer build: rendering 40,000 aircraft at 60fps, real-time data pipelines, and the problems behind a live 3D globe.'
  const items = posts.map(p =>
    `<li><a href="${SITE}/blog/${esc(p.slug)}"><strong>${esc(p.title)}</strong><span>${esc(p.date)}</span></a></li>`
  ).join('\n')
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Blog', name: 'ObjectTracer Engineering Blog',
    url: canonical, description: desc,
  }
  const body = `
    <h1>Engineering Blog</h1>
    <p>How ObjectTracer is built: one hard problem a week, in depth. Real code, real dead ends, real numbers.</p>
    ${posts.length ? `<ul class="cards">${items}</ul>` : '<p>The first deep dive lands soon.</p>'}
    <h2>More from ObjectTracer</h2>
    <p><a href="${SITE}/blog">Space Journal</a> · <a href="${SITE}/launches">Launches</a> · <a href="${SITE}/iss">ISS tracker</a> · <a href="${SITE}/">Live 3D globe</a></p>`
  return html(canonical, title, desc, jsonLd, body, 'ENGINEERING')
}

async function renderBlogPost(slug) {
  let p = null, allPosts = []
  try {
    const [pr, lr] = await Promise.all([
      fetch(`${API}/api/v1/blog/${encodeURIComponent(slug)}`, { headers: { 'x-render': 'bot' } }),
      fetch(`${API}/api/v1/blog?limit=50`, { headers: { 'x-render': 'bot' } }),
    ])
    if (pr.ok) p = await pr.json()
    if (lr.ok) { const d = await lr.json(); allPosts = d.posts || [] }
  } catch (_) {}
  if (!p) return // unknown slug → SPA

  const canonical = `${SITE}/blog/${slug}`
  const isEng = p.category === 'engineering'
  const title = isEng
    ? `${p.title} | ObjectTracer Engineering`
    : `${p.title}: Space Journal | ObjectTracer`
  const desc  = (p.intro || p.explanation || '').slice(0, 200)
  const img = p.image_url || `${SITE}/og-image.png`
  const wordCount = (p.explanation || '').split(/\s+/).filter(Boolean).length
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': isEng ? 'BlogPosting' : 'Article',
        '@id': `${canonical}#article`,
        headline: p.title,
        description: desc,
        image: img,
        datePublished: p.date,
        dateModified: p.updated_at || p.date,   // freshness signal
        wordCount,
        inLanguage: 'en',
        author: isEng
          ? { '@type': 'Person', name: 'Md Saqlain Khan', jobTitle: 'Founder & CTO',
              worksFor: { '@type': 'Organization', name: 'ObjectTracer' }, url: `${SITE}/about` }
          : { '@type': 'Organization', name: 'NASA APOD' },
        publisher: { '@type': 'Organization', name: 'ObjectTracer', logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` } },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        isPartOf: { '@type': isEng ? 'Blog' : 'CreativeWorkSeries',
          name: isEng ? 'ObjectTracer Engineering' : 'Space Journal',
          url: isEng ? `${SITE}/engineering` : `${SITE}/blog` },
        url: canonical,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: isEng ? 'Engineering' : 'Space Journal',
            item: isEng ? `${SITE}/engineering` : `${SITE}/blog` },
          { '@type': 'ListItem', position: 3, name: p.title, item: canonical },
        ],
      },
    ],
  }
  const imgTag = (isEng ? p.image_url : p.media_type === 'image')
    ? `<img src="${esc(img)}" alt="${esc(p.title)}" style="width:100%;border-radius:10px;margin:16px 0" />` : ''

  // Engineering posts: long-form with intentional line breaks + optional video
  // embed; no NASA framing or credit. Journal posts unchanged.
  const videoEmbed = isEng && p.video_url ? blogVideoEmbed(p.video_url) : ''
  const body = isEng ? `
    <p style="font-family:monospace;color:rgba(178,255,26,0.7);font-size:.85rem">${esc(p.date)} · ENGINEERING</p>
    <h1>${esc(p.title)}</h1>
    <p style="font-size:.85rem;opacity:.75">By <strong>Md Saqlain Khan</strong>, Founder &amp; CTO, ObjectTracer</p>
    ${imgTag}
    ${p.intro ? `<p style="font-style:italic;color:rgba(200,220,240,0.9)">${esc(p.intro)}</p>` : ''}
    ${videoEmbed}
    <p style="white-space:pre-wrap">${esc(p.explanation)}</p>
    <p style="font-size:.8rem;opacity:.6">ObjectTracer Engineering · building in public</p>
    ${relatedBlogHtml(p, allPosts)}
    <p><a href="${SITE}/blog">← All posts</a></p>` : `
    <p style="font-family:monospace;color:rgba(178,255,26,0.7);font-size:.85rem">${esc(p.date)}</p>
    <h1>${esc(p.title)}</h1>
    ${imgTag}
    <p style="font-style:italic;color:rgba(200,220,240,0.9)">${esc(p.intro)}</p>
    ${blogFraming(p)}
    <h2>The science, from NASA's Astronomy Picture of the Day</h2>
    <p>${esc(p.explanation)}</p>
    ${p.copyright ? `<p style="font-size:.8rem;opacity:.6">Image credit: ${esc(p.copyright)} · Source: NASA APOD</p>` : `<p style="font-size:.8rem;opacity:.6">Source: NASA Astronomy Picture of the Day (public domain)</p>`}
    ${relatedBlogHtml(p, allPosts)}
    <p><a href="${SITE}/blog">← All Space Journal entries</a></p>`
  // Article OG image is the actual APOD/post image (passed as ogImageOverride)
  return html(canonical, title, desc, jsonLd, body, isEng ? 'ENGINEERING' : 'SPACE JOURNAL', img)
}

// YouTube/Vimeo link → responsive iframe embed (empty string when unknown host)
function blogVideoEmbed(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    let src = null
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v') || (u.pathname.match(/\/(shorts|embed)\/([\w-]{6,})/) || [])[2]
      if (id) src = `https://www.youtube.com/embed/${id}`
    } else if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      if (id) src = `https://www.youtube.com/embed/${id}`
    } else if (host === 'vimeo.com') {
      const id = (u.pathname.match(/\/(\d+)/) || [])[1]
      if (id) src = `https://player.vimeo.com/video/${id}`
    }
    if (!src) return `<p><a href="${esc(url)}" rel="noopener">Watch the video</a></p>`
    return `<div style="position:relative;width:100%;aspect-ratio:16/9;margin:16px 0">
      <iframe src="${esc(src)}" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:10px" allowfullscreen loading="lazy"></iframe></div>`
  } catch (_) { return '' }
}

async function renderBlogSitemap() {
  let posts = []
  try {
    const res = await fetch(`${API}/api/v1/blog?limit=50`, { headers: { 'x-render': 'bot' } })
    if (res.ok) { const d = await res.json(); posts = d.posts || [] }
  } catch (_) {}
  const urls = posts.map(p =>
    `  <url><loc>${SITE}/blog/${p.slug}</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`
  ).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/blog</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n${urls}\n</urlset>`
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function ogImageUrl(title, subtitle, badge) {
  const p = new URLSearchParams()
  // Strip the "| ObjectTracer" suffix for a cleaner image title
  p.set('title', String(title).replace(/\s*[|—-]\s*ObjectTracer.*$/, '').slice(0, 80))
  if (subtitle) p.set('subtitle', String(subtitle).slice(0, 120))
  if (badge)    p.set('badge', badge)
  return `${SITE}/api/og?${p.toString()}`
}

// ── SPA asset tags — fetched from the deployed shell, cached per edge isolate ──
// Vite hashes bundle names each deploy; reading them from the live /index.html
// keeps SSR pages pointing at the current bundles without a build-time coupling.
let _spaAssets = { tags: '', at: 0 }
async function spaAssets() {
  if (_spaAssets.tags && Date.now() - _spaAssets.at < 300_000) return _spaAssets.tags
  try {
    const res = await fetch(`${SITE}/index.html`, { headers: { 'x-mw-internal': '1' } })
    if (!res.ok) return _spaAssets.tags
    const shell = await res.text()
    const tags = [
      ...(shell.match(/<link rel="stylesheet"[^>]*>/g) || []),
      ...(shell.match(/<link rel="modulepreload"[^>]*>/g) || []),
      ...(shell.match(/<script type="module"[^>]*><\/script>/g) || []),
    ].join('\n  ')
    if (tags) _spaAssets = { tags, at: Date.now() }
  } catch (_) { /* SSR page still works as a plain document */ }
  return _spaAssets.tags
}

async function html(canonical, title, desc, jsonLd, body, ogBadge, ogImageOverride) {
  const ogImg = ogImageOverride || ogImageUrl(title, desc, ogBadge)
  const assets = await spaAssets()
  // SSR content and its styles live INSIDE #root, so React's first render
  // sweeps them away when the app takes over. Nothing leaks into app styling.
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${esc(canonical)}" />
  <meta property="og:title"       content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image"       content="${esc(ogImg)}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="ObjectTracer" />
  <meta name="twitter:card"       content="summary_large_image" />
  <meta name="twitter:title"      content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image"      content="${esc(ogImg)}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>body{background:#050a0f;margin:0}</style>
  ${assets}
</head>
<body>
  <div id="root"></div>
  <!-- SSR shell lives OUTSIDE #root: React mounts underneath untouched, then
       App.jsx fades this overlay out once the app is painting — a controlled
       cross-fade instead of an abrupt DOM swap. No JS → stays as the page. -->
  <div id="ssr-shell">
    <div class="ssr">
      <style>
        #ssr-shell{position:fixed;inset:0;z-index:99999;overflow:auto;background:#050a0f;transition:opacity .45s ease;overscroll-behavior:contain}
        .ssr{font-family:system-ui,sans-serif;color:#e8f4ff}
        /* First viewport: exact replica of the app's LoadingScreen (orbital
           ring + dot + wordmark) so the fade-out is invisible — same splash
           above and below the overlay. Article content sits below the fold
           for crawlers and reader mode. */
        .ssr .boot{height:100dvh;display:flex;align-items:center;justify-content:center}
        .ssr .bootC{display:flex;flex-direction:column;align-items:center;gap:28px}
        .ssr .lw{position:relative;width:72px;height:72px;display:flex;align-items:center;justify-content:center}
        .ssr .lring{position:absolute;inset:0;border-radius:50%;border:1.5px solid transparent;border-top-color:rgba(178,255,26,.8);border-right-color:rgba(178,255,26,.15);animation:ssrSpin 1.4s linear infinite}
        .ssr .lring::before{content:'';position:absolute;inset:8px;border-radius:50%;border:1px solid transparent;border-top-color:rgba(178,255,26,.35);animation:ssrSpinR 2.2s linear infinite}
        .ssr .ldot{width:8px;height:8px;border-radius:50%;background:rgba(178,255,26,.9);box-shadow:0 0 12px rgba(178,255,26,.6),0 0 30px rgba(178,255,26,.2);animation:ssrPulse 1.4s ease-in-out infinite}
        .ssr .lname{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.8rem;font-weight:500;letter-spacing:.35em;text-transform:uppercase;color:rgba(255,255,255,.6);margin:0;user-select:none}
        @keyframes ssrSpin{to{transform:rotate(360deg)}}
        @keyframes ssrSpinR{to{transform:rotate(-360deg)}}
        @keyframes ssrPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.75)}}
        .ssr .doc{max-width:800px;margin:0 auto;padding:24px 16px}
        .ssr a{color:#b2ff1a}.ssr h1{font-size:1.5rem;margin:0 0 8px}.ssr h2{font-size:1rem;margin:24px 0 8px;color:#b2ff1a}
        .ssr p{color:rgba(200,220,240,.75);line-height:1.6}
        .ssr table{border-collapse:collapse;width:100%;margin-bottom:20px}
        .ssr th,.ssr td{padding:7px 11px;text-align:left;border:1px solid rgba(255,255,255,.08);font-size:.875rem}
        .ssr th{background:rgba(255,255,255,.05);font-weight:600}
        .ssr .cta{display:inline-block;margin-top:12px;padding:11px 22px;background:#b2ff1a;color:#000;font-weight:700;border-radius:8px;text-decoration:none}
        .ssr nav{margin-bottom:18px;font-size:.85rem}
      </style>
      <div class="boot">
        <div class="bootC">
          <div class="lw"><div class="lring"></div><div class="ldot"></div></div>
          <p class="lname">Object Tracer</p>
        </div>
      </div>
      <div class="doc">
        <nav><a href="${SITE}">← ObjectTracer</a></nav>
        <main>${body}</main>
      </div>
    </div>
  </div>
</body>
</html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30',
      'x-robots-tag': 'index, follow',
    },
  })
}

// ── FAQ renderer — FAQPage schema + AI-citable answers ──────────────────────
const FAQ_DATA = [
  ['Getting started', [
    ['Is ObjectTracer free?', 'Completely, with no ads. It runs on free infrastructure and donations, and it always works without an account.'],
    ['Do I need to sign in?', 'No. Every feature works signed out. An account only saves your tracked flights and pinned launches so they follow you across devices.'],
    ['Does it work on my phone?', 'Yes. The full 3D globe runs in any modern mobile browser. You can also add it to your home screen as an app from the install prompt.'],
    ['Do you track me?', 'No analytics on you beyond what is needed to run the site, no ads, no selling data. We track objects in the sky, not people.'],
  ]],
  ['Flight & ship data', [
    ['Where does the flight data come from?', 'Live aircraft positions come from open ADS-B receivers worldwide via adsb.lol. Aircraft broadcast their own GPS position roughly twice a second; the receivers pick it up and we plot it. Route and airline details come from the adsbdb flight database.'],
    ['How accurate is it, and how fresh?', 'Positions refresh every few seconds and are accurate to a few hundred meters, the same source airlines and controllers use. Between updates the globe smoothly interpolates motion so aircraft glide instead of jumping.'],
    ['Can I follow one specific flight?', 'Yes. Click any aircraft, or search by callsign, registration, or ICAO24 hex code. The camera can lock on and follow it, and you can save it to your profile.'],
    ['Why does a flight show no route?', 'We only draw a route when we have a verified flight plan. We never guess a destination. If the plan is not available, you still get live position, altitude, speed and heading.'],
    ['Are ships really on the same map?', 'Yes. Maritime vessels reporting over AIS appear on the globe alongside the aircraft above them, so you can watch a port and its approach traffic together.'],
  ]],
  ['Space & the sky', [
    ['What is the ISS live stream?', 'When the International Space Station is in view you can open its live 4K video feed, sourced from NASA public streams, along with the current crew on board and its live orbital position.'],
    ['How are satellite positions calculated?', 'From published two-line element sets and standard orbital propagation, the same math used for satellite prediction everywhere. That is why a satellite keeps moving accurately even between data refreshes.'],
    ['Can I get notified before a rocket launch?', 'Yes. Open any upcoming launch and turn on a reminder. Your browser will notify you shortly before liftoff, and the launch pad is marked on the globe.'],
    ['How far out does it go?', 'Keep zooming out. The view scales from street level through the Moon and the full solar system, out to a catalog of hundreds of thousands of real galaxies.'],
  ]],
  ['Under the hood', [
    ['Is the globe a map image?', 'No. It is genuine 3D geometry rendered in your browser with Three.js and WebGL, which is what lets it tilt, orbit and scale continuously instead of snapping between fixed zoom levels.'],
    ['How does it stay fast with so many objects?', 'The server streams only the objects in your current view over one WebSocket connection, and the globe draws thousands of them in a handful of GPU calls. We write about exactly how on the Engineering Blog.'],
    ['Can I read about how it is built?', 'Yes. The Engineering Blog covers one problem a week in depth, from rendering tens of thousands of aircraft at 60 frames per second to serving the whole sky on a free backend.'],
  ]],
]

async function renderFaq() {
  const canonical = `${SITE}/faq`
  const title = 'ObjectTracer FAQ — Live Flight, Ship & Space Tracking, Answered'
  const desc  = 'How ObjectTracer works: where flight data comes from, accuracy and refresh rate, following a flight, the ISS live stream, satellites, launches, and the 3D globe tech.'
  const flat  = FAQ_DATA.flatMap(([, qs]) => qs)
  const jsonLd = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'FAQPage', mainEntity: flat.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    crumbLd([['Home', `${SITE}/`], ['FAQ', canonical]]),
  ] }
  const body = `
    <h1>ObjectTracer — Frequently Asked Questions</h1>
    ${FAQ_DATA.map(([section, qs]) => `
    <h2>${esc(section)}</h2>
    ${qs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n    ')}`).join('\n')}
    <p><a href="${SITE}/">Open the live 3D globe →</a> · <a href="${SITE}/engineering">Engineering Blog</a> · <a href="${SITE}/iss">ISS tracker</a></p>`
  return html(canonical, title, desc, jsonLd, body, 'FAQ')
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// schema.org BreadcrumbList from [name, url] pairs — surfaces SERP breadcrumbs.
function crumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({
      '@type': 'ListItem', position: i + 1, name, item,
    })),
  }
}

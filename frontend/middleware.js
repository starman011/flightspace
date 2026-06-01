// Vercel Edge Middleware — dynamic bot rendering for flight and airport pages.
// Googlebot (and other crawlers) receive pre-rendered HTML with SEO meta + real data.
// Human visitors pass through to the Vite SPA (vercel.json rewrite → index.html).

export const config = {
  matcher: ['/flight/:path*', '/airport/:path*', '/airline/:path*'],
}

const BOT_RE =
  /googlebot|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|rogerbot|embedly|quora|outbrain|pinterestbot|semrushbot|ahrefsbot|mj12bot|dotbot/i

const API  = 'https://api.objecttracer.com'
const SITE = 'https://www.objecttracer.com'

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || ''
  if (!BOT_RE.test(ua)) return // pass through → vercel.json rewrite → SPA

  const { pathname } = new URL(request.url)
  const parts = pathname.split('/').filter(Boolean)

  if (parts[0] === 'flight' && parts[1]) {
    return renderFlight(parts[1])
  }
  if (parts[0] === 'airport' && parts[1]) {
    return renderAirport(parts[1].toUpperCase())
  }
  if (parts[0] === 'airline' && parts[1]) {
    return renderAirline(parts[1].toLowerCase())
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

  const jsonLd = { '@context': 'https://schema.org', '@type': 'Flight', identifier: icao24, flightNumber: callsign, url: canonical }
  if (operator)   jsonLd.provider          = { '@type': 'Airline', name: operator }
  if (originName) jsonLd.departureAirport  = { '@type': 'Airport', name: originName, ...(originIATA ? { iataCode: originIATA } : {}) }
  if (destName)   jsonLd.arrivalAirport    = { '@type': 'Airport', name: destName,   ...(destIATA   ? { iataCode: destIATA   } : {}) }

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
  if (arrRes.status === 'fulfilled' && arrRes.value.ok) {
    try { const d = await arrRes.value.json(); arrivals   = Array.isArray(d) ? d : (d.arrivals   || []) } catch (_) {}
  }
  if (depRes.status === 'fulfilled' && depRes.value.ok) {
    try { const d = await depRes.value.json(); departures = Array.isArray(d) ? d : (d.departures || []) } catch (_) {}
  }

  const canonical = `${SITE}/airport/${iata}`
  const title = `${iata} Airport — Live Arrivals & Departures | ObjectTracer`
  const desc  = `Live flight tracker for ${iata} Airport. ${arrivals.length} arrivals and ${departures.length} departures currently tracked on ObjectTracer's real-time 3D globe.`
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Airport', iataCode: iata, name: `${iata} Airport`, url: canonical }

  const row = (f, dir) => {
    const cs   = f.callsign || f.icao24 || ''
    const peer = dir === 'arr'
      ? (f.origin || f.departure_iata || '')
      : (f.destination || f.arrival_iata || '')
    const link = f.icao24
      ? `<a href="${SITE}/flight/${f.icao24}">${esc(cs)}</a>`
      : esc(cs)
    return `<tr><td>${link}</td><td>${esc(peer) || '—'}</td><td>${esc(f.altitude ? Math.round(f.altitude) + ' ft' : '—')}</td></tr>`
  }
  const thead = '<tr><th>Flight</th><th>Route</th><th>Altitude</th></tr>'
  const arrRows = arrivals.slice(0, 15).map(f => row(f, 'arr')).join('\n')
  const depRows = departures.slice(0, 15).map(f => row(f, 'dep')).join('\n')

  return html(canonical, title, desc, jsonLd, `
    <h1>${esc(iata)} Airport — Live Flights</h1>
    <p>${arrivals.length} arrivals and ${departures.length} departures currently tracked via ADS-B.</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>
    ${arrRows ? `<h2>Arrivals</h2><table>${thead}${arrRows}</table>` : ''}
    ${depRows ? `<h2>Departures</h2><table>${thead}${depRows}</table>` : ''}
    <p style="margin-top:32px">
      ObjectTracer tracks live flights at ${esc(iata)} and thousands of airports worldwide using real-time ADS-B data.
      View aircraft on an interactive 3D globe with altitude, speed, and route history.
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
  const title = `${airline.name} Live Flight Tracker — Track ${airline.iata} Flights | ObjectTracer`
  const desc  = `Track all ${airline.name} (${airline.iata}) flights live on ObjectTracer's real-time 3D globe. ${count > 0 ? `${count} flights currently tracked.` : ''} Real-time ADS-B position, altitude, speed, and route for every ${airline.name} aircraft.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Airline',
    name: airline.name,
    iataCode: airline.iata,
    icaoCode: airline.icao,
    url: canonical,
  }

  const flightRows = flights.slice(0, 20).map(f => {
    const cs   = f.callsign || f.icao24 || ''
    const link = f.icao24 ? `<a href="${SITE}/flight/${f.icao24}">${esc(cs)}</a>` : esc(cs)
    const alt  = f.altitude ? Math.round(f.altitude) + ' ft' : '—'
    const spd  = f.velocity  ? Math.round(f.velocity)  + ' kts' : '—'
    return `<tr><td>${link}</td><td>${esc(f.type_description || '—')}</td><td>${esc(alt)}</td><td>${esc(spd)}</td></tr>`
  }).join('\n')

  const body = `
    <h1>${esc(airline.name)} Live Flights</h1>
    <p>${count > 0 ? `${count} ${esc(airline.name)} aircraft currently tracked via ADS-B.` : `No ${esc(airline.name)} flights currently in ADS-B coverage. Check back during peak hours.`}</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>
    ${flightRows ? `
    <h2>Currently Tracked Flights</h2>
    <table>
      <tr><th>Flight</th><th>Aircraft</th><th>Altitude</th><th>Speed</th></tr>
      ${flightRows}
    </table>` : ''}
    <p style="margin-top:32px">
      ObjectTracer tracks all ${esc(airline.name)} flights worldwide in real-time using ADS-B data.
      Click any flight to see its live position, route history, altitude, speed, and aircraft details on an interactive 3D globe.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function html(canonical, title, desc, jsonLd, body) {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${canonical}" />
  <meta name="robots" content="index, follow" />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${canonical}" />
  <meta property="og:title"       content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image"       content="${SITE}/og-image.png" />
  <meta property="og:site_name"   content="ObjectTracer" />
  <meta name="twitter:card"       content="summary_large_image" />
  <meta name="twitter:title"      content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image"      content="${SITE}/og-image.png" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:24px 16px;background:#050a0f;color:#e8f4ff}
    a{color:#b2ff1a}h1{font-size:1.5rem;margin:0 0 8px}h2{font-size:1rem;margin:24px 0 8px;color:#b2ff1a}
    p{color:rgba(200,220,240,.75);line-height:1.6}
    table{border-collapse:collapse;width:100%;margin-bottom:20px}
    th,td{padding:7px 11px;text-align:left;border:1px solid rgba(255,255,255,.08);font-size:.875rem}
    th{background:rgba(255,255,255,.05);font-weight:600}
    .cta{display:inline-block;margin-top:12px;padding:11px 22px;background:#b2ff1a;color:#000;font-weight:700;border-radius:8px;text-decoration:none}
    nav{margin-bottom:18px;font-size:.85rem}
  </style>
</head>
<body>
  <nav><a href="${SITE}">← ObjectTracer</a></nav>
  <main>${body}</main>
</body>
</html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60, stale-while-revalidate=30',
      'x-robots-tag': 'index, follow',
    },
  })
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

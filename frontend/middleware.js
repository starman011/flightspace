// Vercel Edge Middleware — dynamic bot rendering for flight and airport pages.
// Googlebot (and other crawlers) receive pre-rendered HTML with SEO meta + real data.
// Human visitors pass through to the Vite SPA (vercel.json rewrite → index.html).

export const config = {
  matcher: ['/', '/flight/:path*', '/airport/:path*', '/airline/:path*', '/launch/:path*', '/route/:path*', '/asteroid/:path*', '/city/:path*', '/satellite/:path*', '/flights/:path*', '/blog', '/blog/:path*', '/sitemap-launches.xml', '/sitemap-blog.xml', '/iss'],
}

const BOT_RE =
  /googlebot|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|rogerbot|embedly|quora|outbrain|pinterestbot|semrushbot|ahrefsbot|mj12bot|dotbot/i

import { AIRPORTS } from './src/components/Globe/airportData.js'

const API  = 'https://api.objecttracer.com'
const SITE = 'https://www.objecttracer.com'

// Full 930-airport lookup (name, city, lat/lon, tier) for content on every page
const AIRPORT_FULL = Object.fromEntries(AIRPORTS.map(a => [a.iata, a]))
// A few always-valid airports/airlines to cross-link (builds the link graph)
const XLINK_AIRPORTS = ['JFK', 'LHR', 'DXB', 'DEL', 'LAX', 'SIN']
const XLINK_AIRLINES = [['emirates', 'Emirates'], ['indigo', 'IndiGo'], ['american-airlines', 'American'], ['british-airways', 'British Airways']]

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
  if (!BOT_RE.test(ua)) return // pass through → vercel.json rewrite → SPA

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
    return renderFlightsOver(parts[1].toLowerCase())
  }
  if (pathname === '/iss') {
    return renderISS()
  }
  if (pathname === '/blog') {
    return renderBlogFeed()
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
  const info     = AIRPORT_INFO[iata]
  const full     = AIRPORT_FULL[iata]
  const fullName = info ? info.name : (full ? `${full.name} Airport` : `${iata} Airport`)
  const cityName = info ? info.city : (full ? full.city : iata)
  const country  = info ? info.country : ''
  const apLabel  = `${cityName} ${iata} Airport`
  const where    = country ? `${cityName}, ${country}` : cityName
  const title = `${iata} ${cityName} Airport — Live Arrivals, Departures & Flight Status | ObjectTracer`
  const desc  = `Live ${cityName} (${iata}) airport flight tracker: real-time arrivals, departures and flight status at ${fullName}. ${arrivals.length} arrivals and ${departures.length} departures tracked now on ObjectTracer's 3D globe.`

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
    ],
  }

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
    <h1>${esc(fullName)} (${esc(iata)}) — Live Flight Tracker</h1>
    <p>Real-time arrivals, departures and flight status for ${esc(fullName)}${info ? `, ${esc(cityName)}, ${esc(info.country)}` : ''}.
       ${arrivals.length} arrivals and ${departures.length} departures are currently tracked via ADS-B.</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>
    ${arrRows ? `<h2>${esc(iata)} Arrivals — Live</h2><table>${thead}${arrRows}</table>` : ''}
    ${depRows ? `<h2>${esc(iata)} Departures — Live</h2><table>${thead}${depRows}</table>` : ''}
    <h2>About ${esc(apLabel)}</h2>
    <p>${esc(about)}</p>
    <h2>${esc(iata)} — Frequently Asked Questions</h2>
    ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}
    <h2>Track more on ObjectTracer</h2>
    <p>
      Other busy airports:
      ${XLINK_AIRPORTS.filter(x => x !== iata).map(x => `<a href="${SITE}/airport/${x}">${x}</a>`).join(' · ')}.
      Airlines: ${XLINK_AIRLINES.map(([s, n]) => `<a href="${SITE}/airline/${s}">${esc(n)}</a>`).join(' · ')}.
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
  const title = `${airline.name} Flight Tracker — Live Map & Status (${airline.iata}) | ObjectTracer`
  const desc  = `Track all ${airline.name} (${airline.iata}) flights live on ObjectTracer's real-time 3D globe. ${count > 0 ? `${count} flights currently tracked.` : ''} Real-time ADS-B position, altitude, speed, and route for every ${airline.name} aircraft.`

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
    ],
  }

  const flightRows = flights.slice(0, 20).map(f => {
    const cs   = f.callsign || f.icao24 || ''
    const link = f.icao24 ? `<a href="${SITE}/flight/${f.icao24}">${esc(cs)}</a>` : esc(cs)
    const alt  = f.altitude ? Math.round(f.altitude) + ' ft' : '—'
    const spd  = f.velocity  ? Math.round(f.velocity)  + ' kts' : '—'
    return `<tr><td>${link}</td><td>${esc(f.type_description || '—')}</td><td>${esc(alt)}</td><td>${esc(spd)}</td></tr>`
  }).join('\n')

  // Airline logo via avs.io CDN (already in CSP allowlist)
  const logoHtml = `<img src="https://pics.avs.io/200/60/${esc(airline.iata)}.png" alt="${esc(airline.name)} logo" style="height:40px;object-fit:contain;margin-bottom:12px;border-radius:4px" onerror="this.style.display='none'" /><br>`

  const body = `
    ${logoHtml}
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
      ${XLINK_AIRPORTS.map(x => `<a href="${SITE}/airport/${x}">${x}</a>`).join(' · ')}.
      Airlines: ${XLINK_AIRLINES.filter(([s]) => s !== slug).map(([s, n]) => `<a href="${SITE}/airline/${s}">${esc(n)}</a>`).join(' · ')}.
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
  if (!launch) return // unknown launch → pass to SPA

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
  const jsonLd = {
    '@context': 'https://schema.org',
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

  const title = `${city.name} Live Flight Tracker — All Airports & Arrivals | ObjectTracer`
  const desc  = `Track all live flights at ${city.name}, ${city.country} on ObjectTracer's real-time 3D globe. Covers ${iataList.join(', ')} — live arrivals, departures, and real-time ADS-B tracking.`

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
  const title = `${sat.name} Live Tracker — Real-Time Position | ObjectTracer`
  const desc  = `${sat.desc} Track ${sat.name} live on ObjectTracer's interactive 3D globe.${sat.altKm ? ` Orbits at ~${sat.altKm} km altitude.` : ''}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${sat.name} Live Tracker`,
    url: canonical,
    description: desc,
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
    <p>Also track the <a href="${SITE}/iss">International Space Station (ISS)</a> and all satellites on ObjectTracer.</p>`

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
      ${XLINK_AIRPORTS.filter(x => x !== origin && x !== dest).map(x => `<a href="${SITE}/airport/${x}">${x}</a>`).join(' · ')}.
      Airlines: ${XLINK_AIRLINES.map(([s, n]) => `<a href="${SITE}/airline/${s}">${esc(n)}</a>`).join(' · ')}.
      Or open the <a href="${SITE}/">live 3D tracker</a>.
    </p>`

  return html(canonical, title, desc, jsonLd, body)
}

// ── Homepage renderer (bots only) ─────────────────────────────────────────────
// Rich, link-dense HTML so Google can build SITELINKS (the sub-links under the
// main result). Sitelinks are algorithmic — they need a clear section structure
// + strong internal links + brand authority. This provides the structure.
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

  // Custom homepage HTML (richer than the html() helper — adds card styling)
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${canonical}" />
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
  <style>
    body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:32px 20px;background:#050a0f;color:#e8f4ff}
    a{color:#b2ff1a;text-decoration:none}h1{font-size:1.9rem;margin:0 0 12px}h2{font-size:1.15rem;margin:32px 0 12px;color:#b2ff1a}
    p{color:rgba(200,220,240,.72);line-height:1.6}
    .cta{display:inline-block;margin-top:8px;padding:12px 26px;background:#b2ff1a;color:#050a0f;font-weight:700;border-radius:8px}
    ul.cards{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
    ul.cards li a{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)}
    ul.cards li a strong{color:#fff;font-size:.98rem}
    ul.cards li a span{color:rgba(200,220,240,.55);font-size:.82rem;line-height:1.4}
    p.links{line-height:2.2}
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=600',
      'x-robots-tag': 'index, follow',
    },
  })
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
    const res = await fetch(`${API}/api/v1/blog?limit=30`, { headers: { 'x-render': 'bot' } })
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

async function renderBlogPost(slug) {
  let p = null
  try {
    const res = await fetch(`${API}/api/v1/blog/${encodeURIComponent(slug)}`, { headers: { 'x-render': 'bot' } })
    if (res.ok) p = await res.json()
  } catch (_) {}
  if (!p) return // unknown slug → SPA

  const canonical = `${SITE}/blog/${slug}`
  const title = `${p.title} — Space Journal | ObjectTracer`
  const desc  = (p.explanation || p.intro || '').slice(0, 200)
  const img = p.image_url || `${SITE}/og-image.png`
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: p.title, image: img, datePublished: p.date,
    author: { '@type': 'Organization', name: 'NASA APOD' },
    publisher: { '@type': 'Organization', name: 'ObjectTracer', logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` } },
    url: canonical,
  }
  const imgTag = p.media_type === 'image'
    ? `<img src="${esc(img)}" alt="${esc(p.title)}" style="width:100%;border-radius:10px;margin:16px 0" />` : ''
  const body = `
    <p style="font-family:monospace;color:rgba(178,255,26,0.7);font-size:.85rem">${esc(p.date)}</p>
    <h1>${esc(p.title)}</h1>
    ${imgTag}
    <p style="font-style:italic;color:rgba(200,220,240,0.9)">${esc(p.intro)}</p>
    ${blogFraming(p)}
    <h2>The science — from NASA's Astronomy Picture of the Day</h2>
    <p>${esc(p.explanation)}</p>
    ${p.copyright ? `<p style="font-size:.8rem;opacity:.6">Image credit: ${esc(p.copyright)} · Source: NASA APOD</p>` : `<p style="font-size:.8rem;opacity:.6">Source: NASA Astronomy Picture of the Day (public domain)</p>`}
    <p><a href="${SITE}/blog">← All Space Journal entries</a></p>`
  // Article OG image is the actual APOD image (passed as ogImageOverride)
  return html(canonical, title, desc, jsonLd, body, 'SPACE JOURNAL', img)
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

function html(canonical, title, desc, jsonLd, body, ogBadge, ogImageOverride) {
  const ogImg = ogImageOverride || ogImageUrl(title, desc, ogBadge)
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
  <meta property="og:image"       content="${esc(ogImg)}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="ObjectTracer" />
  <meta name="twitter:card"       content="summary_large_image" />
  <meta name="twitter:title"      content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image"      content="${esc(ogImg)}" />
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

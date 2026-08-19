// Cloudflare Pages Function — dynamic rendering for /flight/:icao24
// For bot crawlers: fetch live data from API and return pre-rendered HTML with SEO meta.
// For humans: pass through to the SPA (index.html via _redirects).

const BOT_RE =
  /googlebot|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|rogerbot|embedly|quora|outbrain|pinterestbot|semrushbot|ahrefsbot|mj12bot|dotbot/i

const API = 'https://project-x-production-1845.up.railway.app:8080'
const SITE = 'https://www.objecttracer.com'

export async function onRequestGet({ params, request, next }) {
  const ua = request.headers.get('user-agent') || ''
  if (!BOT_RE.test(ua)) return next()

  const icao24 = (params.icao24 || '').toLowerCase().replace(/[^a-f0-9]/g, '')
  if (!icao24) return next()

  const [detailRes, routeRes] = await Promise.allSettled([
    fetch(`${API}/api/v1/aircraft/${icao24}`, {
      headers: { 'x-render': 'bot' },
      cf: { cacheEverything: true, cacheTtl: 30 },
    }),
    fetch(`${API}/api/v1/aircraft/${icao24}/route`, {
      headers: { 'x-render': 'bot' },
      cf: { cacheEverything: true, cacheTtl: 3600 },
    }),
  ])

  let detail = null
  let route = null
  if (detailRes.status === 'fulfilled' && detailRes.value.ok) {
    try { detail = await detailRes.value.json() } catch (_) {}
  }
  if (routeRes.status === 'fulfilled' && routeRes.value.ok) {
    try { route = await routeRes.value.json() } catch (_) {}
  }

  const callsign   = detail?.callsign || icao24.toUpperCase()
  const reg        = detail?.registration || ''
  const aircraft   = detail?.type_description || ''
  const operator   = detail?.operator || ''
  const airborne   = detail?.current && !detail.current.on_ground
  const alt        = detail?.current?.altitude ? Math.round(detail.current.altitude) + ' ft' : null
  const spd        = detail?.current?.velocity  ? Math.round(detail.current.velocity)  + ' kts' : null

  const originIATA = route?.departure_iata || ''
  const originName = route?.departure_name || originIATA
  const destIATA   = route?.arrival_iata   || ''
  const destName   = route?.arrival_name   || destIATA
  const routeStr   = originName && destName ? `${originName} → ${destName}` : originName || destName || ''

  const titleParts = [callsign, 'Live Flight Tracker']
  if (routeStr) titleParts.splice(1, 0, routeStr)
  const title = titleParts.join(' — ') + ' | ObjectTracer'

  const descParts = [`Track ${callsign} live on ObjectTracer's real-time 3D globe.`]
  if (operator)  descParts.push(`Operated by ${operator}.`)
  if (aircraft)  descParts.push(`Aircraft: ${aircraft}${reg ? ` (${reg})` : ''}.`)
  if (routeStr)  descParts.push(`Route: ${routeStr}.`)
  if (airborne)  descParts.push(`Currently airborne${alt ? ` at ${alt}` : ''}${spd ? `, ${spd}` : ''}.`)
  else if (detail) descParts.push('Currently on the ground.')
  descParts.push('ADS-B tracking with altitude, speed, and route.')
  const desc = descParts.join(' ')

  const canonical = `${SITE}/flight/${icao24}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Flight',
    identifier: icao24,
    flightNumber: callsign,
    url: canonical,
  }
  if (operator)  jsonLd.provider = { '@type': 'Airline', name: operator }
  if (originName) jsonLd.departureAirport = { '@type': 'Airport', name: originName, ...(originIATA ? { iataCode: originIATA } : {}) }
  if (destName)   jsonLd.arrivalAirport   = { '@type': 'Airport', name: destName,   ...(destIATA   ? { iataCode: destIATA   } : {}) }

  const flightRows = [
    operator  && `<tr><th>Airline</th><td>${esc(operator)}</td></tr>`,
    aircraft  && `<tr><th>Aircraft</th><td>${esc(aircraft)}${reg ? ` <span>(${esc(reg)})</span>` : ''}</td></tr>`,
    routeStr  && `<tr><th>Route</th><td>${esc(routeStr)}</td></tr>`,
    airborne && alt && `<tr><th>Altitude</th><td>${esc(alt)}</td></tr>`,
    airborne && spd && `<tr><th>Speed</th><td>${esc(spd)}</td></tr>`,
  ].filter(Boolean).join('\n    ')

  const statusText = airborne
    ? `Currently airborne${alt ? ` at ${alt}` : ''}${spd ? `, ${spd}` : ''}.`
    : detail
      ? 'Currently on the ground.'
      : 'Live data unavailable — aircraft may be outside ADS-B coverage.'

  const html = `<!DOCTYPE html>
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
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; background: #050a0f; color: #e8f4ff; }
    a { color: #bce419; }
    h1 { font-size: 1.6rem; margin: 0 0 8px; }
    p  { color: rgba(200,220,240,0.75); line-height: 1.6; }
    table { border-collapse: collapse; margin: 16px 0; width: 100%; }
    th, td { padding: 8px 12px; text-align: left; border: 1px solid rgba(255,255,255,0.1); }
    th { background: rgba(255,255,255,0.05); font-weight: 600; width: 140px; }
    .cta { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #bce419; color: #000; font-weight: 700; border-radius: 8px; text-decoration: none; }
    nav { margin-bottom: 20px; font-size: 0.85rem; }
  </style>
</head>
<body>
  <nav><a href="${SITE}">← ObjectTracer</a></nav>
  <main>
    <h1>Track ${esc(callsign)} Live</h1>
    <p>${esc(statusText)}</p>
    ${flightRows ? `<table>${flightRows}</table>` : ''}
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>
    <p style="margin-top:32px">
      ObjectTracer provides real-time ADS-B flight tracking on an interactive 3D globe.
      Track any flight worldwide with live position, altitude, speed, and route history.
      Also tracks ships, ISS, satellites, rocket launches, asteroids, and deep-space galaxies.
    </p>
  </main>
</body>
</html>`

  return new Response(html, {
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

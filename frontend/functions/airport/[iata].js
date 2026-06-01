// Cloudflare Pages Function — dynamic rendering for /airport/:iata
// For bot crawlers: fetch live arrivals/departures, return pre-rendered HTML.
// For humans: pass through to the SPA.

const BOT_RE =
  /googlebot|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|rogerbot|embedly|quora|outbrain|pinterestbot|semrushbot|ahrefsbot|mj12bot|dotbot/i

const API  = 'https://api.objecttracer.com'
const SITE = 'https://www.objecttracer.com'

export async function onRequestGet({ params, request, next }) {
  const ua = request.headers.get('user-agent') || ''
  if (!BOT_RE.test(ua)) return next()

  const iata = (params.iata || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (!iata || iata.length < 3 || iata.length > 4) return next()

  const [arrRes, depRes] = await Promise.allSettled([
    fetch(`${API}/api/v1/airports/${iata}/arrivals`, {
      headers: { 'x-render': 'bot' },
      cf: { cacheEverything: true, cacheTtl: 60 },
    }),
    fetch(`${API}/api/v1/airports/${iata}/departures`, {
      headers: { 'x-render': 'bot' },
      cf: { cacheEverything: true, cacheTtl: 60 },
    }),
  ])

  let arrivals   = []
  let departures = []
  if (arrRes.status === 'fulfilled' && arrRes.value.ok) {
    try {
      const d = await arrRes.value.json()
      arrivals = Array.isArray(d) ? d : (d.arrivals || d.flights || [])
    } catch (_) {}
  }
  if (depRes.status === 'fulfilled' && depRes.value.ok) {
    try {
      const d = await depRes.value.json()
      departures = Array.isArray(d) ? d : (d.departures || d.flights || [])
    } catch (_) {}
  }

  const arrCount = arrivals.length
  const depCount = departures.length
  const canonical = `${SITE}/airport/${iata}`

  const title = `${iata} Airport — Live Arrivals & Departures | ObjectTracer`
  const desc  = `Live flight tracker for ${iata} Airport. ${arrCount} arrivals and ${depCount} departures currently tracked on ObjectTracer's real-time 3D globe.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Airport',
    iataCode: iata,
    name: `${iata} Airport`,
    url: canonical,
  }

  const flightRow = (f, dir) => {
    const cs   = esc(f.callsign || f.icao24 || '')
    const peer = dir === 'arr'
      ? (f.origin      || f.departure_iata || f.dep_iata || '')
      : (f.destination || f.arrival_iata   || f.arr_iata || '')
    const label = dir === 'arr' ? 'from' : 'to'
    const href  = f.icao24 ? `${SITE}/flight/${f.icao24}` : null
    const link  = href ? `<a href="${href}">${cs}</a>` : cs
    return `<tr><td>${link}</td><td>${peer ? esc(peer) : '—'}</td><td>${esc(f.altitude ? Math.round(f.altitude) + ' ft' : '—')}</td></tr>`
  }

  const arrRows = arrivals.slice(0, 15).map(f => flightRow(f, 'arr')).join('\n')
  const depRows = departures.slice(0, 15).map(f => flightRow(f, 'dep')).join('\n')

  const tableHead = `<tr><th>Flight</th><th>Route</th><th>Altitude</th></tr>`

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
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px 16px; background: #050a0f; color: #e8f4ff; }
    a { color: #b2ff1a; }
    h1 { font-size: 1.6rem; margin: 0 0 8px; }
    h2 { font-size: 1.1rem; margin: 28px 0 10px; color: #b2ff1a; }
    p  { color: rgba(200,220,240,0.75); line-height: 1.6; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
    th, td { padding: 8px 12px; text-align: left; border: 1px solid rgba(255,255,255,0.08); font-size: 0.9rem; }
    th { background: rgba(255,255,255,0.05); font-weight: 600; }
    .cta { display: inline-block; margin-top: 8px; padding: 12px 24px; background: #b2ff1a; color: #000; font-weight: 700; border-radius: 8px; text-decoration: none; }
    nav { margin-bottom: 20px; font-size: 0.85rem; }
  </style>
</head>
<body>
  <nav><a href="${SITE}">← ObjectTracer</a></nav>
  <main>
    <h1>${esc(iata)} Airport — Live Flights</h1>
    <p>${esc(arrCount)} arrivals and ${esc(String(depCount))} departures currently tracked via ADS-B.</p>
    <a class="cta" href="${canonical}">Open Live 3D Tracker →</a>

    ${arrRows ? `
    <h2>Arrivals (${arrCount})</h2>
    <table>${tableHead}${arrRows}</table>` : ''}

    ${depRows ? `
    <h2>Departures (${depCount})</h2>
    <table>${tableHead}${depRows}</table>` : ''}

    <p style="margin-top:32px">
      ObjectTracer tracks live flights at ${esc(iata)} and thousands of airports worldwide using real-time ADS-B data.
      View aircraft on an interactive 3D globe with altitude, speed, route history, and crew information.
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

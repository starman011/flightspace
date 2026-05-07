/* Per-route SEO metadata */
export const ROUTE_META = {
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
  '/profile':      { title: 'Your Profile — Tracked Flights & Launches | ObjectTracer',
                     description: 'View your tracked flights, pinned launches, and personalized settings on ObjectTracer.' },
  '/flight':       { title: 'Live Flight Tracking | ObjectTracer',
                     description: 'Track this flight live on a 3D globe with real-time position, altitude, speed, and route information.' },
  '/airport':      { title: 'Airport — Live Departures & Arrivals | ObjectTracer',
                     description: 'View live departures and arrivals at this airport with real-time flight tracking on a 3D globe.' },
}

export function routeKeyFromPath(path) {
  if (path.startsWith('/flight/'))  return '/flight'
  if (path.startsWith('/airport/')) return '/airport'
  return path
}

export function updateRouteMeta(path) {
  const base = 'https://www.objecttracer.com'
  const routeKey = routeKeyFromPath(path)
  const meta = ROUTE_META[routeKey] || ROUTE_META['/']
  const fullUrl = `${base}${path}`

  document.title = meta.title
  let canon = document.querySelector('link[rel="canonical"]')
  if (!canon) {
    canon = document.createElement('link')
    canon.rel = 'canonical'
    document.head.appendChild(canon)
  }
  canon.href = fullUrl
  const desc = document.querySelector('meta[name="description"]')
  if (desc) desc.content = meta.description
  const ogUrl   = document.querySelector('meta[property="og:url"]')
  const ogTitle = document.querySelector('meta[property="og:title"]')
  const ogDesc  = document.querySelector('meta[property="og:description"]')
  if (ogUrl)   ogUrl.content = fullUrl
  if (ogTitle) ogTitle.content = meta.title
  if (ogDesc)  ogDesc.content = meta.description
  const twUrl   = document.querySelector('meta[name="twitter:url"]')
  const twTitle = document.querySelector('meta[name="twitter:title"]')
  const twDesc  = document.querySelector('meta[name="twitter:description"]')
  if (twUrl)   twUrl.content = fullUrl
  if (twTitle) twTitle.content = meta.title
  if (twDesc)  twDesc.content = meta.description
}

export function stateToPath(selectedIcao24, activeScale, launchPanelOpen, activeFilter, profilePanelOpen, selectedAirport) {
  if (selectedIcao24)               return `/flight/${selectedIcao24}`
  if (selectedAirport)              return `/airport/${selectedAirport}`
  if (profilePanelOpen)             return '/profile'
  if (activeFilter === 'asteroids') return '/asteroids'
  if (launchPanelOpen)              return '/launches'
  if (activeScale === 'solar')      return '/solar-system'
  if (activeScale === 'galaxy')     return '/deep-space'
  if (activeScale === 'moon')       return '/moon'
  return '/'
}

export function parseInitialState(pathname) {
  const base = {
    selectedIcao24: null,
    activeScale: 'earth',
    launchPanelOpen: false,
    activeFilter: null,
    profilePanelOpen: false,
    selectedAirport: null,
    selectedLaunchId: null,
  }
  if (pathname.startsWith('/flight/'))  return { ...base, selectedIcao24: pathname.replace('/flight/', '') }
  if (pathname.startsWith('/airport/')) return { ...base, selectedAirport: pathname.replace('/airport/', '').toUpperCase() }
  if (pathname.startsWith('/launch/'))  return { ...base, launchPanelOpen: true, selectedLaunchId: pathname.replace('/launch/', '') }
  if (pathname === '/profile')      return { ...base, profilePanelOpen: true }
  if (pathname === '/solar-system') return { ...base, activeScale: 'solar' }
  if (pathname === '/deep-space')   return { ...base, activeScale: 'galaxy' }
  if (pathname === '/moon')         return { ...base, activeScale: 'moon' }
  if (pathname === '/launches')     return { ...base, launchPanelOpen: true }
  if (pathname === '/asteroids')    return { ...base, activeFilter: 'asteroids' }
  return base
}

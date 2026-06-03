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
  '/waitlist':     { title: 'Join the ObjectTracer Waitlist — Early Access',
                     description: 'Sign up for early access to ObjectTracer — real-time 3D tracking of flights, satellites, rockets, and deep space objects.' },
  '/about':        { title: 'About ObjectTracer — Real-Time 3D Space & Flight Tracking',
                     description: 'Learn about ObjectTracer, the real-time 3D globe tracking live flights, ships, ISS, satellites, rocket launches, and deep-space galaxies.' },
  '/contact':      { title: 'Contact Us | ObjectTracer',
                     description: 'Get in touch with the ObjectTracer team. Send feedback, report issues, or ask questions.' },
  '/faq':          { title: 'FAQ — Frequently Asked Questions | ObjectTracer',
                     description: 'Answers to common questions about ObjectTracer, live flight tracking, satellite data, and more.' },
  '/donate':       { title: 'Support ObjectTracer — Donate',
                     description: 'Help keep ObjectTracer free and running. Support real-time 3D tracking of flights, satellites, and space objects.' },
  '/iss':          { title: 'ISS Live Tracker — International Space Station Location, Crew & Stream | ObjectTracer',
                     description: 'Track the International Space Station live on a real-time 3D globe. Live position, altitude, speed, crew manifest, and NASA 4K live stream.' },
  '/airline':      { title: 'Live Airline Flight Tracker | ObjectTracer',
                     description: 'Track all flights for this airline live on ObjectTracer\'s real-time 3D globe. Live ADS-B position, altitude, speed, and route.' },
}

export function routeKeyFromPath(path) {
  if (path.startsWith('/flight/'))  return '/flight'
  if (path.startsWith('/airport/')) return '/airport'
  if (path.startsWith('/airline/')) return '/airline'
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

export function stateToPath(selectedIcao24, activeScale, launchPanelOpen, activeFilter, profilePanelOpen, selectedAirport, activePage) {
  if (activePage === 'waitlist') return '/waitlist'
  if (activePage === 'about')    return '/about'
  if (activePage === 'contact')  return '/contact'
  if (activePage === 'faq')      return '/faq'
  if (activePage === 'donate')   return '/donate'
  if (selectedIcao24 === 'ISS')     return '/iss'
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

// ── Landing-page lookup tables (mirror middleware.js for SPA behavior) ────────

// Airline slug → { callsign ICAO prefix, display name }
export const AIRLINE_ICAO = {
  'american-airlines':{p:'AAL',n:'American Airlines'}, 'delta':{p:'DAL',n:'Delta Air Lines'},
  'united':{p:'UAL',n:'United Airlines'}, 'southwest':{p:'SWA',n:'Southwest Airlines'},
  'alaska-airlines':{p:'ASA',n:'Alaska Airlines'}, 'jetblue':{p:'JBU',n:'JetBlue Airways'},
  'spirit':{p:'NKS',n:'Spirit Airlines'}, 'frontier':{p:'FFT',n:'Frontier Airlines'},
  'air-canada':{p:'ACA',n:'Air Canada'}, 'westjet':{p:'WJA',n:'WestJet'},
  'latam':{p:'LAN',n:'LATAM Airlines'}, 'azul':{p:'AZU',n:'Azul'}, 'gol':{p:'GLO',n:'GOL'},
  'british-airways':{p:'BAW',n:'British Airways'}, 'lufthansa':{p:'DLH',n:'Lufthansa'},
  'air-france':{p:'AFR',n:'Air France'}, 'klm':{p:'KLM',n:'KLM'}, 'ryanair':{p:'RYR',n:'Ryanair'},
  'easyjet':{p:'EZY',n:'easyJet'}, 'iberia':{p:'IBE',n:'Iberia'}, 'swiss':{p:'SWR',n:'Swiss'},
  'turkish-airlines':{p:'THY',n:'Turkish Airlines'}, 'wizz-air':{p:'WZZ',n:'Wizz Air'},
  'norwegian':{p:'NAX',n:'Norwegian'}, 'tap':{p:'TAP',n:'TAP Air Portugal'}, 'finnair':{p:'FIN',n:'Finnair'},
  'emirates':{p:'UAE',n:'Emirates'}, 'qatar-airways':{p:'QTR',n:'Qatar Airways'},
  'etihad':{p:'ETD',n:'Etihad Airways'}, 'flydubai':{p:'FDB',n:'flydubai'}, 'air-arabia':{p:'ABY',n:'Air Arabia'},
  'singapore-airlines':{p:'SIA',n:'Singapore Airlines'}, 'cathay-pacific':{p:'CPA',n:'Cathay Pacific'},
  'japan-airlines':{p:'JAL',n:'Japan Airlines'}, 'ana':{p:'ANA',n:'All Nippon Airways'},
  'korean-air':{p:'KAL',n:'Korean Air'}, 'air-asia':{p:'AXM',n:'AirAsia'}, 'qantas':{p:'QFA',n:'Qantas'},
  'indigo':{p:'IGO',n:'IndiGo'}, 'air-india':{p:'AIC',n:'Air India'}, 'spicejet':{p:'SEJ',n:'SpiceJet'},
  'vistara':{p:'VTI',n:'Vistara'}, 'akasa-air':{p:'QAL',n:'Akasa Air'}, 'air-india-express':{p:'IAX',n:'Air India Express'},
}

// City slug → { primary IATA, display name }
export const CITY_IATA = {
  'new-york':{iata:'JFK',n:'New York'}, 'london':{iata:'LHR',n:'London'}, 'paris':{iata:'CDG',n:'Paris'},
  'chicago':{iata:'ORD',n:'Chicago'}, 'los-angeles':{iata:'LAX',n:'Los Angeles'}, 'san-francisco':{iata:'SFO',n:'San Francisco'},
  'miami':{iata:'MIA',n:'Miami'}, 'dallas':{iata:'DFW',n:'Dallas'}, 'houston':{iata:'IAH',n:'Houston'},
  'washington':{iata:'IAD',n:'Washington DC'}, 'boston':{iata:'BOS',n:'Boston'}, 'seattle':{iata:'SEA',n:'Seattle'},
  'dubai':{iata:'DXB',n:'Dubai'}, 'abu-dhabi':{iata:'AUH',n:'Abu Dhabi'}, 'doha':{iata:'DOH',n:'Doha'},
  'delhi':{iata:'DEL',n:'Delhi'}, 'mumbai':{iata:'BOM',n:'Mumbai'}, 'bengaluru':{iata:'BLR',n:'Bengaluru'},
  'hyderabad':{iata:'HYD',n:'Hyderabad'}, 'chennai':{iata:'MAA',n:'Chennai'}, 'kolkata':{iata:'CCU',n:'Kolkata'},
  'kochi':{iata:'COK',n:'Kochi'}, 'ahmedabad':{iata:'AMD',n:'Ahmedabad'}, 'pune':{iata:'PNQ',n:'Pune'},
  'goa':{iata:'GOI',n:'Goa'}, 'jaipur':{iata:'JAI',n:'Jaipur'}, 'singapore':{iata:'SIN',n:'Singapore'},
  'hong-kong':{iata:'HKG',n:'Hong Kong'}, 'tokyo':{iata:'HND',n:'Tokyo'}, 'seoul':{iata:'ICN',n:'Seoul'},
  'beijing':{iata:'PEK',n:'Beijing'}, 'shanghai':{iata:'PVG',n:'Shanghai'}, 'bangkok':{iata:'BKK',n:'Bangkok'},
  'kuala-lumpur':{iata:'KUL',n:'Kuala Lumpur'}, 'istanbul':{iata:'IST',n:'Istanbul'}, 'amsterdam':{iata:'AMS',n:'Amsterdam'},
  'frankfurt':{iata:'FRA',n:'Frankfurt'}, 'munich':{iata:'MUC',n:'Munich'}, 'madrid':{iata:'MAD',n:'Madrid'},
  'rome':{iata:'FCO',n:'Rome'}, 'zurich':{iata:'ZRH',n:'Zurich'}, 'sydney':{iata:'SYD',n:'Sydney'},
  'toronto':{iata:'YYZ',n:'Toronto'}, 'johannesburg':{iata:'JNB',n:'Johannesburg'},
}

// Region slug → { center lat/lon, display name }
export const REGION_FOCUS = {
  'india':{lat:22.0,lon:79.0,n:'India'}, 'usa':{lat:39.0,lon:-98.0,n:'United States'},
  'europe':{lat:50.0,lon:10.0,n:'Europe'}, 'middle-east':{lat:25.0,lon:50.0,n:'Middle East'},
  'asia':{lat:30.0,lon:110.0,n:'Asia'}, 'australia':{lat:-25.0,lon:134.0,n:'Australia'},
  'uk':{lat:54.0,lon:-2.0,n:'United Kingdom'}, 'canada':{lat:56.0,lon:-106.0,n:'Canada'},
  'uae':{lat:24.0,lon:54.0,n:'United Arab Emirates'}, 'singapore':{lat:1.35,lon:103.8,n:'Singapore'},
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
    activePage: null,
    // Landing-page intent (drives live tracking + camera + context banner)
    airlineFilter: null,   // { prefix, name }
    routeFocus: null,      // { origin, dest }
    cityFocus: null,       // { iata, name }
    regionFocus: null,     // { lat, lon, name }
    issMode: false,
    notFound: false,
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
  if (pathname === '/')             return base
  if (pathname === '/waitlist') return { ...base, activePage: 'waitlist' }
  if (pathname === '/about')    return { ...base, activePage: 'about' }
  if (pathname === '/contact')  return { ...base, activePage: 'contact' }
  if (pathname === '/faq')      return { ...base, activePage: 'faq' }
  if (pathname === '/donate')   return { ...base, activePage: 'donate' }
  if (pathname === '/iss')              return { ...base, selectedIcao24: 'ISS', issMode: true }
  if (pathname.startsWith('/asteroid/')) return { ...base, activeFilter: 'asteroids' }

  // Airline landing: /airline/indigo → filter live flights to IndiGo
  if (pathname.startsWith('/airline/')) {
    const slug = pathname.replace('/airline/', '').toLowerCase()
    const a = AIRLINE_ICAO[slug]
    return a ? { ...base, airlineFilter: { prefix: a.p, name: a.n } } : base
  }

  // Route landing: /route/del-bom → fit camera + draw corridor between airports
  if (pathname.startsWith('/route/')) {
    const slug = pathname.replace('/route/', '').toLowerCase()
    const parts = slug.split('-')
    if (parts.length >= 2) {
      const origin = parts[0].toUpperCase()
      const dest   = parts[parts.length - 1].toUpperCase()
      if (origin.length === 3 && dest.length === 3 && origin !== dest) {
        return { ...base, routeFocus: { origin, dest } }
      }
    }
    return base
  }

  // City landing: /city/mumbai → fly to airport + open arrivals
  if (pathname.startsWith('/city/')) {
    const slug = pathname.replace('/city/', '').toLowerCase()
    const c = CITY_IATA[slug]
    return c ? { ...base, cityFocus: { iata: c.iata, name: c.n }, selectedAirport: c.iata } : base
  }

  // Region landing: /flights/india → fly to region
  if (pathname.startsWith('/flights/')) {
    const slug = pathname.replace('/flights/', '').toLowerCase()
    const r = REGION_FOCUS[slug]
    return r ? { ...base, regionFocus: { lat: r.lat, lon: r.lon, name: r.n } } : base
  }

  if (pathname.startsWith('/satellite/')) return { ...base, selectedIcao24: pathname === '/satellite/iss' ? 'ISS' : null, issMode: pathname === '/satellite/iss' }
  if (pathname.startsWith('/launch/'))  return { ...base, launchPanelOpen: true }
  if (pathname.startsWith('/airport/') && pathname.split('/').length === 3) return base
  return { ...base, notFound: true }
}

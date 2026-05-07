import { describe, it, expect, beforeEach } from 'vitest'
import { parseInitialState, stateToPath, routeKeyFromPath, updateRouteMeta, ROUTE_META } from './routing'

describe('parseInitialState', () => {
  it('parses / as default earth state', () => {
    const s = parseInitialState('/')
    expect(s.activeScale).toBe('earth')
    expect(s.selectedIcao24).toBeNull()
    expect(s.launchPanelOpen).toBe(false)
  })

  it('parses /flight/:icao24', () => {
    const s = parseInitialState('/flight/abc123')
    expect(s.selectedIcao24).toBe('abc123')
  })

  it('parses /airport/:iata and uppercases', () => {
    const s = parseInitialState('/airport/jfk')
    expect(s.selectedAirport).toBe('JFK')
  })

  it('parses /launch/:id', () => {
    const s = parseInitialState('/launch/uuid-123')
    expect(s.launchPanelOpen).toBe(true)
    expect(s.selectedLaunchId).toBe('uuid-123')
  })

  it('parses /solar-system', () => {
    expect(parseInitialState('/solar-system').activeScale).toBe('solar')
  })

  it('parses /deep-space', () => {
    expect(parseInitialState('/deep-space').activeScale).toBe('galaxy')
  })

  it('parses /moon', () => {
    expect(parseInitialState('/moon').activeScale).toBe('moon')
  })

  it('parses /launches', () => {
    expect(parseInitialState('/launches').launchPanelOpen).toBe(true)
  })

  it('parses /asteroids', () => {
    expect(parseInitialState('/asteroids').activeFilter).toBe('asteroids')
  })

  it('parses /profile', () => {
    expect(parseInitialState('/profile').profilePanelOpen).toBe(true)
  })

  it('unknown path falls back to default', () => {
    const s = parseInitialState('/unknown-page')
    expect(s.activeScale).toBe('earth')
    expect(s.selectedIcao24).toBeNull()
  })
})

describe('stateToPath', () => {
  it('returns /flight/:id when icao24 selected', () => {
    expect(stateToPath('abc123', 'earth', false, null, false, null)).toBe('/flight/abc123')
  })

  it('returns /airport/:iata when airport selected', () => {
    expect(stateToPath(null, 'earth', false, null, false, 'JFK')).toBe('/airport/JFK')
  })

  it('returns /profile when profile open', () => {
    expect(stateToPath(null, 'earth', false, null, true, null)).toBe('/profile')
  })

  it('returns /launches when launch panel open', () => {
    expect(stateToPath(null, 'earth', true, null, false, null)).toBe('/launches')
  })

  it('returns /solar-system for solar scale', () => {
    expect(stateToPath(null, 'solar', false, null, false, null)).toBe('/solar-system')
  })

  it('returns /deep-space for galaxy scale', () => {
    expect(stateToPath(null, 'galaxy', false, null, false, null)).toBe('/deep-space')
  })

  it('returns /moon for moon scale', () => {
    expect(stateToPath(null, 'moon', false, null, false, null)).toBe('/moon')
  })

  it('returns /asteroids for asteroids filter', () => {
    expect(stateToPath(null, 'earth', false, 'asteroids', false, null)).toBe('/asteroids')
  })

  it('returns / for default state', () => {
    expect(stateToPath(null, 'earth', false, null, false, null)).toBe('/')
  })

  it('flight takes priority over scale', () => {
    expect(stateToPath('abc', 'solar', true, null, false, null)).toBe('/flight/abc')
  })
})

describe('routeKeyFromPath', () => {
  it('maps /flight/xxx to /flight', () => {
    expect(routeKeyFromPath('/flight/abc123')).toBe('/flight')
  })

  it('maps /airport/xxx to /airport', () => {
    expect(routeKeyFromPath('/airport/JFK')).toBe('/airport')
  })

  it('passes through simple routes', () => {
    expect(routeKeyFromPath('/launches')).toBe('/launches')
    expect(routeKeyFromPath('/')).toBe('/')
  })
})

describe('ROUTE_META', () => {
  it('every route has title and description', () => {
    for (const [route, meta] of Object.entries(ROUTE_META)) {
      expect(meta.title, `${route} missing title`).toBeTruthy()
      expect(meta.description, `${route} missing description`).toBeTruthy()
    }
  })

  it('every sitemap route has metadata', () => {
    const sitemapRoutes = ['/', '/launches', '/solar-system', '/deep-space', '/moon', '/asteroids']
    for (const route of sitemapRoutes) {
      expect(ROUTE_META[route], `${route} missing from ROUTE_META`).toBeDefined()
    }
  })
})

describe('updateRouteMeta', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <link rel="canonical" href="https://www.objecttracer.com/" />
      <meta name="description" content="" />
      <meta property="og:url" content="" />
      <meta property="og:title" content="" />
      <meta property="og:description" content="" />
      <meta name="twitter:url" content="" />
      <meta name="twitter:title" content="" />
      <meta name="twitter:description" content="" />
    `
  })

  it('updates canonical to full URL', () => {
    updateRouteMeta('/launches')
    expect(document.querySelector('link[rel="canonical"]').href).toBe('https://www.objecttracer.com/launches')
  })

  it('updates document title', () => {
    updateRouteMeta('/moon')
    expect(document.title).toContain('Moon')
  })

  it('updates OG tags', () => {
    updateRouteMeta('/deep-space')
    expect(document.querySelector('meta[property="og:url"]').content).toBe('https://www.objecttracer.com/deep-space')
    expect(document.querySelector('meta[property="og:title"]').content).toContain('Deep Space')
  })

  it('handles /flight/:id correctly', () => {
    updateRouteMeta('/flight/abc123')
    expect(document.querySelector('link[rel="canonical"]').href).toBe('https://www.objecttracer.com/flight/abc123')
    expect(document.title).toContain('Flight')
  })

  it('falls back to root meta for unknown routes', () => {
    updateRouteMeta('/unknown')
    expect(document.title).toContain('ObjectTracer')
  })

  it('creates canonical link if none exists in HTML', () => {
    document.head.innerHTML = '' // no canonical tag
    updateRouteMeta('/launches')
    const canon = document.querySelector('link[rel="canonical"]')
    expect(canon).not.toBeNull()
    expect(canon.href).toBe('https://www.objecttracer.com/launches')
  })
})

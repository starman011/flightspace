// The 504 incident was a hang, and that is fixed by the bound in rotatePick.
// These tests cover the other half: cost. Middleware runs before Vercel's CDN
// cache and its responses are never stored there, so without coalescing a
// crawler spike multiplies upstream calls one-for-one with requests.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import middleware from '../../middleware.js'

const BOT = { 'user-agent': 'Mozilla/5.0 (compatible; AhrefsSiteAudit/6.1)' }
const req = (path, headers = BOT) =>
  new Request(`https://www.objecttracer.com${path}`, { headers })

let calls
beforeEach(() => {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url))
    // Shell fetch wants HTML; the API wants JSON. Both resolve instantly, so a
    // slow upstream is never what these tests are measuring.
    if (String(url).endsWith('/index.html')) {
      return new Response('<link rel="stylesheet" href="/a.css">', {
        headers: { 'content-type': 'text/html' },
      })
    }
    return new Response(JSON.stringify([]), {
      headers: { 'content-type': 'application/json' },
    })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const apiCalls = () => calls.filter(u => u.includes('/api/v1/')).length

describe('middleware spike resilience', () => {
  it('collapses a concurrent herd on one URL into a single render', async () => {
    const HERD = 25
    const res = await Promise.all(
      Array.from({ length: HERD }, () => middleware(req('/airport/JFK'))),
    )

    expect(res).toHaveLength(HERD)
    for (const r of res) expect(r.status).toBe(200)

    // Without coalescing this would be HERD * 2 arrivals/departures calls.
    // The point of the test is the ratio, not the exact pair count.
    expect(apiCalls()).toBeLessThanOrEqual(2)
  })

  it('serves a repeat request from cache without touching upstream', async () => {
    const first = await middleware(req('/airport/LHR'))
    expect(first.headers.get('x-mw-cache')).toBe('miss')
    const afterFirst = apiCalls()

    const second = await middleware(req('/airport/LHR'))
    expect(second.headers.get('x-mw-cache')).toBe('hit')
    expect(apiCalls()).toBe(afterFirst)

    // A cache hit must be a real page, not an empty shell.
    const body = await second.text()
    expect(body).toContain('LHR')
    expect(body).toContain('<title>')
  })

  it('keys the cache on bot vs human so /planes still branches', async () => {
    const human = { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/126' }
    // Humans get the instant SPA (undefined = pass through) on /planes...
    expect(await middleware(req('/planes', human))).toBeUndefined()
    // ...while a crawler is still served rendered HTML for the same URL. If the
    // cache key ignored the UA, whichever arrived first would poison the other.
    const bot = await middleware(req('/planes'))
    expect(bot.status).toBe(200)
    expect(await bot.text()).toContain('<title>')
  })

  it('recognises the crawlers that were silently getting a blank shell', async () => {
    // Regression guard for the incident agents. Each of these must reach the
    // rendered branch on /planes, not fall through to the empty SPA.
    for (const ua of [
      'Mozilla/5.0 (compatible; AhrefsSiteAudit/6.1; +http://ahrefs.com/robot/)',
      'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/bot)',
      'Mozilla/5.0 (compatible; Amazonbot/0.1)',
      'Mozilla/5.0 (compatible; MJ12bot/v1.4.8)',
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      'GPTBot/1.0',
      'ClaudeBot/1.0',
    ]) {
      const res = await middleware(req('/planes', { 'user-agent': ua }))
      expect(res, `${ua} fell through to the SPA`).toBeDefined()
      expect(res.status).toBe(200)
    }
  })

  it('does not cache or coalesce non-GET requests', async () => {
    const res = await middleware(
      new Request('https://www.objecttracer.com/airport/CDG', {
        method: 'POST',
        headers: BOT,
      }),
    )
    expect(res.headers.get('x-mw-cache')).toBeNull()
  })

  it('still renders a full page for a crawler, so SEO is unchanged', async () => {
    const res = await middleware(req('/airport/DXB'))
    const body = await res.text()
    for (const marker of ['<title>', 'canonical', 'application/ld+json', 'og:title']) {
      expect(body).toContain(marker)
    }
    // Indexable: nothing here may emit a noindex.
    expect(body).not.toContain('noindex')
  })
})

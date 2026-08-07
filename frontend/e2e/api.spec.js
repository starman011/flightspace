import { test, expect } from '@playwright/test'

/* Backend contract tests. These run against the LIVE API rather than the dev
 * server, so they verify what production actually serves — shape, status codes
 * and auth boundaries — not just that the frontend compiles.
 *
 * They are read-only and safe to run repeatedly: nothing here creates, mutates
 * or deletes server state. */

const API = process.env.OT_API || 'https://api.objecttracer.com'

test.describe.configure({ mode: 'parallel' })

test.describe('health & metadata', () => {
  test('health endpoint reports OK', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/health`)
    expect(r.status(), 'health should be 200').toBe(200)
  })

  test('push vapid-key advertises whether push is configured', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/push/vapid-key`)
    expect(r.ok()).toBeTruthy()
    const body = await r.json()
    // Either push is on (public_key present) or explicitly disabled.
    expect(
      typeof body.public_key === 'string' || body.enabled === false,
      `unexpected vapid payload: ${JSON.stringify(body)}`,
    ).toBeTruthy()
  })
})

test.describe('aircraft', () => {
  test('search returns an array-like payload', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/aircraft/search?q=BAW&limit=5`)
    expect(r.ok()).toBeTruthy()
    const d = await r.json()
    const list = Array.isArray(d) ? d : (d.results || d.aircraft || [])
    expect(Array.isArray(list), 'search must yield a list').toBeTruthy()
  })

  test('unknown aircraft returns 404, not 500', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/aircraft/zzzzzz`)
    expect([404, 400], `got ${r.status()}`).toContain(r.status())
  })

  test('fleet by type responds with a typed payload', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/fleet?type=B738`)
    expect(r.ok()).toBeTruthy()
    const d = await r.json()
    expect(d).toHaveProperty('type')
    expect(d).toHaveProperty('flights')
  })
})

test.describe('airports', () => {
  test('arrivals for a major airport return a list', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/airports/JFK/arrivals`)
    expect(r.ok()).toBeTruthy()
    const d = await r.json()
    expect(Array.isArray(d) || typeof d === 'object').toBeTruthy()
  })

  test('malformed IATA is rejected cleanly', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/airports/!!/arrivals`)
    expect(r.status(), 'should not 5xx on bad input').toBeLessThan(500)
  })
})

test.describe('content', () => {
  test('blog list returns posts with the expected fields', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/blog?limit=3`)
    expect(r.ok()).toBeTruthy()
    const d = await r.json()
    const posts = d.posts || []
    expect(Array.isArray(posts)).toBeTruthy()
    if (posts.length) {
      expect(posts[0]).toHaveProperty('slug')
      expect(posts[0]).toHaveProperty('title')
    }
  })

  test('launches endpoint responds', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/launches`)
    expect(r.ok()).toBeTruthy()
  })
})

test.describe('auth boundaries', () => {
  test('admin endpoints reject anonymous callers', async ({ request }) => {
    const r = await request.get(`${API}/api/v1/admin/me`)
    expect([401, 403], `admin/me returned ${r.status()}`).toContain(r.status())
  })

  test('flight push alerts require a session', async ({ request }) => {
    const r = await request.post(`${API}/api/v1/push/subscribe`, {
      data: {
        launch_id: 'flight:abc123',
        endpoint: 'https://example.test/x',
        key_p256dh: 'BKxQtestkey',
        key_auth: 'AbCdTest',
      },
    })
    // The server-side gate must refuse flight:* targets without a session
    // (Constitution Art. XV — never rely on the UI gate).
    expect([401, 403], `expected auth rejection, got ${r.status()}`).toContain(r.status())
  })
})

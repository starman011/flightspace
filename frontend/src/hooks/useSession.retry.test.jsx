import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSession } from './useSession.js'

// Every attempt fails, which is the state that used to retry every 30s forever.
function failFetch() {
  return vi.fn(() => Promise.resolve({ ok: false, status: 405 }))
}

const sessionCalls = (f) =>
  f.mock.calls.filter(([url]) => String(url).includes('/api/v1/session')).length

describe('useSession retry loop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('spaces retries out geometrically instead of hammering', async () => {
    const f = failFetch()
    vi.stubGlobal('fetch', f)

    renderHook(() => useSession())
    await act(async () => {})
    expect(sessionCalls(f)).toBe(1)

    // Nothing should fire before the first backoff elapses.
    await act(async () => { await vi.advanceTimersByTimeAsync(1900) })
    expect(sessionCalls(f)).toBe(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(sessionCalls(f)).toBe(2)

    // Second gap is twice the first: the third attempt is due at t=6000, so at
    // t=5900 it must not have fired yet.
    await act(async () => { await vi.advanceTimersByTimeAsync(3800) })
    expect(sessionCalls(f)).toBe(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(sessionCalls(f)).toBe(3)
  })

  it('does not keep retrying every 30s forever', async () => {
    const f = failFetch()
    vi.stubGlobal('fetch', f)

    renderHook(() => useSession())
    await act(async () => {})

    // Ten minutes of continuous failure. The old loop settled at a 30s ceiling,
    // which is 20 attempts in the last ten minutes alone.
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })

    expect(sessionCalls(f)).toBeLessThanOrEqual(9)
  })

  it('stops retrying once a session is created', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true, json: async () => ({ token: 'tok' }) })
    vi.stubGlobal('fetch', f)

    renderHook(() => useSession())
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })

    const after = sessionCalls(f)
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(sessionCalls(f)).toBe(after)
  })
})

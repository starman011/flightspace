import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAircraft } from './useAircraft'

// Mock useWebSocket — returns stubs, captures onSnapshot/onDelta callbacks
let capturedOnSnapshot, capturedOnDelta
vi.mock('./useWebSocket', () => ({
  useWebSocket: (token, onSnapshot, onDelta, onSolar, onViewerCount, enabled) => {
    capturedOnSnapshot = onSnapshot
    capturedOnDelta = onDelta
    return { connectionStatus: 'connected', setBounds: vi.fn(), watchObject: vi.fn() }
  },
}))

function makeAircraft(overrides = {}) {
  return { id: 'abc123', lat: 40, lon: -74, alt: 35000, cat: 'plane', grnd: false, ...overrides }
}

describe('useAircraft', () => {
  beforeEach(() => {
    capturedOnSnapshot = null
    capturedOnDelta = null
  })

  it('starts with empty aircraft map', () => {
    const { result } = renderHook(() => useAircraft('token'))
    expect(result.current.filteredAircraft.size).toBe(0)
  })

  it('populates aircraft from snapshot', () => {
    const { result } = renderHook(() => useAircraft('token'))
    act(() => capturedOnSnapshot([makeAircraft({ id: 'a1' }), makeAircraft({ id: 'a2' })]))
    expect(result.current.filteredAircraft.size).toBe(2)
  })

  it('applies delta updates (add + remove)', () => {
    const { result } = renderHook(() => useAircraft('token'))
    act(() => capturedOnSnapshot([makeAircraft({ id: 'a1' }), makeAircraft({ id: 'a2' })]))
    act(() => capturedOnDelta({ updated: [makeAircraft({ id: 'a3' })], removed: ['a1'] }))
    expect(result.current.filteredAircraft.has('a1')).toBe(false)
    expect(result.current.filteredAircraft.has('a3')).toBe(true)
    expect(result.current.filteredAircraft.size).toBe(2)
  })

  it('filters by type: planes only', () => {
    const { result } = renderHook(() => useAircraft('token'))
    act(() => capturedOnSnapshot([
      makeAircraft({ id: 'p1', cat: 'plane' }),
      makeAircraft({ id: 'h1', cat: 'helicopter' }),
      makeAircraft({ id: 's1', cat: 'satellite' }),
    ]))
    act(() => result.current.setFilters({ type: 'planes', altitude: 'all' }))
    expect(result.current.filteredAircraft.size).toBe(1)
    expect(result.current.filteredAircraft.has('p1')).toBe(true)
  })

  it('filters by type: satellites only', () => {
    const { result } = renderHook(() => useAircraft('token'))
    act(() => capturedOnSnapshot([
      makeAircraft({ id: 'p1', cat: 'plane' }),
      makeAircraft({ id: 's1', cat: 'satellite' }),
      makeAircraft({ id: 's2', cat: 'satellite' }),
    ]))
    act(() => result.current.setFilters({ type: 'satellites', altitude: 'all' }))
    expect(result.current.filteredAircraft.size).toBe(2)
  })

  it('filters by altitude: low (<10k ft)', () => {
    const { result } = renderHook(() => useAircraft('token'))
    act(() => capturedOnSnapshot([
      makeAircraft({ id: 'low', alt: 5000, cat: 'plane' }),
      makeAircraft({ id: 'mid', alt: 20000, cat: 'plane' }),
      makeAircraft({ id: 'high', alt: 38000, cat: 'plane' }),
    ]))
    act(() => result.current.setFilters({ type: 'all', altitude: 'low' }))
    expect(result.current.filteredAircraft.size).toBe(1)
    expect(result.current.filteredAircraft.has('low')).toBe(true)
  })

  it('filters by altitude: high (>30k ft)', () => {
    const { result } = renderHook(() => useAircraft('token'))
    act(() => capturedOnSnapshot([
      makeAircraft({ id: 'low', alt: 5000, cat: 'plane' }),
      makeAircraft({ id: 'high', alt: 38000, cat: 'plane' }),
    ]))
    act(() => result.current.setFilters({ type: 'all', altitude: 'high' }))
    expect(result.current.filteredAircraft.size).toBe(1)
    expect(result.current.filteredAircraft.has('high')).toBe(true)
  })

  it('altitude filter ignores satellites', () => {
    const { result } = renderHook(() => useAircraft('token'))
    act(() => capturedOnSnapshot([
      makeAircraft({ id: 'sat', cat: 'satellite', alt: 408000 }),
      makeAircraft({ id: 'low', cat: 'plane', alt: 5000 }),
    ]))
    act(() => result.current.setFilters({ type: 'all', altitude: 'low' }))
    // Satellite passes through (altitude filter only applies to planes/helicopters)
    expect(result.current.filteredAircraft.has('sat')).toBe(true)
    expect(result.current.filteredAircraft.has('low')).toBe(true)
  })

  it('clears aircraft when disabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useAircraft('token', enabled),
      { initialProps: { enabled: true } }
    )
    act(() => capturedOnSnapshot([makeAircraft({ id: 'a1' })]))
    expect(result.current.filteredAircraft.size).toBe(1)
    rerender({ enabled: false })
    expect(result.current.filteredAircraft.size).toBe(0)
  })
})

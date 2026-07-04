import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './SearchBar.module.css'
import { AIRPORTS } from '../Globe/airportData.js'

const API = import.meta.env.VITE_API_URL || ''

// Local airport/city match — instant, no API. Matches IATA code, city, or name.
function matchAirports(q) {
  const u = q.trim().toUpperCase()
  if (u.length < 2) return []
  const hits = []
  for (const a of AIRPORTS) {
    const iata = (a.iata || '').toUpperCase()
    const city = (a.city || '').toUpperCase()
    const name = (a.name || '').toUpperCase()
    let score = -1
    if (iata === u) score = 0
    else if (city === u) score = 1
    else if (city.startsWith(u)) score = 2
    else if (name.startsWith(u)) score = 3
    else if (city.includes(u) || name.includes(u)) score = 4
    if (score >= 0) hits.push({ a, score, tier: a.tier ?? 9 })
  }
  hits.sort((x, y) => x.score - y.score || x.tier - y.tier)
  return hits.slice(0, 6).map(h => ({ ...h.a, _type: 'airport' }))
}

export default function SearchBar({ open, onOpen, onClose, onSelect, activeScale }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  const isDeepSpace = activeScale === 'galaxy'

  // Open on `/` or Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        onOpen?.()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onOpen?.()
      }
      if (e.key === 'Escape' && open) {
        onClose?.()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpen, onClose])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced search
  const search = useCallback((q) => {
    clearTimeout(debounceRef.current)
    if (!q.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        if (isDeepSpace) {
          // Galaxy search — DESI catalog + SIMBAD
          const res = await fetch(`${API}/api/v1/desi/search?q=${encodeURIComponent(q)}&limit=10`)
          if (res.ok) {
            const data = await res.json()
            setResults((data.results ?? []).map(r => ({ ...r, _type: 'galaxy' })))
          }
        } else {
          // Airports/cities (instant, local) first, then live flights from the API.
          const airportHits = matchAirports(q)
          let flightHits = []
          try {
            const res = await fetch(`${API}/api/v1/aircraft/search?q=${encodeURIComponent(q)}&limit=8`, {
              credentials: 'include',
            })
            if (res.ok) {
              const data = await res.json()
              flightHits = (data.results ?? []).map(r => ({ ...r, _type: 'flight' }))
            }
          } catch { /* keep airport hits even if flight search fails */ }
          setResults([...airportHits, ...flightHits])
        }
      } catch {
        // Silently ignore search errors
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [isDeepSpace])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    search(val)
  }

  const handleSelect = (result) => {
    onSelect?.(result)
    onClose?.()
  }

  if (!open) return null

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.container}>
        <div className={styles.inputWrapper}>
          <span className={styles.prefix}>›</span>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={handleChange}
            placeholder={isDeepSpace
              ? 'search galaxy name, NGC, Messier, target ID...'
              : 'search city, airport, flight, callsign...'
            }
            spellCheck={false}
            autoComplete="off"
          />
          {loading && <span className={styles.loading}>...</span>}
        </div>

        {results.length > 0 && (
          <ul className={styles.results}>
            {results.map((r, i) => (
              r._type === 'airport' ? (
                <li key={`apt-${r.iata}`} className={styles.result} onClick={() => handleSelect(r)}>
                  <span className={styles.callsign}>{r.city} ({r.iata})</span>
                  <span className={styles.type}>{r.name} · Arrivals &amp; Departures</span>
                </li>
              ) : r._type === 'galaxy' ? (
                <li key={r.targetid || r.name || i} className={styles.result} onClick={() => handleSelect(r)}>
                  <span className={styles.callsign}>{r.name || `DESI ${r.targetid}`}</span>
                  <span className={styles.type}>
                    {r.spectype === 'QSO' ? 'Quasar' : 'Galaxy'}
                    {r.source === 'simbad' ? ' · SIMBAD' : ''}
                  </span>
                  {r.z > 0 && (
                    <span className={styles.alt}>z={r.z.toFixed(3)}</span>
                  )}
                </li>
              ) : (
                <li key={r.icao24} className={styles.result} onClick={() => handleSelect(r)}>
                  <span className={styles.callsign}>
                    {r.airline_iata && (
                      <img
                        className={styles.airlineLogo}
                        src={`https://pics.avs.io/36/36/${r.airline_iata}@2x.png`}
                        alt=""
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    )}
                    {r.callsign ?? r.icao24}
                  </span>
                  {r.type_description && (
                    <span className={styles.type}>{r.type_description}</span>
                  )}
                  {r.altitude != null && (
                    <span className={styles.alt}>{Math.round(r.altitude).toLocaleString()} ft</span>
                  )}
                </li>
              )
            ))}
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <p className={styles.empty}>
            {isDeepSpace ? 'no galaxies found' : 'no cities, airports or flights found'}
          </p>
        )}
      </div>
    </>
  )
}

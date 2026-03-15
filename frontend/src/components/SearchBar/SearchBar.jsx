import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './SearchBar.module.css'

export default function SearchBar({ open, onOpen, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

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
        const res = await fetch(`/api/v1/aircraft/search?q=${encodeURIComponent(q)}&limit=10`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setResults(data.results ?? [])
        }
      } catch {
        // Silently ignore search errors
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

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
            placeholder="search callsign, flight, icao..."
            spellCheck={false}
            autoComplete="off"
          />
          {loading && <span className={styles.loading}>...</span>}
        </div>

        {results.length > 0 && (
          <ul className={styles.results}>
            {results.map((r) => (
              <li key={r.icao24} className={styles.result} onClick={() => handleSelect(r)}>
                <span className={styles.callsign}>{r.callsign ?? r.icao24}</span>
                {r.type_description && (
                  <span className={styles.type}>{r.type_description}</span>
                )}
                {r.altitude != null && (
                  <span className={styles.alt}>{Math.round(r.altitude).toLocaleString()} ft</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {query && !loading && results.length === 0 && (
          <p className={styles.empty}>no flights found</p>
        )}
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || ''

export default function FlightLanding({ icao24, onEnable }) {
  const [callsign, setCallsign] = useState(null)
  const [operator, setOperator] = useState(null)
  const [aircraft, setAircraft] = useState(null)
  const [dot, setDot]     = useState(true)

  // Fetch basic flight info (REST, no WebSocket needed)
  useEffect(() => {
    if (!icao24 || icao24 === 'ISS') return
    fetch(`${API}/api/v1/aircraft/${icao24}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        if (data.callsign)         setCallsign(data.callsign.toUpperCase())
        if (data.operator)         setOperator(data.operator)
        if (data.type_description) setAircraft(data.type_description)
      })
      .catch(() => {})
  }, [icao24])

  // Pulsing "LIVE OFFLINE" dot
  useEffect(() => {
    const t = setInterval(() => setDot(v => !v), 700)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(4,9,14,0.93)',
      backgroundImage: `
        linear-gradient(rgba(163,230,53,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(163,230,53,0.04) 1px, transparent 1px)
      `,
      backgroundSize: '40px 40px',
      backdropFilter: 'blur(4px)',
    }}>

      {/* Radar ring decoration */}
      <div style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%',
        border: '1px solid rgba(163,230,53,0.06)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%',
        border: '1px solid rgba(163,230,53,0.06)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%',
        border: '1px solid rgba(163,230,53,0.08)', pointerEvents: 'none' }} />

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
        maxWidth: 420, width: '90%', textAlign: 'center',
      }}>

        {/* Live status indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28,
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em',
          color: 'rgba(255,80,80,0.85)', textTransform: 'uppercase',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: dot ? '#ff5050' : 'rgba(255,80,80,0.2)',
            boxShadow: dot ? '0 0 8px #ff5050' : 'none',
            transition: 'all 0.3s ease',
            flexShrink: 0,
          }} />
          Live Data: Offline
        </div>

        {/* Flight identifier */}
        <div style={{
          fontFamily: 'var(--font-mono)', fontWeight: 700,
          fontSize: callsign ? 42 : 32, color: '#fff',
          letterSpacing: '0.05em', lineHeight: 1, marginBottom: 8,
        }}>
          {callsign || icao24.toUpperCase()}
        </div>

        {/* Operator + aircraft type */}
        {operator && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: 'rgba(163,230,53,0.7)', letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: 4,
          }}>{operator}</div>
        )}
        {aircraft && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'rgba(200,220,240,0.4)', letterSpacing: '0.08em',
            marginBottom: 36,
          }}>{aircraft}</div>
        )}
        {!operator && !aircraft && (
          <div style={{ marginBottom: 36 }} />
        )}

        {/* CTA button */}
        <button
          onClick={onEnable}
          style={{
            padding: '14px 36px',
            background: 'linear-gradient(135deg, #a3e635 0%, #00e5ff 100%)',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontWeight: 700,
            fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#050a0f',
            boxShadow: `
              0 0 30px rgba(163,230,53,0.35),
              0 0 60px rgba(0,229,255,0.15),
              0 4px 20px rgba(0,0,0,0.5)
            `,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0 0 50px rgba(163,230,53,0.55), 0 0 90px rgba(0,229,255,0.25), 0 4px 24px rgba(0,0,0,0.6)'
            e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = '0 0 30px rgba(163,230,53,0.35), 0 0 60px rgba(0,229,255,0.15), 0 4px 20px rgba(0,0,0,0.5)'
            e.currentTarget.style.transform = 'none'
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 7, verticalAlign: '-1px' }}><path d="M8 5v14l11-7z" /></svg>
          Enable Live Tracking
        </button>

        <p style={{
          marginTop: 20, fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'rgba(200,220,240,0.35)', letterSpacing: '0.06em', lineHeight: 1.6,
        }}>
          Real-time ADS-B · 3D Globe · Live Position<br />
          Altitude · Speed · Route History
        </p>
      </div>
    </div>
  )
}

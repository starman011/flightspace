// Legend for the wind layer — explains the particle colour ramp (calm→storm).
// Colours mirror SPEED_STOPS in WindLayer.js exactly. Speeds shown in km/h
// (m/s × 3.6) since that's the more familiar unit.
const STOPS = [
  { c: '#90caf9', ms: 0,  label: 'Calm' },
  { c: '#4dd0e1', ms: 5,  label: 'Light' },
  { c: '#81c784', ms: 10, label: 'Moderate' },
  { c: '#fff176', ms: 16, label: 'Fresh' },
  { c: '#ffb74d', ms: 22, label: 'Strong' },
  { c: '#ef5350', ms: 32, label: 'Storm' },
]

const GRADIENT = `linear-gradient(to right, ${STOPS.map(s => s.c).join(', ')})`

export default function WindLegend() {
  return (
    <div
      style={{
        position: 'fixed', bottom: 92, left: 16, zIndex: 500,
        background: 'rgba(6,12,18,0.82)', backdropFilter: 'blur(14px)',
        border: '1px solid rgba(178,255,26,0.18)', borderRadius: 12,
        padding: '10px 12px 9px', width: 188,
        boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        fontFamily: 'var(--font-mono, monospace)',
        animation: 'windLegendIn 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <style>{`@keyframes windLegendIn{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'rgba(178,255,26,0.85)', fontWeight: 700,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M3 12h15a3 3 0 1 1-3 3" /><path d="M3 16h7a3 3 0 1 1-3 3" />
        </svg>
        Wind Speed
      </div>

      {/* Colour bar */}
      <div style={{ height: 9, borderRadius: 5, background: GRADIENT, marginBottom: 5 }} />

      {/* Tick labels — calm / mid / storm */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: 'rgba(200,220,240,0.55)', letterSpacing: '0.04em' }}>
        <span>0</span>
        <span>{Math.round(16 * 3.6)}</span>
        <span>{Math.round(32 * 3.6)}+ km/h</span>
      </div>

      {/* Named bands */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, gap: 2 }}>
        {STOPS.map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.c, marginBottom: 3,
              boxShadow: `0 0 5px ${s.c}` }} />
            <span style={{ fontSize: 7.5, color: 'rgba(200,220,240,0.5)', letterSpacing: '0.02em',
              transform: 'rotate(0deg)', whiteSpace: 'nowrap' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

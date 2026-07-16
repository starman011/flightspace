import { useState } from 'react'

// Top context banner shown when arriving via an SEO landing page
// (/airline/*, /route/*, /city/*, /flights/*). Tells the visitor exactly
// what they're looking at so the page never feels like a generic homepage.
// Minimalist SVG glyph per landing kind (no emoji — constitution Art. 2.2)
function KindIcon({ kind }) {
  const p = {
    region:    <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" /></>,
    city:      <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />,
    satellite: <><path d="M4 13l7-7M11 6l3 3M8 9l3 3" /><circle cx="17.5" cy="17.5" r="2.5" /><path d="M13 15l2 2" /></>,
    airline:   <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />,
  }[kind] || <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
  const stroke = kind === 'region' || kind === 'satellite'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24"
      fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
  )
}

export default function ContextBanner({ kind, logo, label, sublabel, count, onClear }) {
  const [closed, setClosed] = useState(false)
  if (closed) return null

  return (
    <div
      style={{
        position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 600, display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(6,12,18,0.86)', backdropFilter: 'blur(18px)',
        border: '1px solid rgba(178,255,26,0.35)', borderRadius: 100,
        padding: 8, maxWidth: '92vw',
        boxShadow: '0 6px 28px rgba(0,0,0,0.45), 0 0 18px rgba(178,255,26,0.08)',
        animation: 'ctxBannerIn 0.5s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <style>{`
        @keyframes ctxBannerIn {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {count != null && (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(178,255,26,0.12)', borderRadius: 100,
          padding: '4px 11px', flexShrink: 0,
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, color: '#b2ff1a',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#b2ff1a',
            boxShadow: '0 0 6px #b2ff1a' }} />
          {count} live
        </span>
      )}

      {logo ? (
        <img
          src={logo} alt="" loading="lazy"
          style={{ width: 22, height: 22, borderRadius: 5, background: 'rgba(255,255,255,0.92)',
            objectFit: 'contain', flexShrink: 0 }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <span style={{ display: 'flex', flexShrink: 0, color: 'var(--primary-container, #b2ff1a)' }}><KindIcon kind={kind} /></span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12,
          color: '#fff', letterSpacing: '0.04em', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{label}</span>
        {sublabel && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'rgba(178,255,26,0.75)', letterSpacing: '0.04em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{sublabel}</span>
        )}
      </div>

      <button
        onClick={() => { setClosed(true); onClear?.() }}
        style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
          color: 'rgba(200,220,240,0.6)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Clear"
      >×</button>
    </div>
  )
}

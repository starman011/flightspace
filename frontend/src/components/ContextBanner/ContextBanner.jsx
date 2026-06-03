import { useState } from 'react'

// Top context banner shown when arriving via an SEO landing page
// (/airline/*, /route/*, /city/*, /flights/*). Tells the visitor exactly
// what they're looking at so the page never feels like a generic homepage.
export default function ContextBanner({ icon = '✈', label, sublabel, count, onClear }) {
  const [closed, setClosed] = useState(false)
  if (closed) return null

  return (
    <div
      style={{
        position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 600, display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(6,12,18,0.86)', backdropFilter: 'blur(18px)',
        border: '1px solid rgba(178,255,26,0.35)', borderRadius: 100,
        padding: '8px 8px 8px 18px', maxWidth: '92vw',
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

      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>

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

import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

// Dynamic Open Graph image generator (1200×630 PNG) for social sharing.
// Usage: /api/og?title=...&subtitle=...&badge=...
// Used by homepage and every pre-rendered page (flight, airport, route, ISS…).
export default function handler(request) {
  const { searchParams } = new URL(request.url)
  const title    = (searchParams.get('title')    || 'Live Flight Tracker').slice(0, 80)
  const subtitle = (searchParams.get('subtitle') || 'Flights · Ships · ISS · Satellites · Rockets · Asteroids').slice(0, 120)
  const badge    = (searchParams.get('badge')    || 'REAL-TIME 3D GLOBE').slice(0, 40)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#050a0f',
          backgroundImage:
            'radial-gradient(circle at 78% 28%, rgba(178,255,26,0.16) 0%, transparent 42%), radial-gradient(circle at 20% 80%, rgba(0,229,255,0.10) 0%, transparent 45%)',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top row: brand + badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #b2ff1a 0%, #00e5ff 100%)',
                marginRight: '18px', display: 'flex',
              }}
            />
            <div style={{ color: '#ffffff', fontSize: '30px', fontWeight: 700, letterSpacing: '-0.5px' }}>
              ObjectTracer
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              color: '#b2ff1a',
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '3px',
              border: '1px solid rgba(178,255,26,0.4)',
              borderRadius: '100px',
              padding: '8px 20px',
            }}
          >
            {badge}
          </div>
        </div>

        {/* Center: title + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: '72px',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-2px',
              maxWidth: '1000px',
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: 'flex',
              color: 'rgba(200,220,240,0.62)',
              fontSize: '30px',
              fontWeight: 400,
              marginTop: '24px',
              maxWidth: '980px',
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Bottom row: url + live dot */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', color: 'rgba(200,220,240,0.5)', fontSize: '24px', fontWeight: 500 }}>
            objecttracer.com
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: '14px', height: '14px', borderRadius: '50%',
                background: '#b2ff1a', marginRight: '12px', display: 'flex',
              }}
            />
            <div style={{ display: 'flex', color: '#b2ff1a', fontSize: '22px', fontWeight: 700, letterSpacing: '2px' }}>
              LIVE
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

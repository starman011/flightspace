import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

// Plain-JS hyperscript helper — produces the element-shaped objects Satori
// (inside @vercel/og) consumes. Avoids JSX so Vercel builds this as a normal
// .js edge function (JSX .jsx files are not compiled in this Vite project).
function h(type, style, children) {
  return { type, props: { style, children } }
}

// Dynamic Open Graph image generator (1200×630 PNG) for social sharing.
// Usage: /api/og?title=...&subtitle=...&badge=...
export default function handler(request) {
  const { searchParams } = new URL(request.url)
  const title    = (searchParams.get('title')    || 'Live Flight Tracker').slice(0, 80)
  const subtitle = (searchParams.get('subtitle') || 'Flights · Ships · ISS · Satellites · Rockets · Asteroids').slice(0, 120)
  const badge    = (searchParams.get('badge')    || 'REAL-TIME 3D GLOBE').slice(0, 40)

  const tree = h('div', {
    width: '1200px',
    height: '630px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    background: '#050a0f',
    backgroundImage:
      'radial-gradient(circle at 78% 28%, rgba(188,228,25,0.16) 0%, transparent 42%), radial-gradient(circle at 20% 80%, rgba(0,229,255,0.10) 0%, transparent 45%)',
    padding: '64px 72px',
    fontFamily: 'sans-serif',
  }, [
    // Top row: brand + badge
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
      h('div', { display: 'flex', alignItems: 'center' }, [
        h('div', {
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #bce419 0%, #00e5ff 100%)',
          marginRight: '18px', display: 'flex',
        }, ''),
        h('div', { color: '#ffffff', fontSize: '30px', fontWeight: 700, letterSpacing: '-0.5px' }, 'ObjectTracer'),
      ]),
      h('div', {
        display: 'flex', color: '#bce419', fontSize: '18px', fontWeight: 700,
        letterSpacing: '3px', border: '1px solid rgba(188,228,25,0.4)',
        borderRadius: '100px', padding: '8px 20px',
      }, badge),
    ]),
    // Center: title + subtitle
    h('div', { display: 'flex', flexDirection: 'column' }, [
      h('div', {
        display: 'flex', color: '#ffffff', fontSize: '72px', fontWeight: 800,
        lineHeight: 1.05, letterSpacing: '-2px', maxWidth: '1000px',
      }, title),
      h('div', {
        display: 'flex', color: 'rgba(200,220,240,0.62)', fontSize: '30px',
        fontWeight: 400, marginTop: '24px', maxWidth: '980px',
      }, subtitle),
    ]),
    // Bottom row: url + live dot
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
      h('div', { display: 'flex', color: 'rgba(200,220,240,0.5)', fontSize: '24px', fontWeight: 500 }, 'objecttracer.com'),
      h('div', { display: 'flex', alignItems: 'center' }, [
        h('div', {
          width: '14px', height: '14px', borderRadius: '50%',
          background: '#bce419', marginRight: '12px', display: 'flex',
        }, ''),
        h('div', { display: 'flex', color: '#bce419', fontSize: '22px', fontWeight: 700, letterSpacing: '2px' }, 'LIVE'),
      ]),
    ]),
  ])

  return new ImageResponse(tree, { width: 1200, height: 630 })
}

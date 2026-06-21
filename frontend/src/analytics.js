// Google Analytics 4 — activates only when VITE_GA_ID is set (Vercel env var).
// GA4 Measurement IDs are public (visible in page source), so env is just for
// convenience/flexibility, not secrecy.
const DEFAULT_GA_ID = 'G-WKM9W2VDVT'

export function initGA() {
  const id = import.meta.env.VITE_GA_ID || DEFAULT_GA_ID
  if (!id) return
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
  document.head.appendChild(s)
  window.dataLayer = window.dataLayer || []
  function gtag() { window.dataLayer.push(arguments) }
  window.gtag = gtag
  gtag('js', new Date())
  // Disable Google Signals / ad-personalization so GA doesn't fire ad-audience
  // beacons to google.com / google.<cc> domains (they tripped CSP and add noise).
  gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false })
}

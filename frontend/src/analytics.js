// Google Analytics 4 — activates only when VITE_GA_ID is set (Vercel env var).
// GA4 Measurement IDs are public (visible in page source), so env is just for
// convenience/flexibility, not secrecy.
export function initGA() {
  const id = import.meta.env.VITE_GA_ID
  if (!id) return
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
  document.head.appendChild(s)
  window.dataLayer = window.dataLayer || []
  function gtag() { window.dataLayer.push(arguments) }
  window.gtag = gtag
  gtag('js', new Date())
  gtag('config', id)
}

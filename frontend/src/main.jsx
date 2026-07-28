import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import App from './App.jsx'
import { initGA } from './analytics.js'
import './styles/global.css'
import './styles/tokens.css'

inject()
initGA()

// After a redeploy, a tab still holding the previous index.html requests a lazy
// chunk whose content-hash no longer exists on the server (404) → "Failed to
// fetch dynamically imported module". Recover by reloading once to pull the
// fresh index.html + current chunk names. Time-guarded so a genuinely missing
// chunk can't spin the page in a reload loop.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  const KEY = 'ot-chunk-reload-at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

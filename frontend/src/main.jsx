import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import App from './App.jsx'
import { initGA } from './analytics.js'
import './styles/global.css'
import './styles/tokens.css'

inject()
initGA()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

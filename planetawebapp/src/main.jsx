import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// servicio de fondo para los avisos push (no guarda nada en caché)
if ('serviceWorker' in navigator && window.isSecureContext) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))

// los errores del navegador de cada persona llegan al panel «Rendimiento y errores» (máx. 5 por carga)
let avisados = 0
const avisar = (msg, donde) => { if (avisados++ >= 5) return; try { navigator.sendBeacon('/api/client-error', new Blob([JSON.stringify({ msg, where: donde })], { type: 'application/json' })) } catch { /* sin red */ } }
addEventListener('error', e => avisar(e.message || 'error', String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0)))
addEventListener('unhandledrejection', e => avisar('promesa: ' + ((e.reason && e.reason.message) || e.reason), ''))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { useEffect, useState } from 'react'
// Cámaras en vivo y reto del día: se cargan una vez y se actualizan solo cuando el servidor avisa
let state = { cams: [], daily: null }
const subs = new Set(), set = p => { state = { ...state, ...p }; subs.forEach(f => f(state)) }
let started = false
const loadCams = () => fetch('/api/cams').then(r => r.json()).then(d => set({ cams: d.cams || [] })).catch(() => {})
export const loadDaily = () => fetch('/api/daily').then(r => r.json()).then(d => set({ daily: d })).catch(() => {})
function start() {
  if (started) return; started = true; loadCams(); loadDaily()
  addEventListener('planeta:cams', loadCams); addEventListener('planeta:settings', loadDaily)
  let t; addEventListener('planeta:post', () => { clearTimeout(t); t = setTimeout(loadDaily, 1500) })
  setInterval(loadDaily, 10 * 60e3) // por si cambia el día
}
export function useLive() {
  const [s, setS] = useState(state)
  useEffect(() => { start(); subs.add(setS); setS(state); return () => subs.delete(setS) }, [])
  return s
}
export const camSrc = c => c.kind === 'channel'
  ? `https://www.youtube-nocookie.com/embed/live_stream?channel=${c.yt}&autoplay=1&mute=1&playsinline=1`
  : `https://www.youtube-nocookie.com/embed/${c.yt}?autoplay=1&mute=1&playsinline=1&rel=0`

import { useEffect, useState } from 'react'
// Paseos en vivo: lista compartida por toda la web, actualizada por eventos del servidor (sin consultas repetidas)
let state = { list: [], loaded: false }
const subs = new Set(), set = p => { state = { ...state, ...p }; subs.forEach(f => f(state)) }
let started = false, reloadT = null
const reload = () => { clearTimeout(reloadT); reloadT = setTimeout(() => fetch('/api/walks/live').then(r => r.json()).then(d => set({ list: d.walks || [], loaded: true })).catch(() => {}), 300) }
function start() {
  if (started) return; started = true; reload()
  addEventListener('planeta:walks', reload)
  addEventListener('planeta:walkpos', e => { const d = e.detail; if (!state.list.some(w => w.id === d.walk)) return reload(); set({ list: state.list.map(w => w.id === d.walk ? { ...w, lat: d.lat, lon: d.lon, dist: d.dist, viewers: d.viewers, at: Date.now() } : w) }) })
  addEventListener('planeta:walkend', e => set({ list: state.list.filter(w => w.id !== e.detail.walk) }))
}
export function useWalks() {
  const [s, setS] = useState(state)
  useEffect(() => { start(); subs.add(setS); setS(state); return () => subs.delete(setS) }, [])
  return s
}
export const km = m => m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m || 0) + ' m'

import { useEffect, useState } from 'react'
// Radio compartida por toda la web: una sola etiqueta <audio>, el sonido sigue al navegar.
// El audio va directo de la emisora al oyente: no pasa por nuestro servidor.
let state = { stations: [], cur: null, playing: false, loading: false, error: '', volume: 0.8 }, audio = null
const subs = new Set()
const set = p => { state = { ...state, ...p }; subs.forEach(f => f(state)) }
try { const v = parseFloat(localStorage.getItem('radioVol')); if (v >= 0 && v <= 1) state.volume = v } catch {}
function el() {
  if (audio) return audio
  audio = new Audio(); audio.preload = 'none'; audio.volume = state.volume
  audio.addEventListener('playing', () => set({ playing: true, loading: false, error: '' }))
  audio.addEventListener('pause', () => set({ playing: false, loading: false }))
  audio.addEventListener('waiting', () => set({ loading: true }))
  audio.addEventListener('error', () => { if (state.cur && audio.getAttribute('src')) set({ playing: false, loading: false, error: 'Esta emisora no responde ahora. Prueba otra.' }) })
  return audio
}
// soltar la conexión al pausar (una radio en vivo seguiría descargando)
const release = a => { a.pause(); a.removeAttribute('src'); a.load() }
export function play(st) {
  const a = el(); if (state.cur?.id === st.id && state.playing) return
  a.src = st.stream; set({ cur: st, loading: true, error: '' })
  a.play().catch(() => set({ loading: false, playing: false, error: 'Toca ▶ para escuchar.' }))
}
export function toggle() {
  const a = el(); if (!state.cur) return
  if (state.playing || state.loading) { release(a); set({ playing: false, loading: false }) } else play(state.cur)
}
export function stop() { if (audio) release(audio); set({ cur: null, playing: false, loading: false, error: '' }) }
export function setVolume(v) { el().volume = v; set({ volume: v }); try { localStorage.setItem('radioVol', v) } catch {} }
export async function loadStations() {
  try { const d = await fetch('/api/stations').then(r => r.json()); const list = d.stations || []; set({ stations: list }); if (state.cur && !list.some(s => s.id === state.cur.id)) stop() } catch {}
}
export function useRadio() {
  const [s, setS] = useState(state)
  useEffect(() => { subs.add(setS); setS(state); return () => subs.delete(setS) }, [])
  return s
}

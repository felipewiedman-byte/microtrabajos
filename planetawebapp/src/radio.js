import { useEffect, useState } from 'react'
// Radio compartida por toda la web: una sola etiqueta <audio>, el sonido sigue al navegar.
// El audio va directo de la emisora al oyente: no pasa por nuestro servidor.
const FAV_KEY = 'radioFav'
const readFav = () => { try { const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); return Array.isArray(v) ? v.filter(s => s && s.id && /^https:\/\//.test(s.stream || '')).slice(0, 100) : [] } catch { return [] } }
let state = { stations: [], cur: null, playing: false, loading: false, error: '', volume: 0.8, dial: false, fav: readFav() }, audio = null
const subs = new Set()
const set = p => { state = { ...state, ...p }; subs.forEach(f => f(state)) }
try { const v = parseFloat(localStorage.getItem('radioVol')); if (v >= 0 && v <= 1) state.volume = v } catch {}
function el() {
  if (audio) return audio
  audio = new Audio(); audio.preload = 'none'; audio.volume = state.volume
  audio.addEventListener('playing', () => { skips = 0; clearTimeout(stallT); set({ playing: true, loading: false, error: '' }) })
  audio.addEventListener('pause', () => set({ playing: false, loading: false }))
  audio.addEventListener('waiting', () => set({ loading: true }))
  audio.addEventListener('error', () => { if (state.cur && audio.getAttribute('src')) { if (state.dial && skips < 6) return skipDead(); set({ playing: false, loading: false, error: 'Esta emisora no responde ahora. Prueba otra.' }) } })
  return audio
}
// soltar la conexión al pausar (una radio en vivo seguiría descargando)
const release = a => { a.pause(); a.removeAttribute('src'); a.load() }
const start = st => {
  const a = el(); if (state.cur?.id === st.id && state.playing) return
  a.src = st.stream; set({ cur: st, loading: true, error: '' })
  clearTimeout(stallT); if (state.dial) stallT = setTimeout(() => { if (!state.playing && state.cur?.id === st.id) skipDead() }, 12e3)   // si no arranca en 12 s, pasa a otra
  a.play().catch(() => set({ loading: false, playing: false, error: 'Toca ▶ para escuchar.' }))
}
export function play(st) { set({ dial: false }); start(st) }

// ---- Girar el dial: pasa a otra emisora del mundo (las tuyas y las del directorio, mezcladas). Nada se guarda en el servidor. ----
let pool = [], hist = [], fetching = false, skips = 0, stallT = null
const seen = new Set()
async function refill() {
  if (fetching) return; fetching = true
  try { const d = await fetch('/api/radio/mix').then(r => r.ok ? r.json() : null); for (const s of (d?.stations || [])) if (!seen.has(s.id)) pool.push(s) } catch { /* sin red: se usan las de la lista */ } finally { fetching = false }
}
const pickOwn = () => { const c = state.stations.filter(s => !seen.has(s.id)); return c.length ? c[Math.floor(Math.random() * c.length)] : null }
export async function next(auto) {
  if (auto !== true) skips = 0   // si lo pide la persona, vuelve a contar desde cero
  let st = (Math.random() < 0.3 && pickOwn()) || pool.shift()
  if (!st) { await refill(); st = pool.shift() || pickOwn() || (seen.clear(), pickOwn()) }
  if (!st) return
  if (pool.length < 8) refill()
  if (state.cur) { hist.push(state.cur); if (hist.length > 30) hist.shift() }
  seen.add(st.id); set({ dial: true }); start(st)
}
export function prev() { const st = hist.pop(); if (st) { set({ dial: true }); start(st) } }
function skipDead() { skips++; set({ error: 'Esa emisora no responde, probando otra…', loading: true }); setTimeout(() => { if (state.dial) next(true) }, 900) }
export function toggleFav(st) {
  const f = state.fav.some(x => x.id === st.id) ? state.fav.filter(x => x.id !== st.id) : [{ id: st.id, name: st.name, stream: st.stream, country: st.country || '', city: st.city || '', genre: st.genre || '', logo: st.logo || '' }, ...state.fav].slice(0, 100)
  try { localStorage.setItem(FAV_KEY, JSON.stringify(f)) } catch { /* sin almacenamiento */ }
  set({ fav: f })
}
export function toggle() {
  const a = el(); if (!state.cur) return
  if (state.playing || state.loading) { release(a); set({ playing: false, loading: false }) } else play(state.cur)
}
export function stop() { clearTimeout(stallT); if (audio) release(audio); set({ cur: null, playing: false, loading: false, error: '', dial: false }) }
export function setVolume(v) { el().volume = v; set({ volume: v }); try { localStorage.setItem('radioVol', v) } catch {} }
export async function loadStations() {
  try { const d = await fetch('/api/stations').then(r => r.json()); const list = d.stations || []; set({ stations: list }); if (state.cur && !list.some(s => s.id === state.cur.id)) stop() } catch {}
}
export function useRadio() {
  const [s, setS] = useState(state)
  useEffect(() => { subs.add(setS); setS(state); return () => subs.delete(setS) }, [])
  return s
}

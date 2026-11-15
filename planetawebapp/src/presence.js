import { useEffect, useState } from 'react'

// «Mostrarme en el mapa»: solo si la persona lo activa. Es liviano a propósito:
// - el teléfono avisa su posición como máximo cada 30 s, y solo si se movió más de 150 m;
// - si está quieta, manda un aviso mínimo («sigo aquí») cada 90 s;
// - solo manda mientras la web está a la vista; al apagar o cerrar, desaparece del mapa.
const K = 'hereOn', KX = 'hereExact', MOVE_M = 150, TICK = 30e3, KEEP = 90e3
const read = k => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const write = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* sin almacenamiento */ } }
const dist = (a, b) => { const R = 6371e3, r = Math.PI / 180, dp = (b.lat - a.lat) * r, dl = (b.lon - a.lon) * r, x = Math.sin(dp / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)) }
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), keepalive: true }).catch(() => {})

let tracker = null
function start(exact) {
  stop(false)
  if (!navigator.geolocation) return false
  const st = { cur: null, sent: null, at: 0, exact, watch: null, timer: null }
  const flush = force => {
    if (document.hidden || !st.cur) return
    const now = Date.now(), moved = !st.sent || dist(st.sent, st.cur) > MOVE_M || st.exact !== st.sentExact
    if (moved || force) { st.sent = { ...st.cur }; st.sentExact = st.exact; st.at = now; post('/api/here', { lat: st.cur.lat, lon: st.cur.lon, exact: st.exact }) }
    else if (now - st.at > KEEP) { st.at = now; post('/api/here', { ka: 1 }) }
  }
  st.watch = navigator.geolocation.watchPosition(p => { const first = !st.cur; st.cur = { lat: p.coords.latitude, lon: p.coords.longitude }; if (first) flush(true) }, () => {}, { enableHighAccuracy: false, maximumAge: 30e3, timeout: 60e3 })
  st.timer = setInterval(() => flush(false), TICK)
  st.vis = () => { if (!document.hidden) flush(false) }; st.off = () => { try { navigator.sendBeacon('/api/here/off', new Blob(['{}'], { type: 'application/json' })) } catch { /* sin beacon */ } }
  document.addEventListener('visibilitychange', st.vis); addEventListener('pagehide', st.off)
  tracker = st; return true
}
function stop(tell = true) {
  const st = tracker; if (!st) return
  navigator.geolocation.clearWatch(st.watch); clearInterval(st.timer); document.removeEventListener('visibilitychange', st.vis); removeEventListener('pagehide', st.off)
  tracker = null; if (tell) post('/api/here/off')
}

// estado del interruptor para la pantalla de perfil
export function useHere(user) {
  const [on, setOn] = useState(() => read(K)), [exact, setExact] = useState(() => read(KX)), [msg, setMsg] = useState('')
  useEffect(() => {
    if (!user || !on) { stop(false); return }
    if (!start(exact)) { setOn(false); write(K, false); setMsg('Tu navegador no permite usar la ubicación.') }
    return () => stop(false)
  }, [user?.id, on, exact])
  const toggle = async v => {
    setMsg('')
    if (!v) { write(K, false); setOn(false); stop(true); return }
    if (!read('hereAdult') && !confirm('Para mostrarte en el mapa confirma que eres mayor de edad. Tu foto y tu nombre se verán donde estés mientras tengas la web abierta. Puedes apagarlo cuando quieras.')) return
    write('hereAdult', true)
    // pide el permiso de ubicación ahora, para avisar si lo niega
    const ok = await new Promise(res => navigator.geolocation ? navigator.geolocation.getCurrentPosition(() => res(true), () => res(false), { timeout: 15e3, maximumAge: 60e3 }) : res(false))
    if (!ok) { setMsg('Sin permiso de ubicación no se puede mostrar. Actívalo en el candado de la barra del navegador.'); return }
    write(K, true); setOn(true)
  }
  const chooseExact = v => { write(KX, v); setExact(v) }
  return { on, exact, msg, toggle, chooseExact }
}

// personas de la zona que se está mirando: se pide cada 30 s y cuando se mueve el mapa (con espera)
export function usePeople(bounds, enabled) {
  const [data, setData] = useState({ singles: [], groups: [], total: 0 })
  useEffect(() => {
    if (!enabled || !bounds) return
    let alive = true, t = null
    const load = () => { if (document.hidden) return; fetch(`/api/here?s=${bounds.s}&n=${bounds.n}&w=${bounds.w}&e=${bounds.e}&z=${bounds.z}`).then(r => r.ok ? r.json() : null).then(d => { if (alive && d) setData(d) }).catch(() => {}) }
    t = setTimeout(load, 500)
    const iv = setInterval(load, 30e3)
    return () => { alive = false; clearTimeout(t); clearInterval(iv) }
  }, [bounds?.s, bounds?.n, bounds?.w, bounds?.e, bounds?.z, enabled])
  return data
}

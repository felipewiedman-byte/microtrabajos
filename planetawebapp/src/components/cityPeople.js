// Gente en la ciudad 3D: muñequitos de quienes escribieron en la Sala de la ciudad (últimas 24 h), parados sobre calles
// reales cerca del lugar que se mira, y globos de chat con cada mensaje nuevo. Posición VIRTUAL (no es la ubicación real).
// Liviano: 1 consulta al abrir la ciudad (la misma de la Sala); los mensajes nuevos llegan con el aviso que ya existe.
import maplibregl from 'maplibre-gl'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const okImg = u => /^(https:\/\/|\/)[^\s"'<>]+$/.test(String(u || ''))
const hash = n => { let x = (Number(n) || 1) * 2654435761 % 4294967296; return x / 4294967296 }

export function cityPeople(m, { me, onPick } = {}) {
  const marks = new Map(), timers = new Set(), anim = new Map()
  let spots = null
  // puntos sobre calles reales a menos de ~300 m del centro (con los datos del mapa ya descargados)
  function streetSpots() {
    if (spots) return spots
    const c = m.getCenter(), kx = 111320 * Math.cos(c.lat * Math.PI / 180), out = []
    try {
      for (const f of m.querySourceFeatures('omt', { sourceLayer: 'transportation' })) {
        if (!['minor', 'service', 'tertiary', 'secondary', 'path', 'pedestrian', 'primary'].includes(f.properties.class)) continue
        const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : []
        for (const l of lines) for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
          if (Math.hypot((mid[0] - c.lng) * kx, (mid[1] - c.lat) * 110574) < 300) out.push(mid) }
      }
    } catch { /* sin datos de calles todavía */ }
    spots = out.length ? out : null
    return spots
  }
  function where(uid) {
    const s = streetSpots()
    if (s) return s[Math.floor(hash(uid) * s.length)]
    const c = m.getCenter(), a = hash(uid) * 2 * Math.PI, r = 60 + hash(uid + 7) * 180
    return [c.lng + Math.cos(a) * r / (111320 * Math.cos(c.lat * Math.PI / 180)), c.lat + Math.sin(a) * r / 110574]
  }
  function add(p) {
    if (marks.has(p.user_id)) return marks.get(p.user_id)
    const d = document.createElement('div'); d.className = 'cp-guy' + (me && p.user_id === me ? ' me' : '');
    d.addEventListener('click', e => { e.stopPropagation(); if (p.user_id !== me) onPick?.(p.user_id) }); d.style.setProperty('--h', (+p.hue || 200) + '')
    d.innerHTML = `<div class="cp-say"></div><div class="cp-head">${okImg(p.avatar) ? `<img src="${esc(p.avatar)}" alt="">` : `<b>${esc(String(p.author || '?').trim().charAt(0).toUpperCase())}</b>`}</div><div class="cp-body"></div><i class="cp-shadow"></i><em class="cp-name">${esc(String(p.author || '').split(' ')[0])}</em>`
    const mk = new maplibregl.Marker({ element: d, anchor: 'bottom' }).setLngLat(p.lat != null ? [p.lon, p.lat] : where(p.user_id)).addTo(m)
    marks.set(p.user_id, mk); return mk
  }
  return {
    // personas de la Sala (lista de mensajes de la ciudad): las de las últimas 24 h, máximo 14
    set(msgs) {
      const day = Date.now() - 864e5, seen = new Map()
      for (const x of (msgs || []).slice().reverse()) if (x.at > day && !seen.has(x.user_id)) seen.set(x.user_id, x)
      const want = [...seen.values()].slice(0, 14), ids = new Set(want.map(x => x.user_id))
      for (const [id, mk] of marks) if (!ids.has(id)) { mk.remove(); marks.delete(id) }
      want.forEach(add)
    },
    // mensaje nuevo: globo sobre su cabeza durante 8 s
    say(msg) {
      if (!msg?.user_id) return
      const el = add(msg).getElement(), b = el.querySelector('.cp-say')
      b.textContent = String(msg.text || '').slice(0, 90) + (String(msg.text || '').length > 90 ? '…' : ''); el.classList.add('talk')
      const t = setTimeout(() => { el.classList.remove('talk'); timers.delete(t) }, 8000); timers.add(t)
    },
    // caminar: el muñequito va hasta el punto (animación solo mientras camina, ~4 m por fotograma como máximo 2,5 s)
    place(p) {
      if (!p?.user_id || p.lat == null) return
      const mk = add(p), from = mk.getLngLat(), to = [p.lon, p.lat], el = mk.getElement()
      const kx = 111320 * Math.cos(p.lat * Math.PI / 180), dist = Math.hypot((to[0] - from.lng) * kx, (to[1] - from.lat) * 110574)
      const dur = Math.min(2500, Math.max(400, dist * 12)), t0 = performance.now()
      cancelAnimationFrame(anim.get(p.user_id)); el.classList.add('walk')
      const step = now => { const k = Math.min(1, (now - t0) / dur); mk.setLngLat([from.lng + (to[0] - from.lng) * k, from.lat + (to[1] - from.lat) * k])
        if (k < 1) anim.set(p.user_id, requestAnimationFrame(step)); else { anim.delete(p.user_id); el.classList.remove('walk') } }
      anim.set(p.user_id, requestAnimationFrame(step))
    },
    clear() { anim.forEach(cancelAnimationFrame); anim.clear(); for (const mk of marks.values()) mk.remove(); marks.clear(); timers.forEach(clearTimeout); timers.clear(); spots = null },
  }
}

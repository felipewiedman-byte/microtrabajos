import { useEffect, useRef } from 'react'
import { geoOrthographic, geoPath, geoGraticule10, geoInterpolate, geoDistance } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import world from 'world-atlas/countries-110m.json'

const land = feature(world, world.objects.land)
const borders = mesh(world, world.objects.countries, (a, b) => a !== b)
const grat = geoGraticule10()
// big cities: the "lights" of the night side
const LIGHTS = [[-74.07,4.71],[-75.57,6.24],[-76.53,3.45],[-75.51,10.39],[-99.13,19.43],[-58.38,-34.6],[-46.63,-23.55],[-43.2,-22.9],[-77.04,-12.05],[-70.65,-33.45],[-66.9,10.5],[-79.5,8.98],[-74,40.71],[-87.63,41.88],[-118.24,34.05],[-122.42,37.77],[-95.37,29.76],[-80.19,25.76],[-77.04,38.9],[-71.06,42.36],[-79.38,43.65],[-73.57,45.5],[-84.39,33.75],[-104.99,39.74],[-122.33,47.6],[-3.7,40.42],[2.17,41.39],[-9.14,38.72],[2.35,48.86],[-0.13,51.51],[4.9,52.37],[13.4,52.52],[12.5,41.9],[9.19,45.46],[16.37,48.21],[21.01,52.23],[-6.26,53.35],[-7.99,31.63],[3.38,6.52],[31.24,30.04],[36.82,-1.29],[28.05,-26.2],[18.42,-33.92],[-17.45,14.69],[32.58,0.35],[-0.19,5.6],[37.62,55.75],[28.98,41.01],[55.27,25.2],[44.36,33.31],[51.39,35.69],[72.88,19.07],[77.21,28.61],[88.36,22.57],[90.41,23.81],[100.5,13.75],[106.85,-6.21],[103.82,1.35],[116.41,39.9],[121.47,31.23],[114.17,22.32],[126.98,37.57],[139.69,35.69],[135.5,34.69],[151.21,-33.87],[144.96,-37.81],[174.76,-36.85],[120.98,14.6],[105.85,21.03],[67.0,24.86],[46.68,24.71],[-21.9,64.15],[18.07,59.33],[10.75,59.91],[24.94,60.17],[30.52,50.45],[-58.0,-3.1],[-48.5,-1.45],[-38.5,-3.73],[-34.88,-8.05],[-60.02,-3.12]]
const seeded = (() => { let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; return LIGHTS.flatMap(c => Array.from({ length: 14 }, (_, i) => [c[0] + (r() - .5) * (i < 4 ? 1.2 : 6), c[1] + (r() - .5) * (i < 4 ? 1 : 4.5), i < 4])) })()

// Interactive night globe on canvas. Drag to rotate, wheel/pinch to zoom.
// Zooming in past the limit (or clicking a pin / country) calls onEnter(lat, lon, zoom) to open the detailed map.
export default function Globe({ points, home, onEnter, onPick }) {
  const ref = useRef(null), st = useRef({ rot: [home ? -home.lon : 50, home ? Math.max(-60, Math.min(60, -home.lat)) : -10], k: 1, auto: true, drag: null, t: 0, entering: false })
  const cb = useRef({}); cb.current = { onEnter, onPick, points, home }

  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d'); let raf, w, h, dpr
    const size = () => { const r = cv.getBoundingClientRect(); dpr = Math.min(1.5, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr }
    size(); const ro = new ResizeObserver(size); ro.observe(cv)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const proj = () => { const s = st.current, R = Math.min(w, h) * 0.42 * s.k; return geoOrthographic().scale(R).translate([w / 2, h / 2]).rotate(s.rot).clipAngle(90).precision(1) }
    // rendimiento: ~30 cuadros/s girando solo, a tope solo mientras lo arrastras; nada si la pestaña está oculta
    let last = 0, gKey = null, gCache = null, touched = performance.now()
    const wake = () => { touched = performance.now() }
    cv.addEventListener('pointerdown', wake); cv.addEventListener('wheel', wake, { passive: true }); cv.addEventListener('pointermove', wake)
    const draw = now => {
      const s = st.current, { points: pts, home: hm } = cb.current
      const idle = now - touched > 20000
      if (document.hidden || (!s.drag && now - last < (idle ? 1000 : 50))) { raf = requestAnimationFrame(draw); return }
      last = now
      if (s.auto && !s.drag && !reduce && !idle) s.rot = [s.rot[0] + 0.15, s.rot[1]]
      const p = proj(), path = geoPath(p, ctx), R = p.scale(), center = [-s.rot[0], -s.rot[1]]
      const vis = ll => geoDistance(ll, center) < Math.PI / 2 - 0.03
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
      // atmosphere glow
      const g = ctx.createRadialGradient(w / 2, h / 2, R * 0.92, w / 2, h / 2, R * 1.14); g.addColorStop(0, 'rgba(62,168,255,0.35)'); g.addColorStop(1, 'rgba(62,168,255,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, R * 1.14, 0, 7); ctx.fill()
      // ocean
      const o = ctx.createRadialGradient(w / 2 - R * .3, h / 2 - R * .35, R * .1, w / 2, h / 2, R); o.addColorStop(0, '#0e1d35'); o.addColorStop(.75, '#060b16'); o.addColorStop(1, '#03060c')
      ctx.fillStyle = o; ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, 7); ctx.fill()
      ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(92,200,176,0.07)'; ctx.lineWidth = .6; ctx.stroke()
      ctx.beginPath(); path(land); ctx.fillStyle = '#111a26'; ctx.fill(); ctx.strokeStyle = '#24364a'; ctx.lineWidth = .7; ctx.stroke()
      ctx.beginPath(); path(borders); ctx.strokeStyle = '#1d2b3b'; ctx.lineWidth = .5; ctx.stroke()
      // city lights
      for (const [lo, la, big] of seeded) { if (!vis([lo, la])) continue; const [x, y] = p([lo, la]); ctx.fillStyle = big ? 'rgba(255,214,150,0.95)' : 'rgba(255,190,110,0.6)'; ctx.beginPath(); ctx.arc(x, y, big ? 1.6 : .8, 0, 7); ctx.fill() }
      // day/night shading towards the edge
      const sh = ctx.createRadialGradient(w / 2 - R * .35, h / 2 - R * .3, R * .4, w / 2, h / 2, R); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, 7); ctx.fill()
      // arcs from home to active cities (lifted above the surface), dashes moving
      if (gKey !== pts) { gKey = pts; gCache = {}; for (const pt of pts) (gCache[pt.city] ||= { ...pt, n: 0, live: false }).n++, pt.post.type === 'directo' && (gCache[pt.city].live = true) }
      const groups = gCache
      s.hits = []; const labels = []
      if (hm) for (const c of Object.values(groups)) {
        if (c.city === hm.city) continue
        const f = geoInterpolate([hm.lon, hm.lat], [c.lon, c.lat]); ctx.beginPath(); let started = false
        for (let t = 0; t <= 1.0001; t += 0.025) { const ll = f(t); if (!vis(ll)) { started = false; continue } const [x, y] = p(ll), lift = 1 + Math.sin(Math.PI * t) * 0.08, X = w / 2 + (x - w / 2) * lift, Y = h / 2 + (y - h / 2) * lift; started ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); started = true }
        ctx.setLineDash([3, 5]); ctx.lineDashOffset = -now / 60; ctx.strokeStyle = c.live ? 'rgba(255,107,107,0.85)' : 'rgba(92,200,176,0.75)'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([])
      }
      // pins with pulses
      for (const c of Object.values(groups)) {
        if (!vis([c.lon, c.lat])) continue
        const [x, y] = p([c.lon, c.lat]), col = c.live ? '255,107,107' : '92,200,176'
        if (c.live && !reduce) { const ph = (((now / 1400 + c.lat) % 1) + 1) % 1; ctx.strokeStyle = `rgba(${col},${0.7 * (1 - ph)})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 6 + ph * 22, 0, 7); ctx.stroke() }
        ctx.fillStyle = `rgba(${col},0.2)`; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill()
        ctx.fillStyle = `rgb(${col})`; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 7); ctx.fill(); ctx.stroke()
        if ((c.n > 1 || c.live) && !labels.some(([lx, ly]) => Math.abs(lx - x) < 90 && Math.abs(ly - y) < 20)) { labels.push([x, y]); ctx.font = '600 11px Manrope, sans-serif'; const label = c.city + (c.n > 1 ? ' · ' + c.n : ''); const tw = ctx.measureText(label).width; ctx.fillStyle = 'rgba(11,15,21,0.75)'; ctx.fillRect(x + 10, y - 9, tw + 10, 18); ctx.fillStyle = '#fff'; ctx.fillText(label, x + 15, y + 4) }
        s.hits.push({ x, y, c })
      }
      ctx.strokeStyle = 'rgba(95,184,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, 7); ctx.stroke()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const enter = (lat, lon, z) => { const s = st.current; if (s.entering) return; s.entering = true; cb.current.onEnter(lat, lon, z) }
    const llAt = (x, y) => proj().invert([x, y])
    const zoomBy = (f, cx, cy) => { const s = st.current; s.auto = false; s.k = Math.max(0.7, Math.min(2.6, s.k * f)); if (s.k >= 2.6) { const ll = llAt(cx ?? w / 2, cy ?? h / 2) || [-s.rot[0], -s.rot[1]]; enter(ll[1], ll[0], 4) } }
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
    const pointers = new Map()
    const down = e => { cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, pos(e)); const s = st.current; s.auto = false; s.drag = { start: pos(e), rot: [...s.rot], moved: 0, pinch: pointers.size === 2 ? dist() : 0, k: s.k } }
    const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) }
    const move = e => {
      const s = st.current; if (!s.drag || !pointers.has(e.pointerId)) return; pointers.set(e.pointerId, pos(e))
      if (pointers.size === 2) { if (!s.drag.pinch) s.drag.pinch = dist(); const k = s.drag.k * dist() / s.drag.pinch; s.k = Math.max(0.7, Math.min(2.6, k)); s.drag.moved = 99; if (k >= 2.6) zoomBy(1); return }
      const [x, y] = pos(e), dx = x - s.drag.start[0], dy = y - s.drag.start[1], R = Math.min(w, h) * 0.42 * s.k
      s.drag.moved = Math.max(s.drag.moved, Math.hypot(dx, dy))
      s.rot = [s.drag.rot[0] + dx / R * 57, Math.max(-75, Math.min(75, s.drag.rot[1] - dy / R * 57))]
    }
    const up = e => {
      const s = st.current; pointers.delete(e.pointerId); if (!s.drag) return
      if (s.drag.moved < 5 && pointers.size === 0) {
        const [x, y] = pos(e), hit = (s.hits || []).find(hh => Math.hypot(hh.x - x, hh.y - y) < 14)
        if (hit) { cb.current.onPick?.(hit.c.city); enter(hit.c.lat, hit.c.lon, 7) }
        else { const ll = llAt(x, y); if (ll && geoDistance(ll, [-s.rot[0], -s.rot[1]]) < Math.PI / 2) enter(ll[1], ll[0], 5) }
      }
      if (pointers.size === 0) s.drag = null
    }
    const wheel = e => { e.preventDefault(); const [x, y] = pos(e); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, x, y) }
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', wheel, { passive: false })
    return () => { cv.removeEventListener('pointerdown', wake); cv.removeEventListener('wheel', wake); cv.removeEventListener('pointermove', wake); cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel) }
  }, [])
  return <canvas ref={ref} className="globe-cv" aria-label="Globo terráqueo interactivo: arrástralo para girarlo y acércalo para ver el mapa detallado" />
}

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useRadio, play as playRadio } from '../radio'
import 'leaflet/dist/leaflet.css'
import { feature } from 'topojson-client'
import world from 'world-atlas/countries-110m.json'
import { Plus, Minus, LocateFixed, Layers } from 'lucide-react'
import { PHOTOS } from '../data'

const all = feature(world, world.objects.countries)
const countries = { ...all, features: all.features.filter(f => f.id !== '010') }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Curved great-ish arc between two points (quadratic bezier in lat/lng space)
function arc(a, b) {
  const pts = [], mx = (a[0] + b[0]) / 2 + Math.abs(b[1] - a[1]) * 0.18, my = (a[1] + b[1]) / 2
  for (let t = 0; t <= 1.0001; t += 0.04) pts.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mx + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * my + t * t * b[1]])
  return pts
}

const BASES = ['noche', 'mapa', 'satelite']
const BASE_LABEL = { noche: 'Luces de noche', mapa: 'Mapa de calles', satelite: 'Satélite' }

export default function WorldMap({ points, selected, onSelect, focus, home, onBounds, pinMode, onPlace, drop, footprint, chatLines, onZoomOutMax, places, onPlacePick, walks, walkRoute, onWalkPick, followWalk, on3D }) {
  const bizLayer = useRef(null), pickCb = useRef(onPlacePick); pickCb.current = onPlacePick
  const outCb = useRef(onZoomOutMax); outCb.current = onZoomOutMax
  const placeCb = useRef(onPlace); placeCb.current = onPlace
  const pinModeRef = useRef(pinMode); pinModeRef.current = pinMode
  const extra = useRef(null)
  const boundsCb = useRef(onBounds); boundsCb.current = onBounds
  const el = useRef(null), map = useRef(null), layer = useRef(null), bases = useRef(null)
  const [base, setBase] = useState('noche')

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, worldCopyJump: true, minZoom: 2, maxZoom: 18, zoomSnap: 0.25 }).setView([18, -40], 2.5)
    // Fallback land shapes live in their own pane BELOW the map tiles (tilePane is z-index 200)
    m.createPane('fallback'); m.getPane('fallback').style.zIndex = 150
    L.geoJSON(countries, { pane: 'fallback', style: { color: '#1f2a36', weight: 0.6, fillColor: '#0f151c', fillOpacity: 1 }, interactive: false }).addTo(m)
    const osm = () => L.tileLayer('/tiles/osm/{z}/{x}/{y}.png', { maxZoom: 19, className: 'osm-dark', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' })
    bases.current = {
      // NASA Black Marble: Earth at night (free, no key). Streets appear when zooming in.
      noche: L.layerGroup([
        L.tileLayer('/tiles/night/{z}/{x}/{y}.png', { maxNativeZoom: 8, maxZoom: 19, className: 'night', attribution: 'NASA Earth Observatory' }),
        L.tileLayer('/tiles/osm/{z}/{x}/{y}.png', { minZoom: 9, maxZoom: 19, className: 'osm-dark', attribution: '© OpenStreetMap' }),
      ]),
      mapa: osm(),
      satelite: L.layerGroup([
        L.tileLayer('/tiles/sat/{z}/{x}/{y}.jpg', { maxZoom: 19, attribution: 'Imágenes © Esri' }),
        L.tileLayer('/tiles/labels/{z}/{x}/{y}.png', { maxZoom: 19 }),
      ]),
    }
    // Retry tiles that fail to load (up to 3 times)
    const retry = e => { const img = e.tile, n = +(img.dataset.retry || 0); if (n < 3) { img.dataset.retry = n + 1; setTimeout(() => { img.src = e.target.getTileUrl(e.coords) + (img.src.includes('?') ? '&' : '?') + 'r=' + (n + 1) }, 1200 * (n + 1)) } }
    const hook = l => l.eachLayer ? l.eachLayer(hook) : l.on && l.on('tileerror', retry)
    Object.values(bases.current).forEach(hook)
    bases.current.noche.addTo(m)
    layer.current = L.layerGroup().addTo(m)
    extra.current = L.layerGroup().addTo(m)
    bizLayer.current = L.layerGroup().addTo(m)
    // publish by dropping a pin: click in pin mode, or right-click / long-press anywhere
    m.on('click', e => { if (pinModeRef.current) placeCb.current?.(e.latlng) })
    m.on('contextmenu', e => placeCb.current?.(e.latlng))
    const z = () => el.current?.classList.toggle('zoomed', m.getZoom() > 5)
    m.on('zoomend', z); z()
    const emit = () => { const b = m.getBounds(); boundsCb.current?.({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast(), z: m.getZoom() }) }
    m.on('moveend', emit); setTimeout(emit, 0)
    // zooming out past the whole world goes back to the 3D globe
    let outTicks = 0, armed = false
    m.on('zoomend', () => { armed = m.getZoom() <= m.getMinZoom() + 0.01; if (!armed) outTicks = 0 })
    el.current.addEventListener('wheel', e => { if (e.deltaY > 0 && armed) { if (++outTicks >= 2) { outTicks = 0; const c = m.getCenter(); outCb.current?.(c.lat, c.lng) } } else if (e.deltaY < 0) outTicks = 0 }, { passive: true })
    let pinchStart = 0
    el.current.addEventListener('touchstart', e => { if (e.touches.length === 2) pinchStart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) }, { passive: true })
    el.current.addEventListener('touchend', e => { if (pinchStart && e.touches.length < 2) { const atMin = m.getZoom() <= m.getMinZoom() + 0.01; if (atMin && m._lastPinchOut) { const c = m.getCenter(); outCb.current?.(c.lat, c.lng) } pinchStart = 0; m._lastPinchOut = false } }, { passive: true })
    el.current.addEventListener('touchmove', e => { if (pinchStart && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); m._lastPinchOut = d < pinchStart * 0.85 && m.getZoom() <= m.getMinZoom() + 0.01 } }, { passive: true })
    map.current = m
    return () => m.remove()
  }, [])

  useEffect(() => {
    const g = layer.current; if (!g) return
    g.clearLayers()
    const groups = {}
    points.forEach(p => { (groups[p.city] ||= { ...p, items: [] }).items.push(p.post) })
    const list = Object.values(groups)
    // arcs from home city to every active city
    if (home) list.filter(c => c.city !== home.city).forEach((c, i) => {
      const live = c.items.some(x => x.type === 'directo')
      L.polyline(arc([home.lat, home.lon], [c.lat, c.lon]), { color: live ? '#ff6b6b' : '#5cc8b0', weight: 1.2, opacity: 0.55, dashArray: '2 6', className: 'arc', interactive: false }).addTo(g)
    })
    list.forEach(c => {
      const top = c.items[0], live = c.items.some(i => i.type === 'directo'), feat = c.items.some(i => i.featured), sel = selected === c.city
      const src = top.thumb || top.image || PHOTOS[top.scene] || ''
      const icon = L.divIcon({ className: '', iconSize: [46, 56], iconAnchor: [23, 54],
        html: `<div class="pin${sel ? ' sel' : ''}${live ? ' live' : ''}${feat ? ' feat' : ''}">${live ? '<span class="pulse"></span>' : ''}<div class="pin-img" style="background-image:url('${esc(src)}')"></div>${c.items.length > 1 ? `<b>${c.items.length}</b>` : ''}<i></i></div>` })
      L.marker([c.lat, c.lon], { icon, title: c.city, riseOnHover: true }).on('click', e => pinModeRef.current ? placeCb.current?.(e.latlng) : onSelect(c.city)).addTo(g)
    })
    if (home) L.marker([home.lat, home.lon], { icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="home-dot"></div>' }), interactive: false, zIndexOffset: -100 }).addTo(g)
  }, [points, selected, onSelect, home])

  useEffect(() => {
    const g = extra.current; if (!g) return
    g.clearLayers()
    if (footprint?.length) {
      L.polyline(footprint.map(f => [f.lat, f.lon]), { color: '#ffb45a', weight: 2, opacity: .9, dashArray: '1 7', lineCap: 'round', interactive: false }).addTo(g)
      footprint.forEach((f, i) => L.marker([f.lat, f.lon], { interactive: false, icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="fp-dot">${i + 1}</div>` }) }).addTo(g))
    }
    if (home) (chatLines || []).forEach(c => L.polyline(arc([home.lat, home.lon], [c.lat, c.lon]), { color: '#9cc4ff', weight: 1.6, opacity: .85, dashArray: '3 6', className: 'arc chat-arc', interactive: false }).addTo(g))
    if (drop) {
      L.marker([drop.lat, drop.lon], { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: '', iconSize: [44, 44], iconAnchor: [22, 22], html: '<div class="drop-pin"><span></span><b>+</b></div>' }) }).addTo(g)
    }
  }, [footprint, chatLines, drop, home])

  // businesses: square pins; clusters (circles with a number) when there are many
  useEffect(() => {
    const g = bizLayer.current; if (!g || !places) return
    g.clearLayers()
    for (const c of places.clusters || []) {
      const size = c.n > 999 ? 54 : c.n > 99 ? 46 : 38
      L.marker([c.lat, c.lon], { icon: L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<div class="biz-cluster${c.featured ? ' feat' : ''}" style="width:${size}px;height:${size}px">${c.n > 999 ? Math.round(c.n / 1000) + 'k' : c.n}</div>` }) })
        .on('click', () => map.current.flyTo([c.lat, c.lon], Math.min(18, map.current.getZoom() + 3), { duration: 0.8 })).addTo(g)
    }
    const ICON = { cafe: '☕', restaurante: '🍽', bar: '🍸', tienda: '🛍', belleza: '💈', servicio: '🛠', hotel: '🛏', cultura: '🎭', deporte: '⚽', otro: '🏪' }
    for (const pl of places.places || []) {
      L.marker([pl.lat, pl.lon], { title: pl.name, zIndexOffset: pl.featured ? 500 : 0, icon: L.divIcon({ className: '', iconSize: [40, 48], iconAnchor: [20, 46], html: `<div class="biz-pin${pl.featured ? ' feat' : ''}">${pl.offers ? '<b title="Tiene ofertas hoy"></b>' : ''}<span>${pl.avatar && /^(\/uploads\/|https:\/\/)[^"'<>]+$/.test(pl.avatar) ? `<img src="${pl.avatar}" alt="">` : ICON[pl.type] || '🏪'}</span><i></i><em>${esc(pl.name)}</em></div>` }) })
        .on('click', e => pinModeRef.current ? placeCb.current?.(e.latlng) : pickCb.current?.(pl.id)).addTo(g)
    }
  }, [places])

  // emisoras (solo las que pagan): pin morado con su logo; tocar = escuchar
  const radio = useRadio(), stLayer = useRef(null)
  useEffect(() => {
    if (!map.current) return
    if (!stLayer.current) { const g = stLayer.current = L.layerGroup(), m = map.current; const sync = () => { if (m.getZoom() >= 5) g.addTo(m); else g.remove() }; m.on('zoomend', sync); sync() }
    const g = stLayer.current; g.clearLayers()
    for (const st of radio.stations) {
      if (st.lat == null || st.lon == null) continue
      const logo = st.logo && /^(\/uploads\/|https:\/\/)[^"'<>]+$/.test(st.logo) ? `<img src="${st.logo}" alt="">` : '📻'
      L.marker([st.lat, st.lon], { title: st.name, zIndexOffset: 400, icon: L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: `<div class="st-pin${radio.cur?.id === st.id ? ' on' : ''}">${logo}</div>` }) })
        .on('click', () => playRadio(st)).addTo(g)
    }
  }, [radio.stations, radio.cur?.id])
  // paseos en vivo: un punto por caminante; se mueve suave (transición CSS) sin recrear el marcador
  const wkLayer = useRef(null), wkMarks = useRef(new Map()), wkPick = useRef(onWalkPick); wkPick.current = onWalkPick
  useEffect(() => {
    if (!map.current || !walks) return
    if (!wkLayer.current) wkLayer.current = L.layerGroup().addTo(map.current)
    const seen = new Set()
    for (const w of walks) {
      if (w.lat == null) continue; seen.add(w.id)
      let mk = wkMarks.current.get(w.id)
      if (!mk) { mk = L.marker([w.lat, w.lon], { zIndexOffset: 900, title: w.title, icon: L.divIcon({ className: 'walk-marker', iconSize: [18, 18], iconAnchor: [9, 9], html: `<div class="walker-pin"><em>${esc(w.name.split(' ')[0])} · ${esc(w.city)}</em></div>` }) }).on('click', () => wkPick.current?.(w.id)).addTo(wkLayer.current); wkMarks.current.set(w.id, mk) }
      else mk.setLatLng([w.lat, w.lon])
    }
    for (const [id, mk] of wkMarks.current) if (!seen.has(id)) { mk.remove(); wkMarks.current.delete(id) }
  }, [walks])
  // ruta y fotos del paseo abierto
  const rtLayer = useRef(null)
  useEffect(() => {
    if (!map.current) return
    if (!rtLayer.current) rtLayer.current = L.layerGroup().addTo(map.current)
    const g = rtLayer.current; g.clearLayers(); if (!walkRoute) return
    if (walkRoute.points?.length > 1) { L.polyline(walkRoute.points, { color: '#5cc8b0', weight: 12, opacity: .25, interactive: false }).addTo(g); L.polyline(walkRoute.points, { color: '#a8f0dc', weight: 3.5, opacity: .95, interactive: false }).addTo(g) }
    for (const m of walkRoute.media || []) { const src = m.thumb || m.image; if (!src || !/^(\/uploads\/|https:\/\/)[^"'<>]+$/.test(src)) continue
      L.marker([m.lat, m.lon], { zIndexOffset: 800, icon: L.divIcon({ className: '', iconSize: [40, 40], iconAnchor: [20, 40], html: `<div class="wk-photo" style="background-image:url('${src}')"></div>` }) }).on('click', () => window.open(m.image || m.thumb, '_blank', 'noopener')).addTo(g) }
  }, [walkRoute])
  useEffect(() => { if (followWalk && map.current && walkRoute?.head) map.current.panTo(walkRoute.head, { animate: true, duration: 1 }) }, [followWalk, walkRoute?.head?.[0], walkRoute?.head?.[1]])
  useEffect(() => { if (focus && map.current) map.current.flyTo([focus.lat, focus.lon], focus.z, { duration: 1.1 }) }, [focus])

  const cycle = () => { const next = BASES[(BASES.indexOf(base) + 1) % BASES.length]; map.current.removeLayer(bases.current[base]); bases.current[next].addTo(map.current); setBase(next) }

  return (
    <div className={'map' + (pinMode ? ' pin-mode' : '')}>
      <div ref={el} className="leaf" />
      <div className="map-ctrl">
        <button onClick={() => map.current.zoomIn()} aria-label="Acercar"><Plus size={16} /></button>
        <button onClick={() => map.current.zoomOut()} aria-label="Alejar"><Minus size={16} /></button>
        {home && <button onClick={() => map.current.flyTo([home.lat, home.lon], 11)} title="Mi ciudad" aria-label="Mi ciudad"><LocateFixed size={16} /></button>}
        <button onClick={cycle} title={'Cambiar a ' + BASE_LABEL[BASES[(BASES.indexOf(base) + 1) % 3]]} aria-label="Cambiar mapa"><Layers size={16} /></button>
        {on3D && <button className="btn3d" onClick={() => { const c = map.current.getCenter(); on3D({ lat: c.lat, lon: c.lng }, map.current.getZoom()) }} title="Ver en 3D: edificios reales" aria-label="Ver en 3D">3D</button>}
      </div>
      <div className="map-mode">{BASE_LABEL[base]}</div>
    </div>
  )
}

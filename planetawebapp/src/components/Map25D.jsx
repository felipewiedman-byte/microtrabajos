import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Plus, Minus } from 'lucide-react'
import { svg } from '../icons'
import { PHOTOS } from '../data'
import { play as playRadio } from '../radio'

// Vista de calle en perspectiva: el MISMO mapa de calles oscuro (imágenes de OpenStreetMap que ya usamos),
// inclinado, con los edificios levantados en bloques bajos (formas de OpenStreetMap vía OpenFreeMap).
// Solo se carga al acercarse a la calle; el resto de la web sigue con el mapa normal.
const okUrl = u => typeof u === 'string' && /^(\/uploads\/|https?:\/\/)[^"'<>]+$/.test(u)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const STYLE = {
  version: 8,
  sources: {
    calles: { type: 'raster', tiles: [location.origin + '/tiles/osm/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' },
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#14171c' } },
    // mismo tono oscuro del mapa actual: invertido, girado de color y apagado
    { id: 'calles', type: 'raster', source: 'calles', paint: { 'raster-brightness-min': 0.92, 'raster-brightness-max': 0.02, 'raster-hue-rotate': 180, 'raster-saturation': -0.4, 'raster-contrast': -0.1 } },
    { id: 'edificios', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 14,
      paint: { 'fill-extrusion-color': '#3a3f4a', 'fill-extrusion-opacity': 0.85,
        'fill-extrusion-height': ['min', 36, ['coalesce', ['get', 'render_height'], 9]],
        'fill-extrusion-base': ['min', 30, ['coalesce', ['get', 'render_min_height'], 0]] } },
  ],
}

export default function Map25D({ center, zoom, points, places, cams, stations, walks, onSelect, onPlacePick, onCamPick, onWalkPick, onBounds, onExit, onFlat }) {
  const el = useRef(null), map = useRef(null), marks = useRef(new Map())
  const cb = useRef({}); cb.current = { onSelect, onPlacePick, onCamPick, onWalkPick, onBounds, onExit }
  useEffect(() => {
    const m = map.current = new maplibregl.Map({ container: el.current, style: STYLE, center: [center.lon, center.lat], zoom: Math.max(14.5, zoom - 1), pitch: 55, bearing: -15, maxPitch: 70, attributionControl: { compact: true }, fadeDuration: 0 })
    m.on('error', e => console.warn('Mapa en perspectiva:', e?.error?.message))
    const emit = () => { const b = m.getBounds(), c = m.getCenter(), z = m.getZoom() + 1
      cb.current.onBounds?.({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast(), z })
      if (z < 14) cb.current.onExit?.({ lat: c.lat, lon: c.lng, zoom: z }) }
    m.on('moveend', emit); m.once('load', emit)
    return () => { for (const mk of marks.current.values()) mk.remove(); marks.current.clear(); m.remove(); map.current = null }
  }, [])
  // pines (de pie sobre el mapa inclinado); se actualizan sin recrear el mapa
  useEffect(() => {
    const m = map.current; if (!m) return
    const want = new Map()
    const add = (key, ll, html, cls, onClick) => want.set(key, { ll, html, cls, onClick })
    const byCity = {}
    for (const p of points || []) { const lat = p.post.lat ?? p.lat, lon = p.post.lon ?? p.lon; if (lat == null) continue; (byCity[p.city + '|' + lat.toFixed(3) + lon.toFixed(3)] ||= { lat, lon, city: p.city, items: [] }).items.push(p.post) }
    for (const [k, c] of Object.entries(byCity)) { const t = c.items[0], live = c.items.some(i => i.type === 'directo'), src = t.thumb || t.image || (PHOTOS[t.scene] || '').replace('w=1200', 'w=96')
      add('p' + k, [c.lon, c.lat], `<div class="pin${live ? ' live' : ''}"><div class="pin-img" style="background-image:url('${okUrl(src) ? esc(src) : ''}')"></div>${c.items.length > 1 ? `<b>${c.items.length}</b>` : ''}<i></i></div>`, 'm25-pin', () => cb.current.onSelect?.(c.city)) }
    for (const pl of places?.places || []) add('b' + pl.id, [pl.lon, pl.lat], `<div class="biz-pin${pl.featured ? ' feat' : ''}">${pl.offers ? '<b></b>' : ''}<span>${okUrl(pl.avatar) ? `<img src="${esc(pl.avatar)}" alt="">` : svg(pl.type, 15) || svg('otro', 15)}</span><i></i><em>${esc(pl.name)}</em></div>`, 'm25-pin zoomed', () => cb.current.onPlacePick?.(pl.id))
    for (const c of cams || []) add('c' + c.id, [c.lon, c.lat], `<div class="cam-pin">${svg('video', 14)}</div>`, 'm25-dot', () => cb.current.onCamPick?.(c.id))
    for (const st of stations || []) if (st.lat != null) add('s' + st.id, [st.lon, st.lat], `<div class="st-pin">${okUrl(st.logo) ? `<img src="${esc(st.logo)}" alt="">` : svg('radio', 14)}</div>`, 'm25-dot', () => playRadio(st))
    for (const w of walks || []) if (w.lat != null) add('w' + w.id, [w.lon, w.lat], `<div class="walker-pin"><em>${esc(String(w.name).split(' ')[0])}</em></div>`, 'm25-dot', () => cb.current.onWalkPick?.(w.id))
    for (const [k, mk] of marks.current) { const w = want.get(k); if (!w || mk._html !== w.html) { mk.remove(); marks.current.delete(k) } else mk.setLngLat(w.ll) }
    for (const [k, w] of want) { if (marks.current.has(k)) continue
      const d = document.createElement('div'); d.className = w.cls; d.innerHTML = w.html; d.addEventListener('click', e => { e.stopPropagation(); w.onClick() })
      const mk = new maplibregl.Marker({ element: d, anchor: w.cls.includes('pin') ? 'bottom' : 'center' }).setLngLat(w.ll).addTo(m); mk._html = w.html; marks.current.set(k, mk) }
  }, [points, places, cams, stations, walks])
  const exit = () => { const m = map.current, c = m.getCenter(); onExit({ lat: c.lat, lon: c.lng, zoom: m.getZoom() + 1 }) }
  return <div className="map25">
    <div ref={el} className="map25-c" />
    <div className="map-ctrl map25-ctrl">
      <button onClick={() => map.current?.zoomIn()} aria-label="Acercar"><Plus size={16} /></button>
      <button onClick={() => map.current?.zoomOut()} aria-label="Alejar"><Minus size={16} /></button>
      <button className="btn-3d on" onClick={() => { onFlat(); exit() }} title="Volver al mapa plano" aria-label="Volver al mapa plano">2D</button>
    </div>
  </div>
}

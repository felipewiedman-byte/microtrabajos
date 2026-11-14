import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Plus, Minus, RotateCcw } from 'lucide-react'
import { play as playRadio } from '../radio'

// Vista 3D: edificios reales con su altura (OpenFreeMap, gratis y sin pasar por nuestro servidor).
// Se carga solo cuando alguien toca "3D", así el mapa normal sigue liviano.
const STYLES = ['https://tiles.openfreemap.org/styles/dark', 'https://tiles.openfreemap.org/styles/liberty']
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export default function Map3D({ center, zoom, onClose, onMove, walks, walkRoute, onWalkPick, stations }) {
  const el = useRef(null), map = useRef(null), marks = useRef(new Map()), [err, setErr] = useState(''), [ready, setReady] = useState(false)
  useEffect(() => {
    let tried = 0
    const m = map.current = new maplibregl.Map({ container: el.current, style: STYLES[0], center: [center.lon, center.lat], zoom: Math.max(15.5, zoom), pitch: 60, bearing: -20, maxPitch: 75, attributionControl: { compact: true } })
    m.on('error', e => { if (!m.isStyleLoaded() && tried < 1 && /style|Failed to fetch|404/i.test(String(e?.error?.message || ''))) { tried++; m.setStyle(STYLES[1]) } })
    m.on('style.load', () => {
      const src = Object.keys(m.getStyle().sources).find(k => m.getStyle().sources[k].type === 'vector'); if (!src) return
      for (const l of m.getStyle().layers) if (l.type === 'fill-extrusion') m.removeLayer(l.id)
      const firstSymbol = m.getStyle().layers.find(l => l.type === 'symbol')?.id
      m.addLayer({ id: 'pl-3d', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 13,
        paint: { 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#2b3442', 30, '#3b475a', 100, '#5a6b84'], 'fill-extrusion-opacity': .92 } }, firstSymbol)
      m.addSource('pl-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'pl-route-glow', type: 'line', source: 'pl-route', paint: { 'line-color': '#5cc8b0', 'line-width': 14, 'line-blur': 8, 'line-opacity': .5 } })
      m.addLayer({ id: 'pl-route', type: 'line', source: 'pl-route', paint: { 'line-color': '#a8f0dc', 'line-width': 4 } })
      setReady(true)
    })
    m.on('moveend', () => { const c = m.getCenter(); onMove?.({ lat: c.lat, lon: c.lng, zoom: m.getZoom() }) })
    const t = setTimeout(() => { if (!m.isStyleLoaded()) setErr('El mapa 3D está tardando en cargar. Revisa tu conexión.') }, 12000)
    return () => { clearTimeout(t); for (const mk of marks.current.values()) mk.remove(); marks.current.clear(); m.remove(); map.current = null }
  }, [])
  // caminantes en vivo
  useEffect(() => {
    const m = map.current; if (!m || !walks) return
    const seen = new Set()
    for (const w of walks) { if (w.lat == null) continue; const k = 'w' + w.id; seen.add(k); let mk = marks.current.get(k)
      if (!mk) { const d = document.createElement('div'); d.className = 'walk-marker3d'; d.innerHTML = `<div class="walker-pin"><em>${esc(w.name.split(' ')[0])} · ${esc(w.city)}</em></div>`; d.onclick = () => onWalkPick?.(w.id); mk = new maplibregl.Marker({ element: d }).setLngLat([w.lon, w.lat]).addTo(m); marks.current.set(k, mk) }
      else mk.setLngLat([w.lon, w.lat]) }
    for (const st of stations || []) { if (st.lat == null) continue; const k = 's' + st.id; seen.add(k); if (marks.current.has(k)) continue
      const d = document.createElement('div'); d.className = 'st-pin'; d.innerHTML = st.logo && /^(\/uploads\/|https:\/\/)[^"'<>]+$/.test(st.logo) ? `<img src="${st.logo}" alt="">` : '📻'; d.onclick = () => playRadio(st); marks.current.set(k, new maplibregl.Marker({ element: d }).setLngLat([st.lon, st.lat]).addTo(m)) }
    for (const [k, mk] of marks.current) if (!seen.has(k) && !k.startsWith('m')) { mk.remove(); marks.current.delete(k) }
  }, [walks, stations])
  // ruta y fotos del paseo abierto
  useEffect(() => {
    const m = map.current; if (!m || !ready) return
    m.getSource('pl-route')?.setData({ type: 'FeatureCollection', features: walkRoute?.points?.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: walkRoute.points.map(([a, o]) => [o, a]) } }] : [] })
    for (const [k, mk] of marks.current) if (k.startsWith('m')) { mk.remove(); marks.current.delete(k) }
    for (const x of walkRoute?.media || []) { const src = x.thumb || x.image; if (!src || !/^(\/uploads\/|https:\/\/)[^"'<>]+$/.test(src)) continue
      const d = document.createElement('div'); d.className = 'wk-photo'; d.style.backgroundImage = `url('${src}')`; marks.current.set('m' + x.id, new maplibregl.Marker({ element: d, anchor: 'bottom' }).setLngLat([x.lon, x.lat]).addTo(m)) }
    if (walkRoute?.head) m.easeTo({ center: [walkRoute.head[1], walkRoute.head[0]], duration: 1200 })
  }, [walkRoute, ready])
  return <div className="map3d">
    <div ref={el} className="map3d-c" />
    <div className="map-ctrl map3d-ctrl">
      <button onClick={() => map.current?.zoomIn()} aria-label="Acercar"><Plus size={16} /></button>
      <button onClick={() => map.current?.zoomOut()} aria-label="Alejar"><Minus size={16} /></button>
      <button onClick={() => map.current?.easeTo({ bearing: 0, pitch: 60 })} title="Enderezar" aria-label="Enderezar"><RotateCcw size={15} /></button>
      <button className="on" onClick={onClose} title="Volver al mapa plano" aria-label="Volver a 2D">2D</button>
    </div>
    <div className="map3d-hint">Arrastra con clic derecho (o dos dedos) para girar e inclinar</div>
    {err && <div className="map3d-err">{err} <button className="link" onClick={onClose}>Volver al mapa normal</button></div>}
  </div>
}

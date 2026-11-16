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

// Estilo vectorial (calles, agua, parques y nombres desde el mismo servicio que los edificios): sin cuadros de imagen que esperar.
// Colores oscuros parecidos al mapa plano. Esquema OpenMapTiles.
const NAME = ['coalesce', ['get', 'name:es'], ['get', 'name:latin'], ['get', 'name']]
// equipos modestos (pocos núcleos o poca memoria): menos píxeles, edificios desde más cerca y sin neblina; el resto igual
const LITE = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4
const UP = LITE ? 15 : 14 // zoom al que los edificios empiezan a levantarse
const PIXELS = Math.min(window.devicePixelRatio || 1, LITE ? 1.25 : 2)
const ROAD = (id, classes, color, w) => ({ id, type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['match', ['get', 'class'], classes, true, false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, w[0], 14, w[1], 19, w[2]] } })
const LU = (id, classes, color, op = 1) => ({ id, type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['match', ['get', 'class'], classes, true, false], paint: { 'fill-color': color, 'fill-opacity': op } })
const POI = (id, classes, color, minzoom) => ({ id, type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom, filter: ['match', ['get', 'class'], classes, true, false],
  layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-offset': [0, 0.2], 'text-optional': true, 'text-max-width': 8 },
  paint: { 'text-color': color, 'text-halo-color': '#14171c', 'text-halo-width': 1.6 } })
// hora solar del lugar (hora UTC + longitud/15): día, atardecer, noche o amanecer, sin pedir nada a internet
const SKIES = {
  dia: { 'sky-color': '#2c4f7a', 'horizon-color': '#6f8fb5', 'fog-color': '#33465f' },
  tarde: { 'sky-color': '#1d2547', 'horizon-color': '#d9824f', 'fog-color': '#4a3340' },
  noche: { 'sky-color': '#060a16', 'horizon-color': '#1c2742', 'fog-color': '#121a2b' },
  alba: { 'sky-color': '#24305a', 'horizon-color': '#c98a8f', 'fog-color': '#3a3448' },
}
const skyFor = lon => { const d = new Date(), h = ((d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15) % 24 + 24) % 24
  const k = h >= 8 && h < 17 ? 'dia' : h >= 17 && h < 19.5 ? 'tarde' : h >= 5.5 && h < 8 ? 'alba' : 'noche'
  return { ...SKIES[k], 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.4 } }
const STYLE_V = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap · OpenFreeMap' } },
  // cielo y neblina en el horizonte (aspecto de videojuego); si la versión del mapa no los admite, se ignoran
  // luz lateral: las fachadas quedan en distinto tono y los edificios se leen en volumen (no cuesta nada extra)
  light: { anchor: 'viewport', color: '#ffffff', intensity: 0.45, position: [1.5, 210, 35] },
  // el cielo se pone al abrir el mapa según la hora del lugar (skyFor)
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#14171c' } },
    LU('uso-residencial', ['residential', 'suburb', 'neighbourhood'], '#171a20'),
    LU('uso-comercial', ['commercial', 'retail'], '#1d1f29'),
    LU('uso-industrial', ['industrial', 'railway', 'garages'], '#1b1c20'),
    LU('uso-salud', ['hospital'], '#2a1d25'),
    LU('uso-estudio', ['school', 'university', 'college', 'kindergarten'], '#231f33'),
    LU('uso-cementerio', ['cemetery'], '#16221b'),
    LU('uso-deporte', ['stadium', 'pitch', 'playground', 'track', 'sports_centre'], '#24603d'),
    { id: 'borde-deporte', type: 'line', source: 'omt', 'source-layer': 'landuse', minzoom: 13, filter: ['match', ['get', 'class'], ['stadium', 'pitch'], true, false], paint: { 'line-color': '#4fae73', 'line-width': 1, 'line-opacity': 0.7 } },
    { id: 'verde', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'grass', 'farmland'], true, false], paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#16291d', 'farmland', '#1b2619', '#1a2e21'], 'fill-opacity': 0.9 } },
    { id: 'arena', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['sand'], true, false], paint: { 'fill-color': '#2d2b22' } },
    { id: 'parque', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#1f3a2a', 'fill-opacity': 0.95 } },
    { id: 'agua', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#0d2237' } },
    { id: 'borde-agua', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 10, paint: { 'line-color': '#2a5d8a', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 1.6], 'line-opacity': 0.8 } },
    { id: 'rio', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': '#0d2237', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 16, 3] } },
    { id: 'pista-aerea', type: 'fill', source: 'omt', 'source-layer': 'aeroway', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#262a31' } },
    ROAD('via-menor', ['minor', 'service', 'track', 'path'], '#3d424c', [0.2, 1.3, 4.5]),
    ROAD('via-terciaria', ['tertiary', 'secondary'], '#5c606a', [0.4, 2.5, 9]),
    ROAD('via-principal', ['primary', 'trunk'], '#6e6049', [0.4, 2, 12]),
    ROAD('via-autopista', ['motorway'], '#8a704a', [0.5, 2.4, 14]),
    ROAD('via-tren', ['rail', 'transit'], '#3d4452', [0.3, 0.9, 2]),
    // edificios: más altos y con color según la altura (los bajos en gris, los altos en azul claro)
    { id: 'edificios-plano', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, maxzoom: UP, paint: { 'fill-color': '#2f3440', 'fill-outline-color': '#3a404d' } },
    { id: 'edificios', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: UP,
      paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#3a3f4a', 6, '#424656', 12, '#4a5266', 25, '#56627c', 45, '#62739a', 80, '#7a8fbb'], 'fill-extrusion-opacity': 0.92,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], UP, 0, UP + 1.2, ['min', 90, ['coalesce', ['get', 'render_height'], 9]]],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], UP, 0, UP + 1.2, ['min', 80, ['coalesce', ['get', 'render_min_height'], 0]]] } },
    { id: 'nombre-agua', type: 'symbol', source: 'omt', 'source-layer': 'water_name', minzoom: 10,
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-max-width': 7 }, paint: { 'text-color': '#5d86b0', 'text-halo-color': '#0d2237', 'text-halo-width': 1.2 } },
    { id: 'nombre-calle', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 16,
      layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
      paint: { 'text-color': '#9aa3ad', 'text-halo-color': '#14171c', 'text-halo-width': 1.4 } },
    // solo estadios con nombre propio: el resto de rótulos ensucia el mapa
    POI('poi-estadio', ['stadium'], '#6fe0a0', 14),
    { id: 'nombre-lugar', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['match', ['get', 'class'], ['city', 'town', 'village', 'suburb', 'neighbourhood'], true, false],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 16, 15] },
      paint: { 'text-color': '#c4ccd4', 'text-halo-color': '#14171c', 'text-halo-width': 1.6 } },
  ],
}

export default function Map25D({ vector, center, zoom, points, places, cams, stations, walks, onSelect, onPlacePick, onCamPick, onWalkPick, onBounds, onExit, onFlat }) {
  const el = useRef(null), map = useRef(null), marks = useRef(new Map())
  const cb = useRef({}); cb.current = { onSelect, onPlacePick, onCamPick, onWalkPick, onBounds, onExit }
  useEffect(() => {
    const m = map.current = new maplibregl.Map({ container: el.current, style: vector ? STYLE_V : STYLE, center: [center.lon, center.lat], zoom: Math.max(14.5, zoom - 1), pitch: 55, bearing: -15, maxPitch: 70, attributionControl: { compact: true }, fadeDuration: 0, pixelRatio: PIXELS })
    if (vector && !LITE) m.once('style.load', () => { try { m.setSky(skyFor(center.lon)) } catch { /* versión sin cielo */ } })
    m.on('error', e => console.warn('Mapa en perspectiva:', e?.error?.message))
    const emit = () => { const b = m.getBounds(), c = m.getCenter(), z = m.getZoom() + 1
      cb.current.onBounds?.({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast(), z })
      if (z < 12.5) cb.current.onExit?.({ lat: c.lat, lon: c.lng, zoom: z }) }
    m.on('moveend', emit); m.once('load', emit)
    return () => { for (const mk of marks.current.values()) mk.remove(); marks.current.clear(); m.remove(); map.current = null }
  }, [])
  // al tocar otro pin/lugar con la vista 3D ya abierta, la cámara viaja hasta allí (antes solo se movía el mapa plano de abajo)
  useEffect(() => { const m = map.current; if (!m) return; const c = m.getCenter(); if (Math.abs(c.lat - center.lat) + Math.abs(c.lng - center.lon) > 1e-5) m.flyTo({ center: [center.lon, center.lat], zoom: Math.max(15, zoom - 1), pitch: 55, duration: 1400 }) }, [center.lat, center.lon]) // eslint-disable-line react-hooks/exhaustive-deps
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

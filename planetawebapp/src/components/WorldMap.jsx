import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
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

export default function WorldMap({ points, selected, onSelect, focus, home }) {
  const el = useRef(null), map = useRef(null), layer = useRef(null), bases = useRef(null)
  const [base, setBase] = useState('noche')

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, worldCopyJump: true, minZoom: 2, maxZoom: 18, zoomSnap: 0.25 }).setView([18, -40], 2.5)
    L.geoJSON(countries, { style: { color: '#1f2a36', weight: 0.6, fillColor: '#0f151c', fillOpacity: 1 }, interactive: false }).addTo(m)
    const osm = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'osm-dark', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' })
    bases.current = {
      // NASA Black Marble: Earth at night (free, no key). Streets appear when zooming in.
      noche: L.layerGroup([
        L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', { maxNativeZoom: 8, maxZoom: 19, className: 'night', attribution: 'NASA Earth Observatory' }),
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { minZoom: 9, maxZoom: 19, className: 'osm-dark', attribution: '© OpenStreetMap' }),
      ]),
      mapa: osm(),
      satelite: L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes © Esri' }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
      ]),
    }
    bases.current.noche.addTo(m)
    layer.current = L.layerGroup().addTo(m)
    const z = () => el.current?.classList.toggle('zoomed', m.getZoom() > 5)
    m.on('zoomend', z); z()
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
      const top = c.items[0], live = c.items.some(i => i.type === 'directo'), sel = selected === c.city
      const src = top.image || PHOTOS[top.scene] || ''
      const icon = L.divIcon({ className: '', iconSize: [46, 56], iconAnchor: [23, 54],
        html: `<div class="pin${sel ? ' sel' : ''}${live ? ' live' : ''}">${live ? '<span class="pulse"></span>' : ''}<div class="pin-img" style="background-image:url('${esc(src)}')"></div>${c.items.length > 1 ? `<b>${c.items.length}</b>` : ''}<i></i></div>` })
      L.marker([c.lat, c.lon], { icon, title: c.city, riseOnHover: true }).on('click', () => onSelect(c.city)).addTo(g)
    })
    if (home) L.marker([home.lat, home.lon], { icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="home-dot"></div>' }), interactive: false, zIndexOffset: -100 }).addTo(g)
  }, [points, selected, onSelect, home])

  useEffect(() => { if (focus && map.current) map.current.flyTo([focus.lat, focus.lon], focus.z, { duration: 1.1 }) }, [focus])

  const cycle = () => { const next = BASES[(BASES.indexOf(base) + 1) % BASES.length]; map.current.removeLayer(bases.current[base]); bases.current[next].addTo(map.current); setBase(next) }

  return (
    <div className="map">
      <div ref={el} className="leaf" />
      <div className="map-ctrl">
        <button onClick={() => map.current.zoomIn()} aria-label="Acercar"><Plus size={16} /></button>
        <button onClick={() => map.current.zoomOut()} aria-label="Alejar"><Minus size={16} /></button>
        {home && <button onClick={() => map.current.flyTo([home.lat, home.lon], 11)} title="Mi ciudad" aria-label="Mi ciudad"><LocateFixed size={16} /></button>}
        <button onClick={cycle} title={'Cambiar a ' + BASE_LABEL[BASES[(BASES.indexOf(base) + 1) % 3]]} aria-label="Cambiar mapa"><Layers size={16} /></button>
      </div>
      <div className="map-mode">{BASE_LABEL[base]}</div>
    </div>
  )
}

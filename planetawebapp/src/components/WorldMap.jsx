import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { feature } from 'topojson-client'
import world from 'world-atlas/countries-110m.json'
import { Plus, Minus, LocateFixed, Layers } from 'lucide-react'
import { ME } from '../data'

const all = feature(world, world.objects.countries)
const countries = { ...all, features: all.features.filter(f => f.id !== '010') }

export default function WorldMap({ points, selected, onSelect, focus }) {
  const el = useRef(null), map = useRef(null), layer = useRef(null), bases = useRef(null)
  const [base, setBase] = useState('mapa')
  const toggle = () => { const next = base === 'mapa' ? 'satelite' : 'mapa'; map.current.removeLayer(bases.current[base]); bases.current[next].addTo(map.current); setBase(next) }

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 2, maxZoom: 18 }).setView([12, -45], 2)
    // Offline fallback: country shapes
    L.geoJSON(countries, { style: { color: '#262e38', weight: 0.7, fillColor: '#1a2028', fillOpacity: 1 }, interactive: false }).addTo(m)
    // Free tiles, no API key: OpenStreetMap (darkened via CSS) and Esri satellite imagery
    bases.current = {
      mapa: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'osm-dark',
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
      satelite: L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes © Esri' }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
      ]),
    }
    bases.current.mapa.addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => m.remove()
  }, [])

  useEffect(() => {
    const g = layer.current; if (!g) return
    g.clearLayers()
    const groups = {}
    points.forEach(p => { (groups[p.city] ||= { ...p, items: [] }).items.push(p.post) })
    Object.values(groups).forEach(c => {
      const live = c.items.some(i => i.type === 'directo'), sel = selected === c.city
      const icon = L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17],
        html: `<div class="pm${sel ? ' sel' : ''}${live ? ' live' : ''}">${c.items.length}</div>` })
      L.marker([c.lat, c.lon], { icon, title: c.city }).on('click', () => onSelect(c.city)).addTo(g)
    })
  }, [points, selected, onSelect])

  useEffect(() => { if (focus && map.current) map.current.flyTo([focus.lat, focus.lon], focus.z, { duration: 0.8 }) }, [focus])

  return (
    <div className="map">
      <div ref={el} className="leaf" />
      <div className="map-ctrl">
        <button onClick={() => map.current.zoomIn()}><Plus size={18} /></button>
        <button onClick={() => map.current.zoomOut()}><Minus size={18} /></button>
        <button onClick={() => map.current.flyTo([ME.lat, ME.lon], 11)} title="Mi ubicación"><LocateFixed size={18} /></button>
        <button onClick={toggle} title={base === 'mapa' ? 'Ver satélite' : 'Ver mapa'} className={base === 'satelite' ? 'on' : ''}><Layers size={18} /></button>
      </div>
    </div>
  )
}

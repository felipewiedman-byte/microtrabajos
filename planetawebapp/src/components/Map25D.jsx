import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Plus, Minus } from 'lucide-react'
import { svg } from '../icons'
import { siteSvg } from '../sitesIcons'
import { PHOTOS } from '../data'
import { play as playRadio } from '../radio'

import { okUrl, esc, STYLE, STYLE_V, LITE, PIXELS, ICONS, drawIcon, drawShield, TYPE_ES, skyFor, GROUND } from './mapStyle'
export default function Map25D({ flight, vector, sat, site, onDensity, center, zoom, points, places, cams, stations, walks, onSelect, onPlacePick, onCamPick, onWalkPick, onBounds, onExit, onFlat }) {
  const el = useRef(null), map = useRef(null), marks = useRef(new Map()), flying = useRef(false), flightId = useRef(0)
  // satélite: se enciende solo al abrir un sitio turístico (sat), y la persona lo puede cambiar con el botón SAT
  const [satOn, setSatOn] = useState(!!sat)
  // auto = el mapa decide solo; si la persona pulsa SAT, manda su elección hasta que abra otro lugar
  const auto = useRef(true)
  // zona vacía (pocos edificios): se oscurece un poco y se OFRECE «Ver satélite»; nada cambia solo.
  // Si la persona lo enciende desde ahí, se apaga solo al alejarse o al llegar a una zona con edificios.
  const [empty, setEmpty] = useState(false), porAviso = useRef(false)
  // «Ver 3D» quita el aviso y deja el mapa 3D; vuelve a preguntar al alejarse o al abrir otro lugar
  const [quedar3d, setQuedar3d] = useState(false)
  useEffect(() => { setSatOn(!!sat); auto.current = true; setQuedar3d(false) }, [sat, center.lat, center.lon])
  const cb = useRef({}); cb.current = { onSelect, onPlacePick, onCamPick, onWalkPick, onBounds, onExit, onDensity }
  useEffect(() => {
    const zEnd = Math.max(14.5, zoom - 1)
    const m = map.current = new maplibregl.Map({ container: el.current, style: vector ? STYLE_V : STYLE, center: [center.lon, center.lat], zoom: zEnd, pitch: 55, bearing: -15, maxPitch: 70, attributionControl: { compact: true }, fadeDuration: 0, pixelRatio: PIXELS })
    if (vector && !LITE) m.once('style.load', () => { try { m.setSky(skyFor(center.lon)) } catch { /* versión sin cielo */ } })
    m.on('styleimagemissing', e => { if (m.hasImage(e.id)) return; if (ICONS[e.id]) m.addImage(e.id, drawIcon(e.id), { pixelRatio: 2 })
      else if (e.id === 'escudo') m.addImage('escudo', drawShield(), { pixelRatio: 2, stretchX: [[10, 38]], stretchY: [[10, 30]], content: [8, 6, 40, 34] }) })
    // tocar un lugar con nombre: ficha pequeña con el tipo y un botón para llegar con Google Maps
    const POIS = STYLE_V.layers.filter(l => l.id.startsWith('poi-')).map(l => l.id)
    if (vector) {
      m.on('click', POIS, e => { const f = e.features?.[0]; if (!f) return
        const p = f.properties, [lon, lat] = f.geometry.coordinates, name = p['name:es'] || p['name:latin'] || p.name
        const tipo = p.subclass === 'artwork' ? 'Obra de arte' : TYPE_ES[p.class] || 'Lugar'
        new maplibregl.Popup({ closeButton: true, className: 'm25-ficha', maxWidth: '240px', offset: 14 }).setLngLat([lon, lat])
          .setHTML(`<b>${esc(name)}</b><span>${esc(tipo)}</span><a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" rel="noopener">Cómo llegar</a>`).addTo(m) })
      m.on('mouseenter', POIS, () => { m.getCanvas().style.cursor = 'pointer' }); m.on('mouseleave', POIS, () => { m.getCanvas().style.cursor = '' })
    }
    m.on('error', e => console.warn('Mapa en perspectiva:', e?.error?.message))
    const emit = () => { const b = m.getBounds(), c = m.getCenter(), z = m.getZoom() + 1
      cb.current.onBounds?.({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast(), z })
      if (z < 12.5 && !flying.current) cb.current.onExit?.({ lat: c.lat, lon: c.lng, zoom: z }) }
    m.on('moveend', emit); m.once('load', emit)
    // cuenta los edificios a menos de 800 m del centro con los datos ya descargados (no descarga nada; no depende del zoom)
    if (vector) m.on('idle', () => {
      const off = () => { if (porAviso.current) { porAviso.current = false; setSatOn(false) } }
      if (m.getZoom() < 13) { setEmpty(false); setQuedar3d(false); off(); return } // al alejarse: sin aviso y sin el satélite del aviso
      // los mapas solo traen los edificios desde el zoom 14: más lejos no se puede saber si hay o no, así que no se avisa
      if (m.getZoom() < 14) { setEmpty(false); return }
      const c = m.getCenter(), cos = Math.cos(c.lat * Math.PI / 180), seen = new Set()
      let feats = []; try { feats = m.querySourceFeatures('omt', { sourceLayer: 'building' }) } catch { return }
      for (const f of feats) {
        let pt = f.geometry?.coordinates; while (Array.isArray(pt?.[0])) pt = pt[0]; if (!pt) continue
        const dx = (pt[0] - c.lng) * 111.32 * cos, dy = (pt[1] - c.lat) * 110.57
        if (dx * dx + dy * dy < 0.64) seen.add(pt[0].toFixed(6) + ',' + pt[1].toFixed(6)) // por posición: el número de los edificios puede venir repetido
      }
      const b = seen.size; cb.current.onDensity?.(b, feats.length)
      if (b > 150) { setEmpty(false); off() } else if (b < 60) setEmpty(true)
    })
    return () => { for (const mk of marks.current.values()) mk.remove(); marks.current.clear(); m.remove(); map.current = null }
  }, [])
  // al tocar otro pin/lugar con la vista 3D ya abierta, la cámara viaja hasta allí (antes solo se movía el mapa plano de abajo)
  // al tocar otro lugar con el 3D abierto, la cámara viaja hasta allí. Cerca: vuelo corto. Lejos: sube, cruza el mapa y baja, a la vista.
  // Con el interruptor «Vuelo de cámara» apagado en el panel, el desplazamiento es el simple de antes.
  useEffect(() => {
    const m = map.current; if (!m) return; const c = m.getCenter(), dLat = center.lat - c.lat, dLon = center.lon - c.lng
    if (Math.abs(dLat) + Math.abs(dLon) <= 1e-5) return
    const km = Math.hypot(dLat * 111, dLon * 111 * Math.cos(c.lat * Math.PI / 180)), z = Math.max(15, zoom - 1), to = [center.lon, center.lat], id = ++flightId.current
    if (!flight || km < 3) { m.flyTo({ center: to, zoom: z, pitch: 55, duration: 1400 }); return }
    flying.current = true; const done = () => { if (id === flightId.current) flying.current = false }
    // el viaje se VE: la cámara sube, cruza el mapa en una curva y baja (los mapas de lejos son livianos). Lo más largo dura unos 7 s.
    m.flyTo({ center: to, zoom: z, pitch: 58, curve: km > 800 ? 1.7 : 1.45, speed: km > 800 ? 0.75 : 0.9, maxDuration: km > 800 ? 7000 : 4500, essential: true }); m.once('moveend', done)
  }, [center.lat, center.lon]) // eslint-disable-line react-hooks/exhaustive-deps
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
    // sitio turístico abierto: su pin con el nombre, para ver exactamente dónde queda
    if (site?.lat != null) add('t' + site.id, [site.lon, site.lat], `<div class="biz-pin feat"><span>${siteSvg(site.cat, 15) || svg('otro', 15)}</span><i></i><em>${esc(site.name)}</em></div>`, 'm25-pin zoomed', () => {})
    for (const [k, mk] of marks.current) { const w = want.get(k); if (!w || mk._html !== w.html) { mk.remove(); marks.current.delete(k) } else mk.setLngLat(w.ll) }
    for (const [k, w] of want) { if (marks.current.has(k)) continue
      const d = document.createElement('div'); d.className = w.cls; d.innerHTML = w.html; d.addEventListener('click', e => { e.stopPropagation(); w.onClick() })
      const mk = new maplibregl.Marker({ element: d, anchor: w.cls.includes('pin') ? 'bottom' : 'center' }).setLngLat(w.ll).addTo(m); mk._html = w.html; marks.current.set(k, mk) }
  }, [points, places, cams, stations, walks, site])
  useEffect(() => {
    const m = map.current; if (!m || !vector) return
    const apply = () => { try {
      // con satélite, menos inclinación: se ve menos horizonte y se piden muchas menos fotos (las fotos pesan mucho más que el mapa oscuro)
      if (satOn) { m.setMaxPitch(45); if (m.getPitch() > 40) m.easeTo({ pitch: 40, duration: 400 }) } else m.setMaxPitch(70)
      m.setLayoutProperty('satelite', 'visibility', satOn ? 'visible' : 'none'); for (const id of GROUND) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', satOn ? 'none' : 'visible') } catch { /* estilo aún cargando */ } }
    if (m.isStyleLoaded()) apply(); else m.once('style.load', apply)
  }, [satOn, vector])
  const exit = () => { const m = map.current, c = m.getCenter(); onExit({ lat: c.lat, lon: c.lng, zoom: m.getZoom() + 1 }) }
  return <div className="map25">
    <div ref={el} className="map25-c" />
    {vector && empty && !satOn && !quedar3d && <div className="m25-vacio"><span>Aquí hay poco dibujado en el mapa</span><div>
      <button className="sec" onClick={() => setQuedar3d(true)}>Ver 3D</button>
      <button onClick={() => { porAviso.current = true; setSatOn(true) }}>Ver satélite</button></div></div>}
    <div className="map-ctrl map25-ctrl">
      <button onClick={() => map.current?.zoomIn()} aria-label="Acercar"><Plus size={16} /></button>
      <button onClick={() => map.current?.zoomOut()} aria-label="Alejar"><Minus size={16} /></button>
      {vector && <button className={'btn-sat' + (satOn ? ' on' : '')} onClick={() => { auto.current = false; setSatOn(v => !v) }} title={satOn ? 'Quitar foto de satélite' : 'Ver foto de satélite'} aria-label="Foto de satélite">SAT</button>}
      <button className="btn-3d on" onClick={() => { onFlat(); exit() }} title="Volver al mapa plano" aria-label="Volver al mapa plano">2D</button>
    </div>
  </div>
}

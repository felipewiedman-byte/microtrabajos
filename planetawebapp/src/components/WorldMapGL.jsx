import FlatIcon from './FlatIcon'
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useRadio, play as playRadio } from '../radio'
import { svg } from '../icons'
import { siteSvg } from '../sitesIcons'
import { Plus, Minus, LocateFixed, Layers, Globe2, CloudRain } from 'lucide-react'
import { PHOTOS } from '../data'
import { useRainOn, useRainLayer } from './rain'
import { useNightLayer } from './nightlayer'
import { useSkyMarkers } from './skyobjects'
import { esc, STYLE_V, PIXELS, ICONS, drawIcon, drawShield, GROUND } from './mapStyle'

// Mapa plano principal con el MISMO dibujo vectorial que la vista 3D (OpenFreeMap): sin cuadros de imagen
// y sin pasar por el servidor de la web. Hace lo mismo que el mapa plano antiguo (WorldMap, que queda de respaldo
// para equipos sin aceleración gráfica) y recibe las mismas propiedades.
// Zoom: el resto de la web habla en «zoom de Leaflet»; este mapa usa uno menos (cuadros de 512), así que se suma/resta 1.
const BASES = ['oscuro', 'satelite']
const BASE_LABEL = { oscuro: 'Mapa oscuro', satelite: 'Satélite' }
const LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']
const okImg = u => /^(\/uploads\/|https?:\/\/)[^"'<>]+$/.test(u || '')
// plano: sin edificios en 3D ni inclinación
const STYLE_FLAT = { ...STYLE_V, layers: STYLE_V.layers.filter(l => l.type !== 'fill-extrusion') }
const empty = { type: 'FeatureCollection', features: [] }
const line = pts => ({ type: 'FeatureCollection', features: pts?.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }] : [] })

const QUAKE = i => i && i.handle === 'alertas' && /magnitud\s+([\d.]+)/i.exec(i.title || '')
const quakePin = mag => { const m = +mag, c = m >= 7 ? '#ff3b30' : m >= 6 ? '#ff6b2c' : m >= 5 ? '#ff9f1a' : '#ffc23d'; return `<div class="quake-pin" style="--qc:${c}"><i></i><i></i><b>${m.toFixed(1)}</b></div>` }

export default function WorldMapGL({ live, sheet, people, onPerson, points, selected, onSelect, focus, home, onBounds, pinMode, onPlace, drop, footprint, onZoomOutMax, places, onPlacePick, sites, siteSel, onSitePick, walks, walkRoute, onWalkPick, followWalk, cams, onCamPick, camSel, onStreet, onGlobe, initial }) {
  const cbs = useRef({}); cbs.current = { onPerson, onSelect, onBounds, onPlace, onZoomOutMax, onPlacePick, onSitePick, onWalkPick, onCamPick, onStreet }
  const pinModeRef = useRef(pinMode); pinModeRef.current = pinMode
  const sheetRef = useRef(sheet); sheetRef.current = sheet   // celular: hay una tarjeta abierta abajo; el lugar se centra en la parte libre del mapa
  const el = useRef(null), map = useRef(null), ready = useRef(false), initRef = useRef(initial)
  const groups = useRef({}) // capas de marcadores: nombre → [marcadores]
  const [loaded, setLoaded] = useState(false), [vista, setVista] = useState(0) // «vista» sube al mover el mapa: los pines se vuelven a agrupar
  const [base, setBase] = useState(() => { try { return BASES.includes(sessionStorage.getItem('mapBase')) ? sessionStorage.getItem('mapBase') : 'oscuro' } catch { return 'oscuro' } })
  useEffect(() => { try { sessionStorage.setItem('mapBase', base) } catch { /* sin almacenamiento */ } }, [base])

  // marcadores HTML (mismas clases y estilos que el mapa antiguo)
  const mk = (html, ll, { anchor = 'center', z = 0, title, onClick, cls = '' } = {}) => {
    const d = document.createElement('div'); d.className = 'gl-mk ' + cls; d.innerHTML = html; if (title) d.title = title; d.style.zIndex = String(1000 + z)
    if (onClick) d.addEventListener('click', e => { e.stopPropagation(); if (pinModeRef.current) { const p = map.current.unproject([e.clientX - map.current.getContainer().getBoundingClientRect().left, e.clientY - map.current.getContainer().getBoundingClientRect().top]); cbs.current.onPlace?.({ lat: p.lat, lng: p.lng }) } else onClick() })
    else d.style.pointerEvents = 'none'
    return new maplibregl.Marker({ element: d, anchor }).setLngLat(ll)
  }
  const setGroup = (name, list) => { for (const m of groups.current[name] || []) m.remove(); groups.current[name] = list; if (map.current) for (const m of list) m.addTo(map.current) }

  useEffect(() => {
    const i = initRef.current
    const m = map.current = new maplibregl.Map({ container: el.current, style: STYLE_FLAT, center: i ? [i.lon, i.lat] : [-40, 18], zoom: i ? Math.max(0, i.z - 1) : 1.5,
      minZoom: 1, maxZoom: 17, pitch: 0, maxPitch: 0, dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: { compact: true }, fadeDuration: 0, pixelRatio: PIXELS, renderWorldCopies: true })
    m.touchZoomRotate.disableRotation()
    m.on('styleimagemissing', e => { if (m.hasImage(e.id)) return; if (ICONS[e.id]) m.addImage(e.id, drawIcon(e.id), { pixelRatio: 2 })
      else if (e.id === 'escudo') m.addImage('escudo', drawShield(), { pixelRatio: 2, stretchX: [[10, 38]], stretchY: [[10, 30]], content: [8, 6, 40, 34] }) })
    m.on('error', e => console.warn('Mapa:', e?.error?.message))
    m.once('load', () => {
      // líneas: huella (puntitos naranjas) y ruta del paseo abierto
      m.addSource('huella', { type: 'geojson', data: empty }); m.addSource('ruta', { type: 'geojson', data: empty })
      m.addLayer({ id: 'huella', type: 'line', source: 'huella', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffb45a', 'line-width': 2, 'line-opacity': 0.9, 'line-dasharray': [0.5, 3.5] } })
      m.addLayer({ id: 'ruta-halo', type: 'line', source: 'ruta', paint: { 'line-color': '#5cc8b0', 'line-width': 12, 'line-opacity': 0.25 } })
      m.addLayer({ id: 'ruta', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#a8f0dc', 'line-width': 3.5, 'line-opacity': 0.95 } })
      ready.current = true; setLoaded(true)
    })
    // publicar con un pin: tocar en modo pin, clic derecho, o mantener el dedo apretado (móvil)
    m.on('click', e => { if (pinModeRef.current) cbs.current.onPlace?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }) })
    m.on('contextmenu', e => cbs.current.onPlace?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
    let press = null
    m.on('touchstart', e => { if (e.originalEvent.touches.length !== 1) { clearTimeout(press); return } const ll = e.lngLat; press = setTimeout(() => cbs.current.onPlace?.({ lat: ll.lat, lng: ll.lng }), 650) })
    for (const ev of ['touchend', 'touchmove', 'touchcancel', 'movestart']) m.on(ev, () => clearTimeout(press))
    // nombres de negocios y lugares visibles al acercar (como .zoomed en el mapa antiguo); emisoras desde zoom 5
    const zc = () => { const z = m.getZoom() + 1; el.current?.classList.toggle('zoomed', z > 5); el.current?.classList.toggle('gl-far', z < 5) }
    m.on('zoomend', zc); zc()
    const emit = () => { const b = m.getBounds(); cbs.current.onBounds?.({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast(), z: m.getZoom() + 1 }) }
    m.on('moveend', emit); m.once('load', emit)
    let tv; m.on('moveend', () => { clearTimeout(tv); tv = setTimeout(() => setVista(v => v + 1), 140) })
    // de cerca (calle) pasa a la vista 3D, igual que antes
    m.on('zoomend', () => { if (m.getZoom() + 1 >= 13 && !pinModeRef.current) { const c = m.getCenter(); cbs.current.onStreet?.({ lat: c.lat, lon: c.lng }, m.getZoom() + 1, false) } })
    // alejar más allá del mundo entero: vuelve al globo
    let outTicks = 0
    const atMin = () => m.getZoom() <= m.getMinZoom() + 0.01
    el.current.addEventListener('wheel', e => { if (e.deltaY > 0 && atMin()) { if (++outTicks >= 2) { outTicks = 0; const c = m.getCenter(); cbs.current.onZoomOutMax?.(c.lat, c.lng) } } else if (e.deltaY < 0) outTicks = 0 }, { passive: true })
    let pinch = 0, pinchOut = false
    el.current.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) }, { passive: true })
    el.current.addEventListener('touchmove', e => { if (pinch && e.touches.length === 2) pinchOut = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) < pinch * 0.85 && atMin() }, { passive: true })
    el.current.addEventListener('touchend', e => { if (pinch && e.touches.length < 2) { if (atMin() && pinchOut) { const c = m.getCenter(); cbs.current.onZoomOutMax?.(c.lat, c.lng) } pinch = 0; pinchOut = false } }, { passive: true })
    return () => { clearTimeout(press); for (const g of Object.values(groups.current)) for (const x of g) x.remove(); groups.current = {}; m.remove(); map.current = null; ready.current = false }
  }, [])

  // base: mapa oscuro o foto de satélite (directo de Esri, sin pasar por el servidor)
  useEffect(() => {
    const m = map.current; if (!m || !loaded) return
    const sat = base === 'satelite'
    m.setLayoutProperty('satelite', 'visibility', sat ? 'visible' : 'none'); for (const id of GROUND) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', sat ? 'none' : 'visible')
  }, [base, loaded])

  // publicaciones agrupadas por ciudad (con marcador en vivo de partidos) + mi ciudad
  useEffect(() => {
    if (!loaded) return
    const by = {}; (points || []).forEach(p => { (by[p.city] ||= { ...p, items: [] }).items.push(p.post) })
    const ab = n => esc(String(n || '').replace(/[^A-Za-zÀ-ÿ ]/g, '').trim().slice(0, 3).toUpperCase())
    const m = map.current, W = m.getContainer().clientWidth, H = m.getContainer().clientHeight, CELL = 60
    const pinOf = c => {
      const top = c.items[0], live = c.items.some(i => i.type === 'directo'), feat = c.items.some(i => i.featured), sel = selected === c.city
      const lm = c.items.map(i => i.match).find(x => x && LIVE.includes(x.st))
      const score = lm ? `<span class="pin-score"><i></i>${ab(lm.h)} ${lm.gh ?? 0}-${lm.ga ?? 0} ${ab(lm.a)}<em>${lm.st === 'HT' ? 'ET' : (lm.el || 0) + "'"}</em></span>` : ''
      const src = top.thumb || top.image || (PHOTOS[top.scene] || '').replace('w=1200', 'w=96'), q = c.items.length === 1 && QUAKE(top)
      if (q) return mk(quakePin(q[1]), [c.lon, c.lat], { z: sel ? 60 : 30, title: top.title, onClick: () => cbs.current.onSelect?.(c.city) })
      return mk(`<div class="pin${sel ? ' sel' : ''}${live ? ' live' : ''}${feat ? ' feat' : ''}${/api-sports\.io/.test(src) ? ' crest' : ''}">${score}<div class="pin-img" style="background-image:url('${okImg(src) ? esc(src) : ''}')"></div>${c.items.length > 1 ? `<b>${c.items.length}</b>` : ''}<i></i></div>`,
        [c.lon, c.lat], { anchor: 'bottom', z: sel ? 60 : live ? 40 : 20, title: c.city, onClick: () => cbs.current.onSelect?.(c.city) })
    }
    // pines cercanos en pantalla se juntan en un círculo con el número de publicaciones (tocar = acercar); SOLO las publicaciones de usuarios; todo lo demás (partidos, verificadas, directos, destacados, ciudad abierta) sale suelto
    const list = [], cells = new Map()
    for (const c of Object.values(by)) {
      if (selected === c.city || c.items.some(i => i.type !== 'usuario' || i.featured || i.match)) { list.push(pinOf(c)); continue }   // partidos, noticias verificadas, directos y destacados NUNCA se agrupan; solo las publicaciones de usuarios
      const pt = m.project([c.lon, c.lat]); if (pt.x < -90 || pt.y < -90 || pt.x > W + 90 || pt.y > H + 90) continue
      const k = Math.floor(pt.x / CELL) + ',' + Math.floor(pt.y / CELL); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(c)
    }
    for (const g of cells.values()) {
      if (g.length === 1) { list.push(pinOf(g[0])); continue }
      const n = g.reduce((s, c) => s + c.items.length, 0), lon = g.reduce((s, c) => s + c.lon, 0) / g.length, lat = g.reduce((s, c) => s + c.lat, 0) / g.length, size = n > 99 ? 32 : 28
      list.push(mk(`<div class="biz-cluster" style="width:${size}px;height:${size}px">${n > 999 ? Math.round(n / 1000) + 'k' : n}</div>`, [lon, lat], { z: 25, title: n + ' publicaciones', onClick: () => m.easeTo({ center: [lon, lat], zoom: Math.min(m.getZoom() + 2.3, 17), duration: 600 }) }))
    }
    if (home) list.push(mk('<div class="home-dot"></div>', [home.lon, home.lat], { z: -10 }))
    setGroup('pins', list)
  }, [points, selected, home, loaded, vista]) // eslint-disable-line react-hooks/exhaustive-deps

  // huella (recorrido numerado) y el pin de «publicar aquí»
  useEffect(() => {
    const m = map.current; if (!m || !loaded) return
    m.getSource('huella')?.setData(line((footprint || []).map(f => [f.lon, f.lat])))
    const list = (footprint || []).map((f, i) => mk(`<div class="fp-dot">${i + 1}</div>`, [f.lon, f.lat]))
    if (drop) list.push(mk('<div class="drop-pin"><span></span><b>+</b></div>', [drop.lon, drop.lat], { z: 90 }))
    setGroup('extra', list)
  }, [footprint, drop, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // sitios turísticos y naturales
  useEffect(() => {
    if (!loaded) return
    setGroup('sites', (sites || []).map(s => mk(`<div class="site-pin c-${esc(s.cat)}${s.id === siteSel ? ' on' : ''}"><span>${siteSvg(s.cat, 16)}</span><em>${esc(s.name)}</em></div>`,
      [s.plon ?? s.lon, s.plat ?? s.lat], { z: s.id === siteSel ? 30 : 0, title: s.name, onClick: () => cbs.current.onSitePick?.(s.id) })))
  }, [sites, siteSel, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // negocios (y grupos con número cuando hay muchos)
  useEffect(() => {
    if (!loaded) return
    const list = []
    for (const c of places?.clusters || []) { const size = c.n > 999 ? 54 : c.n > 99 ? 46 : 38
      list.push(mk(`<div class="biz-cluster${c.featured ? ' feat' : ''}" style="width:${size}px;height:${size}px">${c.n > 999 ? Math.round(c.n / 1000) + 'k' : c.n}</div>`, [c.lon, c.lat],
        { z: 35, onClick: () => map.current.flyTo({ center: [c.lon, c.lat], zoom: Math.min(17, map.current.getZoom() + 3), duration: 800 }) })) }
    for (const pl of places?.places || []) list.push(mk(`<div class="biz-pin${pl.featured ? ' feat' : ''}">${pl.offers ? '<b title="Tiene ofertas hoy"></b>' : ''}<span>${okImg(pl.avatar) ? `<img src="${esc(pl.avatar)}" alt="">` : svg(pl.type, 17) || svg('otro', 17)}</span><i></i><em>${esc(pl.name)}</em></div>`,
      [pl.lon, pl.lat], { anchor: 'bottom', z: pl.featured ? 55 : 45, title: pl.name, onClick: () => cbs.current.onPlacePick?.(pl.id) }))
    setGroup('biz', list)
  }, [places, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // emisoras (pin morado; tocar = escuchar). De lejos se esconden con CSS (.gl-far)
  const radioStations = useRadio(s => s.stations), radioCur = useRadio(s => s.cur?.id)
  useEffect(() => {
    if (!loaded) return
    setGroup('radio', (radioStations || []).filter(st => st.lat != null && st.lon != null).map(st => mk(`<div class="st-pin${radioCur === st.id ? ' on' : ''}">${okImg(st.logo) ? `<img src="${esc(st.logo)}" alt="">` : svg('radio', 15)}</div>`,
      [st.lon, st.lat], { z: 50, title: st.name, cls: 'gl-st', onClick: () => playRadio(st) })))
  }, [radioStations, radioCur, loaded])

  // paseos en vivo: el punto se mueve sin recrear el marcador
  const wk = useRef(new Map())
  useEffect(() => {
    const m = map.current; if (!m || !loaded || !walks) return
    const seen = new Set()
    for (const w of walks) { if (w.lat == null) continue; seen.add(w.id)
      const old = wk.current.get(w.id)
      if (old) old.setLngLat([w.lon, w.lat])
      else wk.current.set(w.id, mk(`<div class="walker-pin"><em>${esc(String(w.name).split(' ')[0])} · ${esc(w.city)}</em></div>`, [w.lon, w.lat], { z: 95, title: w.title, onClick: () => cbs.current.onWalkPick?.(w.id) }).addTo(m)) }
    for (const [id, x] of wk.current) if (!seen.has(id)) { x.remove(); wk.current.delete(id) }
  }, [walks, loaded])
  useEffect(() => () => { for (const x of wk.current.values()) x.remove(); wk.current.clear() }, [])

  // ruta y fotos del paseo abierto (los puntos llegan como [lat, lon])
  useEffect(() => {
    const m = map.current; if (!m || !loaded) return
    m.getSource('ruta')?.setData(line((walkRoute?.points || []).map(p => [p[1], p[0]])))
    setGroup('ruta', (walkRoute?.media || []).filter(x => okImg(x.thumb || x.image)).map(x => mk(`<div class="wk-photo" style="background-image:url('${esc(x.thumb || x.image)}')"></div>`, [x.lon, x.lat],
      { anchor: 'bottom', z: 85, onClick: () => window.open(x.image || x.thumb, '_blank', 'noopener') })))
  }, [walkRoute, loaded]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (followWalk && map.current && walkRoute?.head) map.current.panTo([walkRoute.head[1], walkRoute.head[0]], { duration: 1000 }) }, [followWalk, walkRoute?.head?.[0], walkRoute?.head?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  // cámaras en vivo
  useEffect(() => {
    if (!loaded) return
    setGroup('cams', (cams || []).map(c => mk(`<div class="cam-pin${camSel === c.id ? ' on' : ''}">${svg('video', 14)}</div>`, [c.lon, c.lat], { z: 30, title: c.title, onClick: () => cbs.current.onCamPick?.(c.id) })))
  }, [cams, camSel, loaded])

  // personas que aceptaron mostrarse: de lejos un círculo con la bandera y el número; de cerca, cada una
  useEffect(() => {
    if (!loaded) return
    const list = []
    for (const c of people?.groups || []) { const flag = /^[a-z]{2}$/.test(c.cc || '') ? `style="background-image:url('https://flagcdn.com/w40/${c.cc}.png')"` : ''
      list.push(mk(`<div class="pp-group" ${flag}><b>${+c.n}</b></div>`, [c.lon, c.lat], { z: 25, title: c.n + ' personas', onClick: () => map.current.flyTo({ center: [c.lon, c.lat], zoom: Math.min(map.current.getZoom() + 3, 15), duration: 800 }) })) }
    for (const p of people?.singles || []) {
      const ini = esc(String(p.name || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase())
      const bg = okImg(p.avatar) ? `style="background-image:url('${esc(p.avatar)}')"` : `style="background:hsl(${+p.hue || 200} 45% 38%)"`
      list.push(mk(`<div class="pp-one" ${bg}>${okImg(p.avatar) ? '' : ini}</div>`, [p.lon, p.lat], { z: 28, title: p.name, onClick: () => cbs.current.onPerson?.(p) })) }
    setGroup('people', list)
  }, [people, loaded])

  // viajar a un lugar (la primera vez, si se vuelve de otra página, se queda donde estaba)
  const firstFocus = useRef(true)
  useEffect(() => { if (firstFocus.current) { firstFocus.current = false; if (initRef.current) return } if (focus && map.current) map.current.flyTo({ center: [focus.lon, focus.lat], zoom: Math.max(0, focus.z - 1), duration: 1100, padding: sheetRef.current ? { top: 70, bottom: Math.round(map.current.getContainer().clientHeight * 0.46), left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 } }) }, [focus])

  const cycle = () => setBase(b => BASES[(BASES.indexOf(b) + 1) % BASES.length])
  const zoomBy = d => map.current?.easeTo({ zoom: map.current.getZoom() + d, duration: 300 })
  const [rain, setRain] = useRainOn(); useRainLayer(map, loaded, rain); useNightLayer(map, loaded, live !== false); useSkyMarkers(map, loaded, live !== false)
  const desk = typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches
  return (
    <div className={'map' + (pinMode ? ' pin-mode' : '')}>
      <div ref={el} className="leaf gl-map" />
      <div className="map-ctrl">
        <button onClick={() => zoomBy(1)} aria-label="Acercar">{desk ? <FlatIcon name="mas" size={18} /> : <Plus size={16} />}</button>
        <button onClick={() => zoomBy(-1)} aria-label="Alejar">{desk ? <FlatIcon name="menos" size={18} /> : <Minus size={16} />}</button>
        {home && <button onClick={() => map.current.flyTo({ center: [home.lon, home.lat], zoom: 10, duration: 1000 })} title="Mi ciudad" aria-label="Mi ciudad">{desk ? <FlatIcon name="mira" size={18} /> : <LocateFixed size={16} />}</button>}
        {onStreet && <button className="btn-3d" onClick={() => { const m = map.current, z = m.getZoom() + 1, far = z < 12, c = far && home ? { lat: home.lat, lng: home.lon } : m.getCenter(); onStreet({ lat: c.lat, lon: c.lng }, far ? 16 : Math.max(16, z), true) }} title="Ver la calle en perspectiva 3D" aria-label="Ver en 3D">3D</button>}
        {onGlobe && <button onClick={onGlobe} title="Ver el globo" aria-label="Ver el globo">{desk ? <FlatIcon name="globo" size={18} /> : <Globe2 size={16} />}</button>}
        <button className={rain ? 'on-rain' : ''} onClick={() => setRain(!rain)} title={rain ? 'Quitar la lluvia' : 'Ver la lluvia en vivo'} aria-label="Lluvia en vivo"><CloudRain size={desk ? 18 : 16} /></button>
        <button onClick={cycle} title={'Cambiar a ' + BASE_LABEL[BASES[(BASES.indexOf(base) + 1) % BASES.length]]} aria-label="Cambiar mapa">{desk ? <FlatIcon name="capas" size={18} /> : <Layers size={16} />}</button>
      </div>
      <div className="map-mode">{BASE_LABEL[base]}</div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
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
// iconos de lugar dibujados en el propio navegador (no se descarga ningún archivo): círculo de color + dibujo blanco
const ICONS = {
  'i-salud': ['#e2667a', 'M12 6v12M6 12h12'],
  'i-estacion': ['#3d7fd1', 'M7 4h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM5 11h14M9 17l-2 3M15 17l2 3'],
  'i-estadio': ['#2f9e5f', 'M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM12 9l3 2-1 3h-4l-1-3z'],
  'i-culto': ['#9c8a63', 'M12 3v6M9 5.5h6M6 20v-7l6-4 6 4v7zM10.5 20v-3h3v3'],
  'i-estudio': ['#7b63d6', 'M2.5 10L12 5.5l9.5 4.5-9.5 4.5zM6.5 12v4c3 2.2 8 2.2 11 0v-4'],
  'i-verde': ['#3f9c63', 'M12 3.5l5.5 9h-11zM12 12.5v7'],
  'i-turismo': ['#c8962e', 'M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z'],
  'i-compras': ['#c4639f', 'M6 8.5h12l-1 11H7zM9 8.5a3 3 0 0 1 6 0'],
  'i-avion': ['#3d7fd1', 'M12 3.5v16M4 13l8-4 8 4M9 19.5l3-1 3 1'],
}
const drawIcon = id => { const [bg, d] = ICONS[id], S = 22, c = document.createElement('canvas'); c.width = c.height = S * 2
  const x = c.getContext('2d'); x.scale(2, 2); x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 1, 0, 7); x.fillStyle = bg; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#0b0e12'; x.stroke()
  x.translate(3, 3); x.scale(16 / 24, 16 / 24); x.strokeStyle = '#fff'; x.lineWidth = 2.4; x.lineCap = x.lineJoin = 'round'; x.stroke(new Path2D(d))
  return { width: S * 2, height: S * 2, data: x.getImageData(0, 0, S * 2, S * 2).data } }
// escudo para números de carretera (se estira al ancho del número)
const drawShield = () => { const W = 24, H = 20, c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2
  const x = c.getContext('2d'); x.scale(2, 2); x.beginPath(); x.roundRect(1, 1, W - 2, H - 2, 4); x.fillStyle = '#2b3446'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#8a9bb8'; x.stroke()
  return { width: W * 2, height: H * 2, data: x.getImageData(0, 0, W * 2, H * 2).data } }
const TYPE_ES = { stadium: 'Estadio', hospital: 'Hospital', college: 'Universidad', university: 'Universidad', school: 'Colegio', park: 'Parque', zoo: 'Zoológico', garden: 'Jardín', attraction: 'Lugar de interés', museum: 'Museo', castle: 'Castillo', monument: 'Monumento', art_gallery: 'Galería de arte', theatre: 'Teatro', townhall: 'Ayuntamiento', place_of_worship: 'Templo', shop: 'Centro comercial', railway: 'Estación', bus: 'Estación de autobuses' }
// si no caben todos los nombres, ganan los lugares más conocidos (rank bajo = más importante en OpenMapTiles)
const POI = (id, classes, color, minzoom, sub, icon, notSub) => ({ id, type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom,
  filter: ['all', ['match', ['get', 'class'], classes, true, false], sub ? ['match', ['get', 'subclass'], sub, true, false] : true, notSub ? ['!', ['match', ['get', 'subclass'], notSub, true, false]] : true],
  // text-padding: los nombres se separan más entre sí, así no se amontonan ni se repiten pegados
  layout: { 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99], 'icon-image': icon, 'icon-size': 0.5, 'icon-anchor': 'bottom', 'text-anchor': 'top', 'text-offset': [0, 0.15], 'text-padding': 8,
    'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-optional': true, 'text-max-width': 8 },
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
  sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap · OpenFreeMap' },
    // foto de satélite: el navegador la pide DIRECTO a Esri (su red rápida), sin pasar por el servidor de la web:
    // con la vista inclinada se piden muchas fotos a la vez y por el servidor se hacía cola y todo iba lento.
    // Solo se descarga si se enciende; detalle máximo 17 para pedir menos fotos.
    sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 17, attribution: 'Imágenes © Esri' } },
  // cielo y neblina en el horizonte (aspecto de videojuego); si la versión del mapa no los admite, se ignoran
  // luz lateral: las fachadas quedan en distinto tono y los edificios se leen en volumen (no cuesta nada extra)
  light: { anchor: 'viewport', color: '#ffffff', intensity: 0.5, position: [1.5, 210, 35] },
  // el cielo se pone al abrir el mapa según la hora del lugar (skyFor)
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#14171c' } },
    { id: 'satelite', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 0.85, 'raster-saturation': 0.05, 'raster-fade-duration': 0 } },
    LU('uso-residencial', ['residential', 'suburb', 'neighbourhood'], '#171a20'),
    LU('uso-comercial', ['commercial', 'retail'], '#1d1f29'),
    LU('uso-industrial', ['industrial', 'garages'], '#1b1c20'),
    LU('uso-ferroviario', ['railway'], '#1d1b22'),
    LU('uso-salud', ['hospital'], '#2a1d25'),
    LU('uso-estudio', ['school', 'university', 'college', 'kindergarten'], '#231f33'),
    LU('uso-cementerio', ['cemetery'], '#16221b'),
    LU('uso-deporte', ['stadium', 'pitch', 'playground', 'track', 'sports_centre'], '#24603d'),
    { id: 'borde-deporte', type: 'line', source: 'omt', 'source-layer': 'landuse', minzoom: 13, filter: ['match', ['get', 'class'], ['stadium', 'pitch'], true, false], paint: { 'line-color': '#4fae73', 'line-width': 1, 'line-opacity': 0.7 } },
    { id: 'verde', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'grass', 'farmland'], true, false], paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#16291d', 'farmland', '#1b2619', '#1a2e21'], 'fill-opacity': 0.9 } },
    { id: 'arena', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['sand'], true, false], paint: { 'fill-color': '#2d2b22' } },
    { id: 'parque', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#1f3a2a', 'fill-opacity': 0.95 } },
    { id: 'orilla', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 11, filter: ['match', ['get', 'class'], ['ocean', 'lake'], true, false],
      paint: { 'line-color': '#3a3528', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 17, 8] } },
    { id: 'agua', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#0d2237' } },
    { id: 'borde-agua', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 10, paint: { 'line-color': '#2a5d8a', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 1.6], 'line-opacity': 0.8 } },
    { id: 'rio', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': '#0d2237', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 16, 3] } },
    { id: 'pista-aerea', type: 'fill', source: 'omt', 'source-layer': 'aeroway', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#262a31' } },
    // plazas y zonas peatonales como suelo claro
    { id: 'plaza', type: 'fill', source: 'omt', 'source-layer': 'transportation', minzoom: 14, filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['match', ['get', 'class'], ['pedestrian', 'path'], true, false]], paint: { 'fill-color': '#2b2e36' } },
    // sombra bajo los puentes: se ve que pasan por encima del río o de otras calles
    { id: 'puente-sombra', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13, filter: ['==', ['get', 'brunnel'], 'bridge'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#05070a', 'line-opacity': 0.7, 'line-blur': 3, 'line-translate': [2, 4], 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 4, 19, 26] } },
    ROAD('via-menor', ['minor', 'service', 'track', 'path'], '#3d424c', [0.2, 1.3, 4.5]),
    ROAD('via-terciaria', ['tertiary', 'secondary'], '#5c606a', [0.4, 2.5, 9]),
    ROAD('via-principal', ['primary', 'trunk'], '#6e6049', [0.4, 2, 12]),
    ROAD('via-autopista', ['motorway'], '#8a704a', [0.5, 2.4, 14]),
    ROAD('via-tren', ['rail', 'transit'], '#4a5262', [0.3, 1, 2.2]),
    // traviesas: dibujo clásico de vía de tren al acercarse
    { id: 'via-tren-traviesa', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14.5, filter: ['match', ['get', 'class'], ['rail', 'transit'], true, false],
      paint: { 'line-color': '#4a5262', 'line-dasharray': [0.2, 2], 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 14.5, 3, 19, 9] } },
    // edificios: más altos y con color según la altura (los bajos en gris, los altos en azul claro)
    { id: 'edificios-plano', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, maxzoom: UP, paint: { 'fill-color': '#2f3440', 'fill-outline-color': '#3a404d' } },
    { id: 'edificios', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: UP,
      paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#343947', 6, '#3b4051', 12, '#434a5e', 25, '#4e5973', 45, '#5a6a8e', 80, '#7184b0'], 'fill-extrusion-opacity': 0.92,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], UP, 0, UP + 1.2, ['min', 90, ['coalesce', ['get', 'render_height'], 9]]],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], UP, 0, UP + 1.2, ['min', 80, ['coalesce', ['get', 'render_min_height'], 0]]] } },
    { id: 'nombre-agua', type: 'symbol', source: 'omt', 'source-layer': 'water_name', minzoom: 10,
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-max-width': 7 }, paint: { 'text-color': '#5d86b0', 'text-halo-color': '#0d2237', 'text-halo-width': 1.2 } },
    { id: 'nombre-calle', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14,
      layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
      paint: { 'text-color': '#9aa3ad', 'text-halo-color': '#14171c', 'text-halo-width': 1.4 } },
    // números de autopista y carretera dentro de un escudo
    { id: 'escudo-via', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 10,
      filter: ['all', ['has', 'ref'], ['<=', ['length', ['to-string', ['get', 'ref']]], 7], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false]],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 450, 'text-rotation-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'text-field': ['get', 'ref'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5,
        'icon-image': 'escudo', 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 5, 2, 5] },
      paint: { 'text-color': '#e6ebf2' } },
    // lugares con nombre propio: estadios, hospitales, universidades, parques (la guía de la gente)
    POI('poi-estadio', ['stadium'], '#6fe0a0', 14, null, 'i-estadio'),
    POI('poi-salud', ['hospital'], '#ff9aa8', 15, null, 'i-salud'),
    POI('poi-estudio', ['college', 'university', 'school'], '#b9a6ff', 15.5, null, 'i-estudio'),
    POI('poi-verde', ['park', 'zoo', 'garden'], '#8fd6a8', 15.5, null, 'i-verde'),
    // sitios conocidos que sirven de referencia: monumentos, museos, iglesias, centros comerciales, estaciones
    POI('poi-turismo', ['attraction', 'museum', 'castle', 'monument', 'theatre', 'townhall'], '#f0c674', 14.5, null, 'i-turismo', ['artwork', 'gallery']),
    // galerías y esculturas: solo muy de cerca, para no llenar el centro de nombres
    POI('poi-arte', ['art_gallery', 'attraction'], '#d9b86a', 16.5, ['art_gallery', 'artwork', 'gallery'], 'i-turismo'),
    POI('poi-culto', ['place_of_worship'], '#d8c9a8', 15.5, null, 'i-culto'),
    POI('poi-compras', ['shop'], '#e7a6d4', 15, ['mall', 'department_store'], 'i-compras'),
    POI('poi-estacion', ['railway', 'bus'], '#8ec5ff', 15, ['station', 'subway', 'bus_station'], 'i-estacion'),
    { id: 'nombre-aeropuerto', type: 'symbol', source: 'omt', 'source-layer': 'aerodrome_label', minzoom: 10,
      layout: { 'icon-image': 'i-avion', 'icon-size': 0.55, 'icon-anchor': 'bottom', 'text-anchor': 'top', 'text-offset': [0, 0.15], 'text-optional': true, 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-max-width': 8 }, paint: { 'text-color': '#8ec5ff', 'text-halo-color': '#14171c', 'text-halo-width': 1.6 } },
    { id: 'nombre-lugar', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['match', ['get', 'class'], ['city', 'town', 'village', 'suburb', 'neighbourhood'], true, false],
      layout: { 'text-field': NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 16, 15] },
      paint: { 'text-color': '#c4ccd4', 'text-halo-color': '#14171c', 'text-halo-width': 1.6 } },
  ],
}

const GROUND = ['uso-residencial', 'uso-comercial', 'uso-industrial', 'uso-ferroviario', 'uso-salud', 'uso-estudio', 'uso-cementerio', 'uso-deporte', 'borde-deporte', 'verde', 'arena', 'parque', 'orilla', 'agua', 'borde-agua', 'rio', 'pista-aerea', 'plaza', 'edificios-plano']
export default function Map25D({ vector, sat, center, zoom, points, places, cams, stations, walks, onSelect, onPlacePick, onCamPick, onWalkPick, onBounds, onExit, onFlat }) {
  const el = useRef(null), map = useRef(null), marks = useRef(new Map())
  // satélite: se enciende solo al abrir un sitio turístico (sat), y la persona lo puede cambiar con el botón SAT
  const [satOn, setSatOn] = useState(!!sat)
  useEffect(() => { setSatOn(!!sat) }, [sat, center.lat, center.lon])
  const cb = useRef({}); cb.current = { onSelect, onPlacePick, onCamPick, onWalkPick, onBounds, onExit }
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
    <div className="map-ctrl map25-ctrl">
      <button onClick={() => map.current?.zoomIn()} aria-label="Acercar"><Plus size={16} /></button>
      <button onClick={() => map.current?.zoomOut()} aria-label="Alejar"><Minus size={16} /></button>
      {vector && <button className={'btn-sat' + (satOn ? ' on' : '')} onClick={() => setSatOn(v => !v)} title={satOn ? 'Quitar foto de satélite' : 'Ver foto de satélite'} aria-label="Foto de satélite">SAT</button>}
      <button className="btn-3d on" onClick={() => { onFlat(); exit() }} title="Volver al mapa plano" aria-label="Volver al mapa plano">2D</button>
    </div>
  </div>
}

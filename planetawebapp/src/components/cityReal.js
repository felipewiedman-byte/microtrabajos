// Ciudad 3D realista (liviana): SOLO datos reales del mapa, nada inventado.
// - Edificios con su color real (cuando el mapa lo tiene registrado), mezclado con el tono del mapa para que no desentone.
// - Se ocultan las «partes» que el mapa trae duplicadas (el contorno completo + sus partes) y se veían encimadas.
// - Estadios que en el mapa son solo una mancha plana: se levantan siguiendo SU contorno real (cada uno con su forma),
//   con tribunas en dos alturas y la cancha descubierta. Los que ya tienen su forma 3D en el mapa no se tocan.
// Se enciende/apaga desde el panel (cityReal: off / admin / all).

const SRC = 'estadio-vol', LAYER = 'estadio-vol'
const M_LAT = 110574, mLon = lat => 111320 * Math.cos(lat * Math.PI / 180)
const ringsOf = g => g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : []
function inside(pt, ring) { let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c }
  return c }
const area = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(s / 2) }
// contorno exterior real (envolvente de todas las piezas: el mapa parte los estadios grandes entre cuadros)
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo = [], up = []
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}
// el contorno encogido hacia su centro (k = 1: igual; k = 0.6: más adentro)
const shrink = (ring, c, k) => ring.map(([x, y]) => [+(c[0] + (x - c[0]) * k).toFixed(7), +(c[1] + (y - c[1]) * k).toFixed(7)])
const close = r => [...r, r[0]]
function massing(outer, pitch) {
  const lat = outer[0][1], kx = mLon(lat), xy = r => r.map(([x, y]) => [x * kx, y * M_LAT])
  const c = [outer.reduce((a, p) => a + p[0], 0) / outer.length, outer.reduce((a, p) => a + p[1], 0) / outer.length]
  const sArea = area(xy(outer)), pArea = pitch ? area(xy(pitch)) : sArea * 0.35
  const size = Math.sqrt(sArea)                                         // lado equivalente del estadio en metros
  const k = Math.max(0.45, Math.min(0.85, Math.sqrt(pArea / sArea) * 1.12))  // hueco interior: llega justo a la cancha
  const mid = (1 + k) / 2, h = Math.max(12, Math.min(42, size * 0.16))
  const band = (a, b, hh, kind) => ({ type: 'Feature', properties: { h: hh, k: kind }, geometry: { type: 'Polygon', coordinates: [close(shrink(outer, c, a)), close(shrink(outer, c, b)).reverse()] } })
  return [band(1, mid, h, 'alta'), band(mid, k, h * 0.55, 'baja')]
}

// edificios: color real (si el mapa lo tiene) mezclado con el tono del mapa para que no desentone; las «partes» duplicadas se ocultan
const realColor = base => ['case', ['has', 'colour'],
  ['let', 'r', ['to-rgba', ['to-color', ['get', 'colour'], '#8a93a6']], 'b', ['to-rgba', base],
    ['rgba', ['+', ['*', 0.55, ['at', 0, ['var', 'r']]], ['*', 0.45, ['at', 0, ['var', 'b']]]], ['+', ['*', 0.55, ['at', 1, ['var', 'r']]], ['*', 0.45, ['at', 1, ['var', 'b']]]], ['+', ['*', 0.55, ['at', 2, ['var', 'r']]], ['*', 0.45, ['at', 2, ['var', 'b']]]], 1]],
  base]

export function cityReal(m) {
  let on = false, orig = null, keys = '', cache = new Map(), busy = false
  function build() {
    if (!on || busy || m.getZoom() < 14) return; busy = true
    try {
      const land = m.querySourceFeatures('omt', { sourceLayer: 'landuse', filter: ['match', ['get', 'class'], ['stadium', 'pitch'], true, false] })
      const by = new Map(); land.forEach((f, i) => { const id = f.properties.class + ':' + (f.id ?? i); (by.get(id) || by.set(id, { k: f.properties.class, r: [] }).get(id)).r.push(...ringsOf(f.geometry)) })
      const stadiums = [...by.entries()].filter(([, v]) => v.k === 'stadium'), pitches = [...by.values()].filter(v => v.k === 'pitch').map(v => hull(v.r.flat()))
      let blds = null; const feats = [], seen = []
      for (const [id, v] of stadiums) {
        seen.push(id)
        if (!cache.has(id)) {
          const outer = hull(v.r.flat()); if (outer.length < 4) { cache.set(id, []); continue }
          const kx = mLon(outer[0][1]), sA = area(outer.map(([x, y]) => [x * kx, y * M_LAT]))
          if (sA < 6000 || sA > 250000) { cache.set(id, []); continue }   // ni canchas de barrio ni complejos enormes
          // si el mapa ya tiene el estadio como edificio con su forma, se respeta tal cual
          blds ||= m.querySourceFeatures('omt', { sourceLayer: 'building' })
          const bA = blds.reduce((a, f) => a + ringsOf(f.geometry).filter(r => inside(r[0], outer)).reduce((x, r) => x + area(r.map(([x2, y2]) => [x2 * kx, y2 * M_LAT])), 0), 0)
          const pitch = pitches.find(p => p.length > 2 && inside(p[0], outer))
          cache.set(id, bA > sA * 0.3 ? [] : massing(outer, pitch))
        }
        feats.push(...cache.get(id))
      }
      const k = seen.sort().join('|'); if (k === keys) return; keys = k
      m.getSource(SRC)?.setData({ type: 'FeatureCollection', features: feats })
    } catch { /* estilo cambiando */ } finally { busy = false }
  }
  function enable() {
    if (!m.getLayer('edificios')) return
    orig ||= { color: m.getPaintProperty('edificios', 'fill-extrusion-color'), filter: m.getFilter('edificios') }
    try { m.setPaintProperty('edificios', 'fill-extrusion-color', realColor(orig.color)) } catch { /* sin colores reales */ }
    m.setFilter('edificios', orig.filter ? ['all', orig.filter, ['!=', ['get', 'hide_3d'], true]] : ['!=', ['get', 'hide_3d'], true])
    if (!m.getSource(SRC)) m.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    const ls = m.getStyle().layers, i = ls.findIndex(l => l.id === 'edificios'), before = ls.slice(i + 1).find(l => l.type === 'symbol')?.id
    if (!m.getLayer(LAYER)) m.addLayer({ id: LAYER, type: 'fill-extrusion', source: SRC, minzoom: 14,
      paint: { 'fill-extrusion-color': ['match', ['get', 'k'], 'baja', '#566279', '#47526a'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 } }, before)
    keys = ''; m.on('idle', build); build()
  }
  function disable() {
    m.off('idle', build)
    try { if (orig) { m.setPaintProperty('edificios', 'fill-extrusion-color', orig.color); m.setFilter('edificios', orig.filter || null) } } catch { /* nada */ }
    if (m.getLayer(LAYER)) m.removeLayer(LAYER); if (m.getSource(SRC)) m.removeSource(SRC); keys = ''
  }
  return v => { if (!!v === on) return; on = !!v; try { on ? enable() : disable() } catch { /* estilo aún cargando */ } }
}

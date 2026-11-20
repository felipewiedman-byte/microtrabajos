// Ciudad 3D realista (liviana): tribunas de estadio alrededor de la cancha y edificios con su color real.
// No descarga nada: usa las formas que el mapa ya trae (contorno del estadio y su cancha) y las calcula una vez por estadio.
// Se enciende/apaga desde el panel (cityReal: off / admin / all).

const SRC = 'tribunas', LAYER = 'tribunas', ROOF = 'tribunas-techo'
const M_LAT = 110574, mLon = lat => 111320 * Math.cos(lat * Math.PI / 180)

// punto dentro de un anillo (lon/lat)
function inside(pt, ring) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c }
  return c
}
const rings = g => g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : []
const area = (ring, lat) => { let s = 0; const kx = mLon(lat); for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] * kx) * (ring[i][1] * M_LAT) - (ring[i][0] * kx) * (ring[j][1] * M_LAT); return Math.abs(s / 2) }

// rectángulo mínimo que contiene la cancha (orientación de la cancha): centro, ancho, largo y ángulo
function pitchBox(pts) {
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length, lon0 = pts.reduce((a, p) => a + p[0], 0) / pts.length, kx = mLon(lat0)
  const xy = pts.map(p => [(p[0] - lon0) * kx, (p[1] - lat0) * M_LAT])
  let best = null
  for (let d = 0; d < 90; d += 2) { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [x, y] of xy) { const u = x * c + y * s, v = -x * s + y * c; if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v }
    const ar = (x1 - x0) * (y1 - y0); if (!best || ar < best.ar) best = { ar, a, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 } }
  const c = Math.cos(best.a), s = Math.sin(best.a)
  return { lon0, lat0, kx, a: best.a, w: best.w, h: best.h, cx: best.cx * c - best.cy * s, cy: best.cx * s + best.cy * c }
}
// cuánto espacio hay entre la cancha y el borde del estadio (en el eje de la cancha)
function room(box, pts) {
  const c = Math.cos(box.a), s = Math.sin(box.a); let mu = 0, mv = 0
  for (const p of pts) { const x = (p[0] - box.lon0) * box.kx - box.cx, y = (p[1] - box.lat0) * M_LAT - box.cy
    mu = Math.max(mu, Math.abs(x * c + y * s)); mv = Math.max(mv, Math.abs(-x * s + y * c)) }
  return Math.min(mu - box.w / 2, mv - box.h / 2)
}
// anillo redondeado alrededor de la cancha a «d» metros de su borde (forma de estadio)
function ring(box, d, n = 44) {
  const A = box.w / 2 + d, B = box.h / 2 + d, c = Math.cos(box.a), s = Math.sin(box.a), out = []
  for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI, ct = Math.cos(t), st = Math.sin(t)
    const u = A * Math.sign(ct) * Math.abs(ct) ** 0.5, v = B * Math.sign(st) * Math.abs(st) ** 0.5   // superelipse: rectángulo de esquinas redondas
    const x = box.cx + u * c - v * s, y = box.cy + u * s + v * c
    out.push([+(box.lon0 + x / box.kx).toFixed(7), +(box.lat0 + y / M_LAT).toFixed(7)]) }
  out.push(out[0]); return out
}
const band = (box, d0, d1, h, kind) => ({ type: 'Feature', properties: { h, k: kind }, geometry: { type: 'Polygon', coordinates: [ring(box, d1), ring(box, d0).reverse()] } })

function standsFor(box, space) {
  const bw = Math.max(10, Math.min(55, space * 0.9)), g = 3
  const h1 = Math.max(5, Math.min(14, bw * 0.32)), h2 = Math.max(8, Math.min(38, bw * 0.72))
  return [band(box, g, g + bw * 0.55, h1, 'baja'), band(box, g + bw * 0.45, g + bw, h2, 'alta'), { ...band(box, g + bw - 4, g + bw, h2 + 2.5, 'techo'), properties: { h: h2 + 2.5, b: h2, k: 'techo' } }]
}

// edificios: color real (si el mapa lo tiene) mezclado con el tono del mapa para que no desentone; las «partes» duplicadas se ocultan
const realColor = base => ['case', ['has', 'colour'],
  ['let', 'r', ['to-rgba', ['to-color', ['get', 'colour'], '#8a93a6']], 'b', ['to-rgba', base],
    ['rgba', ['+', ['*', 0.55, ['at', 0, ['var', 'r']]], ['*', 0.45, ['at', 0, ['var', 'b']]]], ['+', ['*', 0.55, ['at', 1, ['var', 'r']]], ['*', 0.45, ['at', 1, ['var', 'b']]]], ['+', ['*', 0.55, ['at', 2, ['var', 'r']]], ['*', 0.45, ['at', 2, ['var', 'b']]]], 1]],
  base]

export function cityReal(m) {
  let on = false, orig = null, keys = '', cache = new Map(), busy = false
  const before = () => { const ls = m.getStyle().layers, i = ls.findIndex(l => l.id === 'edificios'); return ls.slice(i + 1).find(l => l.type === 'symbol')?.id }
  function build() {
    if (!on || busy || m.getZoom() < 14) return; busy = true
    try {
      const land = m.querySourceFeatures('omt', { sourceLayer: 'landuse', filter: ['match', ['get', 'class'], ['stadium', 'pitch'], true, false] })
      const group = k => { const by = new Map(); land.filter(f => f.properties.class === k).forEach((f, i) => { const id = f.id ?? (k + i); (by.get(id) || by.set(id, []).get(id)).push(...rings(f.geometry)) }); return [...by.entries()] }
      const stadiums = group('stadium'), pitches = group('pitch'), feats = [], seen = []
      let blds = null
      for (const [pid, prs] of pitches) {
        const pts = prs.flat(); if (pts.length < 4) continue
        const box = pitchBox(pts), center = [box.lon0 + box.cx / box.kx, box.lat0 + box.cy / M_LAT]
        const st = stadiums.find(([, srs]) => srs.some(r => inside(center, r))); if (!st) continue   // solo canchas DENTRO de un estadio
        const key = st[0] + ':' + pid; seen.push(key)
        if (!cache.has(key)) {
          // si el estadio ya está dibujado como edificio (tiene altura en el mapa), no se le ponen tribunas encima
          blds ||= m.querySourceFeatures('omt', { sourceLayer: 'building' })
          const sArea = st[1].reduce((a, r) => a + area(r, box.lat0), 0)
          const bArea = blds.reduce((a, f) => a + rings(f.geometry).filter(r => st[1].some(sr => inside(r[0], sr))).reduce((x, r) => x + area(r, box.lat0), 0), 0)
          const big = Math.max(box.w, box.h) > 60 && Math.max(box.w, box.h) < 200   // cancha de tamaño real (no una cancha pequeña dentro de un complejo)
          cache.set(key, big && bArea < sArea * 0.3 ? standsFor(box, room(box, st[1].flat())) : [])
        }
        feats.push(...cache.get(key))
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
    const b = before()
    if (!m.getLayer(LAYER)) m.addLayer({ id: LAYER, type: 'fill-extrusion', source: SRC, minzoom: 14, filter: ['!=', ['get', 'k'], 'techo'],
      paint: { 'fill-extrusion-color': ['match', ['get', 'k'], 'baja', '#7d879a', '#626c81'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 } }, b)
    if (!m.getLayer(ROOF)) m.addLayer({ id: ROOF, type: 'fill-extrusion', source: SRC, minzoom: 14, filter: ['==', ['get', 'k'], 'techo'],
      paint: { 'fill-extrusion-color': '#a9b3c4', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.95 } }, b)
    keys = ''; m.on('idle', build); build()
  }
  function disable() {
    m.off('idle', build)
    try { if (orig) { m.setPaintProperty('edificios', 'fill-extrusion-color', orig.color); m.setFilter('edificios', orig.filter || null) } } catch { /* nada */ }
    for (const id of [ROOF, LAYER]) if (m.getLayer(id)) m.removeLayer(id)
    if (m.getSource(SRC)) m.removeSource(SRC)
    keys = ''
  }
  return v => { if (!!v === on) return; on = !!v; try { on ? enable() : disable() } catch { /* estilo aún cargando */ } }
}

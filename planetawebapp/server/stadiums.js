// Estadios en 3D: para cada estadio donde hay partidos, el servidor trae UNA vez su contorno real de OpenStreetMap (Overpass, gratis) y lo guarda.
// La web los dibuja como un tazón (anillo con el campo abierto) con una altura realista, en vez del anillo bajo de 9 m que sale por defecto.
module.exports = function stadiums({ db, S, now }) {
  db.exec('CREATE TABLE IF NOT EXISTS stadium_shapes (key TEXT PRIMARY KEY, lat REAL, lon REAL, name TEXT, h REAL, geom TEXT, tried INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0)')
  try { db.exec('ALTER TABLE stadium_shapes ADD COLUMN ver INTEGER NOT NULL DEFAULT 1') } catch { /* ya existe */ }
  try { db.exec('ALTER TABLE stadium_shapes ADD COLUMN kind TEXT') } catch { /* ya existe */ }
  // VER 3 = contorno real + cancha real (relación con hueco, o cancha dentro del estadio). Todo lo guardado antes se descarta y se vuelve a pedir; los estadios sin cancha real NO se dibujan.
  const VER = 3
  // varios servidores públicos de Overpass: si uno está saturado (502, 503, 504, 429) se prueba el siguiente, y se reintenta con pausa
  const MIRRORS = (process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : []).concat(['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'])
  const state = { running: false, lastError: '', lastRun: 0 }
  const area = ring => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(a / 2) }
  const scale = (ring, k) => { const n = ring.length - 1 || 1; let cx = 0, cy = 0; for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1] } cx /= n; cy /= n; return ring.map(([x, y]) => [+(cx + (x - cx) * k).toFixed(7), +(cy + (y - cy) * k).toFixed(7)]) }
  const closed = ring => { const r = ring.slice(); const a = r[0], b = r[r.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) r.push(a); return r }
  const num = v => { const m = /[\d.]+/.exec(String(v || '').replace(',', '.')); return m ? +m[0] : 0 }
  // Contorno REAL del estadio con el hueco REAL de su cancha: OpenStreetMap lo trae como polígono con «huecos» (miembros «inner» de la relación) o, si no,
  // como una cancha («leisure=pitch») dentro del estadio. Solo si no hay ninguno de los dos se usa una copia reducida (estimado).
  const inside = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c } return c }
  const centroid = ring => { const n = ring.length - 1 || 1; let x = 0, y = 0; for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1] } return [x / n, y / n] }
  function shapeFrom(elements) {
    let best = null; const pitches = []
    for (const e of elements || []) {
      const tags = e.tags || {}
      if (tags.leisure === 'pitch' && e.type === 'way' && e.geometry && e.geometry.length >= 4) { pitches.push(closed(e.geometry.map(p => [p.lon, p.lat]))); continue }
      const outers = [], inners = []
      if (e.type === 'way' && e.geometry) outers.push(e.geometry.map(p => [p.lon, p.lat]))
      if (e.type === 'relation') for (const m of e.members || []) { if (!m.geometry) continue; (m.role === 'inner' ? inners : m.role === 'outer' ? outers : []).push(m.geometry.map(p => [p.lon, p.lat])) }
      for (const r of outers) { if (r.length < 4) continue; const c = closed(r), a = area(c); if (!best || a > best.a) best = { a, ring: c, tags, inners: inners.filter(x => x.length >= 4).map(closed) } }
    }
    if (!best) return null
    const t = best.tags, cap = num(t.capacity), levels = num(t['building:levels'])
    let h = num(t.height) || (levels ? levels * 3.5 : 0) || (cap >= 60000 ? 58 : cap >= 40000 ? 50 : cap >= 20000 ? 42 : 32)
    h = Math.max(15, Math.min(120, h))
    let holes = best.inners, kind = 'real'
    if (!holes.length) { const p = pitches.filter(pr => inside(centroid(pr), best.ring)).sort((a, b) => area(b) - area(a))[0]; if (p) { holes = [p]; kind = 'cancha' } }
    if (!holes.length) { holes = [scale(best.ring, 0.62)]; kind = 'estimado' }
    // el borde exterior un poco adentro y los huecos un poco más grandes: así la capa nueva no queda pegada a las paredes del edificio original (parpadeo)
    const outer = scale(best.ring, 0.997), hs = holes.map(r => { const c = centroid(r); return r.map(([x, y]) => [+(c[0] + (x - c[0]) * 1.006).toFixed(7), +(c[1] + (y - c[1]) * 1.006).toFixed(7)]) })
    return { name: String(t.name || '').slice(0, 80), h, kind, geom: [outer, ...hs.map(r => r.slice().reverse())] }
  }
  // UNA sola consulta a Overpass con todos los estadios pendientes (antes era una por estadio, con pausas): cada elemento se reparte al estadio más cercano
  async function fetchMany(list) {
    const part = (la, lo) => `way["leisure"="stadium"](around:260,${la},${lo});way["building"="stadium"](around:260,${la},${lo});relation["leisure"="stadium"](around:260,${la},${lo});relation["building"="stadium"](around:260,${la},${lo});way["leisure"="pitch"](around:260,${la},${lo});`
    const q = '[out:json][timeout:90];(' + list.map(([, [la, lo]]) => part(la, lo)).join('') + ');out geom;'
    let last = ''
    for (let round = 0; round < 2; round++) {
      for (const url of MIRRORS) {
        try {
          const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WorbitaBot/1.0 (estadios 3D)' }, signal: AbortSignal.timeout(100000) })
          if (r.ok) { const d = await r.json().catch(() => null); if (d && Array.isArray(d.elements)) return d.elements; last = 'respuesta no válida'; continue }
          last = 'Overpass ' + r.status
        } catch (e) { last = 'Overpass: ' + (e.name === 'TimeoutError' ? 'tardó demasiado' : e.message) }
      }
      await new Promise(r => setTimeout(r, 4000))
    }
    throw Object.assign(new Error(last || 'sin respuesta'), { transient: true })
  }
  const geoms = e => e.type === 'way' ? (e.geometry || []) : [].concat(...(e.members || []).map(m => m.geometry || []))
  const venues = () => {
    const seen = new Map()
    const add = (la, lo) => { if (!(Math.abs(la) <= 85) || !(Math.abs(lo) <= 180) || (!la && !lo)) return; const k = la.toFixed(3) + ',' + lo.toFixed(3); if (!seen.has(k)) seen.set(k, [la, lo]) }
    try { for (const r of db.prepare('SELECT lat, lon FROM sport_venues WHERE lat IS NOT NULL').all()) add(+r.lat, +r.lon) } catch { /* sin tabla */ }
    try { for (const r of db.prepare('SELECT DISTINCT ROUND(lat, 3) la, ROUND(lon, 3) lo FROM posts WHERE match IS NOT NULL AND lat IS NOT NULL LIMIT 300').all()) add(+r.la, +r.lo) } catch { /* sin partidos */ }
    return [...seen.entries()]
  }
  async function sync(max = 60) {
    if (state.running) return { ok: false, msg: 'Ya se está actualizando' }
    state.running = true; state.lastError = ''
    try {
      const todo = []
      for (const v of venues()) {
        const row = db.prepare('SELECT ok, tried, ver FROM stadium_shapes WHERE key = ?').get(v[0])
        if (row && ((row.ok && row.ver >= VER) || (!row.ok && row.ver >= VER && now() - row.tried < 7 * 864e5) || (!row.ok && row.ver < VER && now() - row.tried < 30 * 60e3))) continue
        todo.push(v); if (todo.length >= max) break
      }
      if (todo.length) {
        const els = await fetchMany(todo)
        const near = (e, la, lo) => { const g = geoms(e); if (!g.length) return false; let x = 0, y = 0; for (const p of g) { x += p.lon; y += p.lat } x /= g.length; y /= g.length; return Math.abs(y - la) < 0.0035 && Math.abs(x - lo) < 0.0035 / Math.max(0.2, Math.cos(la * Math.PI / 180)) }
        const ins = db.prepare('INSERT OR REPLACE INTO stadium_shapes (key, lat, lon, name, h, geom, tried, ok, ver, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        for (const [key, [la, lo]] of todo) {
          const st = shapeFrom(els.filter(e => near(e, la, lo)))
          ins.run(key, la, lo, st?.name || '', st?.h || 0, st ? JSON.stringify(st.geom) : null, now(), st ? 1 : 0, VER, st?.kind || null)
        }
      }
      state.lastRun = now()
      return { ok: true, msg: todo.length + ' estadios consultados' }
    } catch (e) { state.lastError = e.message; return { ok: false, msg: e.message } }
    finally { state.running = false }
  }
  const collection = () => ({ type: 'FeatureCollection', features: db.prepare("SELECT name, h, geom FROM stadium_shapes WHERE ok = 1 AND ver >= 3 AND kind IN ('real', 'cancha') AND geom IS NOT NULL LIMIT 1500").all().map(r => ({ type: 'Feature', properties: { n: r.name, h: r.h, c: '#9aa6bf' }, geometry: { type: 'Polygon', coordinates: JSON.parse(r.geom) } })) })
  const status = () => {
    const c = k => db.prepare('SELECT COUNT(*) n FROM stadium_shapes WHERE ok = 1 AND ver >= ? AND kind = ?').get(VER, k).n
    return { running: state.running, lastError: state.lastError, lastRun: state.lastRun,
      found: c('real') + c('cancha'), real: c('real'), cancha: c('cancha'), sinCancha: c('estimado'),
      tried: db.prepare('SELECT COUNT(*) n FROM stadium_shapes').get().n,
      pending: venues().filter(([k]) => { const r = db.prepare('SELECT ok, tried, ver FROM stadium_shapes WHERE key = ?').get(k); return !r || (r.ok && r.ver < VER) || (!r.ok && r.ver < VER && now() - r.tried >= 30 * 60e3) || (!r.ok && r.ver >= VER && now() - r.tried >= 7 * 864e5) }).length }
  }
  const start = () => { if (!state.running) sync().catch(e => { state.lastError = e.message }); return status() }
  const tick = () => { if (S().map3dStadiums !== false) sync().catch(e => { state.lastError = e.message }) }
  setTimeout(tick, 120e3).unref(); setInterval(tick, 12 * 3600e3).unref()
  return { sync, start, status, collection, shapeFrom }
}

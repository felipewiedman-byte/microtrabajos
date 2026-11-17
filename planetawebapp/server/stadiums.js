// Estadios en 3D: para cada estadio donde hay partidos, el servidor trae UNA vez su contorno real de OpenStreetMap (Overpass, gratis) y lo guarda.
// La web los dibuja como un tazón (anillo con el campo abierto) con una altura realista, en vez del anillo bajo de 9 m que sale por defecto.
module.exports = function stadiums({ db, S, now }) {
  db.exec('CREATE TABLE IF NOT EXISTS stadium_shapes (key TEXT PRIMARY KEY, lat REAL, lon REAL, name TEXT, h REAL, geom TEXT, tried INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0)')
  const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter'
  const state = { running: false, lastError: '', lastRun: 0 }
  const area = ring => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(a / 2) }
  const scale = (ring, k) => { const n = ring.length - 1 || 1; let cx = 0, cy = 0; for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1] } cx /= n; cy /= n; return ring.map(([x, y]) => [+(cx + (x - cx) * k).toFixed(7), +(cy + (y - cy) * k).toFixed(7)]) }
  const closed = ring => { const r = ring.slice(); const a = r[0], b = r[r.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) r.push(a); return r }
  const num = v => { const m = /[\d.]+/.exec(String(v || '').replace(',', '.')); return m ? +m[0] : 0 }
  // elige el contorno más grande y le calcula la altura (etiqueta «height», pisos, o según el aforo)
  function shapeFrom(elements) {
    let best = null
    for (const e of elements || []) {
      const tags = e.tags || {}, rings = []
      if (e.type === 'way' && e.geometry) rings.push(e.geometry.map(p => [p.lon, p.lat]))
      if (e.type === 'relation') for (const m of e.members || []) if (m.role === 'outer' && m.geometry) rings.push(m.geometry.map(p => [p.lon, p.lat]))
      for (const r of rings) { if (r.length < 4) continue; const a = area(closed(r)); if (!best || a > best.a) best = { a, ring: closed(r), tags } }
    }
    if (!best) return null
    const t = best.tags, cap = num(t.capacity), levels = num(t['building:levels'])
    let h = num(t.height) || (levels ? levels * 3.5 : 0) || (cap >= 60000 ? 58 : cap >= 40000 ? 50 : cap >= 20000 ? 42 : 32)
    h = Math.max(15, Math.min(120, h))
    const outer = scale(best.ring, 0.997), hole = scale(best.ring, 0.62).reverse()   // el borde un poco adentro (no se pega a la altura baja) y el campo abierto
    return { name: String(t.name || '').slice(0, 80), h, geom: [outer, hole] }
  }
  async function fetchOne(lat, lon) {
    const q = `[out:json][timeout:25];(way["leisure"="stadium"](around:260,${lat},${lon});way["building"="stadium"](around:260,${lat},${lon});relation["leisure"="stadium"](around:260,${lat},${lon}););out geom;`
    const r = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WorbitaBot/1.0 (estadios 3D)' }, signal: AbortSignal.timeout(40000) })
    if (!r.ok) throw new Error('Overpass ' + r.status)
    return shapeFrom((await r.json()).elements)
  }
  const venues = () => {
    const seen = new Map()
    const add = (la, lo) => { if (!(Math.abs(la) <= 85) || !(Math.abs(lo) <= 180) || (!la && !lo)) return; const k = la.toFixed(3) + ',' + lo.toFixed(3); if (!seen.has(k)) seen.set(k, [la, lo]) }
    try { for (const r of db.prepare('SELECT lat, lon FROM sport_venues WHERE lat IS NOT NULL').all()) add(+r.lat, +r.lon) } catch { /* sin tabla */ }
    try { for (const r of db.prepare('SELECT DISTINCT ROUND(lat, 3) la, ROUND(lon, 3) lo FROM posts WHERE match IS NOT NULL AND lat IS NOT NULL LIMIT 300').all()) add(+r.la, +r.lo) } catch { /* sin partidos */ }
    return [...seen.entries()]
  }
  async function sync(max = 25) {
    if (state.running) return { ok: false, msg: 'Ya se está actualizando' }
    state.running = true; state.lastError = ''; let n = 0
    try {
      for (const [key, [la, lo]] of venues()) {
        if (n >= max) break
        const row = db.prepare('SELECT ok, tried FROM stadium_shapes WHERE key = ?').get(key)
        if (row && (row.ok || now() - row.tried < 7 * 864e5)) continue
        n++
        try { const s = await fetchOne(la, lo); db.prepare('INSERT OR REPLACE INTO stadium_shapes (key, lat, lon, name, h, geom, tried, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(key, la, lo, s?.name || '', s?.h || 0, s ? JSON.stringify(s.geom) : null, now(), s ? 1 : 0) }
        catch (e) { state.lastError = e.message; db.prepare('INSERT OR REPLACE INTO stadium_shapes (key, lat, lon, name, h, geom, tried, ok) VALUES (?, ?, ?, \'\', 0, NULL, ?, 0)').run(key, la, lo, now()) }
        await new Promise(r => setTimeout(r, 3000))
      }
      state.lastRun = now()
    } finally { state.running = false }
    return { ok: true, msg: n + ' estadios consultados' }
  }
  const collection = () => ({ type: 'FeatureCollection', features: db.prepare('SELECT name, h, geom FROM stadium_shapes WHERE ok = 1 AND geom IS NOT NULL LIMIT 1500').all().map(r => ({ type: 'Feature', properties: { n: r.name, h: r.h, c: '#9aa6bf' }, geometry: { type: 'Polygon', coordinates: JSON.parse(r.geom) } })) })
  const status = () => ({ running: state.running, lastError: state.lastError, lastRun: state.lastRun, found: db.prepare('SELECT COUNT(*) n FROM stadium_shapes WHERE ok = 1').get().n, tried: db.prepare('SELECT COUNT(*) n FROM stadium_shapes').get().n, pending: venues().filter(([k]) => { const r = db.prepare('SELECT ok, tried FROM stadium_shapes WHERE key = ?').get(k); return !r || (!r.ok && now() - r.tried >= 7 * 864e5) }).length })
  const start = () => { if (!state.running) sync().catch(e => { state.lastError = e.message }); return status() }
  const tick = () => { if (S().map3dStadiums !== false) sync().catch(e => { state.lastError = e.message }) }
  setTimeout(tick, 120e3).unref(); setInterval(tick, 12 * 3600e3).unref()
  return { sync, start, status, collection, shapeFrom }
}

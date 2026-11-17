// Eventos del mundo desde Wikidata (datos abiertos CC0, sin llave y sin costo): festivales, conciertos,
// exposiciones, congresos y competencias deportivas con fecha y coordenadas. Se baja cada 12 h y se guarda en
// una tabla propia (no crea publicaciones). El mapa y la ventana «Eventos» leen /api/world-events.
module.exports = function wdevents({ db, S, now }) {
  const URL_ = process.env.WIKIDATA_SPARQL || 'https://query.wikidata.org/sparql'
  db.exec('CREATE TABLE IF NOT EXISTS wd_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, country TEXT, city TEXT, starts INTEGER NOT NULL, ends INTEGER, kind TEXT NOT NULL, url TEXT, img TEXT, updated_at INTEGER NOT NULL)')
  db.exec('CREATE INDEX IF NOT EXISTS wd_events_end ON wd_events (ends)')
  const KINDS = { festival: 'Q132241 Q868557 Q220505 Q1190554', concierto: 'Q182832 Q1456935', exposicion: 'Q464980 Q15275719 Q1076486', congreso: 'Q625994 Q2020153 Q1143604', deporte: 'Q13406554 Q16510064 Q18608583' }
  const state = { lastSync: 0, lastError: '', running: false, counts: {} }
  const httpsOnly = u => /^https:\/\/[^\s"'<>]+$/.test(u || '') ? String(u).slice(0, 300) : null
  const query = (root, a, b) => `SELECT ?e ?eLabel ?s ?en ?pt ?cLabel ?ciudadLabel ?url ?img WHERE {
  VALUES ?t { ${root.split(' ').map(x => 'wd:' + x).join(' ')} } ?e wdt:P31/wdt:P279? ?t .
  { ?e wdt:P580 ?s } UNION { ?e wdt:P585 ?s }
  FILTER(?s >= "${a}"^^xsd:dateTime && ?s <= "${b}"^^xsd:dateTime)
  OPTIONAL { ?e wdt:P625 ?p1 } OPTIONAL { ?e wdt:P276 ?lug . ?lug wdt:P625 ?p2 }
  BIND(COALESCE(?p1, ?p2) AS ?pt) FILTER(BOUND(?pt))
  OPTIONAL { ?e wdt:P582 ?en } OPTIONAL { ?e wdt:P17 ?c } OPTIONAL { ?e wdt:P856 ?url } OPTIONAL { ?e wdt:P18 ?img }
  OPTIONAL { ?e wdt:P276 ?l2 . ?l2 wdt:P131 ?ciudad }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
} LIMIT 700`
  // Convierte la respuesta de Wikidata en filas. Pura (sin red) para poder probarla.
  function parse(json, kind) {
    const out = [], seen = new Set()
    for (const r of json?.results?.bindings || []) {
      const id = /\/(Q\d+)$/.exec(r.e?.value || '')?.[1], title = String(r.eLabel?.value || '').trim()
      if (!id || seen.has(id) || !title || /^Q\d+$/.test(title)) continue
      const m = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/.exec(r.pt?.value || ''); if (!m) continue
      const lon = +m[1], lat = +m[2]; if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180)) continue
      const s = Date.parse(r.s?.value), en = r.en?.value ? Date.parse(r.en.value) : null; if (!Number.isFinite(s)) continue
      seen.add(id)
      const img = r.img?.value ? String(r.img.value).replace(/^http:/, 'https:') : null
      const nm = v => { v = String(v || '').trim(); return /^Q\d+$/.test(v) ? '' : v.slice(0, 80) }
      out.push({ id, title: title.slice(0, 140), lat, lon, country: nm(r.cLabel?.value), city: nm(r.ciudadLabel?.value), starts: s, ends: Number.isFinite(en) && en >= s ? en : null, kind, url: httpsOnly(r.url?.value), img: httpsOnly(img) })
    }
    return out
  }
  const save = rows => { const ins = db.prepare('INSERT OR REPLACE INTO wd_events (id, title, lat, lon, country, city, starts, ends, kind, url, img, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'); db.exec('BEGIN'); try { for (const e of rows) ins.run(e.id, e.title, e.lat, e.lon, e.country, e.city, e.starts, e.ends, e.kind, e.url, e.img, now()); db.exec('COMMIT') } catch (x) { db.exec('ROLLBACK'); throw x } }
  const clean = () => db.prepare('DELETE FROM wd_events WHERE COALESCE(ends, starts) < ?').run(now() - 864e5)
  async function sync(force) {
    if (S().wdEventsOn === false) return { ok: false, msg: 'Apagado' }
    if (state.running) return { ok: false, msg: 'Ya se está actualizando' }
    state.running = true; state.lastError = ''; state.counts = {}; let total = 0
    try {
      const d = n => new Date(Date.now() + n * 864e5).toISOString().replace(/\.\d{3}Z$/, 'Z'), a = d(-1), b = d(60)
      for (const [kind, root] of Object.entries(KINDS)) {
        try {
          const r = await fetch(URL_ + '?format=json&query=' + encodeURIComponent(query(root, a, b)), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'WorbitaBot/1.0 (eventos abiertos)' }, signal: AbortSignal.timeout(45e3) })
          if (!r.ok) throw new Error('Wikidata ' + r.status)
          const rows = parse(await r.json(), kind); save(rows); state.counts[kind] = rows.length; total += rows.length
        } catch (e) { state.lastError = kind + ': ' + e.message; state.counts[kind] = 0 }
        await new Promise(r => setTimeout(r, 2000))
      }
      clean(); state.lastSync = now()
    } finally { state.running = false }
    return { ok: true, msg: total + ' eventos guardados' + (state.lastError ? ' · aviso: ' + state.lastError : '') }
  }
  const start = () => { if (!state.running) sync().catch(e => { state.lastError = e.message }); return status() }
  const list = () => db.prepare('SELECT id, title, lat, lon, country, city, starts, ends, kind, url, img FROM wd_events WHERE COALESCE(ends, starts) >= ? ORDER BY starts LIMIT 1500').all(now() - 864e5)
  const run = () => sync().catch(e => { state.lastError = e.message })
  const last = () => db.prepare('SELECT MAX(updated_at) m FROM wd_events').get().m || 0
  setTimeout(() => { if (now() - last() > 24 * 36e5) run() }, 120e3).unref(); setInterval(run, 12 * 36e5).unref()
  const status = () => ({ on: S().wdEventsOn !== false, lastSync: state.lastSync || last(), lastError: state.lastError, running: state.running, counts: state.counts, total: db.prepare('SELECT COUNT(*) n FROM wd_events').get().n })
  return { sync, start, list, status, parse }
}

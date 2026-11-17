// Eventos del mundo desde Wikidata (datos abiertos CC0, sin llave y sin costo): festivales, conciertos,
// exposiciones, congresos y competencias deportivas con fecha y coordenadas. Se baja cada 12 h y se guarda en
// una tabla propia (no crea publicaciones). El mapa y la ventana «Eventos» leen /api/world-events.
module.exports = function wdevents({ db, S, now, publicUrl }) {
  const URL_ = process.env.WIKIDATA_SPARQL || 'https://query.wikidata.org/sparql'
  db.exec('CREATE TABLE IF NOT EXISTS wd_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, country TEXT, city TEXT, starts INTEGER NOT NULL, ends INTEGER, kind TEXT NOT NULL, url TEXT, img TEXT, updated_at INTEGER NOT NULL)')
  db.exec('CREATE INDEX IF NOT EXISTS wd_events_end ON wd_events (ends)')
  for (const c of ['descr TEXT', 'wp TEXT']) { try { db.exec('ALTER TABLE wd_events ADD COLUMN ' + c) } catch { /* ya existe */ } }
  db.exec('CREATE TABLE IF NOT EXISTS wd_event_posts (id TEXT PRIMARY KEY, post_id INTEGER NOT NULL)')
  const KINDS = { festival: 'Q132241 Q868557 Q220505 Q1190554', concierto: 'Q182832 Q1456935', exposicion: 'Q464980 Q15275719 Q1076486', congreso: 'Q625994 Q2020153 Q1143604', deporte: 'Q13406554 Q16510064 Q18608583' }
  const state = { lastSync: 0, lastError: '', running: false, counts: {} }
  const httpsOnly = u => /^https:\/\/[^\s"'<>]+$/.test(u || '') ? String(u).slice(0, 300) : null
  const query = (root, a, b) => `SELECT ?e ?eLabel ?s ?en ?pt ?cLabel ?ciudadLabel ?url ?img ?desc ?wp WHERE {
  VALUES ?t { ${root.split(' ').map(x => 'wd:' + x).join(' ')} } ?e wdt:P31/wdt:P279? ?t .
  { ?e wdt:P580 ?s } UNION { ?e wdt:P585 ?s }
  FILTER(?s >= "${a}"^^xsd:dateTime && ?s <= "${b}"^^xsd:dateTime)
  OPTIONAL { ?e wdt:P625 ?p1 } OPTIONAL { ?e wdt:P276 ?lug . ?lug wdt:P625 ?p2 }
  BIND(COALESCE(?p1, ?p2) AS ?pt) FILTER(BOUND(?pt))
  OPTIONAL { ?e wdt:P582 ?en } OPTIONAL { ?e wdt:P17 ?c } OPTIONAL { ?e wdt:P856 ?url } OPTIONAL { ?e wdt:P18 ?img }
  OPTIONAL { ?e wdt:P276 ?l2 . ?l2 wdt:P131 ?ciudad }
  OPTIONAL { ?e schema:description ?de FILTER(LANG(?de) = "es") } OPTIONAL { ?e schema:description ?dn FILTER(LANG(?dn) = "en") } BIND(COALESCE(?de, ?dn) AS ?desc)
  OPTIONAL { ?pe schema:about ?e ; schema:isPartOf <https://es.wikipedia.org/> } OPTIONAL { ?pn schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> } BIND(COALESCE(?pe, ?pn) AS ?wp)
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
      let img = r.img?.value ? String(r.img.value).replace(/^http:/, 'https:') : null; if (img && /Special:FilePath\//.test(img) && !/[?]/.test(img)) img += '?width=900'
      const wp = /^https:\/\/(es|en)\.wikipedia\.org\/wiki\/[^\s"'<>]+$/.test(r.wp?.value || '') ? r.wp.value : null
      const nm = v => { v = String(v || '').trim(); return /^Q\d+$/.test(v) ? '' : v.slice(0, 80) }
      out.push({ id, title: title.slice(0, 140), lat, lon, country: nm(r.cLabel?.value), city: nm(r.ciudadLabel?.value), starts: s, ends: Number.isFinite(en) && en >= s ? en : null, kind, url: httpsOnly(r.url?.value), img: httpsOnly(img), descr: String(r.desc?.value || '').slice(0, 300) || null, wp })
    }
    return out
  }
  const save = rows => { const ins = db.prepare('INSERT OR REPLACE INTO wd_events (id, title, lat, lon, country, city, starts, ends, kind, url, img, updated_at, descr, wp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'); db.exec('BEGIN'); try { for (const e of rows) ins.run(e.id, e.title, e.lat, e.lon, e.country, e.city, e.starts, e.ends, e.kind, e.url, e.img, now(), e.descr, e.wp); db.exec('COMMIT') } catch (x) { db.exec('ROLLBACK'); throw x } }
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
  // Convierte un evento en una publicación verificada (foto, descripción, compartir, comentarios) la primera vez que alguien lo abre.
  const author = () => {
    let u = db.prepare("SELECT id FROM users WHERE handle = 'eventos'").get()
    if (!u) { db.prepare("INSERT INTO users (name, handle, pass, hue, is_example, created_at, verified) VALUES (?, 'eventos', ?, 300, 0, ?, 1)").run((S().name || 'Worbita') + ' Eventos', 'x:' + require('crypto').randomBytes(16).toString('hex'), now()); u = db.prepare("SELECT id FROM users WHERE handle = 'eventos'").get() }
    return u.id
  }
  const fd = ms => new Date(ms).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: S().dailyTZ || 'America/Bogota' })
  const UA = { 'User-Agent': 'WorbitaBot/1.0 (eventos abiertos)' }
  // texto e imagen de la página de Wikipedia del evento
  async function extract(wp) {
    const m = /^https:\/\/(es|en)\.wikipedia\.org\/wiki\/([^\s?#]+)$/.exec(wp || ''); if (!m) return { text: '', img: null }
    try {
      const r = await fetch(`https://${m[1]}.wikipedia.org/api/rest_v1/page/summary/${m[2]}`, { headers: { ...UA, Accept: 'application/json' }, signal: AbortSignal.timeout(4000) }); if (!r.ok) return { text: '', img: null }
      const d = await r.json(), th = d.thumbnail?.source ? String(d.thumbnail.source).replace(/\/\d+px-/, '/960px-') : d.originalimage?.source
      return { text: String(d.extract || '').slice(0, 900), img: httpsOnly(th) }
    } catch { return { text: '', img: null } }
  }
  // imagen de portada (og:image) de la página oficial del evento; solo direcciones públicas, cada salto se comprueba
  async function siteImage(u) {
    try {
      let cur = u
      for (let i = 0; i < 3; i++) {
        if (!publicUrl || !(await publicUrl(cur))) return null
        const r = await fetch(cur, { redirect: 'manual', headers: { ...UA, Accept: 'text/html' }, signal: AbortSignal.timeout(5000) })
        if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { cur = new URL(r.headers.get('location'), cur).href; continue }
        if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) return null
        const html = (await r.text()).slice(0, 300000)
        const tag = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/i.exec(html)?.[0]
        const c = tag && /content=["']([^"']+)["']/i.exec(tag)?.[1]; if (!c) return null
        const img = new URL(c.replace(/&amp;/g, '&'), cur).href
        return httpsOnly(img) && (await publicUrl(img)) ? img : null
      }
    } catch { /* sin imagen */ }
    return null
  }
  const retry = new Map()
  async function findImage(e, wpImg) {
    let img = e.img || wpImg || (e.url ? await siteImage(e.url) : null)
    if (img && img !== e.img) db.prepare('UPDATE wd_events SET img = ? WHERE id = ?').run(img, e.id)
    return img
  }
  async function openPost(id) {
    if (!/^Q\d+$/.test(id || '')) return null
    const e = db.prepare('SELECT * FROM wd_events WHERE id = ?').get(id); if (!e) return null
    const row = db.prepare('SELECT post_id FROM wd_event_posts WHERE id = ?').get(id)
    const ex = row && db.prepare('SELECT image FROM posts WHERE id = ?').get(row.post_id)
    if (ex) {   // ya existe: si le faltó la foto, se vuelve a intentar (máximo una vez por hora)
      if (!ex.image && !(now() - (retry.get(id) || 0) < 36e5)) { retry.set(id, now()); const img = await findImage(e, (await extract(e.wp)).img); if (img) db.prepare('UPDATE posts SET image = ?, thumb = ? WHERE id = ?').run(img, img, row.post_id) }
      return row.post_id
    }
    const wx = await extract(e.wp), img = await findImage(e, wx.img), ext = wx.text, kind = { festival: 'Festival', concierto: 'Concierto', exposicion: 'Exposición', congreso: 'Congreso', deporte: 'Competencia deportiva' }[e.kind] || 'Evento'
    const fecha = e.ends && fd(e.ends) !== fd(e.starts) ? 'Del ' + fd(e.starts) + ' al ' + fd(e.ends) : fd(e.starts)
    const text = [kind + ' · ' + fecha + (e.city || e.country ? ' · ' + [e.city, e.country].filter(Boolean).join(', ') : ''), ext || e.descr || '', e.url ? 'Sitio web: ' + e.url : ''].filter(Boolean).join('\n\n')
    const cats = S().categories || [], cat = cats.some(c => c[0] === 'eventos') ? 'eventos' : (cats[0]?.[0] || 'eventos')
    const r = db.prepare("INSERT INTO posts (user_id, title, text, cat, city, country, type, image, thumb, scene, lat, lon, expires_at, base_likes, created_at) VALUES (?, ?, ?, ?, ?, ?, 'verificada', ?, ?, 'concierto', ?, ?, ?, 0, ?)")
      .run(author(), e.title.slice(0, 120), text.slice(0, 2000), cat, (e.city || e.country || 'Mundo').slice(0, 80), String(e.country || '').slice(0, 60), img, img, e.lat, e.lon, (e.ends || e.starts) + 2 * 864e5, now())
    const pid = Number(r.lastInsertRowid); db.prepare('INSERT OR REPLACE INTO wd_event_posts VALUES (?, ?)').run(id, pid); return pid
  }
  const start = () => { if (!state.running) sync().catch(e => { state.lastError = e.message }); return status() }
  const list = () => db.prepare('SELECT id, title, lat, lon, country, city, starts, ends, kind, url, img FROM wd_events WHERE COALESCE(ends, starts) >= ? ORDER BY starts LIMIT 1500').all(now() - 864e5)
  const run = () => sync().catch(e => { state.lastError = e.message })
  const last = () => db.prepare('SELECT MAX(updated_at) m FROM wd_events').get().m || 0
  setTimeout(() => { if (now() - last() > 24 * 36e5) run() }, 120e3).unref(); setInterval(run, 12 * 36e5).unref()
  const status = () => ({ on: S().wdEventsOn !== false, lastSync: state.lastSync || last(), lastError: state.lastError, running: state.running, counts: state.counts, total: db.prepare('SELECT COUNT(*) n FROM wd_events').get().n })
  return { sync, start, list, status, parse, openPost, _t: { siteImage, extract } }
}

// Lugares del mundo (playas, sagrados, ruinas, turísticos, naturaleza). La lista viene de sites-data.js y se guarda en la base de datos al arrancar.
// La foto y el resumen se piden a Wikipedia solo cuando alguien abre la ficha de ese lugar, y se guardan: cada lugar se consulta una vez al mes como mucho.
const DATA = require('./sites-data')
const CATS = { playa: 'Playa', santo: 'Lugar sagrado', ruina: 'Ruinas', turistico: 'Lugar turístico', naturaleza: 'Naturaleza' }
const UA = { 'User-Agent': 'planetapp/1.0' }, MONTH = 30 * 864e5, RETRY = 6 * 36e5

module.exports = ({ db, now }) => {
  db.exec(`CREATE TABLE IF NOT EXISTS sites (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, cat TEXT NOT NULL, rank INTEGER NOT NULL, wiki TEXT, image TEXT, about TEXT, url TEXT, fetched INTEGER NOT NULL DEFAULT 0, UNIQUE(name, country))`)
  const up = db.prepare('INSERT INTO sites (name, country, lat, lon, cat, rank, wiki) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(name, country) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, cat = excluded.cat, rank = excluded.rank, wiki = excluded.wiki')
  db.exec('BEGIN'); try { for (const r of DATA) up.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6] || null); db.exec('COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e }

  // toda la lista (unos 250 lugares, ~25 KB): el navegador la pide una vez y filtra por zoom, sin más consultas al mover el mapa
  let cache = null
  const list = () => cache || (cache = { sites: db.prepare('SELECT id, name, country, lat, lon, cat, rank FROM sites ORDER BY rank, id').all() })

  const okImg = u => typeof u === 'string' && /^https:\/\/upload\.wikimedia\.org\/[^\s"'<>]+$/.test(u) && u.length < 500
  const big = u => u && u.replace(/\/(\d+)px-/, (_, n) => '/' + Math.max(+n, 800) + 'px-')
  async function summary(lang, title) {
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: UA, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const d = await r.json(); return d && d.extract && d.type !== 'disambiguation' ? d : null
  }
  async function fromWiki(s) {
    for (const lang of ['es', 'en']) {
      let d = null
      try {
        if (s.wiki || lang === 'es') d = await summary(lang, s.wiki || s.name)
        if (!d) { const q = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&search=${encodeURIComponent(s.name + ' ' + s.country)}`, { headers: UA, signal: AbortSignal.timeout(8000) })).json(); if (q?.[1]?.[0]) d = await summary(lang, q[1][0]) }
      } catch { return null }
      if (d) { const img = big(d.thumbnail?.source) || d.originalimage?.source; return { about: String(d.extract).slice(0, 700), image: okImg(img) ? img : null, url: d.content_urls?.desktop?.page || '' } }
    }
    return null
  }
  const inflight = new Map()
  async function detail(id) {
    let s = db.prepare('SELECT * FROM sites WHERE id = ?').get(id); if (!s) return null
    const stale = s.fetched === 0 || (s.about ? now() - s.fetched > MONTH : now() - s.fetched > RETRY)
    if (stale) {
      if (!inflight.has(id)) inflight.set(id, fromWiki(s).then(w => { db.prepare('UPDATE sites SET image = ?, about = ?, url = ?, fetched = ? WHERE id = ?').run(w?.image || s.image, w?.about || s.about, w?.url || s.url, now(), id) }).catch(() => {}).finally(() => inflight.delete(id)))
      await inflight.get(id); s = db.prepare('SELECT * FROM sites WHERE id = ?').get(id)
    }
    return { id: s.id, name: s.name, country: s.country, lat: s.lat, lon: s.lon, cat: s.cat, catLabel: CATS[s.cat] || 'Lugar', image: okImg(s.image) ? s.image : null, about: s.about || '', url: /^https:\/\/[a-z]+\.wikipedia\.org\//.test(s.url || '') ? s.url : '' }
  }
  return { list, detail, count: () => DATA.length }
}

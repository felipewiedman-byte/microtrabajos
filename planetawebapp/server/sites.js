// Lugares del mundo (playas, sagrados, ruinas, turísticos, naturaleza). La lista viene de sites-data.js y se guarda en la base de datos al arrancar.
// La foto y el resumen se piden a Wikipedia solo cuando alguien abre la ficha de ese lugar, y se guardan: cada lugar se consulta una vez al mes como mucho.
const DATA = require('./sites-data')
const CATS = { playa: 'Playa', santo: 'Lugar sagrado', ruina: 'Ruinas', turistico: 'Lugar turístico', naturaleza: 'Naturaleza' }
const UA = { 'User-Agent': 'planetapp/1.0' }, MONTH = 30 * 864e5, RETRY = 6 * 36e5

module.exports = ({ db, now }) => {
  db.exec(`CREATE TABLE IF NOT EXISTS sites (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, cat TEXT NOT NULL, rank INTEGER NOT NULL, wiki TEXT, image TEXT, about TEXT, url TEXT, fetched INTEGER NOT NULL DEFAULT 0, UNIQUE(name, country))`)
  const up = db.prepare('INSERT INTO sites (name, country, lat, lon, cat, rank, wiki) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(name, country) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, cat = excluded.cat, rank = excluded.rank, wiki = excluded.wiki')
  db.exec('BEGIN'); try { for (const r of DATA) up.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6] || null); db.exec('COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e }

  // los lugares que quedaron sin foto se vuelven a intentar la próxima vez que alguien abra su ficha
  db.prepare('UPDATE sites SET fetched = 0 WHERE image IS NULL').run()

  // toda la lista (unos 250 lugares, ~25 KB): el navegador la pide una vez y filtra por zoom, sin más consultas al mover el mapa
  let cache = null
  const list = () => cache || (cache = { sites: db.prepare('SELECT id, name, country, lat, lon, cat, rank FROM sites ORDER BY rank, id').all() })

  const okImg = u => typeof u === 'string' && /^https:\/\/upload\.wikimedia\.org\/[^\s"'<>]+$/.test(u) && u.length < 600
  // Una sola consulta a Wikipedia trae el resumen y la foto principal (960 px). Primero por título exacto; si no existe, se busca por nombre y país.
  async function consulta(lang, extra) {
    const u = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages%7Cextracts&piprop=thumbnail&pithumbsize=960&exintro=1&explaintext=1&exchars=900&${extra}`
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000) }); if (!r.ok) return null
    const pages = Object.values((await r.json())?.query?.pages || {}).filter(p => p && !p.missing && p.extract)
    pages.sort((a, b) => (a.index || 0) - (b.index || 0)); return pages[0] || null
  }
  async function fromWiki(s) {
    let out = null
    for (const lang of ['es', 'en']) {
      let p = null
      try {
        p = await consulta(lang, 'titles=' + encodeURIComponent(s.wiki || s.name))
        if (!p) p = await consulta(lang, 'generator=search&gsrlimit=1&gsrsearch=' + encodeURIComponent(s.name + ' ' + s.country))
      } catch { return out }
      if (!p) continue
      const img = p.thumbnail?.source
      if (!out) out = { about: String(p.extract).replace(/\s+/g, ' ').trim().slice(0, 700), image: null, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}` }
      if (okImg(img)) { out.image = img; break }   // si en español no hay foto, se busca en inglés
    }
    if (out && !out.image) console.warn('[lugares] sin foto en Wikipedia:', s.name)
    return out
  }
  const inflight = new Map()
  async function detail(id) {
    let s = db.prepare('SELECT * FROM sites WHERE id = ?').get(id); if (!s) return null
    const stale = s.fetched === 0 || now() - s.fetched > (s.image ? MONTH : RETRY)   // sin foto: se reintenta cada 6 horas
    if (stale) {
      if (!inflight.has(id)) inflight.set(id, fromWiki(s).then(w => { db.prepare('UPDATE sites SET image = ?, about = ?, url = ?, fetched = ? WHERE id = ?').run(w?.image || s.image, w?.about || s.about, w?.url || s.url, now(), id) }).catch(() => {}).finally(() => inflight.delete(id)))
      await inflight.get(id); s = db.prepare('SELECT * FROM sites WHERE id = ?').get(id)
    }
    return { id: s.id, name: s.name, country: s.country, lat: s.lat, lon: s.lon, cat: s.cat, catLabel: CATS[s.cat] || 'Lugar', image: okImg(s.image) ? s.image : null, about: s.about || '', url: /^https:\/\/[a-z]+\.wikipedia\.org\//.test(s.url || '') ? s.url : '' }
  }
  return { list, detail, count: () => DATA.length }
}

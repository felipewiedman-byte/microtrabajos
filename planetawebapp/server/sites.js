// Lugares del mundo (playas, sagrados, ruinas, turísticos, naturaleza). La lista viene de sites-data.js y se guarda en la base de datos al arrancar.
// La foto y el resumen se piden a Wikipedia solo cuando alguien abre la ficha de ese lugar, y se guardan: cada lugar se consulta una vez al mes como mucho.
const DATA = [...require('./sites-data'), ...require('./sites-data2')]
const CATS = { playa: 'Playa', santo: 'Lugar sagrado', ruina: 'Ruinas', turistico: 'Lugar turístico', naturaleza: 'Naturaleza', montana: 'Montaña o volcán', misterio: 'Lugar misterioso' }
const UA = { 'User-Agent': 'planetapp/1.0' }, MONTH = 30 * 864e5, RETRY = 6 * 36e5

module.exports = ({ db, now }) => {
  db.exec(`CREATE TABLE IF NOT EXISTS sites (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, cat TEXT NOT NULL, rank INTEGER NOT NULL, wiki TEXT, image TEXT, about TEXT, url TEXT, fetched INTEGER NOT NULL DEFAULT 0, UNIQUE(name, country))`)
  const up = db.prepare('INSERT INTO sites (name, country, lat, lon, cat, rank, wiki) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(name, country) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, cat = excluded.cat, rank = excluded.rank, wiki = excluded.wiki')
  db.exec('BEGIN'); try { for (const r of DATA) up.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6] || null); db.exec('COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e }

  // los lugares que quedaron sin foto se vuelven a intentar la próxima vez que alguien abra su ficha
  db.prepare('UPDATE sites SET fetched = 0 WHERE image IS NULL').run()

  // toda la lista (unos 250 lugares, ~25 KB): el navegador la pide una vez y filtra por zoom, sin más consultas al mover el mapa
  // Lugares a menos de 700 m unos de otros (Coliseo y Foro Romano, Big Ben y Westminster…) se montaban en el mismo punto: el primero (el más importante)
  // se queda donde está; a los demás se les sube un nivel de importancia (salen al acercar más) y su pin se corre unos 130 m en espiral (plat/plon).
  // La ficha, el botón «Cómo llegar» y el vuelo del mapa siguen usando la coordenada real.
  const km = (a, b) => { const r = Math.PI / 180, dx = (a.lon - b.lon) * r * Math.cos((a.lat + b.lat) / 2 * r), dy = (a.lat - b.lat) * r; return 6371 * Math.hypot(dx, dy) }
  function spread(rows) {
    const out = rows.map(s => ({ ...s })), used = new Set()
    for (let i = 0; i < out.length; i++) {
      if (used.has(i)) continue
      const grp = [i]; for (let j = i + 1; j < out.length; j++) if (!used.has(j) && km(out[i], out[j]) < 0.7) grp.push(j)
      grp.forEach((idx, k) => {
        used.add(idx); if (!k) return
        const s = out[idx], an = out[i]; s.rank = Math.min(3, Math.max(s.rank, out[grp[k - 1]].rank + 1))
        // el pin queda al menos a ~170 m del principal, alejándose de él (o en espiral si están en el mismo punto)
        const cos = Math.max(0.2, Math.cos(s.lat * Math.PI / 180)), dy = (s.lat - an.lat) * 111, dx = (s.lon - an.lon) * 111 * cos, d = Math.hypot(dx, dy)
        if (d >= 0.17) return
        const a = d > 0.01 ? Math.atan2(dy, dx) : k * 2.4, step = 0.17 + 0.05 * (k - 1)
        s.plat = +(an.lat + step * Math.sin(a) / 111).toFixed(5); s.plon = +(an.lon + step * Math.cos(a) / (111 * cos)).toFixed(5)
      })
    }
    return out
  }
  let cache = null
  const list = () => cache || (cache = { sites: spread(db.prepare('SELECT id, name, country, lat, lon, cat, rank FROM sites ORDER BY rank, id').all()) })

  const okImg = u => typeof u === 'string' && /^https:\/\/(upload|thumb)\.wikimedia\.org\/[^\s"'<>]+$/.test(u) && u.length < 600
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
      } catch (e) { console.warn('[lugares] error consultando Wikipedia:', s.name, e && e.message); return out }
      if (!p) continue
      const img = p.thumbnail?.source
      if (!out) out = { about: String(p.extract).replace(/\s+/g, ' ').trim().slice(0, 700), image: null, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}` }
      if (okImg(img)) { out.image = img; break }   // si en español no hay foto, se busca en inglés
    }
    console.log('[lugares]', s.name, '->', out ? (out.image ? 'texto y foto' : 'solo texto, sin foto') : 'Wikipedia no respondió o no hay artículo')
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

// Más contenido automático en el mapa, con fuentes gratis. El servidor consulta pocas veces al día, guarda y reparte:
//  · Terremotos (USGS, sin llave): sismos de magnitud 4,5 o más de las últimas 24 h, en su punto exacto.
// Todo se publica como cualquier otra publicación (pin con foto), caduca solo y se puede apagar en el panel.
'use strict'

module.exports = function extras({ db, S, broadcast, now }) {
  db.exec('CREATE TABLE IF NOT EXISTS extra_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, post_id INTEGER, ends INTEGER NOT NULL)')
  const state = { quakes: { at: 0, err: '' } }
  const author = (handle, name, hue) => {
    let u = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle)
    if (!u) { db.prepare('INSERT INTO users (name, handle, pass, hue, is_example, created_at, verified) VALUES (?, ?, ?, ?, 0, ?, 1)').run((S().name || 'Worbita') + ' ' + name, handle, 'x:' + require('crypto').randomBytes(16).toString('hex'), hue, now()); u = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle) }
    return u.id
  }
  const cat = want => { const c = S().categories || []; return c.some(x => x[0] === want) ? want : (c[0]?.[0] || want) }
  const tz = () => S().dailyTZ || 'America/Bogota'
  const fecha = ms => new Date(ms).toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz() })
  // publica o actualiza una publicación ligada a un id externo (no se repite nunca)
  function upsert(id, kind, p) {
    const row = db.prepare('SELECT post_id FROM extra_items WHERE id = ?').get(id)
    if (row && db.prepare('SELECT 1 FROM posts WHERE id = ?').get(row.post_id)) { db.prepare('UPDATE posts SET title = ?, text = ?, city = ?, country = ?, image = COALESCE(?, image), thumb = COALESCE(?, thumb), expires_at = ? WHERE id = ?').run(p.title, p.text, String(p.city || '').slice(0, 80) || 'Mundo', String(p.country || '').slice(0, 60), p.image, p.image, p.ends, row.post_id); db.prepare('UPDATE extra_items SET ends = ? WHERE id = ?').run(p.ends, id); return 0 }
    const r = db.prepare("INSERT INTO posts (user_id, title, text, cat, city, country, type, image, thumb, scene, lat, lon, expires_at, base_likes, created_at) VALUES (?, ?, ?, ?, ?, ?, 'verificada', ?, ?, ?, ?, ?, ?, 0, ?)")
      .run(p.user, String(p.title).slice(0, 120), String(p.text).slice(0, 2000), p.cat, String(p.city || '').slice(0, 80) || 'Mundo', String(p.country || '').slice(0, 60), p.image, p.image, p.scene, p.lat, p.lon, p.ends, now())
    db.prepare('INSERT OR REPLACE INTO extra_items VALUES (?, ?, ?, ?)').run(id, kind, Number(r.lastInsertRowid), p.ends); return 1
  }
  const get = async (url, opt = {}) => { const r = await fetch(url, { ...opt, headers: { 'User-Agent': 'Worbita/1.0', ...(opt.headers || {}) }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(r.status); return r.json() }

  // ---- Terremotos (USGS): magnitud 4,5+ del último día. Sin llave. Cada 30 min.
  async function quakes() {
    if (S().quakesOn === false) return
    try {
      const d = await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'), user = author('alertas', 'Alertas', 15)
      let n = 0
      for (const f of d.features || []) {
        const [lon, lat] = f.geometry?.coordinates || [], m = +f.properties?.mag, t = +f.properties?.time; if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180) || !m || !t) continue
        const raw = String(f.properties.place || ''), place = raw.replace(/^\d+\s*km\s+[NSEW]+\s+of\s+/i, '')
        const parts = place.split(',').map(x => x.trim()), country = parts.length > 1 ? parts[parts.length - 1] : ''
        const DIR = { N: 'norte', S: 'sur', E: 'este', W: 'oeste', NE: 'noreste', NW: 'noroeste', SE: 'sureste', SW: 'suroeste', NNE: 'nor-noreste', ENE: 'este-noreste', ESE: 'este-sureste', SSE: 'sur-sureste', SSW: 'sur-suroeste', WSW: 'oeste-suroeste', WNW: 'oeste-noroeste', NNW: 'nor-noroeste' }
        const k = raw.match(/^(\d+)\s*km\s+([NSEW]+)\s+of\s+/i), city = ((k ? `A ${k[1]} km al ${DIR[k[2].toUpperCase()] || k[2]} de ` : 'Sismo en ') + (parts[0] || 'el océano')).slice(0, 80)
        n += upsert('q:' + f.id, 'quake', { user, cat: cat('noticias'), scene: 'ciudad', image: null, lat, lon, city, country, ends: t + Math.max(1, Math.min(24, +S().quakeHours || 6)) * 3600e3,
          title: `Sismo de magnitud ${m.toFixed(1)}${place ? ' · ' + place : ''}`, text: `${fecha(t)} · profundidad ${Math.round(f.geometry.coordinates[2] || 0)} km${m >= 6 ? ' · sismo fuerte' : ''} · fuente: USGS` })
      }
      state.quakes = { at: now(), err: '' }; if (n) broadcast({ type: 'post' })
    } catch (e) { state.quakes.err = e.message }
  }

  // lo vencido se borra solo (y su pin desaparece del mapa)
  function clean() { for (const r of db.prepare('SELECT id, post_id FROM extra_items WHERE ends < ?').all(now())) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM extra_items WHERE id = ?').run(r.id) } }
  const safe = fn => () => fn().catch(e => console.error('contenido extra:', e.message))
  setTimeout(safe(quakes), 25e3).unref(); setInterval(safe(quakes), 30 * 60e3).unref()
  setInterval(() => { try { clean(); broadcast({ type: 'post' }) } catch { /* nada */ } }, 15 * 60e3).unref()
  const status = () => ({ ...state, counts: Object.fromEntries(db.prepare('SELECT kind, COUNT(*) n FROM extra_items GROUP BY kind').all().map(r => [r.kind, r.n])) })
  return { quakes, status }
}

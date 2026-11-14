// Conciertos y eventos grandes de todo el mundo (Ticketmaster Discovery API, gratis 5.000 consultas/día).
// Cada 6 h trae los eventos más relevantes de hoy y mañana en cada país de la lista y los publica en su lugar exacto.
module.exports = function events({ db, S, secret, broadcast, now }) {
  const BASE = process.env.TICKETMASTER_URL || 'https://app.ticketmaster.com/discovery/v2'
  db.exec('CREATE TABLE IF NOT EXISTS world_events (id TEXT PRIMARY KEY, post_id INTEGER, starts INTEGER NOT NULL, updated_at INTEGER NOT NULL)')
  const state = { lastSync: 0, lastError: '', calls: 0 }
  const author = () => {
    let u = db.prepare("SELECT id FROM users WHERE handle = 'eventos'").get()
    if (!u) { db.prepare("INSERT INTO users (name, handle, pass, hue, is_example, created_at, verified) VALUES (?, 'eventos', ?, 300, 0, ?, 1)").run((S().name || 'Worbita') + ' Eventos', 'x:' + require('crypto').randomBytes(16).toString('hex'), now()); u = db.prepare("SELECT id FROM users WHERE handle = 'eventos'").get() }
    return u.id
  }
  const tz = () => S().dailyTZ || 'America/Bogota'
  const when = ms => new Date(ms).toLocaleString('es-CO', { weekday: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz() })
  const isoZ = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  async function sync() {
    if (!S().eventsOn) return { ok: false, msg: 'Apagado' }
    const key = secret('ticketmaster', 'key'); if (!key) return { ok: false, msg: 'Falta la llave de Ticketmaster (panel → Pagos y Google).' }
    const start = new Date(), end = new Date(Date.now() + 2 * 864e5), per = Math.max(1, Math.min(50, +S().eventsPerCountry || 8))
    const cats = S().categories || [], cat = cats.some(c => c[0] === 'eventos') ? 'eventos' : (cats[0]?.[0] || 'eventos')
    let added = 0
    for (const cc of (S().eventsCountries || [])) {
      const code = String(cc).trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(code)) continue
      try {
        state.calls++
        const r = await fetch(`${BASE}/events.json?apikey=${encodeURIComponent(key)}&countryCode=${code}&size=${per}&sort=relevance,desc&startDateTime=${isoZ(start)}&endDateTime=${isoZ(end)}&locale=*`, { signal: AbortSignal.timeout(15000) })
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Ticketmaster ' + r.status + (d.fault?.faultstring ? ': ' + d.fault.faultstring : ''))
        for (const e of d._embedded?.events || []) {
          const v = e._embedded?.venues?.[0], lat = +v?.location?.latitude, lon = +v?.location?.longitude; if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180) || !lat) continue
          const t = e.dates?.start?.dateTime ? Date.parse(e.dates.start.dateTime) : e.dates?.start?.localDate ? Date.parse(e.dates.start.localDate + 'T20:00:00Z') : null; if (!t) continue
          const img = (e.images || []).filter(i => /^https:\/\//.test(i.url || '')).sort((a, b) => Math.abs((a.width || 0) - 1024) - Math.abs((b.width || 0) - 1024))[0]?.url || null
          const kind = e.classifications?.[0]?.segment?.name || '', genre = e.classifications?.[0]?.genre?.name
          const title = String(e.name || '').slice(0, 120), text = `${when(t)} · ${v.name || ''}${v.city?.name ? ', ' + v.city.name : ''}${genre && genre !== 'Undefined' ? ' · ' + genre : kind ? ' · ' + kind : ''}`.slice(0, 2000)
          const row = db.prepare('SELECT post_id FROM world_events WHERE id = ?').get(e.id)
          if (row && db.prepare('SELECT 1 FROM posts WHERE id = ?').get(row.post_id)) { db.prepare('UPDATE posts SET title = ?, text = ? WHERE id = ?').run(title, text, row.post_id); continue }
          const p = db.prepare("INSERT INTO posts (user_id, title, text, cat, city, country, type, image, thumb, scene, lat, lon, expires_at, base_likes, created_at) VALUES (?, ?, ?, ?, ?, ?, 'verificada', ?, ?, 'concierto', ?, ?, ?, 0, ?)")
            .run(author(), title, text, cat, String(v.city?.name || '').slice(0, 80) || 'Ciudad', String(v.country?.name || code).slice(0, 60), img, img, lat, lon, t + 6 * 3600e3, now())
          db.prepare('INSERT OR REPLACE INTO world_events VALUES (?, ?, ?, ?)').run(e.id, Number(p.lastInsertRowid), t, now()); added++
        }
      } catch (e) { state.lastError = code + ': ' + e.message }
      await new Promise(r => setTimeout(r, 250)) // Ticketmaster: máximo 5 consultas por segundo
    }
    state.lastSync = now(); if (added) broadcast({ type: 'post' })
    return { ok: true, msg: added + ' eventos nuevos · ' + db.prepare('SELECT COUNT(*) n FROM world_events').get().n + ' publicados' }
  }
  function clean() { for (const r of db.prepare('SELECT id, post_id FROM world_events WHERE starts < ?').all(now() - 30 * 3600e3)) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM world_events WHERE id = ?').run(r.id) } }
  const run = () => sync().catch(e => { state.lastError = e.message })
  setTimeout(run, 90e3).unref(); setInterval(run, 6 * 3600e3).unref(); setInterval(clean, 3600e3).unref()
  const status = () => ({ on: !!S().eventsOn, hasKey: !!secret('ticketmaster', 'key'), lastSync: state.lastSync, lastError: state.lastError, calls: state.calls,
    events: db.prepare('SELECT p.title, p.city, p.country, w.starts FROM world_events w JOIN posts p ON p.id = w.post_id ORDER BY w.starts LIMIT 200').all() })
  return { sync: async () => { try { return await sync() } catch (e) { state.lastError = e.message; return { ok: false, msg: e.message } } }, status }
}

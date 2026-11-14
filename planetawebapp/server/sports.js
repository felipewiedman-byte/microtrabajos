// Partidos automáticos (API-Football): trae los partidos de los equipos importantes y los publica en el estadio,
// con hora, EN VIVO + marcador y resultado final. Cuida el límite del plan gratis (100 consultas al día).
module.exports = function sports({ db, S, secret, WORLD, broadcast, now, getPost }) {
  const BASE = process.env.APIFOOTBALL_URL || 'https://v3.football.api-sports.io'
  db.exec(`CREATE TABLE IF NOT EXISTS sport_fixtures (id INTEGER PRIMARY KEY, post_id INTEGER, kickoff INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
           CREATE TABLE IF NOT EXISTS sport_venues (key TEXT PRIMARY KEY, lat REAL, lon REAL, city TEXT, country TEXT)`)
  const state = { day: '', used: 0, lastSync: 0, lastError: '', lastLive: 0 }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const teams = () => (S().sportsTeams || []).map(norm).filter(Boolean)
  // solo nombre EXACTO; nada de femeninos (W), juveniles (U23, U21…) ni filiales (B, II)
  const isBig = name => { const n = norm(name); if (/ (w|u\d{2}|b|ii|iii|reserves|women)$/.test(n)) return false; return teams().includes(n) }
  const budget = () => { const d = new Date().toISOString().slice(0, 10); if (state.day !== d) { state.day = d; state.used = 0 } return Math.max(0, (+S().sportsDailyMax || 90) - state.used) }
  async function api(path) {
    const key = secret('apifootball', 'key'); if (!key) throw new Error('Falta la llave de API-Football (panel → Pagos y Google).')
    if (budget() <= 0) throw new Error('Límite diario de consultas alcanzado.')
    state.used++
    const r = await fetch(BASE + path, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(15000) })
    const d = await r.json().catch(() => ({}))
    const errs = d.errors && (Array.isArray(d.errors) ? d.errors : Object.values(d.errors)); if (!r.ok || (errs && errs.length)) throw new Error('API-Football: ' + (errs?.[0] || r.status))
    return d.response || []
  }
  const author = () => {
    let u = db.prepare("SELECT id FROM users WHERE handle = 'deportes'").get()
    if (!u) { db.prepare("INSERT INTO users (name, handle, pass, hue, is_example, created_at, verified) VALUES (?, 'deportes', ?, 140, 0, ?, 1)").run((S().name || 'Worbita') + ' Deportes', 'x:' + require('crypto').randomBytes(16).toString('hex'), now()); u = db.prepare("SELECT id FROM users WHERE handle = 'deportes'").get() }
    return u.id
  }
  async function venueOf(f) {
    const v = f.fixture.venue || {}, name = v.name || '', city = v.city || ''
    const key = norm(name + '|' + city); if (!key) return null
    const c = db.prepare('SELECT * FROM sport_venues WHERE key = ?').get(key); if (c && c.lat != null) return c
    let hit = null
    let failed = false
    for (const q of [name + ', ' + city, city]) { if (!q.trim() || q.trim() === ',') continue; try { const r = await WORLD.search(q); if (r && r[0]) { hit = r[0]; break } } catch { failed = true } }
    if (!hit && failed) return null
    db.prepare('INSERT OR REPLACE INTO sport_venues VALUES (?, ?, ?, ?, ?)').run(key, hit ? +hit.lat : null, hit ? +hit.lon : null, hit?.city || city, hit?.country || f.league?.country || '')
    return hit ? { lat: +hit.lat, lon: +hit.lon, city: hit.city || city, country: hit.country || f.league?.country || '' } : null
  }
  const LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'], DONE = ['FT', 'AET', 'PEN', 'AWD', 'WO'], DROP = ['PST', 'CANC', 'ABD']
  const hour = ms => new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: S().dailyTZ || 'America/Bogota' })
  const day = ms => new Date(ms).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', timeZone: S().dailyTZ || 'America/Bogota' })
  function texts(f) {
    const st = f.fixture.status?.short, h = f.teams.home.name, a = f.teams.away.name, g = f.goals || {}, venue = f.fixture.venue?.name || '', ko = f.fixture.timestamp * 1000
    const title = `${h} vs ${a}`
    if (LIVE.includes(st)) return { title: `${h} ${g.home ?? 0} - ${g.away ?? 0} ${a}`, text: `EN VIVO · ${st === 'HT' ? 'Entretiempo' : (f.fixture.status.elapsed || 0) + "'"} · ${f.league.name}${venue ? ' · ' + venue : ''}`, live: true }
    if (DONE.includes(st)) return { title: `${h} ${g.home ?? 0} - ${g.away ?? 0} ${a}`, text: `Final · ${f.league.name}${venue ? ' · ' + venue : ''}`, live: false }
    return { title, text: `${day(ko)} · ${hour(ko)} · ${f.league.name}${venue ? ' · ' + venue : ''}`, live: false }
  }
  // escudo del equipo importante (si juegan dos grandes, el local)
  const logoOf = f => { const h = f.teams?.home, a = f.teams?.away, t = isBig(h?.name) ? h : isBig(a?.name) ? a : h; return /^https:\/\//.test(t?.logo || '') ? t.logo : null }
  async function upsert(f) {
    const id = f.fixture.id, st = f.fixture.status?.short, row = db.prepare('SELECT * FROM sport_fixtures WHERE id = ?').get(id)
    if (DROP.includes(st)) { if (row?.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(row.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(id); return }
    const t = texts(f), ko = f.fixture.timestamp * 1000
    if (row?.post_id && db.prepare('SELECT 1 FROM posts WHERE id = ?').get(row.post_id)) {
      db.prepare("UPDATE posts SET title = ?, text = ?, type = ?, image = ?, thumb = ? WHERE id = ?").run(t.title.slice(0, 120), t.text.slice(0, 2000), t.live ? 'directo' : 'verificada', logoOf(f), logoOf(f), row.post_id)
      db.prepare('UPDATE sport_fixtures SET status = ?, data = ?, updated_at = ? WHERE id = ?').run(st, JSON.stringify(f), now(), id)
      return true
    }
    const v = await venueOf(f); if (!v) return false
    const cats = S().categories || [], cat = cats.some(c => c[0] === 'deportes') ? 'deportes' : (cats[0]?.[0] || 'deportes')
    const r = db.prepare('INSERT INTO posts (user_id, title, text, cat, city, country, type, scene, lat, lon, image, thumb, base_likes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
      .run(author(), t.title.slice(0, 120), t.text.slice(0, 2000), cat, String(v.city || f.fixture.venue?.city || '').slice(0, 80) || 'Estadio', String(v.country || '').slice(0, 60), t.live ? 'directo' : 'verificada', 'estadio', v.lat, v.lon, logoOf(f), logoOf(f), now())
    db.prepare('INSERT OR REPLACE INTO sport_fixtures VALUES (?, ?, ?, ?, ?, ?)').run(id, Number(r.lastInsertRowid), ko, st, JSON.stringify(f), now())
    return true
  }
  // 1) cada 6 horas: partidos de hoy y mañana de los equipos importantes (2 consultas)
  async function sync() {
    if (!S().sportsOn) return { ok: false, msg: 'Apagado' }
    prune()
    const tz = S().dailyTZ || 'America/Bogota', d0 = new Date(), d1 = new Date(Date.now() + 864e5)
    const fmt = d => d.toLocaleDateString('en-CA', { timeZone: tz })
    let n = 0
    for (const d of [fmt(d0), fmt(d1)]) {
      const list = await api(`/fixtures?date=${d}&timezone=${encodeURIComponent(tz)}`)
      for (const f of list) if (isBig(f.teams?.home?.name) || isBig(f.teams?.away?.name)) { if (await upsert(f)) n++ }
    }
    state.lastSync = now(); state.lastError = ''; await live().catch(() => {}); broadcast({ type: 'post' })
    return { ok: true, msg: db.prepare('SELECT COUNT(*) n FROM sport_fixtures').get().n + ' partidos importantes publicados' }
  }
  // 2) cada 5 minutos, solo si hay un partido nuestro jugándose: una consulta con todos sus marcadores
  async function live() {
    if (!S().sportsOn) return
    const t = now(), rows = db.prepare("SELECT id FROM sport_fixtures WHERE kickoff BETWEEN ? AND ? AND status NOT IN ('FT','AET','PEN','AWD','WO')").all(t - 3.5 * 3600e3, t + 5 * 60e3)
    if (!rows.length) return
    const list = await api('/fixtures?ids=' + rows.slice(0, 20).map(r => r.id).join('-'))
    for (const f of list) await upsert(f)
    state.lastLive = now(); broadcast({ type: 'post' })
  }
  // los que ya no cumplen (por ejemplo, tras cambiar la lista de equipos) se quitan
  function prune() { for (const r of db.prepare('SELECT id, post_id, data FROM sport_fixtures').all()) { let f; try { f = JSON.parse(r.data) } catch { continue } if (!isBig(f.teams?.home?.name) && !isBig(f.teams?.away?.name)) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(r.id) } } }
  // 3) limpieza: partidos terminados se quitan del mapa 24 h después
  function clean() {
    for (const r of db.prepare("SELECT id, post_id FROM sport_fixtures WHERE kickoff < ?").all(now() - 30 * 3600e3)) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(r.id) }
  }
  const safe = fn => () => fn().catch(e => { state.lastError = e.message; console.error('deportes:', e.message) })
  setTimeout(safe(sync), 60e3).unref(); setInterval(safe(sync), 6 * 3600e3).unref()
  // revisa cada minuto si ya toca actualizar marcadores, según los minutos elegidos en el panel
  setInterval(() => { if (now() - state.lastLive >= (+S().sportsLiveMin || 10) * 60e3 - 5000) safe(live)() }, 60e3).unref(); setInterval(clean, 3600e3).unref(); setTimeout(() => { try { prune(); for (const r of db.prepare('SELECT post_id, data FROM sport_fixtures').all()) { const l = logoOf(JSON.parse(r.data)); if (l && r.post_id) db.prepare('UPDATE posts SET image = ?, thumb = ? WHERE id = ?').run(l, l, r.post_id) } broadcast({ type: 'post' }) } catch {} }, 20e3).unref()
  const status = () => ({ on: !!S().sportsOn, hasKey: !!secret('apifootball', 'key'), usedToday: (budget(), state.used), max: +S().sportsDailyMax || 90, lastSync: state.lastSync, lastLive: state.lastLive, lastError: state.lastError,
    fixtures: db.prepare('SELECT id, kickoff, status, data FROM sport_fixtures ORDER BY kickoff').all().map(r => { const f = JSON.parse(r.data); return { id: r.id, kickoff: r.kickoff, status: r.status, home: f.teams.home.name, away: f.teams.away.name, goals: f.goals, league: f.league.name, venue: f.fixture.venue?.name } }) })
  return { sync: async () => { try { return await sync() } catch (e) { state.lastError = e.message; return { ok: false, msg: e.message } } }, status }
}

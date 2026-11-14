// Partidos automáticos (API-Football): trae los partidos de los equipos importantes y los publica en el estadio,
// con hora, EN VIVO + marcador y resultado final. Cuida el límite del plan gratis (100 consultas al día).
module.exports = function sports({ db, S, secret, WORLD, broadcast, now, UPLOADS }) {
  const BASE = process.env.APIFOOTBALL_URL || 'https://v3.football.api-sports.io', BASE2 = process.env.SPORTAPI_URL || 'https://sportapi.ai/api'
  db.exec(`CREATE TABLE IF NOT EXISTS sport_fixtures (id INTEGER PRIMARY KEY, post_id INTEGER, kickoff INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
           CREATE TABLE IF NOT EXISTS sport_venues (key TEXT PRIMARY KEY, lat REAL, lon REAL, city TEXT, country TEXT)`)
  // el contador del día y la última sincronización se guardan en la base: si el servidor se reinicia (instalaciones), NO se vuelve a gastar el cupo
  db.exec('CREATE TABLE IF NOT EXISTS sport_meta (key TEXT PRIMARY KEY, value TEXT)')
  const metaGet = k => db.prepare('SELECT value FROM sport_meta WHERE key = ?').get(k)?.value
  const metaSet = (k, v) => { try { db.prepare('INSERT OR REPLACE INTO sport_meta VALUES (?, ?)').run(k, String(v)) } catch {} }
  const state = { day: metaGet('day') || '', used: +metaGet('used') || 0, lastSync: +metaGet('lastSync') || 0, lastError: '', lastLive: 0 }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const teams = () => (S().sportsTeams || []).map(norm).filter(Boolean)
  // solo nombre EXACTO; nada de femeninos (W), juveniles (U23, U21…) ni filiales (B, II)
  const isBig = name => { const n = norm(name); if (/ (w|u\d{2}|b|ii|iii|reserves|women)$/.test(n)) return false; return teams().includes(n) }
  const budget = () => { const d = new Date().toISOString().slice(0, 10); if (state.day !== d) { state.day = d; state.used = 0; metaSet('day', d); metaSet('used', 0) } return Math.max(0, (+S().sportsDailyMax || 90) - state.used) }
  async function api(path) {
    const key = secret('apifootball', 'key'); if (!key) throw new Error('Falta la llave de API-Football (panel → Pagos y Google).')
    if (budget() <= 0) throw new Error('Límite diario de consultas alcanzado.')
    state.used++; metaSet('used', state.used)
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
  const logoOf = f => { const h = f.teams?.home, a = f.teams?.away, t = isBig(h?.name) ? h : isBig(a?.name) ? a : h; return /^(https:\/\/|\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$)/.test(t?.logo || '') ? t.logo : null }
  const matchOf = f => JSON.stringify({ h: f.teams.home.name, a: f.teams.away.name, hl: f.teams.home.logo || '', al: f.teams.away.logo || '', gh: f.goals?.home ?? null, ga: f.goals?.away ?? null, st: f.fixture.status?.short || '', el: f.fixture.status?.elapsed || null, ko: f.fixture.timestamp * 1000, league: f.league?.name || '', venue: f.fixture.venue?.name || '',
    ev: (f.events || []).slice(-40).map(e => ({ t: e.time?.elapsed || 0, x: e.time?.extra || 0, type: e.type || '', d: e.detail || '', team: e.team?.name || '', p: e.player?.name || '', a: e.assist?.name || '' })) })
  // partido terminado (o cancelado) = sale del mapa y se borra su ubicación; no se vuelve a crear
  function dropFixture(id) { const r = db.prepare('SELECT post_id FROM sport_fixtures WHERE id = ?').get(id); if (r?.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(id) }
  async function upsert(f) {
    const id = f.fixture.id, st = f.fixture.status?.short, row = db.prepare('SELECT * FROM sport_fixtures WHERE id = ?').get(id)
    if (DROP.includes(st)) { dropFixture(id); return }
    const t = texts(f), ko = f.fixture.timestamp * 1000
    // ¿hubo gol nuevo? se anuncia en vivo a todos
    if (row) { try { const old = JSON.parse(row.data).goals || {}, g = f.goals || {}
      for (const side of ['home', 'away']) if ((g[side] ?? 0) > (old[side] ?? 0)) {
        const team = f.teams[side].name, goal = (f.events || []).filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.team?.name === team).pop()
        broadcast({ type: 'goal', team, logo: f.teams[side].logo || '', player: goal?.player?.name || '', min: goal?.time?.elapsed || f.fixture.status?.elapsed || null, own: goal?.detail === 'Own Goal', h: f.teams.home.name, a: f.teams.away.name, gh: g.home ?? 0, ga: g.away ?? 0, post: row.post_id })
      } } catch {} }
    if (DONE.includes(st)) { dropFixture(id); return }
    const prev = row?.post_id && db.prepare('SELECT match FROM posts WHERE id = ?').get(row.post_id)
    if (prev) {
      // algunas consultas (la lista diaria) no traen jugadas: nunca se borran las que ya estaban guardadas
      if (!(f.events || []).length) { try { const od = JSON.parse(row.data); if (od.events?.length) f = { ...f, events: od.events } } catch {} }
      let m = JSON.parse(matchOf(f)); try { const old = JSON.parse(prev.match || '{}').ev || []; if (old.length > m.ev.length) m.ev = old } catch {}
      db.prepare("UPDATE posts SET title = ?, text = ?, type = ?, image = ?, thumb = ?, match = ? WHERE id = ?").run(t.title.slice(0, 120), t.text.slice(0, 2000), t.live ? 'directo' : 'verificada', logoOf(f), logoOf(f), JSON.stringify(m), row.post_id)
      db.prepare('UPDATE sport_fixtures SET status = ?, data = ?, updated_at = ? WHERE id = ?').run(st, JSON.stringify(f), now(), id)
      return true
    }
    const v = await venueOf(f); if (!v) return false
    const cats = S().categories || [], cat = cats.some(c => c[0] === 'deportes') ? 'deportes' : (cats[0]?.[0] || 'deportes')
    const r = db.prepare('INSERT INTO posts (user_id, title, text, cat, city, country, type, scene, lat, lon, image, thumb, match, base_likes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
      .run(author(), t.title.slice(0, 120), t.text.slice(0, 2000), cat, String(v.city || f.fixture.venue?.city || '').slice(0, 80) || 'Estadio', String(v.country || '').slice(0, 60), t.live ? 'directo' : 'verificada', 'estadio', v.lat, v.lon, logoOf(f), logoOf(f), matchOf(f), now())
    db.prepare('INSERT OR REPLACE INTO sport_fixtures VALUES (?, ?, ?, ?, ?, ?)').run(id, Number(r.lastInsertRowid), ko, st, JSON.stringify(f), now())
    return true
  }
  // 1) cada 6 horas: partidos de hoy y mañana de los equipos importantes (2 consultas)
  async function syncAF() {
    if (!S().sportsOn) return { ok: false, msg: 'Apagado' }
    prune()
    const tz = S().dailyTZ || 'America/Bogota', d0 = new Date(), d1 = new Date(Date.now() + 864e5)
    const fmt = d => d.toLocaleDateString('en-CA', { timeZone: tz })
    for (const d of [fmt(d0), fmt(d1)]) {
      const list = await api(`/fixtures?date=${d}&timezone=${encodeURIComponent(tz)}`)
      for (const f of list) if (isBig(f.teams?.home?.name) || isBig(f.teams?.away?.name)) await upsert(f)
    }
    state.lastSync = now(); metaSet('lastSync', state.lastSync); state.lastError = ''; await live().catch(() => {}); broadcast({ type: 'post' })
    return { ok: true, msg: db.prepare('SELECT COUNT(*) n FROM sport_fixtures').get().n + ' partidos importantes publicados' }
  }
  // 2) cada 5 minutos, solo si hay un partido nuestro jugándose: una consulta con todos sus marcadores
  async function liveAF() {
    if (!S().sportsOn) return
    const t = now(), rows = db.prepare("SELECT id, status, kickoff FROM sport_fixtures WHERE kickoff BETWEEN ? AND ? AND status NOT IN ('FT','AET','PEN','AWD','WO')").all(t - 3.5 * 3600e3, t + 5 * 60e3)
    if (!rows.length) return
    // plan gratis: no permite pedir varios por id, pero sí "todos los partidos en vivo" (trae marcador, minuto y jugadas)
    const list = await api('/fixtures?live=all'), mine = new Set(rows.map(r => r.id)), seen = new Set()
    for (const f of list) if (mine.has(f.fixture.id)) { seen.add(f.fixture.id); await upsert(f) }
    // los que ya empezaron y ya no están en vivo: terminaron → se pide ese partido una vez para el resultado final
    for (const r of rows) if (!seen.has(r.id) && r.status !== 'NS' && r.status !== 'TBD') { const one = await api('/fixtures?id=' + r.id).catch(() => []); if (one[0]) await upsert(one[0]); else if (t - r.kickoff > 3 * 3600e3) dropFixture(r.id) } // si no se puede confirmar el final, pasadas 3 h se quita igual
    // los que debían empezar y no aparecen en vivo hace rato: se revisa uno por uno (aplazados, etc.)
    for (const r of rows) if (!seen.has(r.id) && (r.status === 'NS' || r.status === 'TBD')) { const k = db.prepare('SELECT kickoff FROM sport_fixtures WHERE id = ?').get(r.id)?.kickoff || 0; if (t - k > 20 * 60e3) { const one = await api('/fixtures?id=' + r.id).catch(() => []); if (one[0]) await upsert(one[0]) } }
    state.lastLive = now(); broadcast({ type: 'post' })
  }

  // ===================== SportAPI (alternativa con más consultas al día) =====================
  // Se traduce cada partido al mismo formato que API-Football, así el resto del código (mapa, goles, avisos) no cambia.
  const provider = () => S().sportsProvider === 'sportapi' ? 'sportapi' : 'apifootball'
  // PRESUPUESTO INTELIGENTE: el tope diario es el que pones en el panel; si el plan tiene tope mensual, el gasto diario se reparte para que alcance todo el mes.
  // Mientras sobra cupo se actualiza lo más rápido que pediste; si se va acercando al tope se espacian primero las tarjetas, luego los marcadores; los GOLES siempre pasan.
  function pace() {
    const max = +S().sportsDailyMax || 90; let eff = max
    if (state.month && provider() === 'sportapi') { const d = new Date(), left = Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - d.getTime()) / 864e5)); eff = Math.min(max, Math.max(30, Math.floor(state.month.remaining / left * 1.4))) }
    const pct = state.used / eff
    return { eff, pct, listX: pct > 0.9 ? 3 : pct > 0.7 ? 2 : 1, detailX: pct > 0.9 ? Infinity : pct > 0.7 ? 2 : 1 }
  }
  const lastDetail = new Map()
  const cet = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  async function api2(path) {
    const key = secret('sportapi', 'key'); if (!key) throw new Error('Falta la llave de SportAPI (panel → Pagos y Google).')
    if (budget() <= 0) throw new Error('Límite diario de consultas alcanzado.')
    state.used++; metaSet('used', state.used)
    const r = await fetch(BASE2 + path, { headers: { 'X-Api-Key': key }, signal: AbortSignal.timeout(15000) })
    const lim = +r.headers.get('x-ratelimit-limit'), rem = r.headers.get('x-ratelimit-remaining')
    if (lim && rem != null) { state.remote = { limit: lim, remaining: +rem }; if (lim - rem > state.used) { state.used = lim - rem; metaSet('used', state.used) } }
    const ml = +r.headers.get('x-ratelimit-month-limit'), mr = r.headers.get('x-ratelimit-month-remaining'); if (ml && mr != null) state.month = { limit: ml, remaining: +mr }
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.success === false) throw new Error('SportAPI: ' + (d.error || r.status))
    return d
  }
  // escudos: SportAPI los da con la llave, así que el servidor los baja UNA vez por equipo y los guarda
  db.exec('CREATE TABLE IF NOT EXISTS sport_logos (id TEXT PRIMARY KEY, url TEXT NOT NULL)')
  async function ensureLogo(teamId) {
    if (!teamId || !UPLOADS) return ''
    const fs = require('fs'), path = require('path'), crypto = require('crypto'), id = String(teamId)
    const c = db.prepare('SELECT url FROM sport_logos WHERE id = ?').get(id)
    if (c && fs.existsSync(path.join(UPLOADS, path.basename(c.url)))) return c.url
    try {
      const key = secret('sportapi', 'key'); if (!key || budget() <= 0) return ''
      state.used++; metaSet('used', state.used)
      const r = await fetch(BASE2 + '/teams/' + encodeURIComponent(id) + '/logo', { headers: { 'X-Api-Key': key }, signal: AbortSignal.timeout(15000) })
      const type = String(r.headers.get('content-type') || ''), ext = /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpg' : /webp/.test(type) ? 'webp' : ''
      if (!r.ok || !ext) return ''
      const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length || buf.length > 400e3) return ''
      const name = crypto.randomBytes(12).toString('hex') + '.' + ext
      fs.mkdirSync(UPLOADS, { recursive: true }); fs.writeFileSync(path.join(UPLOADS, name), buf)
      db.prepare('INSERT OR REPLACE INTO sport_logos VALUES (?, ?)').run(id, '/uploads/' + name)
      return '/uploads/' + name
    } catch { return '' }
  }
  const SA_STATUS = { Scheduled: 'NS', LIVE: 'LIVE', FT: 'FT', AET: 'AET', PENS: 'PEN', Postponed: 'PST', Cancelled: 'CANC', Suspended: 'SUSP' }
  function saEvents(det, home, away) {
    return (det?.events || []).map(e => {
      const t = e.event_type, minute = parseInt(e.minute) || 0, team = e.team_side === 'home' ? home : away, extra = String(e.extra_info || '')
      const base = { time: { elapsed: minute }, team: { name: team }, player: { name: e.player_name || '' } }
      if (t === 'goal') return { ...base, type: 'Goal', detail: /own/i.test(extra) ? 'Own Goal' : /miss/i.test(extra) ? 'Missed Penalty' : /pen/i.test(extra) ? 'Penalty' : 'Normal Goal' }
      if (t === 'yellow_card') return { ...base, type: 'Card', detail: 'Yellow Card' }
      if (t === 'red_card') return { ...base, type: 'Card', detail: 'Red Card' }
      return { ...base, type: String(t || ''), detail: extra }
    })
  }
  // x = partido de la lista; det = detalle (estadio, ciudad, jugadas); old = lo que ya teníamos guardado (escudos, estadio)
  function saToAF(x, det, old) {
    let st = SA_STATUS[x.status] || 'NS', el = null
    if (st === 'LIVE') { if (String(x.minute).toUpperCase() === 'HT') { st = 'HT'; el = 45 } else { el = parseInt(x.minute) || 0; st = el > 45 ? '2H' : '1H' } }
    const ov = old?.fixture?.venue || {}, ot = old?.teams || {}
    return { fixture: { id: x.id, timestamp: Math.floor(Date.parse(x.kickoff_utc) / 1000), status: { short: st, elapsed: el }, venue: { name: det?.home_stadium || ov.name || '', city: det?.home_city || ov.city || '' } },
      league: { name: x.league_name || old?.league?.name || '', country: x.league_zone || old?.league?.country || '' },
      teams: { home: { name: x.home_team, logo: ot.home?.logo || '' }, away: { name: x.away_team, logo: ot.away?.logo || '' } },
      goals: { home: x.home_score, away: x.away_score }, events: saEvents(det, x.home_team, x.away_team), _ids: { h: x.home_id, a: x.away_id } }
  }
  const bigSA = x => isBig(x.home_team) || isBig(x.away_team) || isBig(x.home_short) || isBig(x.away_short)
  async function saFull(x) { // partido nuevo: pide el detalle (estadio y ciudad) y baja los escudos
    const det = (await api2('/fixtures/' + x.id)).fixture, f = saToAF(x, det, null)
    f.teams.home.logo = await ensureLogo(x.home_id); f.teams.away.logo = await ensureLogo(x.away_id); return f
  }
  const saSkip = new Map()
  async function syncSA() {
    if (!S().sportsOn) return { ok: false, msg: 'Apagado' }
    prune()
    const t = now(), dates = [...new Set([cet(t - 12 * 3600e3), cet(t), cet(t + 24 * 3600e3), cet(t + 48 * 3600e3)])]
    for (const d of dates) {
      const list = (await api2('/fixtures/date/' + d)).data || []
      for (const x of list) {
        if (!bigSA(x)) continue
        const ko = Date.parse(x.kickoff_utc); if (!(ko > t - 5 * 3600e3 && ko < t + 48 * 3600e3)) continue
        const row = db.prepare('SELECT data FROM sport_fixtures WHERE id = ?').get(x.id)
        if (!row) { const done = ['FT', 'PENS', 'AET', 'Postponed', 'Cancelled'].includes(x.status); if (done || (saSkip.get(x.id) || 0) > t) continue
          if (!(await upsert(await saFull(x)))) saSkip.set(x.id, t + 30 * 60e3) } // sin estadio ubicable: no se vuelve a pedir en 30 min
        else if (x.status !== 'LIVE') { let old; try { old = JSON.parse(row.data) } catch {} await upsert(saToAF(x, null, old)) } // los que están en vivo los actualiza liveSA (con jugadas)
      }
    }
    state.lastSync = now(); metaSet('lastSync', state.lastSync); state.lastError = ''; await live().catch(() => {}); broadcast({ type: 'post' })
    return { ok: true, msg: db.prepare('SELECT COUNT(*) n FROM sport_fixtures').get().n + ' partidos importantes publicados' }
  }
  async function liveSA() {
    if (!S().sportsOn) return
    const t = now(), rows = db.prepare("SELECT id, status, kickoff, data FROM sport_fixtures WHERE kickoff BETWEEN ? AND ? AND status NOT IN ('FT','AET','PEN','AWD','WO')").all(t - 3.5 * 3600e3, t + 5 * 60e3)
    if (!rows.length) return
    const dates = [...new Set([cet(t), ...rows.map(r => cet(r.kickoff))])], mine = new Map(rows.map(r => [r.id, r])), seen = new Set()
    for (const d of dates) for (const x of (await api2('/fixtures/date/' + d)).data || []) {
      const row = mine.get(x.id); if (!row) continue
      seen.add(x.id); let old = {}; try { old = JSON.parse(row.data) } catch {}
      let det = null
      if (x.status === 'LIVE') {
        const goal = (x.home_score ?? 0) !== (old.goals?.home ?? 0) || (x.away_score ?? 0) !== (old.goals?.away ?? 0)
        const due = now() - (lastDetail.get(x.id) || 0) >= (+S().sportsDetailMin || 5) * 60e3 * pace().detailX
        // gol = detalle YA (quién anotó); si no, tarjetas y jugadas cada cierto tiempo, según cupo
        if (goal || due) { det = (await api2('/fixtures/' + x.id).catch(() => ({}))).fixture || null; if (det) lastDetail.set(x.id, now()) }
      }
      await upsert(saToAF(x, det, old))
    }
    for (const r of rows) if (!seen.has(r.id) && t - r.kickoff > 3.5 * 3600e3) dropFixture(r.id)
    state.lastLive = now(); broadcast({ type: 'post' })
  }
  const sync = () => provider() === 'sportapi' ? syncSA() : syncAF()
  const live = () => provider() === 'sportapi' ? liveSA() : liveAF()

  // los que ya no cumplen (por ejemplo, tras cambiar la lista de equipos) se quitan
  function prune() { for (const r of db.prepare('SELECT id, post_id, data FROM sport_fixtures').all()) { let f; try { f = JSON.parse(r.data) } catch { continue } if (!isBig(f.teams?.home?.name) && !isBig(f.teams?.away?.name)) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(r.id) } } }
  // 3) limpieza: un partido terminado sale del mapa de inmediato; cualquier otro, a las 5 h de su inicio
  function clean() {
    for (const r of db.prepare("SELECT id, post_id FROM sport_fixtures WHERE status IN ('FT','AET','PEN','AWD','WO','PST','CANC','ABD') OR kickoff < ?").all(now() - 5 * 3600e3)) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(r.id) }
    // si un partido en vivo lleva más de 25 min sin recibir datos, NO se deja «EN VIVO · 29'» congelado: se avisa que espera datos (al volver la actualización se corrige solo)
    for (const r of db.prepare("SELECT id, post_id, data, updated_at FROM sport_fixtures WHERE status IN ('1H','2H','HT','ET','BT','P','LIVE','INT','SUSP') AND updated_at < ?").all(now() - 25 * 60e3)) {
      if (!r.post_id) continue
      let f; try { f = JSON.parse(r.data) } catch { continue }
      const g = f.goals || {}, el = f.fixture?.status?.elapsed
      db.prepare("UPDATE posts SET title = ?, text = ?, type = 'verificada' WHERE id = ? AND text NOT LIKE 'Sin datos%'")
        .run(`${f.teams.home.name} ${g.home ?? 0} - ${g.away ?? 0} ${f.teams.away.name}`.slice(0, 120), `Sin datos nuevos desde el minuto ${el ?? '?'}' · esperando la actualización${f.league?.name ? ' · ' + f.league.name : ''}`, r.post_id)
    }
  }
  const safe = fn => () => fn().catch(e => { state.lastError = e.message; console.error('deportes:', e.message) })
  // al arrancar solo se sincroniza si pasaron más de 5 h desde la última vez (si no, un reinicio gastaría 2 consultas por nada)
  setTimeout(() => { if (now() - state.lastSync > 5 * 3600e3) safe(sync)() }, 60e3).unref(); setInterval(safe(sync), 6 * 3600e3).unref()
  // revisa cada minuto si ya toca actualizar marcadores, según los minutos elegidos en el panel
  setInterval(() => { if (now() - state.lastLive >= (+S().sportsLiveMin || 10) * 60e3 * (provider() === 'sportapi' ? pace().listX : 1) - 5000) safe(live)() }, 60e3).unref(); setInterval(() => { clean(); broadcast({ type: 'post' }) }, 10 * 60e3).unref(); setTimeout(clean, 30e3).unref(); setTimeout(() => { try { prune(); for (const r of db.prepare('SELECT post_id, data FROM sport_fixtures').all()) { const f = JSON.parse(r.data), l = logoOf(f); if (r.post_id) db.prepare('UPDATE posts SET image = ?, thumb = ?, match = ? WHERE id = ?').run(l, l, matchOf(f), r.post_id) } broadcast({ type: 'post' }) } catch {} }, 20e3).unref()
  const status = () => ({ on: !!S().sportsOn, provider: provider(), remote: state.remote || null, month: state.month || null, pace: (() => { const p = pace(); return { eff: p.eff, listX: p.listX, detailX: p.detailX === Infinity ? 0 : p.detailX } })(), hasKey: !!secret(provider() === 'sportapi' ? 'sportapi' : 'apifootball', 'key'), usedToday: (budget(), state.used), max: +S().sportsDailyMax || 90, lastSync: state.lastSync, lastLive: state.lastLive, lastError: state.lastError,
    fixtures: db.prepare('SELECT id, kickoff, status, data FROM sport_fixtures ORDER BY kickoff').all().map(r => { const f = JSON.parse(r.data); return { id: r.id, kickoff: r.kickoff, status: r.status, home: f.teams.home.name, away: f.teams.away.name, goals: f.goals, league: f.league.name, venue: f.fixture.venue?.name } }) })
  return { sync: async () => { try { return await sync() } catch (e) { state.lastError = e.message; return { ok: false, msg: e.message } } }, status }
}

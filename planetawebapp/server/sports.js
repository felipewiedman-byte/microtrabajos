// Partidos automáticos (API-Football): trae los partidos de los equipos importantes y los publica en el estadio,
// con hora, EN VIVO + marcador y resultado final. Cuida el límite del plan gratis (100 consultas al día).
// de los resultados del mapa, el primero que es un estadio o campo deportivo
const stadiumHit = r => (Array.isArray(r) ? r : []).find(h => /^(stadium|sports_centre|pitch|track)$/i.test(h?.kind || '') || /stadium/i.test(h?.name || '') && /^(leisure|building)$/i.test(h?.cat || '')) || null
module.exports = function sports({ db, S, secret, WORLD, broadcast, now, UPLOADS, save, R2, r2 }) {
  const BASE = process.env.APIFOOTBALL_URL || 'https://v3.football.api-sports.io', BASE2 = process.env.SPORTAPI_URL || 'https://sportapi.ai/api'
  db.exec(`CREATE TABLE IF NOT EXISTS sport_fixtures (id INTEGER PRIMARY KEY, post_id INTEGER, kickoff INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
           CREATE TABLE IF NOT EXISTS sport_venues (key TEXT PRIMARY KEY, lat REAL, lon REAL, city TEXT, country TEXT)`)
  // el contador del día y la última sincronización se guardan en la base: si el servidor se reinicia (instalaciones), NO se vuelve a gastar el cupo
  db.exec('CREATE TABLE IF NOT EXISTS sport_meta (key TEXT PRIMARY KEY, value TEXT)')
  db.exec('CREATE TABLE IF NOT EXISTS sport_usage (day TEXT PRIMARY KEY, used INTEGER NOT NULL)')
  db.exec('CREATE TABLE IF NOT EXISTS sport_leagues (id INTEGER PRIMARY KEY, name TEXT, country TEXT, geo TEXT, domestic INTEGER, fixtures INTEGER, updated_at INTEGER)')
  db.exec('CREATE TABLE IF NOT EXISTS sport_team_venue (team_id TEXT PRIMARY KEY, name TEXT, city TEXT, at INTEGER)')
  const metaGet = k => db.prepare('SELECT value FROM sport_meta WHERE key = ?').get(k)?.value
  const metaSet = (k, v) => { try { db.prepare('INSERT OR REPLACE INTO sport_meta VALUES (?, ?)').run(k, String(v)) } catch {} }
  try { db.exec('ALTER TABLE sport_fixtures ADD COLUMN src TEXT') } catch { /* ya existe */ }
  for (const c of ['name TEXT', 'how TEXT']) { try { db.exec('ALTER TABLE sport_venues ADD COLUMN ' + c) } catch { /* ya existe */ } }
  const state = { day: metaGet('day') || '', used: +metaGet('used') || 0, lastSync: +metaGet('lastSync') || 0, lastError: '', lastLive: 0 }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const teams = () => (S().sportsTeams || []).map(parse).filter(e => e.n)
  // solo nombre EXACTO; nada de femeninos (W), juveniles (U23, U21…) ni filiales (B, II)
  const teams2 = () => (S().sportsTeams2 || []).map(parse).filter(e => e.n)
  const parse = line => { const [n, q] = String(line).split('|'); return { n: norm(n), q: norm(String(q || '').replace(/^-/, '')), no: /^\s*-/.test(String(q || '')) } }
  // ctx = { zone, league } del partido: sirve para distinguir equipos con el mismo nombre (el Liverpool de Inglaterra y el de Uruguay)
  const okName = (name, list, ctx) => {
    const n = norm(name); if (/ (w|u\d{2}|b|ii|iii|reserves|women)$/.test(n)) return false
    const c = norm(((ctx && ctx.zone) || '') + ' ' + ((ctx && ctx.league) || ''))
    return list.some(e => e.n === n && (!e.q || (e.no ? !c.includes(e.q) : c.includes(e.q))))
  }
  // principales: marcador + goles + tarjetas y jugadas. secundarios: marcador + goles (gastan 3 veces menos cupo)
  const isBig = (name, ctx) => okName(name, teams(), ctx)
  const isAny = (name, ctx) => okName(name, teams(), ctx) || okName(name, teams2(), ctx)
  const ctxOf = f => ({ zone: f.league?.country, league: f.league?.name })
  // cada consulta se anota por día: sirve para ver cuánto va del mes y proyectar el final
  const bump = (n = 1) => { state.used = Math.max(0, state.used + n); metaSet('used', state.used); try { db.prepare('INSERT INTO sport_usage (day, used) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET used = excluded.used').run(state.day || new Date().toISOString().slice(0, 10), state.used) } catch { /* nada */ } }
  const budget = () => { const d = new Date().toISOString().slice(0, 10); if (state.day !== d) { state.day = d; state.used = 0; metaSet('day', d); metaSet('used', 0) } return Math.max(0, (+S().sportsDailyMax || 90) - state.used) }
  async function api(path) {
    const key = secret('apifootball', 'key'); if (!key) throw new Error('Falta la llave de API-Football (panel → Pagos y Google).')
    if (budget() <= 0) throw new Error('Límite diario de consultas alcanzado.')
    bump()
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
  // ---- ubicación de estadios: fuente fiable primero (Wikidata, con coordenadas oficiales), mapa después, ciudad como último recurso (aproximada y marcada) ----
  const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon), h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }
  async function wikidataVenue(name, near, city) {
    const base = process.env.WIKIDATA_URL || 'https://www.wikidata.org/w/api.php'
    const get = async params => { const r = await fetch(base + '?' + new URLSearchParams({ format: 'json', ...params }), { headers: { 'User-Agent': 'WorbitaBot/1.0 (consulta de estadios)' }, signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error('wikidata ' + r.status); return r.json() }
    const found = []
    for (const lang of ['es', 'en']) {
      const sr = await get({ action: 'wbsearchentities', search: name, language: lang, uselang: lang, type: 'item', limit: '10' })
      const cands = (sr.search || []).filter(x => /stadium|estadio|estádio|stade|stadion|arena|ground|football|fútbol|futbol|soccer|sports venue|recinto/i.test(x.description || ''))
      if (!cands.length) continue
      const ent = await get({ action: 'wbgetentities', ids: cands.map(x => x.id).join('|'), props: 'claims' })
      for (const c of cands) { const v = ent.entities?.[c.id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value; if (v && Number.isFinite(+v.latitude) && !found.some(f => f.id === c.id)) found.push({ id: c.id, label: c.label || '', lat: +v.latitude, lon: +v.longitude, desc: c.description || '' }) }
      if (found.length) break
    }
    if (!found.length) return null
    // 1) el que se llama EXACTAMENTE así; si es único, es ese (Stade de France). 2) si hay varios con el mismo nombre («Estadio Nacional»): el que dice la ciudad en su descripción, o el más cercano a la ciudad del equipo (máx. 120 km)
    const nn = norm(name), exact = found.filter(f => norm(f.label) === nn), pool = exact.length ? exact : found
    if (pool.length === 1) return !exact.length && near && km(pool[0], near) > 300 ? null : pool[0]
    const cn = norm(city || ''), byCity = cn ? pool.filter(f => norm(f.desc).includes(cn)) : []
    if (byCity.length === 1) return byCity[0]
    if (near) { pool.sort((a, b) => km(a, near) - km(b, near)); return km(pool[0], near) <= 120 ? pool[0] : null }
    return null
  }
  async function venueOf(f) {
    const v = f.fixture.venue || {}, name = v.name || '', city = v.city || ''
    const key = norm(name + '|' + city); if (!key.replace(/ /g, '')) return null
    const c = db.prepare('SELECT * FROM sport_venues WHERE key = ?').get(key); if (c && c.lat != null) return c
    let failed = false, cityPt = null, hit = null, how = ''
    const cityPoint = async () => { if (cityPt !== null) return cityPt; cityPt = false; try { const r = await WORLD.search(city); if (r && r[0]) cityPt = { lat: +r[0].lat, lon: +r[0].lon, city: r[0].city || city, country: r[0].country || '' } } catch { failed = true } return cityPt }
    // 1) Wikidata
    if (name.trim()) { try { const w = await wikidataVenue(name, (await cityPoint()) || null, city); if (w) { hit = w; how = 'wikidata' } } catch { failed = true } }
    // 2) el mapa, solo si lo reconoce como estadio y queda cerca de la ciudad (nunca una calle o un cerro con nombre parecido)
    if (!hit && name.trim()) for (const q of [name, name + ', ' + city]) { try { const h = stadiumHit(await WORLD.search(q)); const cp = await cityPoint(); if (h && (!cp || km(h, cp) <= 120)) { hit = h; how = 'mapa'; break } } catch { failed = true } }
    // 3) la ciudad (aproximada): queda marcada para corregirla desde el panel
    if (!hit) { const cp = await cityPoint(); if (cp) { hit = cp; how = 'ciudad' } }
    if (!hit && failed) return null
    const row = hit ? { lat: +hit.lat, lon: +hit.lon, city: hit.city || city, country: hit.country || f.league?.country || '' } : null
    db.prepare('INSERT OR REPLACE INTO sport_venues (key, lat, lon, city, country, name, how) VALUES (?, ?, ?, ?, ?, ?, ?)').run(key, row ? row.lat : null, row ? row.lon : null, row?.city || city, row?.country || f.league?.country || '', name, how || null)
    return row
  }
  // ---- corrección desde el panel ----
  const venueKey = f => { const v = f.fixture?.venue || {}; return norm((v.name || '') + '|' + (v.city || '')) }
  function moveVenuePosts(key, lat, lon) {
    let n = 0
    for (const r of db.prepare('SELECT post_id, data FROM sport_fixtures').all()) { try { if (r.post_id && venueKey(JSON.parse(r.data)) === key) { db.prepare('UPDATE posts SET lat = ?, lon = ? WHERE id = ?').run(lat, lon, r.post_id); n++ } } catch { /* partido ilegible */ } }
    return n
  }
  function venues() {
    const use = {}; for (const r of db.prepare('SELECT data FROM sport_fixtures').all()) { try { const k = venueKey(JSON.parse(r.data)); use[k] = (use[k] || 0) + 1 } catch { /* nada */ } }
    return db.prepare('SELECT key, name, city, country, lat, lon, how FROM sport_venues WHERE lat IS NOT NULL').all().map(v => ({ ...v, matches: use[v.key] || 0 }))
      .sort((a, b) => (a.how === 'ciudad' ? 0 : 1) - (b.how === 'ciudad' ? 0 : 1) || b.matches - a.matches || String(a.name).localeCompare(String(b.name)))
  }
  function setVenue(key, lat, lon) {
    lat = +lat; lon = +lon
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || (lat === 0 && lon === 0)) throw new Error('Coordenadas no válidas. Pega las de Google Maps, por ejemplo 3.5339, -76.3109.')
    if (!db.prepare('SELECT 1 FROM sport_venues WHERE key = ?').get(String(key))) throw new Error('Ese estadio ya no está en la lista.')
    db.prepare("UPDATE sport_venues SET lat = ?, lon = ?, how = 'manual' WHERE key = ?").run(lat, lon, String(key))
    return { moved: moveVenuePosts(String(key), lat, lon) }
  }
  async function research(key) {
    const v = db.prepare('SELECT * FROM sport_venues WHERE key = ?').get(String(key)); if (!v) throw new Error('Ese estadio ya no está en la lista.')
    let sample = null; for (const r of db.prepare('SELECT data FROM sport_fixtures').all()) { try { const f = JSON.parse(r.data); if (venueKey(f) === key) { sample = f; break } } catch { /* nada */ } }
    db.prepare('DELETE FROM sport_venues WHERE key = ?').run(String(key))
    const f = sample || { fixture: { venue: { name: v.name || '', city: v.city || '' } }, league: { country: v.country || '' } }
    const row = await venueOf(f); if (!row) { db.prepare('INSERT OR REPLACE INTO sport_venues (key, lat, lon, city, country, name, how) VALUES (?, ?, ?, ?, ?, ?, ?)').run(v.key, v.lat, v.lon, v.city, v.country, v.name, v.how); throw new Error('No se pudo buscar ahora (sin respuesta del mapa). Se dejó como estaba.') }
    return { moved: moveVenuePosts(String(key), row.lat, row.lon), how: db.prepare('SELECT how FROM sport_venues WHERE key = ?').get(String(key))?.how }
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
  const logoOf = f => { const h = f.teams?.home, a = f.teams?.away, t = isAny(h?.name, ctxOf(f)) ? h : isAny(a?.name, ctxOf(f)) ? a : h; return /^(https:\/\/|\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$)/.test(t?.logo || '') ? t.logo : null }
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
    db.prepare('INSERT OR REPLACE INTO sport_fixtures (id, post_id, kickoff, status, data, updated_at, src) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, Number(r.lastInsertRowid), ko, st, JSON.stringify(f), now(), S().sportsProvider === 'sportapi' ? 'sa' : 'af')
    return true
  }
  // 1) cada 6 horas: partidos de hoy y mañana de los equipos importantes (2 consultas)
  async function syncAF() {
    if (!S().sportsOn) return { ok: false, msg: 'Apagado' }
    prune(); dropOtherSource()
    const tz = S().dailyTZ || 'America/Bogota', d0 = new Date(), d1 = new Date(Date.now() + 864e5)
    const fmt = d => d.toLocaleDateString('en-CA', { timeZone: tz })
    for (const d of [fmt(d0), fmt(d1)]) {
      const list = await api(`/fixtures?date=${d}&timezone=${encodeURIComponent(tz)}`)
      for (const f of list) if (isAny(f.teams?.home?.name, ctxOf(f)) || isAny(f.teams?.away?.name, ctxOf(f))) await upsert(f)
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
  // al cambiar de fuente, los partidos que dejó la otra no se actualizan (otros números de partido): se quitan para que no queden congelados ni repetidos
  function dropOtherSource() { const me = provider() === 'sportapi' ? 'sa' : 'af'; for (const r of db.prepare("SELECT id FROM sport_fixtures WHERE COALESCE(src, 'af') != ?").all(me)) dropFixture(r.id) }
  // PRESUPUESTO INTELIGENTE: el tope diario es el que pones en el panel; si el plan tiene tope mensual, el gasto diario se reparte para que alcance todo el mes.
  // Mientras sobra cupo se actualiza lo más rápido que pediste; si se va acercando al tope se espacian primero las tarjetas, luego los marcadores; los GOLES siempre pasan.
  function pace() {
    const max = +S().sportsDailyMax || 90; let eff = max
    // cupo mensual (si el plan lo tiene): lo que queda se reparte entre los días que faltan, con un 25 % de holgura porque hay días de más partidos que otros
    if (state.month && provider() === 'sportapi') { const d = new Date(), left = Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - d.getTime()) / 864e5)), rem = state.month.remaining; eff = rem <= 0 ? 0 : Math.min(max, Math.max(Math.floor(rem / left * 1.25), Math.min(20, rem))) }
    const pct = eff > 0 ? state.used / eff : 1, level = pct > 0.95 ? 3 : pct > 0.8 ? 2 : pct > 0.6 ? 1 : 0
    // nivel 0 normal · 1 tarjetas más espaciadas · 2 sin tarjetas y marcadores más espaciados · 3 solo marcadores (y goles de las ligas principales)
    return { eff, pct, level, listX: [1, 1, 2, 3][level], detailX: [1, 2, Infinity, Infinity][level], scorersSecondary: level < 3 }
  }
  function planMonth() {
    if (provider() !== 'sportapi') return null
    const d = new Date(), ym = d.toISOString().slice(0, 7), day = d.getUTCDate(), dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(), left = dim - day + 1
    const row = db.prepare("SELECT COALESCE(SUM(used), 0) n, COUNT(*) d FROM sport_usage WHERE day LIKE ?").get(ym + '%')
    const rem = state.month ? state.month.remaining : null, lim = state.month ? state.month.limit : null
    return { used: row.n, daysWithData: row.d, limit: lim, remaining: rem, perDay: rem != null ? Math.floor(rem / left) : null, projected: row.d ? Math.round(row.n / row.d * dim) : null, daysLeft: left }
  }
  const lastDetail = new Map()
  // ---- ligas: la lista sale de SportAPI (no se escriben nombres). principal = marcador, goles y tarjetas; secundaria = marcador y goles ----
  const selMain = () => new Set((S().sportsLeagues || []).map(Number)), selSec = () => new Set((S().sportsLeagues2 || []).map(Number))
  const tierOfLeague = id => { id = Number(id); return selMain().has(id) ? 1 : selSec().has(id) ? 2 : 0 }
  const leagueDomestic = id => !!db.prepare('SELECT domestic FROM sport_leagues WHERE id = ?').get(Number(id))?.domestic
  async function leagues(force) {
    const old = db.prepare('SELECT COUNT(*) n, MAX(updated_at) t FROM sport_leagues').get()
    if (force || !old.n || now() - (old.t || 0) > 7 * 864e5) {
      if (!secret('sportapi', 'key')) throw new Error('Falta la llave de SportAPI (panel → Pagos y Google).')
      const d = await api2('/leagues'), ins = db.prepare('INSERT OR REPLACE INTO sport_leagues (id, name, country, geo, domestic, fixtures, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const g of d.data || []) for (const l of g.leagues || []) ins.run(+l.id, String(l.name || ''), String(g.country || ''), String(g.geo || l.geo || ''), l.domestic ? 1 : 0, +l.fixtures_count || 0, now())
    }
    return db.prepare('SELECT id, name, country, domestic, fixtures FROM sport_leagues ORDER BY country, name').all()
  }
  const cet = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  async function api2(path) {
    const key = secret('sportapi', 'key'); if (!key) throw new Error('Falta la llave de SportAPI (panel → Pagos y Google).')
    if (budget() <= 0) throw new Error('Límite diario de consultas alcanzado.')
    if (state.month && state.month.remaining <= 0) throw new Error('Cupo del mes agotado: vuelve a empezar el día 1.')
    // si SportAPI está caído, se espera unos minutos sin llamar (y sin gastar cupo) antes de volver a probar
    if (state.downUntil > now()) throw new Error('SportAPI caído: se vuelve a probar en ' + Math.ceil((state.downUntil - now()) / 60e3) + ' min')
    bump()
    const r = await fetch(BASE2 + path, { headers: { 'X-Api-Key': key }, signal: AbortSignal.timeout(15000) })
    const lim = +r.headers.get('x-ratelimit-limit'), rem = r.headers.get('x-ratelimit-remaining')
    if (lim && rem != null) { state.remote = { limit: lim, remaining: +rem }; if (lim - rem > state.used) { state.used = lim - rem; metaSet('used', state.used) } }
    const ml = +r.headers.get('x-ratelimit-month-limit'), mr = r.headers.get('x-ratelimit-month-remaining'); if (ml && mr != null) state.month = { limit: ml, remaining: +mr }
    const d = await r.json().catch(() => ({}))
    // error de su servidor (caído o saturado): esa consulta no cuenta para el cupo diario y se hace una pausa de 3 min
    if (r.status >= 500) { bump(-1); state.downUntil = now() + 3 * 60e3 }
    else state.downUntil = 0
    if (!r.ok || d.success === false) throw new Error('SportAPI: ' + (d.error || r.status))
    return d
  }
  // escudos: SportAPI los da con la llave, así que el servidor los baja UNA vez por equipo y los guarda
  db.exec('CREATE TABLE IF NOT EXISTS sport_logos (id TEXT PRIMARY KEY, url TEXT NOT NULL)')
  async function ensureLogo(teamId) {
    if (!teamId || !UPLOADS) return ''
    const fs = require('fs'), path = require('path'), crypto = require('crypto'), id = String(teamId)
    const c = db.prepare('SELECT url FROM sport_logos WHERE id = ?').get(id)
    if (c && (/^https:\/\//.test(c.url) || fs.existsSync(path.join(UPLOADS, path.basename(c.url))))) return c.url
    try {
      const key = secret('sportapi', 'key'); if (!key || budget() <= 0) return ''
      bump()
      const r = await fetch(BASE2 + '/teams/' + encodeURIComponent(id) + '/logo', { headers: { 'X-Api-Key': key }, signal: AbortSignal.timeout(15000) })
      const type = String(r.headers.get('content-type') || ''), ext = /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpg' : /webp/.test(type) ? 'webp' : ''
      if (!r.ok || !ext) return ''
      const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length || buf.length > 400e3) return ''
      const name = crypto.randomBytes(12).toString('hex') + '.' + ext
      // con Cloudflare R2 el escudo va allá; sin R2 (o si falla) queda en el disco
      if (r2 && R2) { try { const pub = await R2.put(r2, 'media/teams/' + name, buf, 'image/' + (ext === 'jpg' ? 'jpeg' : ext)); db.prepare('INSERT OR REPLACE INTO sport_logos VALUES (?, ?)').run(id, pub); return pub } catch (e) { console.error('[escudos] R2 no guardó el escudo, se usa el disco:', e.message) } }
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
      league: { id: x.league_id ?? old?.league?.id, name: x.league_name || old?.league?.name || '', country: x.league_zone || old?.league?.country || '' },
      teams: { home: { name: x.home_team, logo: ot.home?.logo || '' }, away: { name: x.away_team, logo: ot.away?.logo || '' } },
      goals: { home: x.home_score, away: x.away_score }, events: saEvents(det, x.home_team, x.away_team), _ids: { h: x.home_id, a: x.away_id } }
  }
  // sin equipos femeninos ni juveniles/filiales, aunque su nombre corto sea el de un club grande («Arsenal» de «Arsenal Women»)
  const WORDS = /\b(women|womens|woman|feminin[ao]?|femenin[ao]?|ladies|lionesses|youth|juvenil)\b|\bu\d{2}\b/, TEAMEND = /\b(w|b|ii|iii|reserves)$/
  const notWY = x => ![x.home_team, x.away_team].some(t => { const n = norm(t); return WORDS.test(n) || TEAMEND.test(n) }) && !WORDS.test(norm(x.league_name || ''))
  const ctxSA = x => ({ zone: x.league_zone, league: x.league_name })
  const anySA = (x, fn) => [x.home_team, x.away_team, x.home_short, x.away_short].some(t => t && fn(t, ctxSA(x)))
  const bigSA = x => tierOfLeague(x.league_id) > 0 || (notWY(x) && anySA(x, isAny))
  const topSA = x => tierOfLeague(x.league_id) === 1 || (notWY(x) && anySA(x, isBig))
  async function saFull(x) { // partido nuevo: pide el detalle (estadio y ciudad) y baja los escudos
    const dom = leagueDomestic(x.league_id), cached = dom ? db.prepare('SELECT name, city, at FROM sport_team_venue WHERE team_id = ?').get(String(x.home_id)) : null
    let det
    if (cached && now() - cached.at < 30 * 864e5) det = { home_stadium: cached.name, home_city: cached.city, events: [] }   // el estadio del equipo local ya se sabe: sin consulta
    else { det = (await api2('/fixtures/' + x.id)).fixture; if (dom && det?.home_stadium) db.prepare('INSERT OR REPLACE INTO sport_team_venue VALUES (?, ?, ?, ?)').run(String(x.home_id), det.home_stadium, det.home_city || '', now()) }
    const f = saToAF(x, det, null)
    f.teams.home.logo = await ensureLogo(x.home_id); f.teams.away.logo = await ensureLogo(x.away_id); return f
  }
  const saSkip = new Map()
  // las anotaciones por partido no crecen sin fin: cada hora se quitan las vencidas o con más de 2 días
  setInterval(() => { const t = now(); for (const [k, v] of saSkip) if (v < t) saSkip.delete(k); for (const [k, v] of lastDetail) if (v < t - 2 * 864e5) lastDetail.delete(k) }, 36e5).unref()
  async function syncSA() {
    if (!S().sportsOn) return { ok: false, msg: 'Apagado' }
    prune(); dropOtherSource()
    const t = now(), dates = [...new Set([cet(t - 12 * 3600e3), cet(t), cet(t + 24 * 3600e3)])]
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
        const due = topSA(x) && now() - (lastDetail.get(x.id) || 0) >= (+S().sportsDetailMin || 5) * 60e3 * pace().detailX // los secundarios solo piden detalle cuando hay gol
        // gol = detalle YA (quién anotó); si no, tarjetas y jugadas cada cierto tiempo, según cupo
        if ((goal && (topSA(x) || pace().scorersSecondary)) || due) { det = (await api2('/fixtures/' + x.id).catch(() => ({}))).fixture || null; if (det) lastDetail.set(x.id, now()) }
      }
      await upsert(saToAF(x, det, old))
    }
    for (const r of rows) if (!seen.has(r.id) && t - r.kickoff > 3.5 * 3600e3) dropFixture(r.id)
    state.lastLive = now(); broadcast({ type: 'post' })
  }
  const sync = () => provider() === 'sportapi' ? syncSA() : syncAF()
  // RESPALDO: si SportAPI está caído, ESPN actualiza los marcadores de los partidos que YA están en la web (cada 2 min como mucho).
  // No crea partidos ni gasta cupo. Se apaga desde el panel con sportsEspnBackup = false.
  const ESPN = require('./espn'); let espnAt = 0
  async function liveESPN() {
    if (S().sportsEspnBackup === false || now() - espnAt < 2 * 60e3) return null
    espnAt = now()
    const t = now(), rows = db.prepare("SELECT id, data FROM sport_fixtures WHERE kickoff BETWEEN ? AND ? AND status NOT IN ('FT','AET','PEN','AWD','WO')").all(t - 3.5 * 3600e3, t + 5 * 60e3)
    if (!rows.length) return 0
    const list = await ESPN.events([...new Set([ESPN.ymd(t - 12 * 3600e3), ESPN.ymd(t), ESPN.ymd(t + 12 * 3600e3)])])
    let n = 0
    for (const r of rows) { let old; try { old = JSON.parse(r.data) } catch { continue } const f = ESPN.match(old, list); if (!f) continue
      try { await upsert(f); n++ } catch (e) { console.error('[respaldo ESPN] no se pudo actualizar un partido:', e.message) } }
    if (n) broadcast({ type: 'post' }) // lastLive no se toca: así se sigue probando SportAPI y se vuelve a él en cuanto responda
    return n
  }
  const live = async () => {
    if (provider() !== 'sportapi') return liveAF()
    try { return await liveSA() } catch (e) {
      if (!(state.downUntil > now())) throw e // solo cuando SportAPI está caído, no por otros errores (llave, cupo…)
      const n = await liveESPN().catch(() => null)
      throw n ? new Error(`SportAPI caído · el respaldo ESPN actualizó ${n} partido${n > 1 ? 's' : ''}`) : e
    }
  }


  // ===================== arreglos automáticos al actualizar (se hacen solos, una sola vez; nadie corrige nada a mano) =====================
  // ligas recomendadas: nombres EXACTOS de SportAPI (país + liga). Todo lo demás queda sin marcar.
  const RECO_MAIN = [/^colombia colombian primera a$/, /conmebol libertadores$/, /^europe uefa champions league$/, /^england premier league$/, /^spain spanish la liga$/, /^world fifa world cup$/, /^south america fifa world cup qualifying - south america$/, /^europe uefa nations league$/]
  const RECO_SEC = [/^italy italian serie a$/, /^germany german bundesliga$/, /^france french ligue 1$/, /^usa us major league soccer$/, /^mexico liga mx$/, /conmebol sudamericana$/, /^brazil brazilian serie a$/, /^n\/c america concacaf nations league$/, /^europe fifa world cup qualifying - european$/, /^n\/c america fifa world cup qualifying - north\/central america$/]
  async function migrate() {
    // 1) estadios que quedaron «aproximados» o de una versión vieja: se borran con sus partidos y se vuelven a buscar con el método nuevo (los corregidos a mano y los oficiales de Wikidata se respetan)
    if (metaGet('mig_venues') !== '1') {
      try {
        for (const v of db.prepare("SELECT key FROM sport_venues WHERE COALESCE(how, '') NOT IN ('manual', 'wikidata')").all()) {
          for (const r of db.prepare('SELECT id, data FROM sport_fixtures').all()) { try { if (venueKey(JSON.parse(r.data)) === v.key) dropFixture(r.id) } catch { /* partido ilegible */ } }
          db.prepare('DELETE FROM sport_venues WHERE key = ?').run(v.key)
        }
        state.lastSync = 0; metaSet('lastSync', 0); metaSet('mig_venues', '1')
      } catch (e) { console.error('arreglo de estadios:', e.message) }
    }
    // 2) ligas: se marcan las recomendadas y se vacían las listas de equipos (la liga decide, no el nombre). Solo con SportAPI activa y su llave puesta.
    if (metaGet('mig_leagues') !== '1' && provider() === 'sportapi' && secret('sportapi', 'key') && save) {
      try {
        const norm2 = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const main = [], sec = []
        for (const l of await leagues(false)) { const t = norm2(l.country + ' ' + l.name); if (/women|femen|youth|\bu\d\d\b|reserve/.test(t)) continue; if (RECO_MAIN.some(r => r.test(t))) main.push(l.id); else if (RECO_SEC.some(r => r.test(t))) sec.push(l.id) }
        if (main.length || sec.length) { save({ sportsLeagues: main, sportsLeagues2: sec, sportsTeams: [], sportsTeams2: [] }); state.lastSync = 0; metaSet('lastSync', 0); metaSet('mig_leagues', '1'); console.log(`Deportes: ${main.length} ligas principales y ${sec.length} secundarias marcadas automáticamente`) }
      } catch (e) { console.error('arreglo de ligas:', e.message) }
    }
  }
  setTimeout(() => migrate().catch(e => console.error('arreglo automático:', e.message)), 15e3).unref()

  // los que ya no cumplen (por ejemplo, tras cambiar la lista de equipos) se quitan
  function prune() { for (const r of db.prepare('SELECT id, post_id, data, src FROM sport_fixtures').all()) { let f; try { f = JSON.parse(r.data) } catch { continue } if (r.src === 'sa' && tierOfLeague(f.league?.id) > 0) continue; if (!isAny(f.teams?.home?.name, ctxOf(f)) && !isAny(f.teams?.away?.name, ctxOf(f))) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(r.id) } } }
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
  let lastLogged = '', lastLoggedAt = 0
  const safe = fn => () => fn().catch(e => { state.lastError = e.message; if (e.message !== lastLogged || now() - lastLoggedAt > 30 * 60e3) { lastLogged = e.message; lastLoggedAt = now(); console.error('deportes:', e.message) } })
  // al arrancar solo se sincroniza si pasaron más de 5 h desde la última vez (si no, un reinicio gastaría 2 consultas por nada)
  setTimeout(() => { if (now() - state.lastSync > 5 * 3600e3) safe(sync)() }, 60e3).unref(); setInterval(safe(sync), 6 * 3600e3).unref()
  // si la sincronización de próximos partidos falló (servicio caído un momento), se reintenta cada 15 min en vez de esperar 6 h
  setInterval(() => { if (S().sportsOn && state.lastSync && now() - state.lastSync > 6.2 * 3600e3) safe(sync)() }, 15 * 60e3).unref()
  // revisa cada minuto si ya toca actualizar marcadores, según los minutos elegidos en el panel
  setInterval(() => { if (now() - state.lastLive >= (+S().sportsLiveMin || 10) * 60e3 * (provider() === 'sportapi' ? pace().listX : 1) - 5000) safe(live)() }, 60e3).unref(); setInterval(() => { clean(); broadcast({ type: 'post' }) }, 10 * 60e3).unref(); setTimeout(clean, 30e3).unref(); setTimeout(() => { try { prune(); for (const r of db.prepare('SELECT post_id, data FROM sport_fixtures').all()) { const f = JSON.parse(r.data), l = logoOf(f); if (r.post_id) db.prepare('UPDATE posts SET image = ?, thumb = ?, match = ? WHERE id = ?').run(l, l, matchOf(f), r.post_id) } broadcast({ type: 'post' }) } catch {} }, 20e3).unref()
  const status = () => ({ on: !!S().sportsOn, provider: provider(), remote: state.remote || null, month: state.month || null, pace: (() => { const p = pace(); return { eff: p.eff, level: p.level, listX: p.listX, detailX: p.detailX === Infinity ? 0 : p.detailX } })(), plan: planMonth(), hasKey: !!secret(provider() === 'sportapi' ? 'sportapi' : 'apifootball', 'key'), usedToday: (budget(), state.used), max: +S().sportsDailyMax || 90, lastSync: state.lastSync, lastLive: state.lastLive, lastError: state.lastError,
    fixtures: db.prepare('SELECT id, kickoff, status, data FROM sport_fixtures ORDER BY kickoff').all().map(r => { const f = JSON.parse(r.data); return { id: r.id, kickoff: r.kickoff, status: r.status, home: f.teams.home.name, away: f.teams.away.name, goals: f.goals, league: f.league.name, venue: f.fixture.venue?.name } }) })
  return { leagues, venues, setVenue, research, sync: async () => { try { return await sync() } catch (e) { state.lastError = e.message; return { ok: false, msg: e.message } } }, status }
}

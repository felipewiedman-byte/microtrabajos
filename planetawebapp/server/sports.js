// Partidos automáticos (API-Football): trae los partidos de los equipos importantes y los publica en el estadio,
// con hora, EN VIVO + marcador y resultado final. Cuida el límite del plan gratis (100 consultas al día).
// de los resultados del mapa, el primero que es un estadio o campo deportivo
const stadiumHit = r => (Array.isArray(r) ? r : []).find(h => /^(stadium|sports_centre|pitch|track)$/i.test(h?.kind || '') || /stadium/i.test(h?.name || '') && /^(leisure|building)$/i.test(h?.cat || '')) || null
// resultado del mapa cuyo nombre contiene las palabras DISTINTIVAS del estadio, de tipo lugar (no calle) y cerca de la ciudad: «Atanasio Girardot» = «Estadio Atanasio Girardot»
const GENERIC = /^(stadium|stadion|stade|stadio|estadio|estadi|estadium|estadio|arena|municipal|national|nacional|de|del|la|el|los|las|di|du|des|the|fc|cf|cd|sc|park|ground|sports|sport|center|centre|campo|complex|complejo|ciudad|deportiva|football|futbol)$/
const nameHit = (res, name, near, kmFn) => {
  const tok = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const want = tok(String(name).split(',')[0]).filter(w => !GENERIC.test(w) && w.length >= 3); if (!want.length || !near) return null
  return (Array.isArray(res) ? res : []).find(r => { if (!(Number.isFinite(+r?.lat) && Number.isFinite(+r?.lon))) return false
    if (/^(road|highway|street|residential|path|footway|cycleway|service|primary|secondary|tertiary|city|town|village|suburb|neighbourhood|administrative)$/i.test(r.kind || '') || /^(highway|place|boundary)$/i.test(r.cat || '')) return false
    const have = new Set(tok(r.name)); return want.every(w => have.has(w)) && kmFn({ lat: +r.lat, lon: +r.lon }, near) <= 25 }) || null
}
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
  const ESPN = require('./espn')
  const ARCH = require('./matches')({ db, S, now, broadcast: ev => broadcast(ev) })   // archivo permanente de resultados (páginas /partidos, /partido, /liga)
  // mismo equipo escrito distinto en cada fuente (Kyrgyz Republic = Kyrgyzstan, Korea Republic = South Korea…) para no publicar un partido dos veces
  const SAME = { 'kyrgyz republic': 'kyrgyzstan', 'korea republic': 'south korea', 'korea dpr': 'north korea', 'ir iran': 'iran', 'china pr': 'china', 'united states': 'usa', 'us': 'usa', 'turkiye': 'turkey', 'czechia': 'czech republic', 'cote d ivoire': 'ivory coast', 'dr congo': 'congo dr', 'congo dr': 'congo dr', 'cabo verde': 'cape verde', 'bosnia herzegovina': 'bosnia and herzegovina', 'swaziland': 'eswatini', 'timor leste': 'east timor', 'republic of ireland': 'ireland', 'chinese taipei': 'taiwan', 'brunei darussalam': 'brunei', 'holland': 'netherlands', 'the netherlands': 'netherlands' }
  const canonName = n => { let x = String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); x = x.replace(/ (w|u\d{2}|women)$/, m => m); return SAME[x] || x }
  const sameMatch = (a, b) => { const A = [canonName(a.teams?.home?.name), canonName(a.teams?.away?.name)], B = [canonName(b.teams?.home?.name), canonName(b.teams?.away?.name)]; return (A[0] === B[0] && A[1] === B[1]) || (A[0] === B[1] && A[1] === B[0]) }
  const state = { day: metaGet('day') || '', used: +metaGet('used') || 0, lastSync: +metaGet('lastSync') || 0, lastError: '', lastLive: 0 }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const teams = () => (S().sportsTeams || []).map(parse).filter(e => e.n)
  // solo nombre EXACTO; nada de femeninos (W), juveniles (U23, U21…) ni filiales (B, II)
  const teams2 = () => (S().sportsTeams2 || []).map(parse).filter(e => e.n)
  // nombres de selecciones en español → como los escribe el proveedor (en inglés): así «Brasil» y «Brazil» valen igual en la lista
  const ES_EN = { brasil: 'brazil', inglaterra: 'england', espana: 'spain', alemania: 'germany', francia: 'france', italia: 'italy', holanda: 'netherlands', 'paises bajos': 'netherlands', belgica: 'belgium', suiza: 'switzerland', croacia: 'croatia', polonia: 'poland', dinamarca: 'denmark', suecia: 'sweden', noruega: 'norway', escocia: 'scotland', gales: 'wales', irlanda: 'ireland', turquia: 'turkey', grecia: 'greece', rusia: 'russia', ucrania: 'ukraine', austria: 'austria', hungria: 'hungary', rumania: 'romania', 'republica checa': 'czech republic', chequia: 'czech republic', eslovaquia: 'slovakia', eslovenia: 'slovenia', serbia: 'serbia', marruecos: 'morocco', egipto: 'egypt', argelia: 'algeria', tunez: 'tunisia', senegal: 'senegal', camerun: 'cameroon', nigeria: 'nigeria', ghana: 'ghana', 'costa de marfil': 'ivory coast', sudafrica: 'south africa', japon: 'japan', 'corea del sur': 'south korea', china: 'china', 'arabia saudita': 'saudi arabia', 'arabia saudi': 'saudi arabia', irak: 'iraq', iran: 'iran', catar: 'qatar', singapur: 'singapore', australia: 'australia', 'nueva zelanda': 'new zealand', canada: 'canada', 'estados unidos': 'usa', eeuu: 'usa', 'ee uu': 'usa', mexico: 'mexico', panama: 'panama', 'costa rica': 'costa rica', jamaica: 'jamaica', haiti: 'haiti', honduras: 'honduras', 'el salvador': 'el salvador', guatemala: 'guatemala', peru: 'peru', bolivia: 'bolivia', venezuela: 'venezuela', ecuador: 'ecuador', paraguay: 'paraguay', uruguay: 'uruguay', chile: 'chile', colombia: 'colombia', argentina: 'argentina', portugal: 'portugal' }
  const parse = line => { const [n, q] = String(line).split('|'); return { n: ES_EN[norm(n)] || norm(n), q: norm(String(q || '').replace(/^-/, '')), no: /^\s*-/.test(String(q || '')) } }
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
    const c = db.prepare('SELECT * FROM sport_venues WHERE key = ?').get(key)
    // estadio ya guardado pero sin ciudad: se completa una vez con sus coordenadas
    if (c && c.lat != null && !c.city) { try { const g = await WORLD.reverse(c.lat, c.lon); if (g?.city) { c.city = g.city; c.country = g.country || c.country; db.prepare('UPDATE sport_venues SET city = ?, country = ? WHERE key = ?').run(c.city, c.country, key) } } catch { /* nada */ } }
    if (c && c.lat != null) return c
    let failed = false, cityPt = null, hit = null, how = ''
    const cityPoint = async () => { if (cityPt !== null) return cityPt; cityPt = false; try { const r = await WORLD.search(city); if (r && r[0]) cityPt = { lat: +r[0].lat, lon: +r[0].lon, city: r[0].city || city, country: r[0].country || '' } } catch { failed = true } return cityPt }
    // 1) Wikidata
    if (name.trim()) { try { const w = await wikidataVenue(name, (await cityPoint()) || null, city); if (w) { hit = w; how = 'wikidata' } } catch { failed = true } }
    // 2) el mapa, solo si lo reconoce como estadio y queda cerca de la ciudad (nunca una calle o un cerro con nombre parecido)
    // varias formas del nombre (con y sin lo que va después de la coma, con la ciudad, con «Estadio»/«Stadium» delante) y, si no es claramente un estadio, se acepta el que tenga el mismo nombre y esté cerca de la ciudad
    const first = name.split(',')[0].trim(), qs = [...new Set([name, first, first + ', ' + city, 'Estadio ' + first, 'Stadium ' + first, first + ' stadium'].filter(x => x.trim()))]
    if (!hit && name.trim()) for (const q of qs) { try { const res = await WORLD.search(q), cp = await cityPoint(); const h = stadiumHit(res); if (h && (!cp || km(h, cp) <= 120)) { hit = h; how = 'mapa'; break } const h2 = nameHit(res, name, cp, km); if (h2) { hit = h2; how = 'mapa'; break } } catch { failed = true } }
    // 3) la ciudad (aproximada): queda marcada para corregirla desde el panel
    if (!hit) { const cp = await cityPoint(); if (cp) { hit = cp; how = 'ciudad' } }
    if (!hit && failed) return null
    const row = hit ? { lat: +hit.lat, lon: +hit.lon, city: hit.city || city, country: hit.country || f.league?.country || '' } : null
    // sin ciudad: se pregunta al mapa en qué ciudad están esas coordenadas (así nunca queda «Estadio» ni «Europe»)
    if (row && (!row.city || !row.country || /^(europe|world|n\/c america|south america|asia|africa)$/i.test(row.country))) { try { const g = await WORLD.reverse(row.lat, row.lon); if (g) { if (!row.city && g.city) row.city = g.city; if (g.country && (!row.country || /^(europe|world|n\/c america|south america|asia|africa)$/i.test(row.country))) row.country = g.country } } catch { /* sin respuesta: se queda como estaba */ } }
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
  // textos que ESPN pone como «estadio» y no lo son (o que la web inventaba al faltar el estadio)
  const JUNK_VENUE = /various|due to the|\btbd\b|to be (announced|confirmed)|unknown|\bU\d{2} stadium$|^\W*$/i
  function venues() {
    const use = {}; for (const r of db.prepare('SELECT data FROM sport_fixtures').all()) { try { const k = venueKey(JSON.parse(r.data)); use[k] = (use[k] || 0) + 1 } catch { /* nada */ } }
    return db.prepare('SELECT key, name, city, country, lat, lon, how FROM sport_venues').all().filter(v => v.lat != null || !JUNK_VENUE.test(String(v.name || ''))).map(v => ({ ...v, matches: use[v.key] || 0 }))
      .sort((a, b) => (a.lat == null ? 0 : 1) - (b.lat == null ? 0 : 1) || (a.how === 'ciudad' ? 0 : 1) - (b.how === 'ciudad' ? 0 : 1) || b.matches - a.matches || String(a.name).localeCompare(String(b.name)))
  }
  function setVenue(key, lat, lon) {
    lat = +lat; lon = +lon
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || (lat === 0 && lon === 0)) throw new Error('Coordenadas no válidas. Pega las de Google Maps, por ejemplo 3.5339, -76.3109.')
    if (!db.prepare('SELECT 1 FROM sport_venues WHERE key = ?').get(String(key))) throw new Error('Ese estadio ya no está en la lista.')
    db.prepare("UPDATE sport_venues SET lat = ?, lon = ?, how = 'manual' WHERE key = ?").run(lat, lon, String(key))
    setTimeout(() => { espnCreate().catch(() => {}) }, 800)   // los partidos que esperaban este estadio se publican enseguida
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
  // menor = ni sus equipos ni su liga están entre los elegidos: la web lo muestra solo al acercar el mapa (evita llenarlo de partidos pequeños)
  // IMPORTANTE (se ve siempre) = selecciones, torneos de selecciones, ligas y copas grandes, o lo que elegiste en el panel. Todo lo demás (ligas B, divisiones menores, torneos pequeños) es MENOR.
  const COUNTRY_LIST = ['afghanistan', 'albania', 'algeria', 'andorra', 'angola', 'antigua and barbuda', 'argentina', 'armenia', 'aruba', 'australia', 'austria', 'azerbaijan', 'bahamas', 'bahrain', 'bangladesh', 'barbados', 'belarus', 'belgium', 'belize', 'benin', 'bermuda', 'bhutan', 'bolivia', 'bosnia and herzegovina', 'bosnia herzegovina', 'botswana', 'brazil', 'brunei', 'bulgaria', 'burkina faso', 'burundi', 'cambodia', 'cameroon', 'canada', 'cape verde', 'cabo verde', 'cayman islands', 'central african republic', 'chad', 'chile', 'china', 'china pr', 'chinese taipei', 'colombia', 'comoros', 'congo', 'dr congo', 'congo dr', 'cook islands', 'costa rica', 'croatia', 'cuba', 'curacao', 'cyprus', 'czech republic', 'czechia', 'denmark', 'djibouti', 'dominica', 'dominican republic', 'ecuador', 'egypt', 'el salvador', 'england', 'equatorial guinea', 'eritrea', 'estonia', 'eswatini', 'ethiopia', 'faroe islands', 'fiji', 'finland', 'france', 'gabon', 'gambia', 'georgia', 'germany', 'ghana', 'gibraltar', 'greece', 'grenada', 'guam', 'guatemala', 'guinea', 'guinea bissau', 'guyana', 'haiti', 'honduras', 'hong kong', 'hungary', 'iceland', 'india', 'indonesia', 'iran', 'iraq', 'ireland', 'republic of ireland', 'israel', 'italy', 'ivory coast', 'cote d ivoire', 'jamaica', 'japan', 'jordan', 'kazakhstan', 'kenya', 'kosovo', 'kuwait', 'kyrgyzstan', 'laos', 'latvia', 'lebanon', 'lesotho', 'liberia', 'libya', 'liechtenstein', 'lithuania', 'luxembourg', 'macau', 'madagascar', 'malawi', 'malaysia', 'maldives', 'mali', 'malta', 'mauritania', 'mauritius', 'mexico', 'moldova', 'mongolia', 'montenegro', 'montserrat', 'morocco', 'mozambique', 'myanmar', 'namibia', 'nepal', 'netherlands', 'new caledonia', 'new zealand', 'nicaragua', 'niger', 'nigeria', 'north korea', 'north macedonia', 'northern ireland', 'norway', 'oman', 'pakistan', 'palestine', 'panama', 'papua new guinea', 'paraguay', 'peru', 'philippines', 'poland', 'portugal', 'puerto rico', 'qatar', 'romania', 'russia', 'rwanda', 'samoa', 'san marino', 'sao tome and principe', 'saudi arabia', 'scotland', 'senegal', 'serbia', 'seychelles', 'sierra leone', 'singapore', 'slovakia', 'slovenia', 'solomon islands', 'somalia', 'south africa', 'south korea', 'korea republic', 'south sudan', 'spain', 'sri lanka', 'st kitts and nevis', 'saint kitts and nevis', 'st lucia', 'saint lucia', 'st vincent and the grenadines', 'sudan', 'suriname', 'sweden', 'switzerland', 'syria', 'tahiti', 'tajikistan', 'tanzania', 'thailand', 'timor leste', 'togo', 'tonga', 'trinidad and tobago', 'tunisia', 'turkey', 'turkiye', 'turkmenistan', 'uganda', 'ukraine', 'united arab emirates', 'uae', 'united states', 'usa', 'uruguay', 'uzbekistan', 'vanuatu', 'venezuela', 'vietnam', 'wales', 'yemen', 'zambia', 'zimbabwe']
  const COUNTRY = new Set(COUNTRY_LIST)
  const isCountry = name => COUNTRY.has(norm(name).replace(/ (w|u\d{2}|women|olympic)$/, ''))
  const TOURNAMENT = /world cup|friendl|nations league|qualif|euro(pean)? championship|copa america|gold cup|asian cup|africa cup|olympic|confederations|international/
  const minorOf = f => (f.league?.top || tierOfLeague(f.league?.id) > 0 || isAny(f.teams?.home?.name, ctxOf(f)) || isAny(f.teams?.away?.name, ctxOf(f))
    || (isCountry(f.teams?.home?.name) && isCountry(f.teams?.away?.name)) || TOURNAMENT.test(norm((f.league?.country || '') + ' ' + (f.league?.name || '')))
    || (f.league?.id && [...RECO_MAIN, ...RECO_SEC].some(r => r.test(norm((f.league?.country || '') + ' ' + (f.league?.name || '')))))) ? 0 : 1
  const matchOf = f => JSON.stringify({ mn: minorOf(f), h: f.teams.home.name, a: f.teams.away.name, hl: f.teams.home.logo || '', al: f.teams.away.logo || '', gh: f.goals?.home ?? null, ga: f.goals?.away ?? null, st: f.fixture.status?.short || '', el: f.fixture.status?.elapsed || null, ko: f.fixture.timestamp * 1000, league: f.league?.name || '', venue: f.fixture.venue?.name || '',
    ev: (f.events || []).slice(-40).map(e => ({ t: e.time?.elapsed || 0, x: e.time?.extra || 0, type: e.type || '', d: e.detail || '', team: e.team?.name || '', p: e.player?.name || '', a: e.assist?.name || '' })) })
  // partido terminado (o cancelado) = sale del mapa y se borra su ubicación; no se vuelve a crear
  function dropFixture(id) { const r = db.prepare('SELECT post_id FROM sport_fixtures WHERE id = ?').get(id); if (r?.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(id) }
  // ===== avisos de sonido: pitido inicial, tarjetas, entretiempo, segundo tiempo y pitido final (el gol ya tenía el suyo) =====
  const announced = new Map()   // partido -> jugadas ya avisadas (así una actualización repetida no avisa dos veces)
  const evKey = e => [e.type, e.detail, e.time?.elapsed, e.player?.name, e.team?.name].join('|')
  function announceEvents(row, f) {
    const od = JSON.parse(row.data), oldSt = od.fixture?.status?.short, newSt = f.fixture.status?.short, id = f.fixture.id
    const base = { type: 'matchev', imp: minorOf(f) ? 0 : 1, h: f.teams.home.name, a: f.teams.away.name, gh: f.goals?.home ?? 0, ga: f.goals?.away ?? 0, post: row.post_id, logo: logoOf(f) || '', min: f.fixture.status?.elapsed || null }
    const send = (kind, extra) => broadcast({ ...base, kind, ...extra })
    if (!LIVE.includes(oldSt) && !DONE.includes(oldSt) && ['1H', 'LIVE'].includes(newSt)) send('start')
    else if (newSt === 'HT' && oldSt !== 'HT') send('ht')
    else if (oldSt === 'HT' && ['2H', 'LIVE'].includes(newSt)) send('resume')
    else if (DONE.includes(newSt) && (LIVE.includes(oldSt) || oldSt === 'HT')) send('end')
    // tarjetas nuevas (las que ya estaban guardadas, o ya avisadas, no se repiten)
    const seen = announced.get(id) || new Set((od.events || []).map(evKey))
    for (const e of f.events || []) { const k = evKey(e); if (seen.has(k)) continue; seen.add(k)
      if (e.type === 'Card' && LIVE.includes(newSt)) send(/red/i.test(e.detail) ? 'red' : 'yellow', { team: e.team?.name || '', player: e.player?.name || '', min: e.time?.elapsed || base.min })
      else if (e.type === 'Goal' && e.detail === 'Missed Penalty' && LIVE.includes(newSt)) send('penmiss', { team: e.team?.name || '', player: e.player?.name || '', min: e.time?.elapsed || base.min }) }
    announced.set(id, seen); if (announced.size > 800) announced.delete(announced.keys().next().value)
  }
  async function upsert(f) {
    const id = f.fixture.id, st = f.fixture.status?.short, row = db.prepare('SELECT * FROM sport_fixtures WHERE id = ?').get(id)
    if (hiddenOf(f)) { dropFixture(id); return false }   // liga o equipo oculto desde el panel
    if (!dayOk(f.fixture.timestamp * 1000, st)) { dropFixture(id); return false }   // no es de hoy
    try { const ko0 = f.fixture.timestamp * 1000; ARCH.save(f, dayOf(ko0) + '|' + [canonName(f.teams.home.name), canonName(f.teams.away.name)].sort().join('|')) } catch { /* el archivo es un extra: nunca frena la actualización */ }
    if (DROP.includes(st)) { dropFixture(id); return }
    const t = texts(f), ko = f.fixture.timestamp * 1000
    // ¿hubo gol nuevo? se anuncia en vivo a todos
    if (row) { try { const old = JSON.parse(row.data).goals || {}, g = f.goals || {}
      for (const side of ['home', 'away']) if ((g[side] ?? 0) > (old[side] ?? 0)) {
        const team = f.teams[side].name, goal = (f.events || []).filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.team?.name === team).pop()
        broadcast({ type: 'goal', imp: minorOf(f) ? 0 : 1, team, logo: f.teams[side].logo || '', player: goal?.player?.name || '', min: goal?.time?.elapsed || f.fixture.status?.elapsed || null, own: goal?.detail === 'Own Goal', pen: goal?.detail === 'Penalty', h: f.teams.home.name, a: f.teams.away.name, gh: g.home ?? 0, ga: g.away ?? 0, post: row.post_id })
      } } catch {} }
    if (row) { try { announceEvents(row, f) } catch { /* el aviso es un extra: nunca frena la actualización */ } }
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
      .run(author(), t.title.slice(0, 120), t.text.slice(0, 2000), cat, String(v.city || f.fixture.venue?.city || f.fixture.venue?.name || v.name || '').slice(0, 80) || ('Estadio ' + f.fixture.id), String(v.country || '').slice(0, 60), t.live ? 'directo' : 'verificada', 'estadio', v.lat, v.lon, logoOf(f), logoOf(f), matchOf(f), now())
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
      // con Cloudflare R2 el escudo va allá; solo sin R2 (instalación de pruebas) queda en el disco
      if (r2 && R2) { try { const put = async () => R2.put(r2, 'media/teams/' + name, buf, 'image/' + (ext === 'jpg' ? 'jpeg' : ext)); let pub; try { pub = await put() } catch { await new Promise(r => setTimeout(r, 700)); pub = await put() } db.prepare('INSERT OR REPLACE INTO sport_logos VALUES (?, ?)').run(id, pub); return pub } catch (e) { console.error('[escudos] R2 no guardó el escudo:', e.message); return '' } }
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
  const bigSA = x => tierOfLeague(x.league_id) > 0 || (notWY(x) && anySA(x, isAny))   // SportAPI solo en tus ligas y equipos; el resto de partidos lo publica ESPN, sin gastar cupo
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
        if (!dayOk(ko, x.status)) continue   // solo los de hoy (y los que ya están en juego)
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
  // los partidos ya publicados reciben (o corrigen) su marca de «menor» sin esperar a su siguiente actualización
  function backfillMinor() {
    let n = 0
    for (const r of db.prepare('SELECT f.data fd, p.id pid, p.match pm FROM sport_fixtures f JOIN posts p ON p.id = f.post_id').all()) {
      try { const f = JSON.parse(r.fd), m = JSON.parse(r.pm || '{}'), mn = minorOf(f); if (m.mn !== mn) { m.mn = mn; db.prepare('UPDATE posts SET match = ? WHERE id = ?').run(JSON.stringify(m), r.pid); n++ } } catch { /* partido ilegible */ }
    }
    if (n) broadcast({ type: 'post' })
  }
  setTimeout(() => { try { backfillMinor() } catch (e) { console.error('deportes:', e.message) } }, 20e3).unref()
  // «solo ESPN»: SportAPI no se usa ni gasta cupo; sus partidos se quitan y ESPN los publica gratis
  const onlyEspn = () => !!S().sportsEspnOnly
  function dropProviderFixtures() { let n = 0; for (const r of db.prepare('SELECT id FROM sport_fixtures WHERE id > 0').all()) { dropFixture(r.id); n++ } if (n) broadcast({ type: 'post' }); return n }
  const sync = async () => {   // ESPN publica aunque SportAPI falle (caído, sin cupo o sin llave)
    let r, err
    if (onlyEspn()) r = { ok: true, msg: 'Solo ESPN' }
    else try { r = provider() === 'sportapi' ? await syncSA() : await syncAF() } catch (e) { err = e }
    const n = await espnCreate().catch(e => { console.error('[ESPN] publicar partidos:', e.message); return 0 })
    try { backfillMinor() } catch { /* nada */ }
    if (err && !n) throw err
    const L = state.espnLast, det = L ? ` · ESPN trae ${L.eventos}: publicados ${L.publicados}, ya estaban ${L.duplicados}, de otro día ${L.otroDia}, terminados ${L.terminados}, sin ubicar ${L.sinUbicar}, ocultos ${L.ocultos}${L.errores ? ', errores ' + L.errores : ''}` : ''
    return err ? { ok: true, msg: n + ' partidos publicados desde ESPN (' + err.message + ')' + det } : { ...r, msg: r.msg + det }
  }
  // RESPALDO: si SportAPI está caído, ESPN actualiza los marcadores de los partidos que YA están en la web (cada 2 min como mucho).
  // No crea partidos ni gasta cupo. Se apaga desde el panel con sportsEspnBackup = false.
  let espnAt = 0
  // escudo de ESPN: se baja UNA vez por equipo y se guarda en Cloudflare R2 (igual que los de SportAPI)
  // ===== solo los partidos del día (de las 00:00 a las 23:59 en tu zona horaria); a medianoche entran los del día siguiente =====
  const tzOf = () => S().dailyTZ || 'America/Bogota'
  const dayOf = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: tzOf() })
  // un partido se muestra si es de hoy, o si ya está en juego (uno de anoche que sigue jugándose a las 00:10)
  const dayOk = (ko, st) => S().sportsTodayOnly === false || dayOf(ko) === dayOf(now()) || (LIVE.includes(st) || st === 'LIVE')
  function purgeDay() {
    let n = 0
    for (const r of db.prepare('SELECT id, kickoff, status FROM sport_fixtures').all()) if (!dayOk(r.kickoff, r.status)) { dropFixture(r.id); n++ }
    if (n) broadcast({ type: 'post' }); return n
  }
  // ===== ligas y equipos de ESPN que se muestran u ocultan desde el panel =====
  db.exec('CREATE TABLE IF NOT EXISTS espn_leagues (slug TEXT PRIMARY KEY, name TEXT, seen INTEGER NOT NULL DEFAULT 0)')
  const COUNTRY_ES = { arg: 'Argentina', aus: 'Australia', aut: 'Austria', bel: 'Bélgica', bol: 'Bolivia', bra: 'Brasil', chi: 'Chile', chn: 'China', col: 'Colombia', crc: 'Costa Rica', cro: 'Croacia', cyp: 'Chipre', cze: 'Rep. Checa', den: 'Dinamarca', ecu: 'Ecuador', egy: 'Egipto', eng: 'Inglaterra', esp: 'España', fin: 'Finlandia', fra: 'Francia', ger: 'Alemania', gre: 'Grecia', gua: 'Guatemala', hon: 'Honduras', hun: 'Hungría', idn: 'Indonesia', ind: 'India', irl: 'Irlanda', isr: 'Israel', ita: 'Italia', jam: 'Jamaica', jpn: 'Japón', kor: 'Corea del Sur', mex: 'México', mys: 'Malasia', ned: 'Países Bajos', nir: 'Irlanda del Norte', nor: 'Noruega', nzl: 'Nueva Zelanda', pan: 'Panamá', par: 'Paraguay', per: 'Perú', pol: 'Polonia', por: 'Portugal', qat: 'Catar', rou: 'Rumanía', rsa: 'Sudáfrica', rus: 'Rusia', sau: 'Arabia Saudita', sco: 'Escocia', sgp: 'Singapur', slv: 'El Salvador', srb: 'Serbia', sui: 'Suiza', svk: 'Eslovaquia', svn: 'Eslovenia', swe: 'Suecia', tha: 'Tailandia', tur: 'Turquía', ukr: 'Ucrania', uae: 'Emiratos Árabes', uru: 'Uruguay', usa: 'Estados Unidos', ven: 'Venezuela', vie: 'Vietnam', wal: 'Gales', isl: 'Islandia', lva: 'Letonia', ltu: 'Lituania', est: 'Estonia', mlt: 'Malta', bul: 'Bulgaria', blr: 'Bielorrusia', geo: 'Georgia', kaz: 'Kazajistán', mar: 'Marruecos', tun: 'Túnez', alg: 'Argelia', hkg: 'Hong Kong', irn: 'Irán', irq: 'Irak', jor: 'Jordania', lbn: 'Líbano', kuw: 'Kuwait', bhr: 'Baréin', omn: 'Omán', can: 'Canadá', cub: 'Cuba', dom: 'Rep. Dominicana', hai: 'Haití', nca: 'Nicaragua', tri: 'Trinidad y Tobago' }
  const REGION_ES = { afc: 'Asia (AFC)', caf: 'África (CAF)', concacaf: 'Norte, Centro y Caribe (Concacaf)', conmebol: 'Sudamérica (CONMEBOL)', uefa: 'Europa (UEFA)', ofc: 'Oceanía (OFC)', fifa: 'Selecciones y torneos FIFA', global: 'Torneos internacionales', club: 'Amistosos de clubes', aff: 'Sudeste Asiático', campeones: 'EE. UU. y México', fifa_: '' }
  const describe = sl => {
    const parts = String(sl).split('.'), head = parts[0], rest = parts.slice(1).join('.')
    const country = COUNTRY_ES[head] || REGION_ES[head] || (head.length <= 3 ? head.toUpperCase() : head)
    const fem = /(^|\.)w(\.|$)|women|\.w\./.test(sl), juv = /(^|[._])u\d{2}|youth|junior/.test(sl)
    const lvl = COUNTRY_ES[head] ? ({ '1': 'Primera división', '2': 'Segunda división', '3': 'Tercera división', '4': 'Cuarta división' }[parts[1]] || (/camp\./.test(sl) ? 'Campeonato estatal' : /super/.test(rest) ? 'Supercopa' : /cup|copa|trofeo|coupe|pokal|coppa/.test(rest) ? 'Copa' : /playoff|promotion|relegation|ply/.test(rest) ? 'Ascenso/descenso' : 'Torneo')) : (/friendly/.test(sl) ? 'Amistosos' : /qual|q$|worldq|euroq|cupq/.test(sl) ? 'Clasificatorias' : /champions|libertadores|sudamericana|confed|europa|recopa|club|cup_qual|afc\.cup$/.test(sl) ? 'Torneo de clubes' : 'Torneo de selecciones')
    return { country, tipo: lvl + (fem ? ' · Femenino' : '') + (juv ? ' · Juvenil' : '') }
  }
  const slugName = sl => String(sl).split('.').map(x => x.replace(/_/g, ' ')).join(' · ')
  const leagueSeen = (slug, name) => { if (!slug) return; if (!name || name === 'Fútbol') name = '';  try { db.prepare('INSERT INTO espn_leagues (slug, name, seen) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET seen = excluded.seen, name = CASE WHEN excluded.name != \'\' THEN excluded.name ELSE espn_leagues.name END').run(slug, String(name || ''), now()) } catch { /* nada */ } }
  const offLeagues = () => new Set((S().espnLeaguesOff || []).map(String)), offTeams = () => new Set((S().espnTeamsOff || []).map(x => norm(x)))
  const hiddenOf = f => { const lo = offLeagues(), to = offTeams(); if (!lo.size && !to.size) return false; return (!!f.league?.slug && lo.has(f.league.slug)) || to.has(norm(f.teams?.home?.name)) || to.has(norm(f.teams?.away?.name)) }
  // quita de la web lo que ahora está oculto (se llama al guardar el panel y en cada búsqueda)
  function purgeHidden() {
    let n = 0
    for (const r of db.prepare('SELECT id, data FROM sport_fixtures').all()) { try { if (hiddenOf(JSON.parse(r.data))) { dropFixture(r.id); n++ } } catch { /* partido ilegible */ } }
    n += purgeDay(); try { ARCH.hide(offLeagues(), offTeams(), norm) } catch { /* nada */ }
    if (n) broadcast({ type: 'post' }); return n
  }
  // lista de ligas para el panel: todas las que ESPN tiene (se descubren solas) + cuántos partidos hay hoy en cada una
  let discAt = 0
  async function discover() {
    if (now() - discAt < 24 * 3600e3) return; discAt = now()
    try { for (const sl of await ESPN.leagueSlugs()) { if (!db.prepare('SELECT 1 FROM espn_leagues WHERE slug = ?').get(sl)) db.prepare('INSERT OR IGNORE INTO espn_leagues (slug, name, seen) VALUES (?, ?, 0)').run(sl, '') } } catch { /* sin lista: quedan las vistas en partidos */ }
    for (const sl of ESPN.TOP) db.prepare('INSERT OR IGNORE INTO espn_leagues (slug, name, seen) VALUES (?, ?, 0)').run(sl, '')
    const pend = db.prepare("SELECT slug FROM espn_leagues WHERE name = '' OR name = 'Fútbol'").all().slice(0, 400)   // nombres de las ligas, de 8 en 8
    for (let i = 0; i < pend.length; i += 8) await Promise.all(pend.slice(i, i + 8).map(async r => { try { const nm = await ESPN.leagueName(r.slug); if (nm) db.prepare('UPDATE espn_leagues SET name = ? WHERE slug = ?').run(nm, r.slug) } catch { /* se intenta mañana */ } }))
  }
  async function espnCatalog() {
    await discover().catch(() => {})
    const today = {}; for (const r of db.prepare('SELECT data FROM sport_fixtures WHERE id < 0').all()) { try { const sl = JSON.parse(r.data).league?.slug; if (sl) today[sl] = (today[sl] || 0) + 1 } catch { /* nada */ } }
    const off = offLeagues()
    return { leagues: db.prepare('SELECT slug, name, seen FROM espn_leagues').all().map(l => ({ slug: l.slug, name: l.name && l.name !== 'Fútbol' ? l.name : slugName(l.slug), ...describe(l.slug), today: today[l.slug] || 0, hidden: off.has(l.slug) }))
      .sort((a, b) => (b.today > 0) - (a.today > 0) || String(a.country).localeCompare(String(b.country)) || String(a.tipo).localeCompare(String(b.tipo)) || String(a.name).localeCompare(String(b.name))) }
  }
  const teamsCache = new Map()
  async function espnTeams(slug) {
    slug = String(slug || '').replace(/[^a-z0-9._-]/gi, ''); if (!slug) return { teams: [] }
    const c = teamsCache.get(slug); if (c && now() - c.t < 12 * 3600e3) return { teams: c.v }
    const v = await ESPN.teamsOf(slug); teamsCache.set(slug, { t: now(), v }); return { teams: v }
  }
  // equipo sin escudo en ESPN: se dibuja uno con sus iniciales y un color propio (siempre el mismo para ese equipo) y se guarda en R2
  async function badgeLogo(name) {
    if (!r2 || !R2) return ''
    const id = 'gen' + norm(name).replace(/ /g, '_').slice(0, 60), c = db.prepare('SELECT url FROM sport_logos WHERE id = ?').get(id); if (c) return c.url
    const w = norm(name).split(' ').filter(x => x.length > 1 && !/^(fc|cd|cf|sc|ac|cp|ud|sd|ad|rc|rcd|club|de|del|la|el|the)$/.test(x))
    const ini = (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || norm(name) || '?').slice(0, 2)).toUpperCase()
    let h = 0; for (const ch of norm(name)) h = (h * 31 + ch.charCodeAt(0)) % 360
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4 92 18v34c0 22-18 38-42 45C26 90 8 74 8 52V18z" fill="hsl(${h} 55% 36%)" stroke="#fff" stroke-width="4"/><text x="50" y="63" font-family="Arial,Helvetica,sans-serif" font-size="${ini.length > 2 ? 28 : 36}" font-weight="700" text-anchor="middle" fill="#fff">${ini.replace(/[^A-Z0-9]/g, '')}</text></svg>`
    try { const put = () => R2.put(r2, 'media/teams/gen-' + h + '-' + require('crypto').createHash('md5').update(id).digest('hex').slice(0, 10) + '.svg', Buffer.from(svg), 'image/svg+xml'); let pub; try { pub = await put() } catch { await new Promise(k => setTimeout(k, 700)); pub = await put() }
      db.prepare('INSERT OR REPLACE INTO sport_logos VALUES (?, ?)').run(id, pub); return pub } catch { return '' }
  }
  async function espnLogo(team) {
    if (!team?.src || !/^https:\/\/[\w.-]+\.espncdn\.com\//i.test(team.src) || !UPLOADS) return badgeLogo(team?.name)
    const id = 'espn' + (team.id || norm(team.src)), c = db.prepare('SELECT url FROM sport_logos WHERE id = ?').get(id); if (c) return c.url
    try {
      const r = await fetch(team.src, { signal: AbortSignal.timeout(15000) }), type = String(r.headers.get('content-type') || ''), ext = /png/.test(type) ? 'png' : /jpe?g/.test(type) ? 'jpg' : /webp/.test(type) ? 'webp' : ''
      if (!r.ok || !ext) return ''
      const buf = Buffer.from(await r.arrayBuffer()); if (!buf.length || buf.length > 400e3) return ''
      const name = require('crypto').randomBytes(12).toString('hex') + '.' + ext
      if (r2 && R2) { const put = () => R2.put(r2, 'media/teams/' + name, buf, 'image/' + (ext === 'jpg' ? 'jpeg' : ext)); let pub; try { pub = await put() } catch { await new Promise(k => setTimeout(k, 700)); pub = await put() } db.prepare('INSERT OR REPLACE INTO sport_logos VALUES (?, ?)').run(id, pub); return pub }
      require('fs').mkdirSync(UPLOADS, { recursive: true }); require('fs').writeFileSync(require('path').join(UPLOADS, name), buf)
      db.prepare('INSERT OR REPLACE INTO sport_logos VALUES (?, ?)').run(id, '/uploads/' + name); return '/uploads/' + name
    } catch { return '' }
  }
  // «todos los partidos»: ESPN no gasta cupo de SportAPI, así que publica TODO partido de fútbol del día que la web aún no tenga
  let topSet = new Map(), topAt = 0
  async function espnCreate() {
    if (!S().sportsOn || !(S().sportsAll || onlyEspn()) || S().sportsEspnBackup === false) return 0
    const t = now(), list = await ESPN.events([...new Set([ESPN.ymd(t - 12 * 3600e3), ESPN.ymd(t), ESPN.ymd(t + 24 * 3600e3)])])
    // ids de los partidos de las ligas y torneos importantes (se consulta cada 30 min: son unas 70 ligas × 2 días)
    purgeHidden(); discover().catch(() => {})
    if (!topAt || now() - topAt > 30 * 60e3) { try { const ids = await ESPN.topIds([ESPN.ymd(t), ESPN.ymd(t + 24 * 3600e3)]); if (ids.size) { topSet = ids; topAt = now() } } catch { /* se usa la lista anterior */ } }
    const have = db.prepare('SELECT id, data FROM sport_fixtures WHERE kickoff > ?').all(t - 6 * 3600e3).filter(r => !(onlyEspn() && r.id > 0)).map(r => { try { return { id: r.id, f: JSON.parse(r.data) } } catch { return null } }).filter(Boolean)
    // duplicados que ya estaban publicados (el de ESPN y el de SportAPI): se quita el de ESPN
    for (const h of have) { if (h.id >= 0) continue; const twin = have.find(o => o.id > 0 && Math.abs(o.f.fixture.timestamp - h.f.fixture.timestamp) < 5400 && sameMatch(o.f, h.f)); if (twin) { dropFixture(h.id); h.id = 0 } }
    // partidos ya publicados desde ESPN: se marcan como importantes si su liga lo es, y se reintenta el escudo que faltó
    let fixed = 0
    const slugOf = new Map(list.map(e => [-Number(e.id), e._slug || topSet.get(String(e.id)) || '']))
    for (const h of have) {
      if (h.id >= 0) continue   // (los duplicados quitados arriba quedan con id 0)
      let ch = false
      const sl = slugOf.get(h.id); if (sl && h.f.league?.slug !== sl) { h.f.league = { ...h.f.league, slug: sl }; ch = true; leagueSeen(sl, h.f.league?.name) }
      if (topSet.size && !!h.f.league?.top !== topSet.has(String(-h.id))) { h.f.league = { ...h.f.league, top: topSet.has(String(-h.id)) }; ch = true }   // también se QUITA la marca si ya no corresponde
      for (const side of ['home', 'away']) { const tm = h.f.teams?.[side]; if (tm && !tm.logo && fixed < 25) { fixed++; const u = await espnLogo(tm); if (u) { tm.logo = u; ch = true } } }
      if (ch) { try { db.prepare('UPDATE sport_fixtures SET data = ? WHERE id = ?').run(JSON.stringify(h.f), h.id); await upsert(h.f) } catch { /* se reintenta en la próxima vuelta */ } }
    }
    let n = 0
    const c = { eventos: list.length, ocultos: 0, otroDia: 0, terminados: 0, duplicados: 0, sinUbicar: 0, errores: 0 }
    for (const e of list) {
      const f = ESPN.toFixture(e); if (!f) continue
      if (topSet.has(String(e.id))) { f.league.top = true; if (!f.league.slug) f.league.slug = topSet.get(String(e.id)) }
      leagueSeen(f.league.slug, f.league.name)
      if (hiddenOf(f)) { c.ocultos++; continue }
      const ko = f.fixture.timestamp * 1000, st = f.fixture.status.short
      if (DONE.includes(st) || DROP.includes(st)) { c.terminados++; continue }
      if (!(ko > t - 5 * 3600e3 && ko < t + 36 * 3600e3) || !dayOk(ko, st)) { c.otroDia++; continue }
      if (have.some(h => h.id === f.fixture.id)) { c.duplicados++; continue }   // ya publicado desde ESPN
      if (have.some(h => ESPN.match(h.f, [e]) || (Math.abs(h.f.fixture.timestamp - f.fixture.timestamp) < 5400 && sameMatch(h.f, f)))) { c.duplicados++; continue }    // ya lo trae SportAPI (mismos equipos y hora, aunque el nombre cambie)
      // mismo estadio y misma hora que otro partido ya publicado: es el mismo
      const vk = venueKey(f); if (vk.replace(/\|/g, '').trim() && have.some(h => venueKey(h.f) === vk && Math.abs(h.f.fixture.timestamp * 1000 - ko) < 3 * 3600e3)) { c.duplicados++; continue }
      if (JUNK_VENUE.test(f.fixture.venue.name || '')) f.fixture.venue.name = ''
      // ESPN a veces no trae el estadio: en CLUBES se busca el del equipo local; en selecciones y juveniles no se inventa (queda sin ubicar)
      if (!f.fixture.venue.name) { if (isCountry(f.teams.home.name) || /\bU\d{2}\b/i.test(f.teams.home.name + ' ' + f.teams.away.name)) { c.sinUbicar++; continue } f.fixture.venue.name = f.teams.home.name + ' stadium' }
      f.teams.home.logo = await espnLogo(f.teams.home); f.teams.away.logo = await espnLogo(f.teams.away)
      try { if (await upsert(f)) { n++; have.push({ id: f.fixture.id, f }) } else c.sinUbicar++ } catch (er) { c.errores++; console.error('[ESPN] no se pudo publicar un partido:', er.message) }
      if (n >= 150) break   // el resto entra en la siguiente vuelta (cada 15 min): los estadios nuevos se ubican de a poco
    }
    // «solo ESPN»: recién ahora se quitan los de SportAPI (ya están publicados los de ESPN, así el mapa nunca queda vacío)
    if (onlyEspn() && list.length && (n > 0 || c.duplicados > 0)) dropProviderFixtures()
    state.espnLast = { ...c, publicados: n, hora: now() }
    if (n) broadcast({ type: 'post' })
    return n
  }
  // ===== archivo de resultados: TODOS los partidos de ESPN con su liga (no depende del mapa) =====
  let sweepMap = new Map(), sweepAt = 0, archAt = 0, archBusy = false
  // la liga de cada partido: ESPN la dice con seguridad cuando se pide el marcador de cada liga por separado (cada 45 min, todas las ligas del catálogo)
  async function leagueTags(dates, slugs, force) {
    if (!force && now() - sweepAt < 45 * 60e3 && sweepMap.size) return sweepMap
    sweepAt = now()
    try { const m = await ESPN.sweep(slugs || [...new Set([...db.prepare('SELECT slug FROM espn_leagues').all().map(r => r.slug), ...ESPN.TOP])], dates); if (m.size) { for (const [k, v] of m) sweepMap.set(k, v); if (sweepMap.size > 20000) sweepMap = new Map([...sweepMap].slice(-10000)) } } catch { /* se usa lo anterior */ }
    return sweepMap
  }
  function archiveIngest(list) {
    let n = 0
    for (const e of list || []) {
      try {
        const f = ESPN.toFixture(e); if (!f) continue
        const tag = sweepMap.get(String(e.id)) || (topSet.get(String(e.id)) ? { slug: topSet.get(String(e.id)), name: '' } : null)
        if (tag) { f.league.slug = tag.slug; if (tag.name) f.league.name = tag.name }
        if (hiddenOf(f) || DROP.includes(f.fixture.status.short)) continue
        const ko = f.fixture.timestamp * 1000
        ARCH.save(f, dayOf(ko) + '|' + [canonName(f.teams.home.name), canonName(f.teams.away.name)].sort().join('|')); n++
      } catch { /* un partido ilegible no frena a los demás */ }
    }
    return n
  }
  async function archiveSync(force) {
    if (archBusy || S().partidosOn === false || !S().sportsOn) return 0
    if (!force && now() - archAt < 9 * 60e3 && !ARCH.hasLive()) return 0
    archBusy = true; archAt = now()
    try {
      const t = now(), dates = [...new Set([ESPN.ymd(t - 24 * 3600e3), ESPN.ymd(t), ESPN.ymd(t + 24 * 3600e3)])]
      await leagueTags(dates)
      const list = await ESPN.events(dates), sig = () => JSON.stringify(db.prepare('SELECT id, status, gh, ga, el FROM match_archive WHERE kickoff > ? ORDER BY id').all(t - 6 * 3600e3)), before = sig()
      const n = archiveIngest(list)
      if (sig() !== before) broadcast({ type: 'post' })   // cambió un marcador o un estado: las páginas abiertas se actualizan ya
      return n
    } catch { return 0 } finally { archBusy = false }
  }
  // al arrancar y una vez al día: los 7 días anteriores (así las páginas de resultados no empiezan vacías)
  async function archiveBackfill() {
    const day = dayOf(now()); if (metaGet('archBack') === day || !S().sportsOn || S().partidosOn === false) return
    metaSet('archBack', day)
    try {
      const t = now(), past = []; for (let i = -6; i <= 7; i++) if (i) past.push(ESPN.ymd(t - i * 24 * 3600e3))   // 7 días atrás y 6 hacia adelante (calendario)
      await leagueTags(past, ESPN.TOP, true)
      for (let i = 0; i < past.length; i += 2) archiveIngest(await ESPN.events(past.slice(i, i + 2)))
    } catch { /* se intenta mañana */ }
  }
  setTimeout(() => { archiveBackfill().catch(() => {}); archiveSync(true).catch(() => {}) }, 45e3).unref()
  setInterval(() => { archiveSync(false).catch(() => {}) }, 40e3).unref()   // con partidos en juego se mira cada 40 s; sin ellos, cada 9 min
  // ---- completar con API-Football lo que ESPN no trae: tope propio por día (no toca el cupo del mapa) y un registro para no repetir ----
  const FILL = require('./fill'), fillDayKey = () => ARCH.dayOf(now()), fillCache = new Map()   // el día es el de tu zona (reinicia a las 00:00 locales), no el UTC
  // cupo repartido por horas: poco de madrugada, y el resto queda para la tarde y la noche, cuando hay más partidos
  const fillAllowed = max => { const h = +new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: S().dailyTZ || 'America/Bogota' }) % 24; return Math.ceil(max * (h < 8 ? 0.2 : h < 14 ? 0.5 : 1)) }
  const fillUsed = () => metaGet('fillDay') === fillDayKey() ? +metaGet('fillN') || 0 : 0
  const fillBump = () => { metaSet('fillDay', fillDayKey()); metaSet('fillN', fillUsed() + 1) }
  let filling = false
  async function fillSync() {
    if (filling || S().fillOn === false || S().partidosOn === false || !secret('apifootball', 'key')) return 0
    const max = fillAllowed(Math.max(0, Math.min(90, +S().fillMax || 30))); if (fillUsed() >= max) return 0
    filling = true; let n = 0
    try {
      for (const c of ARCH.fillCandidates(6)) {
        if (fillUsed() >= max) break
        const r = c.row, date = new Date(r.kickoff).toISOString().slice(0, 10)
        try {
          let afid = c.afid
          if (!afid) {
            let list = fillCache.get(date); if (!list || now() - list.t > 45 * 60e3) { fillBump(); list = { t: now(), v: await api('/fixtures?date=' + date + '&timezone=UTC') }; fillCache.set(date, list) }
            const f = FILL.findFixture(list.v, r); if (!f) { ARCH.fillMark(r.id, false); continue }
            afid = f.id; c.swapped = f.swapped
          }
          if (fillUsed() >= max) break
          fillBump(); const resp = (await api('/fixtures?id=' + afid))[0]; if (!resp) { ARCH.fillMark(r.id, false, afid); continue }
          const swapped = FILL.sameTeam(resp.teams?.home?.name, r.away) && !FILL.sameTeam(resp.teams?.home?.name, r.home)
          const d = FILL.toDetail(resp, swapped)
          if (FILL.isEmpty(d)) ARCH.fillMark(r.id, false, afid); else { ARCH.fillSave(r.id, d); n++ }
        } catch (e) { state.lastError = 'Completar: ' + e.message; if (/L[ií]mite|llave/i.test(e.message)) break }
      }
    } finally { filling = false; if (fillCache.size > 6) fillCache.delete(fillCache.keys().next().value) }
    return n
  }
  // ---- prueba desde el panel: responde con datos REALES de tu llave si la liga trae alineaciones, si se empareja el partido y si los cambios vienen bien ----
  async function fillTest(src) {
    const out = [], say = (...a) => out.push(a.join(' ')), rows = ARCH.fillSample(6)
    if (!rows.length) return ['Todavía no hay partidos de fútbol guardados de hoy. Abre /partidos un momento y vuelve a probar.']
    const enVivo = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'FT', 'AET', 'PEN']
    if (src === 'sa') {
      if (!secret('sportapi', 'key')) return ['Falta la llave de SportAPI (Pagos y Google).']
      const cetD = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
      say('SportAPI: se gastan 2 consultas del cupo del mes.')
      const dates = [...new Set(rows.map(r => cetD(r.kickoff)))].slice(0, 2); let all = []
      for (const d of dates) { const l = (await api2('/fixtures/date/' + d)).data || []; all = all.concat(l); say('Partidos de', d, 'en SportAPI:', String(l.length)) }
      const byLg = new Map(); for (const x of all) { const k = (x.league_name || '?') + ' [' + (x.league_zone || x.league_geo || '') + ']'; byLg.set(k, (byLg.get(k) || 0) + 1) }
      say('Ligas que trae (' + byLg.size + '):', [...byLg.entries()].slice(0, 40).map(([k, n]) => k + ' ×' + n).join(' · '))
      const col = all.filter(x => /colombia/i.test((x.league_name || '') + ' ' + (x.league_zone || '') + ' ' + (x.home_team || '')) || /^CO$/i.test(x.league_geo || ''))
      say('Partidos de Colombia en la lista:', String(col.length), col.length ? '→ ' + col.slice(0, 6).map(x => x.home_team + ' vs ' + x.away_team + ' (' + x.league_name + ')').join('; ') : '(ninguno: SportAPI no trae la Copa Colombia ni la Liga BetPlay)')
      for (const r of rows.slice(0, 4)) { const hit = all.find(x => FILL.sameTeam(x.home_team, r.home) && FILL.sameTeam(x.away_team, r.away)); say(hit ? '✓ Emparejado:' : '✗ NO está:', r.home, 'vs', r.away) }
      const x = all.find(y => ['LIVE', 'FT'].includes(y.status) && col.includes(y)) || all.find(y => ['LIVE', 'FT'].includes(y.status))
      if (!x) { say('No hay un partido en juego o terminado para revisar el detalle ahora.'); return out }
      const raw = await api2('/fixtures/' + x.id), det = raw.fixture || raw.data || {}
      say('Respuesta de SportAPI: claves →', Object.keys(raw).join(', '))
      say('Detalle de ejemplo (' + x.home_team + ' vs ' + x.away_team + ', ' + x.league_name + '): claves →', Object.keys(det).join(', '))
      say('   alineaciones:', det.lineups || det.lineup ? 'SÍ' : 'no', '| estadísticas:', det.statistics ? 'SÍ' : 'no', '| jugadas:', (det.events || []).length, '| tipos:', [...new Set((det.events || []).map(e => e.event_type))].join(', ') || '(ninguno)')
      return out
    }
    if (!secret('apifootball', 'key')) return ['Falta la llave de API-Football (Pagos y Google).']
    const key = secret('apifootball', 'key')
    // intentos anteriores del completado en estos partidos (si ya se agotaron, no volvía a pedirlos); la prueba los reinicia
    for (const r of rows) { const g = ARCH.fillInfo(r.id); say('Registro de', r.home, 'vs', r.away + ':', g ? 'intentos ' + g.tries + ', con datos ' + (g.ok ? 'sí' : 'no') + ', último hace ' + Math.round((now() - g.last) / 60e3) + ' min' : 'sin intentos') }
    ARCH.fillReset(rows.map(r => r.id)); say('(intentos reiniciados: el completado vuelve a intentarlos)')
    try { const r = await (await fetch(BASE + '/status', { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(12000) })).json(); const q = r.response || {}; say('Plan:', q.subscription?.plan || '?', '| consultas hoy:', (q.requests?.current ?? '?') + ' de ' + (q.requests?.limit_day ?? '?')) } catch (e) { say('No pude leer el estado de la cuenta:', e.message) }
    try {
      const L = await api('/leagues?country=Colombia&current=true'); say('Ligas de Colombia en API-Football (temporada actual):')
      for (const l of L.slice(0, 8)) { const c = (l.seasons || []).find(s => s.current)?.coverage?.fixtures || {}; say(' -', l.league?.name + ':', 'jugadas', c.events ? 'SÍ' : 'no', '| alineaciones', c.lineups ? 'SÍ' : 'no', '| estadísticas', c.statistics_fixtures ? 'SÍ' : 'no', '| estadísticas de jugadores', c.statistics_players ? 'SÍ' : 'no') }
    } catch (e) { say('No pude leer las ligas:', e.message) }
    const found = []
    for (const r of rows) {
      const date = new Date(r.kickoff).toISOString().slice(0, 10)
      try {
        let list = fillCache.get(date); if (!list || now() - list.t > 45 * 60e3) { list = { t: now(), v: await api('/fixtures?date=' + date + '&timezone=UTC') }; fillCache.set(date, list) }
        const f = FILL.findFixture(list.v, r)
        if (!f) { const near = list.v.filter(x => Math.abs((x.fixture?.timestamp || 0) * 1000 - r.kickoff) < 4 * 3600e3 && /col|colombia/i.test(String(x.league?.country || x.league?.name))).slice(0, 4).map(x => x.teams?.home?.name + ' vs ' + x.teams?.away?.name); say('✗ NO se emparejó:', r.home, 'vs', r.away, '(' + r.league + ')', near.length ? '| parecidos en API-Football: ' + near.join('; ') : '| no hay partido parecido ese día'); continue }
        const st = list.v.find(x => x.fixture?.id === f.id)?.fixture?.status?.short || '?'
        say('✓ Emparejado:', r.home, 'vs', r.away, '→ partido', f.id, '(estado en API-Football:', st + ')'); found.push({ r, f, st })
      } catch (e) { say('Error con', r.home, 'vs', r.away + ':', e.message); if (/L[ií]mite|llave/i.test(e.message)) break }
    }
    // el detalle se revisa en un partido que YA empezó (si el partido aún no empieza, no tiene datos y no prueba nada)
    const pick = found.find(x => enVivo.includes(x.st)) || null
    if (!pick) say('Ningún partido emparejado está en juego o terminado todavía: el detalle (alineaciones, cambios) no se puede comprobar ahora. Vuelve a probar con un partido en juego.')
    else try {
      const resp = (await api('/fixtures?id=' + pick.f.id))[0] || {}
      say('Detalle de', pick.r.home, 'vs', pick.r.away + ': estadísticas', (resp.statistics || []).length ? 'SÍ' : 'no', '| alineaciones', (resp.lineups || []).length ? 'SÍ (' + resp.lineups.map(l => (l.startXI || []).length + ' titulares').join(' y ') + ')' : 'no', '| jugadas', (resp.events || []).length, '| fotos de jugadores', (resp.players || []).reduce((n, t) => n + (t.players || []).filter(p => p.player?.photo).length, 0))
      const subs = (resp.events || []).filter(e => e.type === 'subst'), starters = new Set((resp.lineups || []).flatMap(l => (l.startXI || []).map(p => p.player?.name)))
      if (subs.length) { const ok = subs.filter(e => starters.has(e.player?.name)).length; say('Cambios:', subs.length, '| el que sale (player) está entre los titulares en', ok, 'de', subs.length, ok === subs.length ? '→ orientación CONFIRMADA' : ok === 0 ? '→ está INVERTIDA' : '→ mezcla, revisar') }
      else say('Cambios: este partido todavía no tiene')
      const swp = FILL.sameTeam(resp.teams?.home?.name, pick.r.away) && !FILL.sameTeam(resp.teams?.home?.name, pick.r.home), d = FILL.toDetail(resp, swp)
      if (FILL.isEmpty(d)) { ARCH.fillMark(pick.r.id, false, pick.f.id); say('API-Football todavía no tiene datos de este partido: no se guardó nada.') }
      else { ARCH.fillSave(pick.r.id, d); say('✓ Guardado: abre el partido en la web y recarga. Titulares:', String((d.lineups.home?.players || []).filter(p => p.st).length) + ' y ' + String((d.lineups.away?.players || []).filter(p => p.st).length), '| jugadas:', String(d.evs.length), '| estadísticas:', String(d.stats.length)) }
    } catch (e) { say('No pude leer el detalle:', e.message) }
    say('Consultas usadas por el completado hoy:', fillUsed() + ' de ' + (Math.max(0, Math.min(90, +S().fillMax || 30))))
    return out
  }
  setTimeout(() => fillSync().catch(() => {}), 120e3).unref(); setInterval(() => fillSync().catch(() => {}), 5 * 60e3).unref()
  setInterval(() => { archiveBackfill().catch(() => {}) }, 6 * 3600e3).unref()
  async function liveESPN(onlyOwn) {
    if (S().sportsEspnBackup === false || now() - espnAt < 100e3) return null
    espnAt = now()
    const t = now(), rows = db.prepare("SELECT id, data FROM sport_fixtures WHERE kickoff BETWEEN ? AND ? AND status NOT IN ('FT','AET','PEN','AWD','WO')" + (onlyOwn ? ' AND id < 0' : '')).all(t - 3.5 * 3600e3, t + 5 * 60e3)
    if (!rows.length) return 0
    const list = await ESPN.events([...new Set([ESPN.ymd(t - 12 * 3600e3), ESPN.ymd(t), ESPN.ymd(t + 12 * 3600e3)])])
    archiveIngest(list)
    let n = 0
    for (const r of rows) { let old; try { old = JSON.parse(r.data) } catch { continue } const f = ESPN.match(old, list); if (!f) continue
      try { await upsert(f); n++ } catch (e) { console.error('[respaldo ESPN] no se pudo actualizar un partido:', e.message) } }
    if (n) broadcast({ type: 'post' }) // lastLive no se toca: así se sigue probando SportAPI y se vuelve a él en cuanto responda
    return n
  }
  const live = async () => {
    if (onlyEspn()) { await liveESPN(true).catch(() => null); state.lastLive = now(); return }
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
  // partidos ya publicados con la ciudad genérica «Estadio» (o el país «Europe»): se averigua su ciudad y país reales por las coordenadas
  setTimeout(async () => { try { let n = 0
    for (const r of db.prepare("SELECT p.id, p.lat, p.lon, f.data FROM sport_fixtures f JOIN posts p ON p.id = f.post_id WHERE p.city = 'Estadio' OR p.country IN ('Europe', 'World', 'N/C America', 'South America', 'Asia', 'Africa')").all()) {
      let g = null; try { g = await WORLD.reverse(r.lat, r.lon) } catch { /* nada */ }
      let d = {}; try { d = JSON.parse(r.data) } catch { /* nada */ }
      const city = g?.city || d.fixture?.venue?.city || d.fixture?.venue?.name; if (!city) continue
      db.prepare('UPDATE posts SET city = ?, country = COALESCE(?, country) WHERE id = ?').run(String(city).slice(0, 80), g?.country || null, r.id); n++
      await new Promise(ok => setTimeout(ok, 1100)) } // el servicio del mapa pide como mucho una consulta por segundo
    if (n) { console.log(`deportes: ${n} partidos ubicados en su ciudad real`); broadcast({ type: 'post' }) }
  } catch (e) { console.error('deportes: ubicar ciudades:', e.message) } }, 10e3).unref()
  // los estadios aproximados (pin en el centro de la ciudad) o sin ubicar se vuelven a buscar una vez al día con la búsqueda mejorada
  async function retryVenues() {
    const day = new Date().toISOString().slice(0, 10); if (metaGet('venRetry') === day) return; metaSet('venRetry', day)
    for (const v of db.prepare("SELECT key FROM sport_venues WHERE how = 'ciudad' OR lat IS NULL LIMIT 60").all()) { try { await research(v.key) } catch { /* se intenta mañana */ } await new Promise(k => setTimeout(k, 1200)) }
    state.lastSync = 0; metaSet('lastSync', 0)
  }
  setTimeout(() => retryVenues().catch(e => console.error('estadios:', e.message)), 45e3).unref(); setInterval(() => retryVenues().catch(() => {}), 6 * 3600e3).unref()
  setTimeout(() => migrate().catch(e => console.error('arreglo automático:', e.message)), 15e3).unref()

  // los que ya no cumplen (por ejemplo, tras cambiar la lista de equipos) se quitan
  function prune() { if (S().sportsAll || onlyEspn()) return; for (const r of db.prepare('SELECT id, post_id, data, src FROM sport_fixtures').all()) { let f; try { f = JSON.parse(r.data) } catch { continue } if (r.src === 'sa' && tierOfLeague(f.league?.id) > 0) continue; if (!isAny(f.teams?.home?.name, ctxOf(f)) && !isAny(f.teams?.away?.name, ctxOf(f))) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM sport_fixtures WHERE id = ?').run(r.id) } } }
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
  // con «todos los partidos»: ESPN publica y actualiza los suyos cada pocos minutos, sin gastar cupo
  setInterval(() => { if (S().sportsOn && (S().sportsAll || onlyEspn())) { liveESPN(true).catch(() => {}) } }, 30e3).unref()   // cada 30 s se mira; liveESPN solo consulta a ESPN cada 2 min como mucho
  setInterval(() => { if (S().sportsOn && (S().sportsAll || onlyEspn())) espnCreate().catch(e => console.error('[ESPN] publicar partidos:', e.message)) }, 15 * 60e3).unref()
  // a medianoche (hora de tu zona): se quitan los partidos del día anterior y se traen los del nuevo día sin esperar a la siguiente búsqueda
  let dayKey = ''
  setInterval(() => { const k = dayOf(now()); if (dayKey && k !== dayKey) { try { purgeDay() } catch { /* nada */ } state.lastSync = 0; metaSet('lastSync', 0); safe(sync)() } dayKey = k }, 60e3).unref()
  setTimeout(() => { dayKey = dayOf(now()); try { purgeDay() } catch { /* nada */ } }, 5e3).unref()
  let lastLogged = '', lastLoggedAt = 0
  const safe = fn => () => fn().catch(e => { state.lastError = e.message; if (e.message !== lastLogged || now() - lastLoggedAt > 30 * 60e3) { lastLogged = e.message; lastLoggedAt = now(); console.error('deportes:', e.message) } })
  // al arrancar solo se sincroniza si pasaron más de 5 h desde la última vez (si no, un reinicio gastaría 2 consultas por nada)
  setTimeout(() => { if (now() - state.lastSync > 5 * 3600e3) safe(sync)() }, 60e3).unref(); setInterval(safe(sync), 6 * 3600e3).unref()
  // si la sincronización de próximos partidos falló (servicio caído un momento), se reintenta cada 15 min en vez de esperar 6 h
  setInterval(() => { if (S().sportsOn && state.lastSync && now() - state.lastSync > 6.2 * 3600e3) safe(sync)() }, 15 * 60e3).unref()
  // revisa cada minuto si ya toca actualizar marcadores, según los minutos elegidos en el panel
  setInterval(() => { if (now() - state.lastLive >= (+S().sportsLiveMin || 10) * 60e3 * (provider() === 'sportapi' ? pace().listX : 1) - 5000) safe(live)() }, 60e3).unref(); setInterval(() => { clean(); broadcast({ type: 'post' }) }, 10 * 60e3).unref(); setTimeout(clean, 30e3).unref(); setTimeout(() => { try { prune(); for (const r of db.prepare('SELECT post_id, data FROM sport_fixtures').all()) { const f = JSON.parse(r.data), l = logoOf(f); if (r.post_id) db.prepare('UPDATE posts SET image = ?, thumb = ?, match = ? WHERE id = ?').run(l, l, matchOf(f), r.post_id) } broadcast({ type: 'post' }) } catch {} }, 20e3).unref()
  const status = () => ({ espn: state.espnLast || null, buscando: !!state.syncing, resultado: state.lastResult || '', on: !!S().sportsOn, provider: provider(), remote: state.remote || null, month: state.month || null, pace: (() => { const p = pace(); return { eff: p.eff, level: p.level, listX: p.listX, detailX: p.detailX === Infinity ? 0 : p.detailX } })(), plan: planMonth(), hasKey: !!secret(provider() === 'sportapi' ? 'sportapi' : 'apifootball', 'key'), usedToday: (budget(), state.used), max: +S().sportsDailyMax || 90, lastSync: state.lastSync, lastLive: state.lastLive, lastError: state.lastError,
    fixtures: db.prepare('SELECT id, kickoff, status, data FROM sport_fixtures ORDER BY kickoff').all().map(r => { const f = JSON.parse(r.data); return { id: r.id, kickoff: r.kickoff, status: r.status, home: f.teams.home.name, away: f.teams.away.name, goals: f.goals, league: f.league.name, venue: f.fixture.venue?.name } }) })
  return { ARCH, fillSync, fillTest, fillStatus: () => ({ used: fillUsed(), max: Math.max(0, Math.min(90, +S().fillMax || 30)), on: S().fillOn !== false && !!secret('apifootball', 'key') }), archiveNow: () => archiveSync(true), leagues, venues, setVenue, research, espnCatalog, espnTeams, purgeHidden, liveEspnNow: async () => { espnAt = 0; return liveESPN(true) }, sync: async () => {
    if (state.syncing) return { ok: true, msg: 'Ya se está buscando (puede tardar unos minutos)…' }
    state.syncing = true; state.lastResult = ''
    sync().then(r => { state.lastResult = r.msg || '' }).catch(e => { state.lastError = e.message; state.lastResult = 'Error: ' + e.message }).finally(() => { state.syncing = false })
    return { ok: true, msg: 'Buscando partidos… (tarda unos minutos; el resultado aparece abajo en «Estado»)' }
  }, status }
}

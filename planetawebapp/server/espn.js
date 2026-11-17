// Respaldo de marcadores con ESPN (servicio público sin llave, NO oficial).
// Solo se usa cuando SportAPI está caído, y solo para ACTUALIZAR partidos que ya están en la web:
// marcador, minuto, goles y tarjetas. No crea partidos, no cambia estadios ni escudos.
// Si ESPN cambia su formato o no responde, no pasa nada: se ignora y la web sigue como estaba.
const BASE = process.env.ESPN_URL || 'https://site.api.espn.com/apis/site/v2/sports/soccer'
// "all" trae todas las ligas de fútbol del día; si no responde, se prueba liga por liga
const LEAGUES = ['uefa.nations', 'concacaf.nations.league', 'fifa.friendly', 'fifa.worldq.uefa', 'fifa.worldq.conmebol', 'fifa.worldq.concacaf', 'fifa.worldq.afc', 'fifa.worldq.caf',
  'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'conmebol.libertadores', 'conmebol.sudamericana', 'concacaf.champions',
  'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'por.1', 'ned.1', 'usa.1', 'mex.1', 'arg.1', 'bra.1', 'col.1', 'chi.1', 'per.1', 'uru.1', 'ecu.1']

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(fc|cf|sc|ac|cd|club|de|the|cp|sv|afc|ca)\b/g, ' ').replace(/\s+/g, ' ').trim()
// mismo equipo: nombre EXACTO (sin contar FC, CF, Club…). Mejor dejar un partido sin actualizar que confundir
// «Ireland» con «Northern Ireland» o un equipo con su sub-21
const same = (a, b) => { const x = norm(a), y = norm(b); return !!x && x === y }
const teamNames = t => [t?.displayName, t?.shortDisplayName, t?.name, t?.location].filter(Boolean)

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (respaldo de marcadores)' }, signal: AbortSignal.timeout(12000) })
  if (!r.ok) throw new Error('ESPN ' + r.status)
  return r.json()
}
const ymd = ms => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '')

// partidos de ESPN de esas fechas (UTC); si "all" falla, liga por liga (los fallos de una liga no frenan las demás)
async function events(dates) {
  const out = new Map()
  const add = d => {
    const byId = new Map(); for (const l of d?.leagues || []) { if (l?.id != null) byId.set(String(l.id), l); const m = /l:(\d+)/.exec(String(l?.uid || '')); if (m) byId.set(m[1], l) }
    const only = d?.leagues?.length === 1 ? d.leagues[0] : null
    for (const e of d?.events || []) if (e?.id) {
      const lg = byId.get((/l:(\d+)/.exec(String(e.uid || '')) || [])[1]) || e.league || only
      if (lg && !e._lg) { e._lg = lg.name || ''; e._zone = lg.midsizeName || ''; e._slug = lg.slug || '' }
      out.set(e.id, e)
    }
  }
  for (const day of dates) {
    try { add(await getJSON(`${BASE}/all/scoreboard?dates=${day}&limit=1000`)) } catch { /* se prueba liga por liga */ }
  }
  if (!out.size) for (const lg of LEAGUES) for (const day of dates) { try { add(await getJSON(`${BASE}/${lg}/scoreboard?dates=${day}`)) } catch { /* esa liga no está */ } }
  return [...out.values()]
}

// estado de ESPN → código que ya usa la web (el de API-Football)
function status(c) {
  const st = c?.status || {}, ty = st.type || {}, name = String(ty.name || ''), clock = parseInt(String(st.displayClock || '').replace(/[^\d].*$/, '')) || 0
  if (/POSTPONED/.test(name)) return { short: 'PST', elapsed: null }
  if (/CANCEL|ABANDON/.test(name)) return { short: 'CANC', elapsed: null }
  if (ty.state === 'pre') return { short: 'NS', elapsed: null }
  if (ty.state === 'post' || ty.completed) return { short: /PEN|SHOOTOUT/.test(name) ? 'PEN' : /AET|EXTRA/.test(name) ? 'AET' : 'FT', elapsed: 90 }
  if (ty.state === 'in') {
    if (/HALFTIME/.test(name)) return { short: 'HT', elapsed: 45 }
    const p = +st.period || 1
    return { short: p >= 5 ? 'P' : p >= 3 ? 'ET' : p === 2 ? '2H' : '1H', elapsed: clock || null }
  }
  return null
}

// goles y tarjetas de ESPN → jugadas en el formato de la web, con los nombres de equipo que la web ya tiene
function plays(c, idHome, idAway, homeName, awayName) {
  const out = []
  for (const d of c?.details || []) {
    const tid = String(d?.team?.id || ''), team = tid && tid === idHome ? homeName : tid && tid === idAway ? awayName : null
    if (!team) continue
    const txt = String(d?.type?.text || ''), min = parseInt(String(d?.clock?.displayValue || '')) || 0, player = d?.athletesInvolved?.[0]?.displayName || ''
    const base = { time: { elapsed: min }, team: { name: team }, player: { name: player } }
    if (d.scoringPlay || /goal/i.test(txt)) out.push({ ...base, type: 'Goal', detail: d.ownGoal || /own/i.test(txt) ? 'Own Goal' : d.penaltyKick || /penalty/i.test(txt) ? 'Penalty' : 'Normal Goal' })
    else if (d.redCard || /red card/i.test(txt)) out.push({ ...base, type: 'Card', detail: 'Red Card' })
    else if (d.yellowCard || /yellow card/i.test(txt)) out.push({ ...base, type: 'Card', detail: 'Yellow Card' })
  }
  return out
}

// old = partido tal como está guardado en la web. Devuelve el partido actualizado, o null si ESPN no lo tiene con seguridad.
function match(old, list) {
  const ko = (old?.fixture?.timestamp || 0) * 1000, h = old?.teams?.home?.name, a = old?.teams?.away?.name
  if (!ko || !h || !a) return null
  for (const e of list) {
    const c = e?.competitions?.[0], t = Date.parse(e?.date || c?.date || '')
    if (!c || !(Math.abs(t - ko) <= 3 * 3600e3)) continue // misma hora (±3 h)
    const H = (c.competitors || []).find(x => x.homeAway === 'home'), A = (c.competitors || []).find(x => x.homeAway === 'away')
    if (!H || !A) continue
    // los DOS equipos deben coincidir (en su lado, o al revés si una fuente invierte local y visitante)
    const direct = teamNames(H.team).some(n => same(n, h)) && teamNames(A.team).some(n => same(n, a))
    const swap = !direct && teamNames(H.team).some(n => same(n, a)) && teamNames(A.team).some(n => same(n, h))
    if (!direct && !swap) continue
    const s = status(c); if (!s) return null
    const gH = parseInt(H.score), gA = parseInt(A.score), [hId, aId] = [String(H.team?.id || H.id || ''), String(A.team?.id || A.id || '')]
    const goals = s.short === 'NS' ? { home: null, away: null } : direct ? { home: isNaN(gH) ? null : gH, away: isNaN(gA) ? null : gA } : { home: isNaN(gA) ? null : gA, away: isNaN(gH) ? null : gH }
    const ev = direct ? plays(c, hId, aId, h, a) : plays(c, aId, hId, h, a)
    // se copia lo guardado y solo se cambia estado, marcador y jugadas (estadio, liga, escudos e id quedan igual)
    return { ...old, fixture: { ...old.fixture, status: s }, goals, events: ev.length ? ev : (old.events || []) }
  }
  return null
}

// partido de ESPN → el formato de la web, para PUBLICARLO aunque SportAPI no lo traiga (id negativo: nunca choca con los de SportAPI)
function toFixture(e) {
  const c = e?.competitions?.[0]; if (!c || !e.id) return null
  const t = Date.parse(e.date || c.date || ''); if (isNaN(t)) return null
  const H = (c.competitors || []).find(x => x.homeAway === 'home'), A = (c.competitors || []).find(x => x.homeAway === 'away'); if (!H || !A) return null
  const s = status(c); if (!s) return null
  const hn = H.team?.displayName, an = A.team?.displayName; if (!hn || !an) return null
  const v = c.venue || {}, gH = parseInt(H.score), gA = parseInt(A.score), hId = String(H.team?.id || ''), aId = String(A.team?.id || '')
  const ev = plays(c, hId, aId, hn, an)
  return { fixture: { id: -Number(e.id), timestamp: Math.floor(t / 1000), status: s, venue: { name: v.fullName || '', city: v.address?.city || '' } },
    league: { id: 0, slug: e._slug || '', name: e._lg || c.league?.name || e.league?.name || 'Fútbol', country: v.address?.country || e._zone || '' },
    teams: { home: { name: hn, logo: '', src: H.team?.logo || H.team?.logos?.[0]?.href || '', id: hId }, away: { name: an, logo: '', src: A.team?.logo || A.team?.logos?.[0]?.href || '', id: aId } },
    goals: s.short === 'NS' ? { home: null, away: null } : { home: isNaN(gH) ? null : gH, away: isNaN(gA) ? null : gA }, events: ev }
}

// ligas y torneos IMPORTANTES (selecciones, copas continentales, primeras divisiones de los países grandes (las copas locales y las segundas divisiones NO: sus primeras rondas traen equipos pequeños)). Un nombre que no exista da 404 y se ignora.
const TOP = ['fifa.world', 'fifa.friendly', 'fifa.worldq.uefa', 'fifa.worldq.conmebol', 'fifa.worldq.concacaf', 'fifa.worldq.afc', 'fifa.worldq.caf', 'fifa.worldq.ofc', 'fifa.cwc', 'fifa.intercontinental.cup',
  'uefa.nations', 'uefa.euro', 'uefa.euroq', 'conmebol.america', 'concacaf.gold', 'concacaf.nations.league', 'concacaf.nations.league_qual', 'caf.nations', 'caf.nations_qual', 'afc.asian.cup', 'afc.cup',
  'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'uefa.super_cup', 'conmebol.libertadores', 'conmebol.sudamericana', 'conmebol.recopa', 'concacaf.champions', 'afc.champions',
  'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'por.1', 'ned.1', 'bel.1', 'tur.1', 'sco.1', 'rus.1', 'gre.1',
  'usa.1', 'mex.1', 'arg.1', 'bra.1', 'col.1', 'chi.1', 'per.1', 'uru.1', 'ecu.1', 'par.1', 'bol.1', 'ven.1', 'sau.1', 'jpn.1', 'kor.1', 'chn.1', 'aus.1']
async function topIds(dates) {
  const ids = new Map(), jobs = []
  for (const lg of TOP) for (const day of dates) jobs.push([lg, day])
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(async ([lg, day]) => { try { for (const e of (await getJSON(`${BASE}/${lg}/scoreboard?dates=${day}`))?.events || []) if (e?.id) ids.set(String(e.id), lg) } catch { /* esa liga no está */ } }))
  return ids
}

// todas las ligas de fútbol que ESPN tiene (lista oficial de su servicio de datos); si no responde, queda la lista de abajo y las que se vayan viendo en los partidos
async function leagueSlugs() {
  const d = await getJSON((process.env.ESPN_CORE_URL || 'https://sports.core.api.espn.com/v2/sports/soccer') + '/leagues?limit=1000'), out = []
  for (const it of d?.items || []) { const m = /\/leagues\/([^/?]+)/.exec(String(it?.$ref || '')); if (m) out.push(m[1]) }
  return out
}
async function leagueName(slug) { const d = await getJSON((process.env.ESPN_CORE_URL || 'https://sports.core.api.espn.com/v2/sports/soccer') + '/leagues/' + encodeURIComponent(slug)); return String(d?.name || d?.shortName || '') }
// equipos de una liga (para ocultar equipos uno por uno)
async function teamsOf(slug) {
  const d = await getJSON(`${BASE}/${encodeURIComponent(slug)}/teams?limit=200`), out = []
  for (const sp of d?.sports || []) for (const lg of sp?.leagues || []) for (const t of lg?.teams || []) { const x = t?.team || t; if (x?.displayName) out.push({ id: String(x.id || ''), name: String(x.displayName), logo: x.logos?.[0]?.href || '' }) }
  return out
}

// liga de cada partido: se pide el marcador de cada liga por separado (ESPN dice la liga seguro en esa respuesta). Devuelve Map(idPartido → { slug, name }).
async function sweep(slugs, dates) {
  const out = new Map(), jobs = []
  for (const lg of slugs) for (const day of dates) jobs.push([lg, day])
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(async ([lg, day]) => {
    try { const d = await getJSON(`${BASE}/${lg}/scoreboard?dates=${day}`), name = String(d?.leagues?.[0]?.name || ''); for (const e of d?.events || []) if (e?.id) out.set(String(e.id), { slug: lg, name }) } catch { /* esa liga no está */ }
  }))
  return out
}
// estadísticas y alineaciones de un partido (posesión, tiros, córners, faltas, tarjetas…), tal como las manda ESPN
async function summary(slug, id) {
  const d = await getJSON(`${BASE}/${encodeURIComponent(slug || 'all')}/summary?event=${encodeURIComponent(id)}`)
  const side = {}; for (const c of d?.header?.competitions?.[0]?.competitors || []) side[String(c.team?.id || c.id)] = c.homeAway
  const teams = d?.boxscore?.teams || [], pick = k => teams.find(t => (t.homeAway || side[String(t.team?.id)]) === k) || teams[k === 'home' ? 0 : 1]
  const H = pick('home'), A = pick('away'), stats = []
  if (H && A) for (const x of H.statistics || []) { const y = (A.statistics || []).find(z => z.name === x.name); if (y) stats.push({ k: x.name, l: x.label || x.name, h: String(x.displayValue ?? ''), a: String(y.displayValue ?? '') }) }
  const lineups = {}
  for (const r of d?.rosters || []) { const k = r.homeAway; if (k !== 'home' && k !== 'away') continue
    lineups[k] = { formation: String(r.formation || ''), players: (r.roster || []).map(p => ({ n: String(p.jersey || ''), name: String(p.athlete?.displayName || ''), pos: String(p.position?.abbreviation || ''), st: !!p.starter })).filter(p => p.name).slice(0, 30) } }
  return { stats, lineups, attendance: +d?.gameInfo?.attendance || 0 }
}

module.exports = { events, match, toFixture, topIds, sweep, summary, leagueSlugs, leagueName, teamsOf, TOP, ymd, _test: { status, plays, same } }

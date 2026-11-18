// Completar con API-Football los partidos de fútbol donde ESPN no trae detalle (alineaciones, estadísticas, goles y tarjetas).
// Funciones puras (sin red ni base de datos): se pueden probar solas. El control de cupo y las consultas viven en sports.js.

// nombres distintos de la misma selección o club entre ESPN y API-Football
const ALIAS = [[/\bunited states( of america)?\b|\busa\b|\bus\b/g, 'usa'], [/\bst\.? /g, 'saint '], [/\bkorea republic\b|\brepublic of korea\b/g, 'south korea'], [/\bir iran\b/g, 'iran'], [/\bturkiye\b/g, 'turkey'], [/\bczech republic\b/g, 'czechia'], [/\bcote d.?ivoire\b/g, 'ivory coast'], [/\brepublic of ireland\b/g, 'ireland'], [/\bbosnia and herzegovina\b|\bbosnia-herzegovina\b/g, 'bosnia herzegovina'], [/\bcuracao\b/g, 'curacao'], [/\bdr congo\b|\bcongo dr\b/g, 'congo dr'], [/\bkyrgyz republic\b/g, 'kyrgyzstan'], [/\bchina pr\b/g, 'china'], [/\bsaint vincent and the grenadines\b|\bsaint vincent \/ grenadines\b|\bsaint vincent and grenadines\b/g, 'saint vincent grenadines']]
const norm = s => { let x = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); for (const [re, to] of ALIAS) x = x.replace(re, to); return x.replace(/\b(fc|cf|club|deportivo|de|sc|ac|cd|fk|sk|afc)\b/g, ' ').replace(/[^a-z0-9]/g, '') }
const sameTeam = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length > 4 && y.length > 4 && (x.includes(y) || y.includes(x)))) }

// ¿el detalle guardado está vacío? (ESPN no publicó nada útil)
function isEmpty(d) {
  if (!d) return true
  const pl = x => (x?.players || []).length
  return !(d.stats?.length) && !pl(d.lineups?.home) && !pl(d.lineups?.away) && !(d.evs?.length)
}

// busca en la lista de partidos del día de API-Football el que corresponde a nuestro partido (equipos y hora cercana)
function findFixture(list, row) {
  let best = null, bestDt = Infinity
  for (const f of list || []) {
    const h = f.teams?.home?.name, a = f.teams?.away?.name, ts = (f.fixture?.timestamp || 0) * 1000
    const dt = Math.abs(ts - row.kickoff); if (dt > 4 * 3600e3) continue
    const direct = sameTeam(h, row.home) && sameTeam(a, row.away), swapped = sameTeam(h, row.away) && sameTeam(a, row.home)
    if ((direct || swapped) && dt < bestDt) { best = { id: f.fixture?.id, swapped }; bestDt = dt }
  }
  return best
}

const STAT = {   // tipo de API-Football → [clave que ya usa la web, etiqueta en español]
  'Ball Possession': ['possessionPct', 'Posesión (%)'], 'Total Shots': ['totalShots', 'Tiros'], 'Shots on Goal': ['shotsOnTarget', 'Tiros a puerta'], 'Blocked Shots': ['blockedShots', 'Tiros bloqueados'],
  'Corner Kicks': ['wonCorners', 'Córners'], 'Fouls': ['foulsCommitted', 'Faltas'], 'Yellow Cards': ['yellowCards', 'Tarjetas amarillas'], 'Red Cards': ['redCards', 'Tarjetas rojas'],
  'Offsides': ['offsides', 'Fuera de lugar'], 'Goalkeeper Saves': ['saves', 'Atajadas'], 'Total passes': ['totalPasses', 'Pases'], 'Passes accurate': ['accuratePasses', 'Pases precisos'], 'Passes %': ['passPct', 'Precisión de pases (%)'],
  'Shots off Goal': ['afShotsOff', 'Tiros fuera'], 'Shots insidebox': ['afInBox', 'Tiros dentro del área'], 'Shots outsidebox': ['afOutBox', 'Tiros fuera del área'], 'expected_goals': ['afXg', 'Goles esperados (xG)']
}
const val = v => v == null ? '0' : String(v)
const photo = (p) => { const u = String(p?.photo || ''); if (/^https:\/\/media\.api-sports\.io\//.test(u)) return u; return p?.id ? `https://media.api-sports.io/football/players/${+p.id}.png` : '' }

// respuesta de /fixtures?id=… → el mismo formato de detalle que guarda ESPN { v, stats, lineups, subs, evs, rec, attendance, src }
function toDetail(resp, swapped) {
  const f = resp || {}, hId = f.teams?.home?.id, side = tid => (tid === hId) !== !!swapped ? 'home' : 'away'
  const bySide = {}; for (const t of f.statistics || []) bySide[side(t.team?.id)] = t
  const stats = []
  if (bySide.home && bySide.away) for (const x of bySide.home.statistics || []) {
    const y = (bySide.away.statistics || []).find(z => z.type === x.type), m = STAT[x.type]; if (!y || !m) continue
    stats.push({ k: m[0], l: m[1], h: val(x.value), a: val(y.value) })
  }
  const photos = {}; for (const t of f.players || []) for (const p of t.players || []) if (p.player?.id) photos[p.player.id] = photo(p.player)
  const lineups = {}
  for (const l of f.lineups || []) {
    const k = side(l.team?.id), mapP = (p, st) => { const g = String(p.player?.grid || '').split(':'), fp = g.length === 2 ? (+g[0] || 0) * 10 + (+g[1] || 0) : 0; return { n: String(p.player?.number ?? ''), name: String(p.player?.name || ''), pos: String(p.player?.pos || ''), st, ph: photos[p.player?.id] || photo(p.player), fp, ti: '', to: '' } }
    lineups[k] = { formation: String(l.formation || ''), players: [...(l.startXI || []).map(p => mapP(p, true)), ...(l.substitutes || []).map(p => mapP(p, false))].filter(p => p.name).slice(0, 30) }
  }
  const evs = [], subs = []
  for (const e of f.events || []) {
    const t = e.time?.elapsed || 0, x = e.time?.extra || 0, team = String(e.team?.name || '')
    if (e.type === 'Goal') evs.push({ time: { elapsed: t, extra: x }, type: 'Goal', detail: e.detail === 'Own Goal' ? 'Own Goal' : e.detail === 'Penalty' ? 'Penalty' : e.detail === 'Missed Penalty' ? 'Missed Penalty' : 'Normal Goal', team: { name: team }, player: { name: String(e.player?.name || '') } })
    else if (e.type === 'Card') evs.push({ time: { elapsed: t, extra: x }, type: 'Card', detail: /red/i.test(e.detail) ? 'Red Card' : 'Yellow Card', team: { name: team }, player: { name: String(e.player?.name || '') } })
    else if (e.type === 'subst') subs.push({ t, team, inn: String(e.assist?.name || ''), out: String(e.player?.name || '') })
  }
  // minuto en que entra y sale cada jugador (para la cancha)
  for (const s of subs) for (const k of ['home', 'away']) for (const p of lineups[k]?.players || []) { if (s.out && p.name === s.out && p.st) p.to = String(s.t); if (s.inn && p.name === s.inn && !p.st) p.ti = String(s.t) }
  return { v: 2, src: 'af', stats, lineups, subs: subs.slice(0, 30), evs: evs.slice(0, 40), rec: {}, attendance: 0 }
}

module.exports = { isEmpty, findFixture, toDetail, sameTeam }

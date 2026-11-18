// Pronósticos con puntos (sin dinero): el usuario predice un partido de fútbol antes de que empiece y gana puntos por cada acierto.
// Los puntos se reparten solos cuando el partido termina, con los datos de ESPN guardados. Un mercado sin datos fiables se anula (no suma ni resta).
const POINTS = { res: 3, score: 10, tg: 2, tc: 3, pen: 4, red: 4 }
const LABEL = { res: 'Resultado', score: 'Marcador exacto', tg: 'Goles (2,5)', tc: 'Tarjetas (4,5)', pen: 'Penal', red: 'Tarjeta roja' }
const VOID_ST = ['PST', 'CANC', 'ABD', 'AWD', 'WO']

module.exports = function pred({ db, S, now, DONE, LIVE, detail }) {
  db.exec(`CREATE TABLE IF NOT EXISTS pred (uid INTEGER NOT NULL, mid INTEGER NOT NULL, pick TEXT NOT NULL, at INTEGER NOT NULL, ko INTEGER NOT NULL, pts INTEGER NOT NULL DEFAULT 0, hit TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, mid));
    CREATE INDEX IF NOT EXISTS pred_open ON pred(done, mid); CREATE INDEX IF NOT EXISTS pred_ko ON pred(done, ko, uid)`)
  const on = () => S().pronosOn !== false && S().partidosOn !== false

  // ---- validar lo que manda el usuario (nunca se confía en el navegador) ----
  const goal = v => { const n = +v; return Number.isInteger(n) && n >= 0 && n <= 20 ? n : null }
  function clean(p) {
    const o = {}; p = p && typeof p === 'object' ? p : {}
    if (['H', 'D', 'A'].includes(p.res)) o.res = p.res
    const gh = goal(p.gh), ga = goal(p.ga); if (gh !== null && ga !== null && p.gh !== '' && p.ga !== '') { o.gh = gh; o.ga = ga }
    if (['o', 'u'].includes(p.tg)) o.tg = p.tg
    if (['o', 'u'].includes(p.tc)) o.tc = p.tc
    if (['s', 'n'].includes(p.pen)) o.pen = p.pen
    if (['s', 'n'].includes(p.red)) o.red = p.red
    return o
  }
  const open = r => r && r.sport === 'futbol' && r.kickoff > now() && !LIVE.includes(r.status) && !DONE.includes(r.status) && !VOID_ST.includes(r.status)

  const qMatch = db.prepare('SELECT * FROM match_archive WHERE id = ?'), qGet = db.prepare('SELECT pick, pts, hit, done FROM pred WHERE uid = ? AND mid = ?')
  const qPut = db.prepare('INSERT INTO pred (uid, mid, pick, at, ko) VALUES (?, ?, ?, ?, ?) ON CONFLICT(uid, mid) DO UPDATE SET pick = excluded.pick, at = excluded.at, ko = excluded.ko WHERE pred.done = 0')
  const qDist = db.prepare("SELECT json_extract(pick, '$.res') AS r, COUNT(*) AS n FROM pred WHERE mid = ? GROUP BY r")

  function get(uid, mid) {
    const r = qMatch.get(mid); if (!r || r.sport !== 'futbol') return null
    const row = uid ? qGet.get(uid, mid) : null
    let pick = {}, hit = {}; try { pick = JSON.parse(row?.pick || '{}') } catch { /* nada */ } try { hit = JSON.parse(row?.hit || '{}') } catch { /* nada */ }
    const d = { H: 0, D: 0, A: 0 }; for (const x of qDist.all(mid)) if (d[x.r] !== undefined) d[x.r] = x.n
    return { on: on(), open: open(r), ko: r.kickoff, pick, hit, pts: row?.pts || 0, done: !!row?.done, dist: d, points: POINTS, label: LABEL }
  }
  const last = new Map()   // un guardado por segundo y usuario como máximo
  function put(uid, mid, raw) {
    if (!on()) return { code: 403, error: 'Los pronósticos están apagados.' }
    const t = now(); if (t - (last.get(uid) || 0) < 1000) return { code: 429, error: 'Más despacio, intenta otra vez.' }; last.set(uid, t); if (last.size > 5000) last.clear()
    const r = qMatch.get(mid); if (!r || r.sport !== 'futbol') return { code: 404, error: 'Partido no encontrado.' }
    if (!open(r)) return { code: 409, error: 'Este partido ya empezó: no se pueden cambiar los pronósticos.' }
    const pick = clean(raw); if (!Object.keys(pick).length) return { code: 400, error: 'Elige al menos una opción.' }
    qPut.run(uid, mid, JSON.stringify(pick), t, r.kickoff)
    return { ok: true, pick }
  }

  // ---- repartir puntos ----
  const evList = (r, d) => {
    let l = []; try { l = d?.evs?.length ? d.evs.map(e => ({ type: e.type, d: e.detail || '' })) : JSON.parse(r.ev || '[]').map(e => ({ type: e.type, d: e.d || '' })) } catch { /* nada */ }
    return l
  }
  async function settleMatch(r, picks) {
    const done = DONE.includes(r.status); if (!done && !VOID_ST.includes(r.status)) return false
    const voidAll = !done || r.gh == null || r.ga == null
    let d = null; if (!voidAll) { try { d = await detail(r) } catch { /* sin detalle */ } }
    const ev = voidAll ? [] : evList(r, d), goals = ev.filter(e => e.type === 'Goal').length, cards = ev.filter(e => e.type === 'Card').length
    const total = (r.gh || 0) + (r.ga || 0)
    // tarjetas, penales y rojas solo se juzgan si ESPN publicó el partido completo (todos los goles + estadísticas o alguna tarjeta)
    const full = !voidAll && goals === total && (cards > 0 || !!d?.stats?.length)
    const truth = voidAll ? {} : {
      res: r.gh > r.ga ? 'H' : r.gh < r.ga ? 'A' : 'D', gh: r.gh, ga: r.ga, tg: total > 2.5 ? 'o' : 'u',
      ...(full ? { tc: cards > 4.5 ? 'o' : 'u', pen: ev.some(e => e.type === 'Goal' && /penalty/i.test(e.d)) ? 's' : 'n', red: ev.some(e => e.type === 'Card' && /red/i.test(e.d)) ? 's' : 'n' } : {})
    }
    const upd = db.prepare('UPDATE pred SET pts = ?, hit = ?, done = 1 WHERE uid = ? AND mid = ? AND done = 0')
    for (const p of picks) {
      let pk = {}; try { pk = JSON.parse(p.pick) } catch { /* nada */ }
      const hit = {}; let pts = 0
      for (const k of ['res', 'tg', 'tc', 'pen', 'red']) if (pk[k] !== undefined) { if (truth[k] === undefined) hit[k] = -1; else { hit[k] = pk[k] === truth[k] ? 1 : 0; if (hit[k]) pts += POINTS[k] } }
      if (pk.gh !== undefined) { if (truth.gh === undefined) hit.score = -1; else { hit.score = pk.gh === truth.gh && pk.ga === truth.ga ? 1 : 0; if (hit.score) pts += POINTS.score } }
      upd.run(pts, JSON.stringify(hit), p.uid, r.id)
    }
    return true
  }
  let busy = false
  async function settle() {
    if (busy || !on()) return 0; busy = true; let n = 0
    try {
      const ids = db.prepare('SELECT DISTINCT mid FROM pred WHERE done = 0 AND ko < ? LIMIT 40').all(now()).map(x => x.mid)
      for (const mid of ids) {
        const r = qMatch.get(mid)
        if (!r) { db.prepare('UPDATE pred SET done = 1 WHERE mid = ? AND done = 0').run(mid); continue }   // el partido ya no está guardado
        if (r.kickoff < now() - 9 * 24 * 3600e3 && !DONE.includes(r.status)) { db.prepare("UPDATE pred SET done = 1, hit = '{}' WHERE mid = ? AND done = 0").run(mid); continue }
        if (await settleMatch(r, db.prepare('SELECT uid, pick FROM pred WHERE mid = ? AND done = 0').all(mid))) n++
      }
    } catch (e) { console.error('[pronósticos]', e.message) } finally { busy = false }
    return n
  }
  const tm = setInterval(() => { settle() }, 120e3); tm.unref()
  setTimeout(() => { settle(); try { db.exec('DELETE FROM pred WHERE uid NOT IN (SELECT id FROM users)') } catch { /* nada */ } }, 40e3).unref()

  // ---- ranking ----
  const weekStart = () => { const t = now() - 5 * 3600e3, d = new Date(t), back = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) + 5 * 3600e3 }
  const rankCache = new Map()
  function top(period) {
    const w = period === 'week' ? 'week' : 'all', c = rankCache.get(w); if (c && now() - c.t < 30e3) return c.v
    const since = w === 'week' ? weekStart() : 0
    const v = db.prepare(`SELECT p.uid, SUM(p.pts) AS pts, COUNT(*) AS n, SUM(CASE WHEN p.pts > 0 THEN 1 ELSE 0 END) AS hits, u.name, u.handle, u.avatar, u.hue
      FROM pred p JOIN users u ON u.id = p.uid WHERE p.done = 1 AND p.ko >= ? AND p.hit != '' GROUP BY p.uid HAVING n > 0 ORDER BY pts DESC, hits DESC, n ASC, p.uid ASC LIMIT 50`).all(since)
    rankCache.set(w, { t: now(), v }); return v
  }
  function mine(uid) {
    const rows = db.prepare('SELECT p.mid, p.pick, p.pts, p.hit, p.done, m.home, m.away, m.gh, m.ga, m.kickoff, m.status FROM pred p JOIN match_archive m ON m.id = p.mid WHERE p.uid = ? ORDER BY p.ko DESC LIMIT 30').all(uid)
    const tot = db.prepare('SELECT COALESCE(SUM(pts), 0) AS pts, COUNT(*) AS n, COALESCE(SUM(CASE WHEN pts > 0 THEN 1 ELSE 0 END), 0) AS hits FROM pred WHERE uid = ? AND done = 1 AND hit != \'\'').get(uid)
    const ws = db.prepare('SELECT COALESCE(SUM(pts), 0) AS pts FROM pred WHERE uid = ? AND done = 1 AND ko >= ?').get(uid, weekStart())
    return { total: tot, week: ws.pts, rows: rows.map(r => { let pick = {}, hit = {}; try { pick = JSON.parse(r.pick) } catch { /* nada */ } try { hit = JSON.parse(r.hit || '{}') } catch { /* nada */ } return { mid: r.mid, home: r.home, away: r.away, gh: r.gh, ga: r.ga, ko: r.kickoff, st: r.status, pick, hit, pts: r.pts, done: !!r.done } }) }
  }
  return { get, put, top, mine, settle, on, POINTS, LABEL, weekStart }
}

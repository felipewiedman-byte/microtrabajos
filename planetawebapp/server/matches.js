// Archivo y páginas de resultados: cada partido que pasa por la web se guarda y queda como página propia (permanente), fuera del mapa.
//   /partidos                 hoy: en vivo, resultados y próximos, agrupados por liga, con enlaces a los últimos días
//   /partidos/AAAA-MM-DD      todos los partidos de ese día
//   /partido/e123-equipo-vs-equipo   el partido: marcador, goles, tarjetas, estadio (e = ESPN, s = SportAPI)
//   /liga/eng.1               resultados recientes y tabla de posiciones de esa liga
// HTML generado en el servidor (rápido, sin JavaScript, bueno para buscadores). Todo texto externo se escapa.
module.exports = function matches({ db, S, now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS match_archive (
    id INTEGER PRIMARY KEY, mkey TEXT UNIQUE, day TEXT NOT NULL, kickoff INTEGER NOT NULL, status TEXT,
    league TEXT, slug TEXT, country TEXT, venue TEXT, city TEXT, home TEXT, away TEXT, hl TEXT, al TEXT,
    gh INTEGER, ga INTEGER, el INTEGER, ev TEXT, updated INTEGER);
    CREATE INDEX IF NOT EXISTS match_archive_day ON match_archive(day, kickoff);
    CREATE INDEX IF NOT EXISTS match_archive_slug ON match_archive(slug, kickoff);`)
  const LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'], DONE = ['FT', 'AET', 'PEN', 'AWD', 'WO']
  const tz = () => S().dailyTZ || 'America/Bogota'
  const dayOf = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: tz() })
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const img = u => /^(https:\/\/|\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$)/.test(u || '') ? u : ''
  const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  const matchUrl = r => `/partido/${r.id < 0 ? 'e' + -r.id : 's' + r.id}-${slugify(r.home + ' vs ' + r.away)}`
  const hhmm = ms => new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz() })
  const longDay = day => new Date(day + 'T12:00:00Z').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

  // ---- guardar ----
  const up = db.prepare(`INSERT INTO match_archive (id, mkey, day, kickoff, status, league, slug, country, venue, city, home, away, hl, al, gh, ga, el, ev, updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mkey) DO UPDATE SET status = excluded.status, league = CASE WHEN excluded.league != '' THEN excluded.league ELSE match_archive.league END,
      slug = CASE WHEN excluded.slug != '' THEN excluded.slug ELSE match_archive.slug END, country = CASE WHEN excluded.country != '' THEN excluded.country ELSE match_archive.country END,
      venue = CASE WHEN excluded.venue != '' THEN excluded.venue ELSE match_archive.venue END, city = CASE WHEN excluded.city != '' THEN excluded.city ELSE match_archive.city END,
      hl = CASE WHEN excluded.hl != '' THEN excluded.hl ELSE match_archive.hl END, al = CASE WHEN excluded.al != '' THEN excluded.al ELSE match_archive.al END,
      gh = excluded.gh, ga = excluded.ga, el = excluded.el, ev = CASE WHEN length(excluded.ev) > 2 THEN excluded.ev ELSE match_archive.ev END, kickoff = excluded.kickoff, day = excluded.day, updated = excluded.updated`)
  // f = partido en el formato interno de la web; mkey = día + equipos (así el mismo partido de ESPN y de SportAPI es un solo registro)
  function save(f, mkey) {
    if (S().partidosOn === false) return
    const ko = f.fixture.timestamp * 1000, g = f.goals || {}
    const ev = JSON.stringify((f.events || []).slice(-60).map(e => ({ t: e.time?.elapsed || 0, x: e.time?.extra || 0, type: e.type || '', d: e.detail || '', team: e.team?.name || '', p: e.player?.name || '', a: e.assist?.name || '' })))
    up.run(f.fixture.id, mkey, dayOf(ko), ko, f.fixture.status?.short || '', String(f.league?.name === 'Fútbol' ? '' : f.league?.name || ''), String(f.league?.slug || ''), String(f.league?.country || ''),
      String(f.fixture.venue?.name || ''), String(f.fixture.venue?.city || ''), f.teams.home.name, f.teams.away.name, img(f.teams.home.logo), img(f.teams.away.logo), g.home ?? null, g.away ?? null, f.fixture.status?.elapsed ?? null, ev, now())
  }
  // un partido que quedó «en juego» sin que llegara el dato final (el proveedor dejó de mandarlo) se da por terminado
  function finalizeOld() { db.prepare(`UPDATE match_archive SET status = 'FT' WHERE status IN (${LIVE.map(() => '?').join(',')}) AND kickoff < ?`).run(...LIVE, now() - 5 * 3600e3) }
  function purgeOld() { const days = Math.max(7, Math.min(3650, +S().archiveDays || 90)); db.prepare('DELETE FROM match_archive WHERE kickoff < ?').run(now() - days * 864e5) }
  // al ocultar una liga o un equipo desde el panel también salen del archivo
  function hide(slugs, teamsNorm, norm) { let n = 0; for (const r of db.prepare('SELECT id, slug, home, away FROM match_archive').all()) if ((r.slug && slugs.has(r.slug)) || teamsNorm.has(norm(r.home)) || teamsNorm.has(norm(r.away))) { db.prepare('DELETE FROM match_archive WHERE id = ?').run(r.id); n++ } return n }
  setTimeout(() => { try { finalizeOld(); purgeOld() } catch { /* nada */ } }, 20e3).unref()
  setInterval(() => { try { finalizeOld(); purgeOld() } catch { /* nada */ } }, 3600e3).unref()

  // ---- presentación ----
  const stLabel = r => LIVE.includes(r.status) ? (r.status === 'HT' ? 'Entretiempo' : (r.el ? r.el + "'" : 'En vivo')) : DONE.includes(r.status) ? (r.status === 'PEN' ? 'Final (penales)' : r.status === 'AET' ? 'Final (prórroga)' : 'Final') : r.status === 'PST' ? 'Aplazado' : hhmm(r.kickoff)
  const isLive = r => LIVE.includes(r.status), isDone = r => DONE.includes(r.status)
  const score = r => (r.gh == null || r.ga == null) ? 'vs' : `${r.gh} - ${r.ga}`
  function shell({ title, desc, path, body, head = '', noindex = false }) {
    const st = S(), c = st.colors || {}, origin = '__ORIGIN__', name = esc(st.name || 'PLANETA'), logo = img(st.logoDark || st.favicon)
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${name}</title><meta name="description" content="${esc(desc).slice(0, 300)}">${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<link rel="canonical" href="${origin}${esc(path)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${name}"><meta name="theme-color" content="${esc(c.bg || '#0a0f1a')}">${head}
<style>:root{--bg:${esc(c.bg || '#0a0f1a')};--sf:${esc(c.surface || '#111b2e')};--tx:${esc(c.text || '#eef1f4')};--mu:${esc(c.muted || '#8a94a0')};--ac:${esc(c.accent || '#5cc8b0')};--lv:${esc(c.live || '#e5484d')}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}a{color:inherit;text-decoration:none}
.w{max-width:860px;margin:0 auto;padding:0 14px 40px}header{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.08)}header img{height:30px;width:auto}header b{font-size:18px}header .sp{flex:1}
.btn{display:inline-block;padding:8px 14px;border-radius:999px;background:var(--ac);color:#0b0e12;font-weight:700;font-size:14px}.sec{background:var(--sf);color:var(--tx)}
h1{font-size:24px;margin:20px 0 4px}h2{font-size:16px;margin:22px 0 8px;color:var(--ac)}p.mu,.mu{color:var(--mu)}
.days{display:flex;gap:8px;overflow-x:auto;padding:6px 0 2px}.days a{flex:none;padding:6px 12px;border-radius:999px;background:var(--sf);font-size:13px}.days a.on{background:var(--ac);color:#0b0e12;font-weight:700}
.lg{background:var(--sf);border-radius:14px;margin:10px 0;overflow:hidden}.lg>h3{margin:0;padding:10px 14px;font-size:13px;color:var(--mu);font-weight:600;border-bottom:1px solid rgba(255,255,255,.06)}.lg>h3 a{color:var(--tx)}
.m{display:grid;grid-template-columns:62px 1fr 56px 1fr;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.05)}.m:last-child{border-bottom:0}.m:hover{background:rgba(255,255,255,.04)}
.m .t{font-size:12px;color:var(--mu)}.m .t.lv{color:var(--lv);font-weight:700}.m .tm{display:flex;align-items:center;gap:8px;min-width:0}.m .tm span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.m .tm.a{justify-content:flex-end;text-align:right}.m img{width:22px;height:22px;object-fit:contain;flex:none}
.m .s{text-align:center;font-weight:800;font-variant-numeric:tabular-nums}
.big{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;text-align:center;background:var(--sf);border-radius:16px;padding:22px 12px;margin:14px 0}.big img{width:64px;height:64px;object-fit:contain}.big .n{font-weight:700;margin-top:6px}.big .sc{font-size:38px;font-weight:800;font-variant-numeric:tabular-nums}.big .st{font-size:13px;color:var(--mu)}.big .st.lv{color:var(--lv);font-weight:700}
.ev{list-style:none;margin:0;padding:0}.ev li{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:10px}.ev b{width:46px;color:var(--mu);font-weight:600}
.tb{width:100%;border-collapse:collapse;background:var(--sf);border-radius:14px;overflow:hidden;font-size:14px}.tb th,.tb td{padding:8px 6px;text-align:center}.tb th{color:var(--mu);font-weight:600;font-size:12px}.tb td:nth-child(2),.tb th:nth-child(2){text-align:left}.tb tr+tr td{border-top:1px solid rgba(255,255,255,.05)}.tb td.p{font-weight:800}
footer{margin-top:30px;color:var(--mu);font-size:13px;text-align:center}
@media(max-width:520px){.m{grid-template-columns:50px 1fr 46px 1fr;padding:9px 10px}.big .sc{font-size:30px}}</style></head>
<body><div class="w"><header>${logo ? `<a href="/"><img src="${esc(logo)}" alt="${name}"></a>` : ''}<a href="/"><b>${name}</b></a><span class="sp"></span><a class="btn sec" href="/partidos">Partidos</a><a class="btn" href="/">Ver el mapa</a></header>${body}
<footer><a href="/">← Volver al mapa</a> · <a href="/partidos">Partidos y resultados</a> · <a href="/terminos">Términos</a> · <a href="/privacidad">Privacidad</a></footer></div></body></html>`
  }
  const matchRow = r => `<a class="m" href="${esc(matchUrl(r))}"><span class="t${isLive(r) ? ' lv' : ''}">${esc(stLabel(r))}</span><span class="tm">${img(r.hl) ? `<img src="${esc(img(r.hl))}" alt="" loading="lazy">` : ''}<span>${esc(r.home)}</span></span><span class="s">${esc(score(r))}</span><span class="tm a"><span>${esc(r.away)}</span>${img(r.al) ? `<img src="${esc(img(r.al))}" alt="" loading="lazy">` : ''}</span></a>`
  function groups(rows) {
    const g = new Map()
    for (const r of rows) { const k = (r.slug || '') + '|' + (r.league || ''); if (!g.has(k)) g.set(k, { slug: r.slug, league: r.league || 'Otros partidos', country: r.country, rows: [] }); g.get(k).rows.push(r) }
    return [...g.values()].sort((a, b) => (b.rows.some(isLive) - a.rows.some(isLive)) || b.rows.length - a.rows.length || a.league.localeCompare(b.league))
  }
  const leagueBlock = g => `<section class="lg"><h3>${g.country && g.country !== g.league ? esc(g.country) + ' · ' : ''}${g.slug ? `<a href="/liga/${esc(g.slug)}">${esc(g.league)}</a>` : esc(g.league)}</h3>${g.rows.map(matchRow).join('')}</section>`
  const dayNav = (cur) => { const out = []; for (let i = 0; i < 7; i++) { const d = dayOf(now() - i * 864e5); out.push(`<a href="${i === 0 ? '/partidos' : '/partidos/' + d}" class="${d === cur ? 'on' : ''}">${i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : new Date(d + 'T12:00:00Z').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</a>`) } return `<nav class="days">${out.join('')}</nav>` }

  function dayPage(day, isToday) {
    const rows = db.prepare('SELECT * FROM match_archive WHERE day = ? ORDER BY kickoff, id').all(day)
    const live = rows.filter(isLive), rest = rows.filter(r => !isLive(r))
    const body = `<h1>${isToday ? 'Partidos de hoy' : 'Partidos del ' + esc(longDay(day))}</h1><p class="mu">${esc(longDay(day))} · ${rows.length} partido${rows.length === 1 ? '' : 's'}</p>${dayNav(day)}`
      + (live.length ? `<h2>En vivo ahora</h2>${groups(live).map(leagueBlock).join('')}` : '')
      + (rows.length ? `<h2>${live.length ? 'Resultados y próximos' : 'Resultados y partidos'}</h2>${groups(rest).map(leagueBlock).join('')}` : '<p class="mu">Todavía no hay partidos guardados para este día.</p>')
    return { status: 200, cache: isToday ? 30 : 600, html: shell({ title: isToday ? 'Partidos de hoy: resultados en vivo' : `Partidos del ${longDay(day)}: resultados`, desc: `Resultados, marcadores en vivo, goles y tarjetas de los partidos de fútbol del ${longDay(day)}.`, path: isToday ? '/partidos' : '/partidos/' + day, body, noindex: !rows.length }) }
  }
  const EVL = e => e.type === 'Goal' ? (e.d === 'Own Goal' ? 'Autogol' : e.d === 'Penalty' ? 'Gol de penal' : e.d === 'Missed Penalty' ? 'Penal fallado' : 'Gol') : e.type === 'Card' ? (/red/i.test(e.d) ? 'Tarjeta roja' : 'Tarjeta amarilla') : ''
  function matchPage(r) {
    let ev = []; try { ev = JSON.parse(r.ev || '[]').filter(e => EVL(e)) } catch { /* sin jugadas */ }
    const title = `${r.home} ${score(r) === 'vs' ? 'vs' : score(r)} ${r.away}`, canonical = matchUrl(r)
    const ld = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${r.home} vs ${r.away}`, startDate: new Date(r.kickoff).toISOString(), sport: 'Fútbol',
      eventStatus: r.status === 'PST' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled',
      homeTeam: { '@type': 'SportsTeam', name: r.home }, awayTeam: { '@type': 'SportsTeam', name: r.away } }
    if (r.venue) ld.location = { '@type': 'Place', name: r.venue, address: r.city || r.country || r.venue }
    if (r.league) ld.superEvent = { '@type': 'SportsEvent', name: r.league }
    const body = `<h1>${esc(r.home)} vs ${esc(r.away)}</h1><p class="mu">${r.league ? esc(r.league) + ' · ' : ''}${esc(longDay(r.day))}${r.venue ? ' · ' + esc(r.venue) + (r.city ? ', ' + esc(r.city) : '') : ''}</p>
<div class="big"><div>${img(r.hl) ? `<img src="${esc(img(r.hl))}" alt="${esc(r.home)}">` : ''}<div class="n">${esc(r.home)}</div></div><div><div class="sc">${esc(score(r))}</div><div class="st${isLive(r) ? ' lv' : ''}">${esc(isLive(r) ? 'EN VIVO ' + stLabel(r) : isDone(r) ? 'Final' : stLabel(r))}</div></div><div>${img(r.al) ? `<img src="${esc(img(r.al))}" alt="${esc(r.away)}">` : ''}<div class="n">${esc(r.away)}</div></div></div>
${ev.length ? `<h2>Goles y tarjetas</h2><ul class="ev">${ev.map(e => `<li><b>${esc(e.t)}${e.x ? '+' + esc(e.x) : ''}'</b><span>${esc(EVL(e))} · ${esc(e.p || e.team)}${e.p && e.team ? ' (' + esc(e.team) + ')' : ''}</span></li>`).join('')}</ul>` : '<p class="mu">Sin goles ni tarjetas registrados.</p>'}
<p>${r.slug ? `<a class="btn sec" href="/liga/${esc(r.slug)}">Tabla y resultados de ${esc(r.league || 'la liga')}</a> ` : ''}<a class="btn sec" href="${r.day === dayOf(now()) ? '/partidos' : '/partidos/' + r.day}">Todos los partidos del día</a></p>`
    return { status: 200, cache: isDone(r) ? 3600 : 30, canonical, html: shell({ title: `${title}${isDone(r) ? ' · resultado final' : isLive(r) ? ' · en vivo' : ''}`, desc: `${r.home} vs ${r.away}${r.league ? ' (' + r.league + ')' : ''}, ${longDay(r.day)}. Marcador, goles y tarjetas.`, path: canonical, body, head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` }) }
  }

  // ---- tabla de posiciones (ESPN, se pide solo cuando alguien abre la liga y se guarda 6 horas) ----
  const stCache = new Map()
  async function standings(slug) {
    const c = stCache.get(slug); if (c && now() - c.t < 6 * 3600e3) return c.v
    let v = null
    try {
      const r = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${encodeURIComponent(slug)}/standings`, { headers: { 'User-Agent': 'Mozilla/5.0 (tabla de posiciones)' }, signal: AbortSignal.timeout(8000) })
      if (r.ok) { const d = await r.json(), groups = d?.children?.length ? d.children : [d]
        v = groups.map(g => ({ name: g.name || '', rows: (g.standings?.entries || []).map(e => { const s = {}; for (const x of e.stats || []) s[x.name] = x.value; return { team: e.team?.displayName || '', logo: img(e.team?.logos?.[0]?.href), pj: s.gamesPlayed, g: s.wins, e: s.ties ?? s.draws, p: s.losses, gf: s.pointsFor, gc: s.pointsAgainst, dg: s.pointDifferential, pts: s.points, rank: s.rank } }).filter(x => x.team) })).filter(g => g.rows.length) }
    } catch { /* sin tabla */ }
    stCache.set(slug, { t: now(), v }); if (stCache.size > 150) stCache.delete(stCache.keys().next().value)
    return v
  }
  const num = x => (x == null || Number.isNaN(+x)) ? '–' : esc(Math.round(+x))
  async function leaguePage(slug) {
    const rows = db.prepare('SELECT * FROM match_archive WHERE slug = ? ORDER BY kickoff DESC LIMIT 80').all(slug)
    if (!rows.length) return null
    const name = rows[0].league || slug, tabla = await standings(slug), byDay = new Map()
    for (const r of rows) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r) }
    const body = `<h1>${esc(name)}</h1><p class="mu">${esc(rows[0].country || '')}${rows[0].country ? ' · ' : ''}Resultados recientes y tabla de posiciones</p>
<h2>Tabla de posiciones</h2>${tabla && tabla.length ? tabla.map(g => `${g.name ? `<p class="mu">${esc(g.name)}</p>` : ''}<table class="tb"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr></thead><tbody>${g.rows.map((x, i) => `<tr><td>${esc(x.rank ?? i + 1)}</td><td>${esc(x.team)}</td><td>${num(x.pj)}</td><td>${num(x.g)}</td><td>${num(x.e)}</td><td>${num(x.p)}</td><td>${num(x.gf)}</td><td>${num(x.gc)}</td><td>${num(x.dg)}</td><td class="p">${num(x.pts)}</td></tr>`).join('')}</tbody></table>`).join('') : '<p class="mu">La tabla de posiciones no está disponible en este momento (por ejemplo, en torneos sin tabla o si el proveedor no responde).</p>'}
<h2>Resultados</h2>${[...byDay.entries()].map(([d, rs]) => `<p class="mu">${esc(longDay(d))}</p><section class="lg">${rs.sort((a, b) => a.kickoff - b.kickoff).map(matchRow).join('')}</section>`).join('')}`
    return { status: 200, cache: 600, html: shell({ title: `${name}: resultados y tabla de posiciones`, desc: `Resultados recientes y tabla de posiciones de ${name}.`, path: '/liga/' + slug, body }) }
  }

  // ---- enrutador: devuelve { status, html, cache } o null si la ruta no es de esta sección ----
  async function page(pathname) {
    if (S().partidosOn === false) return null
    let m
    if (pathname === '/partidos' || pathname === '/partidos/') return dayPage(dayOf(now()), true)
    if ((m = /^\/partidos\/(\d{4}-\d{2}-\d{2})$/.exec(pathname))) { if (isNaN(Date.parse(m[1]))) return { status: 404, html: shell({ title: 'Fecha no válida', desc: '', path: pathname, body: '<h1>Fecha no válida</h1>', noindex: true }) }; return m[1] === dayOf(now()) ? dayPage(m[1], true) : dayPage(m[1], false) }
    if ((m = /^\/partido\/([es])(\d+)(?:-[a-z0-9-]*)?$/.exec(pathname))) { const r = db.prepare('SELECT * FROM match_archive WHERE id = ?').get(m[1] === 'e' ? -m[2] : +m[2]); return r ? matchPage(r) : { status: 404, html: shell({ title: 'Partido no encontrado', desc: '', path: pathname, body: '<h1>Partido no encontrado</h1><p class="mu">Ese partido ya no está en el archivo.</p><p><a class="btn" href="/partidos">Ver partidos de hoy</a></p>', noindex: true }) } }
    if ((m = /^\/liga\/([a-z0-9._-]{1,60})$/i.exec(pathname))) return (await leaguePage(m[1])) || { status: 404, html: shell({ title: 'Liga no encontrada', desc: '', path: pathname, body: '<h1>Liga no encontrada</h1><p><a class="btn" href="/partidos">Ver partidos de hoy</a></p>', noindex: true }) }
    return null
  }
  // direcciones para el sitemap
  function sitemapUrls(origin) {
    if (S().partidosOn === false) return ''
    const u = [], add = (p, lm, ch) => u.push(`<url><loc>${origin}${esc(p)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}${ch ? `<changefreq>${ch}</changefreq>` : ''}</url>`)
    add('/partidos', dayOf(now()), 'always')
    for (let i = 1; i < 8; i++) { const d = dayOf(now() - i * 864e5); if (db.prepare('SELECT 1 FROM match_archive WHERE day = ? LIMIT 1').get(d)) add('/partidos/' + d, d) }
    for (const r of db.prepare("SELECT slug, MAX(kickoff) k FROM match_archive WHERE slug != '' AND kickoff > ? GROUP BY slug ORDER BY k DESC LIMIT 400").all(now() - 14 * 864e5)) add('/liga/' + r.slug, dayOf(r.k), 'daily')
    for (const r of db.prepare('SELECT * FROM match_archive WHERE kickoff > ? ORDER BY kickoff DESC LIMIT 3000').all(now() - 30 * 864e5)) add(matchUrl(r), dayOf(r.updated))
    return u.join('')
  }
  return { save, hide, page, sitemapUrls, finalizeOld, purgeOld }
}

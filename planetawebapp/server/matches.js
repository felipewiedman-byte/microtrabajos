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

  // ---- presentación (estilo de aplicación de resultados: limpio, oscuro y minimalista) ----
  const stLabel = r => LIVE.includes(r.status) ? (r.status === 'HT' ? 'ENT' : (r.el ? r.el + "'" : 'VIVO')) : DONE.includes(r.status) ? (r.status === 'PEN' ? 'FIN·P' : r.status === 'AET' ? 'FIN·PR' : 'FIN') : r.status === 'PST' ? 'APL' : hhmm(r.kickoff)
  const isLive = r => LIVE.includes(r.status), isDone = r => DONE.includes(r.status)
  const hex = c => /^#?[0-9a-f]{6}$/i.test(String(c || '')) ? '#' + String(c).replace('#', '') : ''
  const ICON = { ball: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6.2 3.3 2.4-1.3 3.9H10l-1.3-3.9L12 8.2Z" fill="currentColor"/></svg>' }
  function shell({ title, desc, path, body, head = '', noindex = false, wide = false }) {
    const st = S(), c = st.colors || {}, origin = '__ORIGIN__', name = esc(st.name || 'PLANETA'), logo = img(st.logoDark || st.favicon)
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${name}</title><meta name="description" content="${esc(desc).slice(0, 300)}">${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<link rel="canonical" href="${origin}${esc(path)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${name}"><meta name="theme-color" content="${esc(c.bg || '#0a0f1a')}">${head}
<style>:root{--bg:${esc(c.bg || '#0a0f1a')};--sf:${esc(c.surface || '#111b2e')};--tx:${esc(c.text || '#eef1f4')};--mu:${esc(c.muted || '#8a94a0')};--ac:${esc(c.accent || '#5cc8b0')};--lv:${esc(c.live || '#e5484d')};--ln:rgba(255,255,255,.07)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums}a{color:inherit;text-decoration:none}
.w{max-width:1120px;margin:0 auto;padding:0 16px 48px}
header{display:flex;align-items:center;gap:14px;height:60px;border-bottom:1px solid var(--ln)}header img{height:28px;width:auto;display:block}header b{font-size:17px;letter-spacing:.2px}header .sp{flex:1}
.pill{display:inline-flex;align-items:center;height:34px;padding:0 15px;border-radius:999px;background:var(--sf);font-weight:600;font-size:13px;border:1px solid var(--ln)}.pill.ac{background:var(--ac);color:#0a0d12;border-color:transparent}.pill.on{background:transparent;color:var(--ac);border-color:var(--ac)}
h1{font-size:22px;margin:22px 0 2px;font-weight:700;letter-spacing:-.2px}h2{font-size:12px;margin:24px 0 8px;color:var(--mu);font-weight:700;letter-spacing:.9px;text-transform:uppercase}.mu{color:var(--mu)}
.days{display:flex;gap:8px;overflow-x:auto;padding:14px 0 4px;scrollbar-width:none}.days::-webkit-scrollbar{display:none}.days a{flex:none;min-width:62px;text-align:center;padding:7px 8px;border-radius:12px;background:var(--sf);border:1px solid var(--ln);line-height:1.2}.days a small{display:block;font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.6px}.days a b{font-size:15px}.days a.on{border-color:var(--ac)}.days a.on small{color:var(--ac)}
.fl{display:flex;gap:6px;margin:12px 0 4px;flex-wrap:wrap}.fl label{cursor:pointer;padding:6px 13px;border-radius:999px;background:var(--sf);border:1px solid var(--ln);font-size:12.5px;font-weight:600;color:var(--mu)}input.f{position:absolute;opacity:0;pointer-events:none}
body:has(#f-all:checked) label[for=f-all],body:has(#f-live:checked) label[for=f-live],body:has(#f-fin:checked) label[for=f-fin],body:has(#f-nxt:checked) label[for=f-nxt]{background:var(--tx);color:var(--bg);border-color:transparent}
body:has(#f-live:checked) .m:not(.lv),body:has(#f-fin:checked) .m:not(.fn),body:has(#f-nxt:checked) .m:not(.nx){display:none}
body:has(#f-live:checked) .lg:not(:has(.m.lv)),body:has(#f-fin:checked) .lg:not(:has(.m.fn)),body:has(#f-nxt:checked) .lg:not(:has(.m.nx)){display:none}
.cols{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start}@media(min-width:920px){.cols{grid-template-columns:minmax(0,1fr) 340px}.cols.lgp{grid-template-columns:minmax(0,1fr) 440px}.cols.lgp .side{order:2}}
.lg{background:var(--sf);border:1px solid var(--ln);border-radius:14px;margin:0 0 12px;overflow:hidden}.lg>h3{display:flex;align-items:baseline;gap:8px;margin:0;padding:11px 14px;font-size:13px;font-weight:700;border-bottom:1px solid var(--ln)}.lg>h3 small{color:var(--mu);font-weight:500;font-size:12px}.lg>h3 a:hover{color:var(--ac)}
.m{display:grid;grid-template-columns:54px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--ln)}.m:last-child{border-bottom:0}.m:hover{background:rgba(255,255,255,.035)}
.m .t{font-size:11.5px;color:var(--mu);font-weight:600;text-align:center}.m.lv .t{color:var(--lv);display:flex;flex-direction:column;align-items:center;gap:3px}.m.lv .t i{width:6px;height:6px;border-radius:50%;background:var(--lv);animation:pl 1.4s infinite}@keyframes pl{50%{opacity:.25}}
.m .tms{display:flex;flex-direction:column;gap:5px;min-width:0}.m .tm{display:flex;align-items:center;gap:9px;min-width:0}.m .tm span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.m img,.m .lo{width:20px;height:20px;object-fit:contain;flex:none}.lo{border-radius:50%;background:rgba(255,255,255,.08);display:inline-block}
.m .sc{display:flex;flex-direction:column;gap:5px;text-align:right;font-weight:700}.m.lv .sc{color:var(--lv)}.m.fn .tm.lo2{color:var(--mu)}.m .tm.w2{font-weight:700;color:var(--tx)}
.side .box{background:var(--sf);border:1px solid var(--ln);border-radius:14px;padding:6px 0;margin-bottom:12px}.side .box h4{margin:0;padding:10px 14px 6px;font-size:12px;color:var(--mu);letter-spacing:.9px;text-transform:uppercase}.side .box a{display:flex;justify-content:space-between;gap:10px;padding:8px 14px;font-size:13px}.side .box a:hover{background:rgba(255,255,255,.04)}.side .box a small{color:var(--mu)}
.hd{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;text-align:center;background:linear-gradient(180deg,var(--sf),transparent);border:1px solid var(--ln);border-radius:18px;padding:22px 12px;margin:16px 0}.hd img,.hd .lo{width:56px;height:56px;object-fit:contain;margin:0 auto}.hd .n{font-weight:700;margin-top:8px;font-size:15px}.hd .sc{font-size:40px;font-weight:800;letter-spacing:1px;line-height:1}.hd .st{margin-top:8px;font-size:12px;font-weight:700;letter-spacing:.8px;color:var(--mu)}.hd .st.lv{color:var(--lv)}.hd .vs{font-size:22px;color:var(--mu);font-weight:600}
.tl{list-style:none;margin:0;padding:0}.tl li{display:grid;grid-template-columns:42px 22px 1fr;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--ln)}.tl li:last-child{border-bottom:0}.tl b{color:var(--mu);font-weight:600;font-size:13px}.tl small{color:var(--mu)}.ic{width:17px;height:17px;display:block;color:var(--ac)}.cd{width:11px;height:15px;border-radius:2px;display:block;background:#f5c518}.cd.r{background:#e5484d}
.tb{width:100%;border-collapse:collapse;font-size:13px}.tb th{color:var(--mu);font-weight:600;font-size:11px;padding:9px 4px;text-align:center;border-bottom:1px solid var(--ln);letter-spacing:.4px}.tb td{padding:9px 4px;text-align:center;border-bottom:1px solid var(--ln)}.tb tr:last-child td{border-bottom:0}.tb td.tn,.tb th.tn{text-align:left;padding-left:6px}.tb td.rk{border-left:3px solid transparent;width:30px}.tb .p{font-weight:800}.tb .nt{display:block;font-size:11px;color:var(--mu);font-weight:500}.tb img{width:18px;height:18px;object-fit:contain;vertical-align:-4px;margin-right:7px}
.fm{display:inline-flex;gap:3px}.fm i{width:16px;height:16px;border-radius:50%;font:700 9px/16px system-ui;font-style:normal;text-align:center;color:#0a0d12}.fm i.g{background:#3ecf8e}.fm i.e{background:#f5c518}.fm i.p{background:#e5484d;color:#fff}
.lgx{overflow-x:auto}.empty{padding:24px 14px;color:var(--mu);text-align:center}
.bt{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
footer{margin-top:36px;padding-top:16px;border-top:1px solid var(--ln);color:var(--mu);font-size:12.5px;text-align:center}footer a{margin:0 6px}footer a:hover{color:var(--tx)}
@media(max-width:560px){.hd .sc{font-size:32px}.hd img,.hd .lo{width:44px;height:44px}h1{font-size:19px}.tb .hid{display:none}}</style></head>
<body><div class="w"><header>${logo ? `<a href="/"><img src="${esc(logo)}" alt="${name}"></a>` : ''}<a href="/"><b>${name}</b></a><span class="sp"></span><a class="pill${wide ? '' : ' on'}" href="/partidos">Partidos</a><a class="pill ac" href="/">Ver el mapa</a></header>${body}
<footer><a href="/">Mapa</a><a href="/partidos">Partidos y resultados</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a></footer></div></body></html>`
  }
  const logoOf = (u, alt = '') => img(u) ? `<img src="${esc(img(u))}" alt="${esc(alt)}" loading="lazy" width="20" height="20">` : '<span class="lo"></span>'
  function matchRow(r) {
    const cls = isLive(r) ? 'lv' : isDone(r) ? 'fn' : 'nx', hw = isDone(r) && r.gh > r.ga, aw = isDone(r) && r.ga > r.gh
    return `<a class="m ${cls}" href="${esc(matchUrl(r))}"><span class="t">${isLive(r) ? '<i></i>' : ''}${esc(stLabel(r))}</span><span class="tms"><span class="tm${hw ? ' w2' : isDone(r) && aw ? ' lo2' : ''}">${logoOf(r.hl)}<span>${esc(r.home)}</span></span><span class="tm${aw ? ' w2' : isDone(r) && hw ? ' lo2' : ''}">${logoOf(r.al)}<span>${esc(r.away)}</span></span></span><span class="sc"><span>${r.gh ?? ''}</span><span>${r.ga ?? ''}</span></span></a>`
  }
  function groups(rows) {
    const g = new Map()
    for (const r of rows) { const k = (r.slug || '') + '|' + (r.league || ''); if (!g.has(k)) g.set(k, { slug: r.slug, league: r.league || 'Otros partidos', country: r.country, rows: [] }); g.get(k).rows.push(r) }
    return [...g.values()].sort((a, b) => (b.rows.some(isLive) - a.rows.some(isLive)) || b.rows.length - a.rows.length || a.league.localeCompare(b.league))
  }
  const leagueBlock = g => `<section class="lg"><h3>${g.slug ? `<a href="/liga/${esc(g.slug)}">${esc(g.league)}</a>` : esc(g.league)}${g.country && g.country !== g.league ? `<small>${esc(g.country)}</small>` : ''}</h3>${g.rows.map(matchRow).join('')}</section>`
  const dayNav = cur => { const out = []; for (let i = 0; i < 7; i++) { const d = dayOf(now() - i * 864e5), dt = new Date(d + 'T12:00:00Z'); out.push(`<a href="${i === 0 ? '/partidos' : '/partidos/' + d}" class="${d === cur ? 'on' : ''}"><small>${i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : dt.toLocaleDateString('es-CO', { weekday: 'short', timeZone: 'UTC' })}</small><b>${dt.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</b></a>`) } return `<nav class="days" aria-label="Días">${out.join('')}</nav>` }

  function dayPage(day, isToday) {
    const rows = db.prepare('SELECT * FROM match_archive WHERE day = ? ORDER BY kickoff, id').all(day)
    const nLive = rows.filter(isLive).length, nFin = rows.filter(isDone).length, nNx = rows.length - nLive - nFin
    const leagues = groups(rows).filter(g => g.slug).slice(0, 14)
    const body = `<h1>${isToday ? 'Partidos de hoy' : 'Partidos del ' + esc(longDay(day))}</h1><div class="mu">${esc(longDay(day))} · ${rows.length} partido${rows.length === 1 ? '' : 's'}</div>${dayNav(day)}
<input class="f" type="radio" name="f" id="f-all" checked><input class="f" type="radio" name="f" id="f-live"><input class="f" type="radio" name="f" id="f-fin"><input class="f" type="radio" name="f" id="f-nxt">
<div class="fl"><label for="f-all">Todos ${rows.length}</label><label for="f-live">En vivo ${nLive}</label><label for="f-fin">Finalizados ${nFin}</label><label for="f-nxt">Próximos ${nNx}</label></div>
<div class="cols"><main>${rows.length ? groups(rows).map(leagueBlock).join('') : '<div class="lg"><div class="empty">Todavía no hay partidos guardados para este día.</div></div>'}</main>
<aside class="side">${leagues.length ? `<div class="box"><h4>Ligas</h4>${leagues.map(g => `<a href="/liga/${esc(g.slug)}"><span>${esc(g.league)}</span><small>${g.rows.length}</small></a>`).join('')}</div>` : ''}</aside></div>`
    return { status: 200, cache: isToday ? 30 : 600, html: shell({ title: isToday ? 'Partidos de hoy: resultados en vivo' : `Partidos del ${longDay(day)}: resultados`, desc: `Resultados, marcadores en vivo, goles y tarjetas de los partidos de fútbol del ${longDay(day)}.`, path: isToday ? '/partidos' : '/partidos/' + day, body, noindex: !rows.length }) }
  }
  const EVL = e => e.type === 'Goal' ? (e.d === 'Own Goal' ? 'Autogol' : e.d === 'Penalty' ? 'Gol de penal' : e.d === 'Missed Penalty' ? 'Penal fallado' : 'Gol') : e.type === 'Card' ? (/red/i.test(e.d) ? 'Tarjeta roja' : 'Tarjeta amarilla') : ''
  function matchPage(r) {
    let ev = []; try { ev = JSON.parse(r.ev || '[]').filter(e => EVL(e)) } catch { /* sin jugadas */ }
    const title = `${r.home} ${r.gh == null ? 'vs' : r.gh + ' - ' + r.ga} ${r.away}`, canonical = matchUrl(r)
    const ld = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${r.home} vs ${r.away}`, startDate: new Date(r.kickoff).toISOString(), sport: 'Fútbol',
      eventStatus: r.status === 'PST' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled', homeTeam: { '@type': 'SportsTeam', name: r.home }, awayTeam: { '@type': 'SportsTeam', name: r.away } }
    if (r.venue) ld.location = { '@type': 'Place', name: r.venue, address: r.city || r.country || r.venue }
    if (r.league) ld.superEvent = { '@type': 'SportsEvent', name: r.league }
    const same = r.slug ? db.prepare('SELECT * FROM match_archive WHERE slug = ? AND day = ? AND id != ? ORDER BY kickoff LIMIT 8').all(r.slug, r.day, r.id) : []
    const big = u => img(u) ? `<img src="${esc(img(u))}" alt="" width="56" height="56">` : '<span class="lo"></span>'
    const body = `<h1>${esc(r.home)} vs ${esc(r.away)}</h1><div class="mu">${r.league ? `<a href="/liga/${esc(r.slug)}">${esc(r.league)}</a> · ` : ''}${esc(longDay(r.day))}</div>
<div class="hd"><div>${big(r.hl)}<div class="n">${esc(r.home)}</div></div><div>${r.gh == null ? '<div class="vs">vs</div>' : `<div class="sc">${esc(r.gh)} - ${esc(r.ga)}</div>`}<div class="st${isLive(r) ? ' lv' : ''}">${esc(isLive(r) ? 'EN VIVO · ' + stLabel(r) : isDone(r) ? 'FINALIZADO' : hhmm(r.kickoff))}</div></div><div>${big(r.al)}<div class="n">${esc(r.away)}</div></div></div>
<div class="cols"><main><h2>Goles y tarjetas</h2><div class="lg">${ev.length ? `<ul class="tl">${ev.map(e => `<li><b>${esc(e.t)}${e.x ? '+' + esc(e.x) : ''}'</b>${e.type === 'Goal' ? ICON.ball : `<i class="cd${/red/i.test(e.d) ? ' r' : ''}"></i>`}<span>${esc(e.p || e.team)}${e.p && e.team ? ` <small>${esc(e.team)}</small>` : ''}<small> · ${esc(EVL(e))}</small></span></li>`).join('')}</ul>` : '<div class="empty">Sin goles ni tarjetas registrados.</div>'}</div>
${r.venue ? `<h2>Información</h2><div class="lg"><div class="empty" style="text-align:left;color:var(--tx)">${esc(r.venue)}${r.city ? ', ' + esc(r.city) : ''}${r.country ? ' · ' + esc(r.country) : ''}</div></div>` : ''}</main>
<aside class="side">${same.length ? `<div class="box"><h4>Más de ${esc(r.league)}</h4>${same.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(x.home)} ${x.gh == null ? 'vs' : x.gh + '-' + x.ga} ${esc(x.away)}</span></a>`).join('')}</div>` : ''}
<div class="bt">${r.slug ? `<a class="pill" href="/liga/${esc(r.slug)}">Tabla de posiciones</a>` : ''}<a class="pill" href="${r.day === dayOf(now()) ? '/partidos' : '/partidos/' + r.day}">Todos los partidos</a></div></aside></div>`
    return { status: 200, cache: isDone(r) ? 3600 : 30, canonical, html: shell({ title: `${title}${isDone(r) ? ' · resultado final' : isLive(r) ? ' · en vivo' : ''}`, desc: `${r.home} vs ${r.away}${r.league ? ' (' + r.league + ')' : ''}, ${longDay(r.day)}. Marcador, goles y tarjetas.`, path: canonical, body, wide: true, head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` }) }
  }

  // ---- tabla de posiciones (ESPN, se pide solo cuando alguien abre la liga y se guarda 6 horas) ----
  const stCache = new Map()
  async function standings(slug) {
    const c = stCache.get(slug); if (c && now() - c.t < 6 * 3600e3) return c.v
    let v = null
    try {
      const r = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${encodeURIComponent(slug)}/standings`, { headers: { 'User-Agent': 'Mozilla/5.0 (tabla de posiciones)' }, signal: AbortSignal.timeout(8000) })
      if (r.ok) { const d = await r.json(), groups = d?.children?.length ? d.children : [d]
        v = groups.map(g => ({ name: g.name || '', rows: (g.standings?.entries || []).map(e => { const s = {}; for (const x of e.stats || []) s[x.name] = x.value; return { team: e.team?.displayName || '', logo: img(e.team?.logos?.[0]?.href), pj: s.gamesPlayed, g: s.wins, e: s.ties ?? s.draws, p: s.losses, gf: s.pointsFor, gc: s.pointsAgainst, dg: s.pointDifferential, pts: s.points, rank: s.rank, color: hex(e.note?.color), note: String(e.note?.description || '') } }).filter(x => x.team) })).filter(g => g.rows.length) }
    } catch { /* sin tabla */ }
    stCache.set(slug, { t: now(), v }); if (stCache.size > 150) stCache.delete(stCache.keys().next().value)
    return v
  }
  const num = x => (x == null || Number.isNaN(+x)) ? '–' : esc(Math.round(+x))
  // racha: últimos 5 partidos terminados del equipo en esa liga, según lo que hay en el archivo (G ganó, E empató, P perdió)
  function form(slug, team) {
    const rs = db.prepare(`SELECT home, gh, ga FROM match_archive WHERE slug = ? AND status IN (${DONE.map(() => '?').join(',')}) AND (home = ? OR away = ?) AND gh IS NOT NULL ORDER BY kickoff DESC LIMIT 5`).all(slug, ...DONE, team, team)
    return rs.reverse().map(r => { const mine = r.home === team ? r.gh : r.ga, other = r.home === team ? r.ga : r.gh; return mine > other ? 'g' : mine === other ? 'e' : 'p' })
  }
  async function leaguePage(slug) {
    const rows = db.prepare('SELECT * FROM match_archive WHERE slug = ? ORDER BY kickoff DESC LIMIT 80').all(slug)
    if (!rows.length) return null
    const name = rows[0].league || slug, tabla = await standings(slug), byDay = new Map()
    for (const r of rows) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r) }
    const table = g => `<div class="lg lgx">${g.name ? `<h3>${esc(g.name)}</h3>` : ''}<table class="tb"><thead><tr><th>#</th><th class="tn">Equipo</th><th>PJ</th><th class="hid">G</th><th class="hid">E</th><th class="hid">P</th><th class="hid">GF:GC</th><th>DG</th><th>PTS</th><th>Últimas</th></tr></thead><tbody>${g.rows.map((x, i) => { const f = form(slug, x.team); return `<tr><td class="rk" style="${x.color ? 'border-left-color:' + x.color : ''}">${esc(x.rank ?? i + 1)}</td><td class="tn">${img(x.logo) ? `<img src="${esc(img(x.logo))}" alt="" loading="lazy">` : ''}${esc(x.team)}${x.note ? `<span class="nt">${esc(x.note)}</span>` : ''}</td><td>${num(x.pj)}</td><td class="hid">${num(x.g)}</td><td class="hid">${num(x.e)}</td><td class="hid">${num(x.p)}</td><td class="hid">${num(x.gf)}:${num(x.gc)}</td><td>${num(x.dg)}</td><td class="p">${num(x.pts)}</td><td>${f.length ? `<span class="fm">${f.map(k => `<i class="${k}">${k === 'g' ? 'G' : k === 'e' ? 'E' : 'P'}</i>`).join('')}</span>` : ''}</td></tr>` }).join('')}</tbody></table></div>`
    const body = `<h1>${esc(name)}</h1><div class="mu">${esc(rows[0].country || '')}${rows[0].country ? ' · ' : ''}Tabla de posiciones y resultados recientes</div>
<div class="cols lgp"><aside class="side"><h2>Tabla de posiciones</h2>${tabla && tabla.length ? tabla.map(table).join('') : '<div class="lg"><div class="empty">La tabla de posiciones no está disponible en este momento (hay torneos sin tabla, o el proveedor no respondió).</div></div>'}</aside>
<main><h2>Resultados</h2>${[...byDay.entries()].map(([d, rs]) => `<div class="mu" style="margin:10px 2px 6px;font-size:12px">${esc(longDay(d))}</div><section class="lg">${rs.sort((a, b) => a.kickoff - b.kickoff).map(matchRow).join('')}</section>`).join('')}</main></div>`
    return { status: 200, cache: 600, html: shell({ title: `${name}: resultados y tabla de posiciones`, desc: `Resultados recientes y tabla de posiciones de ${name}.`, path: '/liga/' + slug, body, wide: true }) }
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

// Archivo y portal de resultados: cada partido que pasa por la web se guarda y queda como página propia (permanente), fuera del mapa.
//   /partidos                 hoy: en vivo, resultados y próximos, agrupados por liga
//   /partidos/AAAA-MM-DD      todos los partidos de ese día
//   /ligas                    todas las ligas, por región
//   /liga/eng.1               tabla de posiciones y resultados de esa liga
//   /partido/e123-equipo-vs-equipo   marcador, goles, tarjetas, estadísticas, alineaciones y tabla (e = ESPN, s = SportAPI)
// HTML generado en el servidor (rápido, sin JavaScript, bueno para buscadores). Todo texto externo se escapa.
const ESPN = require('./espn')
// ligas y torneos en español: slug → [nombre, región]
const LG = {
  'eng.1': ['Premier League', 'Europa'], 'esp.1': ['LaLiga', 'Europa'], 'ita.1': ['Serie A', 'Europa'], 'ger.1': ['Bundesliga', 'Europa'], 'fra.1': ['Ligue 1', 'Europa'], 'por.1': ['Primeira Liga', 'Europa'], 'ned.1': ['Eredivisie', 'Europa'],
  'bel.1': ['Liga de Bélgica', 'Europa'], 'tur.1': ['Superliga de Turquía', 'Europa'], 'sco.1': ['Premiership de Escocia', 'Europa'], 'rus.1': ['Liga de Rusia', 'Europa'], 'gre.1': ['Superliga de Grecia', 'Europa'],
  'col.1': ['Liga BetPlay', 'Sudamérica'], 'arg.1': ['Liga Profesional Argentina', 'Sudamérica'], 'bra.1': ['Brasileirão Serie A', 'Sudamérica'], 'chi.1': ['Primera División de Chile', 'Sudamérica'], 'per.1': ['Liga 1 de Perú', 'Sudamérica'],
  'uru.1': ['Primera División de Uruguay', 'Sudamérica'], 'ecu.1': ['LigaPro de Ecuador', 'Sudamérica'], 'par.1': ['Primera División de Paraguay', 'Sudamérica'], 'bol.1': ['Liga de Bolivia', 'Sudamérica'], 'ven.1': ['Liga FUTVE de Venezuela', 'Sudamérica'],
  'mex.1': ['Liga MX', 'Norte y Centroamérica'], 'usa.1': ['MLS', 'Norte y Centroamérica'], 'sau.1': ['Liga Profesional Saudí', 'Asia y Oceanía'], 'jpn.1': ['J1 League', 'Asia y Oceanía'], 'kor.1': ['K League 1', 'Asia y Oceanía'], 'chn.1': ['Superliga China', 'Asia y Oceanía'], 'aus.1': ['A-League', 'Asia y Oceanía'],
  'uefa.champions': ['UEFA Champions League', 'Torneos de clubes'], 'uefa.europa': ['UEFA Europa League', 'Torneos de clubes'], 'uefa.europa.conf': ['UEFA Conference League', 'Torneos de clubes'], 'uefa.super_cup': ['Supercopa de la UEFA', 'Torneos de clubes'],
  'conmebol.libertadores': ['Copa Libertadores', 'Torneos de clubes'], 'conmebol.sudamericana': ['Copa Sudamericana', 'Torneos de clubes'], 'concacaf.champions': ['Concacaf Champions Cup', 'Torneos de clubes'], 'caf.champions': ['CAF Champions League', 'Torneos de clubes'], 'afc.champions': ['AFC Champions League', 'Torneos de clubes'],
  'fifa.world': ['Copa Mundial de la FIFA', 'Selecciones'], 'fifa.friendly': ['Amistosos internacionales', 'Selecciones'], 'fifa.worldq.conmebol': ['Eliminatorias Sudamericanas', 'Selecciones'], 'fifa.worldq.uefa': ['Eliminatorias UEFA', 'Selecciones'], 'fifa.worldq.concacaf': ['Eliminatorias Concacaf', 'Selecciones'],
  'fifa.worldq.afc': ['Eliminatorias Asiáticas', 'Selecciones'], 'fifa.worldq.caf': ['Eliminatorias Africanas', 'Selecciones'], 'uefa.nations': ['UEFA Nations League', 'Selecciones'], 'concacaf.nations.league': ['Concacaf Nations League', 'Selecciones'], 'concacaf.gold': ['Copa Oro', 'Selecciones'],
  'caf.nations': ['Copa Africana de Naciones', 'Selecciones'], 'caf.nations_qual': ['Clasificatorias Copa Africana', 'Selecciones'], 'afc.asian.cup': ['Copa Asiática', 'Selecciones'], 'conmebol.america': ['Copa América', 'Selecciones'], 'uefa.euro': ['Eurocopa', 'Selecciones'], 'club.friendly': ['Amistosos de clubes', 'Torneos de clubes']
}
const REGION_BY_PREFIX = { eng: 'Europa', esp: 'Europa', ita: 'Europa', ger: 'Europa', fra: 'Europa', por: 'Europa', ned: 'Europa', bel: 'Europa', tur: 'Europa', sco: 'Europa', rus: 'Europa', gre: 'Europa', aut: 'Europa', sui: 'Europa', den: 'Europa', swe: 'Europa', nor: 'Europa', pol: 'Europa', ukr: 'Europa', cro: 'Europa', cze: 'Europa', srb: 'Europa', rou: 'Europa', hun: 'Europa',
  col: 'Sudamérica', arg: 'Sudamérica', bra: 'Sudamérica', chi: 'Sudamérica', per: 'Sudamérica', uru: 'Sudamérica', ecu: 'Sudamérica', par: 'Sudamérica', bol: 'Sudamérica', ven: 'Sudamérica', mex: 'Norte y Centroamérica', usa: 'Norte y Centroamérica', can: 'Norte y Centroamérica', crc: 'Norte y Centroamérica', gua: 'Norte y Centroamérica', hon: 'Norte y Centroamérica', slv: 'Norte y Centroamérica',
  sau: 'Asia y Oceanía', jpn: 'Asia y Oceanía', kor: 'Asia y Oceanía', chn: 'Asia y Oceanía', aus: 'Asia y Oceanía', ind: 'Asia y Oceanía', idn: 'Asia y Oceanía', afc: 'Asia y Oceanía', caf: 'África', rsa: 'África', egy: 'África', mar: 'África', fifa: 'Selecciones', uefa: 'Europa', conmebol: 'Sudamérica', concacaf: 'Norte y Centroamérica', club: 'Torneos de clubes' }
// países en español (solo para mostrar; los nombres originales se guardan tal cual)
const TEAM_ES = { Brazil: 'Brasil', Argentina: 'Argentina', Spain: 'España', Germany: 'Alemania', France: 'Francia', England: 'Inglaterra', Italy: 'Italia', Portugal: 'Portugal', Netherlands: 'Países Bajos', Belgium: 'Bélgica', Croatia: 'Croacia', Switzerland: 'Suiza', Denmark: 'Dinamarca', Sweden: 'Suecia', Norway: 'Noruega', Poland: 'Polonia', Austria: 'Austria', Turkey: 'Turquía', Greece: 'Grecia', Scotland: 'Escocia', Wales: 'Gales', Ireland: 'Irlanda', 'Northern Ireland': 'Irlanda del Norte', Ukraine: 'Ucrania', Russia: 'Rusia', Serbia: 'Serbia', Hungary: 'Hungría', 'Czech Republic': 'Rep. Checa', Czechia: 'Rep. Checa', Romania: 'Rumanía', Slovakia: 'Eslovaquia', Slovenia: 'Eslovenia', Iceland: 'Islandia', Finland: 'Finlandia',
  Mexico: 'México', 'United States': 'Estados Unidos', USA: 'Estados Unidos', Canada: 'Canadá', 'Costa Rica': 'Costa Rica', Panama: 'Panamá', Honduras: 'Honduras', Jamaica: 'Jamaica', 'El Salvador': 'El Salvador', Guatemala: 'Guatemala', Haiti: 'Haití', Cuba: 'Cuba', Colombia: 'Colombia', Uruguay: 'Uruguay', Chile: 'Chile', Peru: 'Perú', Ecuador: 'Ecuador', Paraguay: 'Paraguay', Bolivia: 'Bolivia', Venezuela: 'Venezuela',
  Japan: 'Japón', 'South Korea': 'Corea del Sur', 'Korea Republic': 'Corea del Sur', China: 'China', Australia: 'Australia', 'New Zealand': 'Nueva Zelanda', 'Saudi Arabia': 'Arabia Saudita', Iran: 'Irán', Iraq: 'Irak', Qatar: 'Catar', 'United Arab Emirates': 'Emiratos Árabes', Jordan: 'Jordania', Lebanon: 'Líbano', Palestine: 'Palestina', Syria: 'Siria', Oman: 'Omán', Kuwait: 'Kuwait', Bahrain: 'Baréin', Yemen: 'Yemen', Thailand: 'Tailandia', Vietnam: 'Vietnam', Malaysia: 'Malasia', Singapore: 'Singapur', Indonesia: 'Indonesia', India: 'India', Uzbekistan: 'Uzbekistán', Kyrgyzstan: 'Kirguistán', 'Kyrgyz Republic': 'Kirguistán', Tajikistan: 'Tayikistán', Brunei: 'Brunéi', Bangladesh: 'Bangladés', Pakistan: 'Pakistán',
  Morocco: 'Marruecos', Egypt: 'Egipto', Algeria: 'Argelia', Tunisia: 'Túnez', Nigeria: 'Nigeria', Ghana: 'Ghana', Senegal: 'Senegal', Cameroon: 'Camerún', 'Ivory Coast': 'Costa de Marfil', 'South Africa': 'Sudáfrica', Zambia: 'Zambia', Malawi: 'Malaui', Lesotho: 'Lesoto', Gabon: 'Gabón', Burundi: 'Burundi', Ethiopia: 'Etiopía', Mozambique: 'Mozambique', Tanzania: 'Tanzania', 'South Sudan': 'Sudán del Sur', Kenya: 'Kenia', Uganda: 'Uganda', Angola: 'Angola', Namibia: 'Namibia', Botswana: 'Botsuana', Zimbabwe: 'Zimbabue', Tahiti: 'Tahití', 'Cook Islands': 'Islas Cook' }
const STAT_ES = { possessionPct: ['Posesión (%)', 1], totalShots: ['Tiros', 2], shotsOnTarget: ['Tiros a puerta', 3], blockedShots: ['Tiros bloqueados', 9], wonCorners: ['Córners', 4], foulsCommitted: ['Faltas', 5], yellowCards: ['Tarjetas amarillas', 6], redCards: ['Tarjetas rojas', 7], offsides: ['Fuera de lugar', 8], saves: ['Atajadas', 10], totalPasses: ['Pases', 11], accuratePasses: ['Pases precisos', 12], passPct: ['Precisión de pases (%)', 13], effectiveTackles: ['Entradas efectivas', 14], totalTackles: ['Entradas', 14], interceptions: ['Intercepciones', 15], effectiveClearance: ['Despejes', 16], totalClearance: ['Despejes', 16] }

module.exports = function matches({ db, S, now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS match_archive (
    id INTEGER PRIMARY KEY, mkey TEXT UNIQUE, day TEXT NOT NULL, kickoff INTEGER NOT NULL, status TEXT,
    league TEXT, slug TEXT, country TEXT, venue TEXT, city TEXT, home TEXT, away TEXT, hl TEXT, al TEXT,
    gh INTEGER, ga INTEGER, el INTEGER, ev TEXT, updated INTEGER);
    CREATE INDEX IF NOT EXISTS match_archive_day ON match_archive(day, kickoff);
    CREATE INDEX IF NOT EXISTS match_archive_slug ON match_archive(slug, kickoff);`)
  for (const c of ['eid INTEGER', 'detail TEXT', 'fetched INTEGER']) { try { db.exec('ALTER TABLE match_archive ADD COLUMN ' + c) } catch { /* ya existe */ } }
  const LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'], DONE = ['FT', 'AET', 'PEN', 'AWD', 'WO']
  const tz = () => S().dailyTZ || 'America/Bogota'
  const dayOf = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: tz() })
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const img = u => /^(https:\/\/|\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$)/.test(u || '') ? u : ''
  const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  const tn = n => { const x = String(n || ''); if (TEAM_ES[x]) return TEAM_ES[x]; const m = /^(.+?)( (?:W|U\d{2}|Women))$/.exec(x); return m && TEAM_ES[m[1]] ? TEAM_ES[m[1]] + m[2] : x }
  const lgName = r => (LG[r.slug] && LG[r.slug][0]) || r.league || 'Otros partidos'
  const lgRegion = slug => (LG[slug] && LG[slug][1]) || REGION_BY_PREFIX[String(slug).split('.')[0]] || 'Otras ligas'
  const matchUrl = r => `/partido/${r.id < 0 ? 'e' + -r.id : 's' + r.id}-${slugify(r.home + ' vs ' + r.away)}`
  const hhmm = ms => new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz() })
  const longDay = day => { const t = new Date(day + 'T12:00:00Z').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); return t.charAt(0).toUpperCase() + t.slice(1) }

  // ---- guardar ----
  const up = db.prepare(`INSERT INTO match_archive (id, mkey, day, kickoff, status, league, slug, country, venue, city, home, away, hl, al, gh, ga, el, ev, updated, eid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mkey) DO UPDATE SET status = excluded.status, league = CASE WHEN excluded.league != '' THEN excluded.league ELSE match_archive.league END,
      slug = CASE WHEN excluded.slug != '' THEN excluded.slug ELSE match_archive.slug END, country = CASE WHEN excluded.country != '' THEN excluded.country ELSE match_archive.country END,
      venue = CASE WHEN excluded.venue != '' THEN excluded.venue ELSE match_archive.venue END, city = CASE WHEN excluded.city != '' THEN excluded.city ELSE match_archive.city END,
      hl = CASE WHEN excluded.hl != '' THEN excluded.hl ELSE match_archive.hl END, al = CASE WHEN excluded.al != '' THEN excluded.al ELSE match_archive.al END,
      gh = excluded.gh, ga = excluded.ga, el = excluded.el, ev = CASE WHEN length(excluded.ev) > 2 THEN excluded.ev ELSE match_archive.ev END,
      eid = COALESCE(excluded.eid, match_archive.eid), kickoff = excluded.kickoff, day = excluded.day, updated = excluded.updated`)
  // f = partido en el formato interno de la web; mkey = día + equipos (así el mismo partido de ESPN y de SportAPI es un solo registro)
  function save(f, mkey) {
    if (S().partidosOn === false) return
    const ko = f.fixture.timestamp * 1000, g = f.goals || {}
    const ev = JSON.stringify((f.events || []).slice(-60).map(e => ({ t: e.time?.elapsed || 0, x: e.time?.extra || 0, type: e.type || '', d: e.detail || '', team: e.team?.name || '', p: e.player?.name || '', a: e.assist?.name || '' })))
    up.run(f.fixture.id, mkey, dayOf(ko), ko, f.fixture.status?.short || '', String(f.league?.name === 'Fútbol' ? '' : f.league?.name || ''), String(f.league?.slug || ''), String(f.league?.country || ''),
      String(f.fixture.venue?.name || ''), String(f.fixture.venue?.city || ''), f.teams.home.name, f.teams.away.name, img(f.teams.home.logo || f.teams.home.src), img(f.teams.away.logo || f.teams.away.src), g.home ?? null, g.away ?? null, f.fixture.status?.elapsed ?? null, ev, now(), f.fixture.id < 0 ? -f.fixture.id : null)
  }
  // un partido que quedó «en juego» sin que llegara el dato final (el proveedor dejó de mandarlo) se da por terminado
  function finalizeOld() { db.prepare(`UPDATE match_archive SET status = 'FT' WHERE status IN (${LIVE.map(() => '?').join(',')}) AND kickoff < ?`).run(...LIVE, now() - 5 * 3600e3) }
  function purgeOld() { const days = Math.max(7, Math.min(3650, +S().archiveDays || 90)); db.prepare('DELETE FROM match_archive WHERE kickoff < ?').run(now() - days * 864e5) }
  // al ocultar una liga o un equipo desde el panel también salen del archivo
  function hide(slugs, teamsNorm, norm) { let n = 0; for (const r of db.prepare('SELECT id, slug, home, away FROM match_archive').all()) if ((r.slug && slugs.has(r.slug)) || teamsNorm.has(norm(r.home)) || teamsNorm.has(norm(r.away))) { db.prepare('DELETE FROM match_archive WHERE id = ?').run(r.id); n++ } return n }
  setTimeout(() => { try { finalizeOld(); purgeOld() } catch { /* nada */ } }, 20e3).unref()
  setInterval(() => { try { finalizeOld(); purgeOld() } catch { /* nada */ } }, 3600e3).unref()

  // ---- estadísticas y alineaciones de un partido (ESPN): se piden al abrir la página y se guardan ----
  const detCache = new Map()
  async function detail(r) {
    if (!r.eid) return null
    let d = null; try { d = r.detail ? JSON.parse(r.detail) : null } catch { /* nada */ }
    const done = DONE.includes(r.status), age = now() - (r.fetched || 0)
    if (d && (done ? (d.stats?.length && d.rec) : age < 60e3)) return d
    if (!d && done && age < 6 * 3600e3 && r.fetched) return null   // ya se intentó y ESPN no tiene datos de este partido
    const k = r.id; if (detCache.has(k)) return detCache.get(k)
    const p = (async () => { try { const v = await Promise.race([ESPN.summary(r.slug, r.eid), new Promise((_, no) => setTimeout(() => no(new Error('tarda')), 5000))]); db.prepare('UPDATE match_archive SET detail = ?, fetched = ? WHERE id = ?').run(JSON.stringify(v), now(), r.id); if (v.evs?.length && String(r.ev || '[]').length <= 2) db.prepare('UPDATE match_archive SET ev = ? WHERE id = ?').run(JSON.stringify(v.evs.map(e => ({ t: e.time.elapsed, x: e.time.extra, type: e.type, d: e.detail, team: e.team.name, p: e.player.name, a: '' }))), r.id); return v } catch { db.prepare('UPDATE match_archive SET fetched = ? WHERE id = ?').run(now(), r.id); return d } finally { setTimeout(() => detCache.delete(k), 30e3) } })()
    detCache.set(k, p); return p
  }

  // ---- presentación: portal compacto, sobrio y denso (claro por defecto; oscuro automático si el equipo lo usa) ----
  const stLabel = r => LIVE.includes(r.status) ? (r.status === 'HT' ? 'ENT' : (r.el ? r.el + "'" : 'VIVO')) : DONE.includes(r.status) ? (r.status === 'PEN' ? 'FIN·P' : r.status === 'AET' ? 'FIN·PR' : 'FIN') : r.status === 'PST' ? 'APL' : hhmm(r.kickoff)
  const isLive = r => LIVE.includes(r.status), isDone = r => DONE.includes(r.status)
  const hex = c => /^#?[0-9a-f]{6}$/i.test(String(c || '')) ? '#' + String(c).replace('#', '') : ''
  const ICON = { ball: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6.2 3.3 2.4-1.3 3.9H10l-1.3-3.9L12 8.2Z" fill="currentColor"/></svg>' }
  db.exec('CREATE TABLE IF NOT EXISTS match_logos (slug TEXT PRIMARY KEY, url TEXT)')
  const LOGOS = new Map(db.prepare('SELECT slug, url FROM match_logos').all().map(r => [r.slug, r.url])), triedLogo = new Map()
  let warming = false
  async function warmLogos() {
    if (warming) return; warming = true
    try {
      const miss = db.prepare("SELECT DISTINCT slug FROM match_archive WHERE slug != ''").all().map(r => r.slug).filter(x => !LOGOS.has(x) && !(triedLogo.get(x) > now() - 6 * 3600e3)).slice(0, 80)
      for (let i = 0; i < miss.length; i += 4) await Promise.all(miss.slice(i, i + 4).map(async slug => {
        triedLogo.set(slug, now())
        try {
          const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(slug)}/scoreboard?limit=1`, { headers: { 'User-Agent': 'Mozilla/5.0 (escudos de ligas)' }, signal: AbortSignal.timeout(6000) })
          if (!r.ok) return
          const lg = (await r.json())?.leagues?.[0], l = (lg?.logos || []).find(x => (x.rel || []).includes('default')) || lg?.logos?.[0], u = String(l?.href || '')
          if (/^https:\/\/[a-z0-9.-]*espncdn\.com\//i.test(u)) { LOGOS.set(slug, u); db.prepare('INSERT OR REPLACE INTO match_logos (slug, url) VALUES (?, ?)').run(slug, u) }
        } catch { /* se intenta después */ }
      }))
    } catch { /* nada */ } finally { warming = false }
  }
  setTimeout(() => warmLogos().catch(() => {}), 50e3).unref(); setInterval(() => warmLogos().catch(() => {}), 3 * 3600e3).unref()
  const badge = (slug, label) => { if (slug && LOGOS.get(slug)) return `<span class="bd lgo"><img src="${esc(LOGOS.get(slug))}" alt="" loading="lazy" width="18" height="18"></span>`; if (!slug) return `<span class="bd" style="background:#7a8699;color:#fff">${ICON.ball.replace('class="ic"', 'class="ic" style="color:#fff"')}</span>`; let h = 0; for (const ch of slug || label || '') h = (h * 31 + ch.charCodeAt(0)) % 360; const w = String(label || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(x => x.length > 1 || /\d/.test(x)); const ini = ((w[0] || '?')[0] + ((w[1] || '')[0] || (w[0] || '?')[1] || '')).toUpperCase(); return `<span class="bd" style="background:hsl(${h} 45% 36%)">${esc(ini)}</span>` }
  const THEME_L = '--bg:#eff0f2;--sf:#fff;--tx:#14171a;--mu:#64748b;--ln:rgba(15,23,42,.07);--lk:#0b5cab;--lv:#e11d48;--win:#12805c;--soft:#f3f5f9;--sel:#1d2024;--selx:#fff;--hl:rgba(0,0,0,.06);--sh:0 1px 3px rgba(15,23,42,.08)'
  const THEME_D = '--bg:#0e0f11;--sf:#17191c;--tx:#ececec;--mu:#9097a0;--ln:rgba(255,255,255,.07);--lk:#8cc0ff;--lv:#ff4d6a;--win:#3ecf8e;--soft:rgba(255,255,255,.05);--sel:#ececec;--selx:#0e0f11;--hl:rgba(255,255,255,.08);--sh:0 1px 3px rgba(0,0,0,.45)'
  const CSS = `:root{color-scheme:light dark;${THEME_L};--r:6px}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){${THEME_D}}}:root[data-theme=dark]{color-scheme:dark;${THEME_D}}:root[data-theme=light]{color-scheme:light}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-padding-top:60px}body{margin:0;background:var(--bg);color:var(--tx);font:13.5px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums}a{color:inherit;text-decoration:none}button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;padding:0}
.w{max-width:1400px;margin:0 auto;padding:0 14px}
.top{background:var(--sf);position:sticky;top:0;z-index:30;box-shadow:var(--sh)}.top .w{display:flex;align-items:center;gap:14px;height:58px}.brand{display:flex;align-items:center;flex:none}.brand img{height:30px;max-width:150px;width:auto;object-fit:contain;display:block}.brand .dk{display:none}.brand b{font-size:16px}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .brand .lt{display:none}:root:not([data-theme=light]) .brand .dk{display:block}}:root[data-theme=dark] .brand .lt{display:none}:root[data-theme=dark] .brand .dk{display:block}:root[data-theme=light] .brand .lt{display:block}:root[data-theme=light] .brand .dk{display:none}
.top nav{display:flex;gap:2px}.top nav a{padding:7px 12px;font-weight:600;font-size:13px;color:var(--mu);border-radius:var(--r)}.top nav a:hover{color:var(--tx);background:var(--soft)}.top nav a.on{color:var(--selx);background:var(--sel)}
.srch{flex:1;max-width:340px;margin-left:auto;min-width:0}.srch input{width:100%;height:34px;border:0;border-radius:var(--r);background:var(--soft);color:var(--tx);padding:0 12px;font:inherit;outline:0}.srch input:focus{box-shadow:0 0 0 2px var(--lk)}
.ib{width:34px;height:34px;border-radius:var(--r);background:var(--soft);display:grid;place-items:center;flex:none;font-size:15px}.ib:hover{background:var(--ln)}
.pg{padding:10px 0 40px}h1{font-size:18px;margin:0;font-weight:700}h2{font-size:11px;margin:14px 0 6px;color:var(--mu);font-weight:700;letter-spacing:.9px;text-transform:uppercase}.mu{color:var(--mu)}.sub{color:var(--mu);font-size:12.5px}
.hrow{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.bar2{display:flex;align-items:center;gap:4px;overflow-x:auto;scrollbar-width:none;padding:2px 0;margin-bottom:10px}.bar2::-webkit-scrollbar{display:none}.bar2>*{flex:none}.bar2 .sp{width:1px;height:16px;background:var(--ln);margin:0 6px}.bar2 .rt{margin-left:auto;display:flex;gap:4px}
.bar2 a,.bar2 label,.bar2 button,.tabs label{padding:5px 10px;border-radius:var(--r);background:var(--sf);font-size:12px;font-weight:600;color:var(--mu);white-space:nowrap;cursor:pointer;line-height:1.2;box-shadow:var(--sh)}.bar2 a.on{background:var(--sel);color:var(--selx)}.bar2 a:hover,.bar2 label:hover,.bar2 button:hover{color:var(--tx)}.bar2 .lvl b{color:var(--lv)}
input.f{position:absolute;opacity:0;pointer-events:none}
body:has(#f-all:checked) label[for=f-all],body:has(#f-live:checked) label[for=f-live],body:has(#f-fin:checked) label[for=f-fin],body:has(#f-nxt:checked) label[for=f-nxt]{background:var(--sel);color:var(--selx)}
body:has(#f-live:checked) .m:not(.lv),body:has(#f-fin:checked) .m:not(.fn),body:has(#f-nxt:checked) .m:not(.nx){display:none}
body:has(#f-live:checked) .lg:not(:has(.m.lv)),body:has(#f-fin:checked) .lg:not(:has(.m.fn)),body:has(#f-nxt:checked) .lg:not(:has(.m.nx)){display:none}
body:has(#f-fin:checked) .livebox,body:has(#f-nxt:checked) .livebox{display:none}
.livebox{margin-bottom:12px}.livebox h2{margin:0 0 6px;color:var(--lv);display:flex;align-items:center;gap:6px;font-size:12px}.livebox h2 i,.m.lv .t i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--lv);animation:pl 1.4s infinite}@keyframes pl{50%{opacity:.25}}
.lcs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}.lc{display:block;background:var(--sf);border-radius:8px;padding:10px 12px;box-shadow:var(--sh)}.lc:hover{background:var(--soft)}
.lc .h{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--mu);margin-bottom:6px}.lc .h b{color:var(--lv);white-space:nowrap}.lc .h span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lc .r{display:flex;align-items:center;gap:8px;padding:2px 0;font-weight:600;font-size:14px}.lc .r>span:not(.lo){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lc .r em{font-style:normal;font-size:22px;font-weight:800;min-width:24px;text-align:right}.lc img,.lc .lo{width:24px;height:24px;object-fit:contain;flex:none}
.g3{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}.left{display:none}.compd{display:block;margin-bottom:8px;border-radius:var(--r);background:var(--sf);box-shadow:var(--sh)}
@media(min-width:760px){.g3{grid-template-columns:minmax(0,1fr) 300px}}@media(min-width:1060px){.g3{grid-template-columns:220px minmax(0,1fr) 310px}.left{display:block}.compd{display:none}}
.left,.side{position:sticky;top:64px;max-height:calc(100vh - 76px);overflow:auto;scrollbar-width:thin;border-radius:var(--r)}
details.lg,.lg{background:var(--sf);border-radius:var(--r);margin:0 0 6px;overflow:hidden;box-shadow:var(--sh)}details.lg>summary,.lg>h3{display:flex;align-items:center;gap:8px;margin:0;padding:7px 10px;font-size:12.5px;font-weight:700;background:var(--soft);cursor:pointer;list-style:none}details.lg>summary::-webkit-details-marker{display:none}.lg>h3{cursor:default}
details.lg>summary::after{content:"›";margin-left:6px;color:var(--mu);font-size:16px;line-height:1;transition:transform .15s}details.lg[open]>summary::after{transform:rotate(90deg)}details.lg>summary small,.lg>h3 small{color:var(--mu);font-weight:500;font-size:11.5px;margin-left:auto}details.lg>summary .lvc{color:var(--lv);font-weight:700;margin-left:0}
details.lg>summary a:hover{color:var(--lk)}
.bd{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;color:#fff;font-size:9.5px;font-weight:700;flex:none}.bd .ic{width:13px;height:13px}.bd.lg2{width:38px;height:38px;border-radius:6px;font-size:14px}
.gr{display:grid;grid-template-columns:minmax(0,1fr)}@media(min-width:700px){.gr{grid-template-columns:minmax(0,1fr) minmax(0,1fr);}.gr .m:nth-child(even){border-left:1px solid var(--ln)}}
.m{display:grid;grid-template-columns:40px minmax(0,1fr) 44px minmax(0,1fr);gap:6px;align-items:center;padding:7px 9px;border-top:1px solid var(--ln);font-size:13px}.m:hover{background:var(--soft)}
.m .t{font-size:11.5px;color:var(--mu);font-weight:600;text-align:center}.m.lv .t{color:var(--lv);font-weight:700}.m.lv .t i{width:5px;height:5px;margin-right:3px;vertical-align:middle}
.m .tm{display:flex;align-items:center;gap:6px;min-width:0}.m .tm.h{justify-content:flex-end;text-align:right}.m .tm span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.m img,.m .lo{width:16px;height:16px;object-fit:contain;flex:none}.lo{border-radius:50%;background:var(--ln);display:inline-block}
.m .sc{text-align:center;font-weight:700;background:var(--soft);border-radius:4px;padding:2px 0;font-size:12.5px}.m.lv .sc{color:var(--lv)}.m .w2{font-weight:700}.m.fn .lo2{color:var(--mu)}
.box{background:var(--sf);border-radius:var(--r);margin-bottom:6px;overflow:hidden;box-shadow:var(--sh)}.box h4{margin:0;padding:7px 10px;font-size:11px;color:var(--mu);letter-spacing:.9px;text-transform:uppercase;background:var(--soft)}.box>a,.box summary{display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:13px;border-top:1px solid var(--ln)}.box>a:hover{background:var(--soft)}.box>a small{margin-left:auto;color:var(--mu)}.box summary{cursor:pointer;font-weight:600;font-size:12.5px;list-style:none}.box summary::-webkit-details-marker{display:none}.box details a{display:flex;align-items:center;gap:8px;padding:5px 10px 5px 14px;font-size:12.5px;color:var(--mu);border-top:1px solid var(--ln)}.box details a:hover{color:var(--tx);background:var(--soft)}.box details a small{margin-left:auto}
.hd{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;text-align:center;background:var(--sf);border-radius:8px;box-shadow:var(--sh);padding:16px 10px;margin:8px 0}.hd img,.hd .lo{width:52px;height:52px;object-fit:contain;margin:0 auto;display:block}.hd .n{font-weight:700;margin-top:6px;font-size:14px}.hd .sc{font-size:36px;font-weight:800;letter-spacing:1px;line-height:1}.hd .st{margin-top:6px;font-size:11px;font-weight:700;letter-spacing:.8px;color:var(--mu)}.hd .st.lv{color:var(--lv)}.hd .vs{font-size:20px;color:var(--mu);font-weight:600}
.tabs{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 0 8px;padding:2px 0}.tabs::-webkit-scrollbar{display:none}.tabs label,.tabs a{flex:none}.tabs a{padding:5px 10px;border-radius:var(--r);background:var(--sf);font-size:12px;font-weight:600;color:var(--mu);white-space:nowrap;box-shadow:var(--sh)}.tabs a:hover{color:var(--tx)}.allp .pn{display:block;scroll-margin-top:64px}.pn{display:none}
body:has(#t-res:checked) label[for=t-res],body:has(#t-est:checked) label[for=t-est],body:has(#t-ali:checked) label[for=t-ali],body:has(#t-tab:checked) label[for=t-tab],body:has(#t-his:checked) label[for=t-his],
body:has(#l-cla:checked) label[for=l-cla],body:has(#l-res:checked) label[for=l-res],body:has(#l-nxt:checked) label[for=l-nxt],body:has(#l-gol:checked) label[for=l-gol],body:has(#l-tar:checked) label[for=l-tar],body:has(#l-equ:checked) label[for=l-equ]{background:var(--sel);color:var(--selx)}
body:has(#t-res:checked) #p-res,body:has(#t-est:checked) #p-est,body:has(#t-ali:checked) #p-ali,body:has(#t-tab:checked) #p-tab,body:has(#t-his:checked) #p-his,
body:has(#l-cla:checked) #q-cla,body:has(#l-res:checked) #q-res,body:has(#l-nxt:checked) #q-nxt,body:has(#l-gol:checked) #q-gol,body:has(#l-tar:checked) #q-tar,body:has(#l-equ:checked) #q-equ{display:block}
.tl{list-style:none;margin:0;padding:0}.tl li{display:grid;grid-template-columns:40px 22px 1fr;gap:6px;align-items:center;padding:7px 10px;border-top:1px solid var(--ln)}.tl b{color:var(--mu);font-weight:600;font-size:12.5px}.tl small{color:var(--mu)}.ic{width:16px;height:16px;display:block;color:var(--win)}.cd{width:10px;height:14px;border-radius:2px;display:block;background:#f5b800}.cd.r{background:#d92d20}
.sb{padding:8px 10px;border-top:1px solid var(--ln)}.sb .r{display:flex;justify-content:space-between;font-weight:700;font-size:13px;margin-bottom:4px}.sb .r span{color:var(--mu);font-weight:600;font-size:12px}.sb .bar{display:flex;gap:3px;height:5px}.sb .bar i{display:block;border-radius:2px;height:5px}.sb .bar i.h{background:var(--ac)}.sb .bar i.a{background:#f59e0b}.sb .bar .bh,.sb .bar .ba{flex:1;display:flex;background:var(--ln);border-radius:2px;overflow:hidden}.sb .bar .bh{justify-content:flex-end}
.ln2{display:grid;grid-template-columns:1fr 1fr}.ln2>div{padding:8px 10px}.ln2 h5{margin:0 0 4px;font-size:12.5px}.ln2 small{color:var(--mu)}.pl2{display:flex;gap:7px;padding:3px 0;font-size:13px}.pl2 b{width:22px;color:var(--mu);font-weight:600}
.tb{width:100%;border-collapse:collapse;font-size:12.5px}.tb th{color:var(--mu);font-weight:600;font-size:10.5px;padding:7px 4px;text-align:center;letter-spacing:.4px;text-transform:uppercase;background:var(--soft)}.tb td{padding:6px 4px;text-align:center;border-top:1px solid var(--ln)}.tb td.tn,.tb th.tn{text-align:left;padding-left:6px}.tb td.rk{border-left:3px solid transparent;width:30px;color:var(--mu);font-weight:600}.tb .p{font-weight:800}.tb .pos{color:var(--win);font-weight:700}.tb .neg{color:var(--lv);font-weight:700}.tb tr.hl td{background:var(--hl)}.tb .nt{display:block;font-size:10.5px;color:var(--mu);font-weight:500}.tb img{width:16px;height:16px;object-fit:contain;vertical-align:-3px;margin-right:6px}
.fm{display:inline-flex;gap:2px}.fm i{width:15px;height:15px;border-radius:3px;font:700 9px/15px system-ui;font-style:normal;text-align:center;color:#fff}.fm i.g{background:#12a06a}.fm i.e{background:#e0a100}.fm i.p{background:#d92d20}
.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:6px;margin:8px 0}.kp div{background:var(--sf);box-shadow:var(--sh);border-radius:var(--r);padding:7px 10px}.kp b{display:block;font-size:17px}.kp span{color:var(--mu);font-size:10.5px;text-transform:uppercase;letter-spacing:.5px}
.bar2 a.ar{padding:5px 9px;font-size:14px;line-height:1}.dp{flex:none;height:26px;border:0;border-radius:var(--r);background:var(--sf);box-shadow:var(--sh);color:var(--tx);font:inherit;font-size:12px;padding:0 6px}
.hs{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px;color:var(--mu);margin:-2px 0 8px;padding:0 12px}.hs div:first-child{text-align:right}.hs span{display:block}.hs i{font-style:normal;color:var(--tx);font-weight:600}.rec{font-size:11px;color:var(--mu);font-weight:500;margin-top:2px}
.pt{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px}@media(max-width:700px){.pt{grid-template-columns:1fr}}.pt h5{margin:0 0 6px;font-size:12.5px;display:flex;justify-content:space-between}
.pitch{position:relative;aspect-ratio:3/4;border-radius:6px;background:linear-gradient(#3f8f4a,#357d40);overflow:hidden;max-width:420px;margin:0 auto}.pitch:before{content:"";position:absolute;inset:6% 6%;border:2px solid rgba(255,255,255,.55);border-radius:2px}.pitch:after{content:"";position:absolute;left:6%;right:6%;top:50%;border-top:2px solid rgba(255,255,255,.55)}
.pp{position:absolute;transform:translate(-50%,-50%);text-align:center;width:22%;z-index:1}.pp b{display:grid;place-items:center;width:30px;height:30px;margin:0 auto;border-radius:50%;background:#c8102e;color:#fff;font-size:12px;border:2px solid #fff}.pp.aw b{background:#1d4ed8}.pp span{display:block;margin-top:2px;font-size:10.5px;color:#fff;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pp em{position:absolute;top:-4px;right:12%;font-style:normal;font-size:10px;background:#fff;color:#c00;border-radius:8px;padding:0 3px}
.sbs{padding:4px 10px 8px}.sbs .pl2 small.in{color:var(--win)}.sbs .pl2 small.out{color:var(--lv)}
.tl .sb2{width:14px;height:14px;color:var(--mu)}
.mp{grid-template-columns:minmax(0,1fr)}.mp>.lu{order:2}.mp>main{order:1}.mp>.side{order:3;position:static;max-height:none}.mp .pa{display:none}body:has(#pt-a:checked) .mp .pa{display:block}body:has(#pt-a:checked) .mp .ph{display:none}.mp .tabs label{flex:1;text-align:center}body:has(#pt-h:checked) label[for=pt-h],body:has(#pt-a:checked) label[for=pt-a]{background:var(--sel);color:var(--selx)}.pt1{padding:0 10px 6px}.mp .tabs{padding:8px 10px 6px;margin:0}
.sbl{display:flex;gap:8px;padding:7px 10px;border-top:1px solid var(--ln);font-size:12.5px}.sbl b{color:var(--mu);width:34px}.sbl .in{font-style:normal;color:var(--win);font-weight:600}.sbl small{color:var(--mu)}.sbh{display:flex;justify-content:space-between;padding:7px 10px;font-weight:700;font-size:12px;color:var(--mu)}
@media(min-width:1060px){.mp{grid-template-columns:330px minmax(0,1fr) 320px}.mp>.lu,.mp>main,.mp>.side{order:0}.mp>.side{position:sticky;top:64px;max-height:calc(100vh - 76px);overflow:auto}}
.top .w{height:58px;gap:6px}.top nav{gap:0;height:58px;margin-left:10px}.top nav a{display:flex;align-items:center;height:58px;padding:0 15px;border-radius:0;background:none;color:var(--mu);font-size:13.5px;font-weight:600;border-bottom:3px solid transparent}.top nav a:hover{color:var(--tx);background:none}.top nav a.on{color:var(--tx);background:none;border-bottom-color:var(--ac)}
.srch{position:relative}.srch svg{position:absolute;left:10px;top:9px;width:16px;height:16px;color:var(--mu);pointer-events:none}.srch input{padding-left:32px;height:34px}.ib svg{width:17px;height:17px}.ib{border-radius:6px}
.bar2{gap:8px}.bar2 .grp{display:flex;gap:1px;background:var(--sf);border-radius:6px;padding:2px;flex:none;align-items:center}.bar2 .grp>*{background:transparent;box-shadow:none;border-radius:4px;padding:6px 11px}.bar2 .grp>a.on{background:var(--sel);color:var(--selx)}.bar2 .rt{margin-left:auto}.bar2 .dp{padding:0 4px;height:28px}.bar2 .grp>a.ar{padding:6px 9px}
.bd.lgo{background:#fff;padding:1px}.bd.lgo img{width:18px;height:18px;object-fit:contain;display:block}.bd.lg2.lgo img{width:32px;height:32px}
.sh{display:flex;flex-direction:column;gap:8px;padding:0}.sh .main{height:34px;border-radius:5px;background:var(--sel);color:var(--selx);font-weight:600;font-size:12.5px}.sh .ico{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.sh .ico>*{display:grid;place-items:center;height:38px;border-radius:6px;background:var(--soft);color:var(--tx)}.sh .ico>*:hover{background:var(--ln)}.sh .ico svg{width:24px;height:24px}
.lcs{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}.hrow{margin-bottom:6px}.livebox{margin-bottom:10px}
.mh{background:var(--sf);border-radius:8px;box-shadow:var(--sh);margin-bottom:10px;overflow:hidden}.mh .mt{margin:0;padding:7px 14px;font-size:12px;font-weight:600;color:var(--mu);text-align:center;background:var(--soft)}
.mr{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;padding:12px 28px}.tm2{display:flex;align-items:center;justify-content:space-between;gap:14px;min-width:0}.mh img,.mh .lo{width:56px;height:56px;object-fit:contain;flex:none}.tm2 .nm{font-weight:700;font-size:16px;min-width:0}.mr .rec{font-size:11.5px;color:var(--mu);font-weight:500;margin-top:2px}
.sc2{font-size:40px;font-weight:800;line-height:1;text-align:center;letter-spacing:1px}.sc2 span{color:var(--mu);font-weight:600}.mr .st{margin-top:6px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.8px;color:var(--mu)}.mr .st.lv{color:var(--lv)}.mr .vs{text-align:center;font-size:22px;color:var(--mu);font-weight:600}
.ms{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;padding:7px 28px 9px;font-size:12px;color:var(--mu);border-top:1px solid var(--ln)}.ms>div{display:flex;flex-wrap:wrap;gap:2px 16px;align-content:flex-start}.ms>div:first-child{justify-content:flex-end}.ms span{white-space:nowrap}.ms i{font-style:normal;color:var(--tx);font-weight:600}
@media(max-width:700px){.mr{gap:8px;padding:10px 10px}.mh img,.mh .lo{width:36px;height:36px}.tm2{gap:8px}.tm2 .nm{font-size:13px}.sc2{font-size:28px}.ms{padding:6px 10px 8px;gap:0 12px}}
.note{background:var(--sf);border-radius:var(--r);box-shadow:var(--sh);padding:10px 14px;margin-bottom:6px;color:var(--mu);font-size:12.5px}@media(min-width:1060px){.mp.mp2{grid-template-columns:minmax(0,1fr) 320px}}
.lgx{overflow-x:auto}.empty{padding:20px 12px;color:var(--mu);text-align:center}.bt{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.pill{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:var(--r);background:var(--sf);box-shadow:var(--sh);font-weight:600;font-size:12.5px}.pill:hover{background:var(--soft)}.pill.main{background:var(--sel);color:var(--selx)}
.rg{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px}.rg a{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--sf);box-shadow:var(--sh);border-radius:var(--r)}.rg a:hover{background:var(--soft)}.rg b{display:block;font-size:13px}.rg small{color:var(--mu)}
footer{padding:16px 0 28px;color:var(--mu);font-size:12px}footer .w{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between}footer a{margin-left:14px}footer a:hover{color:var(--tx)}.age{margin-top:6px;font-size:11px}
@media(max-width:700px){.top nav,.top nav a{height:48px}.top nav{margin-left:0}.top nav a{padding:0 10px}.w{padding:0 8px}.top .w{gap:8px;height:48px}.brand img{height:26px;max-width:110px}.top nav a{padding:6px 9px;font-size:12.5px}.top nav a.hm{display:none}.srch{max-width:none}.pg{padding-top:8px}.lcs{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;margin:0 -8px;padding:0 8px}.lcs::-webkit-scrollbar{display:none}.lc{flex:none;width:78%;scroll-snap-align:start}.bar2 .rt{display:none}.hd .sc{font-size:30px}.hd img,.hd .lo{width:40px;height:40px}h1{font-size:16px}.tb .hid{display:none}.ln2{grid-template-columns:1fr}.m{grid-template-columns:36px minmax(0,1fr) 40px minmax(0,1fr);padding:7px 6px;gap:4px}.left,.side{position:static;max-height:none}}`
  // direcciones absolutas con el dominio real: el servidor cambia __ORIGIN__ (y __ORIGIN_ENC__ dentro de enlaces para compartir)
  const encU = s => encodeURIComponent(s).replace(/__ORIGIN__/g, '__ORIGIN_ENC__')
  const KW_BASE = ['resultados de fútbol', 'marcadores en vivo', 'partidos de hoy', 'tabla de posiciones', 'goleadores', 'ligas de fútbol', 'estadísticas de fútbol', 'fútbol en vivo', 'resultados en vivo', 'calendario de partidos']
  function shell({ title, desc, path, body, head = '', noindex = false, nav = '', kw = [], og = '' }) {
    const st = S(), c = st.colors || {}, origin = '__ORIGIN__', name = esc(st.name || 'PLANETA')
    const u2 = x => /^(https:\/\/|\/)[^\s"'<>]{1,300}$/.test(x || '') ? x : '', lt = u2(st.logoLight || st.logoDark), dk = u2(st.logoDark || st.logoLight), fav = u2(st.favicon) || lt || '/icon.svg'
    const abs = u => !u ? '' : u.startsWith('/') ? origin + u : u, ogImg = abs(u2(og || st.partidosOg || st.ogImage) || lt || dk)
    const words = [...new Set([...kw, ...String(st.partidosKeywords || '').split(','), ...String(st.seoKeywords || '').split(','), ...KW_BASE].map(x => x.trim()).filter(Boolean))].join(', ').slice(0, 400)
    const ld = { '@context': 'https://schema.org', '@type': 'WebSite', name: st.name || 'PLANETA', url: origin + '/partidos', inLanguage: 'es' }
    const site = JSON.stringify({ name: st.name || '', logoDark: dk, logoLight: lt })
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${name}</title><meta name="description" content="${esc(desc).slice(0, 300)}"><meta name="keywords" content="${esc(words)}">${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<link rel="icon" href="${esc(fav)}"><link rel="apple-touch-icon" href="${esc(fav)}"><link rel="canonical" href="${origin}${esc(path)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:type" content="website"><meta property="og:url" content="${origin}${esc(path)}"><meta property="og:site_name" content="${name}"><meta property="og:locale" content="es_LA">${ogImg ? `<meta property="og:image" content="${esc(ogImg)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(ogImg)}">` : '<meta name="twitter:card" content="summary">'}<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc).slice(0, 200)}"><meta name="theme-color" content="#0f172a">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>${head}
<style>:root{--ac:${esc(c.accent || '#2fb59a')}}${CSS}</style><script>try{var t=localStorage.getItem('portalTheme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script></head>
<body data-site='${esc(site)}'><header class="top"><div class="w"><a class="brand" href="/partidos" aria-label="${name}">${lt ? `<img class="lt" src="${esc(lt)}" alt="${name}"><img class="dk" src="${esc(dk)}" alt="">` : `<b>${name}</b>`}</a><nav aria-label="Principal"><a href="/partidos" class="${nav === 'p' ? 'on' : ''}">Resultados</a><a href="/ligas" class="${nav === 'l' ? 'on' : ''}">Ligas</a><a class="hm" href="/">Mapa</a></nav><div class="srch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="search" data-search placeholder="Buscar equipo o liga" aria-label="Buscar equipo o liga"></div><button class="ib" data-theme-toggle type="button" aria-label="Cambiar tema claro u oscuro"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor"/></svg></button></div></header>
<div class="pg"><div class="w">${body}</div></div>
<footer><div class="w"><span>${name} · Resultados, tablas y estadísticas de fútbol. Datos de ESPN.</span><span><a href="/partidos">Resultados</a><a href="/ligas">Ligas</a><a href="/">Mapa</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a></span></div></footer><script type="module" src="/portal.js"></script></body></html>`
  }
  // botones para compartir: la tarjeta con tu marca (la misma del mapa) y enlaces directos a las redes
  const SOC = {'wa': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#25d366"/><path d="M12 5.6a6.4 6.4 0 0 0-5.5 9.7L5.6 18.4l3.2-.9A6.4 6.4 0 1 0 12 5.6Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.6 9.2c.2 2.2 2 4.3 4.7 5.2l1-1.2-1.7-.9-.8.7c-.8-.4-1.6-1.2-2-2l.7-.8-.8-1.8Z" fill="#fff"/></svg>', 'fb': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877f2"/><path d="M13.4 19v-6.2h2.1l.4-2.5h-2.5V8.7c0-.7.3-1.2 1.3-1.2h1.3V5.3c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.200-3.2 3.300v1.800H8.800v2.500h2.100V19h2.500Z" fill="#fff"/></svg>', 'x': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#111"/><path d="M7.200 7.200l9.600 9.600M16.800 7.200l-9.600 9.600" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>', 'tg': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#29a9eb"/><path d="M18.600 6.200 5.400 11.300c-.9.300-.9.900-.2 1.100l3.300 1 1.300 3.900c.2.500.3.600.7.600.3 0 .5-.1.700-.3l1.800-1.700 3.400 2.500c.6.300 1.100.2 1.300-.6l2.200-10.500c.3-1-.4-1.500-1.300-1.100Zm-9 6 6.900-4.300c.3-.2.600-.1.400.1l-5.600 5.100-.2 2.300-1.500-3.200Z" fill="#fff"/></svg>', 'cp': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'}
  const shareBar = (url, text, m, city) => `<div class="sh">${m ? `<button class="main" type="button" data-share data-url="__ORIGIN__${esc(url)}" data-text="${esc(text)}" data-city="${esc(city || '')}" data-m="${esc(JSON.stringify(m))}">Compartir tarjeta</button>` : ''}<div class="ico"><a target="_blank" rel="noopener" title="WhatsApp" aria-label="Compartir en WhatsApp" href="https://wa.me/?text=${encU(text + ' __ORIGIN__' + url)}">${SOC.wa}</a><a target="_blank" rel="noopener" title="Facebook" aria-label="Compartir en Facebook" href="https://www.facebook.com/sharer/sharer.php?u=${encU('__ORIGIN__' + url)}">${SOC.fb}</a><a target="_blank" rel="noopener" title="X" aria-label="Compartir en X" href="https://twitter.com/intent/tweet?text=${encU(text)}&url=${encU('__ORIGIN__' + url)}">${SOC.x}</a><a target="_blank" rel="noopener" title="Telegram" aria-label="Compartir en Telegram" href="https://t.me/share/url?url=${encU('__ORIGIN__' + url)}&text=${encU(text)}">${SOC.tg}</a><button type="button" title="Copiar enlace" aria-label="Copiar enlace" data-copy="__ORIGIN__${esc(url)}">${SOC.cp}</button></div></div>`
  const logoOf = u => img(u) ? `<img src="${esc(img(u))}" alt="" loading="lazy" width="16" height="16">` : '<span class="lo"></span>'
  function matchRow(r) {
    const cls = isLive(r) ? 'lv' : isDone(r) ? 'fn' : 'nx', hw = isDone(r) && r.gh > r.ga, aw = isDone(r) && r.ga > r.gh
    return `<a class="m ${cls}" href="${esc(matchUrl(r))}"><span class="t">${isLive(r) ? '<i></i>' : ''}${esc(stLabel(r))}</span><span class="tm h${hw ? ' w2' : isDone(r) && aw ? ' lo2' : ''}"><span>${esc(tn(r.home))}</span>${logoOf(r.hl)}</span><span class="sc">${r.gh == null ? '–' : r.gh + '-' + r.ga}</span><span class="tm${aw ? ' w2' : isDone(r) && hw ? ' lo2' : ''}">${logoOf(r.al)}<span>${esc(tn(r.away))}</span></span></a>`
  }
  const TOPORDER = Object.keys(LG)
  function groups(rows) {
    const g = new Map()
    for (const r of rows) { const k = r.slug || ('x|' + (r.league || '')); if (!g.has(k)) g.set(k, { slug: r.slug, league: lgName(r), country: r.country, rows: [] }); g.get(k).rows.push(r) }
    const rank = x => { const i = TOPORDER.indexOf(x.slug); return i < 0 ? 999 : i }
    return [...g.values()].sort((a, b) => (b.rows.some(isLive) - a.rows.some(isLive)) || rank(a) - rank(b) || b.rows.length - a.rows.length || a.league.localeCompare(b.league))
  }
  const leagueBlock = (g, open) => `<details class="lg"${open ? ' open' : ''}><summary>${badge(g.slug, g.league)}<span>${esc(g.league)}</span>${g.slug ? `<small>${esc(lgRegion(g.slug))}</small>` : ''}${g.rows.some(isLive) ? `<small class="lvc">● ${g.rows.filter(isLive).length} en vivo</small>` : ''}<small>${g.rows.length}</small>${g.slug ? `<a class="mu" href="/liga/${esc(g.slug)}" style="font-size:11.5px;font-weight:600">Tabla</a>` : ''}</summary><div class="gr">${g.rows.map(matchRow).join('')}</div></details>`
  // fechas: una sola fila corta (se desliza en el celular)
  const dayNav = cur => {
    const out = [], t0 = now(), shift = (d, n) => dayOf(Date.parse(d + 'T12:00:00Z') + n * 864e5), lab = n => n === 0 ? 'Hoy' : n === -1 ? 'Ayer' : n === 1 ? 'Mañana' : ''
    const a = `<a class="ar" href="/partidos/${shift(cur, -1)}" aria-label="Día anterior">‹</a>`, b = `<a class="ar" href="/partidos/${shift(cur, 1)}" aria-label="Día siguiente">›</a>`
    for (let i = -3; i <= 6; i++) { const d = dayOf(t0 + i * 864e5), dt = new Date(d + 'T12:00:00Z'); out.push(`<a href="${i === 0 ? '/partidos' : '/partidos/' + d}" class="${d === cur ? 'on' : ''}">${lab(i) || esc(dt.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).replace('.', ''))}</a>`) }
    return `<span class="grp">${a}${out.join('')}${b}</span><span class="grp"><input class="dp" type="date" data-date value="${esc(cur)}" aria-label="Elegir fecha"></span>`
  }
  const liveCard = r => `<a class="lc" href="${esc(matchUrl(r))}"><div class="h"><span>${esc(lgName(r))}</span><b>● ${esc(stLabel(r))}</b></div><div class="r">${logoOf(r.hl)}<span>${esc(tn(r.home))}</span><em>${r.gh ?? 0}</em></div><div class="r">${logoOf(r.al)}<span>${esc(tn(r.away))}</span><em>${r.ga ?? 0}</em></div></a>`
  // columna izquierda: competiciones (principales y por región)
  function competitions(active) {
    const rows = db.prepare("SELECT slug, MAX(league) league, COUNT(*) n FROM match_archive WHERE slug != '' AND day >= ? GROUP BY slug").all(dayOf(now() - 7 * 864e5)).map(r => ({ ...r, name: lgName(r) }))
    const top = rows.filter(r => LG[r.slug]).sort((a, b) => TOPORDER.indexOf(a.slug) - TOPORDER.indexOf(b.slug)).slice(0, 14), byReg = new Map()
    for (const r of rows) { if (top.includes(r)) continue; const g = lgRegion(r.slug); if (!byReg.has(g)) byReg.set(g, []); byReg.get(g).push(r) }
    const a = r => `<a href="/liga/${esc(r.slug)}" ${r.slug === active ? 'style="font-weight:700"' : ''}>${badge(r.slug, r.name)}<span>${esc(r.name)}</span><small>${r.n}</small></a>`
    return `<div class="box"><h4>Competiciones</h4>${top.map(a).join('')}${[...byReg.entries()].map(([g, ls]) => `<details><summary>${esc(g)} <small class="mu" style="margin-left:auto">${ls.length}</small></summary>${ls.sort((x, y) => x.name.localeCompare(y.name)).map(r => `<a href="/liga/${esc(r.slug)}"><span>${esc(r.name)}</span><small>${r.n}</small></a>`).join('')}</details>`).join('')}<a href="/ligas">Ver todas las ligas <small>›</small></a></div>`
  }

  // ---- tabla de posiciones (ESPN, se pide cuando alguien abre la liga y se guarda 6 horas) ----
  const stCache = new Map()
  async function standings(slug, ms = 8000) {
    const c = stCache.get(slug); if (c && now() - c.t < 6 * 3600e3) return c.v
    let v = null
    try {
      const r = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${encodeURIComponent(slug)}/standings`, { headers: { 'User-Agent': 'Mozilla/5.0 (tabla de posiciones)' }, signal: AbortSignal.timeout(ms) })
      if (r.ok) { const d = await r.json(), groups = d?.children?.length ? d.children : [d]
        v = groups.map(g => ({ name: g.name || '', rows: (g.standings?.entries || []).map(e => { const s = {}; for (const x of e.stats || []) s[x.name] = x.value; return { team: e.team?.displayName || '', logo: img(e.team?.logos?.[0]?.href), pj: s.gamesPlayed, g: s.wins, e: s.ties ?? s.draws, p: s.losses, gf: s.pointsFor, gc: s.pointsAgainst, dg: s.pointDifferential, pts: s.points, rank: s.rank, color: hex(e.note?.color), note: String(e.note?.description || '') } }).filter(x => x.team) })).filter(g => g.rows.length) }
    } catch { /* sin tabla */ }
    stCache.set(slug, { t: now(), v }); if (stCache.size > 150) stCache.delete(stCache.keys().next().value)
    return v
  }
  const num = x => (x == null || Number.isNaN(+x)) ? '–' : esc(Math.round(+x))
  const sgn = x => { const n = Math.round(+x); return Number.isNaN(n) ? '–' : `<span class="${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">${n > 0 ? '+' + n : n}</span>` }
  const evOf = r => { try { return JSON.parse(r.ev || '[]') } catch { return [] } }
  // ---- estadísticas calculadas con los partidos guardados (resultados, goleadores, tarjetas, tabla propia) ----
  const finished = rows => rows.filter(r => isDone(r) && r.gh != null && r.ga != null)
  function teamAgg(rows) {
    const t = new Map(), T = n => { if (!t.has(n)) t.set(n, { team: n, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0, y: 0, r: 0, btts: 0, o25: 0, cs: 0 }); return t.get(n) }
    for (const r of finished(rows)) {
      for (const [n, gf, gc] of [[r.home, r.gh, r.ga], [r.away, r.ga, r.gh]]) { const x = T(n); x.pj++; x.gf += gf; x.gc += gc; if (gf > gc) { x.g++; x.pts += 3 } else if (gf === gc) { x.e++; x.pts++ } else x.p++; if (gf > 0 && gc > 0) x.btts++; if (gf + gc > 2) x.o25++; if (gc === 0) x.cs++ }
      for (const e of evOf(r)) if (e.type === 'Card') { const x = T(e.team || ''); if (/red/i.test(e.d)) x.r++; else x.y++ }
    }
    return [...t.values()].filter(x => x.team).sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf)
  }
  function scorers(rows) {
    const m = new Map()
    for (const r of rows) for (const e of evOf(r)) if (e.type === 'Goal' && e.d !== 'Missed Penalty' && e.d !== 'Own Goal' && e.p) { const k = e.p + '|' + e.team; const o = m.get(k) || { p: e.p, team: e.team, g: 0, pen: 0, n: new Set() }; o.g++; if (e.d === 'Penalty') o.pen++; o.n.add(r.id); m.set(k, o) }
    return [...m.values()].map(o => ({ ...o, pj: o.n.size })).sort((a, b) => b.g - a.g || a.pen - b.pen || a.p.localeCompare(b.p))
  }
  function carders(rows) {
    const m = new Map()
    for (const r of rows) for (const e of evOf(r)) if (e.type === 'Card' && e.p) { const k = e.p + '|' + e.team; const o = m.get(k) || { p: e.p, team: e.team, y: 0, r: 0 }; if (/red/i.test(e.d)) o.r++; else o.y++; m.set(k, o) }
    return [...m.values()].sort((a, b) => (b.r * 3 + b.y) - (a.r * 3 + a.y))
  }
  function leagueKpi(rows) {
    const f = finished(rows), n = f.length; if (!n) return null
    const goals = f.reduce((s, r) => s + r.gh + r.ga, 0), hw = f.filter(r => r.gh > r.ga).length, dw = f.filter(r => r.gh === r.ga).length, bt = f.filter(r => r.gh > 0 && r.ga > 0).length, o = f.filter(r => r.gh + r.ga > 2).length
    const cards = f.reduce((s, r) => s + evOf(r).filter(e => e.type === 'Card').length, 0), pc = x => Math.round(x / n * 100) + '%'
    return [['Partidos', n], ['Goles por partido', (goals / n).toFixed(2)], ['Gana local', pc(hw)], ['Empate', pc(dw)], ['Gana visita', pc(n - hw - dw)], ['Ambos anotan', pc(bt)], ['Más de 2.5 goles', pc(o)], ['Tarjetas por partido', (cards / n).toFixed(1)]]
  }
  // racha: últimos 5 partidos terminados del equipo (G ganó, E empató, P perdió); slug opcional
  function form(team, slug, notId) {
    const rs = db.prepare(`SELECT home, gh, ga FROM match_archive WHERE ${slug ? 'slug = ? AND ' : ''}status IN (${DONE.map(() => '?').join(',')}) AND (home = ? OR away = ?) AND gh IS NOT NULL AND id != ? ORDER BY kickoff DESC LIMIT 5`).all(...(slug ? [slug] : []), ...DONE, team, team, notId || 0)
    return rs.reverse().map(r => { const mine = r.home === team ? r.gh : r.ga, other = r.home === team ? r.ga : r.gh; return mine > other ? 'g' : mine === other ? 'e' : 'p' })
  }
  const fmHtml = f => f.length ? `<span class="fm">${f.map(k => `<i class="${k}">${k === 'g' ? 'G' : k === 'e' ? 'E' : 'P'}</i>`).join('')}</span>` : ''
  // tabla de posiciones: la de ESPN; si no hay, la calculada con los partidos guardados (se avisa)
  const stTable = (slug, g, { mini = false, hl = [] } = {}) => `<div class="lg lgx">${g.name && !mini ? `<h3>${esc(g.name)}</h3>` : ''}<table class="tb"><thead><tr><th>#</th><th class="tn">Equipo</th><th>PJ</th>${mini ? '' : '<th class="hid">G</th><th class="hid">E</th><th class="hid">P</th><th class="hid">GF</th><th class="hid">GC</th>'}<th>DG</th><th>PTS</th>${mini ? '' : '<th>Últimas</th>'}</tr></thead><tbody>${(mini ? g.rows.slice(0, 8) : g.rows).map((x, i) => { const is = hl.some(h => h && x.team && (x.team === h || x.team.includes(h) || h.includes(x.team))); return `<tr class="${is ? 'hl' : ''}"><td class="rk" style="${x.color ? 'border-left-color:' + x.color : ''}">${esc(x.rank ?? i + 1)}</td><td class="tn">${img(x.logo) ? `<img src="${esc(img(x.logo))}" alt="" loading="lazy">` : ''}${esc(tn(x.team))}${!mini && x.note ? `<span class="nt">${esc(x.note)}</span>` : ''}</td><td>${num(x.pj)}</td>${mini ? '' : `<td class="hid">${num(x.g)}</td><td class="hid">${num(x.e)}</td><td class="hid">${num(x.p)}</td><td class="hid">${num(x.gf)}</td><td class="hid">${num(x.gc)}</td>`}<td>${sgn(x.dg)}</td><td class="p">${num(x.pts)}</td>${mini ? '' : `<td>${fmHtml(form(x.team, slug))}</td>`}</tr>` }).join('')}</tbody></table></div>`
  async function tablaDe(slug, rows, ms) {
    const t = await standings(slug, ms); if (t && t.length) return { groups: t, calc: false }
    const a = teamAgg(rows); return a.length ? { groups: [{ name: '', rows: a.map((x, i) => ({ team: x.team, pj: x.pj, g: x.g, e: x.e, p: x.p, gf: x.gf, gc: x.gc, dg: x.gf - x.gc, pts: x.pts, rank: i + 1 })) }], calc: true } : null
  }
  const scorersBox = (list, n = 8) => list.length ? `<table class="tb"><thead><tr><th>#</th><th class="tn">Jugador</th><th>Equipo</th><th>PJ</th><th>Goles</th></tr></thead><tbody>${list.slice(0, n).map((x, i) => `<tr><td class="rk">${i + 1}</td><td class="tn">${esc(x.p)}</td><td>${esc(tn(x.team))}</td><td>${x.pj}</td><td class="p">${x.g}${x.pen ? ` <span class="mu" style="font-weight:500">(${x.pen}p)</span>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Todavía no hay goleadores registrados en el archivo.</div>'

  async function dayPage(day, isToday) {
    warmLogos().catch(() => {})
    const rows = db.prepare('SELECT * FROM match_archive WHERE day = ? ORDER BY kickoff, id').all(day)
    const nLive = rows.filter(isLive).length, nFin = rows.filter(isDone).length, nNx = rows.length - nLive - nFin
    const gs = groups(rows), live = rows.filter(isLive), st = S()
    // lado derecho: clasificación y goleadores de la liga más importante del día
    let feat = null; const fl = gs.find(g => LG[g.slug]); if (fl) { const all = db.prepare('SELECT * FROM match_archive WHERE slug = ?').all(fl.slug); const t = await tablaDe(fl.slug, all, 2500); if (t) feat = { slug: fl.slug, name: fl.league, t: t.groups[0], sc: scorers(all) } }
    const topN = x => { const i = TOPORDER.indexOf(x.slug); return i >= 0 && i < 12 }
    const body = `<div class="hrow"><h1>${isToday ? 'Resultados de fútbol de hoy' : 'Resultados del ' + esc(longDay(day))}</h1><span class="sub">${esc(longDay(day))} · ${rows.length} partido${rows.length === 1 ? '' : 's'}</span></div>
${live.length ? `<section class="livebox"><h2><i></i>En vivo ahora · ${live.length}</h2><div class="lcs">${live.slice(0, 24).map(liveCard).join('')}</div></section>` : ''}
<input class="f" type="radio" name="f" id="f-all" checked><input class="f" type="radio" name="f" id="f-live"><input class="f" type="radio" name="f" id="f-fin"><input class="f" type="radio" name="f" id="f-nxt">
<div class="bar2">${dayNav(day)}<span class="grp"><label for="f-all">Todos ${rows.length}</label><label class="lvl" for="f-live">En vivo <b>${nLive}</b></label><label for="f-fin">Finalizados ${nFin}</label><label for="f-nxt">Próximos ${nNx}</label></span><span class="rt grp"><button type="button" data-expand="all">Abrir todo</button><button type="button" data-expand="none">Cerrar todo</button></span></div>
<div class="g3"><aside class="left">${competitions('')}</aside><main><details class="compd"><summary style="padding:8px 10px;font-weight:700;cursor:pointer">Competiciones</summary>${competitions('').replace('<div class="box">', '<div>')}</details>${rows.length ? gs.map(g => leagueBlock(g, g.rows.some(isLive) || topN(g) || gs.length <= 5)).join('') : '<div class="lg"><div class="empty">Todavía no hay partidos guardados para este día.</div></div>'}</main>
<aside class="side">${feat ? `<div class="box"><h4>Clasificación · ${esc(feat.name)}</h4>${stTable(feat.slug, feat.t, { mini: true }).replace(/^<div class="lg lgx">/, '<div class="lgx">')}<a href="/liga/${esc(feat.slug)}">Tabla completa <small>›</small></a></div>
<div class="box"><h4>Goleadores · ${esc(feat.name)}</h4>${scorersBox(feat.sc, 6)}<a href="/liga/${esc(feat.slug)}">Ver todos <small>›</small></a></div>` : ''}</aside></div>`
    const t = isToday && st.partidosTitle ? String(st.partidosTitle) : isToday ? 'Resultados de fútbol de hoy: marcadores en vivo' : `Resultados del ${longDay(day)}`
    const d = isToday && st.partidosDesc ? String(st.partidosDesc) : `Resultados, marcadores en vivo, goles, tarjetas y tablas de posiciones de los partidos de fútbol del ${longDay(day)}.`
    return { status: 200, cache: isToday ? 30 : 600, html: shell({ title: t, desc: d, path: isToday ? '/partidos' : '/partidos/' + day, body, nav: 'p', noindex: !rows.length, kw: gs.slice(0, 8).map(g => g.league) }) }
  }
  const EVL = e => e.type === 'Goal' ? (e.d === 'Own Goal' ? 'Autogol' : e.d === 'Penalty' ? 'Gol de penal' : e.d === 'Missed Penalty' ? 'Penal fallado' : 'Gol') : e.type === 'Card' ? (/red/i.test(e.d) ? 'Tarjeta roja' : 'Tarjeta amarilla') : ''
  const sv = x => { const n = parseFloat(String(x).replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
  const nm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''), sameT = (a, b) => { const x = nm(a), y = nm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }
  async function matchPage(r) {
    let ev = evOf(r).filter(e => EVL(e))
    const [det, tabla] = await Promise.all([detail(r).catch(() => null), r.slug ? tablaDe(r.slug, db.prepare('SELECT * FROM match_archive WHERE slug = ?').all(r.slug), 3000) : null])
    const tline = [...ev.map(e => ({ ...e, t: e.t, o: e.t * 100 + (e.x || 0) })), ...((det?.subs || []).map(x => ({ sub: 1, t: x.t, o: x.t * 100, inn: x.inn, out: x.out, team: x.team })))].sort((a, b) => a.o - b.o)
    if (!ev.length && det?.evs?.length) ev = det.evs.map(e => ({ t: e.time.elapsed, x: e.time.extra, type: e.type, d: e.detail, team: e.team.name, p: e.player.name })).filter(e => EVL(e))
    const title = `${tn(r.home)} ${r.gh == null ? 'vs' : r.gh + ' - ' + r.ga} ${tn(r.away)}`, canonical = matchUrl(r)
    const ld = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${tn(r.home)} vs ${tn(r.away)}`, startDate: new Date(r.kickoff).toISOString(), sport: 'Fútbol',
      eventStatus: r.status === 'PST' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled', homeTeam: { '@type': 'SportsTeam', name: tn(r.home) }, awayTeam: { '@type': 'SportsTeam', name: tn(r.away) } }
    if (r.venue) ld.location = { '@type': 'Place', name: r.venue, address: r.city || r.country || r.venue }
    if (r.slug) ld.superEvent = { '@type': 'SportsEvent', name: lgName(r) }
    const same = r.slug ? db.prepare('SELECT * FROM match_archive WHERE slug = ? AND day = ? AND id != ? ORDER BY kickoff LIMIT 8').all(r.slug, r.day, r.id) : []
    const h2h = db.prepare(`SELECT * FROM match_archive WHERE id != ? AND ((home = ? AND away = ?) OR (home = ? AND away = ?)) ORDER BY kickoff DESC LIMIT 6`).all(r.id, r.home, r.away, r.away, r.home)
    const big = u => img(u) ? `<img src="${esc(img(u))}" alt="" width="48" height="48">` : '<span class="lo"></span>'
    const stats = (det?.stats || []).map(x => ({ ...x, o: (STAT_ES[x.k] || [x.l, 99])[1], label: (STAT_ES[x.k] || [x.l])[0] })).sort((a, b) => a.o - b.o).slice(0, 40)
    const show = (v, lab) => { const t = String(v).replace(/\.0+$/, '').replace(/%$/, ''); return /%/.test(lab) ? t + '%' : t }
    const bar = x => { const h = sv(x.h), a = sv(x.a), t = h + a, hp = t ? Math.round(h / t * 100) : 50; return `<div class="sb"><div class="r"><b>${esc(show(x.h, x.label))}</b><span>${esc(x.label.replace(' (%)', ''))}</span><b>${esc(show(x.a, x.label))}</b></div><div class="bar"><span class="bh"><i class="h" style="width:${hp}%"></i></span><span class="ba"><i class="a" style="width:${100 - hp}%"></i></span></div></div>` }
    // cancha: la formación (4-3-3) reparte a los titulares por líneas; si falta el dato se usa la lista
    const pitch = (k, cls) => {
      const d = det?.lineups?.[k], st = (d?.players || []).filter(p => p.st).sort((a, b) => (a.fp || 99) - (b.fp || 99)), fm = String(d?.formation || '').split('-').map(Number).filter(n => n > 0)
      if (!d || st.length !== 11 || fm.reduce((a, b) => a + b, 0) !== 10) return ''
      const rows = [[st[0]]]; let at = 1; for (const n of fm) { rows.push(st.slice(at, at + n)); at += n }
      const top = [88, ...rows.slice(1).map((_, i) => 72 - i * (56 / Math.max(1, rows.length - 2)))]
      return `<div class="pitch">${rows.map((row, ri) => row.map((p, ci) => `<div class="pp ${cls}" style="left:${(ci + 1) / (row.length + 1) * 100}%;top:${top[ri]}%"><b>${esc(p.n)}</b><span>${esc(p.name.split(' ').slice(-1)[0])}</span>${p.to ? `<em>▼${esc(p.to)}'</em>` : ''}</div>`).join('')).join('')}</div>`
    }
    const subsOf = k => { const d = det?.lineups?.[k]; const sb = (d?.players || []).filter(p => !p.st); return sb.length ? `<div class="sbs"><small>Suplentes</small>${sb.map(p => `<div class="pl2"><b>${esc(p.n)}</b><span>${esc(p.name)} <small>${esc(p.pos)}</small>${p.ti ? ` <small class="in">▲ ${esc(p.ti)}'</small>` : ''}</span></div>`).join('')}</div>` : '' }
    const lu = k => { const d = det?.lineups?.[k]; if (!d || !d.players.length) return '<small>ESPN no publicó la alineación de este partido.</small>'; const st = d.players.filter(p => p.st); return `${d.formation ? `<small>Formación ${esc(d.formation)}</small>` : ''}${st.map(p => `<div class="pl2"><b>${esc(p.n)}</b><span>${esc(p.name)} <small>${esc(p.pos)}</small>${p.to ? ` <small class="out">▼ ${esc(p.to)}'</small>` : ''}</span></div>`).join('')}` }
    const pH = pitch('home', ''), pA = pitch('away', 'aw')
    const hasLu = !!(pH && pA) || !!(det?.lineups?.home?.players?.length || det?.lineups?.away?.players?.length), noData = !hasLu && !stats.length && !tline.length
    const gl = tm => { const g = new Map(), o = []; for (const e of ev.filter(x => sameT(x.team, tm))) { const mk = `${e.t}${e.x ? '+' + e.x : ''}'`; if (e.type === 'Goal') { const k = (e.p || '—') + (e.d === 'Own Goal' ? 'a' : ''); if (!g.has(k)) { g.set(k, { p: e.p || '—', own: e.d === 'Own Goal', m: [] }); o.push(g.get(k)) } g.get(k).m.push(mk + (e.d === 'Penalty' ? ' (p)' : '')) } else o.push({ p: e.p || '—', card: /red/i.test(e.d) ? '🟥' : '🟨', m: [mk] }) } return o.map(x => `<span><i>${esc(x.p)}</i> ${esc(x.m.join(', '))} ${x.card || (x.own ? '(autogol)' : '⚽')}</span>`).join('') }
    const body = `<div class="mh"><h1 class="mt">${r.slug ? esc(lgName(r)) + ' · ' : ''}${esc(longDay(r.day))}${r.venue ? ' · ' + esc(r.venue) + (r.city ? ', ' + esc(r.city) : '') : ''}</h1>
<div class="mr"><div class="tm2">${big(r.hl)}<div class="nm" style="text-align:right">${esc(tn(r.home))}${det?.rec?.home ? `<div class="rec">${esc(det.rec.home)}</div>` : ''}</div></div>
<div>${r.gh == null ? '<div class="vs">vs</div>' : `<div class="sc2">${esc(r.gh)} <span>-</span> ${esc(r.ga)}</div>`}<div class="st${isLive(r) ? ' lv' : ''}">${esc(isLive(r) ? 'EN VIVO · ' + stLabel(r) : isDone(r) ? 'FINALIZADO' : hhmm(r.kickoff))}</div></div>
<div class="tm2"><div class="nm">${esc(tn(r.away))}${det?.rec?.away ? `<div class="rec">${esc(det.rec.away)}</div>` : ''}</div>${big(r.al)}</div></div>
${ev.length ? `<div class="ms"><div>${gl(r.home)}</div><div>${gl(r.away)}</div></div>` : ''}</div>
<div class="g3 mp${hasLu ? '' : ' mp2'}">${hasLu ? `<aside class="lu"><input class="f" type="radio" name="pt" id="pt-h" checked><input class="f" type="radio" name="pt" id="pt-a">
<div class="lg"><h3>Formaciones y alineaciones</h3>${pH && pA ? `<div class="tabs"><label for="pt-h">${esc(tn(r.home))} · ${esc(det.lineups.home.formation)}</label><label for="pt-a">${esc(tn(r.away))} · ${esc(det.lineups.away.formation)}</label></div><div class="ph"><div class="pt1">${pH}</div>${subsOf('home')}</div><div class="pa"><div class="pt1">${pA}</div>${subsOf('away')}</div>` : `<div class="ln2"><div><h5>${esc(tn(r.home))}</h5>${lu('home')}${subsOf('home')}</div><div><h5>${esc(tn(r.away))}</h5>${lu('away')}${subsOf('away')}</div></div>`}</div>
${(det?.subs || []).length ? `<div class="lg"><h3>Sustituciones</h3>${det.subs.map(x => `<div class="sbl"><b>${esc(x.t)}'</b><span><i class="in">▲ ${esc(x.inn)}</i><br><small>▼ ${esc(x.out)} · ${esc(tn(x.team))}</small></span></div>`).join('')}</div>` : ''}</aside>` : ''}
<main>
${tline.length ? `<div class="lg"><h3>Línea de tiempo</h3>${tline.length ? `<ul class="tl">${tline.map(e => e.sub ? `<li><b>${esc(e.t)}'</b><span class="sb2">⇄</span><span><i style="font-style:normal;color:var(--win)">▲ ${esc(e.inn)}</i> <small>▼ ${esc(e.out)} · ${esc(tn(e.team))}</small></span></li>` : `<li><b>${esc(e.t)}${e.x ? '+' + esc(e.x) : ''}'</b>${e.type === 'Goal' ? ICON.ball : `<i class="cd${/red/i.test(e.d) ? ' r' : ''}"></i>`}<span>${esc(e.p || tn(e.team))}${e.p && e.team ? ` <small>${esc(tn(e.team))}</small>` : ''}<small> · ${esc(EVL(e))}</small></span></li>`).join('')}</ul>` : '<div class="empty">ESPN no publicó los goles ni las tarjetas de este partido.</div>'}</div>` : ''}
${stats.length ? `<div class="lg"><h3>Estadísticas de equipo</h3>${stats.length ? `<div class="sbh"><span>${esc(tn(r.home))}</span><span>${esc(tn(r.away))}</span></div>${stats.map(bar).join('')}` : '<div class="empty">ESPN no publicó estadísticas de este partido (pasa en amistosos y ligas menores).</div>'}</div>` : ''}
${r.venue ? `<div class="lg"><h3>Información</h3><div class="empty" style="text-align:left;color:var(--tx)">${esc(r.venue)}${r.city ? ', ' + esc(r.city) : ''}${r.country ? ' · ' + esc(tn(r.country)) : ''}${det?.attendance ? '<br><span class="mu">Asistencia: ' + esc(det.attendance.toLocaleString('es-CO')) + '</span>' : ''}</div></div>` : ''}
${noData ? `<div class="note">ESPN no publicó goles, estadísticas ni alineaciones de este partido (pasa en amistosos y ligas menores). Abajo tienes la tabla y el historial.</div>${tabla ? tabla.groups.map(g => stTable(r.slug, g, { hl: [r.home, r.away] })).join('') : ''}` : ''}
</main>
<aside class="side"><div class="box"><h4>Cara a cara</h4>${h2h.length ? h2h.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} <b>${x.gh ?? '–'}–${x.ga ?? '–'}</b> ${esc(tn(x.away))}</span><small>${esc(x.day.slice(2))}</small></a>`).join('') : '<div class="empty">No hay enfrentamientos guardados entre estos equipos.</div>'}</div>
<div class="box"><h4>Forma reciente</h4><div class="ln2"><div><h5>${esc(tn(r.home))}</h5>${fmHtml(form(r.home, '', r.id)) || '<small>Sin partidos guardados.</small>'}</div><div><h5>${esc(tn(r.away))}</h5>${fmHtml(form(r.away, '', r.id)) || '<small>Sin partidos guardados.</small>'}</div></div></div>
${noData ? '' : `<div class="box"><h4>Posiciones${r.slug ? ' · ' + esc(lgName(r)) : ''}</h4>${tabla ? tabla.groups.map(g => stTable(r.slug, g, { mini: true, hl: [r.home, r.away] }).replace(/^<div class="lg lgx">/, '<div class="lgx">')).join('') + (tabla.calc ? '<div class="sub" style="padding:6px 10px">Tabla calculada con los partidos guardados (no es la oficial).</div>' : '') : '<div class="empty">La tabla de posiciones no está disponible para este torneo.</div>'}${r.slug ? `<a href="/liga/${esc(r.slug)}">Tabla y goleadores <small>›</small></a>` : ''}</div>`}
<div class="box"><h4>Compartir</h4><div style="padding:6px 10px">${shareBar(canonical, title, { h: tn(r.home), a: tn(r.away), hl: img(r.hl), al: img(r.al), gh: r.gh, ga: r.ga, st: r.status, el: r.el, ko: r.kickoff, league: lgName(r), venue: r.venue || '' }, r.city)}</div></div>
${same.length ? `<div class="box"><h4>Más de ${esc(lgName(r))}</h4>${same.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} ${x.gh == null ? 'vs' : x.gh + '–' + x.ga} ${esc(tn(x.away))}</span></a>`).join('')}</div>` : ''}
<div class="bt"><a class="pill" href="${r.day === dayOf(now()) ? '/partidos' : '/partidos/' + r.day}">Todos los partidos</a></div></aside></div>`
    return { status: 200, cache: isDone(r) ? 3600 : 30, canonical, html: shell({ title: `${title}${isDone(r) ? ' · resultado final' : isLive(r) ? ' · en vivo' : ''}`, desc: `${tn(r.home)} vs ${tn(r.away)}${r.slug ? ' (' + lgName(r) + ')' : ''}, ${longDay(r.day)}. Marcador, goles, tarjetas y estadísticas.`, path: canonical, body, nav: 'p', kw: [tn(r.home), tn(r.away), lgName(r)], head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` }) }
  }
  async function leaguePage(slug) {
    const rows = db.prepare('SELECT * FROM match_archive WHERE slug = ? ORDER BY kickoff DESC LIMIT 400').all(slug)
    if (!rows.length) return null
    const name = lgName(rows[0]), tabla = await tablaDe(slug, rows), kpi = leagueKpi(rows), sc = scorers(rows), cd = carders(rows), eq = teamAgg(rows)
    const byDay = new Map(), nx = rows.filter(r => !isDone(r) && !isLive(r)).sort((a, b) => a.kickoff - b.kickoff)
    for (const r of rows.filter(r => isDone(r) || isLive(r))) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r) }
    const pc = (a, b) => b ? Math.round(a / b * 100) + '%' : '–'
    const body = `<div style="display:flex;align-items:center;gap:12px">${badge(slug, name).replace('class="bd"', 'class="bd lg2"')}<div><h1>${esc(name)}</h1><div class="sub">${esc(lgRegion(slug))}${rows[0].country && rows[0].country !== lgRegion(slug) ? ' · ' + esc(tn(rows[0].country)) : ''}</div></div></div>
${kpi ? `<div class="kp">${kpi.map(([l, v]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>` : ''}
<input class="f" type="radio" name="l" id="l-cla" checked><input class="f" type="radio" name="l" id="l-res"><input class="f" type="radio" name="l" id="l-nxt"><input class="f" type="radio" name="l" id="l-gol"><input class="f" type="radio" name="l" id="l-tar"><input class="f" type="radio" name="l" id="l-equ">
<div class="tabs"><label for="l-cla">Clasificación</label><label for="l-res">Resultados</label><label for="l-nxt">Próximos</label><label for="l-gol">Goleadores</label><label for="l-tar">Tarjetas</label><label for="l-equ">Estadísticas de equipos</label></div>
<div class="g3"><aside class="left">${competitions(slug)}</aside><main>
<section class="pn" id="q-cla">${tabla ? tabla.groups.map(g => stTable(slug, g)).join('') + (tabla.calc ? '<div class="sub">Tabla calculada con los partidos guardados desde que se empezó a archivar (no es la oficial).</div>' : '') : '<div class="lg"><div class="empty">La tabla de posiciones no está disponible en este momento.</div></div>'}</section>
<section class="pn" id="q-res">${[...byDay.entries()].map(([d, rs]) => `<div class="mu" style="margin:8px 2px 4px;font-size:12px;font-weight:600">${esc(longDay(d))}</div><section class="lg"><div class="gr">${rs.sort((a, b) => a.kickoff - b.kickoff).map(matchRow).join('')}</div></section>`).join('') || '<div class="lg"><div class="empty">Sin resultados guardados.</div></div>'}</section>
<section class="pn" id="q-nxt">${nx.length ? `<section class="lg"><div class="gr">${nx.slice(0, 40).map(matchRow).join('')}</div></section>` : '<div class="lg"><div class="empty">No hay próximos partidos guardados.</div></div>'}</section>
<section class="pn" id="q-gol"><div class="lg lgx"><h3>Goleadores</h3>${scorersBox(sc, 30)}</div></section>
<section class="pn" id="q-tar"><div class="lg lgx"><h3>Disciplina</h3>${cd.length ? `<table class="tb"><thead><tr><th>#</th><th class="tn">Jugador</th><th>Equipo</th><th>Amarillas</th><th>Rojas</th></tr></thead><tbody>${cd.slice(0, 30).map((x, i) => `<tr><td class="rk">${i + 1}</td><td class="tn">${esc(x.p)}</td><td>${esc(tn(x.team))}</td><td>${x.y}</td><td>${x.r}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Todavía no hay tarjetas registradas en el archivo.</div>'}</div></section>
<section class="pn" id="q-equ"><div class="lg lgx"><h3>Estadísticas de equipos</h3>${eq.length ? `<table class="tb"><thead><tr><th class="tn">Equipo</th><th>PJ</th><th>GF</th><th>GC</th><th>DG</th><th class="hid">GF/PJ</th><th class="hid">GC/PJ</th><th class="hid">Portería 0</th><th class="hid">Ambos anotan</th><th class="hid">+2.5</th><th>Amar.</th><th>Rojas</th></tr></thead><tbody>${eq.map(x => `<tr><td class="tn">${esc(tn(x.team))}</td><td>${x.pj}</td><td>${x.gf}</td><td>${x.gc}</td><td>${sgn(x.gf - x.gc)}</td><td class="hid">${(x.gf / x.pj).toFixed(2)}</td><td class="hid">${(x.gc / x.pj).toFixed(2)}</td><td class="hid">${pc(x.cs, x.pj)}</td><td class="hid">${pc(x.btts, x.pj)}</td><td class="hid">${pc(x.o25, x.pj)}</td><td>${x.y}</td><td>${x.r}</td></tr>`).join('')}</tbody></table><div class="sub" style="padding:6px 10px">Calculado con los partidos guardados en el archivo.</div>` : '<div class="empty">Sin partidos terminados todavía.</div>'}</div></section>
</main><aside class="side"><div class="box"><h4>Compartir</h4><div style="padding:6px 10px">${shareBar('/liga/' + slug, name + ': resultados y tabla de posiciones', null)}</div></div><div class="box"><h4>Goleadores</h4>${scorersBox(sc, 6)}</div>${nx.length ? `<div class="box"><h4>Próximos</h4>${nx.slice(0, 6).map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} – ${esc(tn(x.away))}</span><small>${esc(x.day === dayOf(now()) ? hhmm(x.kickoff) : x.day.slice(5))}</small></a>`).join('')}</div>` : ''}</aside></div>`
    return { status: 200, cache: 600, html: shell({ title: `${name}: resultados, tabla de posiciones y goleadores`, desc: `Resultados recientes, tabla de posiciones, goleadores y estadísticas de ${name}.`, path: '/liga/' + slug, body, nav: 'l', kw: [name, 'tabla de posiciones ' + name, 'goleadores ' + name] }) }
  }
  function leaguesPage() {
    warmLogos().catch(() => {})
    const rows = db.prepare("SELECT slug, MAX(league) league, MAX(country) country, COUNT(*) n, MAX(kickoff) k FROM match_archive WHERE slug != '' GROUP BY slug").all()
    const reg = new Map()
    for (const r of rows) { const g = lgRegion(r.slug); if (!reg.has(g)) reg.set(g, []); reg.get(g).push({ ...r, name: lgName(r) }) }
    const ORDER = ['Selecciones', 'Europa', 'Sudamérica', 'Norte y Centroamérica', 'Torneos de clubes', 'Asia y Oceanía', 'África', 'Otras ligas']
    const body = `<h1>Ligas y torneos</h1><div class="sub">${rows.length} ligas con resultados guardados</div>${[...reg.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([g, ls]) => `<h2>${esc(g)}</h2><div class="rg">${ls.sort((a, b) => { const i = TOPORDER.indexOf(a.slug), j = TOPORDER.indexOf(b.slug); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || a.name.localeCompare(b.name) }).map(l => `<a href="/liga/${esc(l.slug)}">${badge(l.slug, l.name)}<span><b>${esc(l.name)}</b><small>${l.n} partido${l.n === 1 ? '' : 's'}</small></span></a>`).join('')}</div>`).join('') || '<div class="lg"><div class="empty">Todavía no hay ligas guardadas.</div></div>'}`
    return { status: 200, cache: 600, html: shell({ title: 'Ligas y torneos de fútbol: tablas, goleadores y resultados', desc: 'Todas las ligas y torneos de fútbol con sus tablas de posiciones, goleadores y resultados.', path: '/ligas', body, nav: 'l', noindex: !rows.length }) }
  }

  // ---- enrutador: devuelve { status, html, cache } o null si la ruta no es de esta sección ----
  const notFound = (path, title, msg) => ({ status: 404, html: shell({ title, desc: '', path, body: `<h1>${esc(title)}</h1><p class="mu">${esc(msg)}</p><p><a class="pill" href="/partidos">Ver resultados de hoy</a></p>`, nav: 'p', noindex: true }) })
  async function page(pathname) {
    if (S().partidosOn === false) return null
    let m
    if (pathname === '/partidos' || pathname === '/partidos/') return dayPage(dayOf(now()), true)
    if (pathname === '/ligas' || pathname === '/ligas/') return leaguesPage()
    if ((m = /^\/partidos\/(\d{4}-\d{2}-\d{2})$/.exec(pathname))) { if (isNaN(Date.parse(m[1]))) return notFound(pathname, 'Fecha no válida', 'Esa fecha no existe.'); return dayPage(m[1], m[1] === dayOf(now())) }
    if ((m = /^\/partido\/([es])(\d+)(?:-[a-z0-9-]*)?$/.exec(pathname))) { const r = db.prepare('SELECT * FROM match_archive WHERE id = ?').get(m[1] === 'e' ? -m[2] : +m[2]); return r ? matchPage(r) : notFound(pathname, 'Partido no encontrado', 'Ese partido ya no está en el archivo.') }
    if ((m = /^\/liga\/([a-z0-9._-]{1,60})$/i.exec(pathname))) return (await leaguePage(m[1])) || notFound(pathname, 'Liga no encontrada', 'Todavía no hay partidos guardados de esa liga.')
    return null
  }
  // direcciones para el sitemap
  function sitemapUrls(origin) {
    if (S().partidosOn === false) return ''
    const u = [], add = (p, lm, ch) => u.push(`<url><loc>${origin}${esc(p)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}${ch ? `<changefreq>${ch}</changefreq>` : ''}</url>`)
    add('/partidos', dayOf(now()), 'always'); add('/ligas', dayOf(now()), 'daily')
    for (let i = 1; i < 8; i++) { const d = dayOf(now() - i * 864e5); if (db.prepare('SELECT 1 FROM match_archive WHERE day = ? LIMIT 1').get(d)) add('/partidos/' + d, d) }
    for (const r of db.prepare("SELECT slug, MAX(kickoff) k FROM match_archive WHERE slug != '' AND kickoff > ? GROUP BY slug ORDER BY k DESC LIMIT 400").all(now() - 14 * 864e5)) add('/liga/' + r.slug, dayOf(r.k), 'daily')
    for (const r of db.prepare('SELECT * FROM match_archive WHERE kickoff > ? ORDER BY kickoff DESC LIMIT 3000').all(now() - 30 * 864e5)) add(matchUrl(r), dayOf(r.updated))
    return u.join('')
  }
  const hasLive = () => !!db.prepare(`SELECT 1 FROM match_archive WHERE status IN (${LIVE.map(() => '?').join(',')}) AND kickoff > ? LIMIT 1`).get(...LIVE, now() - 5 * 3600e3)
  return { save, hide, page, sitemapUrls, finalizeOld, purgeOld, dayOf, hasLive }
}

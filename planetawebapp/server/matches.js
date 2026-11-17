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
    if (d && (done ? d.stats?.length : age < 60e3)) return d
    if (!d && done && age < 6 * 3600e3 && r.fetched) return null   // ya se intentó y ESPN no tiene datos de este partido
    const k = r.id; if (detCache.has(k)) return detCache.get(k)
    const p = (async () => { try { const v = await Promise.race([ESPN.summary(r.slug, r.eid), new Promise((_, no) => setTimeout(() => no(new Error('tarda')), 5000))]); db.prepare('UPDATE match_archive SET detail = ?, fetched = ? WHERE id = ?').run(JSON.stringify(v), now(), r.id); return v } catch { db.prepare('UPDATE match_archive SET fetched = ? WHERE id = ?').run(now(), r.id); return d } finally { setTimeout(() => detCache.delete(k), 30e3) } })()
    detCache.set(k, p); return p
  }

  // ---- presentación: portal de resultados claro y sobrio (oscuro automático si el equipo lo usa) ----
  const stLabel = r => LIVE.includes(r.status) ? (r.status === 'HT' ? 'ENT' : (r.el ? r.el + "'" : 'VIVO')) : DONE.includes(r.status) ? (r.status === 'PEN' ? 'FIN·P' : r.status === 'AET' ? 'FIN·PR' : 'FIN') : r.status === 'PST' ? 'APL' : hhmm(r.kickoff)
  const isLive = r => LIVE.includes(r.status), isDone = r => DONE.includes(r.status)
  const hex = c => /^#?[0-9a-f]{6}$/i.test(String(c || '')) ? '#' + String(c).replace('#', '') : ''
  const ICON = { ball: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6.2 3.3 2.4-1.3 3.9H10l-1.3-3.9L12 8.2Z" fill="currentColor"/></svg>' }
  const badge = (slug, label) => { if (!slug) return `<span class="bd" style="background:#7a8699;color:#fff">${ICON.ball.replace('class="ic"', 'class="ic" style="color:#fff"')}</span>`; let h = 0; for (const ch of slug || label || '') h = (h * 31 + ch.charCodeAt(0)) % 360; const w = String(label || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(x => x.length > 1 || /\d/.test(x)); const ini = ((w[0] || '?')[0] + ((w[1] || '')[0] || (w[0] || '?')[1] || '')).toUpperCase(); return `<span class="bd" style="background:hsl(${h} 48% 38%)">${esc(ini)}</span>` }
  function shell({ title, desc, path, body, head = '', noindex = false, nav = '' }) {
    const st = S(), c = st.colors || {}, origin = '__ORIGIN__', name = esc(st.name || 'PLANETA'), logo = img(st.logoLight || st.logoDark || st.favicon)
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${name}</title><meta name="description" content="${esc(desc).slice(0, 300)}">${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<link rel="canonical" href="${origin}${esc(path)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${name}"><meta name="theme-color" content="#0b2545">${head}
<style>:root{color-scheme:light dark;--bg:#f2f4f8;--sf:#fff;--tx:#0e1a2b;--mu:#5b6b82;--ln:#e3e8ef;--nav:#0b2545;--lk:#0b5cab;--ac:${esc(c.accent || '#2fb59a')};--lv:#d92d20;--win:#12805c;--soft:#f7f9fc;--sh:0 1px 2px rgba(16,24,40,.06);--sel:#0b2545;--selx:#fff}
@media(prefers-color-scheme:dark){:root{--bg:${esc(c.bg || '#0a0f1a')};--sf:${esc(c.surface || '#111b2e')};--tx:${esc(c.text || '#eef1f4')};--mu:${esc(c.muted || '#8a94a0')};--ln:rgba(255,255,255,.09);--nav:#060b14;--lk:#8cc0ff;--win:#3ecf8e;--soft:rgba(255,255,255,.03);--sh:none;--sel:${esc(c.accent || '#5cc8b0')};--selx:#06201a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums}a{color:inherit;text-decoration:none}
.w{max-width:1180px;margin:0 auto;padding:0 18px}
.top{background:var(--nav);color:#fff}.top .w{display:flex;align-items:center;gap:26px;height:62px}.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;letter-spacing:.2px}.brand img{height:30px;width:auto;display:block}
.top nav{display:flex;gap:4px;flex:1}.top nav a{padding:8px 14px;border-radius:8px;font-weight:600;font-size:14px;color:rgba(255,255,255,.78)}.top nav a:hover{color:#fff;background:rgba(255,255,255,.08)}.top nav a.on{color:#fff;background:rgba(255,255,255,.14)}
.cta{padding:9px 16px;border-radius:8px;background:var(--ac);color:#06201a;font-weight:700;font-size:14px}
.pg{padding:22px 0 56px}h1{font-size:26px;margin:0 0 4px;font-weight:700;letter-spacing:-.3px}h2{font-size:12px;margin:26px 0 10px;color:var(--mu);font-weight:700;letter-spacing:1px;text-transform:uppercase}.mu{color:var(--mu)}.sub{color:var(--mu);margin-bottom:6px}
.days{display:flex;gap:8px;overflow-x:auto;padding:14px 0 4px;scrollbar-width:none}.days::-webkit-scrollbar{display:none}.days a{flex:none;min-width:68px;text-align:center;padding:8px 8px;border-radius:10px;background:var(--sf);border:1px solid var(--ln);line-height:1.2;box-shadow:var(--sh)}.days a small{display:block;font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.6px}.days a b{font-size:14px}.days a.on{background:var(--sel);border-color:var(--sel);color:var(--selx)}.days a.on small{color:var(--selx);opacity:.75}
.fl{display:flex;gap:8px;margin:12px 0 4px;flex-wrap:wrap}.fl label,.tabs label{cursor:pointer;padding:7px 14px;border-radius:999px;background:var(--sf);border:1px solid var(--ln);font-size:13px;font-weight:600;color:var(--mu)}input.f{position:absolute;opacity:0;pointer-events:none}
body:has(#f-all:checked) label[for=f-all],body:has(#f-live:checked) label[for=f-live],body:has(#f-fin:checked) label[for=f-fin],body:has(#f-nxt:checked) label[for=f-nxt]{background:var(--sel);color:var(--selx);border-color:var(--sel)}
body:has(#f-live:checked) .m:not(.lv),body:has(#f-fin:checked) .m:not(.fn),body:has(#f-nxt:checked) .m:not(.nx){display:none}
body:has(#f-live:checked) .lg:not(:has(.m.lv)),body:has(#f-fin:checked) .lg:not(:has(.m.fn)),body:has(#f-nxt:checked) .lg:not(:has(.m.nx)){display:none}
.cols{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start;margin-top:14px}@media(min-width:960px){.cols{grid-template-columns:minmax(0,1fr) 330px}.cols.lgp{grid-template-columns:minmax(0,1fr) 460px}}
.lg{background:var(--sf);border:1px solid var(--ln);border-radius:12px;margin:0 0 12px;overflow:hidden;box-shadow:var(--sh)}.lg>h3{display:flex;align-items:center;gap:10px;margin:0;padding:11px 14px;font-size:14px;font-weight:700;background:var(--soft);border-bottom:1px solid var(--ln)}.lg>h3 small{color:var(--mu);font-weight:500;font-size:12px;margin-left:auto}.lg>h3 a:hover{color:var(--lk)}
.bd{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;color:#fff;font-size:11px;font-weight:700;flex:none;letter-spacing:.3px}.bd.lg2{width:44px;height:44px;border-radius:11px;font-size:16px}
.m{display:grid;grid-template-columns:54px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--ln)}.m:last-child{border-bottom:0}.m:hover{background:var(--soft)}
.m .t{font-size:12px;color:var(--mu);font-weight:600;text-align:center}.m.lv .t{color:var(--lv);display:flex;flex-direction:column;align-items:center;gap:3px;font-weight:700}.m.lv .t i{width:6px;height:6px;border-radius:50%;background:var(--lv);animation:pl 1.4s infinite}@keyframes pl{50%{opacity:.25}}
.m .tms{display:flex;flex-direction:column;gap:6px;min-width:0}.m .tm{display:flex;align-items:center;gap:9px;min-width:0}.m .tm span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.m img,.m .lo{width:20px;height:20px;object-fit:contain;flex:none}.lo{border-radius:50%;background:var(--ln);display:inline-block}
.m .sc{display:flex;flex-direction:column;gap:6px;text-align:right;font-weight:700}.m.lv .sc{color:var(--lv)}.m.fn .tm.lo2{color:var(--mu)}.m .tm.w2{font-weight:700}
.side .box{background:var(--sf);border:1px solid var(--ln);border-radius:12px;margin-bottom:12px;overflow:hidden;box-shadow:var(--sh)}.side .box h4{margin:0;padding:11px 14px;font-size:12px;color:var(--mu);letter-spacing:1px;text-transform:uppercase;background:var(--soft);border-bottom:1px solid var(--ln)}.side .box>a{display:flex;align-items:center;gap:10px;padding:9px 14px;font-size:14px;border-bottom:1px solid var(--ln)}.side .box>a:last-child{border-bottom:0}.side .box>a:hover{background:var(--soft)}.side .box>a small{margin-left:auto;color:var(--mu)}
.hd{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;text-align:center;background:var(--sf);border:1px solid var(--ln);border-radius:14px;padding:24px 12px;margin:16px 0;box-shadow:var(--sh)}.hd img,.hd .lo{width:60px;height:60px;object-fit:contain;margin:0 auto;display:block}.hd .n{font-weight:700;margin-top:8px;font-size:15px}.hd .sc{font-size:42px;font-weight:800;letter-spacing:1px;line-height:1}.hd .st{margin-top:8px;font-size:12px;font-weight:700;letter-spacing:.9px;color:var(--mu)}.hd .st.lv{color:var(--lv)}.hd .vs{font-size:22px;color:var(--mu);font-weight:600}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.pn{display:none}
body:has(#t-res:checked) label[for=t-res],body:has(#t-est:checked) label[for=t-est],body:has(#t-ali:checked) label[for=t-ali],body:has(#t-tab:checked) label[for=t-tab]{background:var(--sel);color:var(--selx);border-color:var(--sel)}
body:has(#t-res:checked) #p-res,body:has(#t-est:checked) #p-est,body:has(#t-ali:checked) #p-ali,body:has(#t-tab:checked) #p-tab{display:block}
.tl{list-style:none;margin:0;padding:0}.tl li{display:grid;grid-template-columns:44px 24px 1fr;gap:8px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--ln)}.tl li:last-child{border-bottom:0}.tl b{color:var(--mu);font-weight:600;font-size:13px}.tl small{color:var(--mu)}.ic{width:18px;height:18px;display:block;color:var(--win)}.cd{width:11px;height:15px;border-radius:2px;display:block;background:#f5b800}.cd.r{background:#d92d20}
.sb{padding:12px 14px;border-bottom:1px solid var(--ln)}.sb:last-child{border-bottom:0}.sb .r{display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-bottom:6px}.sb .r span{color:var(--mu);font-weight:600;font-size:12.5px}.sb .bar{display:flex;gap:4px;height:6px}.sb .bar i{display:block;border-radius:3px;height:6px}.sb .bar i.h{background:var(--lk)}.sb .bar i.a{background:var(--ac)}.sb .bar .bh,.sb .bar .ba{flex:1;display:flex;background:var(--ln);border-radius:3px;overflow:hidden}.sb .bar .bh{justify-content:flex-end}
.ln2{display:grid;grid-template-columns:1fr 1fr;gap:0}.ln2>div{padding:10px 14px}.ln2>div+div{border-left:1px solid var(--ln)}.ln2 h5{margin:0 0 6px;font-size:13px}.ln2 small{color:var(--mu)}.pl2{display:flex;gap:8px;padding:5px 0;font-size:14px}.pl2 b{width:24px;color:var(--mu);font-weight:600}
.tb{width:100%;border-collapse:collapse;font-size:13.5px}.tb th{color:var(--mu);font-weight:600;font-size:11px;padding:10px 5px;text-align:center;border-bottom:1px solid var(--ln);letter-spacing:.5px;text-transform:uppercase;background:var(--soft)}.tb td{padding:10px 5px;text-align:center;border-bottom:1px solid var(--ln)}.tb tr:last-child td{border-bottom:0}.tb td.tn,.tb th.tn{text-align:left;padding-left:8px}.tb td.rk{border-left:4px solid transparent;width:34px;color:var(--mu);font-weight:600}.tb .p{font-weight:800}.tb tr.hl td{background:rgba(11,92,171,.08)}.tb .nt{display:block;font-size:11px;color:var(--mu);font-weight:500}.tb img{width:18px;height:18px;object-fit:contain;vertical-align:-4px;margin-right:8px}
.fm{display:inline-flex;gap:3px}.fm i{width:17px;height:17px;border-radius:50%;font:700 9px/17px system-ui;font-style:normal;text-align:center;color:#fff}.fm i.g{background:#12a06a}.fm i.e{background:#e0a100}.fm i.p{background:#d92d20}
.lgx{overflow-x:auto}.empty{padding:26px 14px;color:var(--mu);text-align:center}.bt{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.pill{display:inline-flex;align-items:center;height:36px;padding:0 15px;border-radius:999px;background:var(--sf);border:1px solid var(--ln);font-weight:600;font-size:13px}.pill:hover{border-color:var(--mu)}
.rg{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.rg a{display:flex;align-items:center;gap:12px;padding:13px 14px;background:var(--sf);border:1px solid var(--ln);border-radius:12px;box-shadow:var(--sh)}.rg a:hover{border-color:var(--mu)}.rg b{display:block;font-size:14px}.rg small{color:var(--mu)}
footer{border-top:1px solid var(--ln);padding:22px 0 34px;color:var(--mu);font-size:13px}footer .w{display:flex;flex-wrap:wrap;gap:8px 22px;justify-content:space-between}footer a{margin-left:16px}footer a:hover{color:var(--tx)}
@media(max-width:620px){.top .w{gap:10px}.top nav a{padding:8px 9px;font-size:13px}.brand span{display:none}.hd .sc{font-size:32px}.hd img,.hd .lo{width:46px;height:46px}h1{font-size:21px}.tb .hid{display:none}.ln2{grid-template-columns:1fr}.ln2>div+div{border-left:0;border-top:1px solid var(--ln)}}</style></head>
<body><header class="top"><div class="w"><a class="brand" href="/">${logo ? `<img src="${esc(logo)}" alt="${name}">` : ''}<span>${name}</span></a><nav aria-label="Principal"><a href="/partidos" class="${nav === 'p' ? 'on' : ''}">Resultados</a><a href="/ligas" class="${nav === 'l' ? 'on' : ''}">Ligas</a><a href="/">Mapa</a></nav><a class="cta" href="/">Ver el mapa</a></div></header>
<div class="pg"><div class="w">${body}</div></div>
<footer><div class="w"><span>${name} · Resultados y estadísticas de fútbol. Datos de ESPN.</span><span><a href="/partidos">Resultados</a><a href="/ligas">Ligas</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a></span></div></footer></body></html>`
  }
  const logoOf = u => img(u) ? `<img src="${esc(img(u))}" alt="" loading="lazy" width="20" height="20">` : '<span class="lo"></span>'
  function matchRow(r) {
    const cls = isLive(r) ? 'lv' : isDone(r) ? 'fn' : 'nx', hw = isDone(r) && r.gh > r.ga, aw = isDone(r) && r.ga > r.gh
    return `<a class="m ${cls}" href="${esc(matchUrl(r))}"><span class="t">${isLive(r) ? '<i></i>' : ''}${esc(stLabel(r))}</span><span class="tms"><span class="tm${hw ? ' w2' : isDone(r) && aw ? ' lo2' : ''}">${logoOf(r.hl)}<span>${esc(tn(r.home))}</span></span><span class="tm${aw ? ' w2' : isDone(r) && hw ? ' lo2' : ''}">${logoOf(r.al)}<span>${esc(tn(r.away))}</span></span></span><span class="sc"><span>${r.gh ?? ''}</span><span>${r.ga ?? ''}</span></span></a>`
  }
  const TOPORDER = Object.keys(LG)
  function groups(rows) {
    const g = new Map()
    for (const r of rows) { const k = r.slug || ('x|' + (r.league || '')); if (!g.has(k)) g.set(k, { slug: r.slug, league: lgName(r), country: r.country, rows: [] }); g.get(k).rows.push(r) }
    const rank = x => { const i = TOPORDER.indexOf(x.slug); return i < 0 ? 999 : i }
    return [...g.values()].sort((a, b) => (b.rows.some(isLive) - a.rows.some(isLive)) || rank(a) - rank(b) || b.rows.length - a.rows.length || a.league.localeCompare(b.league))
  }
  const leagueBlock = g => `<section class="lg"><h3>${badge(g.slug, g.league)}${g.slug ? `<a href="/liga/${esc(g.slug)}">${esc(g.league)}</a>` : esc(g.league)}${g.slug && lgRegion(g.slug) ? `<small>${esc(lgRegion(g.slug))}</small>` : ''}</h3>${g.rows.map(matchRow).join('')}</section>`
  const dayNav = cur => { const out = []; for (let i = 0; i < 7; i++) { const d = dayOf(now() - i * 864e5), dt = new Date(d + 'T12:00:00Z'); out.push(`<a href="${i === 0 ? '/partidos' : '/partidos/' + d}" class="${d === cur ? 'on' : ''}"><small>${i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : dt.toLocaleDateString('es-CO', { weekday: 'short', timeZone: 'UTC' })}</small><b>${dt.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</b></a>`) } return `<nav class="days" aria-label="Días">${out.join('')}</nav>` }

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
  // racha: últimos 5 partidos terminados del equipo en esa liga, según el archivo (G ganó, E empató, P perdió)
  function form(slug, team) {
    const rs = db.prepare(`SELECT home, gh, ga FROM match_archive WHERE slug = ? AND status IN (${DONE.map(() => '?').join(',')}) AND (home = ? OR away = ?) AND gh IS NOT NULL ORDER BY kickoff DESC LIMIT 5`).all(slug, ...DONE, team, team)
    return rs.reverse().map(r => { const mine = r.home === team ? r.gh : r.ga, other = r.home === team ? r.ga : r.gh; return mine > other ? 'g' : mine === other ? 'e' : 'p' })
  }
  const stTable = (slug, g, { mini = false, hl = [] } = {}) => `<div class="lg lgx">${g.name && !mini ? `<h3>${esc(g.name)}</h3>` : ''}<table class="tb"><thead><tr><th>#</th><th class="tn">Equipo</th><th>PJ</th>${mini ? '' : '<th class="hid">G</th><th class="hid">E</th><th class="hid">P</th><th class="hid">GF:GC</th>'}<th>DG</th><th>PTS</th>${mini ? '' : '<th>Últimas</th>'}</tr></thead><tbody>${(mini ? g.rows.slice(0, 8) : g.rows).map((x, i) => { const f = mini ? [] : form(slug, x.team), is = hl.some(h => h && x.team && (x.team === h || x.team.includes(h) || h.includes(x.team))); return `<tr class="${is ? 'hl' : ''}"><td class="rk" style="${x.color ? 'border-left-color:' + x.color : ''}">${esc(x.rank ?? i + 1)}</td><td class="tn">${img(x.logo) ? `<img src="${esc(img(x.logo))}" alt="" loading="lazy">` : ''}${esc(tn(x.team))}${!mini && x.note ? `<span class="nt">${esc(x.note)}</span>` : ''}</td><td>${num(x.pj)}</td>${mini ? '' : `<td class="hid">${num(x.g)}</td><td class="hid">${num(x.e)}</td><td class="hid">${num(x.p)}</td><td class="hid">${num(x.gf)}:${num(x.gc)}</td>`}<td>${num(x.dg)}</td><td class="p">${num(x.pts)}</td>${mini ? '' : `<td>${f.length ? `<span class="fm">${f.map(k => `<i class="${k}">${k === 'g' ? 'G' : k === 'e' ? 'E' : 'P'}</i>`).join('')}</span>` : ''}</td>`}</tr>` }).join('')}</tbody></table></div>`

  async function dayPage(day, isToday) {
    const rows = db.prepare('SELECT * FROM match_archive WHERE day = ? ORDER BY kickoff, id').all(day)
    const nLive = rows.filter(isLive).length, nFin = rows.filter(isDone).length, nNx = rows.length - nLive - nFin
    const gs = groups(rows), leagues = gs.filter(g => g.slug).slice(0, 14)
    // clasificación destacada: la primera liga importante del día que tenga tabla
    let feat = null; const fl = gs.find(g => LG[g.slug]); if (fl) { const t = await standings(fl.slug, 2500); if (t && t[0]) feat = { slug: fl.slug, name: fl.league, t: t[0] } }
    const body = `<h1>${isToday ? 'Resultados de fútbol de hoy' : 'Resultados del ' + esc(longDay(day))}</h1><div class="sub">${esc(longDay(day))} · ${rows.length} partido${rows.length === 1 ? '' : 's'}</div>${dayNav(day)}
<input class="f" type="radio" name="f" id="f-all" checked><input class="f" type="radio" name="f" id="f-live"><input class="f" type="radio" name="f" id="f-fin"><input class="f" type="radio" name="f" id="f-nxt">
<div class="fl"><label for="f-all">Todos ${rows.length}</label><label for="f-live">En vivo ${nLive}</label><label for="f-fin">Finalizados ${nFin}</label><label for="f-nxt">Próximos ${nNx}</label></div>
<div class="cols"><main>${rows.length ? gs.map(leagueBlock).join('') : '<div class="lg"><div class="empty">Todavía no hay partidos guardados para este día.</div></div>'}</main>
<aside class="side">${feat ? `<div class="box"><h4>Clasificación · ${esc(feat.name)}</h4>${stTable(feat.slug, feat.t, { mini: true }).replace(/^<div class="lg lgx">/, '<div class="lgx" style="border:0">')}<a href="/liga/${esc(feat.slug)}">Ver tabla completa <small>›</small></a></div>` : ''}
${leagues.length ? `<div class="box"><h4>Ligas de hoy</h4>${leagues.map(g => `<a href="/liga/${esc(g.slug)}">${badge(g.slug, g.league)}<span>${esc(g.league)}</span><small>${g.rows.length}</small></a>`).join('')}<a href="/ligas">Todas las ligas <small>›</small></a></div>` : ''}</aside></div>`
    return { status: 200, cache: isToday ? 30 : 600, html: shell({ title: isToday ? 'Resultados de fútbol de hoy: marcadores en vivo' : `Resultados del ${longDay(day)}`, desc: `Resultados, marcadores en vivo, goles, tarjetas y tablas de posiciones de los partidos de fútbol del ${longDay(day)}.`, path: isToday ? '/partidos' : '/partidos/' + day, body, nav: 'p', noindex: !rows.length }) }
  }
  const EVL = e => e.type === 'Goal' ? (e.d === 'Own Goal' ? 'Autogol' : e.d === 'Penalty' ? 'Gol de penal' : e.d === 'Missed Penalty' ? 'Penal fallado' : 'Gol') : e.type === 'Card' ? (/red/i.test(e.d) ? 'Tarjeta roja' : 'Tarjeta amarilla') : ''
  const sv = x => { const n = parseFloat(String(x).replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
  async function matchPage(r) {
    let ev = []; try { ev = JSON.parse(r.ev || '[]').filter(e => EVL(e)) } catch { /* sin jugadas */ }
    const [det, tabla] = await Promise.all([detail(r).catch(() => null), r.slug ? standings(r.slug, 3000) : null])
    const title = `${tn(r.home)} ${r.gh == null ? 'vs' : r.gh + ' - ' + r.ga} ${tn(r.away)}`, canonical = matchUrl(r)
    const ld = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${tn(r.home)} vs ${tn(r.away)}`, startDate: new Date(r.kickoff).toISOString(), sport: 'Fútbol',
      eventStatus: r.status === 'PST' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled', homeTeam: { '@type': 'SportsTeam', name: tn(r.home) }, awayTeam: { '@type': 'SportsTeam', name: tn(r.away) } }
    if (r.venue) ld.location = { '@type': 'Place', name: r.venue, address: r.city || r.country || r.venue }
    if (r.slug) ld.superEvent = { '@type': 'SportsEvent', name: lgName(r) }
    const same = r.slug ? db.prepare('SELECT * FROM match_archive WHERE slug = ? AND day = ? AND id != ? ORDER BY kickoff LIMIT 8').all(r.slug, r.day, r.id) : []
    const big = u => img(u) ? `<img src="${esc(img(u))}" alt="" width="60" height="60">` : '<span class="lo"></span>'
    // estadísticas: las conocidas primero y en español; luego las demás
    const stats = (det?.stats || []).map(x => ({ ...x, o: (STAT_ES[x.k] || [x.l, 99])[1], label: (STAT_ES[x.k] || [x.l])[0] })).sort((a, b) => a.o - b.o).slice(0, 18)
    const show = (v, lab) => { const t = String(v).replace(/\.0+$/, '').replace(/%$/, ''); return /%/.test(lab) ? t + '%' : t }
    const bar = x => { const h = sv(x.h), a = sv(x.a), t = h + a, hp = t ? Math.round(h / t * 100) : 50; return `<div class="sb"><div class="r"><b>${esc(show(x.h, x.label))}</b><span>${esc(x.label.replace(' (%)', ''))}</span><b>${esc(show(x.a, x.label))}</b></div><div class="bar"><span class="bh"><i class="h" style="width:${hp}%"></i></span><span class="ba"><i class="a" style="width:${100 - hp}%"></i></span></div></div>` }
    const lu = k => { const d = det?.lineups?.[k]; if (!d || !d.players.length) return '<small>Sin alineación publicada.</small>'; const st = d.players.filter(p => p.st), sub = d.players.filter(p => !p.st); return `${d.formation ? `<small>Formación ${esc(d.formation)}</small>` : ''}${st.map(p => `<div class="pl2"><b>${esc(p.n)}</b><span>${esc(p.name)} <small>${esc(p.pos)}</small></span></div>`).join('')}${sub.length ? `<small>Suplentes</small>${sub.map(p => `<div class="pl2"><b>${esc(p.n)}</b><span>${esc(p.name)} <small>${esc(p.pos)}</small></span></div>`).join('')}` : ''}` }
    const body = `<h1>${esc(tn(r.home))} vs ${esc(tn(r.away))}</h1><div class="sub">${r.slug ? `<a href="/liga/${esc(r.slug)}">${esc(lgName(r))}</a> · ` : ''}${esc(longDay(r.day))}${r.venue ? ' · ' + esc(r.venue) + (r.city ? ', ' + esc(r.city) : '') : ''}</div>
<div class="hd"><div>${big(r.hl)}<div class="n">${esc(tn(r.home))}</div></div><div>${r.gh == null ? '<div class="vs">vs</div>' : `<div class="sc">${esc(r.gh)} - ${esc(r.ga)}</div>`}<div class="st${isLive(r) ? ' lv' : ''}">${esc(isLive(r) ? 'EN VIVO · ' + stLabel(r) : isDone(r) ? 'FINALIZADO' : hhmm(r.kickoff))}</div></div><div>${big(r.al)}<div class="n">${esc(tn(r.away))}</div></div></div>
<input class="f" type="radio" name="t" id="t-res" checked><input class="f" type="radio" name="t" id="t-est"><input class="f" type="radio" name="t" id="t-ali"><input class="f" type="radio" name="t" id="t-tab">
<div class="tabs"><label for="t-res">Resumen</label><label for="t-est">Estadísticas</label><label for="t-ali">Alineaciones</label><label for="t-tab">Clasificación</label></div>
<div class="cols"><main>
<section class="pn" id="p-res"><div class="lg"><h3>Goles y tarjetas</h3>${ev.length ? `<ul class="tl">${ev.map(e => `<li><b>${esc(e.t)}${e.x ? '+' + esc(e.x) : ''}'</b>${e.type === 'Goal' ? ICON.ball : `<i class="cd${/red/i.test(e.d) ? ' r' : ''}"></i>`}<span>${esc(e.p || tn(e.team))}${e.p && e.team ? ` <small>${esc(tn(e.team))}</small>` : ''}<small> · ${esc(EVL(e))}</small></span></li>`).join('')}</ul>` : '<div class="empty">Sin goles ni tarjetas registrados.</div>'}</div>
${r.venue ? `<div class="lg"><h3>Información</h3><div class="empty" style="text-align:left;color:var(--tx)">${esc(r.venue)}${r.city ? ', ' + esc(r.city) : ''}${r.country ? ' · ' + esc(r.country) : ''}${det?.attendance ? '<br><span class="mu">Asistencia: ' + esc(det.attendance.toLocaleString('es-CO')) + '</span>' : ''}</div></div>` : ''}</section>
<section class="pn" id="p-est"><div class="lg"><h3>Estadísticas del partido</h3>${stats.length ? stats.map(bar).join('') : '<div class="empty">Las estadísticas (posesión, tiros, córners, faltas, tarjetas) aparecen cuando el partido empieza y el proveedor las publica.</div>'}</div></section>
<section class="pn" id="p-ali"><div class="lg"><h3>Alineaciones</h3><div class="ln2"><div><h5>${esc(tn(r.home))}</h5>${lu('home')}</div><div><h5>${esc(tn(r.away))}</h5>${lu('away')}</div></div></div></section>
<section class="pn" id="p-tab">${tabla && tabla.length ? tabla.map(g => stTable(r.slug, g, { mini: true, hl: [r.home, r.away] })).join('') : '<div class="lg"><div class="empty">La tabla de posiciones no está disponible para este torneo en este momento.</div></div>'}</section>
</main>
<aside class="side">${same.length ? `<div class="box"><h4>Más de ${esc(lgName(r))}</h4>${same.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} ${x.gh == null ? 'vs' : x.gh + '–' + x.ga} ${esc(tn(x.away))}</span></a>`).join('')}</div>` : ''}
<div class="bt">${r.slug ? `<a class="pill" href="/liga/${esc(r.slug)}">Tabla completa</a>` : ''}<a class="pill" href="${r.day === dayOf(now()) ? '/partidos' : '/partidos/' + r.day}">Todos los partidos</a></div></aside></div>`
    return { status: 200, cache: isDone(r) ? 3600 : 30, canonical, html: shell({ title: `${title}${isDone(r) ? ' · resultado final' : isLive(r) ? ' · en vivo' : ''}`, desc: `${tn(r.home)} vs ${tn(r.away)}${r.slug ? ' (' + lgName(r) + ')' : ''}, ${longDay(r.day)}. Marcador, goles, tarjetas y estadísticas.`, path: canonical, body, nav: 'p', head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` }) }
  }
  async function leaguePage(slug) {
    const rows = db.prepare('SELECT * FROM match_archive WHERE slug = ? ORDER BY kickoff DESC LIMIT 100').all(slug)
    if (!rows.length) return null
    const name = lgName(rows[0]), tabla = await standings(slug), byDay = new Map()
    for (const r of rows) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r) }
    const body = `<div style="display:flex;align-items:center;gap:14px">${badge(slug, name).replace('class="bd"', 'class="bd lg2"')}<div><h1>${esc(name)}</h1><div class="sub">${esc(lgRegion(slug))}${rows[0].country && rows[0].country !== lgRegion(slug) ? ' · ' + esc(tn(rows[0].country)) : ''} · Tabla de posiciones y resultados</div></div></div>
<div class="cols lgp"><aside class="side"><h2 style="margin-top:6px">Clasificación</h2>${tabla && tabla.length ? tabla.map(g => stTable(slug, g)).join('') : '<div class="lg"><div class="empty">La tabla de posiciones no está disponible en este momento (hay torneos sin tabla, o el proveedor no respondió).</div></div>'}</aside>
<main><h2 style="margin-top:6px">Resultados</h2>${[...byDay.entries()].map(([d, rs]) => `<div class="mu" style="margin:12px 2px 6px;font-size:13px;font-weight:600">${esc(longDay(d))}</div><section class="lg">${rs.sort((a, b) => a.kickoff - b.kickoff).map(matchRow).join('')}</section>`).join('')}</main></div>`
    return { status: 200, cache: 600, html: shell({ title: `${name}: resultados y tabla de posiciones`, desc: `Resultados recientes y tabla de posiciones de ${name}.`, path: '/liga/' + slug, body, nav: 'l' }) }
  }
  function leaguesPage() {
    const rows = db.prepare("SELECT slug, MAX(league) league, MAX(country) country, COUNT(*) n, MAX(kickoff) k FROM match_archive WHERE slug != '' GROUP BY slug").all()
    const reg = new Map()
    for (const r of rows) { const g = lgRegion(r.slug); if (!reg.has(g)) reg.set(g, []); reg.get(g).push({ ...r, name: lgName(r) }) }
    const ORDER = ['Selecciones', 'Europa', 'Sudamérica', 'Norte y Centroamérica', 'Torneos de clubes', 'Asia y Oceanía', 'África', 'Otras ligas']
    const body = `<h1>Ligas y torneos</h1><div class="sub">${rows.length} ligas con resultados guardados</div>${[...reg.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([g, ls]) => `<h2>${esc(g)}</h2><div class="rg">${ls.sort((a, b) => { const i = TOPORDER.indexOf(a.slug), j = TOPORDER.indexOf(b.slug); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || a.name.localeCompare(b.name) }).map(l => `<a href="/liga/${esc(l.slug)}">${badge(l.slug, l.name)}<span><b>${esc(l.name)}</b><small>${l.n} partido${l.n === 1 ? '' : 's'}</small></span></a>`).join('')}</div>`).join('') || '<div class="lg"><div class="empty">Todavía no hay ligas guardadas.</div></div>'}`
    return { status: 200, cache: 600, html: shell({ title: 'Ligas y torneos de fútbol: tablas y resultados', desc: 'Todas las ligas y torneos de fútbol con sus tablas de posiciones y resultados.', path: '/ligas', body, nav: 'l', noindex: !rows.length }) }
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

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
const LABEL_ES = { 'FG%': 'Tiros de campo (%)', 'FG': 'Tiros de campo', '3PT': 'Triples', '3PT%': 'Triples (%)', 'FT': 'Tiros libres', 'FT%': 'Tiros libres (%)', 'Rebounds': 'Rebotes', 'Offensive Rebounds': 'Rebotes ofensivos', 'Defensive Rebounds': 'Rebotes defensivos', 'Turnovers': 'Pérdidas', 'Steals': 'Robos', 'Blocks': 'Bloqueos', 'Points in Paint': 'Puntos en la pintura', 'Fast Break Points': 'Puntos de contraataque', 'Largest Lead': 'Mayor ventaja', 'Team Turnovers': 'Pérdidas del equipo', 'Total Turnovers': 'Pérdidas totales', 'Technical Fouls': 'Faltas técnicas', 'Shots on Goal': 'Tiros a puerta', 'Power Play': 'Superioridad', 'Hits': 'Golpes', 'Faceoff Win %': 'Salidas ganadas (%)', 'Penalty Minutes': 'Minutos de castigo', 'Giveaways': 'Pérdidas del disco', 'Takeaways': 'Recuperaciones', 'Total Yards': 'Yardas totales', 'Passing Yards': 'Yardas por pase', 'Rushing Yards': 'Yardas por tierra', 'First Downs': 'Primeros intentos', 'Third Down Efficiency': 'Tercer intento', 'Sacks': 'Capturas', 'Penalties': 'Penales', 'Fumbles Lost': 'Balones perdidos', 'Runs': 'Carreras', 'Errors': 'Errores', 'Aces': 'Aces', 'Double Faults': 'Dobles faltas', '1st Serve %': 'Primer servicio (%)', 'Break Points Won': 'Puntos de quiebre ganados', 'Total Points Won': 'Puntos totales ganados', 'Winners': 'Golpes ganadores', 'Unforced Errors': 'Errores no forzados', 'Significant Strikes': 'Golpes significativos', 'Takedowns': 'Derribos', 'Knockdowns': 'Caídas', 'Submission Attempts': 'Intentos de sumisión', 'On Target %': 'Tiros a puerta (%)', 'Penalty Goals': 'Goles de penal', 'Penalty Kicks Taken': 'Penales cobrados', 'Cross %': 'Centros precisos (%)', 'Crosses': 'Centros', 'Accurate Crosses': 'Centros precisos', 'Long Balls %': 'Pelotas largas (%)', 'Long Balls': 'Pelotas largas', 'Accurate Long Balls': 'Pelotas largas precisas', 'Tackle %': 'Entradas ganadas (%)', 'Tackles': 'Entradas', 'Effective Tackles': 'Entradas efectivas', 'Interceptions': 'Intercepciones', 'Clearances': 'Despejes', 'Effective Clearances': 'Despejes efectivos', 'Shot Assists': 'Pases de tiro', 'Goals': 'Goles', 'Assists': 'Asistencias', 'Fouls': 'Faltas', 'Corner Kicks': 'Córners', 'Won Corners': 'Córners', 'Possession': 'Posesión', 'Shots': 'Tiros', 'Shots on Target': 'Tiros a puerta', 'Saves': 'Atajadas', 'Offsides': 'Fuera de lugar', 'Yellow Cards': 'Tarjetas amarillas', 'Red Cards': 'Tarjetas rojas', 'Pass Completion %': 'Pases completos (%)', 'Passes': 'Pases', 'Total Passes': 'Pases', 'Blocked Shots': 'Tiros bloqueados', 'Shot Blocks': 'Tiros bloqueados', 'Duels Won': 'Duelos ganados', 'Aerials Won': 'Duelos aéreos ganados', 'Big Chances': 'Ocasiones claras', 'Chances Created': 'Ocasiones creadas', 'Dribbles': 'Regates', 'Throw Ins': 'Saques de banda', 'Goal Kicks': 'Saques de meta', 'Expected Goals': 'Goles esperados', 'xG': 'Goles esperados' }
const SP = {
  baloncesto: { es: 'Baloncesto', lg: [['basketball', 'nba', 'NBA'], ['basketball', 'wnba', 'WNBA'], ['basketball', 'mens-college-basketball', 'NCAA Baloncesto']] },
  beisbol: { es: 'Béisbol', lg: [['baseball', 'mlb', 'MLB']] },
  hockey: { es: 'Hockey', lg: [['hockey', 'nhl', 'NHL']] },
  nfl: { es: 'Fútbol americano', lg: [['football', 'nfl', 'NFL'], ['football', 'college-football', 'NCAA Fútbol americano']] },
  tenis: { es: 'Tenis', lg: [['tennis', 'atp', 'ATP'], ['tennis', 'wta', 'WTA']] },
  mma: { es: 'MMA', lg: [['mma', 'ufc', 'UFC']] }
}
const SPN = { futbol: ['Fútbol', '#2fb59a'], baloncesto: ['Baloncesto', '#f59e0b'], beisbol: ['Béisbol', '#3b82f6'], hockey: ['Hockey', '#06b6d4'], nfl: ['F. americano', '#b45309'], tenis: ['Tenis', '#84cc16'], mma: ['MMA', '#ef4444'] }
// estado en vivo de otros deportes, en español (ESPN lo manda en inglés: «3rd», «Bot 7th», «7:55 - 1st»)
const infoEs = (sport, t) => {
  let x = String(t || '').trim(); if (!x) return ''
  if (sport === 'tenis') { const m = /^(\d+)(?:st|nd|rd|th)$/.exec(x); if (m) return 'Set ' + m[1] }
  const ord = { Top: 'Alta', Bot: 'Baja', Mid: 'Mitad', End: 'Fin', Halftime: 'Descanso', Final: 'Final', Delayed: 'Demorado', Postponed: 'Aplazado', Suspended: 'Suspendido', OT: 'Prórroga' }
  x = x.replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1.º').replace(/\b(Top|Bot|Mid|End|Halftime|Final|Delayed|Postponed|Suspended|OT)\b/g, w => ord[w])
  return x.slice(0, 24)
}
const STAT_ES = { possessionPct: ['Posesión (%)', 1], totalShots: ['Tiros', 2], shotsOnTarget: ['Tiros a puerta', 3], blockedShots: ['Tiros bloqueados', 9], wonCorners: ['Córners', 4], foulsCommitted: ['Faltas', 5], yellowCards: ['Tarjetas amarillas', 6], redCards: ['Tarjetas rojas', 7], offsides: ['Fuera de lugar', 8], saves: ['Atajadas', 10], totalPasses: ['Pases', 11], accuratePasses: ['Pases precisos', 12], passPct: ['Precisión de pases (%)', 13], effectiveTackles: ['Entradas efectivas', 14], totalTackles: ['Entradas', 14], interceptions: ['Intercepciones', 15], effectiveClearance: ['Despejes efectivos', 16], totalClearance: ['Despejes', 16] }

module.exports = function matches({ db, S, now, broadcast }) {
  // versión del script del portal: cambia en cada reinicio, así ni el navegador ni Cloudflare sirven una copia vieja de /portal.js
  const BUILD = Date.now().toString(36)
  db.exec(`CREATE TABLE IF NOT EXISTS match_archive (
    id INTEGER PRIMARY KEY, mkey TEXT UNIQUE, day TEXT NOT NULL, kickoff INTEGER NOT NULL, status TEXT,
    league TEXT, slug TEXT, country TEXT, venue TEXT, city TEXT, home TEXT, away TEXT, hl TEXT, al TEXT,
    gh INTEGER, ga INTEGER, el INTEGER, ev TEXT, updated INTEGER);
    CREATE INDEX IF NOT EXISTS match_archive_day ON match_archive(day, kickoff);
    CREATE INDEX IF NOT EXISTS match_archive_slug ON match_archive(slug, kickoff);
    CREATE INDEX IF NOT EXISTS match_archive_ko ON match_archive(kickoff);`)
  for (const c of ['eid INTEGER', 'detail TEXT', 'fetched INTEGER', "sport TEXT DEFAULT 'futbol'", 'info TEXT']) { try { db.exec('ALTER TABLE match_archive ADD COLUMN ' + c) } catch { /* ya existe */ } }
  try { db.exec('CREATE INDEX IF NOT EXISTS match_archive_sport_day ON match_archive(sport, day); CREATE INDEX IF NOT EXISTS match_archive_home ON match_archive(home, kickoff); CREATE INDEX IF NOT EXISTS match_archive_away ON match_archive(away, kickoff)') } catch { /* sin la columna todavía */ }
  // las listas no necesitan el «detalle» (alineaciones y estadísticas, puede pesar decenas de KB por partido): solo se lee al abrir un partido
  const COLS = 'id, mkey, day, kickoff, status, league, slug, country, venue, city, home, away, hl, al, gh, ga, el, ev, updated, sport, info, eid'
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
  // ESPN guarda el escudo de cada equipo en una dirección fija por número de equipo (si no existe, el navegador lo cambia por las iniciales)
  const espnLogo = (f, t) => f.fixture.id < 0 && /^\d{1,8}$/.test(String(t?.id || '')) ? `https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png` : ''
  function save(f, mkey) {
    if (S().partidosOn === false) return
    const ko = f.fixture.timestamp * 1000, g = f.goals || {}
    const ev = JSON.stringify((f.events || []).slice(-60).map(e => ({ t: e.time?.elapsed || 0, x: e.time?.extra || 0, type: e.type || '', d: e.detail || '', team: e.team?.name || '', p: e.player?.name || '', a: e.assist?.name || '' })))
    up.run(f.fixture.id, mkey, dayOf(ko), ko, f.fixture.status?.short || '', String(f.league?.name === 'Fútbol' ? '' : f.league?.name || ''), String(f.league?.slug || ''), String(f.league?.country || ''),
      String(f.fixture.venue?.name || ''), String(f.fixture.venue?.city || ''), f.teams.home.name, f.teams.away.name, img(f.teams.home.logo || f.teams.home.src || espnLogo(f, f.teams.home)), img(f.teams.away.logo || f.teams.away.src || espnLogo(f, f.teams.away)), g.home ?? null, g.away ?? null, f.fixture.status?.elapsed ?? null, ev, now(), f.fixture.id < 0 ? -f.fixture.id : null)
  }
  // un partido que quedó «en juego» sin que llegara el dato final (el proveedor dejó de mandarlo) se da por terminado
  function finalizeOld() { db.prepare(`UPDATE match_archive SET status = 'FT' WHERE status IN (${LIVE.map(() => '?').join(',')}) AND kickoff < ?`).run(...LIVE, now() - 5 * 3600e3) }
  // ligas importantes (las del catálogo y las principales de ESPN): su página se conserva más tiempo; el resto, menos. De cada partido borrado queda una nota mínima para llevar el enlace viejo a su liga (no un error 404).
  const IMP = [...new Set([...Object.keys(LG), ...ESPN.TOP])]
  db.exec('CREATE TABLE IF NOT EXISTS match_gone (id INTEGER PRIMARY KEY, slug TEXT, sport TEXT, day TEXT)')
  function purgeOld() {
    const clamp = v => Math.max(7, Math.min(3650, Math.round(+v) || 0)), d1 = clamp(S().archiveDays) || 40, d2 = Math.max(d1, clamp(S().archiveDaysTop) || 365)
    const t1 = now() - d1 * 864e5, t2 = now() - d2 * 864e5, ph = IMP.map(() => '?').join(','), w = `(((kickoff < ? AND NOT (sport = 'futbol' AND slug IN (${ph}))) OR kickoff < ?) AND id NOT IN (SELECT mid FROM match_cards WHERE shared = 1))`
    db.prepare(`INSERT OR REPLACE INTO match_gone (id, slug, sport, day) SELECT id, slug, sport, day FROM match_archive WHERE ${w}`).run(t1, ...IMP, t2)
    db.prepare(`DELETE FROM match_archive WHERE ${w}`).run(t1, ...IMP, t2)
    try { db.prepare('DELETE FROM post_gone WHERE ko < ?').run(now() - 5 * 365 * 864e5) } catch { /* sin tabla */ }   // los enlaces compartidos del mapa se conservan años
    db.prepare("DELETE FROM match_gone WHERE day < ?").run(dayOf(now() - 5 * 365 * 864e5))
  }
  // al ocultar una liga o un equipo desde el panel también salen del archivo
  function hide(slugs, teamsNorm, norm) { let n = 0; for (const r of db.prepare('SELECT id, slug, home, away FROM match_archive').all()) if ((r.slug && slugs.has(r.slug)) || teamsNorm.has(norm(r.home)) || teamsNorm.has(norm(r.away))) { db.prepare('DELETE FROM match_archive WHERE id = ?').run(r.id); n++ } return n }
  setTimeout(() => { try { finalizeOld(); purgeOld() } catch { /* nada */ } }, 20e3).unref()
  setInterval(() => { try { finalizeOld(); purgeOld() } catch { /* nada */ } }, 3600e3).unref()

  // ---- estadísticas y alineaciones de un partido (ESPN): se piden al abrir la página y se guardan ----
  const detCache = new Map()
  // las visitas a páginas de partidos viejos no pueden disparar miles de consultas a ESPN: tope global por minuto
  let vWin = 0, vN = 0; const visitCall = () => { const m = Math.floor(Date.now() / 60e3); if (m !== vWin) { vWin = m; vN = 0 } return ++vN <= 40 }
  async function detail(r) {
    const eid = r.eid || (r.sport && r.sport !== 'futbol' && r.id <= -5e9 ? -r.id - 5e9 : null); if (!eid) return null
    let d = null; try { d = r.detail ? JSON.parse(r.detail) : null } catch { /* nada */ }
    const done = DONE.includes(r.status), age = now() - (r.fetched || 0)
    if (d && d.src === 'af' && (done || age < 8 * 60e3)) return d   // lo trajo API-Football: ESPN no lo pisa
    if (d && (done ? (d.stats?.length && d.rec && d.v === 2) : age < 60e3 && d.v === 2)) return d
    if (!d && done && age < 6 * 3600e3 && r.fetched) return null   // ya se intentó y ESPN no tiene datos de este partido
    const k = r.id, hit = detCache.get(k); if (hit && Date.now() - hit.t < (done ? 600e3 : 45e3)) return hit.p
    if (!visitCall()) return d   // demasiadas consultas este minuto: se muestra lo que ya hay
    const p = (async () => { try { const v = await Promise.race([(r.sport && r.sport !== 'futbol') ? ESPN.summaryPath(r.slug, eid) : ESPN.summary(r.slug, eid), new Promise((_, no) => setTimeout(() => no(new Error('tarda')), 5000))]); if (!(v.stats?.length || v.lineups?.home?.players?.length || v.lineups?.away?.players?.length) && d && d.src === 'af') return d   // ESPN sigue vacío: se conserva lo de API-Football
      db.prepare('UPDATE match_archive SET detail = ?, fetched = ? WHERE id = ?').run(JSON.stringify(v), now(), r.id); if (v.evs?.length && String(r.ev || '[]').length <= 2) db.prepare('UPDATE match_archive SET ev = ? WHERE id = ?').run(JSON.stringify(v.evs.map(e => ({ t: e.time.elapsed, x: e.time.extra, type: e.type, d: e.detail, team: e.team.name, p: e.player.name, a: '' }))), r.id); return v } catch { db.prepare('UPDATE match_archive SET fetched = ? WHERE id = ?').run(now(), r.id); return d } finally { setTimeout(() => detCache.delete(k), 30e3) } })()
    detCache.set(k, { t: Date.now(), p }); if (detCache.size > 300) detCache.delete(detCache.keys().next().value)
    return p
  }


  // ---- pronósticos con puntos: ranking y reglas ----
  const PRED = require('./pred')({ db, S, now, DONE, LIVE, detail })
  function predPage() {
    if (!PRED.on()) return null
    const av = u => `<span class="av" style="background:hsl(${(+u.hue || 160) % 360} 45% 40%)">${img(u.avatar) ? `<img src="${esc(img(u.avatar))}" alt="" loading="lazy">` : esc(String(u.name || '?').trim().slice(0, 1).toUpperCase())}</span>`
    const medal = ['#e3b341', '#9aa4ad', '#c47a3a'], table = rows => rows.length ? `<table class="tb rk2"><thead><tr><th>#</th><th class="tn">Jugador</th><th>PJ</th><th>Aciertos</th><th>Fallos</th><th>PTS</th></tr></thead><tbody>${rows.map((u, i) => `<tr${i < 3 ? ' class="top"' : ''}><td class="rk" style="${i < 3 ? 'border-left-color:' + medal[i] : ''}">${i + 1}</td><td class="tn"><div class="pl">${av(u)}<span class="pn">${esc(u.name)}<small>@${esc(u.handle)}</small></span></div></td><td>${u.n}</td><td class="okc">${u.ok}</td><td class="fc">${u.fail}</td><td class="p">${u.pts}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Todavía nadie suma puntos aquí. Pronostica un partido y sé el primero.</div>'
    const open = db.prepare("SELECT " + COLS + " FROM match_archive WHERE sport = 'futbol' AND kickoff > ? AND kickoff < ? AND status NOT IN ('FT','AET','PEN','PST','CANC','ABD','AWD','WO') ORDER BY (CASE WHEN slug IN (" + ESPN.TOP.map(() => '?').join(',') + ") THEN 0 ELSE 1 END), kickoff LIMIT 14").all(now(), now() + 36 * 3600e3, ...ESPN.TOP)
    const pts = PRED.POINTS, lb = PRED.LABEL
    const body = `<div class="hrow"><h1>Pronósticos</h1><span class="sub">Juega con puntos: gratis, sin dinero ni premios</span></div>
<input class="f" type="radio" name="pr" id="pr-w" checked><input class="f" type="radio" name="pr" id="pr-a"><input class="f" type="radio" name="pr" id="pr-m">
<div class="g2"><main>
<div class="box"><div class="tabs"><label for="pr-w">Ranking de la semana</label><label for="pr-a">Ranking general</label><label for="pr-m">Mis pronósticos</label></div>
<div class="rp" id="pp-w">${table(PRED.top('week'))}</div><div class="rp" id="pp-a">${table(PRED.top('all'))}</div>
<div class="rp" id="pp-m"><div id="pr-mine" class="empty">Cargando…</div></div></div>
<div class="box"><h4>Partidos para pronosticar</h4>${open.length ? open.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} – ${esc(tn(x.away))}</span><small>${esc(lgName(x))} · ${esc(hhmm(x.kickoff))}</small></a>`).join('') : '<div class="empty">No hay partidos abiertos por ahora. Vuelve más tarde.</div>'}</div>
</main><aside class="side"><div class="box"><h4>Cómo se ganan puntos</h4><div class="rules">${['res', 'score', 'tg', 'tc', 'pen', 'red'].map(k => `<div><span>${esc(lb[k])}</span><b>+${pts[k]}</b></div>`).join('')}</div></div>
<div class="box"><h4>Reglas</h4><div class="empty" style="text-align:left;color:var(--tx)">Eliges antes de que empiece el partido; después ya no se puede cambiar. Los puntos se reparten solos cuando termina el partido. Si ESPN no publica los datos de una opción (por ejemplo tarjetas en una liga menor), esa opción se anula: no suma ni resta.<br><br>Solo hay puntos y ranking. No se apuesta dinero ni se entregan premios.</div></div></aside></div>`
    return { status: 200, cache: 30, html: shell({ title: 'Pronósticos de fútbol: juega con puntos y sube en el ranking', desc: 'Pronostica el resultado, el marcador, las tarjetas y los penales de los partidos de fútbol. Gana puntos y compite en el ranking, gratis y sin dinero.', path: '/partidos/pronosticos', body, nav: 'j', kw: ['pronósticos de fútbol', 'quiniela', 'predicciones de fútbol'] }) }
  }

  // ---- enlaces del mapa que NO se pierden: cuando termina el partido su publicación del mapa se borra, pero el enlace /p/123 que ya se compartió sigue mostrando la misma imagen y lleva a la página permanente del partido ----
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS post_gone (post_id INTEGER PRIMARY KEY, h TEXT, a TEXT, ko INTEGER, title TEXT, txt TEXT, city TEXT, country TEXT);
      CREATE TRIGGER IF NOT EXISTS post_gone_keep BEFORE DELETE ON posts WHEN OLD.match IS NOT NULL BEGIN
        INSERT OR REPLACE INTO post_gone (post_id, h, a, ko, title, txt, city, country) VALUES (OLD.id, json_extract(OLD.match, '$.h'), json_extract(OLD.match, '$.a'), json_extract(OLD.match, '$.ko'), OLD.title, OLD.text, OLD.city, OLD.country);
      END`)
  } catch { /* sin publicaciones del mapa en esta base */ }
  // la publicación del mapa de un partido y su página permanente comparten UNA sola imagen y una sola dirección
  function postMatch(postId) {
    try {
      const fx = db.prepare('SELECT id FROM sport_fixtures WHERE post_id = ?').get(+postId), r = fx && qRow.get(fx.id); if (!r) return null
      const c = db.prepare('SELECT at FROM match_cards WHERE mid = ?').get(r.id)
      return { mid: r.id, tok: r.id < 0 ? 'e' + -r.id : 's' + r.id, url: matchUrl(r), cur: cardK(r), card: c ? { at: c.at } : null }
    } catch { return null }
  }
  function goneInfo(id) {
    let g; try { g = db.prepare('SELECT * FROM post_gone WHERE post_id = ?').get(+id) } catch { return null }
    if (!g || !g.h || !g.a || !g.ko) return null
    const same = require('./fill').sameTeam; let url = null, og = ''
    for (const r of db.prepare('SELECT * FROM match_archive WHERE kickoff BETWEEN ? AND ? ORDER BY ABS(kickoff - ?) LIMIT 80').all(g.ko - 8 * 3600e3, g.ko + 8 * 3600e3, g.ko))
      if ((same(r.home, g.h) && same(r.away, g.a)) || (same(r.home, g.a) && same(r.away, g.h))) { url = matchUrl(r); const c = db.prepare('SELECT at FROM match_cards WHERE mid = ?').get(r.id); if (c) og = `/og/m/${r.id < 0 ? 'e' + -r.id : 's' + r.id}.jpg?v=${Math.floor(c.at / 1000)}`; break }   // si el mapa no guardó su imagen, se usa la tarjeta del partido
    return { url, og, title: g.title || `${g.h} vs ${g.a}`, text: g.txt || '', city: g.city || '', country: g.country || '' }
  }

  // ---- completar con otra fuente (API-Football) los partidos donde ESPN no trae detalle ----
  const FILL = require('./fill')
  db.exec('CREATE TABLE IF NOT EXISTS fill_log (mid INTEGER PRIMARY KEY, tries INTEGER DEFAULT 0, last INTEGER DEFAULT 0, ok INTEGER DEFAULT 0, afid INTEGER)')
  const qFillLog = db.prepare('SELECT * FROM fill_log WHERE mid = ?')
  // partidos de fútbol de ayer y hoy, en juego o terminados hace poco, sin detalle útil; primero los de Colombia y los que están en vivo
  function fillCandidates(limit = 8) {
    const rows = db.prepare("SELECT * FROM match_archive WHERE sport = 'futbol' AND kickoff > ? AND kickoff < ? ORDER BY kickoff DESC LIMIT 400").all(now() - 30 * 3600e3, now() + 10 * 60e3), out = []
    for (const r of rows) {
      const live = LIVE.includes(r.status), done = DONE.includes(r.status); if (!live && !done) continue
      let d = null; try { d = r.detail ? JSON.parse(r.detail) : null } catch { /* nada */ }
      const lg = qFillLog.get(r.id) || { tries: 0, last: 0, ok: 0 }
      if (live) { if (!FILL.isEmpty(d) && d.src !== 'af') continue; const soloJugadas = d && d.src === 'af' && !(d.stats?.length) && !(d.lineups?.home?.players?.length) && !(d.lineups?.away?.players?.length); if (now() - lg.last < (soloJugadas ? 40 : 18) * 60e3 || lg.tries >= 6) continue }   // en vivo: cada 18 min; si solo trae jugadas (sin titulares ni estadísticas), cada 40
      else if (FILL.isEmpty(d)) { if (lg.ok || lg.tries >= 2 || now() - lg.last < 20 * 60e3) continue }   // terminado sin datos: se intenta 1 o 2 veces
      else if (d && d.src === 'af' && !d.fin && now() - lg.last > 5 * 60e3) { /* actualización final al terminar: una sola vez */ }
      else continue
      out.push({ row: r, live, pri: (/^col\./.test(r.slug) ? 0 : LG[r.slug] ? 1 : 2) * 2 + (live ? 0 : 1), afid: lg.afid || null })
    }
    return out.sort((a, b) => a.pri - b.pri).slice(0, limit)
  }
  // partidos de ejemplo para la prueba del panel: primero los de Colombia
  const fillSample = (n = 4) => db.prepare("SELECT * FROM match_archive WHERE sport = 'futbol' AND kickoff > ? AND kickoff < ? ORDER BY CASE WHEN slug LIKE 'col.%' THEN 0 ELSE 1 END, kickoff DESC LIMIT ?").all(now() - 30 * 3600e3, now() + 6 * 3600e3, n)
  const fillInfo = mid => qFillLog.get(mid) || null
  const fillReset = ids => { for (const i of ids) db.prepare('DELETE FROM fill_log WHERE mid = ?').run(i) }
  function fillMark(mid, ok, afid) { const o = qFillLog.get(mid) || { tries: 0 }; db.prepare('INSERT OR REPLACE INTO fill_log (mid, tries, last, ok, afid) VALUES (?, ?, ?, ?, ?)').run(mid, o.tries + 1, now(), ok ? 1 : (o.ok || 0), afid || o.afid || null) }
  function fillSave(mid, d) {
    const r = qRow.get(mid); if (!r) return
    d.fin = DONE.includes(r.status)   // si ya terminó, esta es la versión final y no se vuelve a pedir
    db.prepare('UPDATE match_archive SET detail = ?, fetched = ? WHERE id = ?').run(JSON.stringify(d), now(), mid)
    if (d.evs?.length && String(r.ev || '[]').length <= 2) db.prepare('UPDATE match_archive SET ev = ? WHERE id = ?').run(JSON.stringify(d.evs.map(e => ({ t: e.time.elapsed, x: e.time.extra, type: e.type, d: e.detail, team: e.team.name, p: e.player.name, a: '' }))), mid)
    fillMark(mid, true)
  }
  // ---- tarjeta de cada partido para la vista previa al compartir el enlace (la dibuja el navegador y el servidor la guarda) ----
  db.exec('CREATE TABLE IF NOT EXISTS match_cards (mid INTEGER PRIMARY KEY, key TEXT, url TEXT, k TEXT, at INTEGER)')
  try { db.exec('ALTER TABLE match_cards ADD COLUMN shared INTEGER NOT NULL DEFAULT 0') } catch { /* ya existe */ }
  // un partido que alguien COMPARTIÓ se guarda para siempre (su página y su imagen): ya quedó registrado en Google, Facebook y WhatsApp
  const markShared = mid => { try { return db.prepare('UPDATE match_cards SET shared = 1 WHERE mid = ?').run(mid).changes > 0 } catch { return false } }
  const cardK = r => `${r.gh ?? ''}-${r.ga ?? ''}-${r.status}`
  const qCardK = db.prepare('SELECT gh, ga, status FROM match_archive WHERE id = ?'), qCard = db.prepare('SELECT url, k, at FROM match_cards WHERE mid = ?'), qRow = db.prepare('SELECT * FROM match_archive WHERE id = ?')
  const cardKey = id => { const r = qCardK.get(id); return r ? cardK(r) : null }
  // permiso para subir la tarjeta: solo lo tiene quien abrió la página (se firma con una clave que cambia al reiniciar y vale entre 6 y 12 horas)
  const CSEC = require('crypto').randomBytes(32), cbucket = () => Math.floor(now() / (6 * 3600e3))
  const cardTok = (mid, k, b) => require('crypto').createHmac('sha256', CSEC).update(mid + '|' + k + '|' + b).digest('hex').slice(0, 24)
  const cardTokOk = (mid, k, t) => typeof t === 'string' && t.length === 24 && (t === cardTok(mid, k, cbucket()) || t === cardTok(mid, k, cbucket() - 1))
  const cardOf = r => { const c = qCard.get(r.id), tok = (r.id < 0 ? 'e' + -r.id : 's' + r.id), k = cardK(r); return { id: tok, k, t: cardTok(r.id, k, cbucket()), need: !c || c.k !== k, og: c ? (c.url || `/og/m/${tok}.jpg?v=${Math.floor(c.at / 1000)}`) : '' } }
  const cardPayload = r => { const c = cardOf(r), sp = r.sport && r.sport !== 'futbol'; return { id: c.id, k: c.k, t: c.t, need: c.need, m: { h: tn(r.home), a: tn(r.away), hl: img(r.hl), al: img(r.al), gh: r.gh, ga: r.ga, st: r.status, el: sp ? null : r.el, info: sp ? infoEs(r.sport, r.info) : '', ko: r.kickoff, league: lgName(r), venue: r.venue || '' }, city: r.city || '', link: '__HOST__' } }
  const cardPayloadById = id => { const r = qRow.get(id); return r ? cardPayload(r) : null }
  // ---- presentación: portal compacto, sobrio y denso (claro por defecto; oscuro automático si el equipo lo usa) ----
  const stLabel = r => (r.sport && r.sport !== 'futbol') ? (LIVE.includes(r.status) ? (infoEs(r.sport, r.info) || 'VIVO') : DONE.includes(r.status) ? 'FIN' : r.status === 'PST' ? 'APL' : hhmm(r.kickoff)) : LIVE.includes(r.status) ? (r.status === 'HT' ? 'ENT' : (r.el ? r.el + "'" : 'VIVO')) : DONE.includes(r.status) ? (r.status === 'PEN' ? 'FIN·P' : r.status === 'AET' ? 'FIN·PR' : 'FIN') : r.status === 'PST' ? 'APL' : hhmm(r.kickoff)
  const isLive = r => LIVE.includes(r.status), isDone = r => DONE.includes(r.status)
  const hex = c => /^#?[0-9a-f]{6}$/i.test(String(c || '')) ? '#' + String(c).replace('#', '') : ''
  const ICON = { ball: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6.2 3.3 2.4-1.3 3.9H10l-1.3-3.9L12 8.2Z" fill="currentColor"/></svg>' }
  db.exec('CREATE TABLE IF NOT EXISTS match_logos (slug TEXT PRIMARY KEY, url TEXT)')
  const LOGOS = new Map(db.prepare('SELECT slug, url FROM match_logos').all().map(r => [r.slug, r.url])), triedLogo = new Map()
  let warming = false, lastWarm = 0
  async function warmLogos() {
    if (warming || now() - lastWarm < 600e3) return; warming = true; lastWarm = now()
    try {
      const miss = db.prepare("SELECT DISTINCT slug FROM match_archive WHERE slug != '' AND sport = 'futbol'").all().map(r => r.slug).filter(x => !LOGOS.has(x) && !(triedLogo.get(x) > now() - 6 * 3600e3)).slice(0, 80)
      for (let i = 0; i < miss.length; i += 4) await Promise.all(miss.slice(i, i + 4).map(async slug => {
        triedLogo.set(slug, now())
        try {
          const r = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(slug)}/scoreboard?limit=1`, { headers: { 'User-Agent': 'Mozilla/5.0 (escudos de ligas)' }, signal: AbortSignal.timeout(6000) })
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
  const CSS = `
:root{color-scheme:light dark;${THEME_L};--r:6px}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){${THEME_D}}
}
:root[data-theme=dark]{color-scheme:dark;${THEME_D}}
:root[data-theme=light]{color-scheme:light}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:60px}
body{margin:0;background:var(--bg);color:var(--tx);font:13.5px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;padding:0}
.w{max-width:1400px;margin:0 auto;padding:0 14px}
.top{background:var(--sf);position:sticky;top:0;z-index:30;box-shadow:var(--sh)}
.top .w{display:flex;align-items:center;gap:14px;height:58px}
.brand{display:flex;align-items:center;flex:none}
.brand img{height:30px;max-width:150px;width:auto;object-fit:contain;display:block}
.brand .dk{display:none}
.brand b{font-size:16px}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .brand .lt{display:none}
:root:not([data-theme=light]) .brand .dk{display:block}
}
:root[data-theme=dark] .brand .lt{display:none}
:root[data-theme=dark] .brand .dk{display:block}
:root[data-theme=light] .brand .lt{display:block}
:root[data-theme=light] .brand .dk{display:none}
.top nav{display:flex;gap:2px}
.top nav a{padding:7px 12px;font-weight:600;font-size:13px;color:var(--mu);border-radius:var(--r)}
.top nav a:hover{color:var(--tx);background:var(--soft)}
.top nav a.on{color:var(--selx);background:var(--sel)}
.srch{flex:1;max-width:340px;margin-left:auto;min-width:0}
.srch input{width:100%;height:34px;border:0;border-radius:var(--r);background:var(--soft);color:var(--tx);padding:0 12px;font:inherit;outline:0}
.srch input:focus{box-shadow:0 0 0 2px var(--lk)}
.ib{width:34px;height:34px;border-radius:var(--r);background:var(--soft);display:grid;place-items:center;flex:none;font-size:15px}
.ib:hover{background:var(--ln)}
.pg{padding:10px 0 40px}
h1{font-size:18px;margin:0;font-weight:700}
h2{font-size:11px;margin:14px 0 6px;color:var(--mu);font-weight:700;letter-spacing:.9px;text-transform:uppercase}
.mu{color:var(--mu)}
.sub{color:var(--mu);font-size:12.5px}
.hrow{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.bar2{display:flex;align-items:center;gap:4px;overflow-x:auto;scrollbar-width:none;padding:2px 0;margin-bottom:10px}
.bar2::-webkit-scrollbar{display:none}
.bar2>*{flex:none}
.bar2 .sp{width:1px;height:16px;background:var(--ln);margin:0 6px}
.bar2 .rt{margin-left:auto;display:flex;gap:4px}
.bar2 a,.bar2 label,.bar2 button,.tabs label{padding:5px 10px;border-radius:var(--r);background:var(--sf);font-size:12px;font-weight:600;color:var(--mu);white-space:nowrap;cursor:pointer;line-height:1.2;box-shadow:var(--sh)}
.bar2 a.on{background:var(--sel);color:var(--selx)}
.bar2 a:hover,.bar2 label:hover,.bar2 button:hover{color:var(--tx)}
.bar2 .lvl b{color:var(--lv)}
input.f{position:absolute;opacity:0;pointer-events:none}
body:has(#f-all:checked) label[for=f-all],body:has(#f-live:checked) label[for=f-live],body:has(#f-fin:checked) label[for=f-fin],body:has(#f-nxt:checked) label[for=f-nxt]{background:var(--sel);color:var(--selx)}
body:has(#f-live:checked) .mx:not(.lv),body:has(#f-fin:checked) .mx:not(.fn),body:has(#f-nxt:checked) .mx:not(.nx){display:none}
body:has(#f-live:checked) .lg:not(:has(.mx.lv)),body:has(#f-live:checked) .bk:not([data-b=live]),body:has(#f-fin:checked) .bk:not([data-b=fin]),body:has(#f-nxt:checked) .bk:not([data-b=nx]){display:none}
body:has(#f-fin:checked) .lg:not(:has(.mx.fn)),body:has(#f-nxt:checked) .lg:not(:has(.mx.nx)){display:none}
body:has(#f-fin:checked) .livebox,body:has(#f-nxt:checked) .livebox{display:none}
.livebox{margin-bottom:12px}
.livebox h2{margin:0 0 6px;color:var(--lv);display:flex;align-items:center;gap:6px;font-size:12px}
.livebox h2 i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--lv);animation:pl 1.4s infinite}
@keyframes pl{50%{opacity:.25}}
.lcs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.lc{display:block;background:var(--sf);border-radius:8px;padding:10px 12px;box-shadow:var(--sh)}
.lc:hover{background:var(--soft)}
.mcard{position:relative;display:flex!important;flex-direction:column;align-items:center;gap:6px;border:0!important;outline:0;border-radius:12px;overflow:hidden;color:#fff!important;text-decoration:none;padding:10px 12px 8px!important;background-size:cover!important;background-position:center!important;box-shadow:none!important;transition:transform .15s}
.lcs .lc.mcard{flex:0 0 340px!important;width:340px!important;max-width:none!important;min-width:0}
.mbig .lcs .lc.mcard{flex:0 0 440px!important;width:440px!important;padding:16px 16px 12px!important;gap:8px}
@media(max-width:700px){.lcs .lc.mcard,.mbig .lcs .lc.mcard{flex:none!important;width:auto!important;max-width:100%!important}.mbig .lcs .lc.mcard:nth-child(n+5){display:none!important}}
.mcard:hover{transform:translateY(-2px)}
.mml{display:flex;align-items:center;justify-content:center;gap:5px;font-size:9.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#cfd6dc;max-width:100%}.mml em{font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mml .tg{font-size:9px}
.mrow{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:start;gap:8px;width:100%}
.mtm{min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
.mtm img,.mtm .lo{width:40px!important;height:40px!important;object-fit:contain;display:grid;place-items:center;border-radius:50%;margin:0;font-size:13px}.mtm .lo{box-shadow:0 2px 6px #000a}
.mbig .mtm img,.mbig .mtm .lo{width:60px!important;height:60px!important;font-size:18px}
.mtm em{font-style:normal;font-weight:700;font-size:12px;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mbig .mtm em{font-size:14px}
.mcard.fn .mtm:not(.w) em{opacity:.6}
.mev{display:block;max-width:100%;min-height:13px;font-size:10px;color:#dfe5e9;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mbig .mev{font-size:11px}
.mmid{display:flex;flex-direction:column;align-items:center;gap:3px;padding-top:6px}
.msc{font-size:26px;font-weight:800;letter-spacing:1px;line-height:1;color:#fff;white-space:nowrap}.mvs{font-size:18px;font-weight:800;color:#cfd6dc}
.mbig .msc{font-size:36px}.mbig .mvs{font-size:24px}
.mst{font-size:9.5px;font-weight:700;color:#cfd6dc;white-space:nowrap}.mst.lv{color:#ff6b6b;display:flex;align-items:center;gap:4px}
.mst.lv i{width:5px;height:5px;border-radius:50%;background:#ff6b6b;animation:pl 1.4s infinite}.mst.nx{color:#7fe0bf;font-size:11px}
.mvn{font-size:10px;color:#9aa5b0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.motd{margin:20px 0;border-radius:16px;overflow:hidden;background-size:cover;background-position:center;color:#fff;padding:18px 20px 20px}
.mo-h{text-align:center;font-size:10.5px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#cfd6dc;margin-bottom:12px}
.mo-r{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:16px;align-items:start;color:#fff!important;text-decoration:none}
.mo-t{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;text-align:center}
.mo-t img,.mo-t .lo{width:84px!important;height:84px!important;object-fit:contain;display:grid;place-items:center;border-radius:50%;font-size:24px}
.mo-t b{font-size:16px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mo-t ul{list-style:none;margin:0;padding:0;font-size:11.5px;color:#dfe5e9;line-height:1.6}.mo-t ul b{font-size:11.5px;color:#fff}
.mo-m{display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:18px}
.mo-s{font-size:46px;font-weight:800;line-height:1;letter-spacing:2px}.mo-s.vs{font-size:30px;color:#cfd6dc}
.mo-st{font-size:11px;font-weight:700;color:#cfd6dc}.mo-st.lv{color:#ff6b6b}.mo-m small{font-size:11px;color:#9aa5b0}
.mo-go{margin-top:6px;font-size:12px;font-weight:700;padding:7px 14px;border-radius:999px;background:#ffffff1f}
.lp{max-width:1280px;margin:0 auto 18px;border-radius:16px;overflow:hidden;background:radial-gradient(ellipse at 50% 0,#2c3a3a,#1a2222 70%);color:#fff;padding:14px 14px 10px}
.lp-hd{font-size:10.5px;color:#cfd6dc;letter-spacing:.8px;text-transform:uppercase;font-weight:700;text-align:center;margin-bottom:6px}.lp-hd a{color:#7fe0bf;margin-left:8px;text-transform:none;letter-spacing:0}
.lp-g{display:grid;grid-template-columns:160px minmax(0,1fr) 160px;gap:14px;align-items:start}
.lp-x{background:#0f1a17;border:1px solid #ffffff12;border-radius:10px;padding:10px 8px;font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;text-transform:uppercase}
.lp-x h4{margin:0 0 8px;font-size:15px;font-weight:800;letter-spacing:1px;line-height:1;color:#7fe0bf}
.lp-x ol{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.lp-x li{display:flex;align-items:stretch;font-size:11px;font-weight:600;line-height:1;border-radius:4px;overflow:hidden}.lp-x li b{flex:none;width:22px;display:grid;place-items:center;background:#ffffff14;color:#7fe0bf;padding:4px 0;font-weight:700}
.lp-x li span{flex:1;background:#ffffff0a;color:#e9eef2;padding:4px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-x h5{margin:10px 0 4px;font-size:12px;font-weight:700;color:#9fb5a6;letter-spacing:.8px}.lp-x .sbs{display:grid;grid-template-columns:1fr;gap:2px;font-size:10px;color:#b9c4bf;text-transform:none;font-family:system-ui,sans-serif}
.lp-x .na{font-size:11px;color:#9fb5a6;text-transform:none;font-family:system-ui,sans-serif;margin:0}
.lp-top{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px}
.lp-tm{display:flex;align-items:center;gap:12px;min-width:0}.lp-tm>div{min-width:0}.lp-tm.a{flex-direction:row-reverse;text-align:right}
.lp-tm img,.lp-tm .ph{width:64px;height:64px;object-fit:contain;flex:none}.lp-tm .ph{border-radius:50%;background:#ffffff1a}
.lp-tm b{font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-size:clamp(16px,2vw,28px);font-weight:800;text-transform:uppercase;line-height:1.05;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.lp-tm small{display:block;font-size:12px;font-weight:700;text-transform:uppercase;color:#c9d3cc;margin-top:3px}
.lp-sc{text-align:center;padding:0 6px}.lp-sc b{display:flex;align-items:center;gap:14px;font-size:54px;font-weight:900;line-height:1}.lp-sc b i{width:2px;height:44px;background:#fff8}
.lp-sc small{display:block;font-size:13px;font-weight:800;margin-top:6px;color:#fff}
.lp-tl{position:relative;height:92px;margin:6px 6% 0}
.lp-tl .tl-pg{transition:width 1s linear}.lp-tl .tl-now{position:absolute;margin-left:-6px;margin-top:-5px;transition:left 1s linear}.lp-tl .tl-now i{display:block;width:12px;height:12px;border-radius:50%;background:#7fe0bf;box-shadow:0 0 0 0 #7fe0bfaa;animation:tlp 1.6s infinite}.lp-tl .tl-now b{position:absolute;left:50%;top:-15px;transform:translateX(-50%);font-size:10px;color:#7fe0bf;font-weight:800}@keyframes tlp{70%{box-shadow:0 0 0 9px #7fe0bf00}100%{box-shadow:0 0 0 0 #7fe0bf00}}
.lp-tl .tl-ln{position:absolute;left:0;right:0;top:46px;height:2px;background:#ffffff40}.lp-tl .tl-pg{position:absolute;left:0;top:46px;height:2px;background:#7fe0bf}
.lp-tl .tl-ht{position:absolute;top:8px;bottom:8px;width:1px;background:#ffffff59;left:50%}
.lp-tl .tl-dt{position:absolute;top:42px;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:#9aa5ad}
.lp-tl .tl-fl{position:absolute;top:24px;margin-left:-1px;width:2px;height:20px;background:#ffffff80}.lp-tl .tl-fl:after{content:'';position:absolute;left:2px;top:0;border-left:11px solid var(--c,#ffd34d);border-top:5px solid transparent;border-bottom:5px solid transparent}
.lp-tl .tl-ev{position:absolute;transform:translateX(-50%);display:flex;align-items:center;gap:4px;font-size:10px;color:#e9eef2;white-space:nowrap}
.lp-tl .tl-ev.h{top:0}.lp-tl .tl-ev.a{top:62px}.lp-tl .tl-ev i{width:9px;height:13px;border-radius:2px;flex:none}.lp-tl .tl-ev i.y{background:#f4d03f}.lp-tl .tl-ev i.r{background:#e74c3c}
.lp-tl .tl-ev em{font-style:normal;color:#aab3bb}
.lp-f{position:relative;margin-top:4px}.lp svg{display:block;width:100%;height:auto}
.lp .pl{transition:transform 2.2s ease-in-out}.lp .bl{transition:transform 1.5s ease-in-out}.lp .bs{transition:transform 1.5s linear;transform-origin:0px -6px}
.lp-ov{position:absolute;inset:0;display:grid;place-items:start center;padding-top:4%;pointer-events:none;opacity:0;transition:opacity .3s}.lp-ov.on{opacity:1}
.lp-ov div{padding:10px 18px;border-radius:12px;background:#000b;text-align:center;font-weight:800}.lp-ov.on div{animation:lpgol .7s cubic-bezier(.2,1.6,.4,1)}@keyframes lpgol{0%{transform:scale(.3)}100%{transform:scale(1)}}
.lp-cf{position:absolute;inset:0;pointer-events:none;overflow:hidden}.lp-cf i{position:absolute;top:-4%;width:7px;height:11px;border-radius:2px;animation:lpcf 2.8s ease-in forwards}@keyframes lpcf{to{transform:translate3d(var(--dx),620px,0) rotate(var(--r));opacity:.9}}
.lp .rf .rcard,.lp .rf .ar-up{display:none}.lp .rf.card .rcard{display:inline}.lp .rf.up .ar-up{display:inline}.lp .rf.up .ar-dn{display:none}
.lp .pl.cel .fig{animation:lpjump .55s ease-in-out infinite alternate}.lp .pl.sad .fig{opacity:.55}@keyframes lpjump{to{transform:translateY(-9px)}}
@media(prefers-reduced-motion:reduce){.lp .pl.cel .fig{animation:none}}
.lp.crowd .nm{opacity:0}.lp .nm{transition:opacity .4s}
@media(max-width:900px){.lp .nm{display:none}}
@media(prefers-reduced-motion:reduce){.lp-cf{display:none}.lp-ov.on div{animation:none}}.lp-ov b{display:block;font-size:34px;color:#ffd34d;letter-spacing:2px}.lp-ov span{font-size:13px}
.lp-c{font-size:10.5px;color:#9fb5a6;text-align:center;padding:4px 10px 0}
@media(max-width:900px){.lp{padding:10px 8px 8px}.lp-g{grid-template-columns:1fr 1fr;gap:8px}.lp-g>.lp-m{grid-column:1/-1;order:-1}.lp-top{gap:6px}.lp-tm{gap:6px;flex-direction:column;text-align:center}.lp-tm.a{flex-direction:column;text-align:center}.lp-tm img,.lp-tm .ph{width:34px;height:34px}.lp-tm b{font-size:14px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.lp-tm small{font-size:9.5px}.lp-sc b{font-size:30px;gap:8px}.lp-sc b i{height:24px}.lp-sc small{font-size:11px}.lp-tl{margin:2px 0 0;height:84px}.lp-tl .tl-ev span{display:none}.lp-x{padding:8px 6px}.lp-x h4{font-size:16px}.lp-x li{font-size:10.5px}.lp-x li b{width:20px}.lp-x .sbs{grid-template-columns:1fr;font-size:10px}}
@media(prefers-reduced-motion:reduce){.lp .pl,.lp .bl{transition:none}}
.betb:empty,.betbox:empty{display:none}
.betb{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:2px}
.bet-go{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 12px;border-radius:999px;background:var(--bc,#1f8a4c);color:#fff;font-size:11.5px;font-weight:700;border:0;cursor:pointer;white-space:nowrap}
.bet-go:hover{filter:brightness(1.12)}.bet-18{font-size:9.5px;color:#aab3bb;white-space:nowrap}
.betbox{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:10px;margin:0 0 10px;border-radius:12px;background:var(--sf)}.betbox .bet-18{color:var(--mu)}
.lgt{margin:22px 0}.lgt h2{font-size:12px;letter-spacing:.8px;text-transform:uppercase;margin:0 0 10px;color:var(--tx,#e8ecf0)}
.lgt-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.lgt-i{display:flex;flex-direction:column;align-items:center;gap:7px;padding:16px 10px 12px;border-radius:12px;background-size:cover;background-position:center;color:#fff!important;text-decoration:none;min-width:0;text-align:center;transition:transform .15s}
.lgt-i:hover{transform:translateY(-2px)}
.lgt-lo{width:56px;height:56px;border-radius:50%;background:#ffffffeb;display:grid;place-items:center;box-shadow:0 3px 10px #0008;overflow:hidden}
.lgt-lo img{width:38px;height:38px;object-fit:contain}.lgt-lo b{color:#14171c;font-size:16px}
.lgt-n{font-size:12.5px;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lgt-i small{font-size:10.5px;color:#cfd6dc}.lgt-i em{font-style:normal;color:#ff6b6b;font-weight:700}
/* barras de desplazamiento delgadas y discretas en las listas */
.bk .lg.flat{scrollbar-width:thin;scrollbar-color:#8a94a055 transparent}.bk .lg.flat::-webkit-scrollbar{width:4px}.bk .lg.flat::-webkit-scrollbar-thumb{background:#8a94a055;border-radius:4px}.bk .lg.flat::-webkit-scrollbar-track,.bk .lg.flat::-webkit-scrollbar-button{background:transparent;display:none}
@media(max-width:700px){.motd{padding:14px 10px}.mo-r{gap:8px}.mo-t img,.mo-t .lo{width:56px!important;height:56px!important;font-size:16px}.mo-t b{font-size:13px}.mo-s{font-size:34px}.mo-t ul{font-size:10.5px}
.lgt-g{grid-template-columns:1fr 1fr}}
.livebox.mbig{margin:18px 0 16px}.mbig h2{color:var(--tx,#e8ecf0)!important;font-size:12px;margin-bottom:8px}
.lc .h{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--mu);margin-bottom:6px}
.lc .h b{color:var(--lv);white-space:nowrap}
.lc .h span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lc .r{display:flex;align-items:center;gap:8px;padding:2px 0;font-weight:600;font-size:14px}
.lc .r>span:not(.lo){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lc .r em{font-style:normal;font-size:22px;font-weight:800;min-width:24px;text-align:right}
.lc img,.lc .lo{width:24px;height:24px;object-fit:contain;flex:none}
.g3{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
.left{display:none}
@media(min-width:760px){.g3{grid-template-columns:minmax(0,1fr) 300px}
}
@media(min-width:1060px){.g3{grid-template-columns:220px minmax(0,1fr) 310px}
.left{display:block}
}
.left,.side{border-radius:var(--r)}
details.lg,.lg{background:var(--sf);border-radius:var(--r);margin:0 0 6px;overflow:hidden;box-shadow:var(--sh)}
details.lg>summary,.lg>h3{display:flex;align-items:center;gap:8px;margin:0;padding:7px 10px;font-size:12.5px;font-weight:700;background:var(--soft);cursor:pointer;list-style:none}
details.lg>summary::-webkit-details-marker{display:none}
.lg>h3{cursor:default}
details.lg>summary::after{content:"›";margin-left:6px;color:var(--mu);font-size:16px;line-height:1;transition:transform .15s}
details.lg[open]>summary::after{transform:rotate(90deg)}
details.lg>summary small,.lg>h3 small{color:var(--mu);font-weight:500;font-size:11.5px;margin-left:auto}
details.lg>summary .lvc{color:var(--lv);font-weight:700;margin-left:0}
details.lg>summary a:hover{color:var(--lk)}
.bd{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;color:#fff;font-size:9.5px;font-weight:700;flex:none}
.bd .ic{width:13px;height:13px}
.bd.lg2{width:38px;height:38px;border-radius:6px;font-size:14px}
.gr{display:grid;grid-template-columns:minmax(0,1fr)}
@media(min-width:700px){.gr{grid-template-columns:minmax(0,1fr) minmax(0,1fr);}
}
.lo{border-radius:50%;background:var(--ln);display:inline-block}.lo.ini{display:inline-flex;align-items:center;justify-content:center;background:hsl(var(--h) 42% 36%);color:#fff;font-weight:800;font-size:8px;letter-spacing:-.3px;line-height:1;flex:none;width:16px;height:16px}.lc .lo.ini{width:24px;height:24px;font-size:10px}.mh .lo.ini{width:56px;height:56px;font-size:19px}
.box{background:var(--sf);border-radius:var(--r);margin-bottom:6px;overflow:hidden;box-shadow:var(--sh)}
.box h4{margin:0;padding:7px 10px;font-size:11px;color:var(--mu);letter-spacing:.9px;text-transform:uppercase;background:var(--soft)}
.box>a,.box summary{display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:13px;border-top:1px solid var(--ln)}
.box>a:hover{background:var(--soft)}
.box>a small{margin-left:auto;color:var(--mu)}
.box summary{cursor:pointer;font-weight:600;font-size:12.5px;list-style:none}
.box summary::-webkit-details-marker{display:none}
.box details a{display:flex;align-items:center;gap:8px;padding:5px 10px 5px 14px;font-size:12.5px;color:var(--mu);border-top:1px solid var(--ln)}
.box details a:hover{color:var(--tx);background:var(--soft)}
.box details a small{margin-left:auto}
.tabs{display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 0 8px;padding:2px 0}
.tabs::-webkit-scrollbar{display:none}
.tabs label,.tabs a{flex:none}
.tabs a{padding:5px 10px;border-radius:var(--r);background:var(--sf);font-size:12px;font-weight:600;color:var(--mu);white-space:nowrap;box-shadow:var(--sh)}
.tabs a:hover{color:var(--tx)}
.pn{display:none}
body:has(#t-res:checked) label[for=t-res],body:has(#t-est:checked) label[for=t-est],body:has(#t-ali:checked) label[for=t-ali],body:has(#t-tab:checked) label[for=t-tab],body:has(#t-his:checked) label[for=t-his],body:has(#l-cla:checked) label[for=l-cla],body:has(#l-res:checked) label[for=l-res],body:has(#l-nxt:checked) label[for=l-nxt],body:has(#l-gol:checked) label[for=l-gol],body:has(#l-tar:checked) label[for=l-tar],body:has(#l-equ:checked) label[for=l-equ]{background:var(--sel);color:var(--selx)}
body:has(#t-res:checked) #p-res,body:has(#t-est:checked) #p-est,body:has(#t-ali:checked) #p-ali,body:has(#t-tab:checked) #p-tab,body:has(#t-his:checked) #p-his,body:has(#l-cla:checked) #q-cla,body:has(#l-res:checked) #q-res,body:has(#l-nxt:checked) #q-nxt,body:has(#l-gol:checked) #q-gol,body:has(#l-tar:checked) #q-tar,body:has(#l-equ:checked) #q-equ{display:block}
.tl{list-style:none;margin:0;padding:0}
.tl li{display:grid;grid-template-columns:40px 22px 1fr;gap:6px;align-items:center;padding:7px 10px;border-top:1px solid var(--ln)}
.tl b{color:var(--mu);font-weight:600;font-size:12.5px}
.tl small{color:var(--mu)}
.ic{width:16px;height:16px;display:block;color:var(--win)}
.cd{width:10px;height:14px;border-radius:2px;display:block;background:#f5b800}
.cd.r{background:#d92d20}
.sb{padding:8px 10px;border-top:1px solid var(--ln)}
.sb .r{display:flex;justify-content:space-between;font-weight:700;font-size:13px;margin-bottom:4px}
.sb .r span{color:var(--mu);font-weight:600;font-size:12px}
.sb .bar{display:flex;gap:3px;height:5px}
.sb .bar i{display:block;border-radius:2px;height:5px}
.sb .bar i.h{background:var(--ac)}
.sb .bar i.a{background:#f59e0b}
.sb .bar .bh,.sb .bar .ba{flex:1;display:flex;background:var(--ln);border-radius:2px;overflow:hidden}
.sb .bar .bh{justify-content:flex-end}
.ln2{display:grid;grid-template-columns:1fr 1fr}
.ln2>div{padding:8px 10px}
.ln2 h5{margin:0 0 4px;font-size:12.5px}
.ln2 small{color:var(--mu)}
.pl2{display:flex;gap:7px;padding:3px 0;font-size:13px}
.pl2 b{width:22px;color:var(--mu);font-weight:600}
.tb{width:100%;border-collapse:collapse;font-size:12.5px}
.tb th{color:var(--mu);font-weight:600;font-size:10.5px;padding:7px 4px;text-align:center;letter-spacing:.4px;text-transform:uppercase;background:var(--soft)}
.tb td{padding:6px 4px;text-align:center;border-top:1px solid var(--ln)}
.tb td.tn,.tb th.tn{text-align:left;padding-left:6px}
.tb td.rk{border-left:3px solid transparent;width:30px;color:var(--mu);font-weight:600}
.tb .p{font-weight:800}
.tb .pos{color:var(--win);font-weight:700}
.tb .neg{color:var(--lv);font-weight:700}
.tb tr.hl td{background:var(--hl)}
.tb .nt{display:block;font-size:10.5px;color:var(--mu);font-weight:500}
.tb img{width:16px;height:16px;object-fit:contain;vertical-align:-3px;margin-right:6px}
.fm{display:inline-flex;gap:2px}
.fm i{width:15px;height:15px;border-radius:3px;font:700 9px/15px system-ui;font-style:normal;text-align:center;color:#fff}
.fm i.g{background:#12a06a}
.fm i.e{background:#e0a100}
.fm i.p{background:#d92d20}
.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:6px;margin:8px 0}
.kp div{background:var(--sf);box-shadow:var(--sh);border-radius:var(--r);padding:7px 10px}
.kp b{display:block;font-size:17px}
.kp span{color:var(--mu);font-size:10.5px;text-transform:uppercase;letter-spacing:.5px}
.bar2 a.ar{padding:5px 9px;font-size:14px;line-height:1}
.dp{flex:none;height:26px;border:0;border-radius:var(--r);background:var(--sf);box-shadow:var(--sh);color:var(--tx);font:inherit;font-size:12px;padding:0 6px}
.rec{font-size:11px;color:var(--mu);font-weight:500;margin-top:2px}
.pt{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px}
@media(max-width:700px){.pt{grid-template-columns:1fr}
}
.pt h5{margin:0 0 6px;font-size:12.5px;display:flex;justify-content:space-between}
.pitch{position:relative;aspect-ratio:3/4;border-radius:6px;background:linear-gradient(#3f8f4a,#357d40);overflow:hidden;max-width:420px;margin:0 auto}
.pitch:before{content:"";position:absolute;inset:6% 6%;border:2px solid rgba(255,255,255,.55);border-radius:2px}
.pitch:after{content:"";position:absolute;left:6%;right:6%;top:50%;border-top:2px solid rgba(255,255,255,.55)}
.pp{position:absolute;transform:translate(-50%,-50%);text-align:center;width:22%;z-index:1}
.pp b{display:grid;place-items:center;width:30px;height:30px;margin:0 auto;border-radius:50%;background:#c8102e;color:#fff;font-size:12px;border:2px solid #fff}
.pp.aw b{background:#1d4ed8}
.pp span{display:block;margin-top:2px;font-size:10.5px;color:#fff;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp em{position:absolute;top:-4px;right:12%;font-style:normal;font-size:10px;background:#fff;color:#c00;border-radius:8px;padding:0 3px}
.sbs{padding:4px 10px 8px}
.sbs .pl2 small.in{color:var(--win)}
.sbs .pl2 small.out{color:var(--lv)}
.tl .sb2{width:14px;height:14px;color:var(--mu)}
.mp{grid-template-columns:minmax(0,1fr)}
.mp>.lu{order:2}
.mp>main{order:1}
.mp>.side{order:3;position:static;max-height:none}
.mp .pa{display:none}
body:has(#pt-a:checked) .mp .pa{display:block}
body:has(#pt-a:checked) .mp .ph{display:none}
.mp .tabs label{flex:1;text-align:center}
body:has(#pt-h:checked) label[for=pt-h],body:has(#pt-a:checked) label[for=pt-a]{background:var(--sel);color:var(--selx)}
.pt1{padding:0 10px 6px}
.mp .tabs{padding:8px 10px 6px;margin:0}
.sbl{display:flex;gap:8px;padding:7px 10px;border-top:1px solid var(--ln);font-size:12.5px}
.sbl b{color:var(--mu);width:34px}
.sbl .in{font-style:normal;color:var(--win);font-weight:600}
.sbl small{color:var(--mu)}
.sbh{display:flex;justify-content:space-between;padding:7px 10px;font-weight:700;font-size:12px;color:var(--mu)}
@media(min-width:1060px){.mp{grid-template-columns:330px minmax(0,1fr) 320px}
.mp>.lu,.mp>main,.mp>.side{order:0}
}
.top .w{height:58px;gap:6px}
.top nav{gap:0;height:58px;margin-left:10px}
.top nav a{display:flex;align-items:center;height:58px;padding:0 15px;border-radius:0;background:none;color:var(--mu);font-size:13.5px;font-weight:600;border-bottom:3px solid transparent}
.top nav a:hover{color:var(--tx);background:none}
.top nav a.on{color:var(--tx);background:none;border-bottom-color:var(--ac)}
.srch{position:relative}
.srch svg{position:absolute;left:10px;top:9px;width:16px;height:16px;color:var(--mu);pointer-events:none}
.srch input{padding-left:32px;height:34px}
.ib svg{width:17px;height:17px}
.ib{border-radius:6px}
.bar2{gap:8px}
.bar2 .grp{display:flex;gap:1px;background:var(--sf);border-radius:6px;padding:2px;flex:none;align-items:center}
.bar2 .grp>*{background:transparent;box-shadow:none;border-radius:4px;padding:6px 11px}
.bar2 .grp>a.on{background:var(--sel);color:var(--selx)}
.bar2 .rt{margin-left:auto}
.bar2 .dp{padding:0 4px;height:28px}
.bar2 .grp>a.ar{padding:6px 9px}
.bd.lgo{background:#fff;padding:1px}
.bd.lgo img{width:18px;height:18px;object-fit:contain;display:block}
.bd.lg2.lgo img{width:32px;height:32px}
.sh{display:flex;flex-direction:column;gap:8px;padding:0}
.sh .main{height:34px;border-radius:5px;background:var(--sel);color:var(--selx);font-weight:600;font-size:12.5px}
.sh .ico{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.sh .ico>*{display:grid;place-items:center;height:38px;border-radius:6px;background:var(--soft);color:var(--tx)}
.sh .ico>*:hover{background:var(--ln)}
.sh .ico svg{width:24px;height:24px}
.lcs{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.hrow{margin-bottom:6px}
.livebox{margin-bottom:10px}
.mh{background:var(--sf);border-radius:8px;box-shadow:var(--sh);margin-bottom:10px;overflow:hidden}
.mtb{display:flex;align-items:center;gap:10px;padding:5px 12px;background:var(--soft)}
.mh .mt{margin:0;padding:0;font-size:12px;font-weight:600;color:var(--mu);text-align:center;flex:1;min-width:0}
.sh.inl{flex-direction:row;align-items:center;gap:8px;flex:none}
.sh.inl .main{height:28px;padding:0 12px;white-space:nowrap}
.sh.inl .ico{display:flex;gap:5px}
.sh.inl .ico>*{width:28px;height:28px}
.sh.inl .ico svg{width:20px;height:20px}
@media(max-width:700px){.mtb{flex-wrap:wrap;justify-content:center}
.mh .mt{flex-basis:100%}
}
.mr{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;padding:12px 28px}
.tm2{display:flex;align-items:center;justify-content:space-between;gap:14px;min-width:0}
.mh img,.mh .lo{width:56px;height:56px;object-fit:contain;flex:none}
.tm2 .nm{font-weight:700;font-size:16px;min-width:0}
.mr .rec{font-size:11.5px;color:var(--mu);font-weight:500;margin-top:2px}
.sc2{font-size:40px;font-weight:800;line-height:1;text-align:center;letter-spacing:1px}
.sc2 span{color:var(--mu);font-weight:600}
.mr .st{margin-top:6px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.8px;color:var(--mu)}
.mr .st.lv{color:var(--lv)}
.mr .vs{text-align:center;font-size:22px;color:var(--mu);font-weight:600}
.ms{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;padding:7px 28px 9px;font-size:12px;color:var(--mu);border-top:1px solid var(--ln)}
.ms>div{display:flex;flex-wrap:wrap;gap:2px 16px;align-content:flex-start}
.ms>div:first-child{justify-content:flex-end}
.ms span{white-space:nowrap}
.ms i{font-style:normal;color:var(--tx);font-weight:600}
@media(max-width:700px){.mr{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:12px 14px}.mr .tm2{justify-content:flex-start;gap:12px}.mr .tm2:last-child{flex-direction:row-reverse;justify-content:flex-end}.mr .tm2 .nm,.mr .tm2 .nm[style]{text-align:left!important;font-size:16px;flex:1}.mh img,.mh .lo{width:34px;height:34px}.mr .sc2{font-size:38px;padding:2px 0}.mr .vs{padding:2px 0}.mr>div:nth-child(2){padding:2px 0;border-top:1px solid var(--ln);border-bottom:1px solid var(--ln)}.ms.sets,.mh .ms[style]{font-size:13px;color:var(--tx)}.ms{grid-template-columns:1fr}.ms>div,.ms>div:first-child{justify-content:flex-start;text-align:left}.ms span{white-space:normal}.tm2 .nm{overflow-wrap:anywhere;hyphens:auto}.mr{gap:8px;padding:10px 10px}
.mh img,.mh .lo{width:36px;height:36px}
.tm2{gap:8px}
.tm2 .nm{font-size:13px}
.sc2{font-size:28px}
.ms{padding:6px 10px 8px;gap:0 12px}
}
.note{background:var(--sf);border-radius:var(--r);box-shadow:var(--sh);padding:10px 14px;margin-bottom:6px;color:var(--mu);font-size:12.5px}
@media(min-width:1060px){
}
.lc .e b{color:var(--tx);font-weight:700}
.lc .e i{font-style:normal}
.lc .e{font-size:11.5px;color:var(--mu);padding:0 0 3px 32px;display:flex;flex-direction:row;flex-wrap:wrap;gap:0 12px;line-height:1.5}
.lc .e span{white-space:nowrap}
.lw{position:relative}
.lcs{display:flex;grid-template-columns:none;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:none;padding:1px 0 3px}
.lcs::-webkit-scrollbar{display:none}
.lc{flex:0 0 285px;scroll-snap-align:start}
.sl{position:absolute;top:50%;transform:translateY(-50%);width:28px;height:46px;border-radius:6px;background:var(--sf);box-shadow:0 1px 6px rgba(0,0,0,.35);z-index:2;font-size:20px;line-height:1;color:var(--tx)}
.sl.l{left:-8px}
.sl.r{right:-8px}
.sl:hover{background:var(--soft)}
@media(max-width:700px){.sl{display:none}
.lcs{margin:0}
}
@media(min-width:1060px){
}
.kp2{display:grid;grid-template-columns:repeat(3,1fr)}
.kp2>div{padding:9px 12px;border-top:1px solid var(--ln)}
.kp2 b{display:block;font-size:16px}
.kp2 span{font-size:10.5px;color:var(--mu);text-transform:uppercase;letter-spacing:.4px}
.sph{display:flex;align-items:center;justify-content:space-between;margin:14px 2px 8px;font-size:13px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:var(--tx)}
.sph a{font-size:11.5px;font-weight:600;text-transform:none;color:var(--mu)}
.sph:first-child{margin-top:0}
.sph a:hover{color:var(--tx)}
.livebox.res h2{color:var(--mu)}
.lc.fin .h b{color:var(--mu)}
.xa{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
.xa .pb{margin:0;height:32px}
.xa .rs{margin:0 0 0 auto}
.rs{display:flex;align-items:center;gap:6px}
.rs:empty{display:none}
.rs>small{color:var(--mu);font-size:11.5px;margin-right:2px}
.rs a,.rs button{width:32px;height:32px;border-radius:6px;background:var(--bg);display:grid;place-items:center;color:var(--tx)}
.rs a:hover,.rs button:hover{background:var(--ln)}
.rs svg{width:21px;height:21px}
.lc{flex:1 0 244px}
.lc .h{display:flex;align-items:center;gap:7px}
.lc .h .tg{flex:none;background:var(--c,#888);color:#0b0e12;font-size:9.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:2px 6px;border-radius:3px}
.lc .h .lgn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lc .h b{flex:none}
.lw.noov .sl{display:none}
.sph{scroll-margin-top:64px}
.sph:before{content:"";display:inline-block;width:4px;height:16px;border-radius:2px;background:var(--c,var(--ac));margin-right:8px;vertical-align:-3px}
.sph{justify-content:flex-start}
.sph a{margin-left:auto}
.chip[data-sp]:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c,#888);margin-right:7px}
.chip .n{color:var(--mu);font-weight:600}
.chip.on .n{color:inherit;opacity:.7}
details.lg>summary .tg{flex:none;background:var(--c,#888);color:#0b0e12;font-size:9.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:2px 6px;border-radius:3px}
.ib[data-snd] .w2{display:none}
.ib[data-snd].off .w1{display:none}
.ib[data-snd].off .w2{display:block}
.ib[data-snd].off{color:var(--mu)}
.top .w{gap:6px}
.pt-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:12px;max-width:calc(100% - 24px);padding:11px 18px;border-radius:12px;background:#0c1018;color:#ececec;box-shadow:0 6px 24px rgba(0,0,0,.45);font-size:13.5px}
.pt-toast b{display:block;font-size:14px}
.pt-toast small{color:#9aa3ad}
.pt-toast.red b{color:#ff6a78}
.pt-toast.yellow b{color:#f5c400}
.pt-lock{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:60;border-radius:999px;padding:10px 18px;font-weight:800;font-size:13px;background:var(--ac);color:#06201a;box-shadow:0 4px 18px rgba(0,0,0,.4)}
.lg.flat{background:var(--sf)}
.lg.flat .gr>.mx:first-child{border-top:0}
.rw.hubr .tl2{grid-column:1/-1;grid-row:1;display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden}
.rw.hubr .lgc{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;font-size:11px;color:var(--mu)}
.rw.hubr .lgc em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rw.hubr .lgc .tg{flex:none;background:var(--c,#888);color:#0b0e12;font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:1px 5px;border-radius:3px}
.rw.hubr .tm,.rw.hubr .sc,.rw.hubr .chev{grid-row:2}
.rw.hubr .e1,.rw.hubr .e2{grid-row:3}
@media(min-width:1240px){.rw.hubr{grid-template-columns:168px 210px minmax(0,1fr) 62px minmax(0,1fr) 210px 20px}
.rw.hubr .tl2{grid-column:1;grid-row:1;flex-direction:column;align-items:flex-start;gap:2px}
.rw.hubr .e1{grid-column:2;grid-row:1}
.rw.hubr .tm.h{grid-column:3;grid-row:1}
.rw.hubr .sc{grid-column:4;grid-row:1}
.rw.hubr .tm.a{grid-column:5;grid-row:1}
.rw.hubr .e2{grid-column:6;grid-row:1}
.rw.hubr .chev{grid-column:7;grid-row:1}
}
@media(min-width:701px){.bnav{display:none}.more{display:none}}
@media(max-width:700px){
.lw .sl{display:none}
.lcs{display:grid!important;grid-template-columns:minmax(0,1fr);gap:8px;overflow:visible!important;margin:0!important;padding:0!important;scroll-snap-type:none}
.lc{width:auto!important;min-width:0;max-width:100%;flex:none!important}
.lcs .lc:nth-child(n+4){display:none}
.livebox h2{display:flex;align-items:center}.more{margin-left:auto;font-size:11.5px;font-weight:700;color:var(--ac);text-transform:none;letter-spacing:0}
}
/* celulares «anchos» (Samsung con zoom de pantalla, plegables, 5.5-6.9 pulgadas en modo grande): todo se agranda para que se lea sin acercar */
@media(min-width:441px) and (max-width:560px){html{zoom:1.18}}
@media(min-width:561px) and (max-width:700px){html{zoom:1.38}}
@media(max-width:700px){
.bnav{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:50;background:var(--sf);box-shadow:0 -2px 14px rgba(0,0,0,.28);padding-bottom:env(safe-area-inset-bottom)}
.bnav>a,.bnav summary{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;height:58px;font-size:10.5px;font-weight:700;color:var(--mu);list-style:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bnav summary::-webkit-details-marker{display:none}.bnav svg{width:23px;height:23px}.bnav>a.on,.bnav .bmore.on summary,.bnav .bmore[open] summary{color:var(--ac)}
.bmore{flex:1;display:flex}.bmore>summary{flex:1}
.bsheet{position:fixed;left:10px;right:10px;bottom:calc(70px + env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;border-radius:16px;background:var(--sf);box-shadow:0 8px 32px rgba(0,0,0,.45)}
.bsheet a{display:flex;align-items:center;justify-content:center;height:46px;border-radius:10px;background:var(--soft);font-weight:700;font-size:13.5px}.bsheet a.on{background:var(--ac);color:#06201a}
body{padding-bottom:calc(66px + env(safe-area-inset-bottom))}
.top .sptd{display:none}.top .w{padding-top:8px;padding-bottom:8px}.top .srch input{height:38px}.ib{width:38px;height:38px}
footer{padding-bottom:12px}
.pt-toast{bottom:calc(78px + env(safe-area-inset-bottom))}.pt-lock{bottom:calc(132px + env(safe-area-inset-bottom))}
.bar2{flex-wrap:wrap;overflow:visible;row-gap:8px}.bar2 .grp{flex-wrap:wrap}
.bar2 .grp:first-child>a:not(.ar):not(.on){display:none}.bar2 .grp:first-child{flex:1 1 auto;justify-content:space-between}
.chips[data-spchips]{flex-wrap:wrap;overflow:visible}.chip{padding:8px 12px}
.rw{min-height:48px}
.livebox h2,.sph{font-size:12px}
}
.pp b.fc{position:relative;padding:0;overflow:hidden;background:#fff;width:38px;height:38px}.pp b.fc img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}.pp b.fc i{position:absolute;right:-1px;bottom:-1px;font:700 9px/1 system-ui;font-style:normal;background:#111;color:#fff;border-radius:6px;padding:1px 3px;z-index:1}
.pitch.court{background-image:none;overflow:hidden}.pitch.court:before,.pitch.court:after{display:none}.pitch.court>svg{position:absolute;inset:0;width:100%;height:100%}.pitch.court .pp b{background:#1d4ed8}.pitch.court .pp span{text-shadow:0 1px 3px rgba(0,0,0,.85)}
.lgx{overflow-x:auto}
.empty{padding:20px 12px;color:var(--mu);text-align:center}
.bt{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.pill{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:var(--r);background:var(--sf);box-shadow:var(--sh);font-weight:600;font-size:12.5px}
.pill:hover{background:var(--soft)}
.pill.main{background:var(--sel);color:var(--selx)}
.rg{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px}
.rg a{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--sf);box-shadow:var(--sh);border-radius:var(--r)}
.rg a:hover{background:var(--soft)}
.rg b{display:block;font-size:13px}
.rg small{color:var(--mu)}
footer{padding:16px 0 28px;color:var(--mu);font-size:12px}
footer .w{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between}
footer a{margin-left:14px}
footer a:hover{color:var(--tx)}
.age{margin-top:6px;font-size:11px}
@media(max-width:700px){.top nav,.top nav a{height:48px}
.top nav{margin-left:0}
.top nav a{padding:0 10px}
.w{padding:0 8px}
.top .w{gap:8px;height:48px}
.brand img{height:26px;max-width:110px}
.top nav a{padding:6px 9px;font-size:12.5px}
.srch{max-width:none}
.pg{padding-top:8px}
.lcs{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;margin:0 -8px;padding:0 8px}
.lcs::-webkit-scrollbar{display:none}
.lc{flex:none;width:78%;scroll-snap-align:start}
.bar2 .rt{display:none}
h1{font-size:16px}
.tb .hid{display:none}
.ln2{grid-template-columns:1fr}
.left,.side{position:static;max-height:none}
}
.top .w{display:flex;align-items:center;gap:6px;height:52px}
.top .brand img{height:28px}
.sptd{display:flex;height:100%;margin-left:12px;overflow-x:auto;scrollbar-width:none;min-width:0}
.sptd::-webkit-scrollbar{display:none}
.sptd a{flex:none;display:flex;align-items:center;padding:0 13px;font-size:13px;font-weight:600;color:var(--mu);border-bottom:2px solid transparent;white-space:nowrap}
.sptd a:hover,.tlk:hover{color:var(--tx)}
.sptd a.on{color:var(--tx);border-bottom-color:var(--ac)}
.tlk{flex:none;padding:0 9px;font-size:12.5px;font-weight:600;color:var(--mu)}
.tlk.on{color:var(--tx)}
.top .srch{margin-left:auto;flex:0 1 260px}
.g2{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
@media(min-width:1060px){.g2{grid-template-columns:minmax(0,1fr) 316px}
}
.chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 0 10px;padding:1px 0}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;padding:6px 12px;border-radius:999px;background:var(--sf);color:var(--mu);font-weight:600;font-size:12px;box-shadow:var(--sh);white-space:nowrap}
.chip.on{background:var(--sel);color:var(--selx)}
.chip b{color:var(--lv);font-size:10px}
details.lg>summary small{margin-left:0}
details.lg>summary .sp1{flex:1}
details.lg>summary .ln{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.fav{font-size:15px;line-height:1;color:var(--mu);padding:0 5px}
.fav.on{color:#f5b800}
details.lg>summary .cnt{color:var(--mu);font-weight:600;min-width:14px;text-align:right}
.gr{display:block}
.mx{border-top:1px solid var(--ln)}
.gr>.mx:first-child{border-top:0}
.mx>summary{list-style:none;cursor:pointer}
.mx>summary::-webkit-details-marker{display:none}
.rw{display:grid;grid-template-columns:46px minmax(0,1fr) 60px minmax(0,1fr) 18px;align-items:center;column-gap:8px;row-gap:3px;min-height:40px;padding:5px 12px;font-size:13px}
.rw:hover{background:var(--soft)}
.rw .t{grid-column:1;grid-row:1;font-size:11.5px;font-weight:700;color:var(--mu);white-space:nowrap}
.mx.lv .t{color:var(--lv)}
.mx.lv .t i{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--lv);margin-right:4px;vertical-align:middle;animation:pl 1.4s infinite}
.rw .tm{display:flex;align-items:center;gap:7px;min-width:0;grid-row:1}
.rw .tm.h{grid-column:2;justify-content:flex-end;text-align:right}
.rw .tm.a{grid-column:4}
.rw .tm>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rw .tm img,.rw .tm .lo{width:18px;height:18px;object-fit:contain;flex:none}
.rw .sc{grid-column:3;grid-row:1;text-align:center;font-weight:800;background:var(--soft);border-radius:4px;padding:3px 0;font-size:12.5px;white-space:nowrap}
.mx.lv .sc{color:var(--lv)}
.rw .w2{font-weight:700}
.rw .lo2{color:var(--mu)}
.rw .ev{display:flex;flex-wrap:wrap;gap:1px 10px;font-size:11.5px;color:var(--mu);min-width:0;line-height:1.5}
.rw .ev:empty{display:none}
.rw .ev b{color:var(--tx);font-weight:700}
.rw .ev i{font-style:normal}
.rw .ev span{white-space:nowrap}
.rw .e1{grid-column:2;grid-row:2;justify-content:flex-end}
.rw .e2{grid-column:4;grid-row:2}
.rw .chev{grid-column:5;grid-row:1;width:14px;height:14px;color:var(--mu)}
.rw .chev:after{content:"";display:block;width:6px;height:6px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);margin:1px 0 0 3px;transition:transform .15s}
.mx[open] .chev:after{transform:rotate(-135deg);margin-top:5px}
.xp{background:var(--soft);padding:10px 12px 12px;font-size:12.5px}
.xl{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:6px}
.xl>div{display:flex;flex-direction:column;gap:2px}
.xl>div:first-child{align-items:flex-end;text-align:right}
.xi{color:var(--mu);margin-bottom:4px}
.xl span{display:block}
.xp .pb{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:5px;background:var(--bg);font-weight:600;font-size:12px;margin:6px 8px 0 0}
.xp .pb.p{background:var(--ac);color:#06201a}
@media(min-width:1240px){.rw{grid-template-columns:50px 210px minmax(0,1fr) 62px minmax(0,1fr) 210px 20px}
.rw .t{grid-column:1}
.rw .e1{grid-column:2;grid-row:1;justify-content:flex-start;flex-wrap:nowrap;overflow:hidden}
.rw .tm.h{grid-column:3}
.rw .sc{grid-column:4}
.rw .tm.a{grid-column:5}
.rw .e2{grid-column:6;grid-row:1;flex-wrap:nowrap;overflow:hidden}
.rw .chev{grid-column:7}
}
.box .tabs{display:flex;gap:0;padding:0 6px;margin:0;background:var(--soft);overflow-x:auto;scrollbar-width:none}
.box .tabs label{flex:none;padding:10px 11px;font-weight:600;font-size:12px;color:var(--mu);cursor:pointer;background:none;box-shadow:none;border-radius:0;border-bottom:2px solid transparent}
.rp{display:none}
body:has(#pr-w:checked) #pp-w,body:has(#pr-a:checked) #pp-a,body:has(#pr-m:checked) #pp-m{display:block}body:has(#pr-w:checked) label[for=pr-w],body:has(#pr-a:checked) label[for=pr-a],body:has(#pr-m:checked) label[for=pr-m]{color:var(--tx);border-bottom-color:var(--ac)}
.rw .qp{display:contents}.qp em{grid-column:1;grid-row:2;font-style:normal;font-size:10px;font-weight:800;color:var(--mu);letter-spacing:.5px;text-align:left;align-self:center}.qp button{grid-row:2;height:30px;border-radius:var(--r);background:var(--soft);color:var(--tx);font-size:13px;font-weight:800;border:2px solid transparent;cursor:pointer;padding:0}.qp button[data-v=H]{grid-column:2}.qp button[data-v=D]{grid-column:3}.qp button[data-v=A]{grid-column:4}.qp button:hover{border-color:var(--ac);color:var(--ac)}.qp button.on{border-color:var(--ac);color:var(--ac);background:transparent}
@media(min-width:1240px){.qp em{grid-column:1}.qp button[data-v=H]{grid-column:3}.qp button[data-v=D]{grid-column:4}.qp button[data-v=A]{grid-column:5}}
/* celular y tableta: en la portada los botones de pronóstico van en su propia fila, debajo de los equipos (antes se montaban encima) */
@media(max-width:1239px){.rw.hubr .qp em,.rw.hubr .qp button{grid-row:4;margin-top:6px}.qp button{height:28px;font-size:12px;font-weight:700}}
.bk[data-b=fin] .lg.flat{max-height:268px;overflow-y:auto;overscroll-behavior:contain}.bk[data-b=nx] .lg.flat{max-height:560px;overflow-y:auto;overscroll-behavior:contain}.more2{display:block;margin:2px 0 10px;padding:9px 12px;border-radius:var(--r);background:var(--sf);color:var(--ac);font-size:13px;font-weight:700;text-align:center}
.rk2 .pl{display:flex;align-items:center}.rk2 .pn{display:flex;flex-direction:column;line-height:1.2;min-width:0}.rk2 .pn small{color:var(--mu);font-size:11px;font-weight:500}.rk2 .okc{color:var(--win);font-weight:700}.rk2 .fc{color:#e0566b;font-weight:700}.rk2 tr.top .p{color:var(--ac)}.mine{padding:0}.pd{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--ln);font-size:13px}.mine .st3{display:grid;grid-template-columns:repeat(4,1fr);gap:0;text-align:center}.mine .st3>div{padding:12px 4px}.mine .st3 b{display:block;font-size:20px}.mine .st3 span{font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px}
details.mx.ft>summary{box-shadow:inset 3px 0 0 var(--ac)}
.pb.fw{background:var(--soft);color:var(--tx)}.pb.fw.on{color:var(--ac)}.mcard{display:block;width:100%;height:auto;border-radius:var(--r);margin:0 0 8px}
.fw1{margin-top:8px;padding:6px 12px;border-radius:var(--r);background:var(--soft);color:var(--tx);font-size:12px;font-weight:700;border:0;cursor:pointer}.fw1.on{color:var(--ac)}.mh2 .pb{padding:7px 12px;border-radius:var(--r);background:var(--soft);color:var(--tx);font-size:12px;font-weight:700;border:0;cursor:pointer}
.mine .mh2{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px}.mine .mh2 .pb{font-size:12px}
.tbar{display:grid;grid-template-columns:minmax(0,90px) 1fr minmax(0,90px);gap:10px;align-items:center;padding:10px 12px 0;font-size:11px;color:var(--mu)}.tbar .tl0,.tbar .tl1{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tbar .tl1{text-align:right}
.tbl{position:relative;height:48px}.tbl::before{content:'';position:absolute;left:0;right:0;top:50%;height:2px;background:var(--ln)}.tbl .ht{position:absolute;top:28%;bottom:28%;width:2px;background:var(--mu);opacity:.5}
.tbm{position:absolute;transform:translateX(-50%);border-radius:50%;outline-offset:2px}.tbm.h{top:2px}.tbm.a{bottom:2px}.tbm.g{width:16px;height:16px;background:var(--ac);box-shadow:0 0 0 2px var(--sf)}.tbm.y,.tbm.r{width:9px;height:13px;border-radius:2px}.tbm.y{background:#f5c518}.tbm.r{background:#e0334d}
.tbs{display:grid;grid-template-columns:minmax(0,90px) 1fr minmax(0,90px);gap:10px;padding:0 12px 6px;font-size:10px;color:var(--mu)}.tbs>div{display:flex;justify-content:space-between}
.av{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;margin-right:10px;font-size:12px;flex:none;font-weight:800;color:#fff;overflow:hidden;vertical-align:middle}.av img{width:100%;height:100%;object-fit:cover}
.rules>div{display:flex;justify-content:space-between;padding:7px 10px;border-top:1px solid var(--ln);font-size:13px}.rules b{color:var(--ac)}
.pred{padding:0 0 10px}.pred .pq{padding:8px 12px 2px;font-size:12px;color:var(--mu);font-weight:700}.pred .pr{display:flex;gap:6px;padding:4px 12px;flex-wrap:wrap}.pred .pr button,.pred .pr label{flex:1;min-width:70px;padding:8px 6px;border-radius:var(--r);background:var(--soft);color:var(--tx);font-size:13px;font-weight:700;border:2px solid transparent;cursor:pointer;text-align:center}.pred .pr button.on{border-color:var(--ac);color:var(--ac)}.pred .pr input[type=number]{width:60px;padding:8px;text-align:center;font-size:16px;font-weight:800;background:var(--soft);color:var(--tx);border:2px solid transparent;border-radius:var(--r)}.pred .pr .vs2{align-self:center;color:var(--mu);font-weight:800}.pred .go{margin:8px 12px 0;padding:10px;width:calc(100% - 24px);border-radius:var(--r);background:var(--ac);color:#fff;font-weight:800;font-size:14px;border:0;cursor:pointer}.pred .go:disabled{opacity:.55}.pred .ok{margin:6px 12px 0;font-size:12px;color:var(--win)}.pred .pd{display:flex;justify-content:space-between;padding:5px 12px;font-size:13px}.pred .hit1{color:var(--win)}.pred .hit0{color:var(--mu);text-decoration:line-through}.pred .hitv{color:var(--mu)}
body:has(#rt-t:checked) #rp-t,body:has(#rt-g:checked) #rp-g,body:has(#rt-p:checked) #rp-p{display:block}
body:has(#rt-t:checked) label[for=rt-t],body:has(#rt-g:checked) label[for=rt-g],body:has(#rt-p:checked) label[for=rt-p]{color:var(--tx);border-bottom-color:var(--ac)}
.rp .rh{padding:8px 12px 2px;font-size:12px;font-weight:700}
.rp>a{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:13px;border-top:1px solid var(--ln)}
.rp>a small{margin-left:auto;color:var(--mu)}
.rp>a:hover{background:var(--soft)}
.lc{flex:1 0 244px}
.lc .r s{text-decoration:none;font-size:11px;font-weight:500;color:var(--mu);flex:none}
@media(max-width:700px){.top .w{flex-wrap:wrap;height:auto;padding-top:6px;padding-bottom:0;row-gap:0}
.top .brand{order:1}
.top .srch{order:2;flex:1 1 auto;margin-left:8px}
.top .ib{order:3}
.tlk{display:none}
.sptd{order:4;flex:0 0 100%;height:38px;margin:0}
.sptd a{padding:0 12px}
.rw{grid-template-columns:42px minmax(0,1fr) 54px minmax(0,1fr) 16px;padding:6px 8px;column-gap:6px}
.rw .ev span{white-space:normal}
.top .srch{flex:1 1 0;min-width:0}
details.lg>summary small:not(.cnt):not(.lvc),details.lg>summary a.mu{display:none}
details.lg>summary .lvc{white-space:nowrap}
.rw .tm img,.rw .tm .lo{width:16px;height:16px}
.lc{flex:0 0 78%}
.xl{gap:4px 12px}
}
`
  // direcciones absolutas con el dominio real: el servidor cambia __ORIGIN__ (y __ORIGIN_ENC__ dentro de enlaces para compartir)
  const encU = s => encodeURIComponent(s).replace(/__ORIGIN__/g, '__ORIGIN_ENC__')
  const KW_BASE = ['resultados de fútbol', 'marcadores en vivo', 'partidos de hoy', 'tabla de posiciones', 'goleadores', 'ligas de fútbol', 'estadísticas de fútbol', 'fútbol en vivo', 'resultados en vivo', 'calendario de partidos']
  function shell({ title, desc, path, body, head = '', noindex = false, nav = '', kw = [], og = '', sp = 'futbol', card = null, live = false }) {
    const st = S(), c = st.colors || {}, origin = '__ORIGIN__', name = esc(st.name || 'PLANETA')
    const u2 = x => /^(https:\/\/|\/)[^\s"'<>]{1,300}$/.test(x || '') ? x : '', lt = u2(st.logoLight || st.logoDark), dk = u2(st.logoDark || st.logoLight), fav = u2(st.favicon) || lt || '/icon.svg'
    const abs = u => !u ? '' : u.startsWith('/') ? origin + u : u, ogImg = abs(u2(og || st.partidosOg || st.ogImage) || lt || dk)
    const words = [...new Set([...kw, ...String(st.partidosKeywords || '').split(','), ...String(st.seoKeywords || '').split(','), ...KW_BASE].map(x => x.trim()).filter(Boolean))].join(', ').slice(0, 400)
    const ld = { '@context': 'https://schema.org', '@type': 'WebSite', name: st.name || 'PLANETA', url: origin + '/partidos', inLanguage: 'es' }
    const site = JSON.stringify({ name: st.name || '', logoDark: dk, logoLight: lt, snd: st.matchSound !== false, crowd: st.matchCrowd !== false, scope: st.matchSoundScope || 'all' })
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${name}"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="manifest" href="/manifest.webmanifest">
<title>${esc(title)} · ${name}</title><meta name="description" content="${esc(desc).slice(0, 300)}"><meta name="keywords" content="${esc(words)}">${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<link rel="icon" href="${esc(fav)}"><link rel="shortcut icon" href="${esc(fav)}"><link rel="apple-touch-icon" href="${esc(u2(st.favicon) || '/icon-192.png')}"><link rel="canonical" href="${origin}${esc(path)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc).slice(0, 200)}"><meta property="og:type" content="website"><meta property="og:url" content="${origin}${esc(path)}"><meta property="og:site_name" content="${name}"><meta property="og:locale" content="es_LA">${ogImg ? `<meta property="og:image" content="${esc(ogImg)}">${og && card ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : ''}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(ogImg)}">` : '<meta name="twitter:card" content="summary">'}<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc).slice(0, 200)}"><meta name="theme-color" content="#0f172a">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>${head}
<style>:root{--ac:${esc(c.accent || '#2fb59a')}}</style><link rel="stylesheet" href="/portal.css?v=${BUILD}"><script>try{var t=localStorage.getItem('portalTheme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script></head>
<body data-site='${esc(site)}'${live ? ' data-live="1"' : ''}${card ? ` data-card='${esc(JSON.stringify(card))}'` : ''}><header class="top"><div class="w"><a class="brand" href="/partidos" aria-label="${name}">${lt ? `<img class="lt" src="${esc(lt)}" alt="${name}"><img class="dk" src="${esc(dk)}" alt="">` : `<b>${name}</b>`}</a><div class="sptd" role="navigation" aria-label="Deportes"><a href="/partidos" class="${sp === 'inicio' && nav !== 'l' ? 'on' : ''}">Inicio</a><a href="/partidos/futbol" class="${sp === 'futbol' && nav !== 'l' ? 'on' : ''}">Fútbol</a>${st.partidosSports === false ? '' : Object.keys(SP).map(k => `<a href="/partidos/${k}" class="${sp === k && nav !== 'l' ? 'on' : ''}">${SP[k].es}</a>`).join('')}</div>${st.pronosOn === false ? '' : `<a class="tlk${nav === 'j' ? ' on' : ''}" href="/partidos/pronosticos">Pronósticos</a>`}<a class="tlk${nav === 'l' ? ' on' : ''}" href="/ligas">Ligas</a><a class="tlk" href="/">Mapa</a><div class="srch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="search" data-search placeholder="Buscar equipo o liga" aria-label="Buscar equipo o liga"></div><button class="ib" data-snd type="button" aria-label="Sonido de los partidos: voz y pitidos" title="Sonido de los partidos"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path class="w1" d="M16 9.500a3.500 3.500 0 0 1 0 5M18.500 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="w2" d="m16 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button class="ib" data-theme-toggle type="button" aria-label="Cambiar tema claro u oscuro"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor"/></svg></button></div></header>
<div class="pg"><div class="w">${body}</div></div>
<nav class="bnav" aria-label="Navegación principal"><a href="/partidos" class="${sp === 'inicio' && nav !== 'l' ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.500 12 5l8 6.500V20h-5v-5H9v5H4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Inicio</span></a><a href="/partidos/futbol" class="${sp === 'futbol' && nav !== 'l' ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.500" fill="none" stroke="currentColor" stroke-width="2"/><path d="m12 8 3.500 2.500-1.300 4H9.800l-1.300-4Z" fill="currentColor"/></svg><span>Fútbol</span></a>${st.pronosOn === false ? '' : `<a href="/partidos/pronosticos" class="${nav === 'j' ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.500" fill="currentColor"/></svg><span>Jugar</span></a>`}<a href="/ligas" class="${nav === 'l' ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v2a3 3 0 0 0 3 3m10-5h3v2a3 3 0 0 1-3 3M12 14v4m-3.500 2h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Ligas</span></a><a href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2Zm5-2v14m6-12v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Mapa</span></a>${st.partidosSports === false ? '' : `<details class="bmore${sp !== 'inicio' && sp !== 'futbol' && nav !== 'l' ? ' on' : ''}"><summary><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.500" height="6.500" rx="1.500" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.500" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.500" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.500" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Deportes</span></summary><div class="bsheet">${Object.keys(SP).map(k => `<a href="/partidos/${k}" class="${sp === k && nav !== 'l' ? 'on' : ''}">${SP[k].es}</a>`).join('')}</div></details>`}</nav>
<footer><div class="w"><span>${name} · Resultados, tablas y estadísticas de fútbol. Datos de ESPN.</span><span><a href="/partidos">Resultados</a><a href="/ligas">Ligas</a><a href="/">Mapa</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a></span></div></footer><script type="module" src="/portal.js?v=${BUILD}"></script></body></html>`
  }
  // botones para compartir: la tarjeta con tu marca (la misma del mapa) y enlaces directos a las redes
  const SOC = {'wa': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#25d366"/><path d="M12 5.6a6.4 6.4 0 0 0-5.5 9.7L5.6 18.4l3.2-.9A6.4 6.4 0 1 0 12 5.6Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.6 9.2c.2 2.2 2 4.3 4.7 5.2l1-1.2-1.7-.9-.8.7c-.8-.4-1.6-1.2-2-2l.7-.8-.8-1.8Z" fill="#fff"/></svg>', 'fb': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877f2"/><path d="M13.4 19v-6.2h2.1l.4-2.5h-2.5V8.7c0-.7.3-1.2 1.3-1.2h1.3V5.3c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.200-3.2 3.300v1.800H8.800v2.500h2.100V19h2.500Z" fill="#fff"/></svg>', 'x': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#111"/><path d="M7.200 7.200l9.600 9.600M16.800 7.200l-9.600 9.600" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>', 'tg': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#29a9eb"/><path d="M18.600 6.200 5.400 11.300c-.9.300-.9.900-.2 1.100l3.300 1 1.300 3.900c.2.500.3.600.7.600.3 0 .5-.1.700-.3l1.800-1.700 3.400 2.500c.6.300 1.100.2 1.300-.6l2.200-10.500c.3-1-.4-1.500-1.300-1.100Zm-9 6 6.900-4.300c.3-.2.600-.1.400.1l-5.600 5.100-.2 2.300-1.500-3.200Z" fill="#fff"/></svg>', 'cp': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'}
  const shareBar = (url, text, m, city, inl) => `<div class="sh${inl ? ' inl' : ''}">${m ? `<button class="main" type="button" data-share data-url="__ORIGIN__${esc(url)}" data-text="${esc(text)}" data-city="${esc(city || '')}" data-m="${esc(JSON.stringify(m))}">Compartir tarjeta</button>` : ''}<div class="ico"><a target="_blank" rel="noopener" title="WhatsApp" aria-label="Compartir en WhatsApp" href="https://wa.me/?text=${encU(text + ' __ORIGIN__' + url)}">${SOC.wa}</a><a target="_blank" rel="noopener" title="Facebook" aria-label="Compartir en Facebook" href="https://www.facebook.com/sharer/sharer.php?u=${encU('__ORIGIN__' + url)}">${SOC.fb}</a><a target="_blank" rel="noopener" title="X" aria-label="Compartir en X" href="https://twitter.com/intent/tweet?text=${encU(text)}&url=${encU('__ORIGIN__' + url)}">${SOC.x}</a><a target="_blank" rel="noopener" title="Telegram" aria-label="Compartir en Telegram" href="https://t.me/share/url?url=${encU('__ORIGIN__' + url)}&text=${encU(text)}">${SOC.tg}</a><button type="button" title="Copiar enlace" aria-label="Copiar enlace" data-copy="__ORIGIN__${esc(url)}">${SOC.cp}</button></div></div>`
  // sin logo ni bandera en ESPN: un escudo con las iniciales y un color fijo por equipo (nunca un círculo vacío)
  const crest = name => {
    const w = String(name || '').replace(/[/(),.]/g, ' ').split(/\s+/).filter(x => x && !/^(fc|cf|sc|ac|cd|fk|sk|afc|club|de|del|la|el|the|of|and|y|u\d+|w)$/i.test(x))
    const ini = (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase()
    let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360
    return `<span class="lo ini" style="--h:${h}" aria-hidden="true">${esc(ini)}</span>`
  }
  const cityOf = new Map(), qCity = db.prepare("SELECT city, COUNT(*) AS n FROM match_archive WHERE venue = ? AND city != '' AND lower(city) != lower(venue) GROUP BY city ORDER BY n DESC LIMIT 1")
  const hab = new Map()   // sede habitual de cada equipo en cada liga (la que más usó en los partidos guardados)
  const qHab = db.prepare("SELECT venue, city, COUNT(*) AS n FROM match_archive WHERE home = ? AND slug = ? AND venue != '' GROUP BY venue, city ORDER BY n DESC LIMIT 1")
  function withVenue(r) {
    let v = String(r.venue || '').trim(), c = String(r.city || '').trim(), h = false
    if (v && c && v.toLowerCase() === c.toLowerCase()) c = ''   // ESPN a veces repite el estadio como ciudad
    if (v && !c) { let x = cityOf.get(v); if (x === undefined) { x = qCity.get(v)?.city || ''; cityOf.set(v, x); if (cityOf.size > 3000) cityOf.clear() } c = x }   // sin ciudad: la que ya se guardó para ese mismo estadio
    if (!v && (r.sport || 'futbol') === 'futbol' && r.slug) {
      const k = r.home + '|' + r.slug, g = hab.get(k); let x = g && now() - g.t < 6 * 3600e3 ? g.v : undefined
      if (x === undefined) { const q = qHab.get(r.home, r.slug); x = q && q.n >= 2 ? q : null; hab.set(k, { t: now(), v: x }); if (hab.size > 3000) hab.clear() }
      if (x) { v = x.venue; c = x.city || c; h = true }
    }
    return v === r.venue && c === r.city ? r : { ...r, venue: v, city: c, vh: h }
  }
  // la tarjeta del partido dentro de la página: así también puede aparecer en Google Imágenes
  const cardImg = r => { const c = cardOf(r); return c.og ? `<img class="mcard" src="${esc(c.og)}" alt="${esc(`${tn(r.home)} ${r.gh == null ? 'vs' : r.gh + ' - ' + r.ga} ${tn(r.away)} · ${lgName(r)} · ${longDay(r.day)}`)}" width="1200" height="630" loading="lazy">` : '' }
  // línea de tiempo del partido: goles y tarjetas sobre una barra de 90 minutos (local arriba, visitante abajo)
  const tbar = (ev, r) => {
    const es = (ev || []).filter(e => e.type === 'Goal' || e.type === 'Card'); if (!es.length) return ''
    const mx = Math.max(90, ...es.map(e => (e.t || 0) + (e.x || 0))), pos = m => Math.min(98, Math.max(2, m * 100 / mx)).toFixed(1)
    const dot = e => {
      const red = /red/i.test(e.d), cls = e.type === 'Goal' ? 'g' : red ? 'r' : 'y', home = e.team === r.home
      const what = e.type === 'Goal' ? (e.d === 'Penalty' ? 'Gol de penal' : e.d === 'Own Goal' ? 'Autogol' : 'Gol') : red ? 'Tarjeta roja' : 'Tarjeta amarilla'
      return `<i class="tbm ${cls} ${home ? 'h' : 'a'}" style="left:${pos((e.t || 0) + (e.x || 0))}%" title="${esc(`${e.t}${e.x ? '+' + e.x : ''}' ${what} · ${e.p || tn(e.team)}`)}" tabindex="0"></i>`
    }
    return `<div class="tbar" role="img" aria-label="Línea de tiempo del partido"><span class="tl0">${esc(tn(r.home))}</span><div class="tbl"><b class="ht" style="left:${pos(45)}%"></b>${es.map(dot).join('')}</div><span class="tl1">${esc(tn(r.away))}</span></div><div class="tbs"><span></span><div><span>0'</span><span>45'</span><span>${mx}'</span></div><span></span></div>`
  }
  const logoOf = (u, name) => img(u) ? `<img src="${esc(img(u))}" alt="" loading="lazy" width="16" height="16" data-n="${esc(name || '')}">` : crest(name)
  const nm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''), sameT = (a, b) => { const x = nm(a), y = nm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }
  // goles, penales, autogoles, amarillas y rojas de un equipo, con minuto (se usa en la lista, en las tarjetas en vivo y en el encabezado)
  const evChips = (evs, tm, short) => {
    const g = new Map(), o = []
    for (const e of evs) {
      if (!sameT(e.team, tm)) continue
      const mk = `${e.t}${e.x ? '+' + e.x : ''}'`
      if (e.type === 'Goal' && e.d !== 'Missed Penalty') { const k = (e.p || '—') + (e.d === 'Own Goal' ? '#' : ''); if (!g.has(k)) { g.set(k, { ico: '⚽', p: e.p || '—', note: e.d === 'Own Goal' ? ' (autogol)' : '', m: [] }); o.push(g.get(k)) } g.get(k).m.push(mk + (e.d === 'Penalty' ? '(p)' : '')) }
      else if (e.type === 'Goal') o.push({ ico: '✖', p: e.p || '—', note: ' penal fallado', m: [mk] })
      else if (e.type === 'Card') o.push({ ico: /red/i.test(e.d) ? '🟥' : '🟨', p: e.p || '—', note: '', m: [mk] })
    }
    return o.map(x => `<span>${x.ico} ${esc(short ? String(x.p).trim().split(/\s+/).slice(-1)[0] : x.p)}${short ? '' : esc(x.note)} ${esc(x.m.join(' '))}</span>`).join('')
  }
  const evSum = (evs, tm) => {
    const g = [], y = [], rd = []
    for (const e of evs) {
      if (!sameT(e.team, tm)) continue
      const mk = `${e.t}${e.x ? '+' + e.x : ''}'`
      if (e.type === 'Goal' && e.d !== 'Missed Penalty') g.push(mk + (e.d === 'Penalty' ? '(p)' : e.d === 'Own Goal' ? '(ag)' : ''))
      else if (e.type === 'Card') (/red/i.test(e.d) ? rd : y).push(mk)
    }
    const one = (ico, a) => a.length ? `<span>${ico} <b>${a.length}</b> <i>${esc(a.join(' '))}</i></span>` : ''
    return one('⚽', g) + one('🟨', y) + one('🟥', rd)
  }
  function matchRow(r, mixed = false) {
    r = withVenue(r)
    const evs = evOf(r), eh = evs.length ? evSum(evs, r.home) : '', ea = evs.length ? evSum(evs, r.away) : ''
    const cls = isLive(r) ? 'lv' : isDone(r) ? 'fn' : 'nx', hw = isDone(r) && r.gh > r.ga, aw = isDone(r) && r.ga > r.gh
    const isSp = r.sport && r.sport !== 'futbol', url = matchUrl(r), sc = r.gh == null ? '–' : r.gh + '-' + r.ga
    const canPred = r.kickoff > now() && !isLive(r) && !isDone(r) && !['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(r.status) && PRED.on()
    const names = evs.length ? `<div class="xl"><div>${evChips(evs, r.home)}</div><div>${evChips(evs, r.away)}</div></div>` : ''
    const info = [r.venue ? esc(r.venue) + (r.city ? ', ' + esc(r.city) : '') + (r.vh ? ' (sede habitual)' : '') : '', isSp && r.info ? esc(r.info) : ''].filter(Boolean).join(' · ')
    return `<details class="mx ${cls}${isSp ? ' sp' : ''}" data-id="${r.id}" data-sp="${esc(r.sport || 'futbol')}" data-hn="${esc(r.home)}" data-an="${esc(r.away)}"><summary class="rw${mixed ? ' hubr' : ''}">${mixed ? `<span class="tl2"><span class="t">${isLive(r) ? '<i></i>' : ''}${esc(stLabel(r))}</span><span class="lgc"><span class="tg" style="--c:${(SPN[r.sport || 'futbol'] || SPN.futbol)[1]}">${esc((SPN[r.sport || 'futbol'] || SPN.futbol)[0])}</span><em>${esc(lgName(r))}</em></span></span>` : `<span class="t">${isLive(r) ? '<i></i>' : ''}${esc(stLabel(r))}</span>`}<span class="ev e1">${eh}</span><span class="tm h${hw ? ' w2' : isDone(r) && aw ? ' lo2' : ''}"><span>${esc(tn(r.home))}</span>${logoOf(r.hl, r.home)}</span><span class="sc">${sc}</span><span class="tm a${aw ? ' w2' : isDone(r) && hw ? ' lo2' : ''}">${logoOf(r.al, r.away)}<span>${esc(tn(r.away))}</span></span><span class="ev e2">${ea}</span><i class="chev"></i>${canPred ? `<span class="qp" data-qp="${r.id}" title="Pronostica gratis y gana puntos"><em>Juega</em><button type="button" data-v="H" aria-label="Gana ${esc(tn(r.home))}">Gana</button>${isSp ? '' : '<button type="button" data-v="D" aria-label="Empate">Empate</button>'}<button type="button" data-v="A" aria-label="Gana ${esc(tn(r.away))}">Gana</button></span>` : ''}</summary><div class="xp">${canPred ? `<div class="box pred" data-mid="${r.id}" data-h="${esc(tn(r.home))}" data-a="${esc(tn(r.away))}" hidden></div>` : ''}${names}${info ? `<div class="xi">${info}</div>` : ''}<div class="xa"><a class="pb p" href="${esc(url)}">Ver partido completo ›</a><button type="button" class="pb fw" data-follow="${esc(r.home)}" data-l="${esc(tn(r.home))}">☆ Seguir ${esc(tn(r.home))}</button><button type="button" class="pb fw" data-follow="${esc(r.away)}" data-l="${esc(tn(r.away))}">☆ Seguir ${esc(tn(r.away))}</button><button type="button" class="pb" data-copy="__ORIGIN__${esc(url)}">Copiar enlace</button><div class="rs" data-rs='${esc(JSON.stringify({ id: r.id < 0 ? 'e' + -r.id : 's' + r.id, u: url, t: `${tn(r.home)} ${r.gh ?? ''}${r.gh == null ? 'vs' : '-' + r.ga} ${tn(r.away)} · ${lgName(r)}` }))}'></div></div></div></details>`
  }
  const TOPORDER = Object.keys(LG)
  function groups(rows) {
    const g = new Map()
    for (const r of rows) { const k = r.slug || ('x|' + (r.league || '')); if (!g.has(k)) g.set(k, { slug: r.slug, league: lgName(r), country: r.country, rows: [] }); g.get(k).rows.push(r) }
    const rank = x => { const i = TOPORDER.indexOf(x.slug); return i < 0 ? 999 : i }
    return [...g.values()].sort((a, b) => (b.rows.some(isLive) - a.rows.some(isLive)) || rank(a) - rank(b) || b.rows.length - a.rows.length || a.league.localeCompare(b.league))
  }
  const gk = g => g.slug || 'x:' + slugify(g.league)
  const leagueBlock = (g, open, plain, tag) => `<details class="lg"${open ? ' open' : ''}${plain ? ' data-o="1"' : ''} data-k="${esc(gk(g))}"><summary>${tag ? `<span class="tg" style="--c:${(SPN[g.rows[0].sport || 'futbol'] || SPN.futbol)[1]}">${esc((SPN[g.rows[0].sport || 'futbol'] || SPN.futbol)[0])}</span>` : ''}${badge(g.slug, g.league)}<span class="ln">${esc(g.league)}</span>${g.slug && !plain ? `<small>${esc(lgRegion(g.slug))}</small>` : ''}${g.rows.some(isLive) ? `<small class="lvc">● ${g.rows.filter(isLive).length} en vivo</small>` : ''}<span class="sp1"></span>${g.slug && !plain ? `<a class="mu" href="/liga/${esc(g.slug)}" style="font-size:11.5px;font-weight:600">Tabla</a>` : ''}<button type="button" class="fav" data-fav="${esc(gk(g))}" aria-label="Seguir esta liga">☆</button><small class="cnt">${g.rows.length}</small></summary><div class="gr">${g.rows.map(r => matchRow(r)).join('')}</div></details>`
  const chipsBar = gs => `<div class="chips" data-chips><button type="button" class="chip on" data-lg="all">Todas</button><button type="button" class="chip" data-lg="fav">★ Mis ligas</button>${gs.map(g => `<button type="button" class="chip" data-lg="${esc(gk(g))}">${esc(g.league)}${g.rows.some(isLive) ? ` <b>●${g.rows.filter(isLive).length}</b>` : ''}</button>`).join('')}</div>`
  // fechas: una sola fila corta (se desliza en el celular)
  const dayNav = (cur, base = '/partidos', today = base) => {
    const out = [], t0 = now(), shift = (d, n) => dayOf(Date.parse(d + 'T12:00:00Z') + n * 864e5), lab = n => n === 0 ? 'Hoy' : n === -1 ? 'Ayer' : n === 1 ? 'Mañana' : ''
    const a = `<a class="ar" href="${base}/${shift(cur, -1)}" aria-label="Día anterior">‹</a>`, b = `<a class="ar" href="${base}/${shift(cur, 1)}" aria-label="Día siguiente">›</a>`
    for (let i = -3; i <= 6; i++) { const d = dayOf(t0 + i * 864e5), dt = new Date(d + 'T12:00:00Z'); out.push(`<a href="${i === 0 ? today : base + '/' + d}" class="${d === cur ? 'on' : ''}">${lab(i) || esc(dt.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).replace('.', ''))}</a>`) }
    return `<span class="grp">${a}${out.join('')}${b}</span><span class="grp"><input class="dp" type="date" data-date data-base="${base}" value="${esc(cur)}" aria-label="Elegir fecha"></span>`
  }

  // tarjeta del partido (como la del mapa): escudos grandes, marcador grande, estado y estadio; sin listas de minutos
  const lpXI = (det, k) => { const d = det?.lineups?.[k], st = (d?.players || []).filter(p => p.st).sort((a, b) => (a.fp || 99) - (b.fp || 99)).slice(0, 11)
    const fm = String(d?.formation || '').split('-').map(Number).filter(n => n > 0)
    const sb = (d?.players || []).filter(p => !p.st).slice(0, 9).map(p => [String(p.n ?? ''), String(p.name || '').trim().slice(0, 22)])
    return st.length === 11 ? { p: st.map(p => [String(p.n ?? ''), String(p.name || '').trim().split(/\s+/).slice(-1)[0].slice(0, 12), String(p.name || '').trim().slice(0, 22)]), f: fm.reduce((a, b) => a + b, 0) === 10 ? fm.join('-') : '', s: sb } : { p: [], f: '', s: sb } }
  const lpHolder = (r, det) => { const h = lpXI(det, 'home'), a = lpXI(det, 'away')
    const ev = evOf(r).filter(e => (e.type === 'Goal' && e.d !== 'Missed Penalty') || e.type === 'Card').slice(0, 30).map(e => [e.type === 'Goal' ? (e.d === 'Own Goal' ? 'og' : 'g') : /red/i.test(e.d) ? 'r' : 'y', +e.t || 0, sameT(e.team, r.home) ? 0 : 1, String(e.p || '').slice(0, 22)])
    const cty = /^(world|europe|international|n\/c america|south america|asia|africa)$/i.test(String(r.country || '')) ? '' : String(r.country || '')
    return `<div id="lp" hidden data-id="${r.id}" data-h="${esc(r.home)}" data-a="${esc(r.away)}" data-hn="${esc(tn(r.home))}" data-an="${esc(tn(r.away))}" data-hl="${esc(img(r.hl))}" data-al="${esc(img(r.al))}" data-st="${esc(r.status)}" data-el="${+r.el || 0}" data-gh="${+r.gh || 0}" data-ga="${+r.ga || 0}" data-ko="${esc(hhmm(r.kickoff))}" data-lg="${esc(lgName(r))}" data-hf="${esc(h.f)}" data-af="${esc(a.f)}" data-hp="${esc(JSON.stringify(h.p))}" data-ap="${esc(JSON.stringify(a.p))}" data-hs="${esc(JSON.stringify(h.s))}" data-as="${esc(JSON.stringify(a.s))}" data-ev="${esc(JSON.stringify(ev))}" data-cty="${esc(cty)}" data-url="${esc(matchUrl(r))}"></div>` }
  const betSlot = (r, cls = 'betb') => !isDone(r) && !['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(r.status) ? `<span class="${cls}" data-bet="${r.id}"></span>` : ''
  const STADIUM_BG = 'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=75&auto=format&fit=crop'   // la misma foto de la tarjeta del mapa
  // tarjeta del partido como la del mapa: foto de estadio, escudos grandes, marcador, estado, goles con minuto y tarjetas por equipo
  const bigCard = (r, big) => {
    r = withVenue(r)
    const lv = isLive(r), dn = isDone(r), sp = SPN[r.sport || 'futbol'] || SPN.futbol, hw = dn && r.gh > r.ga, aw = dn && r.ga > r.gh, evs = evOf(r)
    const evLine = tm => { const mine = evs.filter(e => sameT(e.team, tm)), g = mine.filter(e => e.type === 'Goal' && e.d !== 'Missed Penalty').map(e => (e.t || '') + "'" + (e.d === 'Penalty' ? '(p)' : e.d === 'Own Goal' ? '(ag)' : ''))
      const y = mine.filter(e => e.type === 'Card' && !/red/i.test(e.d)).length, rd = mine.filter(e => e.type === 'Card' && /red/i.test(e.d)).length
      const gs = g.length ? '⚽ ' + g.slice(0, 3).join(' ') + (g.length > 3 ? ' +' + (g.length - 3) : '') : ''
      return gs || y || rd ? `<span class="mev" title="${esc(g.join(' '))}">${esc(gs)}${y ? ` 🟨${y}` : ''}${rd ? ` 🟥${rd}` : ''}</span>` : '<span class="mev"> </span>' }
    const st = lv ? `<b class="mst lv"><i></i>EN VIVO · ${esc(stLabel(r))}</b>` : dn ? '<b class="mst">FINAL</b>' : `<b class="mst nx">${esc(stLabel(r))}</b>`
    const mid = (lv || dn) && r.gh != null ? `<span class="msc">${r.gh} - ${r.ga}</span>` : '<span class="mvs">VS</span>'
    return `<a class="lc mcard${big ? ' big' : ''} ${lv ? 'lv' : dn ? 'fin fn' : 'nx'}" href="${esc(matchUrl(r))}" style="background-image:linear-gradient(180deg,#05080dcc,#05080d99 40%,#05080de6),url('${STADIUM_BG}')"><span class="mml"><span class="tg" style="--c:${sp[1]}">${esc(sp[0])}</span><em>${esc(lgName(r))}</em></span><span class="mrow"><span class="mtm${hw ? ' w' : ''}">${logoOf(r.hl, r.home)}<em>${esc(tn(r.home))}</em>${evLine(r.home)}</span><span class="mmid">${mid}${st}</span><span class="mtm${aw ? ' w' : ''}">${logoOf(r.al, r.away)}<em>${esc(tn(r.away))}</em>${evLine(r.away)}</span></span>${r.venue ? `<span class="mvn">${esc(r.venue)}</span>` : ''}${betSlot(r)}</a>`
  }
  const liveCard = r => bigCard(r)
  // columna izquierda: competiciones (principales y por región)
  function competitions(active) {
    const rows = db.prepare("SELECT slug, MAX(league) league, COUNT(*) n FROM match_archive WHERE slug != '' AND sport = 'futbol' AND day >= ? GROUP BY slug").all(dayOf(now() - 7 * 864e5)).map(r => ({ ...r, name: lgName(r) }))
    const top = rows.filter(r => LG[r.slug]).sort((a, b) => TOPORDER.indexOf(a.slug) - TOPORDER.indexOf(b.slug)).slice(0, 14), byReg = new Map()
    for (const r of rows) { if (top.includes(r)) continue; const g = lgRegion(r.slug); if (!byReg.has(g)) byReg.set(g, []); byReg.get(g).push(r) }
    const a = r => `<a href="/liga/${esc(r.slug)}" ${r.slug === active ? 'style="font-weight:700"' : ''}>${badge(r.slug, r.name)}<span>${esc(r.name)}</span><small>${r.n}</small></a>`
    return `<div class="box"><h4>Competiciones</h4>${top.map(a).join('')}${[...byReg.entries()].map(([g, ls]) => `<details><summary>${esc(g)} <small class="mu" style="margin-left:auto">${ls.length}</small></summary>${ls.sort((x, y) => x.name.localeCompare(y.name)).map(r => `<a href="/liga/${esc(r.slug)}"><span>${esc(r.name)}</span><small>${r.n}</small></a>`).join('')}</details>`).join('')}<a href="/ligas">Ver todas las ligas <small>›</small></a></div>`
  }

  // ---- tabla de posiciones (ESPN, se pide cuando alguien abre la liga y se guarda 6 horas) ----
  const stCache = new Map()
  const stFly = new Map()   // si varias personas piden la misma tabla a la vez, ESPN recibe una sola pregunta
  function standings(slug, ms = 8000) { const c = stCache.get(slug); if (c && now() - c.t < 6 * 3600e3) return Promise.resolve(c.v); if (stFly.has(slug)) return stFly.get(slug); const p = standingsGo(slug, ms).finally(() => stFly.delete(slug)); stFly.set(slug, p); return p }
  async function standingsGo(slug, ms) {
    const c = stCache.get(slug); if (c && now() - c.t < 6 * 3600e3) return c.v
    if (!visitCall()) return c ? c.v : null
    let v = null
    try {
      const r = await espnFetch(`https://site.api.espn.com/apis/v2/sports/soccer/${encodeURIComponent(slug)}/standings`, { headers: { 'User-Agent': 'Mozilla/5.0 (tabla de posiciones)' }, signal: AbortSignal.timeout(ms) })
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
    const rs = db.prepare(`SELECT home, gh, ga FROM match_archive WHERE sport = 'futbol' AND ${slug ? 'slug = ? AND ' : ''}status IN (${DONE.map(() => '?').join(',')}) AND (home = ? OR away = ?) AND gh IS NOT NULL AND id != ? ORDER BY kickoff DESC LIMIT 5`).all(...(slug ? [slug] : []), ...DONE, team, team, notId || 0)
    return rs.reverse().map(r => { const mine = r.home === team ? r.gh : r.ga, other = r.home === team ? r.ga : r.gh; return mine > other ? 'g' : mine === other ? 'e' : 'p' })
  }
  const fmHtml = f => f.length ? `<span class="fm">${f.map(k => `<i class="${k}">${k === 'g' ? 'G' : k === 'e' ? 'E' : 'P'}</i>`).join('')}</span>` : ''
  // tabla de posiciones: la de ESPN; si no hay, la calculada con los partidos guardados (se avisa)
  const stTable = (slug, g, { mini = false, hl = [] } = {}) => `<div class="lg lgx">${g.name && !mini ? `<h3>${esc(g.name)}</h3>` : ''}<table class="tb"><thead><tr><th>#</th><th class="tn">Equipo</th><th>PJ</th>${mini ? '' : '<th class="hid">G</th><th class="hid">E</th><th class="hid">P</th><th class="hid">GF</th><th class="hid">GC</th>'}<th>DG</th><th>PTS</th>${mini ? '' : '<th>Últimas</th>'}</tr></thead><tbody>${((rs) => mini ? rs.slice(0, 8) : rs)([...g.rows].sort((x, y) => (+x.rank || 99) - (+y.rank || 99) || (+y.pts || 0) - (+x.pts || 0))).map((x, i) => { const is = hl.some(h => h && x.team && (x.team === h || x.team.includes(h) || h.includes(x.team))); return `<tr class="${is ? 'hl' : ''}"><td class="rk" style="${x.color ? 'border-left-color:' + x.color : ''}">${esc(x.rank ?? i + 1)}</td><td class="tn">${img(x.logo) ? `<img src="${esc(img(x.logo))}" alt="" loading="lazy">` : ''}${esc(tn(x.team))}${!mini && x.note ? `<span class="nt">${esc(x.note)}</span>` : ''}</td><td>${num(x.pj)}</td>${mini ? '' : `<td class="hid">${num(x.g)}</td><td class="hid">${num(x.e)}</td><td class="hid">${num(x.p)}</td><td class="hid">${num(x.gf)}</td><td class="hid">${num(x.gc)}</td>`}<td>${sgn(x.dg)}</td><td class="p">${num(x.pts)}</td>${mini ? '' : `<td>${fmHtml(form(x.team, slug))}</td>`}</tr>` }).join('')}</tbody></table></div>`
  // partidos de una liga para sus cálculos (tabla, goleadores): solo los de los últimos 200 días y sin el detalle (antes se leía todo el historial de la liga en cada página)
  const leagueRows = slug => db.prepare(`SELECT ${COLS} FROM match_archive WHERE slug = ? AND kickoff > ? ORDER BY kickoff DESC LIMIT 1500`).all(slug, now() - 200 * 864e5)
  async function tablaDe(slug, rows, ms) {
    const t = await standings(slug, ms); if (t && t.length) return { groups: t, calc: false }
    const a = teamAgg(rows); return a.length ? { groups: [{ name: '', rows: a.map((x, i) => ({ team: x.team, pj: x.pj, g: x.g, e: x.e, p: x.p, gf: x.gf, gc: x.gc, dg: x.gf - x.gc, pts: x.pts, rank: i + 1 })) }], calc: true } : null
  }
  const scorersBox = (list, n = 8) => list.length ? `<table class="tb"><thead><tr><th>#</th><th class="tn">Jugador</th><th>Equipo</th><th>PJ</th><th>Goles</th></tr></thead><tbody>${list.slice(0, n).map((x, i) => `<tr><td class="rk">${i + 1}</td><td class="tn">${esc(x.p)}</td><td>${esc(tn(x.team))}</td><td>${x.pj}</td><td class="p">${x.g}${x.pen ? ` <span class="mu" style="font-weight:500">(${x.pen}p)</span>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Todavía no hay goleadores registrados en el archivo.</div>'

  async function dayPage(day, isToday, hub = false) {
    warmLogos().catch(() => {})
    let rows = db.prepare('SELECT * FROM match_archive WHERE day = ? AND sport = \'futbol\' ORDER BY kickoff, id').all(day)
    const need = isToday ? rows.filter(r => isLive(r) && r.eid && (r.gh || r.ga) && evOf(r).length < (r.gh || 0) + (r.ga || 0)).slice(0, 12) : []
    if (need.length) { await Promise.race([Promise.all(need.map(r => detail(r).catch(() => null))), new Promise(ok => setTimeout(ok, 4000))]); rows = db.prepare('SELECT * FROM match_archive WHERE day = ? AND sport = \'futbol\' ORDER BY kickoff, id').all(day) }
    // la página principal junta todos los deportes: en vivo, últimos resultados y lo de cada deporte
    const otherRows = hub ? db.prepare("SELECT " + COLS + " FROM match_archive WHERE sport != 'futbol' AND day = ? ORDER BY kickoff, id").all(day) : []
    const allRows = [...rows, ...otherRows]
    const nextDays = hub ? [1, 2].map(i => { const d = dayOf(now() + i * 864e5); return { d, rows: db.prepare(`SELECT ${COLS} FROM match_archive WHERE day = ? AND status NOT IN ('FT','AET','PEN','PST','CANC','ABD','AWD','WO') ORDER BY (CASE WHEN sport = 'futbol' AND slug IN (${ESPN.TOP.map(() => '?').join(',')}) THEN 0 ELSE 1 END), kickoff LIMIT 40`).all(d, ...ESPN.TOP) } }) : []
    const recent = hub ? db.prepare(`SELECT ${COLS} FROM match_archive WHERE status IN (${DONE.map(() => '?').join(',')}) AND kickoff > ? ORDER BY kickoff DESC LIMIT 24`).all(...DONE, now() - 24 * 3600e3) : []
    const nLive = allRows.filter(isLive).length, nFin = allRows.filter(isDone).length, nNx = allRows.length - nLive - nFin
    const gs = groups(rows), live = allRows.filter(isLive), st = S()
    // lado derecho: clasificación y goleadores de la liga más importante del día
    let feat = null; const fl = gs.find(g => LG[g.slug]); if (fl) { const all = leagueRows(fl.slug); const t = await tablaDe(fl.slug, all, 2500); if (t) feat = { slug: fl.slug, name: fl.league, t: t.groups[0], sc: scorers(all) } }
    const upc = rows.filter(r => !isLive(r) && !isDone(r)).slice(0, 10)
    const others = gs.filter(g => g.slug && LG[g.slug] && g.slug !== feat?.slug).slice(0, 2)
    const extra = (await Promise.all(others.map(async g => { const all = leagueRows(g.slug); const t = await tablaDe(g.slug, all, 2500); return t ? { slug: g.slug, name: g.league, t: t.groups[0], calc: t.calc } : null }))).filter(Boolean)
    const allEv = rows.flatMap(evOf), withScore = rows.filter(r => r.gh != null && r.ga != null), goalsDay = withScore.reduce((a, r) => a + r.gh + r.ga, 0)
    const yel = allEv.filter(e => e.type === 'Card' && !/red/i.test(e.d)).length, red = allEv.filter(e => e.type === 'Card' && /red/i.test(e.d)).length, scDay = scorers(rows)
    const bucket = (id, title, list, newest) => list.length ? `<section class="bk" data-b="${id}"><h2 class="sph" style="--c:${id === 'live' ? '#ff4d6a' : id === 'fin' ? '#8e949c' : '#2fb59a'}">${title} · ${list.length}</h2><div class="lg flat"><div class="gr">${[...list].sort((x, y) => newest ? y.kickoff - x.kickoff : x.kickoff - y.kickoff).map(r => matchRow(r, true)).join('')}</div></div></section>` : ''
    const spKeys = Object.keys(SPN).filter(k => allRows.some(r => (r.sport || 'futbol') === k))
    const spChips = `<div class="chips" data-spchips><button type="button" class="chip on" data-sp="all">Todos los deportes <b class="n">${allRows.length}</b></button>${spKeys.map(k => `<button type="button" class="chip" data-sp="${k}" style="--c:${SPN[k][1]}">${esc(SPN[k][0])} <b class="n">${allRows.filter(r => (r.sport || 'futbol') === k).length}</b></button>`).join('')}</div>`
    const featured = (() => { const top = r => !!LG[r.slug], order = [...allRows.filter(isLive), ...allRows.filter(isDone).sort((x, y) => y.kickoff - x.kickoff), ...allRows.filter(r => !isLive(r) && !isDone(r))]
      const f = order.filter(top); return (f.length >= 4 ? f : [...f, ...order.filter(r => !top(r))]).slice(0, 12) })()
    const featBox = featured.length ? `<section class="livebox mbig"><h2>Destacados del día</h2><div class="lw"><button class="sl l" type="button" data-slide="-1" aria-label="Anteriores">‹</button><div class="lcs">${featured.map(r => bigCard(r, true)).join('')}</div><button class="sl r" type="button" data-slide="1" aria-label="Siguientes">›</button></div></section>` : ''
    // partido principal de la portada (con su cancha): primero los equipos grandes del panel, luego las ligas principales
    const bigT = new Set((S().sportsTeams || []).map(x => String(x).toLowerCase())), big = r => bigT.has(String(r.home).toLowerCase()) || bigT.has(String(r.away).toLowerCase())
    const soon = r => !isLive(r) && !isDone(r) && !['PST', 'CANC', 'ABD'].includes(r.status) && (r.sport || 'futbol') === 'futbol'
    const fut = allRows.filter(r => (r.sport || 'futbol') === 'futbol'), byKo = (a, b) => a.kickoff - b.kickoff
    const mainM = fut.filter(r => isLive(r) && big(r))[0] || fut.filter(r => isLive(r) && LG[r.slug])[0] || fut.filter(r => soon(r) && big(r)).sort(byKo)[0] || fut.filter(r => soon(r) && LG[r.slug]).sort(byKo)[0] || fut.filter(isLive)[0] || fut.filter(soon).sort(byKo)[0] || null
    const mainDet = mainM ? await Promise.race([detail(mainM).catch(() => null), new Promise(ok => setTimeout(() => ok(null), 1500))]) : null
    const lpHub = mainM ? lpHolder(withVenue(mainM), mainDet) : ''
    // «Partido del día»: el más importante (en vivo con más goles; si no, el último terminado o el próximo de una liga principal)
    const motd = (() => { const rest = allRows.filter(r => r !== mainM), top = rest.filter(r => LG[r.slug]), pool = top.length ? top : rest, g = r => (r.gh || 0) + (r.ga || 0)
      return pool.filter(isLive).sort((a, b) => g(b) - g(a))[0] || pool.filter(isDone).sort((a, b) => b.kickoff - a.kickoff)[0] || pool.filter(r => !isLive(r) && !isDone(r)).sort((a, b) => a.kickoff - b.kickoff)[0] || null })()
    const motdBox = motd ? (() => { const r = withVenue(motd), evs = evOf(r), lv = isLive(r), dn = isDone(r)
      const sc = tm => evs.filter(e => sameT(e.team, tm) && e.type === 'Goal' && e.d !== 'Missed Penalty').slice(0, 6).map(e => `<li>⚽ ${esc(e.p || 'Gol')} <b>${esc(String(e.t || ''))}'${e.d === 'Penalty' ? ' (p)' : e.d === 'Own Goal' ? ' (ag)' : ''}</b></li>`).join('')
      return `<section class="motd" style="background-image:linear-gradient(90deg,#05080df0,#05080d99 50%,#05080df0),url('${STADIUM_BG.replace('w=800', 'w=1400')}')"><div class="mo-h">Partido del día · ${esc(lgName(r))}</div><a class="mo-r" href="${esc(matchUrl(r))}"><span class="mo-t">${logoOf(r.hl, r.home)}<b>${esc(tn(r.home))}</b><ul>${sc(r.home)}</ul></span><span class="mo-m">${(lv || dn) && r.gh != null ? `<span class="mo-s">${r.gh} - ${r.ga}</span>` : '<span class="mo-s vs">VS</span>'}<span class="mo-st${lv ? ' lv' : ''}">${lv ? '● EN VIVO · ' + esc(stLabel(r)) : dn ? 'FINAL' : esc(stLabel(r))}</span>${r.venue ? `<small>${esc(r.venue)}</small>` : ''}<span class="mo-go">Ver el partido ›</span>${betSlot(r)}</span><span class="mo-t">${logoOf(r.al, r.away)}<b>${esc(tn(r.away))}</b><ul>${sc(r.away)}</ul></span></a></section>` })() : ''
    // «Ligas de hoy»: casillas grandes por liga (partidos y en vivo), enlazan a su página
    const lgTiles = (() => { const gs2 = groups(allRows).slice(0, 8); if (gs2.length < 2) return ''
      const tile = g => { const sp = g.rows[0].sport || 'futbol', c = (SPN[sp] || SPN.futbol)[1], lv = g.rows.filter(isLive).length, logo = g.slug && LOGOS.get(g.slug) && img(LOGOS.get(g.slug))
        const bg = sp === 'futbol' ? `linear-gradient(180deg,#05080dd9,#05080da6 45%,#05080df0),url('${STADIUM_BG}')` : `linear-gradient(180deg,#0b0f15e6,#0b0f15f5),radial-gradient(circle at 50% 0,${c},transparent 75%)`
        return `<a href="${g.slug ? '/liga/' + esc(g.slug) : '#lista'}" class="lgt-i" style="background-image:${bg}"><span class="lgt-lo">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : `<b>${esc(String(g.league).slice(0, 2).toUpperCase())}</b>`}</span><b class="lgt-n">${esc(g.league)}</b><small>${g.rows.length} partido${g.rows.length === 1 ? '' : 's'}${lv ? ` · <em>● ${lv} en vivo</em>` : ''}</small></a>` }
      return `<section class="lgt"><h2>Ligas de hoy</h2><div class="lgt-g">${gs2.map(tile).join('')}</div></section>` })()
    const hubMain = allRows.length ? spChips + bucket('live', 'En juego ahora', allRows.filter(isLive)) + featBox + bucket('fin', 'Terminados hoy', allRows.filter(isDone), true) + motdBox + bucket('nx', 'Por jugar hoy', allRows.filter(r => !isLive(r) && !isDone(r))) + lgTiles + nextDays.map((x, i) => x.rows.length ? bucket('nx', i ? 'Pasado mañana · ' + longDay(x.d) : 'Mañana · ' + longDay(x.d), x.rows) + `<a class="more2" href="/partidos/${x.d}">Ver todos los partidos de ${i ? 'pasado mañana' : 'mañana'} ›</a>` : '').join('') : '<div class="lg"><div class="empty">Todavía no hay partidos guardados para este día.</div></div>'
    const body = `<div class="hrow"><h1>${hub ? 'Resultados deportivos de hoy' : isToday ? 'Resultados de fútbol de hoy' : 'Resultados del ' + esc(longDay(day))}</h1><span class="sub">${esc(longDay(day))} · ${allRows.length} partido${allRows.length === 1 ? '' : 's'}</span></div>
${hub ? lpHub : ''}<div id="live-wrap">${live.length ? `<section class="livebox"><h2><i></i>En vivo ahora · ${live.length}<a class="more" href="#lista">Ver todos ↓</a></h2><div class="lw"><button class="sl l" type="button" data-slide="-1" aria-label="Anteriores">‹</button><div class="lcs">${live.slice(0, 30).map(r => liveCard(r)).join('')}</div><button class="sl r" type="button" data-slide="1" aria-label="Siguientes">›</button></div></section>` : ''}
${hub && recent.length ? `<section class="livebox res"><h2>Últimos resultados · ${recent.length}<a class="more" href="#lista">Ver todos ↓</a></h2><div class="lw"><button class="sl l" type="button" data-slide="-1" aria-label="Anteriores">‹</button><div class="lcs">${recent.map(r => liveCard(r, true)).join('')}</div><button class="sl r" type="button" data-slide="1" aria-label="Siguientes">›</button></div></section>` : ''}
</div>
<input class="f" type="radio" name="f" id="f-all" checked><input class="f" type="radio" name="f" id="f-live"><input class="f" type="radio" name="f" id="f-fin"><input class="f" type="radio" name="f" id="f-nxt">
<div class="bar2">${dayNav(day, '/partidos', hub ? '/partidos' : '/partidos/futbol')}<span class="grp"><label for="f-all">Todos ${allRows.length}</label><label class="lvl" for="f-live">En vivo <b>${nLive}</b></label><label for="f-fin">Finalizados ${nFin}</label><label for="f-nxt">Próximos ${nNx}</label></span>${hub ? '' : '<span class="rt grp"><button type="button" data-expand="all">Abrir todo</button><button type="button" data-expand="none">Cerrar todo</button></span>'}</div>
<input class="f" type="radio" name="rt" id="rt-t" checked><input class="f" type="radio" name="rt" id="rt-g"><input class="f" type="radio" name="rt" id="rt-p">
<div class="g2" id="lista"><main>${hub ? hubMain : (rows.length ? chipsBar(gs) : '') + (rows.length ? gs.map(g => leagueBlock(g, true)).join('') : '<div class="lg"><div class="empty">Todavía no hay partidos guardados para este día.</div></div>')}</main>
<aside class="side"><div class="box"><div class="tabs"><label for="rt-t">Clasificación</label><label for="rt-g">Goleadores</label><label for="rt-p">Próximos</label></div>
<div class="rp" id="rp-t">${feat ? `<div class="rh">${esc(feat.name)}</div>${stTable(feat.slug, feat.t, { mini: true }).replace(/^<div class="lg lgx">/, '<div class="lgx">')}<a href="/liga/${esc(feat.slug)}">Tabla completa ›</a>` : '<div class="empty">Sin tabla disponible hoy.</div>'}</div>
<div class="rp" id="rp-g">${feat ? `<div class="rh">${esc(feat.name)}</div>${scorersBox(feat.sc, 8)}<a href="/liga/${esc(feat.slug)}">Ver todos ›</a>` : '<div class="empty">Sin goleadores todavía.</div>'}</div>
<div class="rp" id="rp-p">${upc.length ? upc.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} – ${esc(tn(x.away))}</span><small>${esc(hhmm(x.kickoff))}</small></a>`).join('') : '<div class="empty">No hay más partidos por jugar hoy.</div>'}</div></div>
${rows.length ? `<div class="box"><h4>Resumen del día</h4><div class="kp2"><div><b>${rows.length}</b><span>Partidos</span></div><div><b>${goalsDay}</b><span>Goles</span></div><div><b>${withScore.length ? (goalsDay / withScore.length).toFixed(2) : '–'}</b><span>Goles por partido</span></div><div><b>${yel}</b><span>Amarillas</span></div><div><b>${red}</b><span>Rojas</span></div><div><b>${nLive}</b><span>En vivo</span></div></div></div>` : ''}
${scDay.length ? `<div class="box"><h4>Goleadores de hoy</h4>${scorersBox(scDay, 8)}</div>` : ''}
${extra.map(x => `<div class="box"><h4>Clasificación · ${esc(x.name)}</h4>${stTable(x.slug, x.t, { mini: true }).replace(/^<div class="lg lgx">/, '<div class="lgx">')}${x.calc ? '<div class="sub" style="padding:6px 12px">Calculada con los partidos guardados.</div>' : ''}<a href="/liga/${esc(x.slug)}">Tabla completa <small>›</small></a></div>`).join('')}
${gs.length > 1 ? `<div class="box"><h4>Ligas con partidos hoy</h4>${gs.slice(0, 14).map(g => `<a href="${g.slug ? '/liga/' + esc(g.slug) : '#'}"><span>${esc(g.league)}</span><small>${g.rows.length}</small></a>`).join('')}</div>` : ''}
<div class="box"><h4>Compartir página</h4><div style="padding:6px 10px">${shareBar(hub ? '/partidos' : isToday ? '/partidos/futbol' : '/partidos/' + day, hub ? 'Resultados deportivos de hoy' : isToday ? 'Resultados de fútbol de hoy' : 'Resultados del ' + longDay(day), null)}</div></div></aside></div>`
    const t = isToday && hub && st.partidosTitle ? String(st.partidosTitle) : hub ? 'Resultados deportivos en vivo: fútbol, baloncesto, tenis y más' : isToday ? 'Resultados de fútbol de hoy: marcadores en vivo' : `Resultados del ${longDay(day)}`
    const d = isToday && hub && st.partidosDesc ? String(st.partidosDesc) : hub ? 'Marcadores en vivo y últimos resultados de fútbol, baloncesto, béisbol, hockey, fútbol americano, tenis y MMA, con tablas, goleadores y tarjetas.' : `Resultados, marcadores en vivo, goles, tarjetas y tablas de posiciones de los partidos de fútbol del ${longDay(day)}.`
    return { status: 200, cache: isToday ? 30 : 600, html: shell({ title: t, desc: d, path: hub ? '/partidos' : isToday ? '/partidos/futbol' : '/partidos/' + day, body, nav: 'p', live: isToday, sp: hub ? 'inicio' : 'futbol', noindex: !allRows.length, kw: gs.slice(0, 8).map(g => g.league) }) }
  }
  const EVL = e => e.type === 'Goal' ? (e.d === 'Own Goal' ? 'Autogol' : e.d === 'Penalty' ? 'Gol de penal' : e.d === 'Missed Penalty' ? 'Penal fallado' : 'Gol') : e.type === 'Card' ? (/red/i.test(e.d) ? 'Tarjeta roja' : 'Tarjeta amarilla') : ''
  const sv = x => { const n = parseFloat(String(x).replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
  async function matchPage(r) {
    r = withVenue(r)
    if (r.sport && r.sport !== 'futbol') return sportMatchPage(r)
    let ev = evOf(r).filter(e => EVL(e))
    const [det, tabla] = await Promise.all([detail(r).catch(() => null), r.slug ? tablaDe(r.slug, leagueRows(r.slug), 3000) : null])
    const tline = [...ev.map(e => ({ ...e, t: e.t, o: e.t * 100 + (e.x || 0) })), ...((det?.subs || []).map(x => ({ sub: 1, t: x.t, o: x.t * 100, inn: x.inn, out: x.out, team: x.team })))].sort((a, b) => a.o - b.o)
    if (!ev.length && det?.evs?.length) ev = det.evs.map(e => ({ t: e.time.elapsed, x: e.time.extra, type: e.type, d: e.detail, team: e.team.name, p: e.player.name })).filter(e => EVL(e))
    const title = `${tn(r.home)} ${r.gh == null ? 'vs' : r.gh + ' - ' + r.ga} ${tn(r.away)}`, canonical = matchUrl(r)
    const ld = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${tn(r.home)} vs ${tn(r.away)}`, startDate: new Date(r.kickoff).toISOString(), sport: 'Fútbol',
      eventStatus: r.status === 'PST' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled', homeTeam: { '@type': 'SportsTeam', name: tn(r.home) }, awayTeam: { '@type': 'SportsTeam', name: tn(r.away) } }
    if (r.venue) ld.location = { '@type': 'Place', name: r.venue, address: r.city || r.country || r.venue }
    { const c0 = cardOf(r); if (c0.og) ld.image = c0.og.startsWith('/') ? '__ORIGIN__' + c0.og : c0.og }
    if (r.slug) ld.superEvent = { '@type': 'SportsEvent', name: lgName(r) }
    const same = r.slug ? db.prepare('SELECT ' + COLS + ' FROM match_archive WHERE slug = ? AND day = ? AND id != ? ORDER BY kickoff LIMIT 8').all(r.slug, r.day, r.id) : []
    const h2h = db.prepare(`SELECT ${COLS} FROM match_archive WHERE sport = 'futbol' AND id != ? AND ((home = ? AND away = ?) OR (home = ? AND away = ?)) ORDER BY kickoff DESC LIMIT 6`).all(r.id, r.home, r.away, r.away, r.home)
    const big = (u, n) => img(u) ? `<img src="${esc(img(u))}" alt="" width="48" height="48" data-n="${esc(n || '')}">` : crest(n)
    const stats = (det?.stats || []).map(x => ({ ...x, o: (STAT_ES[x.k] || [x.l, 99])[1], label: (STAT_ES[x.k] || [LABEL_ES[x.l] || x.l])[0] })).sort((a, b) => a.o - b.o).slice(0, 40)
    const show = (v, lab) => { const t = String(v).replace(/\.0+$/, '').replace(/%$/, ''); return /%/.test(lab) ? t + '%' : t }
    const bar = x => { const h = sv(x.h), a = sv(x.a), t = h + a, hp = t ? Math.round(h / t * 100) : 50; return `<div class="sb"><div class="r"><b>${esc(show(x.h, x.label))}</b><span>${esc(x.label.replace(' (%)', ''))}</span><b>${esc(show(x.a, x.label))}</b></div><div class="bar"><span class="bh"><i class="h" style="width:${hp}%"></i></span><span class="ba"><i class="a" style="width:${100 - hp}%"></i></span></div></div>` }
    // cancha: la formación (4-3-3) reparte a los titulares por líneas; si falta el dato se usa la lista
    const face = p => p.ph ? `<b class="fc"><img src="${esc(p.ph)}" alt="" loading="lazy" onerror="this.remove()"><i>${esc(p.n)}</i></b>` : `<b>${esc(p.n)}</b>`
    const pitch = (k, cls) => {
      const d = det?.lineups?.[k], st = (d?.players || []).filter(p => p.st).sort((a, b) => (a.fp || 99) - (b.fp || 99)), fm = String(d?.formation || '').split('-').map(Number).filter(n => n > 0)
      if (!d || st.length !== 11 || fm.reduce((a, b) => a + b, 0) !== 10) return ''
      const rows = [[st[0]]]; let at = 1; for (const n of fm) { rows.push(st.slice(at, at + n)); at += n }
      const top = [88, ...rows.slice(1).map((_, i) => 72 - i * (56 / Math.max(1, rows.length - 2)))]
      return `<div class="pitch">${rows.map((row, ri) => row.map((p, ci) => `<div class="pp ${cls}" style="left:${(ci + 1) / (row.length + 1) * 100}%;top:${top[ri]}%">${face(p)}<span>${esc(p.name.split(' ').slice(-1)[0])}</span>${p.to ? `<em>▼${esc(p.to)}'</em>` : ''}</div>`).join('')).join('')}</div>`
    }
    const subsOf = k => { const d = det?.lineups?.[k]; const sb = (d?.players || []).filter(p => !p.st); return sb.length ? `<div class="sbs"><small>Suplentes</small>${sb.map(p => `<div class="pl2"><b>${esc(p.n)}</b><span>${esc(p.name)} <small>${esc(p.pos)}</small>${p.ti ? ` <small class="in">▲ ${esc(p.ti)}'</small>` : ''}</span></div>`).join('')}</div>` : '' }
    const lu = k => { const d = det?.lineups?.[k]; if (!d || !d.players.length) return '<small>ESPN no publicó la alineación de este partido.</small>'; const st = d.players.filter(p => p.st); return `${d.formation ? `<small>Formación ${esc(d.formation)}</small>` : ''}${st.map(p => `<div class="pl2"><b>${esc(p.n)}</b><span>${esc(p.name)} <small>${esc(p.pos)}</small>${p.to ? ` <small class="out">▼ ${esc(p.to)}'</small>` : ''}</span></div>`).join('')}` }
    const pH = pitch('home', ''), pA = pitch('away', 'aw')
    const hasLu = !!(pH && pA) || !!(det?.lineups?.home?.players?.length || det?.lineups?.away?.players?.length), noData = !hasLu && !stats.length && !tline.length
    const gl = tm => evChips(ev, tm)
    // cancha animada (solo fútbol en vivo): datos para el navegador; la cancha se dibuja fuera de las partes que se renuevan
    const lpData = isLive(r) || r.status === 'HT' ? lpHolder(r, det) : ''
    const body = `${lpData}${betSlot(r, 'betbox')}<div class="mh"><div class="mtb"><h1 class="mt">${r.slug ? esc(lgName(r)) + ' · ' : ''}${esc(longDay(r.day))}${r.venue ? ' · ' + esc(r.venue) + (r.city ? ', ' + esc(r.city) : '') : ''}</h1>${shareBar(canonical, title, { h: tn(r.home), a: tn(r.away), hl: img(r.hl), al: img(r.al), gh: r.gh, ga: r.ga, st: r.status, el: r.el, ko: r.kickoff, league: lgName(r), venue: r.venue || '' }, r.city, true)}</div>
<div class="mr"><div class="tm2">${big(r.hl, r.home)}<div class="nm" style="text-align:right">${esc(tn(r.home))}${det?.rec?.home ? `<div class="rec">${esc(det.rec.home)}</div>` : ''}<div><button type="button" class="fw1" data-s="1" data-follow="${esc(r.home)}" data-l="${esc(tn(r.home))}" aria-label="Seguir a ${esc(tn(r.home))}">☆ Seguir</button></div></div></div>
<div>${r.gh == null ? '<div class="vs">vs</div>' : `<div class="sc2">${esc(r.gh)} <span>-</span> ${esc(r.ga)}</div>`}<div class="st${isLive(r) ? ' lv' : ''}">${esc(isLive(r) ? 'EN VIVO · ' + stLabel(r) : isDone(r) ? 'FINALIZADO' : hhmm(r.kickoff))}</div></div>
<div class="tm2"><div class="nm">${esc(tn(r.away))}${det?.rec?.away ? `<div class="rec">${esc(det.rec.away)}</div>` : ''}<div><button type="button" class="fw1" data-s="1" data-follow="${esc(r.away)}" data-l="${esc(tn(r.away))}" aria-label="Seguir a ${esc(tn(r.away))}">☆ Seguir</button></div></div>${big(r.al, r.away)}</div></div>
${ev.length ? `<div class="ms"><div>${gl(r.home)}</div><div>${gl(r.away)}</div></div>` : ''}</div>
${PRED.on() && r.sport === 'futbol' ? `<div class="box pred" id="pred" data-mid="${r.id}" data-h="${esc(tn(r.home))}" data-a="${esc(tn(r.away))}" hidden></div>` : ''}
<div class="g3 mp">${!hasLu ? `<aside class="lu"><div class="lg"><h3>Cancha</h3><div class="pt1"><div class="pitch"></div></div><div class="sub" style="padding:0 12px 10px">${isDone(r) ? 'ESPN no publicó la alineación de este partido.' : 'ESPN todavía no publicó la alineación. Se llena sola cuando la entregue.'}</div></div></aside>` : ''}${hasLu ? `<aside class="lu"><input class="f" type="radio" name="pt" id="pt-h" checked><input class="f" type="radio" name="pt" id="pt-a">
<div class="lg"><h3>Formaciones y alineaciones</h3>${pH && pA ? `<div class="tabs"><label for="pt-h">${esc(tn(r.home))} · ${esc(det.lineups.home.formation)}</label><label for="pt-a">${esc(tn(r.away))} · ${esc(det.lineups.away.formation)}</label></div><div class="ph"><div class="pt1">${pH}</div>${subsOf('home')}</div><div class="pa"><div class="pt1">${pA}</div>${subsOf('away')}</div>` : `<div class="ln2"><div><h5>${esc(tn(r.home))}</h5>${lu('home')}${subsOf('home')}</div><div><h5>${esc(tn(r.away))}</h5>${lu('away')}${subsOf('away')}</div></div>`}</div>
${(det?.subs || []).length ? `<div class="lg"><h3>Sustituciones</h3>${det.subs.map(x => `<div class="sbl"><b>${esc(x.t)}'</b><span><i class="in">▲ ${esc(x.inn)}</i><br><small>▼ ${esc(x.out)} · ${esc(tn(x.team))}</small></span></div>`).join('')}</div>` : ''}</aside>` : ''}
<main>
${tline.length ? `<div class="lg"><h3>Línea de tiempo</h3>${tbar(ev, r)}${tline.length ? `<ul class="tl">${tline.map(e => e.sub ? `<li><b>${esc(e.t)}'</b><span class="sb2">⇄</span><span><i style="font-style:normal;color:var(--win)">▲ ${esc(e.inn)}</i> <small>▼ ${esc(e.out)} · ${esc(tn(e.team))}</small></span></li>` : `<li><b>${esc(e.t)}${e.x ? '+' + esc(e.x) : ''}'</b>${e.type === 'Goal' ? ICON.ball : `<i class="cd${/red/i.test(e.d) ? ' r' : ''}"></i>`}<span>${esc(e.p || tn(e.team))}${e.p && e.team ? ` <small>${esc(tn(e.team))}</small>` : ''}<small> · ${esc(EVL(e))}</small></span></li>`).join('')}</ul>` : '<div class="empty">ESPN no publicó los goles ni las tarjetas de este partido.</div>'}</div>` : ''}
${stats.length ? `<div class="lg"><h3>Estadísticas de equipo</h3>${stats.length ? `<div class="sbh"><span>${esc(tn(r.home))}</span><span>${esc(tn(r.away))}</span></div>${stats.map(bar).join('')}` : '<div class="empty">ESPN no publicó estadísticas de este partido (pasa en amistosos y ligas menores).</div>'}</div>` : ''}
${r.venue ? `<div class="lg"><h3>Información</h3><div class="empty" style="text-align:left;color:var(--tx)">${esc(r.venue)}${r.city ? ', ' + esc(r.city) : ''}${r.vh ? ' <span class="mu">(sede habitual del local)</span>' : ''}${r.country ? ' · ' + esc(tn(r.country)) : ''}${det?.attendance ? '<br><span class="mu">Asistencia: ' + esc(det.attendance.toLocaleString('es-CO')) + '</span>' : ''}${det?.src === 'af' ? '<br><span class="mu">Detalle: API-Football</span>' : ''}</div></div>` : det?.src === 'af' ? '<div class="note">Detalle: API-Football</div>' : ''}
${noData ? `<div class="note">${isDone(r) ? 'ESPN no publicó goles, estadísticas ni alineaciones de este partido (pasa en amistosos y ligas menores).' : 'ESPN todavía no publicó goles, estadísticas ni alineaciones de este partido; se llenan solas cuando las entregue.'} Abajo tienes la tabla y el historial.</div>${tabla ? tabla.groups.map(g => stTable(r.slug, g, { hl: [r.home, r.away] })).join('') : ''}` : ''}
</main>
<aside class="side"><div class="box"><h4>Cara a cara</h4>${h2h.length ? h2h.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} <b>${x.gh ?? '–'}–${x.ga ?? '–'}</b> ${esc(tn(x.away))}</span><small>${esc(x.day.slice(2))}</small></a>`).join('') : '<div class="empty">No hay enfrentamientos guardados entre estos equipos.</div>'}</div>
<div class="box"><h4>Forma reciente</h4><div class="ln2"><div><h5>${esc(tn(r.home))}</h5>${fmHtml(form(r.home, '', r.id)) || '<small>Sin partidos guardados.</small>'}</div><div><h5>${esc(tn(r.away))}</h5>${fmHtml(form(r.away, '', r.id)) || '<small>Sin partidos guardados.</small>'}</div></div></div>
${noData ? '' : `<div class="box"><h4>Posiciones${r.slug ? ' · ' + esc(lgName(r)) : ''}</h4>${tabla ? tabla.groups.map(g => stTable(r.slug, g, { mini: true, hl: [r.home, r.away] }).replace(/^<div class="lg lgx">/, '<div class="lgx">')).join('') + (tabla.calc ? '<div class="sub" style="padding:6px 10px">Tabla calculada con los partidos guardados (no es la oficial).</div>' : '') : '<div class="empty">La tabla de posiciones no está disponible para este torneo.</div>'}${r.slug ? `<a href="/liga/${esc(r.slug)}">Tabla y goleadores <small>›</small></a>` : ''}</div>`}
<div class="box"><h4>Compartir</h4><div style="padding:6px 10px">${cardImg(r)}${shareBar(canonical, title, { h: tn(r.home), a: tn(r.away), hl: img(r.hl), al: img(r.al), gh: r.gh, ga: r.ga, st: r.status, el: r.el, ko: r.kickoff, league: lgName(r), venue: r.venue || '' }, r.city)}</div></div>
${same.length ? `<div class="box"><h4>Más de ${esc(lgName(r))}</h4>${same.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} ${x.gh == null ? 'vs' : x.gh + '–' + x.ga} ${esc(tn(x.away))}</span></a>`).join('')}</div>` : ''}
<div class="bt"><a class="pill" href="${r.day === dayOf(now()) ? '/partidos' : '/partidos/' + r.day}">Todos los partidos</a></div></aside></div>`
    const mc = cardOf(r), mdata = { h: tn(r.home), a: tn(r.away), hl: img(r.hl), al: img(r.al), gh: r.gh, ga: r.ga, st: r.status, el: r.el, ko: r.kickoff, league: lgName(r), venue: r.venue || '' }
    return { status: 200, cache: isDone(r) ? 3600 : 30, canonical, html: shell({ live: isLive(r) || (!isDone(r) && r.kickoff - now() < 3600e3), og: mc.og, card: { id: mc.id, k: mc.k, t: mc.t, need: mc.need, m: mdata, city: r.city || '', link: '__HOST__' }, title: `${title}${isDone(r) ? ' · resultado final' : isLive(r) ? ' · en vivo' : ''}`, desc: `${tn(r.home)} vs ${tn(r.away)}${r.slug ? ' (' + lgName(r) + ')' : ''}, ${longDay(r.day)}. Marcador, goles, tarjetas y estadísticas.`, path: canonical, body, nav: 'p', kw: [tn(r.home), tn(r.away), lgName(r)], head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` }) }
  }
  async function leaguePage(slug) {
    const rows = db.prepare('SELECT ' + COLS + ' FROM match_archive WHERE slug = ? ORDER BY kickoff DESC LIMIT 400').all(slug)
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
<section class="pn" id="q-res">${[...byDay.entries()].map(([d, rs]) => `<div class="mu" style="margin:8px 2px 4px;font-size:12px;font-weight:600">${esc(longDay(d))}</div><section class="lg"><div class="gr">${rs.sort((a, b) => a.kickoff - b.kickoff).map(r => matchRow(r)).join('')}</div></section>`).join('') || '<div class="lg"><div class="empty">Sin resultados guardados.</div></div>'}</section>
<section class="pn" id="q-nxt">${nx.length ? `<section class="lg"><div class="gr">${nx.slice(0, 40).map(r => matchRow(r)).join('')}</div></section>` : '<div class="lg"><div class="empty">No hay próximos partidos guardados.</div></div>'}</section>
<section class="pn" id="q-gol"><div class="lg lgx"><h3>Goleadores</h3>${scorersBox(sc, 30)}</div></section>
<section class="pn" id="q-tar"><div class="lg lgx"><h3>Disciplina</h3>${cd.length ? `<table class="tb"><thead><tr><th>#</th><th class="tn">Jugador</th><th>Equipo</th><th>Amarillas</th><th>Rojas</th></tr></thead><tbody>${cd.slice(0, 30).map((x, i) => `<tr><td class="rk">${i + 1}</td><td class="tn">${esc(x.p)}</td><td>${esc(tn(x.team))}</td><td>${x.y}</td><td>${x.r}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Todavía no hay tarjetas registradas en el archivo.</div>'}</div></section>
<section class="pn" id="q-equ"><div class="lg lgx"><h3>Estadísticas de equipos</h3>${eq.length ? `<table class="tb"><thead><tr><th class="tn">Equipo</th><th>PJ</th><th>GF</th><th>GC</th><th>DG</th><th class="hid">GF/PJ</th><th class="hid">GC/PJ</th><th class="hid">Portería 0</th><th class="hid">Ambos anotan</th><th class="hid">+2.5</th><th>Amar.</th><th>Rojas</th></tr></thead><tbody>${eq.map(x => `<tr><td class="tn">${esc(tn(x.team))}</td><td>${x.pj}</td><td>${x.gf}</td><td>${x.gc}</td><td>${sgn(x.gf - x.gc)}</td><td class="hid">${(x.gf / x.pj).toFixed(2)}</td><td class="hid">${(x.gc / x.pj).toFixed(2)}</td><td class="hid">${pc(x.cs, x.pj)}</td><td class="hid">${pc(x.btts, x.pj)}</td><td class="hid">${pc(x.o25, x.pj)}</td><td>${x.y}</td><td>${x.r}</td></tr>`).join('')}</tbody></table><div class="sub" style="padding:6px 10px">Calculado con los partidos guardados en el archivo.</div>` : '<div class="empty">Sin partidos terminados todavía.</div>'}</div></section>
</main><aside class="side"><div class="box"><h4>Compartir</h4><div style="padding:6px 10px">${shareBar('/liga/' + slug, name + ': resultados y tabla de posiciones', null)}</div></div><div class="box"><h4>Goleadores</h4>${scorersBox(sc, 6)}</div>${nx.length ? `<div class="box"><h4>Próximos</h4>${nx.slice(0, 6).map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} – ${esc(tn(x.away))}</span><small>${esc(x.day === dayOf(now()) ? hhmm(x.kickoff) : x.day.slice(5))}</small></a>`).join('')}</div>` : ''}</aside></div>`
    return { status: 200, cache: 600, html: shell({ title: `${name}: resultados, tabla de posiciones y goleadores`, desc: `Resultados recientes, tabla de posiciones, goleadores y estadísticas de ${name}.`, path: '/liga/' + slug, body, nav: 'l', kw: [name, 'tabla de posiciones ' + name, 'goleadores ' + name] }) }
  }
  function leaguesPage() {
    warmLogos().catch(() => {})
    const rows = db.prepare("SELECT slug, MAX(league) league, MAX(country) country, COUNT(*) n, MAX(kickoff) k FROM match_archive WHERE slug != '' AND sport = 'futbol' GROUP BY slug").all()
    const reg = new Map()
    for (const r of rows) { const g = lgRegion(r.slug); if (!reg.has(g)) reg.set(g, []); reg.get(g).push({ ...r, name: lgName(r) }) }
    const ORDER = ['Selecciones', 'Europa', 'Sudamérica', 'Norte y Centroamérica', 'Torneos de clubes', 'Asia y Oceanía', 'África', 'Otras ligas']
    const body = `<h1>Ligas y torneos</h1><div class="sub">${rows.length} ligas con resultados guardados</div>${[...reg.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([g, ls]) => `<h2>${esc(g)}</h2><div class="rg">${ls.sort((a, b) => { const i = TOPORDER.indexOf(a.slug), j = TOPORDER.indexOf(b.slug); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || a.name.localeCompare(b.name) }).map(l => `<a href="/liga/${esc(l.slug)}">${badge(l.slug, l.name)}<span><b>${esc(l.name)}</b><small>${l.n} partido${l.n === 1 ? '' : 's'}</small></span></a>`).join('')}</div>`).join('') || '<div class="lg"><div class="empty">Todavía no hay ligas guardadas.</div></div>'}`
    return { status: 200, cache: 600, html: shell({ title: 'Ligas y torneos de fútbol: tablas, goleadores y resultados', desc: 'Todas las ligas y torneos de fútbol con sus tablas de posiciones, goleadores y resultados.', path: '/ligas', body, nav: 'l', noindex: !rows.length }) }
  }

  // ---- otros deportes (ESPN): baloncesto, béisbol, hockey, fútbol americano, tenis y MMA ----
  // pide a ESPN; si el servidor principal rechaza (403/400/5xx) se intenta con site.web.api.espn.com
  const espnFetch = async (url, opt) => { let r = await fetch(url, opt); if (!r.ok && [400, 403, 429, 500, 502, 503].includes(r.status) && url.includes('//site.api.espn.com/')) { const r2 = await fetch(url.replace('//site.api.espn.com/', '//site.web.api.espn.com/'), opt).catch(() => null); if (r2 && r2.ok) r = r2 } return r }
  const logoU = x => /^https:\/\//.test(String(x || '')) ? String(x) : ''
  const insSp = db.prepare(`INSERT INTO match_archive (id, mkey, day, kickoff, status, league, slug, country, venue, city, home, away, hl, al, gh, ga, el, ev, updated, sport, info)
    VALUES (?,?,?,?,?,?,?,'',?,?,?,?,?,?,?,?,NULL,'[]',?,?,?)
    ON CONFLICT(mkey) DO UPDATE SET status = excluded.status, kickoff = excluded.kickoff, day = excluded.day, gh = excluded.gh, ga = excluded.ga, info = excluded.info,
      venue = CASE WHEN excluded.venue != '' THEN excluded.venue ELSE match_archive.venue END, hl = CASE WHEN excluded.hl != '' THEN excluded.hl ELSE match_archive.hl END,
      al = CASE WHEN excluded.al != '' THEN excluded.al ELSE match_archive.al END, updated = excluded.updated`)
  // convierte la respuesta de ESPN en partidos de 2 contendientes (equipos, tenistas o peleadores); lo que no tiene 2 (carreras, golf) se omite
  function parseSport(key, spSlug, lgSlug, lgEs, d) {
    const out = [], lg = d?.leagues?.[0]
    const lgLogo = (lg?.logos || []).find(x => (x.rel || []).includes('default'))?.href || lg?.logos?.[0]?.href
    if (/^https:\/\/[a-z0-9.-]*espncdn\.com\//i.test(lgLogo || '') && LOGOS.get(spSlug + '/' + lgSlug) !== lgLogo) { LOGOS.set(spSlug + '/' + lgSlug, lgLogo); try { db.prepare('INSERT OR REPLACE INTO match_logos (slug, url) VALUES (?, ?)').run(spSlug + '/' + lgSlug, lgLogo) } catch { /* nada */ } }
    for (const e of d?.events || []) {
      const comps = (e.competitions && e.competitions.length) ? e.competitions : (e.groupings || []).flatMap(g => g.competitions || [])
      for (const c of comps) {
        const cs = c.competitors || []; if (cs.length !== 2) continue
        const h = cs.find(x => x.homeAway === 'home') || cs[0], a = cs.find(x => x.homeAway === 'away') || cs[1]
        const nm = x => String(x.team?.displayName || x.athlete?.displayName || x.roster?.displayName || x.team?.name || '').slice(0, 80); if (!nm(h) || !nm(a)) continue   // dobles de tenis: la pareja viene en roster
        const type = (c.status || e.status)?.type || {}, state = type.state, tname = String(type.name || '')
        const status = /postponed|cancel|suspend|forfeit/i.test(tname) ? 'PST' : state === 'in' ? 'LIVE' : state === 'post' ? 'FT' : 'NS'
        const ko = Date.parse(c.date || c.startDate || e.date); const cid = Number(c.id || e.id); if (!ko || !Number.isFinite(cid)) continue
        let gh = Number.isFinite(+h.score) && h.score !== '' && h.score != null ? +h.score : null, ga = Number.isFinite(+a.score) && a.score !== '' && a.score != null ? +a.score : null, info = ''
        if (spSlug === 'tennis') {
          const ls = (x, i) => +(x.linescores?.[i]?.value ?? NaN), n = Math.max(h.linescores?.length || 0, a.linescores?.length || 0); let sh = 0, sa = 0; const sets = []
          for (let i = 0; i < n; i++) { const x = ls(h, i), y = ls(a, i); if (Number.isNaN(x) || Number.isNaN(y)) continue; sets.push(x + '-' + y); if (x > y) sh++; else if (y > x) sa++ }
          if (n) { gh = sh; ga = sa }
          if (status === 'FT') info = sets.join('  ')
        } else if (spSlug === 'mma' && status === 'FT') { const w = h.winner ? nm(h) : a.winner ? nm(a) : ''; info = w ? 'Ganador: ' + w : ''; gh = null; ga = null }
        if (status === 'LIVE') info = String(type.shortDetail || type.detail || '').slice(0, 24)
        out.push({ id: -(5e9 + cid), mkey: spSlug + '/' + lgSlug + '|' + cid, day: dayOf(ko), ko, status, lgEs, slug: spSlug + '/' + lgSlug, venue: String(c.venue?.fullName || e.venue?.displayName || '').slice(0, 120), city: String(c.venue?.address?.city || '').slice(0, 60), home: nm(h), away: nm(a), hl: logoU(h.team?.logo || h.athlete?.flag?.href || h.roster?.athletes?.[0]?.flag?.href), al: logoU(a.team?.logo || a.athlete?.flag?.href || a.roster?.athletes?.[0]?.flag?.href), gh, ga, key, info })
      }
    }
    return out
  }
  // avisos en vivo de los otros deportes (inicio, entretiempo, final y goles de hockey): llegan al mapa y al portal con pitido y voz
  function announceSport(o, old) {
    if (!broadcast) return
    const base = { type: 'matchev', imp: 1, h: o.home, a: o.away, gh: o.gh ?? 0, ga: o.ga ?? 0, sport: o.key, min: null, logo: '' }
    if (old.status === 'NS' && o.status === 'LIVE') broadcast({ ...base, kind: 'start' })
    else if (old.status === 'LIVE' && o.status === 'FT') broadcast({ ...base, kind: 'end' })
    else if (o.status === 'LIVE' && /half/i.test(o.info) && !/half/i.test(old.info || '')) broadcast({ ...base, kind: 'ht' })
    if (o.key === 'hockey' && o.status === 'LIVE') for (const [side, team] of [['gh', o.home], ['ga', o.away]]) if ((o[side] ?? 0) > (old[side] ?? 0)) broadcast({ ...base, kind: 'goal', team })
  }
  let sportSync = false
  const emptyUntil = new Map(), qOldSp = db.prepare('SELECT status, gh, ga, info FROM match_archive WHERE mkey = ?')
  async function syncSports(dates, wideRun = false) {
    if (sportSync || S().partidosOn === false || S().partidosSports === false) return 0
    sportSync = true; let n = 0
    try {
      for (const [key, cfg] of Object.entries(SP)) for (const [spSlug, lgSlug, lgEs] of cfg.lg) {
        const lk = spSlug + '/' + lgSlug; if (!wideRun && (emptyUntil.get(lk) || 0) > now()) continue   // sin partidos en la última vuelta: se vuelve a mirar en 30 minutos
        let got = 0
        for (const dt of dates) {
        try {
          const r = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/${spSlug}/${lgSlug}/scoreboard?dates=${dt}&limit=300`, { headers: { 'User-Agent': 'Mozilla/5.0 (resultados deportivos)' }, signal: AbortSignal.timeout(8000) })
          if (!r.ok) continue
          for (const o of parseSport(key, spSlug, lgSlug, lgEs, await r.json())) { const old = qOldSp.get(o.mkey); got++; insSp.run(o.id, o.mkey, o.day, o.ko, o.status, o.lgEs, o.slug, o.venue, o.city, o.home, o.away, o.hl, o.al, o.gh, o.ga, now(), o.key, o.info); n++; if (old) { try { announceSport(o, old) } catch { /* el aviso es un extra */ } } }
        } catch { /* esta liga se intenta en el próximo ciclo */ }
        }
        if (!wideRun) { if (got) emptyUntil.delete(lk); else emptyUntil.set(lk, now() + 30 * 60e3) } else emptyUntil.delete(lk)
      }
    } finally { sportSync = false }
    return n
  }
  const near = () => [...new Set([ESPN.ymd(now() - 12 * 3600e3), ESPN.ymd(now()), ESPN.ymd(now() + 12 * 3600e3)])]
  const wide = () => { const o = []; for (let i = -3; i <= 4; i++) o.push(ESPN.ymd(now() + i * 864e5)); return o }
  setTimeout(() => syncSports(wide(), true).catch(() => {}), 70e3).unref()
  setInterval(() => syncSports(near()).catch(() => {}), 4 * 60e3).unref()
  setInterval(() => syncSports(wide(), true).catch(() => {}), 6 * 3600e3).unref()

  async function sportPage(key, day, isToday) {
    const cfg = SP[key], base = '/partidos/' + key
    const rows = db.prepare('SELECT ' + COLS + ' FROM match_archive WHERE sport = ? AND day = ? ORDER BY kickoff, id').all(key, day)
    const nLive = rows.filter(isLive).length, nFin = rows.filter(isDone).length, nNx = rows.length - nLive - nFin, gs = groups(rows), live = rows.filter(isLive)
    const upc = rows.filter(r => !isLive(r) && !isDone(r)).slice(0, 10)
    const body = `<div class="hrow"><h1>${isToday ? 'Resultados de ' + esc(cfg.es.toLowerCase()) + ' de hoy' : esc(cfg.es) + ': resultados del ' + esc(longDay(day))}</h1><span class="sub">${esc(longDay(day))} · ${rows.length} partido${rows.length === 1 ? '' : 's'}</span></div>
<div id="live-wrap">${live.length ? `<section class="livebox"><h2><i></i>En vivo ahora · ${live.length}<a class="more" href="#lista">Ver todos ↓</a></h2><div class="lw"><button class="sl l" type="button" data-slide="-1" aria-label="Anteriores">‹</button><div class="lcs">${live.slice(0, 30).map(r => liveCard(r)).join('')}</div><button class="sl r" type="button" data-slide="1" aria-label="Siguientes">›</button></div></section>` : ''}
</div>
<input class="f" type="radio" name="f" id="f-all" checked><input class="f" type="radio" name="f" id="f-live"><input class="f" type="radio" name="f" id="f-fin"><input class="f" type="radio" name="f" id="f-nxt">
<div class="bar2">${dayNav(day, base)}<span class="grp"><label for="f-all">Todos ${rows.length}</label><label class="lvl" for="f-live">En vivo <b>${nLive}</b></label><label for="f-fin">Finalizados ${nFin}</label><label for="f-nxt">Próximos ${nNx}</label></span><span class="rt grp"><button type="button" data-expand="all">Abrir todo</button><button type="button" data-expand="none">Cerrar todo</button></span></div>
${rows.length ? chipsBar(gs) : ''}
<div class="g2" id="lista"><main>${rows.length ? gs.map(g => leagueBlock(g, true, true)).join('') : `<div class="lg"><div class="empty">No hay partidos de ${esc(cfg.es.toLowerCase())} guardados para este día.</div></div>`}</main>
<aside class="side"><div class="box"><h4>Próximos</h4><div class="rp" style="display:block">${upc.length ? upc.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} – ${esc(tn(x.away))}</span><small>${esc(hhmm(x.kickoff))}</small></a>`).join('') : '<div class="empty">No hay más partidos por jugar.</div>'}</div></div><div class="box"><h4>Compartir página</h4><div style="padding:6px 10px">${shareBar(isToday ? base : base + '/' + day, cfg.es + ': resultados ' + (isToday ? 'de hoy' : 'del ' + longDay(day)), null)}</div></div></aside></div>`
    return { status: 200, cache: isToday ? 30 : 600, html: shell({ title: isToday ? `Resultados de ${cfg.es.toLowerCase()} de hoy: marcadores en vivo` : `${cfg.es}: resultados del ${longDay(day)}`, desc: `Marcadores en vivo y resultados de ${cfg.es.toLowerCase()} (${cfg.lg.map(x => x[2]).join(', ')}) del ${longDay(day)}.`, path: isToday ? base : base + '/' + day, body, nav: 'p', live: isToday, sp: key, noindex: !rows.length, kw: [cfg.es, ...cfg.lg.map(x => x[2]), 'resultados de ' + cfg.es.toLowerCase()] }) }
  }
  // canchas de cada deporte (SVG sencillo) y lugar de cada titular según su posición
  const COURT = {
    baloncesto: { bg: '#b9833f', svg: '<rect x="3" y="3" width="94" height="124" fill="none" stroke="#fff" stroke-width="1"/><line x1="3" y1="65" x2="97" y2="65" stroke="#fff"/><circle cx="50" cy="65" r="9" fill="none" stroke="#fff"/><rect x="33" y="3" width="34" height="26" fill="none" stroke="#fff"/><path d="M20 3v14a30 30 0 0 0 60 0V3" fill="none" stroke="#fff"/><rect x="33" y="101" width="34" height="26" fill="none" stroke="#fff"/><path d="M20 127v-14a30 30 0 0 1 60 0v14" fill="none" stroke="#fff"/>', pos: { PG: [50, 78], SG: [80, 64], SF: [20, 64], PF: [66, 40], C: [50, 22], G: [50, 78], F: [26, 52] }, slots: [[50, 82], [80, 64], [20, 64], [66, 40], [34, 40]] },
    hockey: { bg: '#dbeaf4', svg: '<rect x="3" y="3" width="94" height="124" rx="22" fill="none" stroke="#c0392b" stroke-width="1.2"/><line x1="3" y1="65" x2="97" y2="65" stroke="#c0392b" stroke-width="1.5"/><circle cx="50" cy="65" r="9" fill="none" stroke="#2980b9"/><line x1="3" y1="40" x2="97" y2="40" stroke="#2980b9"/><line x1="3" y1="90" x2="97" y2="90" stroke="#2980b9"/><rect x="42" y="8" width="16" height="6" fill="none" stroke="#c0392b"/><rect x="42" y="116" width="16" height="6" fill="none" stroke="#c0392b"/>', pos: { G: [50, 90], D: [34, 68], C: [50, 46], LW: [26, 28], RW: [74, 28], W: [30, 30] }, slots: [[50, 92], [34, 70], [66, 70], [50, 48], [28, 30], [72, 30]] },
    beisbol: { bg: '#3d8b4a', svg: '<path d="M50 118 8 62 50 8l42 54Z" fill="#b8884f" opacity=".55"/><path d="M50 118 8 62 50 8l42 54Z" fill="none" stroke="#fff"/><path d="M50 108 20 64 50 22l30 42Z" fill="#3d8b4a" stroke="#fff"/><rect x="47" y="104" width="6" height="6" fill="#fff"/>', pos: { P: [50, 68], C: [50, 100], '1B': [74, 70], '2B': [62, 50], '3B': [26, 70], SS: [38, 50], LF: [18, 28], CF: [50, 16], RF: [82, 28], DH: [88, 96] }, slots: [] },
    nfl: { bg: '#2f7d3f', svg: '<rect x="3" y="3" width="94" height="124" fill="none" stroke="#fff"/>' + Array.from({ length: 9 }, (_, k) => `<line x1="3" y1="${3 + (k + 1) * 12.4}" x2="97" y2="${3 + (k + 1) * 12.4}" stroke="#fff" opacity=".6"/>`).join(''), pos: { QB: [50, 80], RB: [50, 96], WR: [14, 70], TE: [76, 70], OL: [50, 70], C: [50, 70], G: [40, 70], T: [62, 70] }, slots: [] },
    tenis: { bg: '#2e6fb0', svg: '<rect x="14" y="8" width="72" height="114" fill="#3f86c6" stroke="#fff"/><line x1="14" y1="65" x2="86" y2="65" stroke="#fff" stroke-width="1.6"/><rect x="26" y="8" width="48" height="114" fill="none" stroke="#fff"/><line x1="26" y1="36" x2="74" y2="36" stroke="#fff"/><line x1="26" y1="94" x2="74" y2="94" stroke="#fff"/><line x1="50" y1="36" x2="50" y2="94" stroke="#fff"/>', pos: {}, slots: [[50, 100], [50, 30]] },
    mma: { bg: '#23272d', svg: '<polygon points="30,8 70,8 92,30 92,100 70,122 30,122 8,100 8,30" fill="#31363d" stroke="#fff" opacity=".9"/><circle cx="50" cy="65" r="14" fill="none" stroke="#ef4444" stroke-width="1.2"/>', pos: {}, slots: [[50, 98], [50, 32]] }
  }
  const courtOf = (sport, players, flip) => {
    const c = COURT[sport]; if (!c) return ''
    const st = (players || []).filter(p => p.st); const pl = (st.length ? st : players || []).slice(0, sport === 'baloncesto' ? 5 : sport === 'hockey' ? 6 : sport === 'beisbol' ? 9 : sport === 'nfl' ? 11 : 2)
    const used = new Set(); let si = 0
    const dots = pl.map(p => {
      let xy = c.pos[String(p.pos).toUpperCase()]
      if (!xy || used.has(xy)) { xy = c.slots[si++ % Math.max(1, c.slots.length)] || [20 + (si * 17) % 60, 30 + (si * 23) % 60] }
      used.add(xy); const x = xy[0], y = flip ? 130 - xy[1] : xy[1]
      return `<div class="pp ${flip ? 'aw' : ''}" style="left:${x}%;top:${y / 1.3}%">${p.ph ? `<b class="fc"><img src="${esc(p.ph)}" alt="" loading="lazy" onerror="this.remove()"><i>${esc(p.n || (p.name || '?')[0])}</i></b>` : `<b>${esc(p.n || (p.name || '?')[0])}</b>`}<span>${esc(String(p.name).split(' ').slice(-1)[0])}</span></div>`
    }).join('')
    return `<div class="pitch court" style="background:${c.bg}"><svg viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true">${c.svg}</svg>${dots}</div>`
  }
  async function sportMatchPage(r) {
    r = withVenue(r)
    const cfg = SP[r.sport] || { es: 'Deporte' }, canonical = matchUrl(r), title = `${tn(r.home)} ${r.gh == null ? 'vs' : r.gh + ' - ' + r.ga} ${tn(r.away)}`
    const det = await detail(r).catch(() => null)
    const mdata = { h: tn(r.home), a: tn(r.away), hl: img(r.hl), al: img(r.al), gh: r.gh, ga: r.ga, st: r.status, el: null, info: infoEs(r.sport, r.info), ko: r.kickoff, league: lgName(r), venue: r.venue || '' }
    const big = (u, n) => img(u) ? `<img src="${esc(img(u))}" alt="" width="56" height="56" data-n="${esc(n || '')}">` : crest(n)
    const same = db.prepare('SELECT ' + COLS + ' FROM match_archive WHERE slug = ? AND day = ? AND id != ? ORDER BY kickoff LIMIT 12').all(r.slug, r.day, r.id)
    const stats = (det?.stats || []).filter(x => x.h !== '' || x.a !== '').slice(0, 30).map(x => ({ ...x, label: LABEL_ES[x.l] || x.l }))
    const sv2 = x => { const n = parseFloat(String(x).replace('%', '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
    const bar2 = x => { const h = sv2(x.h), a = sv2(x.a), t = h + a, hp = t ? Math.round(h / t * 100) : 50; return `<div class="sb"><div class="r"><b>${esc(x.h)}</b><span>${esc(x.label)}</span><b>${esc(x.a)}</b></div><div class="bar"><span class="bh"><i class="h" style="width:${hp}%"></i></span><span class="ba"><i class="a" style="width:${100 - hp}%"></i></span></div></div>` }
    const pH = courtOf(r.sport, det?.lineups?.home?.players, false), pA = courtOf(r.sport, det?.lineups?.away?.players, false)
    const list = k => { const d = det?.lineups?.[k]; return d?.players?.length ? d.players.slice(0, 18).map(p => `<div class="pl2"><b>${esc(p.n)}</b><span>${esc(p.name)} <small>${esc(p.pos)}${p.st ? ' · titular' : ''}</small></span></div>`).join('') : '' }
    const hasPl = !!(det?.lineups?.home?.players?.length || det?.lineups?.away?.players?.length), singles = r.sport === 'tenis' || r.sport === 'mma'
    const body = `${betSlot(r, 'betbox')}<div class="mh"><div class="mtb"><h1 class="mt">${esc(cfg.es)} · ${esc(lgName(r))} · ${esc(longDay(r.day))}${r.venue ? ' · ' + esc(r.venue) : ''}</h1>${shareBar(canonical, title, mdata, r.city, true)}</div>
<div class="mr"><div class="tm2">${big(r.hl, r.home)}<div class="nm" style="text-align:right">${esc(tn(r.home))}${det?.rec?.home ? `<div class="rec">${esc(det.rec.home)}</div>` : ''}<div><button type="button" class="fw1" data-s="1" data-follow="${esc(r.home)}" data-l="${esc(tn(r.home))}" aria-label="Seguir a ${esc(tn(r.home))}">☆ Seguir</button></div></div></div><div>${r.gh == null ? '<div class="vs">vs</div>' : `<div class="sc2">${esc(r.gh)} <span>-</span> ${esc(r.ga)}</div>`}<div class="st${isLive(r) ? ' lv' : ''}">${esc(isLive(r) ? 'EN VIVO · ' + stLabel(r) : isDone(r) ? 'FINALIZADO' : hhmm(r.kickoff))}</div></div><div class="tm2"><div class="nm">${esc(tn(r.away))}${det?.rec?.away ? `<div class="rec">${esc(det.rec.away)}</div>` : ''}<div><button type="button" class="fw1" data-s="1" data-follow="${esc(r.away)}" data-l="${esc(tn(r.away))}" aria-label="Seguir a ${esc(tn(r.away))}">☆ Seguir</button></div></div>${big(r.al, r.away)}</div></div>${r.info && isDone(r) ? `<div class="ms" style="grid-template-columns:1fr"><div style="text-align:center;justify-content:center">${esc(r.info)}</div></div>` : ''}</div>
<div class="g3 mp"><aside class="lu"><input class="f" type="radio" name="pt" id="pt-h" checked><input class="f" type="radio" name="pt" id="pt-a"><div class="lg"><h3>${singles || !hasPl ? 'Cancha' : 'Titulares'}</h3>
${!hasPl && !singles ? `<div class="pt1">${courtOf(r.sport, [], false)}</div><div class="sub" style="padding:0 12px 10px">ESPN todavía no publicó los titulares.</div>` : singles ? `<div class="pt1">${courtOf(r.sport, [{ name: tn(r.home), n: '1', st: true }, { name: tn(r.away), n: '2', st: true }], false)}</div>` : `<div class="tabs"><label for="pt-h">${esc(tn(r.home))}</label><label for="pt-a">${esc(tn(r.away))}</label></div><div class="ph"><div class="pt1">${pH}</div>${list('home')}</div><div class="pa"><div class="pt1">${pA}</div>${list('away')}</div>`}</div></aside>
<main>${stats.length ? `<div class="lg"><h3>Estadísticas de equipo</h3><div class="sbh"><span>${esc(tn(r.home))}</span><span>${esc(tn(r.away))}</span></div>${stats.map(bar2).join('')}</div>` : `<div class="note">ESPN todavía no publicó estadísticas de este partido. Se llenan solas cuando las entregue.</div>`}
<div class="lg"><h3>Información</h3><div class="empty" style="text-align:left;color:var(--tx)">${esc(lgName(r))} · ${esc(cfg.es)}<br>${esc(longDay(r.day))} · ${esc(hhmm(r.kickoff))}${r.venue ? '<br>' + esc(r.venue) + (r.city ? ', ' + esc(r.city) : '') : ''}${det?.attendance ? '<br><span class="mu">Asistencia: ' + esc(det.attendance.toLocaleString('es-CO')) + '</span>' : ''}</div></div></main>
<aside class="side">${same.length ? `<div class="box"><h4>Más de ${esc(lgName(r))} hoy</h4>${same.map(x => `<a href="${esc(matchUrl(x))}"><span>${esc(tn(x.home))} ${x.gh == null ? 'vs' : x.gh + '–' + x.ga} ${esc(tn(x.away))}</span></a>`).join('')}</div>` : ''}<div class="box"><h4>Compartir</h4><div style="padding:6px 10px">${shareBar(canonical, title, mdata, r.city)}</div></div><div class="bt"><a class="pill" href="/partidos/${esc(r.sport)}">Todos los partidos de ${esc(cfg.es.toLowerCase())}</a></div></aside></div>`
    const mc = cardOf(r)
    return { status: 200, cache: isDone(r) ? 3600 : 30, canonical, html: shell({ live: isLive(r) || (!isDone(r) && r.kickoff - now() < 3600e3), og: mc.og, card: { id: mc.id, k: mc.k, t: mc.t, need: mc.need, m: mdata, city: r.city || '', link: '__HOST__' }, title: `${title}${isDone(r) ? ' · resultado final' : isLive(r) ? ' · en vivo' : ''}`, desc: `${tn(r.home)} vs ${tn(r.away)} (${lgName(r)}), ${longDay(r.day)}. Marcador y resultado de ${cfg.es.toLowerCase()}.`, path: canonical, body, nav: 'p', sp: r.sport, kw: [tn(r.home), tn(r.away), lgName(r), cfg.es] }) }
  }


  // ---- enrutador: devuelve { status, html, cache } o null si la ruta no es de esta sección ----
  const notFound = (path, title, msg) => ({ status: 404, html: shell({ title, desc: '', path, body: `<h1>${esc(title)}</h1><p class="mu">${esc(msg)}</p><p><a class="pill" href="/partidos">Ver resultados de hoy</a></p>`, nav: 'p', noindex: true }) })
  async function page(pathname) {
    if (S().partidosOn === false) return null
    let m
    if (pathname === '/partidos' || pathname === '/partidos/') return dayPage(dayOf(now()), true, true)
    if (pathname === '/partidos/futbol' || pathname === '/partidos/futbol/') return dayPage(dayOf(now()), true, false)
    if (pathname === '/ligas' || pathname === '/ligas/') return leaguesPage()
    if (pathname === '/partidos/pronosticos' || pathname === '/partidos/pronosticos/') return predPage()
    if ((m = /^\/partidos\/(baloncesto|beisbol|hockey|nfl|tenis|mma)(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(pathname))) {
      if (S().partidosSports === false) return null
      const day = m[2] || dayOf(now()); if (isNaN(Date.parse(day))) return notFound(pathname, 'Fecha no válida', 'Esa fecha no existe.')
      return sportPage(m[1], day, day === dayOf(now()))
    }
    if ((m = /^\/partidos\/(\d{4}-\d{2}-\d{2})$/.exec(pathname))) { if (isNaN(Date.parse(m[1]))) return notFound(pathname, 'Fecha no válida', 'Esa fecha no existe.'); return dayPage(m[1], m[1] === dayOf(now())) }
    if ((m = /^\/partido\/([es])(\d+)(?:-[a-z0-9-]*)?$/.exec(pathname))) { const r = db.prepare('SELECT * FROM match_archive WHERE id = ?').get(m[1] === 'e' ? -m[2] : +m[2]); if (!r) { const g = db.prepare('SELECT slug, sport FROM match_gone WHERE id = ?').get(m[1] === 'e' ? -m[2] : +m[2]); if (g) return { status: 301, location: g.sport && g.sport !== 'futbol' ? '/partidos/' + g.sport : g.slug ? '/liga/' + g.slug : '/partidos/futbol' } } return r ? matchPage(r) : notFound(pathname, 'Partido no encontrado', 'Ese partido ya no está en el archivo.') }
    if ((m = /^\/liga\/([a-z0-9._-]{1,60})$/i.exec(pathname))) return (await leaguePage(m[1])) || notFound(pathname, 'Liga no encontrada', 'Todavía no hay partidos guardados de esa liga.')
    return null
  }
  // direcciones para el sitemap
  function sitemapUrls(origin) {
    if (S().partidosOn === false) return ''
    const u = [], add = (p, lm, ch) => u.push(`<url><loc>${origin}${esc(p)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}${ch ? `<changefreq>${ch}</changefreq>` : ''}</url>`)
    add('/partidos', dayOf(now()), 'always'); add('/partidos/futbol', dayOf(now()), 'always'); add('/ligas', dayOf(now()), 'daily')
    if (S().partidosSports !== false) for (const k of Object.keys(SP)) add('/partidos/' + k, dayOf(now()), 'hourly')
    for (let i = 1; i < 8; i++) { const d = dayOf(now() - i * 864e5); if (db.prepare('SELECT 1 FROM match_archive WHERE day = ? LIMIT 1').get(d)) add('/partidos/' + d, d) }
    for (const r of db.prepare("SELECT slug, MAX(kickoff) k FROM match_archive WHERE slug != '' AND sport = 'futbol' AND kickoff > ? GROUP BY slug ORDER BY k DESC LIMIT 400").all(now() - 14 * 864e5)) add('/liga/' + r.slug, dayOf(r.k), 'daily')
    for (const r of db.prepare('SELECT ' + COLS + ' FROM match_archive WHERE kickoff > ? ORDER BY kickoff DESC LIMIT 3000').all(now() - 30 * 864e5)) add(matchUrl(r), dayOf(r.updated))
    return u.join('')
  }
  const hasLive = () => !!db.prepare(`SELECT 1 FROM match_archive WHERE status IN (${LIVE.map(() => '?').join(',')}) AND kickoff > ? LIMIT 1`).get(...LIVE, now() - 5 * 3600e3)
  return { markShared, postMatch, goneInfo, PRED, save, hide, page, sitemapUrls, finalizeOld, purgeOld, dayOf, hasLive, syncSports, cardKey, cardTokOk, fillCandidates, fillSave, fillMark, fillSample, fillInfo, fillReset, cardPayloadById, css: () => CSS, build: BUILD }
}

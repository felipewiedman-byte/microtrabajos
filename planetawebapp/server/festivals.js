// Fiestas, ferias, carnavales y festivos de todo el mundo (fijos cada año). Se publican solos cuando llega la fecha y desaparecen al terminar.
// Fechas: 'MM-DD' fija, {easter: días} relativo a Pascua, {nth: [mes, semana, díaSemana]} (semana -1 = última), o {cny: true} (Año Nuevo Chino).
const F = [
  // Colombia
  ['Carnaval de Barranquilla', 'Barranquilla', 'Colombia', 10.9685, -74.7813, { easter: -50 }, 4, 'Patrimonio de la humanidad: desfiles, comparsas, cumbia y la Batalla de Flores.'],
  ['Feria de las Flores', 'Medellín', 'Colombia', 6.2442, -75.5812, { nth: [8, 1, 5] }, 10, 'Desfile de Silleteros, cabalgata, conciertos y tablados en toda la ciudad.'],
  ['Feria de Cali', 'Cali', 'Colombia', 3.4516, -76.532, '12-25', 6, 'Salsódromo, conciertos de salsa, desfiles y la capital mundial de la salsa en fiesta.'],
  ['Festival de la Leyenda Vallenata', 'Valledupar', 'Colombia', 10.4631, -73.2532, '04-29', 4, 'El festival más importante del vallenato: concursos de acordeón y conciertos.'],
  ['Carnaval de Negros y Blancos', 'Pasto', 'Colombia', 1.2136, -77.2811, '01-02', 5, 'Patrimonio de la humanidad: carrozas monumentales y el juego del blanco.'],
  ['Semana Santa en Popayán', 'Popayán', 'Colombia', 2.4448, -76.6147, { easter: -4 }, 4, 'Procesiones centenarias declaradas patrimonio de la humanidad.'],
  ['Rock al Parque', 'Bogotá', 'Colombia', 4.6584, -74.0937, { nth: [11, 1, 6] }, 3, 'El festival de rock gratuito más grande de Latinoamérica.'],
  ['Feria de Manizales', 'Manizales', 'Colombia', 5.0703, -75.5138, '01-03', 7, 'Reinado del café, conciertos y desfiles en la capital cafetera.'],
  ['Festival Petronio Álvarez', 'Cali', 'Colombia', 3.4516, -76.532, { nth: [8, 2, 3] }, 6, 'La gran fiesta de la música del Pacífico colombiano.'],
  ['Fiestas del Mar', 'Santa Marta', 'Colombia', 11.2408, -74.199, { nth: [7, -1, 5] }, 4, 'Regatas, desfiles náuticos y fiesta en la bahía.'],
  // Latinoamérica
  ['Carnaval de Río', 'Río de Janeiro', 'Brasil', -22.9119, -43.1969, { easter: -51 }, 5, 'El carnaval más famoso del mundo: escolas de samba en el Sambódromo.'],
  ['Día de Muertos', 'Ciudad de México', 'México', 19.4326, -99.1332, '11-01', 2, 'Altares, catrinas y el gran desfile por el Zócalo.'],
  ['Guelaguetza', 'Oaxaca', 'México', 17.0732, -96.7266, { nth: [7, 3, 1] }, 8, 'Danzas y tradiciones de las regiones de Oaxaca.'],
  ['Inti Raymi', 'Cusco', 'Perú', -13.5319, -71.9675, '06-24', 1, 'La Fiesta del Sol inca en Sacsayhuamán.'],
  ['Fiesta de la Vendimia', 'Mendoza', 'Argentina', -32.8895, -68.8458, { nth: [3, 1, 6] }, 3, 'Celebración de la cosecha de la uva con desfiles y espectáculo.'],
  ['Carnaval de Oruro', 'Oruro', 'Bolivia', -17.9647, -67.106, { easter: -50 }, 3, 'Patrimonio de la humanidad: la Diablada y danzas andinas.'],
  ['Carnaval de Montevideo', 'Montevideo', 'Uruguay', -34.9011, -56.1645, { easter: -55 }, 10, 'El carnaval más largo del mundo, con murgas y candombe.'],
  ['Fiestas Patrias', 'Santiago', 'Chile', -33.4489, -70.6693, '09-17', 3, 'Fondas, cueca y celebración de la independencia.'],
  ['Mardi Gras', 'Nueva Orleans', 'Estados Unidos', 29.9511, -90.0715, { easter: -47 }, 1, 'Desfiles, collares y jazz en el Barrio Francés.'],
  // Europa
  ['San Fermín', 'Pamplona', 'España', 42.8125, -1.6458, '07-06', 9, 'Encierros, chupinazo y fiesta en las calles.'],
  ['Las Fallas', 'Valencia', 'España', 39.4699, -0.3763, '03-15', 5, 'Monumentos gigantes que arden en la Cremà.'],
  ['La Tomatina', 'Buñol', 'España', 39.4206, -0.7906, { nth: [8, -1, 3] }, 1, 'La batalla de tomates más famosa del mundo.'],
  ['Feria de Abril', 'Sevilla', 'España', 37.3891, -5.9845, { easter: 14 }, 6, 'Casetas, sevillanas y caballos en el Real de la Feria.'],
  ['Oktoberfest', 'Múnich', 'Alemania', 48.1314, 11.5497, '09-19', 16, 'La fiesta de la cerveza más grande del mundo en la Theresienwiese.'],
  ['Carnaval de Venecia', 'Venecia', 'Italia', 45.4408, 12.3155, { easter: -57 }, 11, 'Máscaras, trajes de época y bailes en la plaza San Marcos.'],
  ['Notting Hill Carnival', 'Londres', 'Reino Unido', 51.5154, -0.2055, { nth: [8, -1, 0] }, 2, 'El carnaval caribeño más grande de Europa.'],
  ['Fiesta de la Música', 'París', 'Francia', 48.8566, 2.3522, '06-21', 1, 'Música gratis en cada calle de Francia.'],
  ['Día de San Patricio', 'Dublín', 'Irlanda', 53.3498, -6.2603, '03-17', 1, 'Desfile verde y celebración irlandesa.'],
  ['Día del Rey', 'Ámsterdam', 'Países Bajos', 52.3676, 4.9041, '04-27', 1, 'La ciudad se viste de naranja, con fiestas en los canales.'],
  ['Mercado de Navidad', 'Estrasburgo', 'Francia', 48.5734, 7.7521, '11-27', 28, 'Uno de los mercados navideños más antiguos de Europa.'],
  ['Año Nuevo en Times Square', 'Nueva York', 'Estados Unidos', 40.758, -73.9855, '12-31', 1, 'La caída de la bola y la cuenta regresiva más famosa.'],
  ['Halloween en Nueva York', 'Nueva York', 'Estados Unidos', 40.7316, -74.0001, '10-31', 1, 'El gran desfile de disfraces del Village.'],
  ['Desfile de Acción de Gracias', 'Nueva York', 'Estados Unidos', 40.7812, -73.9665, { nth: [11, 4, 4] }, 1, 'Globos gigantes por la avenida principal de Manhattan.'],
  // Asia, África, Oceanía
  ['Año Nuevo Chino', 'Pekín', 'China', 39.9042, 116.4074, { cny: true }, 3, 'Faroles rojos, dragones y fuegos artificiales.'],
  ['Holi', 'Mathura', 'India', 27.4924, 77.6737, { nth: [3, 2, 0] }, 2, 'El festival de los colores.'],
  ['Diwali', 'Varanasi', 'India', 25.3176, 82.9739, { nth: [11, 1, 0] }, 5, 'El festival de las luces junto al Ganges.'],
  ['Songkran', 'Bangkok', 'Tailandia', 13.7563, 100.5018, '04-13', 3, 'El año nuevo tailandés con la gran batalla de agua.'],
  ['Hanami', 'Tokio', 'Japón', 35.7148, 139.7967, '03-28', 10, 'La floración de los cerezos en los parques de Tokio.'],
  ['Año Nuevo en Sídney', 'Sídney', 'Australia', -33.8523, 151.2108, '12-31', 1, 'Fuegos artificiales sobre la Ópera y el puente de la bahía.'],
  ['Festival de Edimburgo', 'Edimburgo', 'Reino Unido', 55.9533, -3.1883, { nth: [8, 1, 5] }, 24, 'El festival de artes más grande del mundo.'],
  ['Carnaval de Santa Cruz', 'Santa Cruz de Tenerife', 'España', 28.4636, -16.2518, { easter: -50 }, 6, 'Uno de los carnavales más grandes del mundo.'],
  ['Navidad en el Vaticano', 'Ciudad del Vaticano', 'Vaticano', 41.9022, 12.4539, '12-24', 2, 'Misa de Gallo y la bendición Urbi et Orbi.'],
  ['Ramadán: fin (Eid)', 'La Meca', 'Arabia Saudita', 21.4225, 39.8262, { eid: true }, 3, 'Celebración del fin del mes de Ramadán.'],
]
// fechas del Año Nuevo Chino y de Eid al-Fitr (aproximadas, según calendario lunar)
const CNY = { 2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03' }
const EID = { 2025: '03-30', 2026: '03-20', 2027: '03-10', 2028: '02-27', 2029: '02-15', 2030: '02-05' }
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return Date.UTC(y, mo - 1, da) }
function startOf(rule, y) {
  if (typeof rule === 'string') { const [m, d] = rule.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  if (rule.easter != null) return easter(y) + rule.easter * 864e5
  if (rule.cny) return CNY[y] ? startOf(CNY[y], y) : null
  if (rule.eid) return EID[y] ? startOf(EID[y], y) : null
  if (rule.nth) { const [m, n, wd] = rule.nth
    if (n > 0) { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return Date.UTC(y, m - 1, 1 + ((wd - first + 7) % 7) + (n - 1) * 7) }
    const last = new Date(Date.UTC(y, m, 0)); return Date.UTC(y, m - 1, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7)) }
  return null
}
module.exports = function festivals({ db, S, broadcast, now, WORLD }) {
  db.exec('CREATE TABLE IF NOT EXISTS fest_posts (key TEXT PRIMARY KEY, post_id INTEGER, ends INTEGER NOT NULL)')
  const state = { lastSync: 0, lastError: '', holidays: 0 }
  // resumen y foto de Wikipedia (español; si no hay, inglés). Se guarda una vez por fiesta.
  db.exec('CREATE TABLE IF NOT EXISTS fest_wiki (q TEXT PRIMARY KEY, data TEXT)')
  async function wiki(...queries) {
    for (const q of queries.filter(Boolean)) { const c = db.prepare('SELECT data FROM fest_wiki WHERE q = ?').get(q); if (c) { if (c.data) return JSON.parse(c.data); continue }
      let out = null
      for (const lang of ['es', 'en']) { try {
        const s = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&search=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'planetapp/1.0' }, signal: AbortSignal.timeout(10000) })).json()
        const title = s?.[1]?.[0]; if (!title) continue
        const d = await (await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { 'User-Agent': 'planetapp/1.0' }, signal: AbortSignal.timeout(10000) })).json()
        if (d?.extract && d.type !== 'disambiguation') { out = { about: String(d.extract).slice(0, 900), img: d.originalimage?.source || d.thumbnail?.source || null, url: d.content_urls?.desktop?.page || '', lang }; break }
      } catch { return null } }
      db.prepare('INSERT OR REPLACE INTO fest_wiki VALUES (?, ?)').run(q, out ? JSON.stringify(out) : '')
      if (out) return out }
    return null
  }
  const author = () => { let u = db.prepare("SELECT id FROM users WHERE handle = 'fiestas'").get()
    if (!u) { db.prepare("INSERT INTO users (name, handle, pass, hue, is_example, created_at, verified) VALUES (?, 'fiestas', ?, 40, 0, ?, 1)").run((S().name || 'Worbita') + ' Fiestas', 'x:' + require('crypto').randomBytes(16).toString('hex'), now()); u = db.prepare("SELECT id FROM users WHERE handle = 'fiestas'").get() } return u.id }
  const cat = () => { const c = S().categories || []; return c.some(x => x[0] === 'eventos') ? 'eventos' : (c[0]?.[0] || 'eventos') }
  const day = ms => new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  function publish(key, title, text, city, country, lat, lon, start, ends, w) {
    const row = db.prepare('SELECT post_id FROM fest_posts WHERE key = ?').get(key); if (row && db.prepare('SELECT 1 FROM posts WHERE id = ?').get(row.post_id)) { if (w) db.prepare('UPDATE posts SET info = ?, image = COALESCE(image, ?), thumb = COALESCE(thumb, ?) WHERE id = ?').run(JSON.stringify(w), w.img, w.img, row.post_id); return false }
    const img = w?.img && /^https:\/\//.test(w.img) ? w.img : null
    const p = db.prepare("INSERT INTO posts (user_id, title, text, cat, city, country, type, scene, lat, lon, expires_at, image, thumb, info, base_likes, created_at) VALUES (?, ?, ?, ?, ?, ?, 'verificada', 'concierto', ?, ?, ?, ?, ?, ?, 0, ?)").run(author(), title.slice(0, 120), text.slice(0, 2000), cat(), city.slice(0, 80), country.slice(0, 60), lat, lon, ends, img, img, w ? JSON.stringify(w) : null, now())
    db.prepare('INSERT OR REPLACE INTO fest_posts VALUES (?, ?, ?)').run(key, Number(p.lastInsertRowid), ends); return true
  }
  const list = () => [...F, ...((S().festivalsCustom || []).filter(r => r && r[0] && Number.isFinite(+r[2]) && Number.isFinite(+r[3]) && /^\d{2}-\d{2}$/.test(r[4] || '')).map(r => [String(r[0]), String(r[1] || ''), '', +r[2], +r[3], r[4], Math.max(1, Math.min(60, +r[5] || 1)), String(r[6] || '')]))]
  async function sync() {
    let n = 0; const t = now(), lead = 2 * 864e5
    if (S().festivalsOn !== false) for (const [name, city, country, lat, lon, rule, days, desc] of list()) for (const y of [new Date(t).getUTCFullYear() - 1, new Date(t).getUTCFullYear(), new Date(t).getUTCFullYear() + 1]) {
      const s = startOf(rule, y); if (s == null) continue; const e = s + days * 864e5
      if (t >= s - lead && t < e) { const when = days > 1 ? `Del ${day(s)} al ${day(e - 864e5)}` : `${day(s)}`; if (publish('f:' + name + ':' + y, name, `${t < s ? 'Pronto · ' : 'Ahora · '}${when}${desc ? ' · ' + desc : ''}`, city, country, lat, lon, s, e + 6 * 3600e3, await wiki(name + ' ' + city, name).catch(() => null))) n++ }
    }
    // festivos oficiales de todo el mundo para los próximos días (Nager.Date, gratis, sin llave)
    if (S().holidaysOn !== false) {
      try {
        const r = await fetch('https://date.nager.at/api/v3/NextPublicHolidaysWorldwide', { signal: AbortSignal.timeout(15000) })
        const hol = r.ok ? await r.json() : []
        const names = new Intl.DisplayNames(['es'], { type: 'region' })
        for (const h of hol) { const s = Date.parse(h.date + 'T00:00:00Z'); if (!(s - t < 864e5) || !h.global) continue
          const key = 'h:' + h.countryCode + ':' + h.date + ':' + h.name; const had = db.prepare('SELECT p.info FROM fest_posts f JOIN posts p ON p.id = f.post_id WHERE f.key = ?').get(key); if (had && had.info) continue
          const country = names.of(h.countryCode) || h.countryCode
          let g = null; try { g = (await WORLD.search(country))?.[0] } catch {} if (!g) continue
          if (publish(key, `Festivo en ${country}: ${h.localName || h.name}`, `${day(s)} · Día festivo nacional${h.name && h.localName !== h.name ? ' (' + h.name + ')' : ''}`, g.city || country, country, +g.lat, +g.lon, s, s + 864e5 + 6 * 3600e3, await wiki(h.localName + ' ' + country, h.localName, h.name).catch(() => null))) { n++; state.holidays++ } }
      } catch (e) { state.lastError = 'Festivos: ' + e.message }
    }
    for (const r of db.prepare('SELECT key, post_id FROM fest_posts WHERE ends < ?').all(t - 864e5)) { db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM fest_posts WHERE key = ?').run(r.key) }
    state.lastSync = t; if (n) broadcast({ type: 'post' }); return { ok: true, msg: n + ' fiestas o festivos nuevos · ' + db.prepare('SELECT COUNT(*) n FROM fest_posts').get().n + ' publicados' }
  }
  const run = () => sync().catch(e => { state.lastError = e.message })
  setTimeout(run, 45e3).unref(); setInterval(run, 6 * 3600e3).unref()
  const status = () => ({ lastSync: state.lastSync, lastError: state.lastError, builtIn: F.length,
    upcoming: (() => { const t = now(), y = new Date(t).getUTCFullYear(); return list().map(([name, city, , , , rule, days]) => { let s = startOf(rule, y); if (s != null && s + days * 864e5 < t) s = startOf(rule, y + 1); return { name, city, start: s } }).filter(x => x.start).sort((a, b) => a.start - b.start).slice(0, 15) })(),
    posted: db.prepare('SELECT p.title, p.city FROM fest_posts f JOIN posts p ON p.id = f.post_id ORDER BY f.ends').all() })
  return { sync: async () => { try { return await sync() } catch (e) { return { ok: false, msg: e.message } } }, status }
}
module.exports.startOf = startOf

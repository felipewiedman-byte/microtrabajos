// Más contenido automático en el mapa, con fuentes gratis. El servidor consulta pocas veces al día, guarda y reparte:
//  · Terremotos (USGS, sin llave): sismos de magnitud 4,5 o más de las últimas 24 h, en su punto exacto.
//  · Cartelera de cine (TMDB, llave gratis): las películas en cartelera de cada país, en su capital, con póster.
//  · Conciertos (Bandsintown, llave gratis): próximas fechas de los artistas de la lista, en su recinto exacto.
// Todo se publica como cualquier otra publicación (pin con foto), caduca solo y se puede apagar en el panel.
'use strict'
// capitales para colgar la cartelera de cada país (el cine no tiene un punto exacto)
const CAPITAL = { CO: ['Bogotá', 'Colombia', 4.711, -74.072], MX: ['Ciudad de México', 'México', 19.433, -99.133], AR: ['Buenos Aires', 'Argentina', -34.604, -58.382], CL: ['Santiago', 'Chile', -33.449, -70.669], PE: ['Lima', 'Perú', -12.046, -77.043], EC: ['Quito', 'Ecuador', -0.181, -78.468], VE: ['Caracas', 'Venezuela', 10.481, -66.904], ES: ['Madrid', 'España', 40.417, -3.704], US: ['Nueva York', 'Estados Unidos', 40.713, -74.006], BR: ['São Paulo', 'Brasil', -23.551, -46.633], UY: ['Montevideo', 'Uruguay', -34.901, -56.164], PA: ['Ciudad de Panamá', 'Panamá', 8.983, -79.517], CR: ['San José', 'Costa Rica', 9.928, -84.091], DO: ['Santo Domingo', 'República Dominicana', 18.486, -69.931], GT: ['Ciudad de Guatemala', 'Guatemala', 14.634, -90.507], BO: ['La Paz', 'Bolivia', -16.49, -68.119], PY: ['Asunción', 'Paraguay', -25.264, -57.576], GB: ['Londres', 'Reino Unido', 51.507, -0.128], FR: ['París', 'Francia', 48.857, 2.352], IT: ['Roma', 'Italia', 41.903, 12.496], DE: ['Berlín', 'Alemania', 52.52, 13.405], PT: ['Lisboa', 'Portugal', 38.722, -9.139], CA: ['Toronto', 'Canadá', 43.653, -79.383] }
const ARTISTS = ['Shakira', 'Karol G', 'Bad Bunny', 'J Balvin', 'Maluma', 'Feid', 'Carlos Vives', 'Juanes', 'Coldplay', 'Taylor Swift', 'Dua Lipa', 'The Weeknd', 'Ed Sheeran', 'Metallica', 'Bruno Mars', 'Rosalía', 'Peso Pluma', 'Romeo Santos', 'Marc Anthony', 'Luis Miguel', 'Ricardo Arjona', 'Morat', 'Sebastián Yatra', 'Camilo', 'Manuel Turizo', 'Billie Eilish', 'Imagine Dragons', 'Guns N\' Roses', 'Iron Maiden', 'Daddy Yankee']

module.exports = function extras({ db, S, secret, broadcast, now }) {
  db.exec('CREATE TABLE IF NOT EXISTS extra_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, post_id INTEGER, ends INTEGER NOT NULL)')
  const state = { quakes: { at: 0, err: '' }, cine: { at: 0, err: '' }, bit: { at: 0, err: '' } }
  const author = (handle, name, hue) => {
    let u = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle)
    if (!u) { db.prepare('INSERT INTO users (name, handle, pass, hue, is_example, created_at, verified) VALUES (?, ?, ?, ?, 0, ?, 1)').run((S().name || 'Worbita') + ' ' + name, handle, 'x:' + require('crypto').randomBytes(16).toString('hex'), hue, now()); u = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle) }
    return u.id
  }
  const cat = want => { const c = S().categories || []; return c.some(x => x[0] === want) ? want : (c[0]?.[0] || want) }
  const okUrl = u => /^https:\/\/[^\s"'<>]{5,500}$/.test(u || '') ? u : null
  const tz = () => S().dailyTZ || 'America/Bogota'
  const fecha = ms => new Date(ms).toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz() })
  // publica o actualiza una publicación ligada a un id externo (no se repite nunca)
  function upsert(id, kind, p) {
    const row = db.prepare('SELECT post_id FROM extra_items WHERE id = ?').get(id)
    if (row && db.prepare('SELECT 1 FROM posts WHERE id = ?').get(row.post_id)) { db.prepare('UPDATE posts SET title = ?, text = ?, image = COALESCE(?, image), thumb = COALESCE(?, thumb), expires_at = ? WHERE id = ?').run(p.title, p.text, p.image, p.image, p.ends, row.post_id); db.prepare('UPDATE extra_items SET ends = ? WHERE id = ?').run(p.ends, id); return 0 }
    const r = db.prepare("INSERT INTO posts (user_id, title, text, cat, city, country, type, image, thumb, scene, lat, lon, expires_at, base_likes, created_at) VALUES (?, ?, ?, ?, ?, ?, 'verificada', ?, ?, ?, ?, ?, ?, 0, ?)")
      .run(p.user, String(p.title).slice(0, 120), String(p.text).slice(0, 2000), p.cat, String(p.city || '').slice(0, 80) || 'Mundo', String(p.country || '').slice(0, 60), p.image, p.image, p.scene, p.lat, p.lon, p.ends, now())
    db.prepare('INSERT OR REPLACE INTO extra_items VALUES (?, ?, ?, ?)').run(id, kind, Number(r.lastInsertRowid), p.ends); return 1
  }
  const get = async (url, opt = {}) => { const r = await fetch(url, { ...opt, headers: { 'User-Agent': 'Worbita/1.0', ...(opt.headers || {}) }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(r.status); return r.json() }

  // ---- Terremotos (USGS): magnitud 4,5+ del último día. Sin llave. Cada 30 min.
  async function quakes() {
    if (S().quakesOn === false) return
    try {
      const d = await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'), user = author('alertas', 'Alertas', 15)
      let n = 0
      for (const f of d.features || []) {
        const [lon, lat] = f.geometry?.coordinates || [], m = +f.properties?.mag, t = +f.properties?.time; if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180) || !m || !t) continue
        const place = String(f.properties.place || '').replace(/^\d+\s*km\s+[NSEW]+\s+of\s+/i, '')
        const parts = place.split(',').map(x => x.trim()), city = parts[0] || 'Océano', country = parts[parts.length - 1] || ''
        n += upsert('q:' + f.id, 'quake', { user, cat: cat('noticias'), scene: 'ciudad', image: null, lat, lon, city, country, ends: t + 24 * 3600e3,
          title: `Sismo de magnitud ${m.toFixed(1)}${place ? ' · ' + place : ''}`, text: `${fecha(t)} · profundidad ${Math.round(f.geometry.coordinates[2] || 0)} km${m >= 6 ? ' · sismo fuerte' : ''} · fuente: USGS` })
      }
      state.quakes = { at: now(), err: '' }; if (n) broadcast({ type: 'post' })
    } catch (e) { state.quakes.err = e.message }
  }

  // ---- Cartelera de cine (TMDB): las 8 películas en cartelera de cada país elegido, una publicación por película, en la capital. Cada 12 h.
  async function cine() {
    const key = secret('tmdb', 'key'); if (!key || S().cineOn === false) return
    const auth = key.length > 60 ? { headers: { Authorization: 'Bearer ' + key } } : {}, qk = key.length > 60 ? '' : '&api_key=' + encodeURIComponent(key)
    try {
      const user = author('cine', 'Cine', 260); let n = 0
      for (const cc of (S().cineCountries || ['CO', 'MX', 'AR', 'CL', 'PE', 'ES', 'US'])) {
        const cap = CAPITAL[String(cc).toUpperCase()]; if (!cap) continue
        const d = await get(`https://api.themoviedb.org/3/movie/now_playing?language=es-ES&region=${cc}&page=1${qk}`, auth)
        ;(d.results || []).slice(0, 8).forEach((m, i) => {
          const img = m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : null
          // cada película un poquito separada de las otras, para que no queden todas en el mismo punto
          const a = i * 0.785, lat = cap[2] + Math.sin(a) * 0.012 * (1 + i / 4), lon = cap[3] + Math.cos(a) * 0.012 * (1 + i / 4)
          n += upsert(`c:${cc}:${m.id}`, 'cine', { user, cat: cat('eventos'), scene: 'ciudad', image: okUrl(img), lat, lon, city: cap[0], country: cap[1], ends: now() + 36 * 3600e3,
            title: `En cartelera: ${m.title}`, text: `${String(m.overview || '').slice(0, 300)}${m.vote_average ? ` · ★ ${(+m.vote_average).toFixed(1)}` : ''} · en cines de ${cap[1]}` })
        })
        await new Promise(r => setTimeout(r, 300))
      }
      state.cine = { at: now(), err: '' }; if (n) broadcast({ type: 'post' })
    } catch (e) { state.cine.err = e.message }
  }

  // ---- Conciertos (Bandsintown): próximas fechas (30 días) de los artistas de la lista, en su recinto. Cada 12 h.
  async function bit() {
    const app = secret('bandsintown', 'key'); if (!app || S().bitOn === false) return
    const list = (S().bitArtists?.length ? S().bitArtists : ARTISTS).slice(0, 60)
    try {
      const user = author('conciertos', 'Conciertos', 330); let n = 0
      for (const name of list) {
        let d; try { d = await get(`https://rest.bandsintown.com/artists/${encodeURIComponent(name)}/events?app_id=${encodeURIComponent(app)}&date=upcoming`) } catch { continue }
        for (const e of (Array.isArray(d) ? d : []).slice(0, 12)) {
          const v = e.venue || {}, lat = +v.latitude, lon = +v.longitude, t = Date.parse(e.datetime || ''); if (!(Math.abs(lat) <= 85) || !lat || !t || t > now() + 30 * 864e5) continue
          n += upsert('b:' + e.id, 'bit', { user, cat: cat('eventos'), scene: 'concierto', image: okUrl(e.artist?.image_url || e.artist?.thumb_url), lat, lon, city: v.city, country: v.country, ends: t + 6 * 3600e3,
            title: `${e.artist?.name || name} en concierto`, text: `${fecha(t)} · ${v.name || ''}${v.city ? ', ' + v.city : ''}${e.offers?.[0]?.url ? ' · entradas disponibles' : ''}` })
        }
        await new Promise(r => setTimeout(r, 250))
      }
      state.bit = { at: now(), err: '' }; if (n) broadcast({ type: 'post' })
    } catch (e) { state.bit.err = e.message }
  }

  // lo vencido se borra solo (y su pin desaparece del mapa)
  function clean() { for (const r of db.prepare('SELECT id, post_id FROM extra_items WHERE ends < ?').all(now())) { if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.prepare('DELETE FROM extra_items WHERE id = ?').run(r.id) } }
  const safe = fn => () => fn().catch(e => console.error('contenido extra:', e.message))
  setTimeout(safe(quakes), 25e3).unref(); setInterval(safe(quakes), 30 * 60e3).unref()
  setTimeout(safe(cine), 40e3).unref(); setInterval(safe(cine), 12 * 3600e3).unref()
  setTimeout(safe(bit), 55e3).unref(); setInterval(safe(bit), 12 * 3600e3).unref()
  setInterval(() => { try { clean(); broadcast({ type: 'post' }) } catch { /* nada */ } }, 15 * 60e3).unref()
  const status = () => ({ ...state, counts: Object.fromEntries(db.prepare('SELECT kind, COUNT(*) n FROM extra_items GROUP BY kind').all().map(r => [r.kind, r.n])) })
  return { quakes, cine, bit, status, ARTISTS, CAPITALS: Object.keys(CAPITAL) }
}

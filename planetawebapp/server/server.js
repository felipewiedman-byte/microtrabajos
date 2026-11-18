// PLANETA (planetapp): API + base de datos SQLite + archivos estáticos. Sin dependencias externas.
'use strict'
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto')
const { DatabaseSync } = require('node:sqlite')
const os = require('os')
// ---------- vigilancia: últimos errores (servidor y navegadores) y uso de CPU, para el panel «Rendimiento» ----------
const ERRS = []
const pushErr = (src, msg, extra) => { ERRS.push({ t: Date.now(), src, msg: String(msg).slice(0, 300), extra: extra ? String(extra).slice(0, 160) : '' }); if (ERRS.length > 100) ERRS.shift() }
const _consoleError = console.error.bind(console)
console.error = (...a) => { try { pushErr('servidor', a.map(x => x && x.message ? x.message : String(x)).join(' ')) } catch { /* nada */ } _consoleError(...a) }
const cpuHist = []; let cpuLast = process.cpuUsage(), cpuAt = Date.now()
setInterval(() => { const now = Date.now(), u = process.cpuUsage(cpuLast), dt = (now - cpuAt) * 1000; cpuLast = process.cpuUsage(); cpuAt = now; cpuHist.push({ t: now, cpu: Math.min(100, Math.round((u.user + u.system) / dt * 1000) / 10), rss: process.memoryUsage().rss }); if (cpuHist.length > 60) cpuHist.shift() }, 5000).unref()
// load private settings from .env next to server.js (R2 keys etc.). Never committed.
try { for (const line of require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') } } catch {}
// Las conexiones a otros servicios salen primero por IPv4: tu servidor tiene también IPv6 y, si una llave (por ejemplo la de YouTube) se restringe por IP, solo la IPv4 está en la lista
try { require('dns').setDefaultResultOrder('ipv4first') } catch { /* versión sin esta opción */ }
const R2 = require('./r2'), r2 = R2.config()
const ENV_VIDEO_MAX = +process.env.VIDEO_MAX_SECONDS || 0

const PORT = process.env.PORT || 3010
const ROOT = path.join(__dirname, 'public')
// política de contenido en modo «solo reportar»: avisa de lo que bloquearía, sin romper nada (se endurece cuando no haya avisos)
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss: blob: data:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' https://accounts.google.com/gsi/ https://www.youtube-nocookie.com https://www.youtube.com https://player.twitch.tv https://player.kick.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; report-uri /api/csp-report"
const DATA = process.env.PLANETA_DATA || path.join(__dirname, 'data')
const UPLOADS = path.join(DATA, 'uploads'), CARDS = path.join(DATA, 'cards')
fs.mkdirSync(UPLOADS, { recursive: true })

const db = new DatabaseSync(path.join(DATA, 'planeta.db'))
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -16000;
PRAGMA journal_size_limit = 16777216;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL, city TEXT NOT NULL DEFAULT 'Bogotá', hue INTEGER NOT NULL DEFAULT 160,
  is_example INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', cat TEXT NOT NULL, city TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'usuario', image TEXT, scene TEXT, base_likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at DESC);
CREATE TABLE IF NOT EXISTS cams (id INTEGER PRIMARY KEY, title TEXT NOT NULL, city TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', lat REAL NOT NULL, lon REAL NOT NULL, yt TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'video', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS walks (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, city TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL, ended_at INTEGER, last_lat REAL, last_lon REAL, last_at INTEGER, dist REAL NOT NULL DEFAULT 0, demo INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS walks_live ON walks(ended_at, last_at);
CREATE TABLE IF NOT EXISTS walk_points (walk_id INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, t INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS walk_points_w ON walk_points(walk_id, t);
CREATE TABLE IF NOT EXISTS walk_media (id INTEGER PRIMARY KEY, walk_id INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, image TEXT, thumb TEXT, video TEXT, caption TEXT, t INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS walk_msgs (id INTEGER PRIMARY KEY, walk_id INTEGER NOT NULL, user_id INTEGER NOT NULL, text TEXT NOT NULL, t INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS walk_msgs_w ON walk_msgs(walk_id, t);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, ref TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL, item TEXT NOT NULL, target_id INTEGER NOT NULL, provider TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', ext_id TEXT, created_at INTEGER NOT NULL, paid_at INTEGER);
CREATE TABLE IF NOT EXISTS stations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', lat REAL, lon REAL, genre TEXT NOT NULL DEFAULT '', stream TEXT NOT NULL, logo TEXT, website TEXT, whatsapp TEXT, paid_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS likes (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS saves (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS joins (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id, created_at);
CREATE TABLE IF NOT EXISTS room_messages (
  id INTEGER PRIMARY KEY, city TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS room_city ON room_messages(city, id);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason TEXT, created_at INTEGER NOT NULL);
`)

// add columns to existing databases
for (const col of ['lat REAL', 'lon REAL', 'video TEXT', 'thumb TEXT', 'country TEXT', 'capacity INTEGER', 'featured INTEGER NOT NULL DEFAULT 0', 'expires_at INTEGER', 'promo_until INTEGER']) { try { db.exec('ALTER TABLE posts ADD COLUMN ' + col) } catch {} }

for (const col of ['avatar TEXT', 'bio TEXT', 'lat REAL', 'lon REAL', 'country TEXT', 'email TEXT', 'verified INTEGER NOT NULL DEFAULT 0', 'biz INTEGER NOT NULL DEFAULT 0', 'biz_name TEXT', 'biz_type TEXT', 'biz_lat REAL', 'biz_lon REAL', 'biz_address TEXT', 'biz_hours TEXT', 'biz_whatsapp TEXT', 'featured_until INTEGER', 'biz_cover TEXT', 'birth TEXT', 'biz_flag INTEGER NOT NULL DEFAULT 0', 'biz_website TEXT']) { try { db.exec('ALTER TABLE users ADD COLUMN ' + col) } catch {} }
// negocios: «biz_until» = hasta cuándo aparece en el mapa (pago o activación del administrador). La primera vez
// que se crea la columna, los negocios que ya existen quedan activos 30 días (los de ejemplo, sin vencimiento) para que no desaparezcan de golpe.
const BIZ_FOREVER = 253402300799000
let bizListCache = null   // lista de negocios activos (se renueva cada 20 s o al cambiar un negocio)
try { db.exec('ALTER TABLE users ADD COLUMN biz_until INTEGER'); db.prepare('UPDATE users SET biz_until = ? WHERE biz = 1 AND is_example = 0').run(Date.now() + 30 * 864e5); db.prepare('UPDATE users SET biz_until = ? WHERE biz = 1 AND is_example = 1').run(BIZ_FOREVER) } catch { /* ya existe */ }
const bizOn = u => !!u && !!u.biz && (u.biz_until || 0) > Date.now()
// nombres que parecen de empresa (palabras completas, para no confundir a las personas): la cuenta se crea, pero no puede publicar hasta que se active como negocio o la revises
const BIZ_WORDS = /(^|[^a-záéíóúñ])(s\.?a\.?s\.?|s\.?a\.?|ltda|ltd|inc|llc|corp|gmbh|restaurante|restaurant|tienda|store|shop|boutique|hotel|hostal|hostel|cafeter[ií]a|pizzer[ií]a|panader[ií]a|droguer[ií]a|farmacia|cl[ií]nica|consultorio|inmobiliaria|constructora|agencia|ferreter[ií]a|supermercado|ventas|tours?|travel|oficial)([^a-záéíóúñ]|$)/i
// sitio web del negocio: solo http o https (se abre en pestaña nueva); si no tiene esquema se le pone https://
const cleanUrl = v => { v = String(v || '').trim().slice(0, 200); if (!v) return ''; if (!/^https?:\/\//i.test(v)) v = 'https://' + v; try { const u = new URL(v); return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.href : '' } catch { return '' } }
const bizLike = name => BIZ_WORDS.test(String(name || ''))
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL')
db.exec(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  text TEXT, read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, read, id DESC);
CREATE TABLE IF NOT EXISTS follows (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, value));
CREATE INDEX IF NOT EXISTS follows_value ON follows(kind, value);`)
db.exec(`
CREATE INDEX IF NOT EXISTS likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS saves_user ON saves(user_id);
CREATE INDEX IF NOT EXISTS joins_post ON joins(post_id);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS comments_created ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, read_at);
CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id, created_at);
CREATE INDEX IF NOT EXISTS posts_city ON posts(city);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS users_biz_geo ON users(biz, biz_lat, biz_lon);
CREATE INDEX IF NOT EXISTS posts_expires ON posts(expires_at);
CREATE INDEX IF NOT EXISTS saves_post ON saves(post_id);
CREATE INDEX IF NOT EXISTS reports_post ON reports(post_id);
CREATE INDEX IF NOT EXISTS reports_user ON reports(user_id);
CREATE INDEX IF NOT EXISTS notif_post ON notifications(post_id);
CREATE INDEX IF NOT EXISTS notif_actor ON notifications(actor_id);
CREATE INDEX IF NOT EXISTS comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS room_msgs_user ON room_messages(user_id);
CREATE INDEX IF NOT EXISTS pwreset_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS walk_points_t ON walk_points(t);
CREATE INDEX IF NOT EXISTS sessions_created ON sessions(created_at);
`)

const ADMIN = require('./admin').init(db, DATA)
// envío de correos (recuperar contraseña) con Brevo o Resend: la llave y el remitente se ponen en el panel → Pagos y Google → Correo
async function sendMail(to, subject, html, text) {
  const sec = f => ADMIN.secret('correo', f), pv = (sec('provider') || 'brevo').toLowerCase(), key = sec('key'), from = sec('from'), fromName = sec('fromName') || S().name || 'Worbita'
  if (!key || !from) throw new Error('correo sin configurar')
  const r = pv === 'resend'
    ? await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], subject, html, text }), signal: AbortSignal.timeout(15000) })
    : await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ sender: { name: fromName, email: from }, to: [{ email: to }], subject, htmlContent: html, textContent: text }), signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error((pv === 'resend' ? 'Resend ' : 'Brevo ') + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200))
}
const WORLD = require('./world')(db, ADMIN)
const S = () => ADMIN.settings()
const PUSH = require('./push')({ db, DATA, S })
function notify(userId, type, actorId, postId, text) {
  if (!userId || userId === actorId) return
  const r = db.prepare('INSERT INTO notifications (user_id, type, actor_id, post_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, type, actorId, postId ?? null, text ?? null, Date.now())
  broadcast({ type: 'notif', id: Number(r.lastInsertRowid) }, [userId])
  PUSH.notify(userId, type, actorId, postId, text)
}
// ---------- ciudad viva: pulso de una ciudad (todo cacheado en memoria: 30 s datos, 15 min clima) ----------
const pulseCache = new Map(), wxCache = new Map()
async function weatherFor(city, lat, lon) {
  const c = wxCache.get(city); if (c && c.t > Date.now() - (c.v ? 15 * 60e3 : 2 * 60e3)) return c.v
  let v = null
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${(+lat).toFixed(2)}&longitude=${(+lon).toFixed(2)}&current=temperature_2m,weather_code,wind_speed_10m,is_day`, { signal: AbortSignal.timeout(4000) })
    const j = r.ok ? (await r.json()).current : null
    if (j) v = { temp: Math.round(j.temperature_2m), code: j.weather_code, wind: Math.round(j.wind_speed_10m), day: !!j.is_day }
  } catch {}
  wxCache.set(city, { t: Date.now(), v }); if (wxCache.size > 300) wxCache.delete(wxCache.keys().next().value)
  return v
}
async function cityPulse(city) {
  const hit = pulseCache.get(city); if (hit && hit.t > Date.now() - 30e3) return hit.v
  const t = now(), since = t - 864e5
  const row = db.prepare("SELECT COUNT(*) n, SUM(type = 'directo') live, AVG(lat) lat, AVG(lon) lon FROM posts WHERE city = ? AND created_at > ? AND (expires_at IS NULL OR expires_at > ?)").get(city, since, t)
  const top = db.prepare('SELECT cat, COUNT(*) n FROM posts WHERE city = ? AND created_at > ? AND (expires_at IS NULL OR expires_at > ?) GROUP BY cat ORDER BY n DESC LIMIT 3').all(city, since, t)
  const ev = db.prepare("SELECT id, title FROM posts WHERE city = ? AND cat = 'eventos' AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1").get(city, t)
  const radios = db.prepare('SELECT COUNT(*) n FROM stations WHERE lower(city) = lower(?) AND paid_until > ?').get(city, t).n
  const ll = CITY_LL[city] || (row.lat != null ? [row.lat, row.lon] : null)
  const weather = ll ? await weatherFor(city, ll[0], ll[1]) : null
  const v = { city, posts: row.n, live: row.live || 0, top, event: ev || null, radios, weather, at: t }
  pulseCache.set(city, { t, v }); if (pulseCache.size > 300) pulseCache.delete(pulseCache.keys().next().value)
  return v
}
// ---------- moderación automática: ritmo por persona + filtro de spam + palabras prohibidas (panel → Configuración) ----------
const RATE = { post: null, comment: [15, 10 * 60e3], dm: [40, 10 * 60e3], room: [25, 10 * 60e3] }
const plain = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
function spamCheck(me, kind, ...texts) {
  if (me.role === 'admin') return null
  const r = RATE[kind]; if (r && limited(kind + ':' + me.id, r[0], r[1])) return [429, 'Estás escribiendo muy rápido. Espera unos minutos.']
  const t = texts.filter(Boolean).join(' ')
  if ((t.match(/https?:\/\/|www\./gi) || []).length > 2) return [400, 'Demasiados enlaces. Deja máximo 2.']
  if (/(.)\1{14,}/u.test(t)) return [400, 'El texto tiene demasiados caracteres repetidos.']
  const bad = String(S().bannedWords || '').split(/[\n,]+/).map(w => plain(w).trim()).filter(w => w.length >= 2)
  if (bad.length) { const low = plain(t); if (bad.some(w => low.includes(w))) return [400, 'Tu mensaje contiene palabras que no están permitidas.'] }
  return null
}
// tamaño de una carpeta (con tope de archivos y caché de 5 min para no gastar disco ni CPU)
const sizeCache = new Map()
async function dirSize(dir) {
  const c = sizeCache.get(dir); if (c && c.t > Date.now() - 5 * 60e3) return c.v
  let bytes = 0, files = 0
  const walk = async d => { for (const e of await fs.promises.readdir(d, { withFileTypes: true }).catch(() => [])) { if (files > 200000) return; const f = path.join(d, e.name); if (e.isDirectory()) await walk(f); else { const st = await fs.promises.stat(f).catch(() => null); if (st) { bytes += st.size; files++ } } } }
  await walk(dir); const v = { bytes, files }; sizeCache.set(dir, { t: Date.now(), v }); return v
}
const fileBytes = f => { try { return fs.statSync(f).size } catch { return 0 } }
async function healthReport() {
  const m = process.memoryUsage(), dbBase = path.join(DATA, 'planeta.db'), last = cpuHist[cpuHist.length - 1]
  const cnt = sql => { try { return db.prepare(sql).get().n } catch { return 0 } }
  const [up, tl] = await Promise.all([dirSize(UPLOADS), dirSize(TILES)])
  return {
    now: Date.now(), uptime: Math.round(process.uptime()), node: process.version,
    mem: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external }, sys: { total: os.totalmem(), free: os.freemem(), load: os.loadavg(), cpus: os.cpus().length },
    cpu: last ? last.cpu : 0, history: cpuHist.map(h => ({ t: h.t, cpu: h.cpu, rss: h.rss })),
    db: { bytes: fileBytes(dbBase) + fileBytes(dbBase + '-wal'), posts: cnt('SELECT COUNT(*) n FROM posts'), users: cnt('SELECT COUNT(*) n FROM users'), sessions: cnt('SELECT COUNT(*) n FROM sessions'), push: cnt('SELECT COUNT(*) n FROM push_subs') },
    files: { uploads: up, tiles: tl, storage: r2 ? 'Cloudflare R2' : 'Disco del servidor' },
    live: { connected: clients.size, caches: { ciudad: pulseCache.size, lugares: placesCache.size, estaticos: gzCache.size, estaticosBytes: gzBytes } },
    errors: ERRS.slice(-50).reverse(),
  }
}
// «Optimizar»: no borra publicaciones ni datos de usuarios; compacta la base, libera cachés y limpia mapas viejos y sesiones vencidas
async function optimize() {
  const before = { db: fileBytes(path.join(DATA, 'planeta.db')) + fileBytes(path.join(DATA, 'planeta.db-wal')), rss: process.memoryUsage().rss }
  const did = []
  try { const n = db.prepare('DELETE FROM sessions WHERE created_at < ?').run(now() - 90 * 864e5).changes; did.push(`${n} sesiones vencidas borradas`) } catch (e) { did.push('sesiones: ' + e.message) }
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.exec('PRAGMA optimize'); db.exec('VACUUM'); did.push('base de datos compactada') } catch (e) { did.push('base de datos: ' + e.message) }
  pulseCache.clear(); wxCache.clear(); placesCache.clear(); bizListCache = null; gzCache.clear(); gzBytes = 0; sizeCache.clear(); did.push('cachés en memoria liberadas')
  try { await cleanTiles(); did.push('mapas sin usar en 30 días eliminados') } catch { /* nada */ }
  if (typeof global.gc === 'function') { global.gc(); did.push('memoria recolectada') }
  const after = { db: fileBytes(path.join(DATA, 'planeta.db')) + fileBytes(path.join(DATA, 'planeta.db-wal')), rss: process.memoryUsage().rss }
  return { did, before, after }
}
const videoMax = () => ENV_VIDEO_MAX || +S().videoMaxSeconds || 60

// ---------- helpers ----------
const now = () => Date.now()
// límite de intentos por IP (login/registro): evita fuerza bruta y que scrypt sature el servidor
const hits = new Map()
// IP real: Apache añade la del visitante AL FINAL de x-forwarded-for; las anteriores las puede inventar cualquiera (evitaría los límites)
const ipOf = req => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean); return x[x.length - 1] || req.socket.remoteAddress || '?' }
// login: solo cuentan los intentos FALLIDOS (blocked/strike); registro: limited cuenta todos
const strike = (key, win) => { const t = Date.now(); let h = hits.get(key); if (!h || h.t < t) { h = { t: t + win, n: 0 }; hits.set(key, h) } h.n++ }
const blocked = (key, max) => { const h = hits.get(key); return !!h && h.t > Date.now() && h.n >= max }
// ---------- «Personas en el mapa»: solo quien lo activa; todo en memoria (nada en la base de datos) ----------
const HERE_TTL = 4 * 60e3, HERE_MAX = 20000
const here = new Map()                 // id → { id, name, handle, avatar, hue, lat, lon, cc, t }
const hereCache = new Map()            // respuesta ya calculada por zona (10 s)
const hereClean = setInterval(() => { const old = Date.now() - HERE_TTL; for (const [k, v] of here) if (v.t < old) here.delete(k); for (const [k, v] of hereCache) if (v.t < Date.now() - 10e3) hereCache.delete(k) }, 60e3); hereClean.unref?.()
const hereView = (qs, fresh) => {
  let s = +qs.get('s'), n = +qs.get('n'), w = +qs.get('w'), e = +qs.get('e'), z = Math.max(0, Math.min(18, Math.floor(+qs.get('z') || 2)))
  if (![s, n, w, e].every(Number.isFinite)) return null
  const step = Math.max(0.05, 40 / 2 ** z); s = Math.floor(Math.max(-90, s) / step) * step; n = Math.ceil(Math.min(90, n) / step) * step; w = Math.floor(Math.max(-180, w) / step) * step; e = Math.ceil(Math.min(180, e) / step) * step
  const key = [s, n, w, e, z].map(x => +x.toFixed(3)).join('|'), hit = fresh ? null : hereCache.get(key); if (hit) return hit.v
  const inb = []; for (const v of here.values()) if (v.lat >= s && v.lat <= n && v.lon >= w && v.lon <= e) inb.push(v)
  let out
  if (z >= 8 && (z >= 12 || inb.length <= 150)) out = { singles: inb.slice(0, 300).map(v => ({ id: v.id, name: v.name, handle: v.handle, avatar: v.avatar, hue: v.hue, lat: v.lat, lon: v.lon, cc: v.cc })), groups: [], total: inb.length }
  else {
    const cell = 360 / 2 ** z / 6, g = new Map()
    for (const v of inb) { const k = Math.floor(v.lat / cell) + ':' + Math.floor(v.lon / cell); let c = g.get(k); if (!c) { c = { n: 0, la: 0, lo: 0, cc: {}, one: v }; g.set(k, c) } c.n++; c.la += v.lat; c.lo += v.lon; if (v.cc) c.cc[v.cc] = (c.cc[v.cc] || 0) + 1 }
    const singles = [], groups = []
    for (const c of g.values()) { if (c.n === 1 && z >= 8) { const v = c.one; singles.push({ id: v.id, name: v.name, handle: v.handle, avatar: v.avatar, hue: v.hue, lat: v.lat, lon: v.lon, cc: v.cc }) } else groups.push({ lat: +(c.la / c.n).toFixed(4), lon: +(c.lo / c.n).toFixed(4), n: c.n, cc: Object.entries(c.cc).sort((a, b) => b[1] - a[1])[0]?.[0] || '' }) }
    out = { singles: singles.slice(0, 200), groups: groups.slice(0, 200), total: inb.length }
  }
  if (!fresh) hereCache.set(key, { t: Date.now(), v: out }); return out
}
// Tarjeta del partido para la vista previa al compartir el enlace (1200x630). La crea el navegador de quien comparte y se guarda aquí.
const jpegDims = b => { if (b.length < 12 || b[0] !== 0xFF || b[1] !== 0xD8) return null; let i = 2; while (i + 9 < b.length) { if (b[i] !== 0xFF) { i++; continue } const mk = b[i + 1]; if (mk >= 0xC0 && mk <= 0xC3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; if (mk === 0xD8 || mk === 0x01 || (mk >= 0xD0 && mk <= 0xD7)) { i += 2; continue } i += 2 + b.readUInt16BE(i + 2) } return null }
const cardFile = id => path.join(CARDS, (+id) + '.jpg')
// dirección pública de la web: la configurada en el panel (https://…); si no hay, la del encabezado, solo si tiene forma de dominio (evita envenenar la caché con un Host falso)
const HOST_OK = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/i
const portalOrigin = req => {
  try { const cfg = String(ADMIN.secret('correo', 'siteUrl') || '').replace(/\/+$/, ''); if (/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(cfg)) return cfg } catch { /* sin configurar */ }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  return (req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http') + '://' + (HOST_OK.test(host) ? host : 'localhost')
}
const smCache = new Map()   // mapa del sitio ya armado
let portalBytes = 0   // tamaño aproximado de la caché de páginas (tope 40 MB)
const portalCache = new Map()   // páginas del portal ya armadas: se reutilizan unos segundos (muchas visitas a la vez = una sola consulta)
async function storeMatchCard(mid, tok, cur, b) {   // guarda la imagen única del partido (R2 o disco)
  if (r2) {
    const key = `cards/m${tok}-${Math.floor(now() / 1000)}.jpg`, old = db.prepare('SELECT key FROM match_cards WHERE mid = ?').get(mid), pub = await R2.put(r2, key, b, 'image/jpeg')
    db.prepare('INSERT INTO match_cards (mid, key, url, k, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(mid) DO UPDATE SET key = excluded.key, url = excluded.url, k = excluded.k, at = excluded.at').run(mid, key, pub, cur, now())
    if (old && old.key && old.key !== key) R2.del(r2, old.key).catch(() => {})
    return
  }
  const f = mcardFile(tok); fs.mkdirSync(CARDS, { recursive: true }); const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, b); fs.renameSync(tmp, f)
  db.prepare('INSERT INTO match_cards (mid, key, url, k, at) VALUES (?, \'\', NULL, ?, ?) ON CONFLICT(mid) DO UPDATE SET url = NULL, k = excluded.k, at = excluded.at').run(mid, cur, now())
}
const mcardFile = tok => path.join(CARDS, 'm' + tok + '.jpg')   // tarjetas de los partidos del portal (e123 / s45)
// con Cloudflare R2 la tarjeta del partido vive allá (nombre con fecha para que la caché de Cloudflare nunca muestre una vieja); sin R2, en el disco
db.exec('CREATE TABLE IF NOT EXISTS og_cards (post_id INTEGER PRIMARY KEY, key TEXT NOT NULL, url TEXT NOT NULL, at INTEGER NOT NULL)')
db.exec('CREATE TABLE IF NOT EXISTS post_gone (post_id INTEGER PRIMARY KEY, h TEXT, a TEXT, ko INTEGER, title TEXT, txt TEXT, city TEXT, country TEXT)')   // partidos del mapa ya terminados: sus enlaces siguen funcionando
const cardInfo = id => { if (r2) { const r = db.prepare('SELECT url, at FROM og_cards WHERE post_id = ?').get(+id); return r ? { url: r.url, at: r.at } : null } try { const st = fs.statSync(cardFile(id)); return { url: null, at: st.mtimeMs } } catch { return null } }
const limited = (key, max, win) => { const t = Date.now(); let h = hits.get(key); if (!h || h.t < t) { h = { t: t + win, n: 0 }; hits.set(key, h) } return ++h.n > max }
// scrypt asíncrono: no bloquea el servidor mientras se calcula la contraseña
const scryptAsync = (p, salt) => new Promise((ok, ko) => crypto.scrypt(p, salt, 64, (e, k) => e ? ko(e) : ok(k)))
const hashPass = async (p, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + (await scryptAsync(p, salt)).toString('hex')
const checkPass = async (p, stored) => { const [salt, h] = String(stored).split(':'); if (!salt || !h) return false; const a = Buffer.from(h, 'hex'), b = await scryptAsync(p, salt); return a.length === b.length && crypto.timingSafeEqual(a, b) }
const CATS = { includes: c => S().categories.some(x => x[0] === c) }
const CITY_LL = { 'Bogotá': [4.71, -74.07], 'Medellín': [6.24, -75.57], 'Cartagena': [10.39, -75.51], 'Cali': [3.45, -76.53], 'Ciudad de México': [19.43, -99.13], 'Buenos Aires': [-34.6, -58.38], 'Lima': [-12.05, -77.04], 'Madrid': [40.42, -3.7], 'Barcelona': [41.39, 2.17], 'París': [48.86, 2.35], 'Lisboa': [38.72, -9.14], 'Nueva York': [40.71, -74], 'Tokio': [35.69, 139.69], 'Seúl': [37.57, 126.98], 'Ciudad del Cabo': [-33.92, 18.42], 'Reikiavik': [64.15, -21.9], 'Sídney': [-33.87, 151.21], 'Marrakech': [31.63, -7.99] }
const nearestCity = (lat, lon) => Object.entries(CITY_LL).map(([c, [a, o]]) => [c, (a - lat) ** 2 + ((o - lon) * Math.cos(lat * Math.PI / 180)) ** 2]).sort((x, y) => x[1] - y[1])[0][0]
const placesCache = new Map(), cachePlaces = (k, v) => { placesCache.set(k, { t: Date.now(), v }); if (placesCache.size > 2000) placesCache.delete(placesCache.keys().next().value) }
const BIZ_TYPES = { includes: t => S().bizTypes.some(x => x[0] === t) }
const CITY_COUNTRY = { 'Bogotá': 'Colombia', 'Medellín': 'Colombia', 'Cartagena': 'Colombia', 'Cali': 'Colombia', 'Ciudad de México': 'México', 'Buenos Aires': 'Argentina', 'Lima': 'Perú', 'Madrid': 'España', 'Barcelona': 'España', 'París': 'Francia', 'Lisboa': 'Portugal', 'Nueva York': 'Estados Unidos', 'Tokio': 'Japón', 'Seúl': 'Corea del Sur', 'Ciudad del Cabo': 'Sudáfrica', 'Reikiavik': 'Islandia', 'Sídney': 'Australia', 'Marrakech': 'Marruecos' }
const CITIES = ['Bogotá', 'Medellín', 'Cartagena', 'Cali', 'Ciudad de México', 'Buenos Aires', 'Lima', 'Madrid', 'Barcelona', 'París', 'Lisboa', 'Nueva York', 'Tokio', 'Seúl', 'Ciudad del Cabo', 'Reikiavik', 'Sídney', 'Marrakech']
// fill country/coords for rows created before these columns existed
for (const [c, [la, lo]] of Object.entries(CITY_LL)) { db.prepare('UPDATE posts SET country = ? WHERE city = ? AND country IS NULL').run(CITY_COUNTRY[c], c); db.prepare('UPDATE posts SET lat = ?, lon = ? WHERE city = ? AND lat IS NULL').run(la, lo, c); db.prepare('UPDATE users SET lat = ?, lon = ?, country = ? WHERE city = ? AND lat IS NULL').run(la, lo, CITY_COUNTRY[c], c) }
// eslint-disable-next-line no-control-regex
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)

function send(res, code, body, headers = {}) {
  const json = JSON.stringify(body), h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', ...headers }
  // JSON grande (listas de publicaciones, panel): se comprime para gastar menos ancho de banda
  if (json.length > 1500 && /\bgzip\b/.test(res.req?.headers['accept-encoding'] || '')) {
    return require('zlib').gzip(json, { level: 6 }, (e, buf) => { if (res.writableEnded || res.destroyed) return; if (e) { res.writeHead(code, h); return res.end(json) } res.writeHead(code, { ...h, 'Content-Encoding': 'gzip', 'Content-Length': buf.length }); res.end(buf) })
  }
  res.writeHead(code, h)
  res.end(json)
}
// 256 KB por defecto (login, publicar texto, ajustes…); solo la publicación con foto en base64 pide hasta 9 MB
// al pasarse del límite se responde 413 y 300 ms después se corta lo que siga llegando
function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error(limit > 1024 * 1024 ? 'La foto es demasiado grande (máximo 6 MB).' : 'Los datos enviados son demasiado grandes.'), { code: 413 })); req.pause(); setTimeout(() => req.destroy(), 300).unref() } else chunks.push(c) })
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}) } catch { reject(Object.assign(new Error('Datos inválidos.'), { code: 400 })) } })
    req.on('error', reject)
  })
}
function currentUser(req) {
  const m = /(?:^|;\s*)planeta_s=([a-f0-9]{64})/.exec(req.headers.cookie || '')
  if (!m) return null
  return db.prepare('SELECT u.id, u.name, u.handle, u.city, u.hue, u.role, u.avatar, u.bio, u.lat, u.lon, u.country, u.biz, u.biz_name, u.biz_type, u.biz_lat, u.biz_lon, u.biz_address, u.biz_hours, u.biz_whatsapp, u.featured_until, u.biz_cover, u.birth, u.biz_until, u.biz_flag, u.biz_website FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.created_at > ? AND u.suspended = 0').get(m[1], Date.now() - 90 * 864e5) || null
}
function startSession(res, userId, extra) {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now())
  return { 'Set-Cookie': `planeta_s=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${res.req?.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`, ...extra }
}
let TV = null, tilesCount = null, stCache = null, camsCache = null, SPORTS = null, WDEV = null, EXTRAS = null, FEST = null, SITES = null
// fecha del reto del día en la zona horaria elegida en el panel
const dayKey = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: S().dailyTZ || 'America/Bogota' }) } catch { return new Date().toISOString().slice(0, 10) } }
// YouTube: video en vivo (watch, live, youtu.be, embed, shorts) o canal (su transmisión en vivo actual)
function parseYouTube(u) {
  u = String(u || '').trim(); let mm
  if ((mm = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(u))) return { kind: 'video', id: mm[1] }
  if ((mm = /youtube\.com\/channel\/(UC[\w-]{22})/.exec(u))) return { kind: 'channel', id: mm[1] }
  if (/^[\w-]{11}$/.test(u)) return { kind: 'video', id: u }
  return null
}
const PAY = require('./pay')(ADMIN.secret)

// Emisoras de Colombia con enlace de audio verificado desde el servidor (directorio radio-browser.info). Se cargan con un clic desde Panel → Emisoras.
const ST = 'https://playerservices.streamtheworld.com/api/livestream-redirect/'
try { db.exec('ALTER TABLE stations ADD COLUMN cc TEXT') } catch {}
const PACK_CO = [
  ['Caracol Radio', 'Bogotá', 4.711, -74.0721, 'Noticias y deportes', ST + 'CARACOL_RADIOAAC.aac', 'https://caracol.com.co'],
  ['Caracol Radio Barranquilla', 'Barranquilla', 10.9685, -74.7813, 'Noticias y deportes', ST + 'CR_BARRANQ.mp3', 'https://caracol.com.co'],
  ['Blu Radio', 'Bogotá', 4.711, -74.0721, 'Noticias y deportes', ST + 'BLURADIO.mp3', 'https://www.bluradio.com'],
  ['Blu Radio Medellín', 'Medellín', 6.2442, -75.5812, 'Noticias y deportes', ST + 'BLU_MEDELLIN_ADP.aac', 'https://www.bluradio.com'],
  ['W Radio', 'Bogotá', 4.711, -74.0721, 'Noticias y deportes', ST + 'WRADIOAAC.aac', 'https://www.wradio.com.co'],
  ['La Radio Deportes', '', null, null, 'Deportes', 'https://samuel.i-radio.co:9000/radiodeportes', ''],
]
// Emisoras deportivas de un país, sacadas del directorio abierto radio-browser.info: las más escuchadas con etiqueta deportes/sports/fútbol.
// Solo enlaces https que un navegador puede reproducir directo (MP3/AAC/OGG; se excluyen los HLS .m3u8). Quedan activas 1 año.
const REG = (() => { try { return new Intl.DisplayNames(['es'], { type: 'region' }) } catch { return null } })()
// Solo emisoras cuyo NOMBRE es deportivo (así no entran las de noticias, música o inglés con la etiqueta «sports»); sin repetidas
// ni canales de un partido o temporales. Si el nombre no dice «deportes», la emisora no se carga sola: se agrega a mano o por regla.
const SPORT_NAME = /sport|deport|f[uú]tbol|footbal|soccer|calcio|fu(ss|ß)ball|estadio|stadium|\bliga\b|\bespn\b|\bmarca\b|\bgol\b|esport|desporto|sportradio|football/i
const TEMP = /\b(spiel|adhoc|ad hoc|backup|test|prueba|canal ?\d|stream ?\d|webcam)\b|\b(nfl|nba|mlb|nhl)\b|radio network/i
const NOT_SPORT = /\bmusic\b|m[uú]sica|\bhits\b|slow english/i
// categorías simples para los filtros de la radio (en vez de decenas de etiquetas sueltas)
const genreOf = (name, tags) => { const t = (name + ' ' + tags).toLowerCase()
  if (SPORT_NAME.test(name) || /sport|deport|futbol|football|soccer/.test(String(tags).toLowerCase())) return 'Deportes'
  if (/news|noticia|talk|informaci|actualidad|politic/.test(t)) return 'Noticias'
  if (/relig|christian|cristian|catol|gospel|islam|church|iglesia|evangel/.test(t)) return 'Religiosa'
  if (/pop|rock|salsa|reggaeton|music|musica|m[uú]sica|hits|dance|electr|jazz|latin|classic|hip hop|rap|reggae|vallenato|bachata|cumbia|merengue|folk|country|oldies|retro|80s|90s|blues|metal|trap|house|lounge/.test(t)) return 'Música'
  return 'Variada' }
// Direcciones que el servidor NUNCA debe visitar al bajar una imagen de un tercero (locales, redes privadas, nube/metadatos)
const privateIp = ip => {
  ip = String(ip).toLowerCase()
  // IPv4 dentro de IPv6 (::ffff:127.0.0.1, que el navegador normaliza a ::ffff:7f00:1): se revisa como la IPv4 que es
  const m = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(ip)
  if (m) ip = m[1] || [parseInt(m[2], 16) >> 8, parseInt(m[2], 16) & 255, parseInt(m[3], 16) >> 8, parseInt(m[3], 16) & 255].join('.')
  if (ip.includes(':')) return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^(::|2001:db8)/.test(ip)
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some(n => !(n >= 0 && n <= 255))) return true
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && (p[1] === 168 || (p[1] === 0 && p[2] === 0))) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 198 && (p[1] === 18 || p[1] === 19))
}
async function publicUrl(u) {
  let x; try { x = new URL(u) } catch { return false }
  if (x.protocol !== 'https:' || x.username || x.password || (x.port && x.port !== '443')) return false
  const h = x.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false
  if (/^[\d.]+$/.test(h) || h.includes(':')) return !privateIp(h)
  try { const r = await require('dns').promises.lookup(h, { all: true }); return r.length > 0 && r.every(a => !privateIp(a.address)) } catch { return false }
}
// guarda el logo de la emisora (Cloudflare R2 si está configurado, si no el disco del servidor); solo imágenes PNG/JPG/WEBP pequeñas;
// solo direcciones públicas (cada salto de redirección se vuelve a comprobar); si algo falla, la emisora queda sin logo
// Con Cloudflare R2 configurado TODO archivo va allá: se reintenta una vez y, si aun así falla, se avisa (nunca queda guardado en el disco del servidor)
const putR2 = async (key, buf, type) => { try { return await R2.put(r2, key, buf, type) } catch { await new Promise(r => setTimeout(r, 700)); return await R2.put(r2, key, buf, type) } }
// copia a Cloudflare R2 una imagen pequeña de YouTube (logo de un canal): solo de los servidores de imágenes de Google/YouTube
async function putExternalImage(url, folder) {
  const x = new URL(url); if (x.protocol !== 'https:' || !/(^|\.)(googleusercontent\.com|ggpht\.com|ytimg\.com|jtvnw\.net|kick\.com)$/.test(x.hostname)) throw new Error('imagen no permitida')
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error('imagen ' + r.status)
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()]; if (!ext) throw new Error('formato no permitido')
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 200 || buf.length > 400e3) throw new Error('tamaño no permitido')
  const id = crypto.randomBytes(12).toString('hex')
  if (r2) return await putR2(`media/${folder}/${id}.${ext}`, buf, 'image/' + (ext === 'jpg' ? 'jpeg' : ext))
  fs.writeFileSync(path.join(UPLOADS, id + '.' + ext), buf); return '/uploads/' + id + '.' + ext
}
async function saveLogo(url) {
  try {
    let cur = String(url || ''), r = null
    for (let hop = 0; hop < 4; hop++) {
      if (!/^https:\/\/[^\s"'<>]{4,300}$/.test(cur) || !(await publicUrl(cur))) return null
      r = await fetch(cur, { headers: { 'User-Agent': 'planetapp/1.0' }, redirect: 'manual', signal: AbortSignal.timeout(5000) })
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { try { cur = new URL(r.headers.get('location'), cur).href } catch { return null } r = null; continue }
      break
    }
    if (!r || !r.ok) return null
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()]; if (!ext) return null
    if (+r.headers.get('content-length') > 200e3) return null
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 200 || buf.length > 200e3) return null
    const id = crypto.randomBytes(12).toString('hex')
    // con Cloudflare R2 configurado el logo va allá (como las fotos de la web); solo sin R2 (instalación de pruebas) queda en el disco
    if (r2) { try { return await putR2(`media/${new Date().toISOString().slice(0, 7)}/${id}.${ext}`, buf, 'image/' + (ext === 'jpg' ? 'jpeg' : ext)) } catch (e) { console.error('[emisoras] R2 no guardó el logo:', e.message); return null } }
    fs.writeFileSync(path.join(UPLOADS, id + '.' + ext), buf); return '/uploads/' + id + '.' + ext
  } catch { return null }
}
// busca el icono en la web de la emisora (apple-touch-icon, icono PNG o imagen og:image) y lo guarda con saveLogo; mismas protecciones: solo https público, saltos revisados
async function logoFromSite(site) {
  try {
    let cur = String(site || '').replace(/^http:\/\//i, 'https://'), r = null
    for (let hop = 0; hop < 4; hop++) {
      if (!(await publicUrl(cur))) return null
      r = await fetch(cur, { headers: { 'User-Agent': 'planetapp/1.0', Accept: 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(6000) })
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { try { cur = new URL(r.headers.get('location'), cur).href.replace(/^http:\/\//i, 'https://') } catch { return null } r = null; continue }
      break
    }
    if (!r || !r.ok || !/html/i.test(r.headers.get('content-type') || '')) return null
    const html = (await r.text()).slice(0, 300e3), cand = []
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      const t = m[0], rel = (/rel=["']([^"']+)["']/i.exec(t) || [])[1] || '', href = (/href=["']([^"']+)["']/i.exec(t) || [])[1]
      if (!href) continue
      if (/apple-touch-icon/i.test(rel)) cand.unshift(href); else if (/\bicon\b/i.test(rel) && /\.(png|jpe?g|webp)(\?|$)/i.test(href)) cand.push(href)
    }
    const og = /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html)
    if (og) cand.push(og[1])
    for (const c of cand.slice(0, 4)) { let u; try { u = new URL(c.replace(/&amp;/g, '&'), cur).href } catch { continue } const l = await saveLogo(u); if (l) return l }
  } catch { /* sin logo */ }
  return null
}
const logoTried = new Set()
// ---- Directorio abierto de emisoras (radio-browser.info): UN solo lugar para consultarlo y para decidir qué emisoras sirven ----
async function dirSearch(params, timeout = 8000) {
  for (const host of ['de1', 'nl1', 'at1']) {
    try { const r = await fetch(`https://${host}.api.radio-browser.info/json/stations/search?${params}`, { headers: { 'User-Agent': 'planetapp/1.0' }, signal: AbortSignal.timeout(timeout) }); if (r.ok) return await r.json() } catch { /* se prueba con el siguiente servidor */ }
  }
  return null
}
// una emisora sirve si su enlace es https directo (sin .m3u8 ni HLS), de un formato que el navegador reproduce, y su nombre no es de canal temporal ni de adultos
const PLAYABLE = /^(mp3|aac|aac\+|ogg|ogg vorbis)$/i
const playable = x => { const u = String(x.url_resolved || ''), nm = String(x.name || ''); return /^https:\/\/[^\s"'<>]{4,400}$/.test(u) && !/\.m3u8?(\?|$)/i.test(u) && !x.hls && PLAYABLE.test(String(x.codec || '')) && !TEMP.test(nm) && !ADULT_NAME.test(nm + ' ' + (x.tags || '')) }
// lista del dial (nada se guarda): sin repetidas por nombre y con lo que la web necesita para mostrarlas y reproducirlas. loc(x) → { cc, country }
function dialList(rows, loc) {
  const seen = new Set(), out = []
  for (const x of rows) {
    const nm = clean(x.name, 80), k = nm.toLowerCase(); if (!nm || seen.has(k) || !playable(x)) continue
    seen.add(k); const l = loc(x)
    out.push({ id: 'w:' + String(x.stationuuid || x.url_resolved).slice(0, 40), name: nm, stream: x.url_resolved, country: l.country, cc: l.cc, city: clean(x.state, 60), genre: genreOf(nm, x.tags || ''), logo: /^https:\/\/[^\s"'<>]{4,300}$/.test(x.favicon || '') ? x.favicon : '' })
  }
  return out
}
// mode 'deportes': solo nombres deportivos. mode 'populares': las más escuchadas del país, de cualquier tipo (música, noticias, deportes…).
async function loadCountry(cc, limit = 5, mode = 'deportes') {
  cc = String(cc || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2); if (cc.length !== 2) throw Object.assign(new Error('País no válido (2 letras, por ejemplo CO).'), { code: 400 })
  const seen = new Map(), names = new Set(); let reached = false
  const normName = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const queries = mode === 'populares' ? [''] : ['sports', 'deportes', 'futbol', 'football']
  for (const tag of queries) {
    const rows = await dirSearch(`countrycode=${cc}${tag ? '&tag=' + tag : ''}&hidebroken=true&limit=40&order=clickcount&reverse=true`)
    if (!rows) continue; reached = true
    for (const x of rows) { const nm = String(x.name || ''); if ((mode === 'populares' || (SPORT_NAME.test(nm) && !NOT_SPORT.test(nm))) && playable(x) && !seen.has(x.url_resolved)) seen.set(x.url_resolved, x) }
  }
  if (!reached) throw Object.assign(new Error('No pude conectar con el directorio de emisoras.'), { code: 502 })
  const top = [...seen.values()].sort((a, b) => (b.clickcount || 0) - (a.clickcount || 0)).filter(x => { const k = normName(x.name); if (!k || names.has(k)) return false; names.add(k); return true }).slice(0, limit)
  const country = (REG && REG.of(cc)) || cc, t = now(), until = BIZ_FOREVER; let added = 0
  const exists = x => db.prepare('SELECT id, logo FROM stations WHERE stream = ? OR (lower(name) = lower(?) AND country = ?)').get(x.url_resolved, clean(x.name, 80), country)
  // las que ya estaban cargadas sin logo lo reciben ahora (sin duplicarlas)
  let logos0 = 0
  await Promise.all(top.map(async x => { const e = exists(x); if (e && !e.logo && x.favicon) { const l = await saveLogo(x.favicon); if (l) { db.prepare('UPDATE stations SET logo = ? WHERE id = ?').run(l, e.id); logos0++ } } }))
  const fresh = top.filter(x => !exists(x))
  const logos = await Promise.all(fresh.map(x => saveLogo(x.favicon)))
  fresh.forEach((x, k) => {
    const web = /^https?:\/\/[^\s"'<>]{3,300}$/.test(x.homepage || '') ? x.homepage : null, lat = x.geo_lat !== null && x.geo_lat !== undefined && Number.isFinite(+x.geo_lat) ? +x.geo_lat : null, lon = x.geo_long !== null && x.geo_long !== undefined && Number.isFinite(+x.geo_long) ? +x.geo_long : null
    db.prepare('INSERT INTO stations (name, city, country, lat, lon, genre, stream, logo, website, paid_until, created_at, cc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(clean(x.name, 80) || 'Emisora', clean(x.state, 60), country, lat, lon, genreOf(clean(x.name, 80), x.tags || ''), x.url_resolved, logos[k], web, until, t, cc); added++
  })
  stCache = null; broadcast({ type: 'stations' }); return { cc, country, found: seen.size, added, logos: logos.filter(Boolean).length + logos0 }
}

// ---- Girar el dial: emisoras del mundo en vivo, sin guardarlas (ni en el disco ni en Cloudflare) ----
// Se piden al directorio por país, se guardan en memoria 2 horas y de ahí salen mezcladas. Solo enlaces https que el navegador reproduce directo.
const DIAL_CC = ['AR', 'BR', 'CO', 'MX', 'ES', 'GB', 'DE', 'IT', 'FR', 'PT', 'NL', 'BE', 'US', 'CL', 'UY', 'PE', 'EC', 'PY', 'BO', 'VE', 'CR', 'PA', 'DO', 'CU', 'TR', 'GR', 'RU', 'PL', 'SE', 'NO', 'DK', 'CH', 'AT', 'CZ', 'HR', 'RO', 'HU', 'SA', 'AE', 'EG', 'MA', 'NG', 'GH', 'SN', 'ZA', 'JP', 'KR', 'IN', 'AU', 'CA', 'ID', 'PH', 'TH', 'VN']
const ADULT_NAME = /\b(xxx|porn|porno|sex|sexo|erotic|erotica|adult|nsfw)\b/i
const dialCache = new Map()
async function dialCountry(cc) {
  const hit = dialCache.get(cc); if (hit && hit.t > now() - 2 * 36e5) return hit.v
  const rows = await dirSearch(`countrycode=${cc}&hidebroken=true&limit=60&order=clickcount&reverse=true`, 7000)
  if (!rows) return hit ? hit.v : []
  const country = (REG && REG.of(cc)) || cc, out = dialList(rows, () => ({ cc, country }))
  dialCache.set(cc, { t: now(), v: out }); if (dialCache.size > 120) dialCache.delete(dialCache.keys().next().value)
  return out
}

// Lista del mundo por páginas (scroll infinito): se pide al directorio de 40 en 40, ordenada por popularidad. Nada se guarda en disco.
const listCache = new Map()
const listBusy = new Map()
// si 500 personas piden la misma página a la vez, al directorio sale UNA sola consulta (las demás esperan esa respuesta)
function dialPage(cc, offset, tag = '', q = '') {
  const key = cc + '|' + offset + '|' + tag + '|' + q, hit = listCache.get(key); if (hit && hit.t > now() - 30 * 60e3) return Promise.resolve(hit.v)
  if (!listBusy.has(key)) listBusy.set(key, dialPageFetch(cc, offset, tag, q).then(v => v || (hit ? hit.v : null)).finally(() => listBusy.delete(key)))   // si el directorio falla, se sirve la copia vieja
  return listBusy.get(key)
}
async function dialPageFetch(cc, offset, tag, q = '') {
  const rows = await dirSearch(`${q ? 'name=' + encodeURIComponent(q) + '&' : ''}${cc ? 'countrycode=' + cc + '&' : ''}${tag ? 'tag=' + tag + '&' : ''}hidebroken=true&limit=40&offset=${offset}&order=clickcount&reverse=true`, 7000)
  if (!rows) return null
  const out = dialList(rows, x => { const c2 = String(x.countrycode || cc || '').toUpperCase(); return { cc: c2, country: (REG && c2 && REG.of(c2)) || x.country || '' } })
  const v = { stations: out, next: offset + rows.length, done: rows.length < 40 }
  listCache.set(cc + '|' + offset + '|' + tag + '|' + q, { t: now(), v }); if (listCache.size > 300) listCache.delete(listCache.keys().next().value)
  return v
}
function stationFields(b) {
  const stream = String(b.stream || '').trim()
  if (clean(b.name, 80).length < 2) return { error: 'Escribe el nombre de la emisora.' }
  if (!/^https?:\/\/[^\s"'<>]{4,400}$/.test(stream)) return { error: 'Pega el enlace de transmisión completo (empieza con http:// o https://).' }
  const logo = b.logo && (okMedia(b.logo) || /^\/uploads\/[a-f0-9]{24}\.(png|webp|jpg|ico)$/.test(b.logo)) ? b.logo : null
  let web = String(b.website || '').trim(); if (web && !/^https?:\/\//.test(web)) web = 'https://' + web
  if (!/^https?:\/\/[^\s"'<>]{3,300}$/.test(web)) web = null
  const num = x => x !== null && x !== '' && x !== undefined && Number.isFinite(+x) ? +x : null
  return { row: [clean(b.name, 80), clean(b.city, 80), clean(b.country, 60), num(b.lat), num(b.lon), clean(b.genre, 40), stream, logo, web, clean(b.whatsapp, 20).replace(/[^\d+]/g, '')] }
}
const okMedia = u => typeof u === 'string' && u.length < 400 && (u.startsWith('/uploads/') && /^\/uploads\/[a-f0-9]{24}(-t)?\.(jpg|png|webp|gif|ico|mp4|webm|mov)$/.test(u) || (r2 && (u.startsWith(r2.publicUrl + '/media/') || u.startsWith(r2.publicUrl + '/videos/'))))
// ---------- edad: la fecha de nacimiento se guarda solo en el servidor; a los demás solo les llega «adult» ----------
const parseBirth = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); if (!m) return null; const y = +m[1], mo = +m[2], d = +m[3], dt = new Date(Date.UTC(y, mo - 1, d)); if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || dt.getTime() > Date.now()) return null; return m[0] }
const ageOf = b => { if (!b) return null; const [y, m, d] = b.split('-').map(Number), n = new Date(); let a = n.getUTCFullYear() - y; if (n.getUTCMonth() + 1 < m || (n.getUTCMonth() + 1 === m && n.getUTCDate() < d)) a--; return a }
const MIN_AGE = 13, ADULT = 18
// ---- Entrar con Google: se verifica el token (JWT RS256) con las llaves públicas de Google; solo hace falta el Client ID (el secreto no se usa) ----
let gJwks = { at: 0, keys: [] }
async function googleVerify(idt, clientId) {
  const [h, p, sg] = String(idt || '').split('.'); if (!h || !p || !sg || String(idt).length > 4096) return null
  const hd = JSON.parse(Buffer.from(h, 'base64url').toString()), pl = JSON.parse(Buffer.from(p, 'base64url').toString())
  if (hd.alg !== 'RS256') return null
  if (gJwks.at < Date.now() - 36e5 || !gJwks.keys.some(k => k.kid === hd.kid)) { const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(6000) }); if (r.ok) gJwks = { at: Date.now(), keys: (await r.json()).keys || [] } }
  const jwk = gJwks.keys.find(k => k.kid === hd.kid); if (!jwk) return null
  if (!crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(sg, 'base64url'))) return null
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(pl.iss) || pl.aud !== clientId || !(pl.exp * 1000 > Date.now()) || pl.email_verified !== true || !pl.email) return null
  return pl
}
const publicUser = u => u && { bizActive: bizOn(u), bizBlocked: !!u.biz_flag && !bizOn(u), adult: u.birth ? ageOf(u.birth) >= ADULT : null, id: u.id, name: u.name, handle: u.handle, city: u.city, hue: u.hue, role: u.role || 'user', avatar: u.avatar || '', bio: u.bio || '', lat: u.lat, lon: u.lon, country: u.country || CITY_COUNTRY[u.city] || '', biz: !!u.biz, bizName: u.biz_name || '', bizType: u.biz_type || '', bizLat: u.biz_lat, bizLon: u.biz_lon, bizAddress: u.biz_address || '', bizHours: u.biz_hours || '', bizWhatsapp: u.biz_whatsapp || '', bizWebsite: u.biz_website || '', featuredUntil: u.featured_until || null, bizCover: u.biz_cover || '' }

// ---------- al borrar una publicación se borran también sus archivos (disco local o Cloudflare R2) ----------
// un archivo solo se borra si ya nada más lo usa (publicaciones, perfiles, paseos, emisoras)
const mediaInUse = u => db.prepare('SELECT 1 FROM sport_logos WHERE url = ? LIMIT 1').get(u)   // primero las tablas chicas: casi todo lo que se borra son escudos de partidos
  || db.prepare('SELECT 1 FROM stations WHERE logo = ? LIMIT 1').get(u)
  || db.prepare('SELECT 1 FROM posts WHERE image = ? OR thumb = ? OR video = ? LIMIT 1').get(u, u, u)
  || db.prepare('SELECT 1 FROM users WHERE avatar = ? OR biz_cover = ? LIMIT 1').get(u, u)
  || db.prepare('SELECT 1 FROM walk_media WHERE image = ? OR thumb = ? OR video = ? LIMIT 1').get(u, u, u)
function dropMedia(urls) {
  for (const u of new Set(urls)) {
    if (!u || typeof u !== 'string') continue
    try {
      if (u.startsWith('/uploads/')) { if (!mediaInUse(u)) fs.unlink(path.join(UPLOADS, path.basename(u)), () => {}) }
      else if (r2 && (u.startsWith(r2.publicUrl + '/media/') || u.startsWith(r2.publicUrl + '/videos/')) && !mediaInUse(u))
        R2.del(r2, u.slice(r2.publicUrl.length + 1)).catch(e => console.error('R2 no pudo borrar', u, e.message))
    } catch (e) { console.error('dropMedia', e.message) }
  }
}
// borra la publicación (y solo del dueño si se pasa userId) y sus archivos; devuelve cuántas borró
function delPost(id, userId) {
  const r = db.prepare('SELECT image, thumb, video FROM posts WHERE id = ?' + (userId ? ' AND user_id = ?' : '')).get(...(userId ? [id, userId] : [id]))
  if (!r) return 0
  const n = db.prepare('DELETE FROM posts WHERE id = ?').run(id).changes
  if (n) dropMedia([r.image, r.thumb, r.video])
  return n
}

// foto enviada como data:URL (camino antiguo): con Cloudflare R2 va allá, sin R2 queda en el disco
async function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 6 * 1024 * 1024) throw Object.assign(new Error('La foto es demasiado grande (máximo 6 MB).'), { code: 413 })
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1], id = crypto.randomBytes(12).toString('hex')
  if (r2) { try { return await putR2(`media/${new Date().toISOString().slice(0, 7)}/${id}.${ext}`, buf, 'image/' + (ext === 'jpg' ? 'jpeg' : ext)) } catch (e) { console.error('[fotos] R2 no guardó la foto:', e.message); throw Object.assign(new Error('No se pudo guardar la foto. Inténtalo de nuevo en un momento.'), { code: 502 }) } }
  fs.writeFileSync(path.join(UPLOADS, id + '.' + ext), buf)
  return '/uploads/' + id + '.' + ext
}

const POST_SQL = `
SELECT p.id, p.title, p.text, p.cat, p.city, p.country, p.type, p.image, p.video, p.thumb, p.scene, p.lat, p.lon, p.capacity, p.challenge, p.match, p.info, (p.featured OR COALESCE(p.promo_until, 0) > CAST(strftime('%s','now') AS INTEGER) * 1000 OR COALESCE(u.featured_until, 0) > CAST(strftime('%s','now') AS INTEGER) * 1000) AS featured, p.promo_until, p.expires_at, u.biz AS author_biz, u.biz_name AS author_biz_name, p.created_at AS at, u.avatar, u.verified AS author_verified,
  u.name AS author, u.handle, u.hue, u.id AS author_id, u.is_example AS author_example,
  p.base_likes + (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  CASE WHEN p.cat = 'planes' THEN (SELECT COUNT(*) FROM joins j WHERE j.post_id = p.id) END AS joined,
  EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = :me) AS liked,
  EXISTS(SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = :me) AS saved,
  EXISTS(SELECT 1 FROM joins j WHERE j.post_id = p.id AND j.user_id = :me) AS joined_me,
  (p.user_id = :me) AS mine
FROM posts p JOIN users u ON u.id = p.user_id`
const parseMatch = m => { try { return m ? JSON.parse(m) : null } catch { return null } }
const shape = r => r && ({ ...r, match: parseMatch(r.match), info: parseMatch(r.info), author_biz: !!r.author_biz, featured: !!r.featured, author_verified: !!r.author_verified, author_example: !!r.author_example, liked: !!r.liked, saved: !!r.saved, joined_me: !!r.joined_me, mine: !!r.mine })
const getPost = (id, me) => shape(db.prepare(POST_SQL + ' WHERE p.id = :id').get({ id, me }))

// ---------- live events (Server-Sent Events): replaces most polling ----------
const clients = new Set()
const postsCache = new Map()   // lista de publicaciones para visitantes (sin sesión): se arma una vez y se comparte unos segundos
function broadcast(ev, toUsers) {
  if (ev && (ev.type === 'post' || ev.type === 'goal' || ev.type === 'matchev')) postsCache.clear()
  const data = 'data: ' + JSON.stringify(ev) + '\n\n'
  for (const c of clients) if (!toUsers || toUsers.includes(c.user)) { if (c.res.writableLength > 262144) { clients.delete(c); c.res.destroy(); continue } try { c.res.write(data) } catch { clients.delete(c) } }
}
setInterval(() => { for (const c of clients) { if (c.res.writableLength > 262144) { clients.delete(c); c.res.destroy(); continue } try { c.res.write(': ping\n\n') } catch { clients.delete(c) } } }, 25000).unref()

// ---------- API ----------
async function api(req, res, url) {
  const me = currentUser(req), meId = me?.id ?? 0
  const p = url.pathname, method = req.method
  const need = () => { if (!me) throw Object.assign(new Error('Inicia sesión para hacer esto.'), { code: 401 }); if (S().maintenance && me.role !== 'admin') throw Object.assign(new Error(S().maintenanceText), { code: 503 }) }
  let m

  if (p === '/api/events' && method === 'GET') {
    // tope de conexiones en vivo: cada una ocupa un socket y memoria (20 por IP, 8.000 en total)
    const ipc = ipOf(req); let same = 0; for (const x of clients) if (x.ip === ipc) same++
    if (clients.size >= 8000 || same >= 20) { res.writeHead(429, { 'Retry-After': '30' }); return res.end() }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.write('retry: 4000\n\n')
    const c = { res, user: meId, ip: ipc }; clients.add(c)
    req.on('close', () => clients.delete(c)); res.on('error', () => clients.delete(c)); req.socket.setKeepAlive(true)
    return
  }

  if (p === '/api/me/account' && method === 'PUT') {
    need(); const b = await readBody(req), u = db.prepare('SELECT pass, email FROM users WHERE id = ?').get(me.id)
    if (!b.current || !(await checkPass(String(b.current), u.pass))) return send(res, 400, { error: 'La contraseña actual no es correcta.' })
    const email = String(b.email || '').trim().toLowerCase()
    if (email && email !== u.email) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: 'Escribe un correo válido.' }); if (db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id != ?').get(email, me.id)) return send(res, 400, { error: 'Ese correo ya está en uso.' }); db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, me.id) }
    if (b.password) { if (String(b.password).length < 8) return send(res, 400, { error: 'La nueva contraseña debe tener al menos 8 caracteres.' }); db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(await hashPass(String(b.password)), me.id) }
    return send(res, 200, { ok: true, email: email || u.email })
  }
  if (p === '/api/me' && method === 'PUT') {
    need(); const b = await readBody(req), name = clean(b.name, 60), bio = clean(b.bio, 200), city = clean(b.city, 80)
    if (name.length < 2) return send(res, 400, { error: 'Escribe tu nombre.' })
    const av = typeof b.avatar === 'string' ? b.avatar : ''
    if (av && !(/^\/uploads\/[a-f0-9]{24}(-t)?\.(jpg|png|webp)$/.test(av) || (r2 && av.startsWith(r2.publicUrl + '/media/')))) return send(res, 400, { error: 'La foto de perfil no es válida.' })
    const lat = Number.isFinite(+b.lat) && b.lat !== null && b.lat !== '' ? +b.lat : null, lon = Number.isFinite(+b.lon) && b.lon !== null && b.lon !== '' ? +b.lon : null
    db.prepare('UPDATE users SET name = ?, bio = ?, avatar = ?, city = COALESCE(NULLIF(?, \'\'), city), country = COALESCE(NULLIF(?, \'\'), country), lat = COALESCE(?, lat), lon = COALESCE(?, lon) WHERE id = ?').run(name, bio, av, city, clean(b.country, 60), lat, lon, me.id)
    if (b.biz !== undefined) {
      const on = !!b.biz, bl = Number.isFinite(+b.bizLat) && b.bizLat !== null && b.bizLat !== '' ? +b.bizLat : null, bo = Number.isFinite(+b.bizLon) && b.bizLon !== null && b.bizLon !== '' ? +b.bizLon : null
      if (on && (!clean(b.bizName, 80) || bl === null || bo === null)) return send(res, 400, { error: 'Para el negocio escribe el nombre y marca su ubicación.' })
      placesCache.clear(); bizListCache = null
      db.prepare('UPDATE users SET biz_cover = ? WHERE id = ?').run(okMedia(b.bizCover) ? String(b.bizCover) : null, me.id)
      db.prepare('UPDATE users SET biz = ?, biz_name = ?, biz_type = ?, biz_lat = ?, biz_lon = ?, biz_address = ?, biz_hours = ?, biz_whatsapp = ? WHERE id = ?').run(on ? 1 : 0, clean(b.bizName, 80), BIZ_TYPES.includes(b.bizType) ? b.bizType : 'otro', bl, bo, clean(b.bizAddress, 160), clean(b.bizHours, 120), clean(b.bizWhatsapp, 20).replace(/[^\d+]/g, ''), me.id)
      db.prepare('UPDATE users SET biz_website = ? WHERE id = ?').run(cleanUrl(b.bizWebsite) || null, me.id)
    }
    return send(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(me.id)) })
  }

  // ---- businesses on the map: only the visible area, clustered when there are many ----
  // lugares del mundo (playas, sagrados, ruinas…): la lista se pide una vez; la ficha trae foto y resumen de Wikipedia
  if (p === '/api/tv' && method === 'GET') return send(res, 200, S().tvOn === false ? [] : TV.list(false), { 'Cache-Control': 'public, max-age=60, s-maxage=300' })
  if (p === '/api/world-events' && method === 'GET') return send(res, 200, WDEV.list(), { 'Cache-Control': 'public, max-age=300, s-maxage=600' })
  if ((m = /^\/api\/world-events\/(Q\d+)\/post$/.exec(p)) && method === 'POST') { if (limited('wde:' + ipOf(req), 40, 3600e3)) return send(res, 429, { error: 'Demasiados eventos abiertos seguidos.' }); const pid = await WDEV.openPost(m[1]); return pid ? send(res, 200, { id: pid }) : send(res, 404, { error: 'Ese evento ya no está.' }) }
  if (p === '/api/sites' && method === 'GET') return send(res, 200, SITES.list(), { 'Cache-Control': 'public, max-age=300, s-maxage=3600' })
  if ((m = /^\/api\/sites\/(\d+)$/.exec(p)) && method === 'GET') {
    if (limited('site:' + ipOf(req), 60, 60e3)) return send(res, 429, { error: 'Demasiadas consultas seguidas.' })
    const d = await SITES.detail(+m[1]); return d ? send(res, 200, d) : send(res, 404, { error: 'Ese lugar no existe.' })
  }
  if (p === '/api/places' && method === 'GET') {
    const q = k => +url.searchParams.get(k), s0 = q('s'), n0 = q('n'), z = q('z') || 3
    let w0 = q('w'), e0 = q('e'); if (![s0, n0, w0, e0].every(Number.isFinite)) return send(res, 400, { error: 'Área no válida.' })
    const whole = e0 - w0 >= 359
    const norm = x => ((x + 540) % 360) - 180, wN = whole ? -180 : norm(w0), eN = whole ? 180 : norm(e0)
    const lonCond = whole ? '(:w <= :e)' : wN <= eN ? 'biz_lon BETWEEN :w AND :e' : '(biz_lon >= :w OR biz_lon <= :e)'
    // short cache per area: busy areas are computed once every 10 s, not on every visit
    const ck = [s0, n0, wN, eN].map(v => v.toFixed(2)).join(',') + ',' + Math.round(z)
    const hit = placesCache.get(ck); if (hit && hit.t > Date.now() - 1e4) return send(res, 200, hit.v)
    const nowMs = now(), args = { s: s0, n: n0, w: wN, e: eN, now: nowMs }
    const total = db.prepare(`SELECT COUNT(*) c FROM users WHERE biz = 1 AND suspended = 0 AND biz_until > :now AND biz_lat BETWEEN :s AND :n AND ${lonCond}`).get({ s: s0, n: n0, w: wN, e: eN, now: nowMs }).c
    if (total > 250 && z < 15) {
      const cell = Math.max(n0 - s0, whole ? 360 : (eN - wN + 360) % 360 || 360) / 12
      const rows = db.prepare(`SELECT CAST(biz_lat / ${cell} AS INTEGER) gy, CAST(biz_lon / ${cell} AS INTEGER) gx, COUNT(*) n, AVG(biz_lat) lat, AVG(biz_lon) lon, MAX(COALESCE(featured_until, 0) > :now) feat FROM users WHERE biz = 1 AND suspended = 0 AND biz_until > :now AND biz_lat BETWEEN :s AND :n AND ${lonCond} GROUP BY gy, gx`).all(args)
      // los destacados (los que pagan) nunca se agrupan: se ven siempre con su foto, a cualquier distancia
      const top = db.prepare(`SELECT id, biz_name AS name, biz_type AS type, biz_lat AS lat, biz_lon AS lon, avatar, hue, verified, 1 AS featured, (SELECT COUNT(*) FROM posts WHERE user_id = users.id AND expires_at > :now) AS offers FROM users WHERE biz = 1 AND suspended = 0 AND biz_until > :now AND featured_until > :now AND biz_lat BETWEEN :s AND :n AND ${lonCond} ORDER BY id DESC LIMIT 60`).all(args)
      const v = { clusters: rows.filter(r => !r.feat || r.n > 1).map(r => ({ n: r.n, lat: r.lat, lon: r.lon, featured: false })), places: top.map(r => ({ ...r, featured: true, verified: !!r.verified })), total }; cachePlaces(ck, v); return send(res, 200, v)
    }
    const rows = db.prepare(`SELECT id, biz_name AS name, biz_type AS type, biz_lat AS lat, biz_lon AS lon, avatar, hue, verified, (COALESCE(featured_until, 0) > :now) AS featured,
      (SELECT COUNT(*) FROM posts WHERE user_id = users.id AND expires_at > :now) AS offers FROM users WHERE biz = 1 AND suspended = 0 AND biz_until > :now AND biz_lat BETWEEN :s AND :n AND ${lonCond} ORDER BY featured DESC, id DESC LIMIT 400`).all(args)
    const v = { places: rows.map(r => ({ ...r, featured: !!r.featured, verified: !!r.verified })), clusters: [], total }; cachePlaces(ck, v); return send(res, 200, v)
  }
  // lista de negocios activos para la ventana «Negocios» (buscador por nombre, ciudad, país o dirección)
  if (p === '/api/biz' && method === 'GET') {
    const t = now()
    if (!bizListCache || bizListCache.t < t - 20e3) { bizListCache = { t, rows: db.prepare('SELECT id, biz_name AS name, biz_type AS type, avatar, hue, verified, biz_address AS address, city, country, biz_lat AS lat, biz_lon AS lon, (COALESCE(featured_until, 0) > ?) AS featured FROM users WHERE biz = 1 AND suspended = 0 AND biz_until > ? ORDER BY featured DESC, biz_name COLLATE NOCASE LIMIT 3000').all(t, t).map(r => ({ ...r, featured: !!r.featured, verified: !!r.verified, hay: plain([r.name, r.city, r.country, r.address].join(' ')) })) } }
    const q = plain(String(url.searchParams.get('q') || '').slice(0, 60)).trim(), off = Math.max(0, +url.searchParams.get('o') || 0)
    const rows = q ? bizListCache.rows.filter(r => q.split(/\s+/).every(w => r.hay.includes(w))) : bizListCache.rows
    return send(res, 200, { list: rows.slice(off, off + 40).map(r => { const o = { ...r }; delete o.hay; return o }), total: rows.length })
  }
  if ((m = /^\/api\/places\/(\d+)$/.exec(p)) && method === 'GET') {
    const u = db.prepare('SELECT id, name, handle, avatar, hue, verified, biz_name, biz_type, biz_lat, biz_lon, biz_address, biz_hours, biz_whatsapp, featured_until, biz_cover, city, country, bio, biz_until, biz_website FROM users WHERE id = ? AND biz = 1 AND suspended = 0').get(+m[1])
    if (!u || ((u.biz_until || 0) <= Date.now() && meId !== u.id && !['admin', 'mod'].includes(me?.role))) return send(res, 404, { error: 'Este negocio no existe.' })
    const posts = db.prepare(POST_SQL + ' WHERE p.user_id = :uid AND (p.expires_at IS NULL OR p.expires_at > :now) ORDER BY p.created_at DESC LIMIT 30').all({ me: meId, uid: u.id, now: now() }).map(shape)
    return send(res, 200, { place: { id: u.id, owner: u.name, handle: u.handle, avatar: u.avatar, hue: u.hue, verified: !!u.verified, about: u.bio || '', website: u.biz_website || '', name: u.biz_name, type: u.biz_type, lat: u.biz_lat, lon: u.biz_lon, address: u.biz_address, hours: u.biz_hours, whatsapp: u.biz_whatsapp, cover: u.biz_cover || '', featured: (u.featured_until || 0) > now(), city: u.city, country: u.country, mine: u.id === meId }, posts })
  }

  if (p === '/api/follows') {
    need()
    if (method === 'POST') { const b = await readBody(req), kind = b.kind, value = clean(b.value, 80); if (!['city', 'cat'].includes(kind) || !value) return send(res, 400, { error: 'No válido.' })
      const del = db.prepare('DELETE FROM follows WHERE user_id = ? AND kind = ? AND value = ?').run(me.id, kind, value); if (!del.changes) db.prepare('INSERT INTO follows (user_id, kind, value, created_at) VALUES (?, ?, ?, ?)').run(me.id, kind, value, now()) }
    return send(res, 200, { follows: db.prepare('SELECT kind, value FROM follows WHERE user_id = ? ORDER BY created_at DESC').all(me.id) })
  }

  if (p === '/api/notifications' && method === 'GET') {
    need()
    const list = db.prepare('SELECT n.id, n.type, n.post_id, n.text, n.read, n.created_at AS at, u.id AS actor_id, u.name AS actor, u.hue, u.avatar, p.title FROM notifications n LEFT JOIN users u ON u.id = n.actor_id LEFT JOIN posts p ON p.id = n.post_id WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50').all(me.id)
    return send(res, 200, { notifications: list.map(x => ({ ...x, read: !!x.read })), unread: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0').get(me.id).n })
  }
  if (p === '/api/notifications/read' && method === 'POST') { need(); db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(me.id); return send(res, 200, { ok: true }) }

  if ((p === '/api/geo/search' || p === '/api/geo/reverse') && method === 'GET' && limited('geo:' + ipOf(req), 90, 60e3)) return send(res, 429, { error: 'Demasiadas consultas seguidas.' })
  if (p === '/api/geo/search' && method === 'GET') { try { return send(res, 200, { places: await WORLD.search(url.searchParams.get('q')) }) } catch { return send(res, 502, { error: 'No se pudo buscar el lugar. Inténtalo de nuevo.' }) } }
  if (p === '/api/geo/reverse' && method === 'GET') { try { return send(res, 200, { place: await WORLD.reverse(+url.searchParams.get('lat'), +url.searchParams.get('lon')) }) } catch { return send(res, 502, { error: 'No se pudo ubicar el lugar.' }) } }
  if (p === '/api/translate' && method === 'POST') {
    if (limited('tr:' + ipOf(req), 40, 60e3)) return send(res, 429, { error: 'Demasiadas traducciones seguidas. Espera un momento.' })
    const b = await readBody(req)
    try { return send(res, 200, { text: await WORLD.translate(b.text, b.to) }) } catch (e) { return send(res, 502, { error: 'No se pudo traducir: ' + e.message }) }
  }

  if (p === '/api/settings' && method === 'GET') { const st = S(); return send(res, 200, { ...st, videoMaxSeconds: videoMax(), googleClientId: ADMIN.secret('google', 'clientId') || '' }, { 'Cache-Control': 'public, max-age=0, s-maxage=60' }) }

  // ---------- notificaciones push ----------
  if (p === '/api/teams/follow' && method === 'GET') { need(); return send(res, 200, { teams: PUSH.followList(me.id) }) }
  if (p === '/api/teams/follow' && method === 'PUT') {
    need(); if (limited('tf:' + me.id, 200, 3600e3)) return send(res, 429, { error: 'Demasiados cambios.' })
    const b = await readBody(req); return PUSH.followSet(me.id, b.team, !!b.on) ? send(res, 200, { ok: true }) : send(res, 400, { error: 'No se pudo seguir ese equipo (máximo 30).' })
  }
  if (p === '/api/push/key' && method === 'GET') return send(res, 200, { key: PUSH.key(), enabled: PUSH.enabled })
  if (p === '/api/push/prefs' && method === 'GET') { need(); return send(res, 200, PUSH.prefs(url.searchParams.get('endpoint'), me.id)) }
  if (p === '/api/push/subscribe' && method === 'POST') {
    need(); if (limited('ps:' + me.id, 30, 60 * 60e3)) return send(res, 429, { error: 'Demasiados intentos.' })
    const b = await readBody(req)
    return PUSH.save(me.id, b.subscription, !!b.goals) ? send(res, 200, { ok: true }) : send(res, 400, { error: 'Este navegador no pudo activar los avisos.' })
  }
  if (p === '/api/push/unsubscribe' && method === 'POST') { need(); const b = await readBody(req); PUSH.remove(b.endpoint, me.id); return send(res, 200, { ok: true }) }
  if (p === '/api/client-error' && method === 'POST') {
    if (limited('ce:' + ipOf(req), 20, 10 * 60e3)) return send(res, 204, {})
    const b = await readBody(req, 8 * 1024).catch(() => ({})); const m = clean(b.msg, 280)
    if (m) pushErr('navegador', m, clean(b.where, 120)); return send(res, 204, {})
  }
  // avisos de la política de contenido (CSP en modo «solo reportar»): quedan en el panel Rendimiento, no bloquean nada
  if (p === '/api/csp-report' && method === 'POST') {
    if (limited('csp:' + ipOf(req), 30, 10 * 60e3)) return send(res, 204, {})
    const b = await readBody(req, 8 * 1024).catch(() => ({})), r = b['csp-report'] || b
    const d = clean(r['violated-directive'] || r['effectiveDirective'], 60), u = clean(r['blocked-uri'] || r['blockedURL'], 120)
    if (d) pushErr('csp', d + ' bloqueó ' + (u || '?'), clean(r['document-uri'] || r['documentURL'], 120)); return send(res, 204, {})
  }
  if (p === '/api/city/pulse' && method === 'GET') {
    const city = clean(url.searchParams.get('city'), 80); if (!city) return send(res, 400, { error: 'Falta la ciudad.' })
    return send(res, 200, await cityPulse(city), { 'Cache-Control': 'public, max-age=20' })
  }
  if (p === '/api/stations' && method === 'GET') {
    if (!stCache || stCache.at < Date.now() - 30e3) stCache = { at: Date.now(), list: db.prepare('SELECT id, name, city, country, lat, lon, genre, stream, logo, website, whatsapp FROM stations WHERE paid_until > ? ORDER BY name').all(now()) }
    return send(res, 200, { stations: stCache.list }, { 'Cache-Control': 'public, max-age=0, s-maxage=60' })
  }
  // ---------- reto del día y ventanas al mundo ----------
  if (p === '/api/daily' && method === 'GET') { const st = S(), k = dayKey(); return send(res, 200, { on: st.dailyOn !== false, key: k, title: st.dailyTitle, text: st.dailyText, count: db.prepare('SELECT COUNT(*) n FROM posts WHERE challenge = ?').get(k).n }) }
  if (p === '/api/cams' && method === 'GET') { if (!camsCache) camsCache = db.prepare('SELECT id, title, city, country, lat, lon, yt, kind FROM cams WHERE active = 1 ORDER BY id').all(); return send(res, 200, { cams: camsCache }, { 'Cache-Control': 'public, max-age=0, s-maxage=60' }) }
  if (p === '/api/admin/cams' && method === 'GET') { if (!me || me.role !== 'admin') return send(res, 403, { error: 'Solo el administrador.' }); return send(res, 200, { cams: db.prepare('SELECT * FROM cams ORDER BY id DESC').all() }) }
  if ((p === '/api/admin/cams' && method === 'POST') || ((m = /^\/api\/admin\/cams\/(\d+)$/.exec(p)) && (method === 'PUT' || method === 'DELETE'))) {
    if (!me || me.role !== 'admin') return send(res, 403, { error: 'Solo el administrador.' })
    if (method === 'DELETE') { db.prepare('DELETE FROM cams WHERE id = ?').run(+m[1]); camsCache = null; broadcast({ type: 'cams' }); return send(res, 200, { ok: true }) }
    const b = await readBody(req), yt = parseYouTube(b.url), lat = +b.lat, lon = +b.lon
    if (!yt) return send(res, 400, { error: 'Pega un enlace de YouTube válido (de un video en vivo o de un canal).' })
    if (!(Math.abs(lat) <= 85 && Math.abs(lon) <= 180) || b.lat === null || b.lat === '') return send(res, 400, { error: 'Elige el lugar de la cámara en el mapa.' })
    if (clean(b.title, 80).length < 2) return send(res, 400, { error: 'Escribe un nombre para la cámara.' })
    const row = [clean(b.title, 80), clean(b.city, 80), clean(b.country, 60), lat, lon, yt.id, yt.kind, b.active === false ? 0 : 1]
    if (m) db.prepare('UPDATE cams SET title = ?, city = ?, country = ?, lat = ?, lon = ?, yt = ?, kind = ?, active = ? WHERE id = ?').run(...row, +m[1])
    else db.prepare('INSERT INTO cams (title, city, country, lat, lon, yt, kind, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...row, now())
    camsCache = null; broadcast({ type: 'cams' }); return send(res, 200, { ok: true })
  }
  // ---------- paseos en vivo ----------
  if (p === '/api/walks/live' && method === 'GET') return send(res, 200, { walks: liveWalks() })
  // posiciones de las personas que aceptaron mostrarse (cualquiera puede mirar; solo ellas se publican)
  if (p === '/api/here' && S().hereOn !== true) return send(res, 200, method === 'GET' ? { singles: [], groups: [], total: 0 } : { ok: true, off: true }, { 'Cache-Control': 'public, max-age=60' })   // «Personas en el mapa» apagado desde el panel
  if (p === '/api/here' && method === 'GET') { const fresh = url.searchParams.get('f') === '1' && !limited('hf:' + ipOf(req), 30, 60e3); const v = hereView(url.searchParams, fresh); return send(res, v ? 200 : 400, v || { error: 'Zona no válida.' }, { 'Cache-Control': 'no-store' }) }
  if (p === '/api/here' && method === 'POST') {
    need(); if (limited('h:' + me.id, 8, 60e3)) return send(res, 429, { error: 'Demasiado seguido.' })
    if (!me.birth) return send(res, 403, { error: 'Para mostrarte en el mapa escribe primero tu fecha de nacimiento.', code: 'birth' })
    if (ageOf(me.birth) < ADULT) { here.delete(me.id); return send(res, 403, { error: 'Solo las personas mayores de 18 años pueden mostrarse en el mapa.', code: 'age' }) }
    const b = await readBody(req, 2048), prev = here.get(me.id)
    if (b.ka && prev) { prev.t = Date.now(); return send(res, 200, { ok: true }) }          // quieta: solo se renueva (casi no gasta)
    const lat = +b.lat, lon = +b.lon; if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180)) return send(res, 400, { error: 'Ubicación no válida.' })
    if (!prev && here.size >= HERE_MAX) return send(res, 503, { error: 'Mapa de personas lleno por ahora.' })
    const ex = !!b.exact, d = ex ? 1e4 : 100, j = ex ? 0 : ((me.id * 37) % 100 / 100 - 0.5) * 0.006       // aproximada: ~1 km con un pequeño desplazamiento para que no se encimen
    const la = Math.round(lat * d) / d + j, lo = Math.round(lon * d) / d + j * 1.3
    const rec = { id: me.id, name: me.name, handle: me.handle, avatar: okMedia(me.avatar || '') ? me.avatar : '', hue: me.hue, lat: +la.toFixed(5), lon: +lo.toFixed(5), cc: prev?.cc || '', t: Date.now(), g: prev?.g }
    here.set(me.id, rec)
    // país: se consulta una vez y otra vez solo si se movió lejos (para la bandera de los grupos)
    if (!prev || Math.abs(prev.lat - rec.lat) > 0.4 || Math.abs(prev.lon - rec.lon) > 0.4) { rec.g = Date.now(); WORLD.reverse(rec.lat, rec.lon).then(g => { const r = here.get(me.id); if (r && g?.cc) r.cc = g.cc }).catch(() => {}) }
    return send(res, 200, { ok: true })
  }
  if (p === '/api/here/off' && method === 'POST') { if (me) here.delete(me.id); return send(res, 200, { ok: true }) }
  if (p === '/api/walks' && method === 'POST') {
    need(); const b = await readBody(req), lat = +b.lat, lon = +b.lon
    if (!(Math.abs(lat) <= 85 && Math.abs(lon) <= 180)) return send(res, 400, { error: 'No pudimos leer tu ubicación.' })
    db.prepare('UPDATE walks SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL').run(now(), me.id)
    const g = await WORLD.reverse(lat, lon).catch(() => null), city = clean(g?.city || nearestCity(lat, lon), 80)
    const r = db.prepare('INSERT INTO walks (user_id, title, city, started_at, last_lat, last_lon, last_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(me.id, clean(b.title, 80) || 'Paseo por ' + city, city, now(), lat, lon, now())
    const id = Number(r.lastInsertRowid); db.prepare('INSERT INTO walk_points VALUES (?, ?, ?, ?)').run(id, lat, lon, now())
    walksCache = null; broadcast({ type: 'walks' }); return send(res, 200, { walk: walkInfo(id) })
  }
  if ((m = /^\/api\/walks\/(\d+)$/.exec(p)) && method === 'GET') {
    const w = walkInfo(+m[1]); if (!w) return send(res, 404, { error: 'Ese paseo no existe.' })
    const pts = db.prepare('SELECT lat, lon FROM walk_points WHERE walk_id = ? ORDER BY t').all(w.id), step = Math.ceil(pts.length / 1500)
    return send(res, 200, { walk: w, points: pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(x => [x.lat, x.lon]),
      media: db.prepare('SELECT id, lat, lon, image, thumb, video, caption, t FROM walk_media WHERE walk_id = ? ORDER BY t').all(w.id),
      msgs: db.prepare('SELECT m.id, m.text, m.t, u.name, u.avatar, u.hue FROM walk_msgs m JOIN users u ON u.id = m.user_id WHERE m.walk_id = ? ORDER BY m.id DESC LIMIT 60').all(w.id).reverse() })
  }
  if ((m = /^\/api\/walks\/(\d+)\/(pos|end|media|msg|watch)$/.exec(p)) && method === 'POST') {
    const w = db.prepare('SELECT * FROM walks WHERE id = ?').get(+m[1]); if (!w) return send(res, 404, { error: 'Ese paseo no existe.' })
    const act = m[2], b = await readBody(req)
    if (act === 'watch') { const k = clean(b.k, 40) || String(req.headers['x-forwarded-for'] || req.socket.remoteAddress); let v = walkViewers.get(w.id); if (!v) walkViewers.set(w.id, v = new Map()); if (v.size < 2000 || v.has(k)) v.set(k, now()); return send(res, 200, { ok: true }) }
    need()
    if (act === 'msg') { if (w.ended_at) return send(res, 400, { error: 'El paseo terminó.' }); const text = clean(b.text, 300); if (!text) return send(res, 400, { error: 'Escribe algo.' })
      const lastMsg = walkMsgRate.get(me.id) || 0; if (now() - lastMsg < 1500) return send(res, 429, { error: 'Más despacio ' }); walkMsgRate.set(me.id, now())
      const r = db.prepare('INSERT INTO walk_msgs (walk_id, user_id, text, t) VALUES (?, ?, ?, ?)').run(w.id, me.id, text, now())
      broadcast({ type: 'walkmsg', walk: w.id, msg: { id: Number(r.lastInsertRowid), text, t: now(), name: me.name, avatar: me.avatar, hue: me.hue } }); return send(res, 200, { ok: true }) }
    if (w.user_id !== me.id) return send(res, 403, { error: 'Este paseo no es tuyo.' })
    if (w.ended_at) return send(res, 400, { error: 'El paseo ya terminó.' })
    if (act === 'end') { db.prepare('UPDATE walks SET ended_at = ? WHERE id = ?').run(now(), w.id); walksCache = null; broadcast({ type: 'walks' }); broadcast({ type: 'walkend', walk: w.id }); return send(res, 200, { ok: true }) }
    const lat = +b.lat, lon = +b.lon; if (!(Math.abs(lat) <= 85 && Math.abs(lon) <= 180)) return send(res, 400, { error: 'Ubicación no válida.' })
    if (act === 'pos') { if (+b.acc > 35) return send(res, 200, { ok: true, skipped: true }); if (now() - (w.last_at || 0) < 2000) return send(res, 200, { ok: true, skipped: true }); walkStep(w, lat, lon); return send(res, 200, { ok: true }) }
    if (act === 'media') { const image = b.image && okMedia(b.image) ? b.image : null, thumb = b.thumb && okMedia(b.thumb) ? b.thumb : null, video = b.video && okMedia(b.video) ? b.video : null
      if (!image && !video) return send(res, 400, { error: 'Sube una foto o un video.' })
      if (db.prepare('SELECT COUNT(*) n FROM walk_media WHERE walk_id = ?').get(w.id).n >= 60) return send(res, 400, { error: 'Máximo 60 fotos por paseo.' })
      const r = db.prepare('INSERT INTO walk_media (walk_id, lat, lon, image, thumb, video, caption, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(w.id, lat, lon, image, thumb, video, clean(b.caption, 140), now())
      broadcast({ type: 'walkmedia', walk: w.id, media: { id: Number(r.lastInsertRowid), lat, lon, image, thumb, video, caption: clean(b.caption, 140), t: now() } }); return send(res, 200, { ok: true }) }
  }
  // ---------- ventas: emisoras y negocios pagan solos ----------
  if (p === '/api/pay/options' && method === 'GET') {
    const st = S(); return send(res, 200, { providers: PAY.available(), currency: st.currency, radio: { amount: +st.radioAmount, usd: +st.radioUSD }, evento: { amount: +st.eventAmount, usd: +st.eventUSD }, biz: { amount: +st.bizAmount, usd: +st.bizUSD } })
  }
  if (p === '/api/my/stations' && method === 'GET') { need(); return send(res, 200, { stations: db.prepare('SELECT id, name, city, country, lat, lon, genre, stream, logo, website, paid_until FROM stations WHERE owner_id = ? ORDER BY id DESC').all(me.id) }) }
  if ((p === '/api/my/stations' && method === 'POST') || ((m = /^\/api\/my\/stations\/(\d+)$/.exec(p)) && method === 'PUT')) {
    need(); const b = await readBody(req), v = stationFields(b); if (v.error) return send(res, 400, { error: v.error })
    if (m) { const own = db.prepare('SELECT 1 FROM stations WHERE id = ? AND owner_id = ?').get(+m[1], me.id); if (!own) return send(res, 404, { error: 'Esa emisora no es tuya.' })
      db.prepare('UPDATE stations SET name = ?, city = ?, country = ?, lat = ?, lon = ?, genre = ?, stream = ?, logo = ?, website = ?, whatsapp = ? WHERE id = ?').run(...v.row, +m[1]); stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { id: +m[1] }) }
    if (db.prepare('SELECT COUNT(*) n FROM stations WHERE owner_id = ?').get(me.id).n >= 5) return send(res, 400, { error: 'Máximo 5 emisoras por cuenta.' })
    const r = db.prepare('INSERT INTO stations (name, city, country, lat, lon, genre, stream, logo, website, whatsapp, created_at, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...v.row, now(), me.id)
    return send(res, 200, { id: Number(r.lastInsertRowid) })
  }
  if (p === '/api/pay' && method === 'POST') {
    need(); const b = await readBody(req), st = S(), item = b.item === 'radio' ? 'radio' : b.item === 'biz' ? 'biz' : b.item === 'evento' ? 'evento' : null, provider = String(b.provider || '')
    if (!item) return send(res, 400, { error: 'Servicio no válido.' })
    if (!PAY.available().includes(provider)) return send(res, 400, { error: 'Ese medio de pago no está activo.' })
    let title, target
    if (item === 'radio') { const x = db.prepare('SELECT id, name FROM stations WHERE id = ? AND owner_id = ?').get(+b.targetId, me.id); if (!x) return send(res, 404, { error: 'Esa emisora no es tuya.' }); target = x.id; title = `Emisora "${x.name}" en ${st.name} · 1 mes` }
    else if (item === 'evento') { const x = db.prepare('SELECT id, title, cat FROM posts WHERE id = ? AND user_id = ?').get(+b.targetId, me.id); if (!x) return send(res, 404, { error: 'Esa publicación no es tuya.' }); if (x.cat !== 'eventos') return send(res, 400, { error: 'Solo se pueden promocionar publicaciones de la categoría Eventos.' }); target = x.id; title = `Evento "${String(x.title).slice(0, 60)}" promocionado en ${st.name} · ${+st.planEvento?.days || 7} días` }
    else { if (!me.biz) return send(res, 400, { error: 'Primero activa "Es un negocio" en tu perfil.' }); target = me.id; title = `Negocio destacado "${me.biz_name || me.name}" en ${st.name} · 1 mes` }
    const amount = +(item === 'radio' ? st.radioAmount : item === 'evento' ? st.eventAmount : st.bizAmount), usd = +(item === 'radio' ? st.radioUSD : item === 'evento' ? st.eventUSD : st.bizUSD), currency = provider === 'paypal' ? 'USD' : String(st.currency || 'COP').toUpperCase()
    if (!(amount > 0) || (provider === 'paypal' && !(usd > 0))) return send(res, 400, { error: 'El precio aún no está configurado.' })
    const ref = 'PL' + Date.now().toString(36) + crypto.randomBytes(5).toString('hex')
    const origin = (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers['x-forwarded-host'] || req.headers.host)
    const out = await PAY.create({ provider, ref, title, amount, currency, usd, back: origin + '/pago?ref=' + ref })
    db.prepare('INSERT INTO payments (ref, user_id, item, target_id, provider, amount, currency, ext_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(ref, me.id, item, target, provider, provider === 'paypal' ? usd : amount, currency, out.extId || null, now())
    return send(res, 200, { url: out.url })
  }
  if (p === '/api/pay/verify' && method === 'GET') {
    const pay = db.prepare('SELECT * FROM payments WHERE ref = ?').get(clean(url.searchParams.get('ref'), 40)); if (!pay) return send(res, 404, { error: 'No encontramos ese pago.' })
    if (pay.status !== 'paid') { try { if (await PAY.check(pay)) applyPayment(pay) } catch (e) { console.error('verificar pago', e.message) } }
    const now2 = db.prepare('SELECT status, item FROM payments WHERE id = ?').get(pay.id)
    return send(res, 200, { status: now2.status, item: now2.item })
  }
  // GET /api/radio/list?cc=CO&offset=0  → una página de emisoras del mundo (o de un país)
  if (p === '/api/radio/list' && method === 'GET') {
    if (limited('lst:' + ipOf(req), 60, 60e3)) return send(res, 429, { error: 'Demasiadas consultas seguidas.' })
    const cc = String(url.searchParams.get('cc') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2), off = Math.min(600, Math.max(0, Math.round(+url.searchParams.get('offset')) || 0))
    const tag = { sports: 'sports', news: 'news', music: 'music', religion: 'religion' }[String(url.searchParams.get('tag') || '')] || ''
    // q = buscar por nombre (en todo el mundo, o dentro del país o tema elegido)
    const q = clean(url.searchParams.get('q') || '', 40)
    const v = await dialPage(cc.length === 2 ? cc : '', off, tag, q.length >= 2 ? q : '')
    return v ? send(res, 200, v, { 'Cache-Control': 'no-store' }) : send(res, 502, { error: 'No pude conectar con el directorio de emisoras.' })
  }
  // GET /api/radio/mix?cc=CO,MX  → hasta 40 emisoras mezcladas (sin cc: de países al azar). Nada se guarda.
  if (p === '/api/radio/mix' && method === 'GET') {
    if (limited('mix:' + ipOf(req), 40, 60e3)) return send(res, 429, { error: 'Demasiadas consultas seguidas.' })
    const asked = String(url.searchParams.get('cc') || '').toUpperCase().split(',').map(x => x.replace(/[^A-Z]/g, '')).filter(x => x.length === 2).slice(0, 6)
    const ccs = asked.length ? asked : [...DIAL_CC].sort(() => Math.random() - 0.5).slice(0, 4)
    const lists = await Promise.all(ccs.map(dialCountry)), mix = []
    for (let i = 0; mix.length < 40 && lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) mix.push(l[i])
    for (let i = mix.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mix[i], mix[j]] = [mix[j], mix[i]] }
    return send(res, 200, { stations: mix.slice(0, 40) }, { 'Cache-Control': 'no-store' })
  }
  if (p.startsWith('/api/admin/')) {
    if (!me || (me.role !== 'admin' && me.role !== 'mod')) return send(res, 403, { error: 'No tienes permiso para entrar al panel.' })
    const adminOnly = () => { if (me.role !== 'admin') throw Object.assign(new Error('Solo el administrador puede hacer esto.'), { code: 403 }) }
    if (p === '/api/admin/health' && method === 'GET') return send(res, 200, await healthReport())
    if (p === '/api/admin/health/errors' && method === 'DELETE') { adminOnly(); ERRS.length = 0; return send(res, 200, { ok: true }) }
    if (p === '/api/admin/optimize' && method === 'POST') { adminOnly(); return send(res, 200, await optimize()) }
    const q = '%' + clean(url.searchParams.get('q'), 60) + '%'
    if (p === '/api/admin/overview') return send(res, 200, {
      users: db.prepare('SELECT COUNT(*) n FROM users WHERE is_example = 0').get().n, posts: db.prepare('SELECT COUNT(*) n FROM posts').get().n,
      postsToday: db.prepare('SELECT COUNT(*) n FROM posts WHERE created_at > ?').get(now() - 864e5).n, comments: db.prepare('SELECT COUNT(*) n FROM comments').get().n,
      messages: db.prepare('SELECT COUNT(*) n FROM messages').get().n + db.prepare('SELECT COUNT(*) n FROM room_messages').get().n,
      reports: db.prepare('SELECT COUNT(*) n FROM reports WHERE resolved = 0').get().n, online: clients.size, storage: r2 ? 'Cloudflare R2 (' + r2.bucket + ')' : 'Disco del servidor',
      examples: db.prepare('SELECT COUNT(*) n FROM posts p JOIN users u ON u.id = p.user_id WHERE u.is_example = 1').get().n,
      businesses: db.prepare('SELECT COUNT(*) n FROM users WHERE biz = 1').get().n, featuredBiz: db.prepare('SELECT COUNT(*) n FROM users WHERE featured_until > ?').get(now()).n,
      sales: db.prepare("SELECT currency, SUM(amount) total, COUNT(*) n FROM payments WHERE status = 'paid' AND paid_at > ? GROUP BY currency").all(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()),
      recentPayments: db.prepare("SELECT p.ref, p.item, p.amount, p.currency, p.provider, p.paid_at, u.name FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status = 'paid' ORDER BY p.paid_at DESC LIMIT 10").all(),
      stationsActive: db.prepare('SELECT COUNT(*) n FROM stations WHERE paid_until > ?').get(now()).n,
      stationsExpiring: db.prepare('SELECT id, name, paid_until FROM stations WHERE paid_until BETWEEN ? AND ? ORDER BY paid_until').all(now(), now() + 7 * 864e5),
      expiringSoon: db.prepare('SELECT id, name, biz_name, featured_until FROM users WHERE featured_until BETWEEN ? AND ? ORDER BY featured_until').all(now(), now() + 7 * 864e5),
      topCities: db.prepare('SELECT city, COUNT(*) n FROM posts GROUP BY city ORDER BY n DESC LIMIT 6').all() })
    if (p === '/api/admin/settings' && method === 'PUT') { adminOnly(); const b = await readBody(req); const st = ADMIN.saveSettings(b); try { purgeOff() } catch { /* se reintenta solo */ } try { SPORTS && SPORTS.purgeHidden() } catch { /* se reintenta en la próxima búsqueda */ } broadcast({ type: 'settings', v: Date.now() }); return send(res, 200, st) }
    if (p === '/api/admin/texts') return send(res, 200, ADMIN.TEXTS)
    if (p === '/api/admin/posts') return send(res, 200, { posts: db.prepare("SELECT p.id, p.title, p.city, p.type, p.cat, p.featured, p.created_at AS at, p.image, p.thumb, p.video, u.name AS author, u.handle, u.is_example, (SELECT COUNT(*) FROM reports r WHERE r.post_id = p.id AND r.resolved = 0) AS reports FROM posts p JOIN users u ON u.id = p.user_id WHERE p.title LIKE ? OR u.name LIKE ? OR p.city LIKE ? ORDER BY p.created_at DESC LIMIT 200").all(q, q, q) })
    let mm
    if ((mm = /^\/api\/admin\/posts\/(\d+)$/.exec(p)) && method === 'DELETE') { delPost(+mm[1]); broadcast({ type: 'post' }); return send(res, 200, { ok: true }) }
    if ((mm = /^\/api\/admin\/posts\/(\d+)\/feature$/.exec(p)) && method === 'POST') { const b = await readBody(req); db.prepare('UPDATE posts SET featured = ? WHERE id = ?').run(b.featured ? 1 : 0, +mm[1]); broadcast({ type: 'post' }); return send(res, 200, { ok: true }) }
    if ((mm = /^\/api\/admin\/posts\/(\d+)\/type$/.exec(p)) && method === 'POST') { const b = await readBody(req); if (!['usuario', 'verificada', 'directo'].includes(b.type)) return send(res, 400, { error: 'Tipo no válido.' }); db.prepare('UPDATE posts SET type = ? WHERE id = ?').run(b.type, +mm[1]); broadcast({ type: 'post' }); return send(res, 200, { ok: true }) }
    if (p === '/api/admin/festivals' && method === 'GET') { adminOnly(); return send(res, 200, FEST.status()) }
  if (p === '/api/admin/festivals/sync' && method === 'POST') { adminOnly(); return send(res, 200, await FEST.sync()) }
  if (p === '/api/admin/tv' && method === 'GET') { adminOnly(); return send(res, 200, TV.list(true)) }
  if (p === '/api/admin/tv' && method === 'POST') { adminOnly(); if (limited('tvadd:' + me.id, 30, 3600e3)) return send(res, 429, { error: 'Demasiados intentos seguidos.' }); const b = await readBody(req); try { return send(res, 200, await TV.add(b.url, { name: b.name, country: b.country })) } catch (e) { return send(res, 400, { error: e.message }) } }
  if ((m = /^\/api\/admin\/tv\/(\d+)\/recheck$/.exec(p)) && method === 'POST') { adminOnly(); if (limited('tvchk:' + me.id, 60, 3600e3)) return send(res, 429, { error: 'Demasiadas revisiones seguidas.' }); const r = await TV.recheck(+m[1], true); return r ? send(res, 200, r) : send(res, 404, { error: 'No existe.' }) }
  if ((m = /^\/api\/admin\/tv\/(\d+)$/.exec(p)) && (method === 'PUT' || method === 'DELETE')) { adminOnly(); if (method === 'DELETE') return send(res, 200, { ok: TV.remove(+m[1]) > 0 }); const r = TV.update(+m[1], await readBody(req)); return r ? send(res, 200, r) : send(res, 404, { error: 'No existe.' }) }
  if (p === '/api/admin/world-events' && method === 'GET') { adminOnly(); return send(res, 200, WDEV.status()) }
  if (p === '/api/admin/world-events/sync' && method === 'POST') { adminOnly(); return send(res, 200, WDEV.start()) }
  if (p === '/api/admin/extras' && method === 'GET') { adminOnly(); return send(res, 200, EXTRAS.status()) }
  if (p === '/api/admin/extras/sync' && method === 'POST') { adminOnly(); await Promise.allSettled([EXTRAS.quakes()]); return send(res, 200, EXTRAS.status()) }
  if (p === '/api/admin/sports' && method === 'GET') { adminOnly(); return send(res, 200, SPORTS.status()) }
  if (p === '/api/admin/sports/leagues' && method === 'GET') { adminOnly(); try { return send(res, 200, { leagues: await SPORTS.leagues(url.searchParams.get('refresh') === '1') }) } catch (e) { return send(res, 400, { error: e.message }) } }
  if (p === '/api/admin/sports/venues' && method === 'GET') { adminOnly(); return send(res, 200, { venues: SPORTS.venues() }) }
  if (p === '/api/admin/sports/venues' && method === 'PUT') { adminOnly(); const b = await readBody(req); try { return send(res, 200, SPORTS.setVenue(b.key, b.lat, b.lon)) } catch (e) { return send(res, 400, { error: e.message }) } }
  if (p === '/api/admin/sports/venues/research' && method === 'POST') { adminOnly(); const b = await readBody(req); try { return send(res, 200, await SPORTS.research(b.key)) } catch (e) { return send(res, 400, { error: e.message }) } }
  if (p === '/api/admin/espn/leagues' && method === 'GET') { adminOnly(); try { return send(res, 200, await SPORTS.espnCatalog()) } catch (e) { return send(res, 502, { error: e.message }) } }
  if (p === '/api/admin/espn/teams' && method === 'GET') { adminOnly(); try { return send(res, 200, await SPORTS.espnTeams(url.searchParams.get('slug'))) } catch { return send(res, 502, { error: 'ESPN no respondió con los equipos de esa liga' }) } }
  if (p === '/api/admin/sports/fill-test' && method === 'POST') { adminOnly(); const b = await readBody(req); try { return send(res, 200, { lines: await SPORTS.fillTest(b.src === 'sa' ? 'sa' : 'af') }) } catch (e) { return send(res, 200, { lines: ['Error: ' + e.message] }) } }
  if (p === '/api/admin/sports/sync' && method === 'POST') { adminOnly(); return send(res, 200, await SPORTS.sync()) }
  // buscador de emisoras en el directorio abierto radio-browser.info (nombre y país → enlace directo de audio)
  if (p === '/api/admin/radio-search' && method === 'GET') {
    adminOnly()
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 60), cc = String(url.searchParams.get('cc') || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
    if (q.length < 2 && !cc) return send(res, 400, { error: 'Escribe al menos 2 letras o un país (por ejemplo CO).' })
    if (limited('rs:' + me.id, 30, 60e3)) return send(res, 429, { error: 'Demasiadas búsquedas seguidas.' })
    const qs = `name=${encodeURIComponent(q)}${cc ? '&countrycode=' + cc : ''}&limit=40&hidebroken=true&order=clickcount&reverse=true`
    const found = await dirSearch(qs)
    if (found) {
      const rows = found.filter(x => /^https:\/\//.test(x.url_resolved || '')).slice(0, 20)
      return send(res, 200, { results: rows.map(x => ({ name: String(x.name || '').trim().slice(0, 80), stream: x.url_resolved, country: x.country || '', cc: x.countrycode || '', genre: String(x.tags || '').split(',')[0].trim().slice(0, 40), website: /^https?:\/\//.test(x.homepage || '') ? x.homepage.slice(0, 200) : '', codec: x.codec || '', bitrate: x.bitrate || 0 })) })
    }
    return send(res, 502, { error: 'No pude conectar con el directorio de emisoras. Inténtalo en un momento.' })
  }
  if (p === '/api/admin/stations/auto' && method === 'DELETE') {
    adminOnly(); const r = db.prepare('DELETE FROM stations WHERE cc IS NOT NULL AND owner_id IS NULL').run()
    stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { removed: Number(r.changes) })
  }
  if (p === '/api/admin/stations/country' && method === 'POST') {
    adminOnly(); const b = await readBody(req)
    try { return send(res, 200, await loadCountry(b.cc, b.mode === 'populares' ? 6 : 5, b.mode === 'populares' ? 'populares' : 'deportes')) } catch (e) { return send(res, e.code || 500, { error: e.message }) }
  }
  if (p === '/api/admin/stations/logos-web' && method === 'POST') {
    adminOnly()
    const rows = db.prepare("SELECT id, website FROM stations WHERE (logo IS NULL OR logo = '') AND website LIKE 'http%'").all().filter(x => !logoTried.has(x.id))
    let ok = 0; const lote = rows.slice(0, 12)
    await Promise.all(lote.map(async x => { logoTried.add(x.id); const l = await logoFromSite(x.website); if (l) { db.prepare('UPDATE stations SET logo = ? WHERE id = ?').run(l, x.id); ok++ } }))
    return send(res, 200, { probadas: lote.length, con_logo: ok, faltan: rows.length - lote.length })
  }
  if (p === '/api/admin/stations/pack' && method === 'POST') {
    adminOnly(); const b = await readBody(req); if (b.pack !== 'co') return send(res, 400, { error: 'Paquete no válido.' })
    const t = now(), until = BIZ_FOREVER; let added = 0
    for (const r of PACK_CO) {
      if (db.prepare('SELECT 1 FROM stations WHERE stream = ?').get(r[5])) continue
      db.prepare('INSERT INTO stations (name, city, country, lat, lon, genre, stream, website, paid_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(r[0], r[1], 'Colombia', r[2], r[3], r[4], r[5], r[6] || null, until, t); added++
    }
    // reglas de partido sugeridas (puedes cambiarlas en Partidos automáticos); solo si todavía no hay ninguna
    let rules = 0
    if (!(S().radioRules || []).length) {
      const caracol = db.prepare('SELECT id FROM stations WHERE stream = ?').get(PACK_CO[0][5])
      if (caracol) { ADMIN.saveSettings({ radioRules: [{ t: 'equipo', q: 'Colombia', s: caracol.id }, { t: 'liga', q: 'Primera A', s: caracol.id }, { t: 'liga', q: 'Copa Colombia', s: caracol.id }] }); rules = 3 }
    }
    stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { added, total: PACK_CO.length, rules })
  }
  if (p === '/api/admin/stations' && method === 'GET') return send(res, 200, { stations: db.prepare('SELECT * FROM stations ORDER BY paid_until DESC, name').all() })
    if ((p === '/api/admin/stations' && method === 'POST') || ((mm = /^\/api\/admin\/stations\/(\d+)$/.exec(p)) && method === 'PUT')) {
      adminOnly(); const b = await readBody(req), v = stationFields(b)
      if (v.error) return send(res, 400, { error: v.error })
      if (mm) db.prepare('UPDATE stations SET name = ?, city = ?, country = ?, lat = ?, lon = ?, genre = ?, stream = ?, logo = ?, website = ?, whatsapp = ? WHERE id = ?').run(...v.row, +mm[1])
      else db.prepare('INSERT INTO stations (name, city, country, lat, lon, genre, stream, logo, website, whatsapp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...v.row, now())
      stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { ok: true })
    }
    if (p === '/api/admin/stations/forever' && method === 'POST') {
      adminOnly(); const r = db.prepare('UPDATE stations SET paid_until = ? WHERE paid_until > ? AND paid_until < ?').run(BIZ_FOREVER, now(), BIZ_FOREVER)
      stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { changed: Number(r.changes) })
    }
    if ((mm = /^\/api\/admin\/stations\/(\d+)\/pay$/.exec(p)) && method === 'POST') {
      adminOnly(); const b = await readBody(req), st = db.prepare('SELECT paid_until FROM stations WHERE id = ?').get(+mm[1]); if (!st) return send(res, 404, { error: 'No existe.' })
      const until = b.off ? 0 : b.forever || st.paid_until >= BIZ_FOREVER ? BIZ_FOREVER : Math.max(now(), st.paid_until) + 30 * 864e5   // «para siempre» no vence nunca
      db.prepare('UPDATE stations SET paid_until = ? WHERE id = ?').run(until, +mm[1]); stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { paidUntil: until })
    }
    if ((mm = /^\/api\/admin\/stations\/(\d+)$/.exec(p)) && method === 'DELETE') { adminOnly(); db.prepare('DELETE FROM stations WHERE id = ?').run(+mm[1]); stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { ok: true }) }
    if (p === '/api/admin/examples' && method === 'DELETE') { adminOnly(); const r = db.prepare('DELETE FROM posts WHERE user_id IN (SELECT id FROM users WHERE is_example = 1)').run(); db.prepare('DELETE FROM users WHERE is_example = 1').run(); broadcast({ type: 'post' }); return send(res, 200, { deleted: r.changes }) }
    if (p === '/api/admin/users') return send(res, 200, { users: db.prepare('SELECT u.id, u.name, u.handle, u.city, u.hue, u.role, u.suspended, u.verified, u.biz, u.biz_name, u.featured_until, u.created_at, (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS posts FROM users u WHERE u.is_example = 0 AND (u.name LIKE ? OR u.handle LIKE ?) ORDER BY u.created_at DESC LIMIT 300').all(q, q) })
    if ((mm = /^\/api\/admin\/users\/(\d+)$/.exec(p))) {
      adminOnly(); const id = +mm[1]; if (id === me.id) return send(res, 400, { error: 'No puedes cambiar tu propia cuenta desde aquí.' })
      if (method === 'DELETE') { const media = db.prepare('SELECT image, thumb, video FROM posts WHERE user_id = ?').all(id).flatMap(r => [r.image, r.thumb, r.video]), u0 = db.prepare('SELECT avatar, biz_cover FROM users WHERE id = ? AND is_example = 0').get(id); if (db.prepare('DELETE FROM users WHERE id = ? AND is_example = 0').run(id).changes) dropMedia([...media, u0?.avatar, u0?.biz_cover]); broadcast({ type: 'post' }); return send(res, 200, { ok: true }) }
      if (method === 'POST') { const b = await readBody(req); if (['user', 'mod', 'admin'].includes(b.role)) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, id); if (b.bizDays !== undefined) { const d = +b.bizDays, cur = db.prepare('SELECT biz_until FROM users WHERE id = ?').get(id)?.biz_until || 0; db.prepare('UPDATE users SET biz_until = ?, biz_flag = 0 WHERE id = ?').run(d === -1 ? BIZ_FOREVER : d > 0 ? Math.min(BIZ_FOREVER, Math.max(cur, now()) + Math.min(d, 3660) * 864e5) : null, id); placesCache.clear(); bizListCache = null; broadcast({ type: 'post' }) }
      if (b.bizReview !== undefined) { db.prepare('UPDATE users SET biz_flag = ? WHERE id = ?').run(b.bizReview === 'person' ? 2 : b.bizReview === 'business' ? 1 : 0, id) }
      if (b.featureDays !== undefined) { const d = Math.max(0, Math.min(366, +b.featureDays || 0)); const cur = db.prepare('SELECT featured_until FROM users WHERE id = ?').get(id)?.featured_until || 0; db.prepare('UPDATE users SET featured_until = ? WHERE id = ?').run(d ? Math.max(cur, now()) + d * 864e5 : null, id); broadcast({ type: 'post' }) }
      if (b.verified !== undefined) db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(b.verified ? 1 : 0, id); if (b.suspended !== undefined) { db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(b.suspended ? 1 : 0, id); if (b.suspended) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id) } return send(res, 200, { ok: true }) }
    }
    // negocios: lista con su estado, alta de negocios por el administrador y cuentas con nombre de empresa por revisar
    if (p === '/api/admin/biz' && method === 'GET') {
      adminOnly(); const t = now()
      const list = db.prepare('SELECT id, name, handle, biz_name, biz_type, biz_address, biz_hours, biz_whatsapp, biz_website, biz_cover, bio, city, country, biz_until, featured_until, suspended, avatar, hue, biz_lat, biz_lon, is_example FROM users WHERE biz = 1 ORDER BY (COALESCE(biz_until, 0) > ?) DESC, biz_until DESC LIMIT 500').all(t)
      const review = db.prepare("SELECT id, name, handle, city, biz_flag, created_at FROM users WHERE biz = 0 AND biz_flag != 2 AND is_example = 0 AND role = 'user' ORDER BY id DESC LIMIT 5000").all().filter(u => bizLike(u.name) || u.biz_flag === 1).slice(0, 100)
      return send(res, 200, { list, review, forever: BIZ_FOREVER })
    }
    if ((p === '/api/admin/biz' && method === 'POST') || ((mm = /^\/api\/admin\/biz\/(\d+)$/.exec(p)) && method === 'POST')) {
      adminOnly(); const b = await readBody(req), id = mm ? +mm[1] : 0
      const name = clean(b.name, 80), lat = +b.lat, lon = +b.lon
      if (name.length < 2) return send(res, 400, { error: 'Escribe el nombre del negocio.' })
      if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180) || b.lat === null || b.lat === '' || b.lon === null || b.lon === '') return send(res, 400, { error: 'Marca la ubicación del negocio en el mapa.' })
      const type = BIZ_TYPES.includes(b.type) ? b.type : 'otro', av = okMedia(b.avatar) ? String(b.avatar) : null, cover = okMedia(b.cover) ? String(b.cover) : null
      const days = +b.days === -1 ? -1 : Math.max(0, Math.min(3660, Math.round(+b.days || 0)))
      let city = clean(b.city, 80), country = clean(b.country, 60)
      if (!city) { const g = await WORLD.reverse(lat, lon).catch(() => null); city = g?.city ? clean(g.city, 80) : nearestCity(lat, lon); country = country || (g?.country ? clean(g.country, 60) : (CITY_COUNTRY[city] || '')) }
      let uid = id
      if (!uid) {
        const slug = plain(name).replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'negocio'
        let handle = 'neg' + slug; for (let i = 0; db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle); i++) handle = 'neg' + slug + crypto.randomInt(1000, 9999)
        uid = Number(db.prepare('INSERT INTO users (name, handle, pass, hue, is_example, created_at, verified) VALUES (?, ?, ?, ?, 0, ?, 0)').run(name, handle, 'x:' + crypto.randomBytes(16).toString('hex'), crypto.randomInt(360), now()).lastInsertRowid)
      } else if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND biz = 1').get(uid)) return send(res, 404, { error: 'Ese negocio no existe.' })
      db.prepare('UPDATE users SET name = ?, city = ?, country = ?, lat = ?, lon = ?, avatar = ?, bio = ?, biz = 1, biz_name = ?, biz_type = ?, biz_lat = ?, biz_lon = ?, biz_address = ?, biz_hours = ?, biz_whatsapp = ?, biz_cover = ?, biz_flag = 0, biz_website = ? WHERE id = ?')
        .run(name, city, country, lat, lon, av, clean(b.about, 300), name, type, lat, lon, clean(b.address, 160), clean(b.hours, 120), clean(b.whatsapp, 20), cover, cleanUrl(b.website) || null, uid)
      if (b.days !== undefined) db.prepare('UPDATE users SET biz_until = ? WHERE id = ?').run(days === -1 ? BIZ_FOREVER : days > 0 ? now() + days * 864e5 : null, uid)
      placesCache.clear(); bizListCache = null; broadcast({ type: 'post' }); return send(res, 200, { ok: true, id: uid })
    }
    if (p === '/api/admin/reports') return send(res, 200, { reports: db.prepare('SELECT r.id, r.reason, r.created_at AS at, r.post_id, p.title, p.city, u.name AS reporter, a.name AS author FROM reports r JOIN posts p ON p.id = r.post_id JOIN users u ON u.id = r.user_id JOIN users a ON a.id = p.user_id WHERE r.resolved = 0 ORDER BY r.created_at DESC LIMIT 200').all() })
    if ((mm = /^\/api\/admin\/reports\/(\d+)$/.exec(p)) && method === 'POST') { db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(+mm[1]); return send(res, 200, { ok: true }) }
    if (p === '/api/admin/rooms') return send(res, 200, { messages: db.prepare('SELECT r.id, r.city, r.text, r.created_at AS at, u.name AS author FROM room_messages r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 200').all() })
    if ((mm = /^\/api\/admin\/rooms\/(\d+)$/.exec(p)) && method === 'DELETE') { const r = db.prepare('SELECT city FROM room_messages WHERE id = ?').get(+mm[1]); db.prepare('DELETE FROM room_messages WHERE id = ?').run(+mm[1]); if (r) broadcast({ type: 'room', city: r.city }); return send(res, 200, { ok: true }) }
    if (p === '/api/admin/integrations') { adminOnly(); if (method === 'PUT') { const b = await readBody(req); ADMIN.saveIntegration(b.provider, b.values || {}) } return send(res, 200, ADMIN.integrations()) }
    if ((mm = /^\/api\/admin\/integrations\/(\w+)\/test$/.exec(p)) && method === 'POST') { adminOnly(); try { return send(res, 200, { message: await ADMIN.testIntegration(mm[1]) }) } catch (e) { return send(res, 200, { message: 'No se pudo conectar: ' + e.message }) } }
    return send(res, 404, { error: 'No encontrado.' })
  }

  if (p === '/api/me/birth' && method === 'POST') {
    need(); if (limited('bd:' + me.id, 10, 3600e3)) return send(res, 429, { error: 'Demasiados intentos.' })
    if (me.birth) return send(res, 409, { error: 'Tu fecha de nacimiento ya está guardada y no se puede cambiar.' })
    const b = await readBody(req, 1024), birth = parseBirth(b.birth); if (!birth) return send(res, 400, { error: 'Escribe una fecha válida.' })
    if (ageOf(birth) < MIN_AGE) return send(res, 400, { error: 'Debes tener al menos ' + MIN_AGE + ' años.' })
    db.prepare('UPDATE users SET birth = ? WHERE id = ?').run(birth, me.id)
    return send(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(me.id)) })
  }
  // a la propia persona también se le manda su correo (para el cuadro «Cuenta y contraseña»); a nadie más
  { const pm = /^\/api\/pred\/m\/(-?\d{1,12})$/.exec(p), PR = SPORTS?.ARCH?.PRED
    if (pm && PR) {
      if (method === 'GET') { const g = PR.get(me?.id || 0, +pm[1]); return g ? send(res, 200, { ...g, me: me ? { id: me.id } : null }) : send(res, 404, { error: 'Partido no encontrado.' }) }
      if (method === 'PUT') { if (!me) return send(res, 401, { error: 'Entra a tu cuenta para pronosticar.' }); const b = await readBody(req), o = PR.put(me.id, +pm[1], b?.pick, !!b?.merge); return o.ok ? send(res, 200, o) : send(res, o.code, { error: o.error }) }
    }
    if (p === '/api/pred/picks' && method === 'GET' && PR) { if (!me) return send(res, 200, {}); const ids = String(url.searchParams.get('ids') || '').split(',').map(Number).filter(n => Number.isInteger(n)).slice(0, 120); return send(res, 200, PR.picks(me.id, ids)) }
    if (p === '/api/pred/me' && method === 'GET' && PR) return me ? send(res, 200, PR.mine(me.id)) : send(res, 401, { error: 'Entra a tu cuenta.' })
  }
  if (p === '/api/me' && method === 'GET') return send(res, 200, { user: me ? { ...publicUser(me), email: db.prepare('SELECT email FROM users WHERE id = ?').get(me.id)?.email || '' } : null, videoMaxSeconds: videoMax(), storage: r2 ? 'r2' : 'local' })

  if (p === '/api/register' && method === 'POST') {
    if (limited('r:' + ipOf(req), 20, 60 * 60e3)) return send(res, 429, { error: 'Demasiados registros desde esta conexión. Inténtalo más tarde.' })
    const b = await readBody(req)
    const name = clean(b.name, 60), pass = String(b.password || ''), city = clean(b.city, 80) || 'Bogotá'
    const email = clean(b.email || (String(b.handle || '').includes('@') ? b.handle : ''), 120).toLowerCase()
    if (name.length < 2) return send(res, 400, { error: 'Escribe tu nombre.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: 'Escribe un correo válido, por ejemplo nombre@gmail.com.' })
    if (pass.length < 6) return send(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres.' })
    const birth = parseBirth(b.birth); if (!birth) return send(res, 400, { error: 'Escribe tu fecha de nacimiento.' })
    if (ageOf(birth) < MIN_AGE) return send(res, 400, { error: 'Para crear una cuenta debes tener al menos ' + MIN_AGE + ' años.' })
    if (db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(email)) return send(res, 409, { error: 'Ya existe una cuenta con ese correo. Usa «Entra» para iniciar sesión.' })
    // username generated automatically from the email (unique)
    const base = (email.split('@')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').replace(/^[._]+|[._]+$/g, '') || 'usuario').slice(0, 24).padEnd(3, '0')
    let handle = base; for (let i = 2; db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle); i++) handle = base + i
    const ulat = Number.isFinite(+b.lat) && b.lat !== null ? +b.lat : (CITY_LL[city]?.[0] ?? 4.71), ulon = Number.isFinite(+b.lon) && b.lon !== null ? +b.lon : (CITY_LL[city]?.[1] ?? -74.07), ucountry = clean(b.country, 60) || CITY_COUNTRY[city] || ''
    if (name.length < 2) return send(res, 400, { error: 'Escribe tu nombre.' })
    if (!/^[a-z0-9_.]{3,30}$/.test(handle)) return send(res, 400, { error: 'El usuario debe tener 3 a 30 letras, números, punto o guion bajo.' })
    if (pass.length < 6) return send(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres.' })
    if (db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle)) return send(res, 409, { error: 'Ese usuario ya existe. Elige otro.' })
    const r = db.prepare('INSERT INTO users (name, handle, email, pass, city, hue, lat, lon, country, created_at, birth, biz_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(name, handle, email, await hashPass(pass), city, crypto.randomInt(360), ulat, ulon, ucountry, now(), birth, bizLike(name) ? 1 : 0)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)
    return send(res, 201, { user: publicUser(user) }, startSession(res, user.id))
  }

  if (p === '/api/auth/google' && method === 'POST') {
    if (limited('g:' + ipOf(req), 30, 60e3)) return send(res, 429, { error: 'Demasiados intentos. Espera un momento.' })
    const cid = ADMIN.secret('google', 'clientId'); if (!cid) return send(res, 400, { error: 'El inicio de sesión con Google no está activado.' })
    const b = await readBody(req, 8192); let g = null; try { g = await googleVerify(b.credential, cid) } catch { g = null }
    if (!g) return send(res, 401, { error: 'No se pudo verificar tu cuenta de Google. Inténtalo de nuevo.' })
    const email = String(g.email).toLowerCase().slice(0, 120)
    const old = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND is_example = 0').get(email)
    if (old) { if (old.suspended) return send(res, 403, { error: 'Esta cuenta está suspendida.' }); return send(res, 200, { user: publicUser(old) }, startSession(res, old.id)) }
    if (!b.birth) return send(res, 200, { needBirth: true })
    const birth = parseBirth(b.birth); if (!birth) return send(res, 400, { error: 'Escribe tu fecha de nacimiento.' })
    if (ageOf(birth) < MIN_AGE) return send(res, 400, { error: 'Para crear una cuenta debes tener al menos ' + MIN_AGE + ' años.' })
    const name = clean(g.name || email.split('@')[0], 60) || 'Usuario', city = 'Bogotá'
    const base = (email.split('@')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').replace(/^[._]+|[._]+$/g, '') || 'usuario').slice(0, 24).padEnd(3, '0')
    let handle = base; for (let i = 2; db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle); i++) handle = base + i
    const r = db.prepare('INSERT INTO users (name, handle, email, pass, city, hue, lat, lon, country, created_at, birth, biz_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(name, handle, email, await hashPass(crypto.randomBytes(24).toString('hex')), city, crypto.randomInt(360), CITY_LL[city]?.[0] ?? 4.71, CITY_LL[city]?.[1] ?? -74.07, CITY_COUNTRY[city] || '', now(), birth, bizLike(name) ? 1 : 0)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)
    return send(res, 201, { user: publicUser(user) }, startSession(res, user.id))
  }

  // ---------- recuperar contraseña: enlace de un solo uso por correo (vale 1 hora) ----------
  if (p === '/api/password/forgot' && method === 'POST') {
    if (limited('pf:' + ipOf(req), 5, 60 * 60e3)) return send(res, 429, { error: 'Demasiadas solicitudes. Inténtalo más tarde.' })
    const b = await readBody(req), email = clean(b.email, 120).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: 'Escribe tu correo.' })
    const sec = f => ADMIN.secret('correo', f), base = String(sec('siteUrl') || '').replace(/\/+$/, '')
    if (!sec('key') || !/^https:\/\//.test(base)) return send(res, 503, { error: 'La recuperación por correo aún no está activada. Escríbenos y te ayudamos.' })
    const u = db.prepare('SELECT id, name, email FROM users WHERE email = ? COLLATE NOCASE AND is_example = 0').get(email)
    // la respuesta es la misma exista o no la cuenta (así nadie puede averiguar qué correos están registrados)
    if (u && !limited('pfe:' + u.id, 3, 60 * 60e3)) {
      const token = require('crypto').randomBytes(32).toString('hex'), hash = require('crypto').createHash('sha256').update(token).digest('hex')
      db.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?').run(u.id, now())
      db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hash, u.id, now() + 60 * 60e3)
      const link = base + '/#reset=' + token, site = S().name || 'Worbita'
      const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222"><h2>${String(site).replace(/[<>&]/g, '')}</h2><p>Hola ${String(u.name).replace(/[<>&]/g, '')}:</p><p>Pediste crear una contraseña nueva. Pulsa el botón (vale durante 1 hora):</p><p><a href="${link}" style="display:inline-block;background:#2f6fe0;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Crear contraseña nueva</a></p><p style="color:#777;font-size:13px">Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p></div>`
      try { await sendMail(u.email, `${site}: crea tu contraseña nueva`, html, `Crea tu contraseña nueva (vale 1 hora): ${link}`) }
      catch (e) { db.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(hash); console.error('[correo] no se pudo enviar el enlace:', e.message); return send(res, 502, { error: 'No se pudo enviar el correo ahora. Inténtalo en unos minutos.' }) }
    }
    return send(res, 200, { ok: true })
  }
  if (p === '/api/password/reset' && method === 'POST') {
    if (limited('pr:' + ipOf(req), 20, 60 * 60e3)) return send(res, 429, { error: 'Demasiados intentos. Inténtalo más tarde.' })
    const b = await readBody(req), pass = String(b.password || '')
    if (pass.length < 8) return send(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' })
    const hash = require('crypto').createHash('sha256').update(String(b.token || '')).digest('hex')
    const r = db.prepare('SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?').get(hash, now())
    if (!r) return send(res, 400, { error: 'El enlace ya no es válido o venció. Pide uno nuevo.' })
    db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(await hashPass(pass), r.user_id)
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(r.user_id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(r.user_id) // se cierran todas las sesiones abiertas con la contraseña vieja
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id)
    if (u.suspended) return send(res, 403, { error: 'Esta cuenta está suspendida.' })
    return send(res, 200, { user: publicUser(u) }, startSession(res, u.id))
  }

  if (p === '/api/login' && method === 'POST') {
    if (blocked('l:' + ipOf(req), 12)) return send(res, 429, { error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' })
    const b = await readBody(req)
    const id = clean(b.handle || b.email, 120).toLowerCase().replace(/^@/, '')
    if (blocked('la:' + id, 30)) return send(res, 429, { error: 'Demasiados intentos con esta cuenta. Espera unos minutos y vuelve a probar.' })
    // dos búsquedas con índice (usuario, y correo sin distinguir mayúsculas) en vez de un recorrido de toda la tabla
    const u = db.prepare('SELECT * FROM users WHERE handle = ? AND is_example = 0').get(id) || db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND is_example = 0').get(id)
    if (!u || !(await checkPass(String(b.password || ''), u.pass))) { strike('l:' + ipOf(req), 10 * 60e3); strike('la:' + id, 10 * 60e3); return send(res, 401, { error: 'Correo o contraseña incorrectos.' }) }
    if (u.suspended) return send(res, 403, { error: 'Esta cuenta está suspendida.' })
    return send(res, 200, { user: publicUser(u) }, startSession(res, u.id))
  }

  if (p === '/api/logout' && method === 'POST') {
    if (me) here.delete(me.id)
    const m2 = /(?:^|;\s*)planeta_s=([a-f0-9]{64})/.exec(req.headers.cookie || '')
    if (m2) db.prepare('DELETE FROM sessions WHERE token = ?').run(m2[1])
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'planeta_s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' })
  }

  if (p === '/api/posts' && method === 'GET') {
    const where = [], args = { me: meId }
    const f = url.searchParams.get('filter')
    if (f === 'saved') { need(); where.push('EXISTS(SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = :me)') }
    if (f === 'mine') { need(); where.push('p.user_id = :me') }
    where.push('(p.expires_at IS NULL OR p.expires_at > :now)'); args.now = now()
    const before = +url.searchParams.get('before'); if (before) { where.push('p.created_at < :before'); args.before = before }
    const limit = Math.min(400, Math.max(1, +url.searchParams.get('limit') || 300))   // con todos los partidos del día (~100) 120 dejaba afuera publicaciones
    const ck = meId ? null : url.search, cached = ck !== null && postsCache.get(ck)
    if (cached && cached.t > Date.now() - 3000) return send(res, 200, cached.v)
    const rows = db.prepare(POST_SQL + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY ((p.featured = 1 AND p.created_at > ' + (Date.now() - 7 * 864e5) + ') OR COALESCE(u.featured_until, 0) > ' + Date.now() + ') DESC, p.created_at DESC LIMIT ' + (limit + 1)).all(args)
    const out = { posts: rows.slice(0, limit).map(shape), more: rows.length > limit }
    if (ck !== null) { postsCache.set(ck, { t: Date.now(), v: out }); if (postsCache.size > 20) postsCache.delete(postsCache.keys().next().value) }
    return send(res, 200, out)
  }

  if (p === '/api/posts' && method === 'POST') {
    need()
    if (me.biz_flag === 1 && !bizOn(me)) return send(res, 403, { error: 'Tu cuenta parece de un negocio. Para publicar, activa el plan de negocio o espera a que el equipo la revise.', code: 'biz' })
    const b = await readBody(req, 9 * 1024 * 1024)
    const title = clean(b.title, 120), text = clean(b.text, 2000)
    const lat = Number.isFinite(+b.lat) && b.lat !== null && Math.abs(+b.lat) <= 85 ? +b.lat : null, lon = Number.isFinite(+b.lon) && b.lon !== null && Math.abs(+b.lon) <= 180 ? +b.lon : null
    const cat = CATS.includes(b.cat) ? b.cat : null
    let city = null, country = null
    if (lat !== null && lon !== null) { const g = await WORLD.reverse(lat, lon).catch(() => null); if (g && g.city) { city = clean(g.city, 80); country = clean(g.country, 60) } else { city = nearestCity(lat, lon); country = CITY_COUNTRY[city] } }
    else if (CITIES.includes(b.city)) { city = b.city; country = CITY_COUNTRY[city] }
    if (title.length < 3) return send(res, 400, { error: 'Escribe un título de al menos 3 caracteres.' })
    { const bad = spamCheck(me, 'post', title, text); if (bad) return send(res, bad[0], { error: bad[1] }) }
    if (me.role !== 'admin' && db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND created_at > ?').get(me.id, now() - 36e5).n >= (+S().postsPerHour || 20)) return send(res, 429, { error: 'Has publicado muchas veces en la última hora. Espera un poco.' })
    if (!cat || !city) return send(res, 400, { error: 'Elige una categoría y una ciudad.' })
    let image = null, video = null, thumb = null
    if (typeof b.image === 'string' && b.image.startsWith('data:')) image = await saveImage(b.image)
    else if (b.image) { if (!okMedia(b.image)) return send(res, 400, { error: 'La foto no es válida. Súbela de nuevo.' }); image = b.image }
    if (b.video) { if (!okMedia(b.video)) return send(res, 400, { error: 'El video no es válido. Súbelo de nuevo.' }); if (+b.duration > videoMax() + 0.5) return send(res, 400, { error: `El video dura más de ${videoMax()} segundos.` }); video = b.video }
    if (b.thumb) { if (!okMedia(b.thumb)) return send(res, 400, { error: 'La miniatura no es válida.' }); thumb = b.thumb }
    const challenge = b.challenge && S().dailyOn !== false && b.challenge === dayKey() ? dayKey() : null
    if (challenge && !b.image) return send(res, 400, { error: 'Para el reto del día sube una foto.' })
    const expires = me.biz && +b.validUntil > now() ? Math.min(+b.validUntil, now() + 30 * 864e5) : null
    const capacity = cat === 'planes' && +b.capacity >= 2 ? Math.min(500, Math.round(+b.capacity)) : null
    const plat = lat ?? CITY_LL[city]?.[0] ?? null, plon = lon ?? CITY_LL[city]?.[1] ?? null
    const r = db.prepare('INSERT INTO posts (user_id, title, text, cat, city, country, type, image, video, thumb, scene, lat, lon, capacity, expires_at, created_at, challenge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(me.id, title, text, cat, city, country, b.live ? 'directo' : 'usuario', image, video, thumb, 'ciudad', plat, plon, capacity, expires, now(), challenge)
    const post = getPost(r.lastInsertRowid, me.id)
    for (const f of db.prepare("SELECT DISTINCT user_id FROM follows WHERE (kind = 'city' AND value = ?) OR (kind = 'cat' AND value = ?)").all(city, cat)) notify(f.user_id, 'follow', me.id, post.id, city)
    broadcast({ type: 'post', id: post.id, city: post.city })
    return send(res, 201, { post })
  }

  if ((m = /^\/api\/posts\/(\d+)$/.exec(p))) {
    const id = +m[1]
    if (method === 'GET') {
      const post = getPost(id, meId); if (!post) return send(res, 404, { error: 'Esta publicación ya no existe.' })
      post.attendees = db.prepare('SELECT u.id, u.name, u.hue, u.avatar FROM joins j JOIN users u ON u.id = j.user_id WHERE j.post_id = ? LIMIT 100').all(id)
      post.comments = db.prepare('SELECT c.id, c.text, c.created_at AS at, u.name AS author, u.hue, u.avatar FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at').all(id)
      return send(res, 200, { post })
    }
    if (method === 'DELETE') {
      need(); const r = { changes: delPost(id, me.id) }
      return r.changes ? send(res, 200, { ok: true }) : send(res, 403, { error: 'Solo puedes borrar tus publicaciones.' })
    }
  }

  if ((m = /^\/api\/posts\/(\d+)\/(like|save|join)$/.exec(p)) && method === 'POST') {
    need(); const id = +m[1], table = { like: 'likes', save: 'saves', join: 'joins' }[m[2]]
    if (me.role !== 'admin' && limited('act:' + me.id, 90, 60e3)) return send(res, 429, { error: 'Vas muy rápido. Espera un momento.' })
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) return send(res, 404, { error: 'Esta publicación ya no existe.' })
    if (m[2] === 'join') { const pp = db.prepare('SELECT capacity, user_id FROM posts WHERE id = ?').get(id); const joinedMe = db.prepare('SELECT 1 FROM joins WHERE user_id = ? AND post_id = ?').get(me.id, id); if (pp.capacity && !joinedMe && db.prepare('SELECT COUNT(*) n FROM joins WHERE post_id = ?').get(id).n >= pp.capacity) return send(res, 409, { error: 'El cupo de este plan ya está lleno.' }) }
    const del = db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND post_id = ?`).run(me.id, id)
    if (!del.changes) { db.prepare(`INSERT INTO ${table} (user_id, post_id) VALUES (?, ?)`).run(me.id, id); if (m[2] !== 'save') notify(db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id)?.user_id, m[2], me.id, id) }
    return send(res, 200, { post: getPost(id, me.id) })
  }

  if ((m = /^\/api\/posts\/(\d+)\/comments$/.exec(p)) && method === 'POST') {
    need(); const id = +m[1], b = await readBody(req), text = clean(b.text, 1000)
    if (!text) return send(res, 400, { error: 'Escribe un comentario.' })
    { const bad = spamCheck(me, 'comment', text); if (bad) return send(res, bad[0], { error: bad[1] }) }
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) return send(res, 404, { error: 'Esta publicación ya no existe.' })
    db.prepare('INSERT INTO comments (post_id, user_id, text, created_at) VALUES (?, ?, ?, ?)').run(id, me.id, text, now())
    broadcast({ type: 'comment', id })
    const owner = db.prepare('SELECT user_id, title FROM posts WHERE id = ?').get(id); notify(owner?.user_id, 'comment', me.id, id, text.slice(0, 120))
    return send(res, 201, { ok: true })
  }

  if ((m = /^\/api\/posts\/(\d+)\/report$/.exec(p)) && method === 'POST') {
    need(); const b = await readBody(req)
    if (me.role !== 'admin' && limited('rep:' + me.id, 10, 10 * 60e3)) return send(res, 429, { error: 'Has enviado muchos reportes. Espera unos minutos.' })
    if (!db.prepare('SELECT 1 FROM reports WHERE post_id = ? AND user_id = ? AND resolved = 0').get(+m[1], me.id)) db.prepare('INSERT INTO reports (post_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)').run(+m[1], me.id, clean(b.reason, 300), now())   // un reporte abierto por persona y publicación
    return send(res, 201, { ok: true })
  }

  if (p === '/api/people' && method === 'GET') {
    const rows = db.prepare(`SELECT u.id, u.name, u.handle, u.city, u.hue, u.avatar, u.bio, COUNT(p.id) AS posts, MAX(p.created_at) AS last
      FROM users u LEFT JOIN posts p ON p.user_id = u.id WHERE u.is_example = 0 GROUP BY u.id ORDER BY last DESC NULLS LAST, u.created_at DESC LIMIT 50`).all()
    return send(res, 200, { people: rows })
  }

  if (p === '/api/activity' && method === 'GET') {
    const rows = db.prepare(`SELECT c.id, c.text, c.created_at AS at, u.name AS author, u.hue, p.id AS post_id, p.title
      FROM comments c JOIN users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id ORDER BY c.created_at DESC LIMIT 20`).all()
    return send(res, 200, { activity: rows })
  }

  if (p === '/api/chats' && method === 'GET') {
    need()
    const rows = db.prepare(`
      WITH mine AS (SELECT CASE WHEN from_id = :me THEN to_id ELSE from_id END AS other, id, text, created_at, from_id, read_at, to_id
                    FROM messages WHERE from_id = :me OR to_id = :me),
           last AS (SELECT other, MAX(id) AS last_id FROM mine GROUP BY other)
      SELECT u.id, u.name, u.handle, u.hue, u.avatar, m.text AS last_text, m.created_at AS last_at, (m.from_id = :me) AS last_mine,
        (SELECT COUNT(*) FROM messages x WHERE x.from_id = u.id AND x.to_id = :me AND x.read_at IS NULL) AS unread
      FROM last JOIN messages m ON m.id = last.last_id JOIN users u ON u.id = last.other ORDER BY m.created_at DESC`).all({ me: me.id })
    return send(res, 200, { chats: rows.map(r => ({ ...r, last_mine: !!r.last_mine })), unread: rows.reduce((a, r) => a + r.unread, 0) })
  }

  if ((m = /^\/api\/chats\/(\d+)$/.exec(p))) {
    need(); const other = db.prepare('SELECT id, name, handle, hue, city, avatar, country, lat, lon, is_example FROM users WHERE id = ?').get(+m[1])
    if (!other || other.is_example) return send(res, 404, { error: 'Esta persona no puede recibir mensajes.' })
    if (other.id === me.id) return send(res, 400, { error: 'No puedes enviarte mensajes a ti mismo.' })
    if (method === 'POST') {
      const b = await readBody(req), text = clean(b.text, 2000)
      if (!text) return send(res, 400, { error: 'Escribe un mensaje.' })
      { const bad = spamCheck(me, 'dm', text); if (bad) return send(res, bad[0], { error: bad[1] }) }
      db.prepare('INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)').run(me.id, other.id, text, now())
      broadcast({ type: 'dm', from: me.id, to: other.id }, [me.id, other.id])
      if (!db.prepare('SELECT 1 FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND read = 0').get(other.id, me.id, 'message')) notify(other.id, 'message', me.id, null, text.slice(0, 120))
    }
    db.prepare('UPDATE messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL').run(now(), other.id, me.id)
    const msgs = db.prepare('SELECT id, text, created_at AS at, (from_id = ?) AS mine FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 200')
      .all(me.id, me.id, other.id, other.id, me.id).reverse().map(x => ({ ...x, mine: !!x.mine }))
    return send(res, 200, { user: { id: other.id, name: other.name, handle: other.handle, hue: other.hue, city: other.city, avatar: other.avatar, country: other.country, lat: other.lat, lon: other.lon }, messages: msgs })
  }

  if ((m = /^\/api\/posts\/(\d+)\/card$/.exec(p)) && method === 'POST') {
    // sin sesión también: así cualquiera que comparta un partido deja lista la imagen (publicidad gratis). Protegido con límites por persona y en total.
    if (limited('card:' + ipOf(req), 30, 3600e3) || limited('card:all', 600, 3600e3)) return send(res, 429, { error: 'Demasiadas tarjetas seguidas. Inténtalo en un rato.' })
    const row = db.prepare('SELECT match FROM posts WHERE id = ?').get(+m[1])
    if (!row || !row.match) return send(res, 404, { error: 'Esa publicación no es un partido.' })
    const f = cardFile(m[1]), cur = cardInfo(m[1]), pmx = SPORTS && SPORTS.ARCH && SPORTS.ARCH.postMatch ? SPORTS.ARCH.postMatch(+m[1]) : null
    if (pmx ? (pmx.card && now() - pmx.card.at < 120e3) : (cur && now() - cur.at < 120e3)) return send(res, 200, { kept: true })
    const chunks = []; let got = 0
    await new Promise((ok, bad) => { req.on('data', c => { got += c.length; if (got > 300e3) { req.destroy(); bad(Object.assign(new Error('La imagen pesa demasiado.'), { code: 413 })) } else chunks.push(c) }); req.on('end', ok); req.on('error', bad) })
    const b = Buffer.concat(chunks), d = jpegDims(b)
    if (!d || d.w !== 1200 || d.h !== 630) return send(res, 400, { error: 'La imagen no es válida.' })
    if (pmx) { try { await storeMatchCard(pmx.mid, pmx.tok, pmx.cur, b); SPORTS.ARCH.markShared(pmx.mid); return send(res, 200, { ok: true }) } catch (e) { console.error('[tarjetas] no se guardó la tarjeta del partido:', e.message); return send(res, 502, { error: 'No se pudo guardar la tarjeta.' }) } }   // una sola imagen por partido, la misma que usa su página permanente
    if (r2) {
      try {
        const key = `cards/${+m[1]}-${Math.floor(now() / 1000)}.jpg`, old = db.prepare('SELECT key FROM og_cards WHERE post_id = ?').get(+m[1]), pub = await R2.put(r2, key, b, 'image/jpeg')
        db.prepare('INSERT INTO og_cards (post_id, key, url, at) VALUES (?, ?, ?, ?) ON CONFLICT(post_id) DO UPDATE SET key = excluded.key, url = excluded.url, at = excluded.at').run(+m[1], key, pub, now())
        if (old && old.key !== key) R2.del(r2, old.key).catch(() => {})
        return send(res, 200, { ok: true })
      } catch (e) { console.error('[tarjetas] R2 no guardó la tarjeta:', e.message); return send(res, 502, { error: 'No se pudo guardar la tarjeta.' }) }
    }
    fs.mkdirSync(CARDS, { recursive: true }); const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, b); fs.renameSync(tmp, f)
    return send(res, 200, { ok: true })
  }
  if ((m = /^\/api\/match-card\/([es])(\d+)\/shared$/.exec(p)) && method === 'POST') {
    // alguien compartió o copió el enlace de este partido: queda guardado para siempre (con el permiso de la página)
    if (limited('mshare:' + ipOf(req), 60, 3600e3)) return send(res, 429, { error: 'Demasiados intentos.' })
    const mid = m[1] === 'e' ? -m[2] : +m[2], cur = SPORTS && SPORTS.ARCH ? SPORTS.ARCH.cardKey(mid) : null
    if (!cur) return send(res, 404, { error: 'Ese partido no existe.' })
    if (!SPORTS.ARCH.cardTokOk(mid, cur, String(url.searchParams.get('t') || ''))) return send(res, 403, { error: 'Abre la página del partido y vuelve a intentar.' })
    return send(res, 200, { ok: SPORTS.ARCH.markShared(mid) })
  }
  if ((m = /^\/api\/match-card\/([es])(\d+)$/.exec(p)) && method === 'GET') {
    // datos mínimos para dibujar la tarjeta de un partido (se piden solo al compartir)
    if (limited('mcardq:' + ipOf(req), 120, 3600e3)) return send(res, 429, { error: 'Demasiadas consultas.' })
    const d = SPORTS && SPORTS.ARCH ? SPORTS.ARCH.cardPayloadById(m[1] === 'e' ? -m[2] : +m[2]) : null
    if (!d) return send(res, 404, { error: 'Ese partido no existe.' })
    return send(res, 200, { ...d, link: d.link.replace(/__HOST__/g, portalOrigin(req).replace(/^https?:\/\/(www\.)?/, '')) })
  }
  if ((m = /^\/api\/match-card\/([es])(\d+)$/.exec(p)) && method === 'POST') {
    // solo desde las páginas de esta web (no desde otros sitios)
    { const org = String(req.headers.origin || ''), hn = x => String(x || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/:,]/)[0]
      const mine = new Set([hn(portalOrigin(req)), hn(req.headers['x-forwarded-host']), hn(req.headers.host)].filter(Boolean)), real = x => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x) && !/^\d+(\.\d+){3}$/.test(x)
      // solo se rechaza si el origen es un dominio ajeno Y esta web sí sabe cuál es su propio dominio (si el proxy no lo reenvía no se puede comparar)
      if (org && real(hn(org)) && [...mine].some(real) && !mine.has(hn(org))) { console.error('[tarjetas] origen rechazado:', org, 'esta web:', [...mine].join(',')); return send(res, 403, { error: 'Origen no permitido.' }) } }
    // la imagen del partido para la vista previa del enlace (WhatsApp, Facebook, X…). La dibuja el navegador de quien abre la página del partido.
    if (limited('mcard:' + ipOf(req), 40, 3600e3) || limited('mcard:all', 800, 3600e3)) return send(res, 429, { error: 'Demasiadas tarjetas seguidas.' })
    const mid = m[1] === 'e' ? -m[2] : +m[2], tok = m[1] + m[2], cur = SPORTS && SPORTS.ARCH ? SPORTS.ARCH.cardKey(mid) : null
    if (!cur) return send(res, 404, { error: 'Ese partido no existe.' })
    if (!SPORTS.ARCH.cardTokOk(mid, cur, String(url.searchParams.get('t') || ''))) return send(res, 403, { error: 'Abre la página del partido y vuelve a intentar.' })   // sin permiso de la página: no se acepta
    if (String(url.searchParams.get('k') || '') !== cur) return send(res, 409, { error: 'El marcador cambió.' })   // el marcador que dibujó el navegador debe ser el actual
    const had = db.prepare('SELECT k, at FROM match_cards WHERE mid = ?').get(mid); if (had && had.k === cur && now() - had.at < 6 * 3600e3) return send(res, 200, { kept: true })   // la tarjeta se renueva cada 6 horas: si alguien subió una imagen indebida, se corrige sola
    const chunks = []; let got = 0
    await new Promise((ok, bad) => { req.on('data', c => { got += c.length; if (got > 300e3) { req.destroy(); bad(Object.assign(new Error('La imagen pesa demasiado.'), { code: 413 })) } else chunks.push(c) }); req.on('end', ok); req.on('error', bad) })
    const b = Buffer.concat(chunks), d = jpegDims(b)
    if (!d || d.w !== 1200 || d.h !== 630) return send(res, 400, { error: 'La imagen no es válida.' })
    try { await storeMatchCard(mid, tok, cur, b); return send(res, 200, { ok: true }) } catch (e) { console.error('[tarjetas] no se guardó la tarjeta del partido:', e.message); return send(res, 502, { error: 'No se pudo guardar la tarjeta.' }) }
  }
  if (p === '/api/upload' && method === 'POST') {
    need()
    if (me.role !== 'admin' && limited('up:' + me.id, 40, 10 * 60e3)) return send(res, 429, { error: 'Estás subiendo muchos archivos. Espera unos minutos.' })
    if (pendingLocal.size > 3000) return send(res, 429, { error: 'Servidor ocupado. Inténtalo en un minuto.' })
    const b = await readBody(req), kind = b.kind, type = String(b.contentType || ''), size = +b.size
    if (kind === 'brand' && me.role !== 'admin') return send(res, 403, { error: 'Solo el administrador puede cambiar la marca.' })
    const LIM = { avatar: [/^image\/jpeg$/, 2e6], brand: [/^image\/(png|webp|jpeg|x-icon|vnd.microsoft.icon)$/, 2e6], image: [/^image\/(jpeg|png|webp)$/, (+S().imageMaxMB || 8) * 1e6], thumb: [/^image\/jpeg$/, 1e6], video: [/^video\/(mp4|webm|quicktime)$/, 60e6] }[kind]
    if (!LIM || !LIM[0].test(type)) return send(res, 400, { error: 'Formato no permitido. Usa JPG, PNG, MP4 o WEBM.' })
    if (!(size > 0) || size > LIM[1]) return send(res, 413, { error: kind === 'video' ? 'El video pesa demasiado (máximo 60 MB).' : 'La foto pesa demasiado.' })
    if (kind === 'video' && +b.duration > videoMax() + 0.5) return send(res, 400, { error: `El video dura más de ${videoMax()} segundos.` })
    const ext = { 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[type]
    const id = crypto.randomBytes(12).toString('hex') + (kind === 'thumb' ? '-t' : '')
    if (r2) {
      const key = `${kind === 'video' ? 'videos' : 'media'}/${new Date().toISOString().slice(0, 7)}/${id}.${ext}`
      const headers = { 'content-type': type, 'content-length': size }
      return send(res, 200, { uploadUrl: R2.presign(r2, { key, headers, expires: 900 }), headers: { 'content-type': type }, url: r2.publicUrl + '/' + key })
    }
    pendingLocal.set(id, { ext, size, type, user: me.id, exp: now() + 9e5 })
    return send(res, 200, { uploadUrl: '/api/upload/' + id, headers: { 'content-type': type }, url: `/uploads/${id}.${ext}` })
  }

  if ((m = /^\/api\/upload\/([a-f0-9]{24}(?:-t)?)$/.exec(p)) && method === 'PUT') {
    need(); const t = pendingLocal.get(m[1])
    if (!t || t.user !== me.id || t.exp < now()) return send(res, 403, { error: 'El permiso de subida venció. Inténtalo de nuevo.' })
    pendingLocal.delete(m[1])
    const file = path.join(UPLOADS, m[1] + '.' + t.ext); let got = 0
    await new Promise((ok, bad) => { const w = fs.createWriteStream(file); req.on('data', c => { got += c.length; if (got > t.size) { req.destroy(); w.destroy(); fs.rm(file, () => {}); bad(Object.assign(new Error('El archivo es más grande de lo indicado.'), { code: 413 })) } }); req.pipe(w); w.on('finish', ok); w.on('error', bad) })
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/rooms\/([^/]+)$/.exec(p))) {
    const city = decodeURIComponent(m[1])
    if (!city || city.length > 80) return send(res, 404, { error: 'Esa ciudad no tiene sala.' })
    if (method === 'POST') {
      need(); const b = await readBody(req), text = clean(b.text, 1000)
      if (!text) return send(res, 400, { error: 'Escribe un mensaje.' })
      { const bad = spamCheck(me, 'room', text); if (bad) return send(res, bad[0], { error: bad[1] }) }
      db.prepare('INSERT INTO room_messages (city, user_id, text, created_at) VALUES (?, ?, ?, ?)').run(city, me.id, text, now())
      broadcast({ type: 'room', city })
    }
    const msgs = db.prepare('SELECT r.id, r.text, r.created_at AS at, u.id AS user_id, u.name AS author, u.hue, u.avatar, (r.user_id = ?) AS mine FROM room_messages r JOIN users u ON u.id = r.user_id WHERE r.city = ? ORDER BY r.id DESC LIMIT 100').all(meId, city).reverse().map(x => ({ ...x, mine: !!x.mine }))
    const people = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM room_messages WHERE city = ? AND created_at > ?').get(city, now() - 864e5).n
    return send(res, 200, { city, messages: msgs, people })
  }

  if (p === '/api/tiles-status' && method === 'GET') {
    if (!me || me.role !== 'admin') return send(res, 403, { error: 'Solo el administrador.' })   // antes era público y recorría todo el caché de mapas en cada llamada (bloqueaba el servidor); ahora solo el administrador y con resultado guardado 5 min
    const count = d => { try { return fs.readdirSync(d, { recursive: true }).filter(f => /\.(png|jpg)$/.test(f)).length } catch { return 0 } }
    if (!tilesCount || Date.now() - tilesCount.t > 300e3) tilesCount = { t: Date.now(), v: Object.fromEntries(Object.keys(TILE_SRC).map(k => [k, count(path.join(TILES, k))])) }
    return send(res, 200, { cached: tilesCount.v, downloaded: tstats.ok, failed: tstats.fail, lastError: tstats.lastError, busy: slots })
  }

  if (p === '/api/stats' && method === 'GET') {
    return send(res, 200, db.prepare('SELECT (SELECT COUNT(*) FROM users WHERE is_example = 0) AS users, (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM comments) AS comments').get())
  }

  return send(res, 404, { error: 'No encontrado.' })
}

// ---------- map tiles: proxy + disk cache (browser only talks to planetapp) ----------
const TILE_SRC = {
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, ext: 'png' },
  night: { url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', max: 8, ext: 'png' },
  sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, ext: 'jpg' },
  labels: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', max: 19, ext: 'png' },
}
const TILES = path.join(DATA, 'tiles')
const inflight = new Map()
const pendingLocal = new Map()
// Limit simultaneous downloads per source and retry, so upstream servers don't reject us
// Two separate pools: people viewing the map (fast lane) and background prewarm (slow lane)
const slots = {}, waiting = {}, LIMIT = { u: 6, p: 2 }
const acquire = key => new Promise(r => { slots[key] ??= 0; waiting[key] ??= []; if (slots[key] < LIMIT[key[0]]) { slots[key]++; r() } else waiting[key].push(r) })
const release = key => { const n = waiting[key].shift(); if (n) n(); else slots[key]-- }
const tstats = { ok: 0, fail: 0, lastError: null }
const tileFile = (src, z, x, y) => path.join(TILES, src, String(z), String(x), y + '.' + TILE_SRC[src].ext)
async function fetchTile(src, z, x, y, lane = 'u') {
  const s = TILE_SRC[src], file = tileFile(src, z, x, y)
  try { const b = await fs.promises.readFile(file); const t = new Date(); fs.utimes(file, t, t, () => {}); return b } catch {}
  if (!inflight.has(file)) inflight.set(file, (async () => {
    const key = lane + ':' + src
    await acquire(key)
    try {
      let last
      for (let attempt = 0, tries = lane === 'u' ? 1 : 3; attempt < tries; attempt++) {
        try {
          const r = await fetch(s.url.replace('{z}', z).replace('{x}', x).replace('{y}', y), { headers: { 'User-Agent': 'planetapp/1.0 (map tiles cache)' }, signal: AbortSignal.timeout(lane === 'u' ? 4000 : 8000) })
          if (!r.ok) throw new Error('upstream ' + r.status)
          const buf = Buffer.from(await r.arrayBuffer())
          await fs.promises.mkdir(path.dirname(file), { recursive: true })
          await fs.promises.writeFile(file, buf)
          tstats.ok++
          return buf
        } catch (e) { last = e; await new Promise(r => setTimeout(r, 600 * (attempt + 1))) }
      }
      tstats.fail++; tstats.lastError = `${src} ${z}/${x}/${y}: ${last?.message}`
      throw last
    } finally { release(key) }
  })().finally(() => inflight.delete(file)))
  return inflight.get(file)
}
async function tile(res, src, z, x, y) {
  const s = TILE_SRC[src], n = 2 ** z
  if (!s || z < 0 || z > s.max || x < 0 || y < 0 || x >= n || y >= n) { res.writeHead(404); return res.end() }
  try {
    const buf = await fetchTile(src, z, x, y)
    res.writeHead(200, { 'Content-Type': s.ext === 'jpg' ? 'image/jpeg' : 'image/png', 'Cache-Control': 'public, max-age=604800' }); res.end(buf)
  } catch { res.writeHead(502, { 'Cache-Control': 'no-store' }); res.end() }
}
// Pre-download the world view in the background so the first screen is complete
async function prewarm() {
  const jobs = []
  for (let z = 0; z <= 3; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) jobs.push(['osm', z, x, y])
  let ok = 0, done = 0
  console.log(`Precargando mapa mundial: ${jobs.length} imágenes en segundo plano…`)
  await Promise.all([0, 1].map(async w => { for (let i = w; i < jobs.length; i += 2) { const [src, z, x, y] = jobs[i]; try { await fetchTile(src, z, x, y, 'p'); ok++ } catch {} if (++done % 100 === 0) console.log(`  precarga ${done}/${jobs.length}`) } }))
  console.log(`Mapa mundial precargado: ${ok}/${jobs.length} imágenes en caché.` + (ok < jobs.length ? ' Último error: ' + tstats.lastError : ''))
}
setTimeout(() => prewarm().catch(() => {}), 2000)
// remove map tiles nobody has viewed in 30 days (world view tiles are re-used constantly, so they stay)
async function cleanTiles() {
  let n = 0; const limit = Date.now() - 30 * 864e5
  const walk = async d => { for (const e of await fs.promises.readdir(d, { withFileTypes: true }).catch(() => [])) { const f = path.join(d, e.name); if (e.isDirectory()) await walk(f); else { const st = await fs.promises.stat(f).catch(() => null); if (st && st.mtimeMs < limit) { await fs.promises.rm(f).catch(() => {}); n++ } } } }
  await walk(TILES); if (n) console.log(`Caché de mapas: ${n} imágenes viejas eliminadas.`)
}
setInterval(() => cleanTiles().catch(() => {}), 864e5).unref();
setInterval(() => { try {
  for (const u of db.prepare('SELECT id, biz_name, featured_until FROM users WHERE featured_until BETWEEN ? AND ?').all(Date.now(), Date.now() + 3 * 864e5))
    for (const a of db.prepare("SELECT id FROM users WHERE role = 'admin'").all())
      if (!db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'bizexp' AND actor_id = ? AND created_at > ?").get(a.id, u.id, Date.now() - 4 * 864e5)) notify(a.id, 'bizexp', u.id, null, (u.biz_name || 'Un negocio') + ' deja de estar destacado el ' + new Date(u.featured_until).toLocaleDateString('es-CO'))
} catch {} }, 36e5).unref(); setTimeout(() => cleanTiles().catch(() => {}), 60000).unref()

// ---------- static ----------
const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const { pipeline } = require('stream'), zlib = require('zlib')
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest'])
const gzCache = new Map() // estáticos comprimidos en memoria (tope 16 MB)
let gzBytes = 0
function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end() }
    const ext = path.extname(file), type = TYPES[ext] || 'application/octet-stream'
    const h = { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', ETag: `W/"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`, Vary: 'Accept-Encoding' }
    if (req.headers['if-none-match'] === h.ETag) { res.writeHead(304, h); return res.end() }
    if (req.method === 'HEAD') { h['Content-Length'] = st.size; res.writeHead(200, h); return res.end() }
    const fail = e => { if (e && !res.headersSent) { res.writeHead(500); res.end() } }
    // compresión de texto: los .js/.css de Vite llevan hash en el nombre, se comprimen una sola vez
    const ae = req.headers['accept-encoding'] || '', enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null
    if (COMPRESSIBLE.has(ext) && st.size > 1024 && enc) {
      const k = enc + ':' + file + ':' + h.ETag, hit = gzCache.get(k)
      const out = buf => { res.writeHead(200, { ...h, 'Content-Encoding': enc, 'Content-Length': buf.length }); res.end(buf) }
      if (hit) return out(hit)
      return fs.readFile(file, (e, raw) => {
        if (e) return fail(e)
        const done = (e2, buf) => {
          if (e2) return fail(e2)
          if (gzBytes + buf.length < 16 * 1024 * 1024) { gzCache.set(k, buf); gzBytes += buf.length }
          out(buf)
        }
        // Brotli (≈15 % menos que gzip) en los navegadores que lo aceptan; se comprime una sola vez y queda en memoria
        if (enc === 'br') zlib.brotliCompress(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }, done)
        else zlib.gzip(raw, { level: 9 }, done)
      })
    }
    // Range: necesario para adelantar/retroceder videos (Safari/iOS lo exige)
    let start = 0, end = st.size - 1, code = 200
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
    if (r && (r[1] || r[2])) {
      if (r[1]) { start = +r[1]; if (r[2]) end = Math.min(end, +r[2]) } else { start = Math.max(0, st.size - +r[2]) }
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end() }
      code = 206; h['Content-Range'] = `bytes ${start}-${end}/${st.size}`
    }
    h['Content-Length'] = end - start + 1
    res.writeHead(code, h)
    // pipeline cierra el archivo si el visitante se va a mitad de la descarga (con .pipe quedaba abierto)
    pipeline(fs.createReadStream(file, { start, end }), res, () => {})
  })
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader(S().cspEnforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', CSP); res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()')
  try {
    const url = new URL(req.url, 'http://x')
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    const t = /^\/tiles\/(osm|night|sat|labels)\/(\d+)\/(\d+)\/(\d+)\.(?:png|jpg)$/.exec(url.pathname)
    if (t) return await tile(res, t[1], +t[2], +t[3], +t[4])
    if (url.pathname === '/portal.css' && SPORTS && SPORTS.ARCH) {
      const css = Buffer.from(SPORTS.ARCH.css()), ae = String(req.headers['accept-encoding'] || ''), h = { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': url.searchParams.get('v') ? 'public, max-age=31536000, immutable' : 'no-cache', Vary: 'Accept-Encoding' }
      if (/\bgzip\b/.test(ae)) { h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); return res.end(zlib.gzipSync(css, { level: 6 })) }
      res.writeHead(200, h); return res.end(css)
    }
    const ogm = /^\/og\/p\/(\d+)\.jpg$/.exec(url.pathname)
    if (ogm) { const ci = cardInfo(ogm[1]); if (ci && ci.url) { res.writeHead(302, { Location: ci.url, 'Cache-Control': 'public, max-age=120' }); return res.end() } return serveFile(req, res, cardFile(ogm[1]), 'public, max-age=120') }
    const ogmm = /^\/og\/m\/([es]\d+)\.jpg$/.exec(url.pathname)
    if (ogmm) { const mid = ogmm[1][0] === 'e' ? -ogmm[1].slice(1) : +ogmm[1].slice(1), c = db.prepare('SELECT url FROM match_cards WHERE mid = ?').get(mid); if (c && c.url) { res.writeHead(302, { Location: c.url, 'Cache-Control': 'public, max-age=120' }); return res.end() } return serveFile(req, res, mcardFile(ogmm[1]), 'public, max-age=120') }
    if (url.pathname.startsWith('/uploads/')) {
      const f = path.join(UPLOADS, path.basename(url.pathname))
      return serveFile(req, res, f, 'public, max-age=31536000, immutable')
    }
    if (url.pathname === '/manifest.webmanifest') { const st = S(); const icon = st.favicon || './icon.svg'; res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }); return res.end(JSON.stringify({ name: st.name, short_name: st.name.slice(0, 12), description: st.description, start_url: './', display: 'standalone', background_color: st.colors.bg, theme_color: st.colors.bg, icons: [{ src: icon, sizes: 'any', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', purpose: 'any' }] })) }
    // páginas de resultados (HTML propio, permanente): /partidos, /partidos/AAAA-MM-DD, /partido/e123-…, /liga/eng.1
    if (SPORTS && SPORTS.ARCH && /^\/(partidos|partido|ligas|liga)(\/|$)/.test(url.pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
      const origin = portalOrigin(req), ck = origin + url.pathname, ae = String(req.headers['accept-encoding'] || ''), enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : ''
      let ent = portalCache.get(ck)
      if (!ent || ent.exp < Date.now()) {
        const pg = await SPORTS.ARCH.page(url.pathname).catch(() => null)
        if (pg && pg.location) { res.writeHead(301, { Location: origin + pg.location, 'Cache-Control': 'public, max-age=86400' }); return res.end() }   // partido ya borrado: su enlace lleva a su liga
        if (!pg) ent = null
        else {
          const html = pg.html.replace(/__ORIGIN_ENC__/g, encodeURIComponent(origin)).replace(/__ORIGIN__/g, origin).replace(/__HOST__/g, origin.replace(/^https?:\/\/(www\.)?/, ''))
          ent = { status: pg.status, cache: pg.cache || 60, html: Buffer.from(html), exp: Date.now() + (pg.status === 200 ? Math.min(5, pg.cache || 5) * 1000 : 3000) }
          const prev = portalCache.get(ck); if (prev) portalBytes -= prev.html.length * 2
          while ((portalCache.size > 300 || portalBytes > 40e6) && portalCache.size) { const k0 = portalCache.keys().next().value; portalBytes -= portalCache.get(k0).html.length * 2; portalCache.delete(k0) }
          portalCache.set(ck, ent); portalBytes += ent.html.length * 2
        }
      }
      if (ent) {
        const h = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': ent.status === 200 ? (ent.cache <= 60 ? 'public, max-age=0, must-revalidate' : 'public, max-age=' + ent.cache) : 'no-store', Vary: 'Accept-Encoding' }
        if (req.method === 'HEAD') { res.writeHead(ent.status, h); return res.end() }
        if (enc) { try { ent[enc] = ent[enc] || (enc === 'br' ? zlib.brotliCompressSync(ent.html, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }) : zlib.gzipSync(ent.html, { level: 6 })); h['Content-Encoding'] = enc; res.writeHead(ent.status, h); return res.end(ent[enc]) } catch { /* sin comprimir */ } }
        res.writeHead(ent.status, h); return res.end(ent.html)
      }
    }
    let dp; try { dp = decodeURIComponent(url.pathname) } catch { res.writeHead(400); return res.end() }
    if (dp.includes('\0')) { res.writeHead(400); return res.end() }
    let file = path.normalize(path.join(ROOT, dp))
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end() }
    fs.stat(file, (err, st) => {
      // un archivo de /assets/ que ya no existe (pestaña abierta con versión vieja) debe dar 404, no la página de inicio disfrazada de .js
      if (err && dp.startsWith('/assets/')) { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end() }
      if (err || st.isDirectory()) file = path.join(ROOT, 'index.html')
      if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
        const st4 = S(), origin = (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers['x-forwarded-host'] || req.headers.host)
        if (url.pathname === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(st4.indexable === false ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`) }
        // publicaciones que duran (el pin de un partido desaparece en horas): los partidos entran por sus páginas permanentes /partido y /liga
        { const hit = smCache.get(origin); if (hit && Date.now() - hit.t < 600e3) { res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); return res.end(hit.v) } }   // el mapa del sitio se arma una vez cada 10 minutos
        const rows = db.prepare('SELECT id, created_at FROM posts WHERE match IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 5000').all(Date.now())
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
        const xml = (`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><changefreq>hourly</changefreq></url><url><loc>${origin}/terminos</loc></url><url><loc>${origin}/privacidad</loc></url>${SPORTS && SPORTS.ARCH ? SPORTS.ARCH.sitemapUrls(origin) : ''}${rows.map(r => `<url><loc>${origin}/p/${r.id}</loc><lastmod>${new Date(r.created_at).toISOString().slice(0, 10)}</lastmod></url>`).join('')}</urlset>`)
        if (smCache.size > 6) smCache.clear(); smCache.set(origin, { t: Date.now(), v: xml }); return res.end(xml)
      }
      if (url.pathname === '/terminos' || url.pathname === '/privacidad') {
        const st3 = S(), n = String(st3.name).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), terms = url.pathname === '/terminos'
        let body = terms ? `<h1>Términos de uso de ${n}</h1>
<p>${n} es una red social para descubrir y compartir lo que pasa en el mundo: eventos, lugares, planes, noticias y vida diaria, ubicados en un mapa.</p>
<h2>Tu cuenta</h2><p>Eres responsable de lo que publicas y de cuidar tu contraseña. Debes tener al menos 14 años.</p>
<h2>Lo que puedes publicar</h2><p>Publica solo fotos, videos y textos que sean tuyos o que tengas permiso de compartir. No se permite contenido ilegal, violento, sexual explícito, de odio, acoso, estafas ni información falsa a propósito.</p>
<h2>Moderación</h2><p>Cualquier persona puede reportar una publicación. El equipo de ${n} puede ocultar publicaciones o suspender cuentas que incumplan estas reglas.</p>
<h2>Negocios</h2><p>Las cuentas de negocio son responsables de sus ofertas, precios y horarios. El destacado mensual es un servicio de visibilidad y no garantiza ventas.</p>
<h2>Cambios</h2><p>Podemos actualizar estos términos; la versión vigente siempre está en esta página.</p>` : `<h1>Política de privacidad de ${n}</h1>
<h2>Qué datos guardamos</h2><p>Tu correo, nombre, foto de perfil, ciudad, lo que publicas (textos, fotos, videos y su ubicación en el mapa), tus mensajes y comentarios.</p>
<h2>Para qué</h2><p>Para que la red funcione: mostrar tus publicaciones en el mapa, entregarte mensajes y notificaciones, y mantener la comunidad segura. No vendemos tus datos.</p>
<h2>Qué es público</h2><p>Tus publicaciones, tu nombre, tu foto y tu ciudad son visibles para todos. Tus mensajes privados solo los ven tú y la otra persona.</p>
<h2>Dónde se guardan</h2><p>Los datos se guardan en nuestro servidor y las fotos y videos en Cloudflare R2. Hacemos copias de seguridad diarias.</p>
<h2>Tus derechos</h2><p>Puedes editar tu perfil y borrar tus publicaciones cuando quieras. Para borrar tu cuenta por completo, escríbenos${st3.bizContact ? ' por WhatsApp al ' + String(st3.bizContact).replace(/[^\d+ ]/g, '') : ''}.</p>`
        const custom = terms ? st3.legalTerms : st3.legalPrivacy
        if (custom) body = String(custom).replace(/\{name\}/g, st3.name).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).split(/\n{2,}/).map(b => b.startsWith('# ') ? `<h1>${b.slice(2)}</h1>` : b.startsWith('## ') ? `<h2>${b.slice(3)}</h2>` : `<p>${b.replace(/\n/g, '<br>')}</p>`).join('')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
        return res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${terms ? 'Términos' : 'Privacidad'} · ${n}</title><style>body{margin:0;background:#0b0f15;color:#cfd6dc;font:15px/1.6 system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:32px 16px 60px}h1{color:#fff;font-size:26px}h2{color:#fff;font-size:17px;margin-top:26px}a{color:#5cc8b0}</style></head><body><main><p><a href="/">← Volver a ${n}</a></p>${body}<p style="margin-top:40px;font-size:13px"><a href="/terminos">Términos</a> · <a href="/privacidad">Privacidad</a></p></main></body></html>`)
      }
      if (file.endsWith('index.html')) return fs.readFile(file, 'utf8', (e, html) => {
        if (e) { res.writeHead(404); return res.end() }
        const st2 = S(), esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
        html = html.replace(/<title>.*?<\/title>/, `<title>${esc(st2.seoTitle || st2.name + ' · ' + st2.tagline)}</title>`).replace(/(<meta name="description" content=")[^"]*/, '$1' + esc(st2.description)).replace(/(<meta name="theme-color" content=")[^"]*/, '$1' + esc(st2.colors.bg))
        if (st2.favicon) html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${esc(st2.favicon)}" />`)
        const origin = (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers['x-forwarded-host'] || req.headers.host)
        const abs = u => !u ? '' : u.startsWith('http') ? u : origin + u
        const pm = /^\/p\/(\d+)$/.exec(url.pathname), card = pm && cardInfo(pm[1]), sp = pm && db.prepare('SELECT p.title, p.text, p.city, p.country, p.image, p.thumb, p.scene FROM posts p WHERE p.id = ?').get(+pm[1])
        const mx = pm && sp && SPORTS && SPORTS.ARCH && SPORTS.ARCH.postMatch ? SPORTS.ARCH.postMatch(pm[1]) : null   // el partido tiene su página permanente
        const gone = pm && !sp && SPORTS && SPORTS.ARCH && SPORTS.ARCH.goneInfo ? SPORTS.ARCH.goneInfo(pm[1]) : null   // publicación del mapa de un partido que ya terminó
        const ogT = gone ? `${gone.title} · ${gone.city}` : sp ? `${sp.title} · ${sp.city}` : st2.name, ogD = gone ? (gone.text || `${gone.city}${gone.country ? ', ' + gone.country : ''} · en ${st2.name}`) : sp ? (sp.text || `${sp.city}${sp.country ? ', ' + sp.country : ''} · en ${st2.name}`) : st2.description, ogI = mx && mx.card ? origin + '/og/m/' + mx.tok + '.jpg?v=' + Math.floor(mx.card.at / 1000) : gone ? (card ? (card.url || origin + '/og/p/' + pm[1] + '.jpg?v=' + Math.floor(card.at / 1000)) : gone.og ? origin + gone.og : abs(st2.ogImage || st2.logoDark || st2.favicon)) : sp ? (card ? (card.url || origin + '/og/p/' + pm[1] + '.jpg?v=' + Math.floor(card.at / 1000)) : abs(sp.image || sp.thumb || st2.ogImage)) : abs(st2.ogImage || st2.logoDark || st2.favicon)
        html = html.replace('</head>', `<meta property="og:site_name" content="${esc(st2.name)}" /><meta property="og:title" content="${esc(ogT)}" /><meta property="og:description" content="${esc(String(ogD).slice(0, 200))}" />${ogI ? `<meta property="og:image" content="${esc(ogI)}" />${card ? '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:type" content="image/jpeg" />' : ''}<meta name="twitter:card" content="summary_large_image" />` : ''}<meta property="og:url" content="${esc(origin + url.pathname)}" /><meta property="og:type" content="website" /><meta property="og:locale" content="es_LA" />${st2.seoKeywords ? `<meta name="keywords" content="${esc(st2.seoKeywords)}" />` : ''}${st2.googleVerify ? `<meta name="google-site-verification" content="${esc(st2.googleVerify)}" />` : ''}${st2.indexable === false ? '<meta name="robots" content="noindex" />' : ''}<link rel="canonical" href="${esc(origin + url.pathname)}" /><meta name="twitter:title" content="${esc(ogT)}" /><meta name="twitter:description" content="${esc(String(ogD).slice(0, 200))}" />${ogI ? `<meta name="twitter:image" content="${esc(ogI)}" />` : ''}</head>`)
        if (sp || gone) html = html.replace(/<title>.*?<\/title>/, `<title>${esc(ogT)} · ${esc(st2.name)}</title>`)
        if (mx && mx.url) html = html.replace('</head>', `<link rel="canonical" href="${esc(origin + mx.url)}" /><meta property="og:url" content="${esc(origin + mx.url)}" /></head>`)   // una sola dirección para todos los que comparten el partido
        if (gone && gone.url) html = html.replace('</head>', `<link rel="canonical" href="${esc(origin + gone.url)}" /><meta http-equiv="refresh" content="0;url=${esc(gone.url)}" /></head>`)   // las personas pasan a la página del partido; Facebook y Google leen la imagen de arriba
        res.writeHead(pm && !sp && !gone ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(html)   // una publicación que ya no existe responde 404 de verdad (antes 200: Google la tomaba por error suave)
      })
      serveFile(req, res, file, url.pathname === '/sw.js' || (url.pathname === '/portal.js' && !url.searchParams.get('v')) ? 'no-cache' : 'public, max-age=31536000')
    })
  } catch (e) {
    if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : 'Error del servidor. Inténtalo de nuevo.' })
    if (!e.code) console.error(e)
  }
}).listen(PORT, () => console.log(`planetapp en el puerto ${PORT} · base de datos en ${DATA} · fotos y videos en ${r2 ? 'Cloudflare R2 (' + r2.bucket + ')' : 'disco local'}`))

// ---------- example content on first run ----------
const SEED_MARK = path.join(DATA, '.ejemplos-creados'), seedDone = fs.existsSync(SEED_MARK)
if (!seedDone) fs.writeFileSync(SEED_MARK, String(Date.now()))
if (!seedDone && !db.prepare('SELECT 1 FROM posts LIMIT 1').get()) {
  const seed = require('./seed.json')
  const ins = db.prepare('INSERT OR IGNORE INTO users (name, handle, pass, hue, is_example, created_at) VALUES (?, ?, ?, ?, 1, ?)')
  const uid = db.prepare('SELECT id FROM users WHERE handle = ?')
  const insPost = db.prepare('INSERT INTO posts (user_id, title, text, cat, city, type, scene, base_likes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (const s of seed) {
    ins.run(s.author, s.handle, 'x:' + crypto.randomBytes(16).toString('hex'), s.hue, now())
    insPost.run(uid.get(s.handle).id, s.title, s.text, s.cat, s.city, s.type, s.scene, s.likes, now() - s.minutesAgo * 60000)
  }
  console.log(`Base de datos creada con ${seed.length} publicaciones de ejemplo.`)
}

// ---------- negocio de ejemplo (una sola vez, para ver cómo luce) ----------
try { db.exec('ALTER TABLE stations ADD COLUMN owner_id INTEGER') } catch {}
try { db.exec('ALTER TABLE posts ADD COLUMN match TEXT') } catch {}
try { db.exec('ALTER TABLE posts ADD COLUMN info TEXT') } catch {}
try { db.exec('ALTER TABLE posts ADD COLUMN challenge TEXT'); db.exec('CREATE INDEX IF NOT EXISTS posts_challenge ON posts(challenge)') } catch {}
const DEMO_MARK = path.join(DATA, '.negocio-ejemplo')
const demoDone = fs.existsSync(DEMO_MARK)
if (!demoDone) fs.writeFileSync(DEMO_MARK, String(Date.now()))
if (!demoDone && !db.prepare("SELECT 1 FROM users WHERE handle = 'cafelamuralla'").get()) {
  const t0 = now()
  db.prepare("INSERT INTO users (name, handle, pass, hue, is_example, created_at, city, country, biz, biz_name, biz_type, biz_lat, biz_lon, biz_address, biz_hours, biz_whatsapp, featured_until, verified) VALUES ('Café La Muralla', 'cafelamuralla', ?, 30, 1, ?, 'Cartagena', 'Colombia', 1, 'Café La Muralla', 'cafe', 10.4236, -75.5503, 'Calle del Arsenal, Centro Histórico, Cartagena', 'Lun a Dom · 7:00 a. m. – 10:00 p. m.', '573000000000', ?, 1)").run('x:' + crypto.randomBytes(16).toString('hex'), t0, t0 + 30 * 864e5)
  db.prepare('UPDATE users SET biz_until = ? WHERE biz = 1 AND is_example = 1 AND biz_until IS NULL').run(BIZ_FOREVER)
  const id = db.prepare("SELECT id FROM users WHERE handle = 'cafelamuralla'").get().id
  const ins = db.prepare('INSERT INTO posts (user_id, title, text, cat, city, type, scene, base_likes, created_at, lat, lon, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  ins.run(id, '2x1 en café frío toda la tarde', 'Hoy de 3 a 6 p. m. el segundo café frío va por nuestra cuenta. Frente a la muralla, con brisa del mar.', 'lugares', 'Cartagena', 'usuario', 'cafe', 64, t0 - 20 * 60000, 10.4236, -75.5503, t0 + 7 * 864e5)
  ins.run(id, 'Música en vivo el viernes', 'Trío de boleros desde las 8 p. m. Entrada libre, reserva tu mesa por WhatsApp.', 'eventos', 'Cartagena', 'usuario', 'concierto', 38, t0 - 3 * 3600e3, 10.4236, -75.5503, t0 + 7 * 864e5)
  console.log('Negocio de ejemplo creado: Café La Muralla (Cartagena)')
}

// ---------- copia de seguridad diaria de la base de datos (guarda las últimas 7) ----------
const BK = path.join(DATA, 'backups')
function backup() {
  try {
    fs.mkdirSync(BK, { recursive: true })
    const f = path.join(BK, 'planeta-' + new Date().toISOString().slice(0, 10) + '.db')
    if (fs.existsSync(f)) return
    db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`)
    const old = fs.readdirSync(BK).filter(n => /^planeta-\d{4}-\d\d-\d\d\.db$/.test(n)).sort().slice(0, -7)
    for (const n of old) fs.unlinkSync(path.join(BK, n))
    console.log('Copia de seguridad guardada:', f)
  } catch (e) { console.error('No se pudo hacer la copia de seguridad:', e.message) }
}
// copia cifrada fuera del servidor (Cloudflare R2): el bucket es público, por eso el archivo va cifrado con AES-256-GCM y la clave sale del secreto del servidor
// (data/secret.key: guarda una copia suya aparte). Rotación de 7 archivos (uno por día de la semana, sin listar nada). Restaurar: node restore-backup.js
function backupKey() { return crypto.createHash('sha256').update('planeta-backup:' + fs.readFileSync(path.join(DATA, 'secret.key'), 'utf8').trim()).digest() }
async function backupR2() {
  if (!r2) return
  try {
    const day = new Date().toISOString().slice(0, 10), f = path.join(BK, 'planeta-' + day + '.db'); if (!fs.existsSync(f)) return
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', backupKey(), iv), data = Buffer.concat([c.update(fs.readFileSync(f)), c.final()])
    await R2.put(r2, `backups/planeta-dia${new Date().getUTCDay()}.db.enc`, Buffer.concat([iv, c.getAuthTag(), data]), 'application/octet-stream')
    console.log('Copia cifrada subida a Cloudflare R2:', day)
  } catch (e) { console.error('No se pudo subir la copia a R2:', e.message) }
}
let bkR2Day = ''
async function backupAll() { backup(); const d = new Date().toISOString().slice(0, 10); if (bkR2Day !== d) { await backupR2(); if (fs.existsSync(path.join(BK, 'planeta-' + d + '.db'))) bkR2Day = d } }
setTimeout(() => backupAll().catch(() => {}), 60e3).unref()
setInterval(() => backupAll().catch(() => {}), 6 * 3600e3).unref()

// ---------- activar lo pagado (una sola vez por pago) ----------
function applyPayment(pay) {
  const ok = db.prepare("UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ? AND status != 'paid'").run(now(), pay.id).changes
  if (!ok) return
  const st = S(), month = (+(pay.item === 'radio' ? st.planRadio : pay.item === 'evento' ? st.planEvento : st.planBiz)?.days || 30) * 864e5
  if (pay.item === 'radio') { const st = db.prepare('SELECT paid_until FROM stations WHERE id = ?').get(pay.target_id); if (st) db.prepare('UPDATE stations SET paid_until = ? WHERE id = ?').run(Math.max(now(), st.paid_until || 0) + month, pay.target_id); stCache = null; broadcast({ type: 'stations' }) }
  else if (pay.item === 'evento') { const x = db.prepare('SELECT promo_until FROM posts WHERE id = ?').get(pay.target_id); if (x) { const hasta = Math.max(now(), x.promo_until || 0) + month; db.prepare('UPDATE posts SET promo_until = ?, expires_at = CASE WHEN expires_at IS NULL THEN NULL ELSE MAX(expires_at, ?) END WHERE id = ?').run(hasta, hasta, pay.target_id) } }
  else { const u = db.prepare('SELECT featured_until, biz_until FROM users WHERE id = ?').get(pay.target_id); if (u) { db.prepare('UPDATE users SET featured_until = ?, biz_until = ?, biz_flag = 0 WHERE id = ?').run(Math.max(now(), u.featured_until || 0) + month, Math.min(BIZ_FOREVER, Math.max(now(), u.biz_until || 0) + month), pay.target_id); placesCache.clear(); bizListCache = null } broadcast({ type: 'post' }) }
  console.log('Pago aprobado:', pay.ref, pay.item, pay.amount, pay.currency, pay.provider)
}
// por si alguien paga y no vuelve a la web: revisar los pendientes de los últimos 2 días
setInterval(async () => {
  for (const pay of db.prepare("SELECT * FROM payments WHERE status = 'pending' AND created_at > ? ORDER BY id DESC LIMIT 50").all(now() - 2 * 864e5)) {
    try { if (await PAY.check(pay)) applyPayment(pay) } catch {}
  }
}, 10 * 60e3).unref()

// ---------- paseos: helpers ----------
let walksCache = null
const walkViewers = new Map(), walkMsgRate = new Map(), walkPts = new Map()
const viewersOf = id => { const v = walkViewers.get(id); if (!v) return 0; let n = 0; for (const [k, t] of v) { if (now() - t > 70e3) v.delete(k); else n++ } return n }
function walkInfo(id) {
  const w = db.prepare('SELECT w.*, u.name, u.avatar, u.hue, u.handle FROM walks w JOIN users u ON u.id = w.user_id WHERE w.id = ?').get(id); if (!w) return null
  return { id: w.id, userId: w.user_id, name: w.name, avatar: w.avatar, hue: w.hue, title: w.title, city: w.city, startedAt: w.started_at, endedAt: w.ended_at, lat: w.last_lat, lon: w.last_lon, at: w.last_at, dist: Math.round(w.dist), viewers: viewersOf(w.id), live: !w.ended_at }
}
function liveWalks() {
  if (walksCache && walksCache.t > now() - 5000) return walksCache.v
  const v = db.prepare('SELECT id FROM walks WHERE ended_at IS NULL ORDER BY last_at DESC LIMIT 200').all().map(r => walkInfo(r.id))
  walksCache = { t: now(), v }; return v
}
const metres = (a, b, c, d) => { const R = 6371e3, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * R }
function walkStep(w, lat, lon) {
  const d = w.last_lat == null ? 0 : metres(w.last_lat, w.last_lon, lat, lon)
  if (d > 2000) return // salto imposible caminando: se ignora
  db.prepare('UPDATE walks SET last_lat = ?, last_lon = ?, last_at = ?, dist = dist + ? WHERE id = ?').run(lat, lon, now(), d, w.id)
  let n = walkPts.get(w.id); if (n === undefined) { n = db.prepare('SELECT COUNT(*) n FROM walk_points WHERE walk_id = ?').get(w.id).n }
  if (n < 20000) { db.prepare('INSERT INTO walk_points VALUES (?, ?, ?, ?)').run(w.id, lat, lon, now()); n++ }
  walkPts.set(w.id, n)
  broadcast({ type: 'walkpos', walk: w.id, lat, lon, dist: Math.round(w.dist + d), viewers: viewersOf(w.id) })
}
// paseos sin señal por 10 min se terminan solos; borrar puntos de paseos de hace más de 30 días
let maintTick = 0
setInterval(() => { try {
  const old = db.prepare('SELECT id FROM walks WHERE ended_at IS NULL AND last_at < ?').all(now() - 10 * 60e3)
  for (const w of old) { db.prepare('UPDATE walks SET ended_at = last_at WHERE id = ?').run(w.id); broadcast({ type: 'walkend', walk: w.id }) }
  if (old.length) { walksCache = null; broadcast({ type: 'walks' }) }
  const hourly = maintTick++ % 60 === 0   // lo pesado (recorrer tablas grandes) una vez por hora
  if (hourly) db.prepare('DELETE FROM walk_points WHERE t < ?').run(now() - 30 * 864e5)
  for (const [id] of walkViewers) if (!viewersOf(id)) walkViewers.delete(id)
  if (walkMsgRate.size > 5000) walkMsgRate.clear()
  if (walkPts.size > 500) walkPts.clear()
  for (const [k, h] of hits) if (h.t < Date.now()) hits.delete(k)
  if (hourly) db.prepare('DELETE FROM sessions WHERE created_at < ?').run(now() - 90 * 864e5)
  for (const [k, v] of pendingLocal) if (v.exp < now()) pendingLocal.delete(k)   // permisos de subida vencidos (antes nunca se limpiaban)
} catch {} }, 60e3).unref()

// ---------- todo es en vivo: las publicaciones se borran solas pasado un tiempo (panel → Configuración) ----------
function purgeOld() { try {
  const h = +S().postTTLHours; if (!(h > 0)) return
  const limit = now() - h * 3600e3
  // solo las publicaciones con VIDEO se borran pasadas h horas; las de foto o texto se quedan
  const rows = db.prepare('SELECT id, image, thumb, video FROM posts WHERE video IS NOT NULL AND created_at < ?').all(limit)
  if (!rows.length) return
  for (const r of rows) delPost(r.id)
  broadcast({ type: 'post' }); console.log('Publicaciones vencidas borradas:', rows.length)
} catch (e) { console.error('limpieza', e.message) } }
setTimeout(purgeOld, 30e3).unref(); setInterval(purgeOld, 15 * 60e3).unref()
// tarjetas de partido de publicaciones que ya no existen (borradas a mano, vencidas o por el administrador): se quitan de Cloudflare R2 o del disco
function cleanCards() { try {
  try {
    for (const c of db.prepare('SELECT mid, key FROM match_cards WHERE mid NOT IN (SELECT id FROM match_archive)').all()) { if (r2 && c.key) R2.del(r2, c.key).catch(() => {}); else try { fs.unlinkSync(mcardFile((c.mid < 0 ? 'e' + -c.mid : 's' + c.mid))) } catch { /* ya no está */ } db.prepare('DELETE FROM match_cards WHERE mid = ?').run(c.mid) }
  } catch { /* nada */ }
  if (r2) for (const c of db.prepare('SELECT post_id, key FROM og_cards WHERE post_id NOT IN (SELECT id FROM posts) AND post_id NOT IN (SELECT post_id FROM post_gone)').all()) { R2.del(r2, c.key).catch(() => {}); db.prepare('DELETE FROM og_cards WHERE post_id = ?').run(c.post_id) }
  else if (fs.existsSync(CARDS)) for (const f of fs.readdirSync(CARDS)) { const m = /^(\d+)\.jpg$/.exec(f); if (m && !db.prepare('SELECT 1 FROM posts WHERE id = ?').get(+m[1])) fs.unlink(path.join(CARDS, f), () => {}) }
} catch (e) { console.error('limpieza de tarjetas', e.message) } }
setTimeout(cleanCards, 120e3).unref(); setInterval(cleanCards, 36e5).unref()

SPORTS = require('./sports')({ db, S, UPLOADS, R2, r2, save: ADMIN.saveSettings, secret: ADMIN.secret, WORLD, broadcast: (ev, to) => { broadcast(ev, to); if (ev && ev.type === 'goal' && ev.map !== false) PUSH.goal(ev); if (ev && (ev.type === 'goal' || ev.type === 'matchev')) PUSH.team(ev) }, now })
WDEV = require('./wdevents')({ db, S, now, publicUrl, R2, r2 })
TV = require('./tv')({ db, now, putImage: putExternalImage, secret: ADMIN.secret })
EXTRAS = require('./extras')({ db, S, broadcast, now })
FEST = require('./festivals')({ db, S, broadcast, now, WORLD })
SITES = require('./sites')({ db, now })
// Interruptores del panel: al APAGAR una función, lo que ya estaba publicado por ella sale del mapa y de las listas en el momento
// (antes solo dejaba de buscar contenido nuevo y lo viejo seguía a la vista). Al volver a encenderla, el contenido se vuelve a publicar solo.
function purgeOff() {
  const st = S(), del = rows => { let n = 0; for (const r of rows) if (r.post_id) n += db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id).changes; return n }
  let n = 0
  for (const [flag, kind] of [['quakesOn', 'quake']]) if (st[flag] === false) { n += del(db.prepare('SELECT post_id FROM extra_items WHERE kind = ?').all(kind)); db.prepare('DELETE FROM extra_items WHERE kind = ?').run(kind) }
  if (st.wdEventsOn === false) { n += del(db.prepare('SELECT post_id FROM wd_event_posts').all()); db.prepare('DELETE FROM wd_event_posts').run() }
  if (st.festivalsOn === false) { n += del(db.prepare("SELECT post_id FROM fest_posts WHERE key NOT LIKE 'h:%'").all()); db.prepare("DELETE FROM fest_posts WHERE key NOT LIKE 'h:%'").run() }
  if (st.holidaysOn === false) { n += del(db.prepare("SELECT post_id FROM fest_posts WHERE key LIKE 'h:%'").all()); db.prepare("DELETE FROM fest_posts WHERE key LIKE 'h:%'").run() }
  if (!st.sportsOn) { n += del(db.prepare('SELECT post_id FROM sport_fixtures').all()); db.prepare('DELETE FROM sport_fixtures').run() }
  if (n) broadcast({ type: 'post' })
  return n
}
// una sola vez: se apagan los feriados de todos los países y el reto «Cielo de hoy» (contenido de relleno que casi nadie usa). Se pueden volver a encender en el panel.
try { const MIG4 = path.join(DATA, '.migr-menores-0'); if (!fs.existsSync(MIG4)) {   // una sola vez: los partidos menores se ven siempre (antes el valor 6 los ocultaba al alejar el mapa)
  if (+S().sportsMinorZoom === 6) ADMIN.saveSettings({ sportsMinorZoom: 0 }); fs.writeFileSync(MIG4, '1') } } catch (e) { console.error('partidos menores:', e.message) }
try { const MIG3 = path.join(DATA, '.migr-sin-cine-1'); if (!fs.existsSync(MIG3)) {   // una sola vez: se borra la cartelera de cine (ya no existe en la web)
  for (const r of db.prepare("SELECT post_id FROM extra_items WHERE kind = 'cine'").all()) if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id)
  db.prepare("DELETE FROM extra_items WHERE kind = 'cine'").run(); fs.writeFileSync(MIG3, '1') } } catch (e) { console.error('limpieza de cine:', e.message) }
try { const MIG2 = path.join(DATA, '.migr-sin-tm-bit-1'); if (!fs.existsSync(MIG2)) {   // una sola vez: se retiran las publicaciones que dejaron Ticketmaster y Bandsintown
  for (const r of db.prepare("SELECT post_id FROM extra_items WHERE kind = 'bit'").all()) if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id)
  db.prepare("DELETE FROM extra_items WHERE kind = 'bit'").run()
  try { for (const r of db.prepare('SELECT post_id FROM world_events').all()) if (r.post_id) db.prepare('DELETE FROM posts WHERE id = ?').run(r.post_id); db.exec('DROP TABLE IF EXISTS world_events') } catch { /* sin tabla */ }
  fs.writeFileSync(MIG2, '1') } } catch (e) { console.error('limpieza Ticketmaster/Bandsintown:', e.message) }
try { const MIG = path.join(DATA, '.migr-generico-1'); if (!fs.existsSync(MIG)) { ADMIN.saveSettings({ holidaysOn: false, dailyOn: false }); fs.writeFileSync(MIG, '1') } } catch (e) { console.error('migración de ajustes:', e.message) }
setTimeout(() => { try { purgeOff() } catch { /* tablas aún sin crear */ } }, 8e3).unref(); setInterval(() => { try { purgeOff() } catch { /* sin cambios */ } }, 10 * 60e3).unref()

// ---------- estabilidad: tiempos de espera, errores no capturados y cierre ordenado ----------
server.requestTimeout = 5 * 60e3   // subidas de video grandes
server.headersTimeout = 20e3       // conexiones que nunca terminan de enviar la cabecera
server.keepAliveTimeout = 65e3
server.maxRequestsPerSocket = 0
process.on('unhandledRejection', e => console.error('Promesa sin capturar:', e?.message || e))
process.on('uncaughtException', e => console.error('Error sin capturar:', e?.stack || e))
let closing = false
function shutdown(sig) {
  if (closing) return; closing = true
  console.log(`${sig}: cerrando…`)
  for (const c of clients) { try { c.res.end() } catch {} }
  server.close(() => { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close() } catch {} process.exit(0) })
  setTimeout(() => process.exit(0), 8000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'))
// mantenimiento de SQLite: estadísticas del optimizador y WAL pequeño
setInterval(() => { try { db.exec('PRAGMA optimize; PRAGMA wal_checkpoint(PASSIVE)') } catch {} }, 6 * 3600e3).unref()

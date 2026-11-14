// PLANETA (planetapp): API + base de datos SQLite + archivos estáticos. Sin dependencias externas.
'use strict'
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto')
const { DatabaseSync } = require('node:sqlite')
// load private settings from .env next to server.js (R2 keys etc.). Never committed.
try { for (const line of require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') } } catch {}
const R2 = require('./r2'), r2 = R2.config()
const ENV_VIDEO_MAX = +process.env.VIDEO_MAX_SECONDS || 0

const PORT = process.env.PORT || 3010
const ROOT = path.join(__dirname, 'public')
const DATA = process.env.PLANETA_DATA || path.join(__dirname, 'data')
const UPLOADS = path.join(DATA, 'uploads')
fs.mkdirSync(UPLOADS, { recursive: true })

const db = new DatabaseSync(path.join(DATA, 'planeta.db'))
db.exec(`
PRAGMA journal_mode = WAL;
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
for (const col of ['lat REAL', 'lon REAL', 'video TEXT', 'thumb TEXT', 'country TEXT', 'capacity INTEGER', 'featured INTEGER NOT NULL DEFAULT 0', 'expires_at INTEGER']) { try { db.exec('ALTER TABLE posts ADD COLUMN ' + col) } catch {} }

for (const col of ['avatar TEXT', 'bio TEXT', 'lat REAL', 'lon REAL', 'country TEXT', 'email TEXT', 'verified INTEGER NOT NULL DEFAULT 0', 'biz INTEGER NOT NULL DEFAULT 0', 'biz_name TEXT', 'biz_type TEXT', 'biz_lat REAL', 'biz_lon REAL', 'biz_address TEXT', 'biz_hours TEXT', 'biz_whatsapp TEXT', 'featured_until INTEGER', 'biz_cover TEXT']) { try { db.exec('ALTER TABLE users ADD COLUMN ' + col) } catch {} }
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
CREATE INDEX IF NOT EXISTS users_biz_geo ON users(biz, biz_lat, biz_lon);
CREATE INDEX IF NOT EXISTS posts_expires ON posts(expires_at);
`)

const ADMIN = require('./admin').init(db, DATA)
const WORLD = require('./world')(db, ADMIN)
const S = () => ADMIN.settings()
function notify(userId, type, actorId, postId, text) {
  if (!userId || userId === actorId) return
  const r = db.prepare('INSERT INTO notifications (user_id, type, actor_id, post_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, type, actorId, postId ?? null, text ?? null, Date.now())
  broadcast({ type: 'notif', id: Number(r.lastInsertRowid) }, [userId])
}
const videoMax = () => ENV_VIDEO_MAX || +S().videoMaxSeconds || 60

// ---------- helpers ----------
const now = () => Date.now()
const hashPass = (p, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(p, salt, 64).toString('hex')
const checkPass = (p, stored) => { const [salt, h] = stored.split(':'); const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(p, salt, 64); return a.length === b.length && crypto.timingSafeEqual(a, b) }
const CATS = { includes: c => S().categories.some(x => x[0] === c) }
const CITY_LL = { 'Bogotá': [4.71, -74.07], 'Medellín': [6.24, -75.57], 'Cartagena': [10.39, -75.51], 'Cali': [3.45, -76.53], 'Ciudad de México': [19.43, -99.13], 'Buenos Aires': [-34.6, -58.38], 'Lima': [-12.05, -77.04], 'Madrid': [40.42, -3.7], 'Barcelona': [41.39, 2.17], 'París': [48.86, 2.35], 'Lisboa': [38.72, -9.14], 'Nueva York': [40.71, -74], 'Tokio': [35.69, 139.69], 'Seúl': [37.57, 126.98], 'Ciudad del Cabo': [-33.92, 18.42], 'Reikiavik': [64.15, -21.9], 'Sídney': [-33.87, 151.21], 'Marrakech': [31.63, -7.99] }
const nearestCity = (lat, lon) => Object.entries(CITY_LL).map(([c, [a, o]]) => [c, (a - lat) ** 2 + ((o - lon) * Math.cos(lat * Math.PI / 180)) ** 2]).sort((x, y) => x[1] - y[1])[0][0]
const placesCache = new Map(), cachePlaces = (k, v) => { placesCache.set(k, { t: Date.now(), v }); if (placesCache.size > 2000) placesCache.delete(placesCache.keys().next().value) }
const BIZ_TYPES = { includes: t => S().bizTypes.some(x => x[0] === t) }
const CITY_COUNTRY = { 'Bogotá': 'Colombia', 'Medellín': 'Colombia', 'Cartagena': 'Colombia', 'Cali': 'Colombia', 'Ciudad de México': 'México', 'Buenos Aires': 'Argentina', 'Lima': 'Perú', 'Madrid': 'España', 'Barcelona': 'España', 'París': 'Francia', 'Lisboa': 'Portugal', 'Nueva York': 'Estados Unidos', 'Tokio': 'Japón', 'Seúl': 'Corea del Sur', 'Ciudad del Cabo': 'Sudáfrica', 'Reikiavik': 'Islandia', 'Sídney': 'Australia', 'Marrakech': 'Marruecos' }
const CITIES = ['Bogotá', 'Medellín', 'Cartagena', 'Cali', 'Ciudad de México', 'Buenos Aires', 'Lima', 'Madrid', 'Barcelona', 'París', 'Lisboa', 'Nueva York', 'Tokio', 'Seúl', 'Ciudad del Cabo', 'Reikiavik', 'Sídney', 'Marrakech']
// fill country/coords for rows created before these columns existed
for (const [c, [la, lo]] of Object.entries(CITY_LL)) { db.prepare('UPDATE posts SET country = ? WHERE city = ? AND country IS NULL').run(CITY_COUNTRY[c], c); db.prepare('UPDATE posts SET lat = ?, lon = ? WHERE city = ? AND lat IS NULL').run(la, lo, c); db.prepare('UPDATE users SET lat = ?, lon = ?, country = ? WHERE city = ? AND lat IS NULL').run(la, lo, CITY_COUNTRY[c], c) }
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}
function readBody(req, limit = 9 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('La foto es demasiado grande (máximo 6 MB).'), { code: 413 })); req.destroy() } else chunks.push(c) })
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}) } catch { reject(Object.assign(new Error('Datos inválidos.'), { code: 400 })) } })
    req.on('error', reject)
  })
}
function currentUser(req) {
  const m = /(?:^|;\s*)planeta_s=([a-f0-9]{64})/.exec(req.headers.cookie || '')
  if (!m) return null
  return db.prepare('SELECT u.id, u.name, u.handle, u.city, u.hue, u.role, u.avatar, u.bio, u.lat, u.lon, u.country, u.biz, u.biz_name, u.biz_type, u.biz_lat, u.biz_lon, u.biz_address, u.biz_hours, u.biz_whatsapp, u.featured_until, u.biz_cover FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.suspended = 0').get(m[1]) || null
}
function startSession(res, userId, extra) {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now())
  return { 'Set-Cookie': `planeta_s=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}`, ...extra }
}
let stCache = null
const PAY = require('./pay')(ADMIN.secret)

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
const okMedia = u => typeof u === 'string' && u.length < 400 && (u.startsWith('/uploads/') && /^\/uploads\/[a-f0-9]{24}(-t)?\.(jpg|png|webp|gif|ico|mp4|webm|mov)$/.test(u) || (r2 && u.startsWith(r2.publicUrl + '/media/')))
const publicUser = u => u && { id: u.id, name: u.name, handle: u.handle, city: u.city, hue: u.hue, role: u.role || 'user', avatar: u.avatar || '', bio: u.bio || '', lat: u.lat, lon: u.lon, country: u.country || CITY_COUNTRY[u.city] || '', biz: !!u.biz, bizName: u.biz_name || '', bizType: u.biz_type || '', bizLat: u.biz_lat, bizLon: u.biz_lon, bizAddress: u.biz_address || '', bizHours: u.biz_hours || '', bizWhatsapp: u.biz_whatsapp || '', featuredUntil: u.featured_until || null, bizCover: u.biz_cover || '' }

function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 6 * 1024 * 1024) throw Object.assign(new Error('La foto es demasiado grande (máximo 6 MB).'), { code: 413 })
  const name = crypto.randomBytes(12).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])
  fs.writeFileSync(path.join(UPLOADS, name), buf)
  return '/uploads/' + name
}

const POST_SQL = `
SELECT p.id, p.title, p.text, p.cat, p.city, p.country, p.type, p.image, p.video, p.thumb, p.scene, p.lat, p.lon, p.capacity, (p.featured OR COALESCE(u.featured_until, 0) > CAST(strftime('%s','now') AS INTEGER) * 1000) AS featured, p.expires_at, u.biz AS author_biz, u.biz_name AS author_biz_name, p.created_at AS at, u.avatar, u.verified AS author_verified,
  u.name AS author, u.handle, u.hue, u.id AS author_id, u.is_example AS author_example,
  p.base_likes + (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  CASE WHEN p.cat = 'planes' THEN (SELECT COUNT(*) FROM joins j WHERE j.post_id = p.id) END AS joined,
  EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = :me) AS liked,
  EXISTS(SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = :me) AS saved,
  EXISTS(SELECT 1 FROM joins j WHERE j.post_id = p.id AND j.user_id = :me) AS joined_me,
  (p.user_id = :me) AS mine
FROM posts p JOIN users u ON u.id = p.user_id`
const shape = r => r && ({ ...r, author_biz: !!r.author_biz, featured: !!r.featured, author_verified: !!r.author_verified, author_example: !!r.author_example, liked: !!r.liked, saved: !!r.saved, joined_me: !!r.joined_me, mine: !!r.mine })
const getPost = (id, me) => shape(db.prepare(POST_SQL + ' WHERE p.id = :id').get({ id, me }))

// ---------- live events (Server-Sent Events): replaces most polling ----------
const clients = new Set()
function broadcast(ev, toUsers) {
  const data = 'data: ' + JSON.stringify(ev) + '\n\n'
  for (const c of clients) if (!toUsers || toUsers.includes(c.user)) { try { c.res.write(data) } catch {} }
}
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n') } catch {} } }, 25000).unref()

// ---------- API ----------
async function api(req, res, url) {
  const me = currentUser(req), meId = me?.id ?? 0
  const p = url.pathname, method = req.method
  const need = () => { if (!me) throw Object.assign(new Error('Inicia sesión para hacer esto.'), { code: 401 }); if (S().maintenance && me.role !== 'admin') throw Object.assign(new Error(S().maintenanceText), { code: 503 }) }
  let m

  if (p === '/api/events' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.write('retry: 4000\n\n')
    const c = { res, user: meId }; clients.add(c)
    req.on('close', () => clients.delete(c))
    return
  }

  if (p === '/api/me/account' && method === 'PUT') {
    need(); const b = await readBody(req), u = db.prepare('SELECT pass, email FROM users WHERE id = ?').get(me.id)
    if (!b.current || !checkPass(String(b.current), u.pass)) return send(res, 400, { error: 'La contraseña actual no es correcta.' })
    const email = String(b.email || '').trim().toLowerCase()
    if (email && email !== u.email) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: 'Escribe un correo válido.' }); if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, me.id)) return send(res, 400, { error: 'Ese correo ya está en uso.' }); db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, me.id) }
    if (b.password) { if (String(b.password).length < 8) return send(res, 400, { error: 'La nueva contraseña debe tener al menos 8 caracteres.' }); db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(hashPass(String(b.password)), me.id) }
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
      placesCache.clear()
      db.prepare('UPDATE users SET biz_cover = ? WHERE id = ?').run(okMedia(b.bizCover) ? String(b.bizCover) : null, me.id)
      db.prepare('UPDATE users SET biz = ?, biz_name = ?, biz_type = ?, biz_lat = ?, biz_lon = ?, biz_address = ?, biz_hours = ?, biz_whatsapp = ? WHERE id = ?').run(on ? 1 : 0, clean(b.bizName, 80), BIZ_TYPES.includes(b.bizType) ? b.bizType : 'otro', bl, bo, clean(b.bizAddress, 160), clean(b.bizHours, 120), clean(b.bizWhatsapp, 20).replace(/[^\d+]/g, ''), me.id)
    }
    return send(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(me.id)) })
  }

  // ---- businesses on the map: only the visible area, clustered when there are many ----
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
    const total = db.prepare(`SELECT COUNT(*) c FROM users WHERE biz = 1 AND suspended = 0 AND biz_lat BETWEEN :s AND :n AND ${lonCond}`).get({ s: s0, n: n0, w: wN, e: eN }).c
    if (total > 250 && z < 15) {
      const cell = Math.max(n0 - s0, whole ? 360 : (eN - wN + 360) % 360 || 360) / 12
      const rows = db.prepare(`SELECT CAST(biz_lat / ${cell} AS INTEGER) gy, CAST(biz_lon / ${cell} AS INTEGER) gx, COUNT(*) n, AVG(biz_lat) lat, AVG(biz_lon) lon, MAX(COALESCE(featured_until, 0) > :now) feat FROM users WHERE biz = 1 AND suspended = 0 AND biz_lat BETWEEN :s AND :n AND ${lonCond} GROUP BY gy, gx`).all(args)
      const v = { clusters: rows.map(r => ({ n: r.n, lat: r.lat, lon: r.lon, featured: !!r.feat })), places: [], total }; cachePlaces(ck, v); return send(res, 200, v)
    }
    const rows = db.prepare(`SELECT id, biz_name AS name, biz_type AS type, biz_lat AS lat, biz_lon AS lon, avatar, hue, verified, (COALESCE(featured_until, 0) > :now) AS featured,
      (SELECT COUNT(*) FROM posts WHERE user_id = users.id AND expires_at > :now) AS offers FROM users WHERE biz = 1 AND suspended = 0 AND biz_lat BETWEEN :s AND :n AND ${lonCond} ORDER BY featured DESC LIMIT 400`).all(args)
    const v = { places: rows.map(r => ({ ...r, featured: !!r.featured, verified: !!r.verified })), clusters: [], total }; cachePlaces(ck, v); return send(res, 200, v)
  }
  if ((m = /^\/api\/places\/(\d+)$/.exec(p)) && method === 'GET') {
    const u = db.prepare('SELECT id, name, handle, avatar, hue, verified, biz_name, biz_type, biz_lat, biz_lon, biz_address, biz_hours, biz_whatsapp, featured_until, biz_cover, city, country FROM users WHERE id = ? AND biz = 1 AND suspended = 0').get(+m[1])
    if (!u) return send(res, 404, { error: 'Este negocio no existe.' })
    const posts = db.prepare(POST_SQL + ' WHERE p.user_id = :uid AND (p.expires_at IS NULL OR p.expires_at > :now) ORDER BY p.created_at DESC LIMIT 30').all({ me: meId, uid: u.id, now: now() }).map(shape)
    return send(res, 200, { place: { id: u.id, owner: u.name, handle: u.handle, avatar: u.avatar, hue: u.hue, verified: !!u.verified, name: u.biz_name, type: u.biz_type, lat: u.biz_lat, lon: u.biz_lon, address: u.biz_address, hours: u.biz_hours, whatsapp: u.biz_whatsapp, cover: u.biz_cover || '', featured: (u.featured_until || 0) > now(), city: u.city, country: u.country, mine: u.id === meId }, posts })
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

  if (p === '/api/geo/search' && method === 'GET') { try { return send(res, 200, { places: await WORLD.search(url.searchParams.get('q')) }) } catch { return send(res, 502, { error: 'No se pudo buscar el lugar. Inténtalo de nuevo.' }) } }
  if (p === '/api/geo/reverse' && method === 'GET') { try { return send(res, 200, { place: await WORLD.reverse(+url.searchParams.get('lat'), +url.searchParams.get('lon')) }) } catch { return send(res, 502, { error: 'No se pudo ubicar el lugar.' }) } }
  if (p === '/api/translate' && method === 'POST') {
    const b = await readBody(req)
    try { return send(res, 200, { text: await WORLD.translate(b.text, b.to) }) } catch (e) { return send(res, 502, { error: 'No se pudo traducir: ' + e.message }) }
  }

  if (p === '/api/settings' && method === 'GET') { const st = S(); return send(res, 200, { ...st, videoMaxSeconds: videoMax() }) }

  if (p === '/api/stations' && method === 'GET') {
    if (!stCache || stCache.at < Date.now() - 30e3) stCache = { at: Date.now(), list: db.prepare('SELECT id, name, city, country, lat, lon, genre, stream, logo, website, whatsapp FROM stations WHERE paid_until > ? ORDER BY name').all(now()) }
    return send(res, 200, { stations: stCache.list })
  }
  // ---------- paseos en vivo ----------
  if (p === '/api/walks/live' && method === 'GET') return send(res, 200, { walks: liveWalks() })
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
    if (act === 'watch') { const k = clean(b.k, 40) || String(req.headers['x-forwarded-for'] || req.socket.remoteAddress); let v = walkViewers.get(w.id); if (!v) walkViewers.set(w.id, v = new Map()); v.set(k, now()); return send(res, 200, { ok: true }) }
    need()
    if (act === 'msg') { if (w.ended_at) return send(res, 400, { error: 'El paseo terminó.' }); const text = clean(b.text, 300); if (!text) return send(res, 400, { error: 'Escribe algo.' })
      const lastMsg = walkMsgRate.get(me.id) || 0; if (now() - lastMsg < 1500) return send(res, 429, { error: 'Más despacio 🙂' }); walkMsgRate.set(me.id, now())
      const r = db.prepare('INSERT INTO walk_msgs (walk_id, user_id, text, t) VALUES (?, ?, ?, ?)').run(w.id, me.id, text, now())
      broadcast({ type: 'walkmsg', walk: w.id, msg: { id: Number(r.lastInsertRowid), text, t: now(), name: me.name, avatar: me.avatar, hue: me.hue } }); return send(res, 200, { ok: true }) }
    if (w.user_id !== me.id) return send(res, 403, { error: 'Este paseo no es tuyo.' })
    if (w.ended_at) return send(res, 400, { error: 'El paseo ya terminó.' })
    if (act === 'end') { db.prepare('UPDATE walks SET ended_at = ? WHERE id = ?').run(now(), w.id); walksCache = null; broadcast({ type: 'walks' }); broadcast({ type: 'walkend', walk: w.id }); return send(res, 200, { ok: true }) }
    const lat = +b.lat, lon = +b.lon; if (!(Math.abs(lat) <= 85 && Math.abs(lon) <= 180)) return send(res, 400, { error: 'Ubicación no válida.' })
    if (act === 'pos') { if (now() - (w.last_at || 0) < 2000) return send(res, 200, { ok: true, skipped: true }); walkStep(w, lat, lon); return send(res, 200, { ok: true }) }
    if (act === 'media') { const image = b.image && okMedia(b.image) ? b.image : null, thumb = b.thumb && okMedia(b.thumb) ? b.thumb : null, video = b.video && okMedia(b.video) ? b.video : null
      if (!image && !video) return send(res, 400, { error: 'Sube una foto o un video.' })
      if (db.prepare('SELECT COUNT(*) n FROM walk_media WHERE walk_id = ?').get(w.id).n >= 60) return send(res, 400, { error: 'Máximo 60 fotos por paseo.' })
      const r = db.prepare('INSERT INTO walk_media (walk_id, lat, lon, image, thumb, video, caption, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(w.id, lat, lon, image, thumb, video, clean(b.caption, 140), now())
      broadcast({ type: 'walkmedia', walk: w.id, media: { id: Number(r.lastInsertRowid), lat, lon, image, thumb, video, caption: clean(b.caption, 140), t: now() } }); return send(res, 200, { ok: true }) }
  }
  if (p === '/api/admin/walks/demo' && method === 'POST') { if (!me || me.role !== 'admin') return send(res, 403, { error: 'Solo el administrador.' }); return send(res, 200, { walk: walkInfo(startDemoWalk(me.id)) }) }
  // ---------- ventas: emisoras y negocios pagan solos ----------
  if (p === '/api/pay/options' && method === 'GET') {
    const st = S(); return send(res, 200, { providers: PAY.available(), currency: st.currency, radio: { amount: +st.radioAmount, usd: +st.radioUSD }, biz: { amount: +st.bizAmount, usd: +st.bizUSD } })
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
    need(); const b = await readBody(req), st = S(), item = b.item === 'radio' ? 'radio' : b.item === 'biz' ? 'biz' : null, provider = String(b.provider || '')
    if (!item) return send(res, 400, { error: 'Servicio no válido.' })
    if (!PAY.available().includes(provider)) return send(res, 400, { error: 'Ese medio de pago no está activo.' })
    let title, target
    if (item === 'radio') { const x = db.prepare('SELECT id, name FROM stations WHERE id = ? AND owner_id = ?').get(+b.targetId, me.id); if (!x) return send(res, 404, { error: 'Esa emisora no es tuya.' }); target = x.id; title = `Emisora "${x.name}" en ${st.name} · 1 mes` }
    else { if (!me.biz) return send(res, 400, { error: 'Primero activa "Es un negocio" en tu perfil.' }); target = me.id; title = `Negocio destacado "${me.biz_name || me.name}" en ${st.name} · 1 mes` }
    const amount = +(item === 'radio' ? st.radioAmount : st.bizAmount), usd = +(item === 'radio' ? st.radioUSD : st.bizUSD), currency = provider === 'paypal' ? 'USD' : String(st.currency || 'COP').toUpperCase()
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
  if (p.startsWith('/api/admin/')) {
    if (!me || (me.role !== 'admin' && me.role !== 'mod')) return send(res, 403, { error: 'No tienes permiso para entrar al panel.' })
    const adminOnly = () => { if (me.role !== 'admin') throw Object.assign(new Error('Solo el administrador puede hacer esto.'), { code: 403 }) }
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
    if (p === '/api/admin/settings' && method === 'PUT') { adminOnly(); const b = await readBody(req); const st = ADMIN.saveSettings(b); broadcast({ type: 'settings' }); return send(res, 200, st) }
    if (p === '/api/admin/texts') return send(res, 200, ADMIN.TEXTS)
    if (p === '/api/admin/posts') return send(res, 200, { posts: db.prepare("SELECT p.id, p.title, p.city, p.type, p.cat, p.featured, p.created_at AS at, p.image, p.thumb, p.video, u.name AS author, u.handle, u.is_example, (SELECT COUNT(*) FROM reports r WHERE r.post_id = p.id AND r.resolved = 0) AS reports FROM posts p JOIN users u ON u.id = p.user_id WHERE p.title LIKE ? OR u.name LIKE ? OR p.city LIKE ? ORDER BY p.created_at DESC LIMIT 200").all(q, q, q) })
    let mm
    if ((mm = /^\/api\/admin\/posts\/(\d+)$/.exec(p)) && method === 'DELETE') { db.prepare('DELETE FROM posts WHERE id = ?').run(+mm[1]); broadcast({ type: 'post' }); return send(res, 200, { ok: true }) }
    if ((mm = /^\/api\/admin\/posts\/(\d+)\/feature$/.exec(p)) && method === 'POST') { const b = await readBody(req); db.prepare('UPDATE posts SET featured = ? WHERE id = ?').run(b.featured ? 1 : 0, +mm[1]); broadcast({ type: 'post' }); return send(res, 200, { ok: true }) }
    if ((mm = /^\/api\/admin\/posts\/(\d+)\/type$/.exec(p)) && method === 'POST') { const b = await readBody(req); if (!['usuario', 'verificada', 'directo'].includes(b.type)) return send(res, 400, { error: 'Tipo no válido.' }); db.prepare('UPDATE posts SET type = ? WHERE id = ?').run(b.type, +mm[1]); broadcast({ type: 'post' }); return send(res, 200, { ok: true }) }
    if (p === '/api/admin/stations' && method === 'GET') return send(res, 200, { stations: db.prepare('SELECT * FROM stations ORDER BY paid_until DESC, name').all() })
    if ((p === '/api/admin/stations' && method === 'POST') || ((mm = /^\/api\/admin\/stations\/(\d+)$/.exec(p)) && method === 'PUT')) {
      adminOnly(); const b = await readBody(req), v = stationFields(b)
      if (v.error) return send(res, 400, { error: v.error })
      if (mm) db.prepare('UPDATE stations SET name = ?, city = ?, country = ?, lat = ?, lon = ?, genre = ?, stream = ?, logo = ?, website = ?, whatsapp = ? WHERE id = ?').run(...v.row, +mm[1])
      else db.prepare('INSERT INTO stations (name, city, country, lat, lon, genre, stream, logo, website, whatsapp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...v.row, now())
      stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { ok: true })
    }
    if ((mm = /^\/api\/admin\/stations\/(\d+)\/pay$/.exec(p)) && method === 'POST') {
      adminOnly(); const b = await readBody(req), st = db.prepare('SELECT paid_until FROM stations WHERE id = ?').get(+mm[1]); if (!st) return send(res, 404, { error: 'No existe.' })
      const until = b.off ? 0 : Math.max(now(), st.paid_until) + 30 * 864e5
      db.prepare('UPDATE stations SET paid_until = ? WHERE id = ?').run(until, +mm[1]); stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { paidUntil: until })
    }
    if ((mm = /^\/api\/admin\/stations\/(\d+)$/.exec(p)) && method === 'DELETE') { adminOnly(); db.prepare('DELETE FROM stations WHERE id = ?').run(+mm[1]); stCache = null; broadcast({ type: 'stations' }); return send(res, 200, { ok: true }) }
    if (p === '/api/admin/examples' && method === 'DELETE') { adminOnly(); const r = db.prepare('DELETE FROM posts WHERE user_id IN (SELECT id FROM users WHERE is_example = 1)').run(); db.prepare('DELETE FROM users WHERE is_example = 1').run(); broadcast({ type: 'post' }); return send(res, 200, { deleted: r.changes }) }
    if (p === '/api/admin/users') return send(res, 200, { users: db.prepare('SELECT u.id, u.name, u.handle, u.city, u.hue, u.role, u.suspended, u.verified, u.biz, u.biz_name, u.featured_until, u.created_at, (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS posts FROM users u WHERE u.is_example = 0 AND (u.name LIKE ? OR u.handle LIKE ?) ORDER BY u.created_at DESC LIMIT 300').all(q, q) })
    if ((mm = /^\/api\/admin\/users\/(\d+)$/.exec(p))) {
      adminOnly(); const id = +mm[1]; if (id === me.id) return send(res, 400, { error: 'No puedes cambiar tu propia cuenta desde aquí.' })
      if (method === 'DELETE') { db.prepare('DELETE FROM users WHERE id = ? AND is_example = 0').run(id); broadcast({ type: 'post' }); return send(res, 200, { ok: true }) }
      if (method === 'POST') { const b = await readBody(req); if (['user', 'mod', 'admin'].includes(b.role)) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, id); if (b.featureDays !== undefined) { const d = Math.max(0, Math.min(366, +b.featureDays || 0)); const cur = db.prepare('SELECT featured_until FROM users WHERE id = ?').get(id)?.featured_until || 0; db.prepare('UPDATE users SET featured_until = ? WHERE id = ?').run(d ? Math.max(cur, now()) + d * 864e5 : null, id); broadcast({ type: 'post' }) }
      if (b.verified !== undefined) db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(b.verified ? 1 : 0, id); if (b.suspended !== undefined) { db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(b.suspended ? 1 : 0, id); if (b.suspended) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id) } return send(res, 200, { ok: true }) }
    }
    if (p === '/api/admin/reports') return send(res, 200, { reports: db.prepare('SELECT r.id, r.reason, r.created_at AS at, r.post_id, p.title, p.city, u.name AS reporter, a.name AS author FROM reports r JOIN posts p ON p.id = r.post_id JOIN users u ON u.id = r.user_id JOIN users a ON a.id = p.user_id WHERE r.resolved = 0 ORDER BY r.created_at DESC LIMIT 200').all() })
    if ((mm = /^\/api\/admin\/reports\/(\d+)$/.exec(p)) && method === 'POST') { db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(+mm[1]); return send(res, 200, { ok: true }) }
    if (p === '/api/admin/rooms') return send(res, 200, { messages: db.prepare('SELECT r.id, r.city, r.text, r.created_at AS at, u.name AS author FROM room_messages r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 200').all() })
    if ((mm = /^\/api\/admin\/rooms\/(\d+)$/.exec(p)) && method === 'DELETE') { const r = db.prepare('SELECT city FROM room_messages WHERE id = ?').get(+mm[1]); db.prepare('DELETE FROM room_messages WHERE id = ?').run(+mm[1]); if (r) broadcast({ type: 'room', city: r.city }); return send(res, 200, { ok: true }) }
    if (p === '/api/admin/integrations') { adminOnly(); if (method === 'PUT') { const b = await readBody(req); ADMIN.saveIntegration(b.provider, b.values || {}) } return send(res, 200, ADMIN.integrations()) }
    if ((mm = /^\/api\/admin\/integrations\/(\w+)\/test$/.exec(p)) && method === 'POST') { adminOnly(); try { return send(res, 200, { message: await ADMIN.testIntegration(mm[1]) }) } catch (e) { return send(res, 200, { message: 'No se pudo conectar: ' + e.message }) } }
    return send(res, 404, { error: 'No encontrado.' })
  }

  if (p === '/api/me' && method === 'GET') return send(res, 200, { user: publicUser(me), videoMaxSeconds: videoMax(), storage: r2 ? 'r2' : 'local' })

  if (p === '/api/register' && method === 'POST') {
    const b = await readBody(req)
    const name = clean(b.name, 60), pass = String(b.password || ''), city = clean(b.city, 80) || 'Bogotá'
    const email = clean(b.email || (String(b.handle || '').includes('@') ? b.handle : ''), 120).toLowerCase()
    if (name.length < 2) return send(res, 400, { error: 'Escribe tu nombre.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: 'Escribe un correo válido, por ejemplo nombre@gmail.com.' })
    if (pass.length < 6) return send(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres.' })
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return send(res, 409, { error: 'Ya existe una cuenta con ese correo. Usa «Entra» para iniciar sesión.' })
    // username generated automatically from the email (unique)
    const base = (email.split('@')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').replace(/^[._]+|[._]+$/g, '') || 'usuario').slice(0, 24).padEnd(3, '0')
    let handle = base; for (let i = 2; db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle); i++) handle = base + i
    const ulat = Number.isFinite(+b.lat) && b.lat !== null ? +b.lat : (CITY_LL[city]?.[0] ?? 4.71), ulon = Number.isFinite(+b.lon) && b.lon !== null ? +b.lon : (CITY_LL[city]?.[1] ?? -74.07), ucountry = clean(b.country, 60) || CITY_COUNTRY[city] || ''
    if (name.length < 2) return send(res, 400, { error: 'Escribe tu nombre.' })
    if (!/^[a-z0-9_.]{3,30}$/.test(handle)) return send(res, 400, { error: 'El usuario debe tener 3 a 30 letras, números, punto o guion bajo.' })
    if (pass.length < 6) return send(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres.' })
    if (db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle)) return send(res, 409, { error: 'Ese usuario ya existe. Elige otro.' })
    const r = db.prepare('INSERT INTO users (name, handle, email, pass, city, hue, lat, lon, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(name, handle, email, hashPass(pass), city, crypto.randomInt(360), ulat, ulon, ucountry, now())
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)
    return send(res, 201, { user: publicUser(user) }, startSession(res, user.id))
  }

  if (p === '/api/login' && method === 'POST') {
    const b = await readBody(req)
    const id = clean(b.handle || b.email, 120).toLowerCase().replace(/^@/, '')
    const u = db.prepare('SELECT * FROM users WHERE (handle = ? OR email = ?) AND is_example = 0').get(id, id)
    if (!u || !checkPass(String(b.password || ''), u.pass)) return send(res, 401, { error: 'Correo o contraseña incorrectos.' })
    if (u.suspended) return send(res, 403, { error: 'Esta cuenta está suspendida.' })
    return send(res, 200, { user: publicUser(u) }, startSession(res, u.id))
  }

  if (p === '/api/logout' && method === 'POST') {
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
    const limit = Math.min(200, Math.max(1, +url.searchParams.get('limit') || 120))
    const rows = db.prepare(POST_SQL + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY ((p.featured = 1 AND p.created_at > ' + (Date.now() - 7 * 864e5) + ') OR COALESCE(u.featured_until, 0) > ' + Date.now() + ') DESC, p.created_at DESC LIMIT ' + (limit + 1)).all(args)
    return send(res, 200, { posts: rows.slice(0, limit).map(shape), more: rows.length > limit })
  }

  if (p === '/api/posts' && method === 'POST') {
    need()
    const b = await readBody(req)
    const title = clean(b.title, 120), text = clean(b.text, 2000)
    const lat = Number.isFinite(+b.lat) && b.lat !== null && Math.abs(+b.lat) <= 85 ? +b.lat : null, lon = Number.isFinite(+b.lon) && b.lon !== null && Math.abs(+b.lon) <= 180 ? +b.lon : null
    const cat = CATS.includes(b.cat) ? b.cat : null
    let city = null, country = null
    if (lat !== null && lon !== null) { const g = await WORLD.reverse(lat, lon).catch(() => null); if (g && g.city) { city = clean(g.city, 80); country = clean(g.country, 60) } else { city = nearestCity(lat, lon); country = CITY_COUNTRY[city] } }
    else if (CITIES.includes(b.city)) { city = b.city; country = CITY_COUNTRY[city] }
    if (title.length < 3) return send(res, 400, { error: 'Escribe un título de al menos 3 caracteres.' })
    if (me.role !== 'admin' && db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND created_at > ?').get(me.id, now() - 36e5).n >= (+S().postsPerHour || 20)) return send(res, 429, { error: 'Has publicado muchas veces en la última hora. Espera un poco.' })
    if (!cat || !city) return send(res, 400, { error: 'Elige una categoría y una ciudad.' })
    let image = null, video = null, thumb = null
    if (typeof b.image === 'string' && b.image.startsWith('data:')) image = saveImage(b.image)
    else if (b.image) { if (!okMedia(b.image)) return send(res, 400, { error: 'La foto no es válida. Súbela de nuevo.' }); image = b.image }
    if (b.video) { if (!okMedia(b.video)) return send(res, 400, { error: 'El video no es válido. Súbelo de nuevo.' }); if (+b.duration > videoMax() + 0.5) return send(res, 400, { error: `El video dura más de ${videoMax()} segundos.` }); video = b.video }
    if (b.thumb) { if (!okMedia(b.thumb)) return send(res, 400, { error: 'La miniatura no es válida.' }); thumb = b.thumb }
    const expires = me.biz && +b.validUntil > now() ? Math.min(+b.validUntil, now() + 30 * 864e5) : null
    const capacity = cat === 'planes' && +b.capacity >= 2 ? Math.min(500, Math.round(+b.capacity)) : null
    const plat = lat ?? CITY_LL[city]?.[0] ?? null, plon = lon ?? CITY_LL[city]?.[1] ?? null
    const r = db.prepare('INSERT INTO posts (user_id, title, text, cat, city, country, type, image, video, thumb, scene, lat, lon, capacity, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(me.id, title, text, cat, city, country, b.live ? 'directo' : 'usuario', image, video, thumb, 'ciudad', plat, plon, capacity, expires, now())
    const post = getPost(r.lastInsertRowid, me.id)
    for (const f of db.prepare("SELECT DISTINCT user_id FROM follows WHERE (kind = 'city' AND value = ?) OR (kind = 'cat' AND value = ?)").all(city, cat)) notify(f.user_id, 'follow', me.id, post.id, city)
    broadcast({ type: 'post', id: post.id, city: post.city })
    return send(res, 201, { post })
    return send(res, 201, { post: getPost(r.lastInsertRowid, me.id) })
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
      need(); const r = db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(id, me.id)
      return r.changes ? send(res, 200, { ok: true }) : send(res, 403, { error: 'Solo puedes borrar tus publicaciones.' })
    }
  }

  if ((m = /^\/api\/posts\/(\d+)\/(like|save|join)$/.exec(p)) && method === 'POST') {
    need(); const id = +m[1], table = { like: 'likes', save: 'saves', join: 'joins' }[m[2]]
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) return send(res, 404, { error: 'Esta publicación ya no existe.' })
    if (m[2] === 'join') { const pp = db.prepare('SELECT capacity, user_id FROM posts WHERE id = ?').get(id); const joinedMe = db.prepare('SELECT 1 FROM joins WHERE user_id = ? AND post_id = ?').get(me.id, id); if (pp.capacity && !joinedMe && db.prepare('SELECT COUNT(*) n FROM joins WHERE post_id = ?').get(id).n >= pp.capacity) return send(res, 409, { error: 'El cupo de este plan ya está lleno.' }) }
    const del = db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND post_id = ?`).run(me.id, id)
    if (!del.changes) { db.prepare(`INSERT INTO ${table} (user_id, post_id) VALUES (?, ?)`).run(me.id, id); if (m[2] !== 'save') notify(db.prepare('SELECT user_id FROM posts WHERE id = ?').get(id)?.user_id, m[2], me.id, id) }
    return send(res, 200, { post: getPost(id, me.id) })
  }

  if ((m = /^\/api\/posts\/(\d+)\/comments$/.exec(p)) && method === 'POST') {
    need(); const id = +m[1], b = await readBody(req), text = clean(b.text, 1000)
    if (!text) return send(res, 400, { error: 'Escribe un comentario.' })
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) return send(res, 404, { error: 'Esta publicación ya no existe.' })
    db.prepare('INSERT INTO comments (post_id, user_id, text, created_at) VALUES (?, ?, ?, ?)').run(id, me.id, text, now())
    broadcast({ type: 'comment', id })
    const owner = db.prepare('SELECT user_id, title FROM posts WHERE id = ?').get(id); notify(owner?.user_id, 'comment', me.id, id, text.slice(0, 120))
    return send(res, 201, { ok: true })
  }

  if ((m = /^\/api\/posts\/(\d+)\/report$/.exec(p)) && method === 'POST') {
    need(); const b = await readBody(req)
    db.prepare('INSERT INTO reports (post_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)').run(+m[1], me.id, clean(b.reason, 300), now())
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
      db.prepare('INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)').run(me.id, other.id, text, now())
      broadcast({ type: 'dm', from: me.id, to: other.id }, [me.id, other.id])
      if (!db.prepare('SELECT 1 FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND read = 0').get(other.id, me.id, 'message')) notify(other.id, 'message', me.id, null, text.slice(0, 120))
    }
    db.prepare('UPDATE messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL').run(now(), other.id, me.id)
    const msgs = db.prepare('SELECT id, text, created_at AS at, (from_id = ?) AS mine FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 200')
      .all(me.id, me.id, other.id, other.id, me.id).reverse().map(x => ({ ...x, mine: !!x.mine }))
    return send(res, 200, { user: { id: other.id, name: other.name, handle: other.handle, hue: other.hue, city: other.city, avatar: other.avatar, country: other.country, lat: other.lat, lon: other.lon }, messages: msgs })
  }

  if (p === '/api/upload' && method === 'POST') {
    need()
    const b = await readBody(req), kind = b.kind, type = String(b.contentType || ''), size = +b.size
    if (kind === 'brand' && me.role !== 'admin') return send(res, 403, { error: 'Solo el administrador puede cambiar la marca.' })
    const LIM = { avatar: [/^image\/jpeg$/, 2e6], brand: [/^image\/(png|webp|jpeg|x-icon|vnd.microsoft.icon)$/, 2e6], image: [/^image\/(jpeg|png|webp)$/, (+S().imageMaxMB || 8) * 1e6], thumb: [/^image\/jpeg$/, 1e6], video: [/^video\/(mp4|webm|quicktime)$/, 60e6] }[kind]
    if (!LIM || !LIM[0].test(type)) return send(res, 400, { error: 'Formato no permitido. Usa JPG, PNG, MP4 o WEBM.' })
    if (!(size > 0) || size > LIM[1]) return send(res, 413, { error: kind === 'video' ? 'El video pesa demasiado (máximo 60 MB).' : 'La foto pesa demasiado.' })
    if (kind === 'video' && +b.duration > videoMax() + 0.5) return send(res, 400, { error: `El video dura más de ${videoMax()} segundos.` })
    const ext = { 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[type]
    const id = crypto.randomBytes(12).toString('hex') + (kind === 'thumb' ? '-t' : '')
    if (r2) {
      const key = `media/${new Date().toISOString().slice(0, 7)}/${id}.${ext}`
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
      db.prepare('INSERT INTO room_messages (city, user_id, text, created_at) VALUES (?, ?, ?, ?)').run(city, me.id, text, now())
      broadcast({ type: 'room', city })
    }
    const msgs = db.prepare('SELECT r.id, r.text, r.created_at AS at, u.id AS user_id, u.name AS author, u.hue, u.avatar, (r.user_id = ?) AS mine FROM room_messages r JOIN users u ON u.id = r.user_id WHERE r.city = ? ORDER BY r.id DESC LIMIT 100').all(meId, city).reverse().map(x => ({ ...x, mine: !!x.mine }))
    const people = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM room_messages WHERE city = ? AND created_at > ?').get(city, now() - 864e5).n
    return send(res, 200, { city, messages: msgs, people })
  }

  if (p === '/api/tiles-status' && method === 'GET') {
    const count = d => { try { return fs.readdirSync(d, { recursive: true }).filter(f => /\.(png|jpg)$/.test(f)).length } catch { return 0 } }
    return send(res, 200, { cached: Object.fromEntries(Object.keys(TILE_SRC).map(k => [k, count(path.join(TILES, k))])), downloaded: tstats.ok, failed: tstats.fail, lastError: tstats.lastError, busy: slots })
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
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(s.url.replace('{z}', z).replace('{x}', x).replace('{y}', y), { headers: { 'User-Agent': 'planetapp/1.0 (map tiles cache)' }, signal: AbortSignal.timeout(20000) })
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
  for (let z = 0; z <= 4; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) jobs.push(['night', z, x, y])
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
function serveFile(res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end() }
    const ext = path.extname(file)
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' })
    fs.createReadStream(file).pipe(res)
  })
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x')
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    const t = /^\/tiles\/(osm|night|sat|labels)\/(\d+)\/(\d+)\/(\d+)\.(?:png|jpg)$/.exec(url.pathname)
    if (t) return await tile(res, t[1], +t[2], +t[3], +t[4])
    if (url.pathname.startsWith('/uploads/')) {
      const f = path.join(UPLOADS, path.basename(url.pathname))
      return serveFile(res, f, 'public, max-age=31536000, immutable')
    }
    if (url.pathname === '/manifest.webmanifest') { const st = S(); const icon = st.favicon || './icon.svg'; res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }); return res.end(JSON.stringify({ name: st.name, short_name: st.name.slice(0, 12), description: st.description, start_url: './', display: 'standalone', background_color: st.colors.bg, theme_color: st.colors.bg, icons: [{ src: icon, sizes: 'any', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', purpose: 'any' }] })) }
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)))
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
    fs.stat(file, (err, st) => {
      if (err || st.isDirectory()) file = path.join(ROOT, 'index.html')
      if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
        const st4 = S(), origin = (req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers['x-forwarded-host'] || req.headers.host)
        if (url.pathname === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(st4.indexable === false ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`) }
        const rows = db.prepare('SELECT id, created_at FROM posts ORDER BY created_at DESC LIMIT 5000').all()
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
        return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><changefreq>hourly</changefreq></url><url><loc>${origin}/terminos</loc></url><url><loc>${origin}/privacidad</loc></url>${rows.map(r => `<url><loc>${origin}/p/${r.id}</loc><lastmod>${new Date(r.created_at).toISOString().slice(0, 10)}</lastmod></url>`).join('')}</urlset>`)
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
        const pm = /^\/p\/(\d+)$/.exec(url.pathname), sp = pm && db.prepare('SELECT p.title, p.text, p.city, p.country, p.image, p.thumb, p.scene FROM posts p WHERE p.id = ?').get(+pm[1])
        const ogT = sp ? `${sp.title} · ${sp.city}` : st2.name, ogD = sp ? (sp.text || `${sp.city}${sp.country ? ', ' + sp.country : ''} · en ${st2.name}`) : st2.description, ogI = sp ? abs(sp.image || sp.thumb || st2.ogImage) : abs(st2.ogImage || st2.logoDark || st2.favicon)
        html = html.replace('</head>', `<meta property="og:site_name" content="${esc(st2.name)}" /><meta property="og:title" content="${esc(ogT)}" /><meta property="og:description" content="${esc(String(ogD).slice(0, 200))}" />${ogI ? `<meta property="og:image" content="${esc(ogI)}" /><meta name="twitter:card" content="summary_large_image" />` : ''}<meta property="og:url" content="${esc(origin + url.pathname)}" /><meta property="og:type" content="website" /><meta property="og:locale" content="es_LA" />${st2.seoKeywords ? `<meta name="keywords" content="${esc(st2.seoKeywords)}" />` : ''}${st2.googleVerify ? `<meta name="google-site-verification" content="${esc(st2.googleVerify)}" />` : ''}${st2.indexable === false ? '<meta name="robots" content="noindex" />' : ''}<link rel="canonical" href="${esc(origin + url.pathname)}" /><meta name="twitter:title" content="${esc(ogT)}" /><meta name="twitter:description" content="${esc(String(ogD).slice(0, 200))}" />${ogI ? `<meta name="twitter:image" content="${esc(ogI)}" />` : ''}</head>`)
        if (sp) html = html.replace(/<title>.*?<\/title>/, `<title>${esc(ogT)} · ${esc(st2.name)}</title>`)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(html)
      })
      serveFile(res, file, 'public, max-age=31536000')
    })
  } catch (e) {
    if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : 'Error del servidor. Inténtalo de nuevo.' })
    if (!e.code) console.error(e)
  }
}).listen(PORT, () => console.log(`planetapp en el puerto ${PORT} · base de datos en ${DATA} · fotos y videos en ${r2 ? 'Cloudflare R2 (' + r2.bucket + ')' : 'disco local'}`))

// ---------- example content on first run ----------
if (!db.prepare('SELECT 1 FROM posts LIMIT 1').get()) {
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
const DEMO_MARK = path.join(DATA, '.negocio-ejemplo')
const demoDone = fs.existsSync(DEMO_MARK)
if (!demoDone) fs.writeFileSync(DEMO_MARK, String(Date.now()))
if (!demoDone && !db.prepare("SELECT 1 FROM users WHERE handle = 'cafelamuralla'").get()) {
  const t0 = now()
  db.prepare("INSERT INTO users (name, handle, pass, hue, is_example, created_at, city, country, biz, biz_name, biz_type, biz_lat, biz_lon, biz_address, biz_hours, biz_whatsapp, featured_until, verified) VALUES ('Café La Muralla', 'cafelamuralla', ?, 30, 1, ?, 'Cartagena', 'Colombia', 1, 'Café La Muralla', 'cafe', 10.4236, -75.5503, 'Calle del Arsenal, Centro Histórico, Cartagena', 'Lun a Dom · 7:00 a. m. – 10:00 p. m.', '573000000000', ?, 1)").run('x:' + crypto.randomBytes(16).toString('hex'), t0, t0 + 30 * 864e5)
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
setTimeout(backup, 60e3).unref()
setInterval(backup, 6 * 3600e3).unref()

// ---------- activar lo pagado (una sola vez por pago) ----------
function applyPayment(pay) {
  const ok = db.prepare("UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ? AND status != 'paid'").run(now(), pay.id).changes
  if (!ok) return
  const st = S(), month = (+(pay.item === 'radio' ? st.planRadio : st.planBiz)?.days || 30) * 864e5
  if (pay.item === 'radio') { const st = db.prepare('SELECT paid_until FROM stations WHERE id = ?').get(pay.target_id); if (st) db.prepare('UPDATE stations SET paid_until = ? WHERE id = ?').run(Math.max(now(), st.paid_until || 0) + month, pay.target_id); stCache = null; broadcast({ type: 'stations' }) }
  else { const u = db.prepare('SELECT featured_until FROM users WHERE id = ?').get(pay.target_id); if (u) db.prepare('UPDATE users SET featured_until = ? WHERE id = ?').run(Math.max(now(), u.featured_until || 0) + month, pay.target_id); broadcast({ type: 'post' }) }
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
const walkViewers = new Map(), walkMsgRate = new Map()
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
  if (db.prepare('SELECT COUNT(*) n FROM walk_points WHERE walk_id = ?').get(w.id).n < 20000) db.prepare('INSERT INTO walk_points VALUES (?, ?, ?, ?)').run(w.id, lat, lon, now())
  broadcast({ type: 'walkpos', walk: w.id, lat, lon, dist: Math.round(w.dist + d), viewers: viewersOf(w.id) })
}
// paseos sin señal por 10 min se terminan solos; borrar puntos de paseos de hace más de 30 días
setInterval(() => { try {
  const old = db.prepare('SELECT id FROM walks WHERE ended_at IS NULL AND last_at < ?').all(now() - 10 * 60e3)
  for (const w of old) { db.prepare('UPDATE walks SET ended_at = last_at WHERE id = ?').run(w.id); broadcast({ type: 'walkend', walk: w.id }) }
  if (old.length) { walksCache = null; broadcast({ type: 'walks' }) }
  db.prepare('DELETE FROM walk_points WHERE t < ?').run(now() - 30 * 864e5)
  for (const [id] of walkViewers) if (!viewersOf(id)) walkViewers.delete(id)
  if (walkMsgRate.size > 5000) walkMsgRate.clear()
} catch {} }, 60e3).unref()
// paseo de demostración: recorre el Centro Histórico de Cartagena durante unos minutos
const DEMO_ROUTE = [[10.42295, -75.55163], [10.42357, -75.55100], [10.42420, -75.55040], [10.42486, -75.54985], [10.42540, -75.54930], [10.42476, -75.54860], [10.42410, -75.54800], [10.42355, -75.54745], [10.42290, -75.54800], [10.42230, -75.54862], [10.42170, -75.54925], [10.42225, -75.55000], [10.42280, -75.55080]]
function startDemoWalk(userId) {
  db.prepare('UPDATE walks SET ended_at = ? WHERE demo = 1 AND ended_at IS NULL').run(now())
  const [lat0, lon0] = DEMO_ROUTE[0]
  const id = Number(db.prepare("INSERT INTO walks (user_id, title, city, started_at, last_lat, last_lon, last_at, demo) VALUES (?, 'Paseo de prueba por el Centro Histórico', 'Cartagena', ?, ?, ?, ?, 1)").run(userId, now(), lat0, lon0, now()).lastInsertRowid)
  db.prepare('INSERT INTO walk_points VALUES (?, ?, ?, ?)').run(id, lat0, lon0, now())
  let seg = 0, f = 0
  const timer = setInterval(() => {
    const w = db.prepare('SELECT * FROM walks WHERE id = ?').get(id)
    if (!w || w.ended_at || seg >= DEMO_ROUTE.length - 1) { clearInterval(timer); if (w && !w.ended_at) { db.prepare('UPDATE walks SET ended_at = ? WHERE id = ?').run(now(), id); walksCache = null; broadcast({ type: 'walkend', walk: id }); broadcast({ type: 'walks' }) } return }
    f += 0.05; if (f >= 1) { f = 0; seg++ } if (seg >= DEMO_ROUTE.length - 1) return
    const [a, b] = [DEMO_ROUTE[seg], DEMO_ROUTE[seg + 1]]
    walkStep(w, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
  }, 3000)
  timer.unref(); walksCache = null; broadcast({ type: 'walks' }); return id
}

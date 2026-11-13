// PLANETA (planetapp): API + base de datos SQLite + archivos estáticos. Sin dependencias externas.
'use strict'
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto')
const { DatabaseSync } = require('node:sqlite')

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

// add exact location columns to existing databases
for (const col of ['lat REAL', 'lon REAL']) { try { db.exec('ALTER TABLE posts ADD COLUMN ' + col) } catch {} }

// ---------- helpers ----------
const now = () => Date.now()
const hashPass = (p, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(p, salt, 64).toString('hex')
const checkPass = (p, stored) => { const [salt, h] = stored.split(':'); const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(p, salt, 64); return a.length === b.length && crypto.timingSafeEqual(a, b) }
const CATS = ['eventos', 'lugares', 'planes', 'noticias', 'deportes', 'ciencia', 'cotidiano', 'situaciones']
const CITY_LL = { 'Bogotá': [4.71, -74.07], 'Medellín': [6.24, -75.57], 'Cartagena': [10.39, -75.51], 'Cali': [3.45, -76.53], 'Ciudad de México': [19.43, -99.13], 'Buenos Aires': [-34.6, -58.38], 'Lima': [-12.05, -77.04], 'Madrid': [40.42, -3.7], 'Barcelona': [41.39, 2.17], 'París': [48.86, 2.35], 'Lisboa': [38.72, -9.14], 'Nueva York': [40.71, -74], 'Tokio': [35.69, 139.69], 'Seúl': [37.57, 126.98], 'Ciudad del Cabo': [-33.92, 18.42], 'Reikiavik': [64.15, -21.9], 'Sídney': [-33.87, 151.21], 'Marrakech': [31.63, -7.99] }
const nearestCity = (lat, lon) => Object.entries(CITY_LL).map(([c, [a, o]]) => [c, (a - lat) ** 2 + ((o - lon) * Math.cos(lat * Math.PI / 180)) ** 2]).sort((x, y) => x[1] - y[1])[0][0]
const CITIES = ['Bogotá', 'Medellín', 'Cartagena', 'Cali', 'Ciudad de México', 'Buenos Aires', 'Lima', 'Madrid', 'Barcelona', 'París', 'Lisboa', 'Nueva York', 'Tokio', 'Seúl', 'Ciudad del Cabo', 'Reikiavik', 'Sídney', 'Marrakech']
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
  return db.prepare('SELECT u.id, u.name, u.handle, u.city, u.hue FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(m[1]) || null
}
function startSession(res, userId, extra) {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now())
  return { 'Set-Cookie': `planeta_s=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}`, ...extra }
}
const publicUser = u => u && { id: u.id, name: u.name, handle: u.handle, city: u.city, hue: u.hue }

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
SELECT p.id, p.title, p.text, p.cat, p.city, p.type, p.image, p.scene, p.lat, p.lon, p.created_at AS at,
  u.name AS author, u.handle, u.hue, u.id AS author_id, u.is_example AS author_example,
  p.base_likes + (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  CASE WHEN p.cat = 'planes' THEN (SELECT COUNT(*) FROM joins j WHERE j.post_id = p.id) END AS joined,
  EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = :me) AS liked,
  EXISTS(SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = :me) AS saved,
  EXISTS(SELECT 1 FROM joins j WHERE j.post_id = p.id AND j.user_id = :me) AS joined_me,
  (p.user_id = :me) AS mine
FROM posts p JOIN users u ON u.id = p.user_id`
const shape = r => r && ({ ...r, author_example: !!r.author_example, liked: !!r.liked, saved: !!r.saved, joined_me: !!r.joined_me, mine: !!r.mine })
const getPost = (id, me) => shape(db.prepare(POST_SQL + ' WHERE p.id = :id').get({ id, me }))

// ---------- API ----------
async function api(req, res, url) {
  const me = currentUser(req), meId = me?.id ?? 0
  const p = url.pathname, method = req.method
  const need = () => { if (!me) throw Object.assign(new Error('Inicia sesión para hacer esto.'), { code: 401 }) }
  let m

  if (p === '/api/me' && method === 'GET') return send(res, 200, { user: publicUser(me) })

  if (p === '/api/register' && method === 'POST') {
    const b = await readBody(req)
    const name = clean(b.name, 60), handle = clean(b.handle, 30).toLowerCase(), pass = String(b.password || ''), city = CITIES.includes(b.city) ? b.city : 'Bogotá'
    if (name.length < 2) return send(res, 400, { error: 'Escribe tu nombre.' })
    if (!/^[a-z0-9_.]{3,30}$/.test(handle)) return send(res, 400, { error: 'El usuario debe tener 3 a 30 letras, números, punto o guion bajo.' })
    if (pass.length < 6) return send(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres.' })
    if (db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle)) return send(res, 409, { error: 'Ese usuario ya existe. Elige otro.' })
    const r = db.prepare('INSERT INTO users (name, handle, pass, city, hue, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(name, handle, hashPass(pass), city, crypto.randomInt(360), now())
    const user = db.prepare('SELECT id, name, handle, city, hue FROM users WHERE id = ?').get(r.lastInsertRowid)
    return send(res, 201, { user: publicUser(user) }, startSession(res, user.id))
  }

  if (p === '/api/login' && method === 'POST') {
    const b = await readBody(req)
    const u = db.prepare('SELECT * FROM users WHERE handle = ? AND is_example = 0').get(clean(b.handle, 30).toLowerCase())
    if (!u || !checkPass(String(b.password || ''), u.pass)) return send(res, 401, { error: 'Usuario o contraseña incorrectos.' })
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
    const rows = db.prepare(POST_SQL + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.created_at DESC LIMIT 300').all(args)
    return send(res, 200, { posts: rows.map(shape) })
  }

  if (p === '/api/posts' && method === 'POST') {
    need()
    const b = await readBody(req)
    const title = clean(b.title, 120), text = clean(b.text, 2000)
    const lat = Number.isFinite(+b.lat) && b.lat !== null && Math.abs(+b.lat) <= 85 ? +b.lat : null, lon = Number.isFinite(+b.lon) && b.lon !== null && Math.abs(+b.lon) <= 180 ? +b.lon : null
    const cat = CATS.includes(b.cat) ? b.cat : null, city = lat !== null && lon !== null ? nearestCity(lat, lon) : CITIES.includes(b.city) ? b.city : null
    if (title.length < 3) return send(res, 400, { error: 'Escribe un título de al menos 3 caracteres.' })
    if (!cat || !city) return send(res, 400, { error: 'Elige una categoría y una ciudad.' })
    const image = b.image ? saveImage(b.image) : null
    const r = db.prepare('INSERT INTO posts (user_id, title, text, cat, city, type, image, scene, lat, lon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(me.id, title, text, cat, city, b.live ? 'directo' : 'usuario', image, 'ciudad', lat, lon, now())
    return send(res, 201, { post: getPost(r.lastInsertRowid, me.id) })
  }

  if ((m = /^\/api\/posts\/(\d+)$/.exec(p))) {
    const id = +m[1]
    if (method === 'GET') {
      const post = getPost(id, meId); if (!post) return send(res, 404, { error: 'Esta publicación ya no existe.' })
      post.comments = db.prepare('SELECT c.id, c.text, c.created_at AS at, u.name AS author, u.hue FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at').all(id)
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
    const del = db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND post_id = ?`).run(me.id, id)
    if (!del.changes) db.prepare(`INSERT INTO ${table} (user_id, post_id) VALUES (?, ?)`).run(me.id, id)
    return send(res, 200, { post: getPost(id, me.id) })
  }

  if ((m = /^\/api\/posts\/(\d+)\/comments$/.exec(p)) && method === 'POST') {
    need(); const id = +m[1], b = await readBody(req), text = clean(b.text, 1000)
    if (!text) return send(res, 400, { error: 'Escribe un comentario.' })
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) return send(res, 404, { error: 'Esta publicación ya no existe.' })
    db.prepare('INSERT INTO comments (post_id, user_id, text, created_at) VALUES (?, ?, ?, ?)').run(id, me.id, text, now())
    return send(res, 201, { ok: true })
  }

  if ((m = /^\/api\/posts\/(\d+)\/report$/.exec(p)) && method === 'POST') {
    need(); const b = await readBody(req)
    db.prepare('INSERT INTO reports (post_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)').run(+m[1], me.id, clean(b.reason, 300), now())
    return send(res, 201, { ok: true })
  }

  if (p === '/api/people' && method === 'GET') {
    const rows = db.prepare(`SELECT u.id, u.name, u.handle, u.city, u.hue, COUNT(p.id) AS posts, MAX(p.created_at) AS last
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
      SELECT u.id, u.name, u.handle, u.hue, m.text AS last_text, m.created_at AS last_at, (m.from_id = :me) AS last_mine,
        (SELECT COUNT(*) FROM messages x WHERE x.from_id = u.id AND x.to_id = :me AND x.read_at IS NULL) AS unread
      FROM last JOIN messages m ON m.id = last.last_id JOIN users u ON u.id = last.other ORDER BY m.created_at DESC`).all({ me: me.id })
    return send(res, 200, { chats: rows.map(r => ({ ...r, last_mine: !!r.last_mine })), unread: rows.reduce((a, r) => a + r.unread, 0) })
  }

  if ((m = /^\/api\/chats\/(\d+)$/.exec(p))) {
    need(); const other = db.prepare('SELECT id, name, handle, hue, city, is_example FROM users WHERE id = ?').get(+m[1])
    if (!other || other.is_example) return send(res, 404, { error: 'Esta persona no puede recibir mensajes.' })
    if (other.id === me.id) return send(res, 400, { error: 'No puedes enviarte mensajes a ti mismo.' })
    if (method === 'POST') {
      const b = await readBody(req), text = clean(b.text, 2000)
      if (!text) return send(res, 400, { error: 'Escribe un mensaje.' })
      db.prepare('INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)').run(me.id, other.id, text, now())
    }
    db.prepare('UPDATE messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL').run(now(), other.id, me.id)
    const msgs = db.prepare('SELECT id, text, created_at AS at, (from_id = ?) AS mine FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 200')
      .all(me.id, me.id, other.id, other.id, me.id).reverse().map(x => ({ ...x, mine: !!x.mine }))
    return send(res, 200, { user: { id: other.id, name: other.name, handle: other.handle, hue: other.hue, city: other.city }, messages: msgs })
  }

  if ((m = /^\/api\/rooms\/([^/]+)$/.exec(p))) {
    const city = decodeURIComponent(m[1])
    if (!CITIES.includes(city)) return send(res, 404, { error: 'Esa ciudad no tiene sala.' })
    if (method === 'POST') {
      need(); const b = await readBody(req), text = clean(b.text, 1000)
      if (!text) return send(res, 400, { error: 'Escribe un mensaje.' })
      db.prepare('INSERT INTO room_messages (city, user_id, text, created_at) VALUES (?, ?, ?, ?)').run(city, me.id, text, now())
    }
    const msgs = db.prepare('SELECT r.id, r.text, r.created_at AS at, u.id AS user_id, u.name AS author, u.hue, (r.user_id = ?) AS mine FROM room_messages r JOIN users u ON u.id = r.user_id WHERE r.city = ? ORDER BY r.id DESC LIMIT 100').all(meId, city).reverse().map(x => ({ ...x, mine: !!x.mine }))
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
// Limit simultaneous downloads per source and retry, so upstream servers don't reject us
// Two separate pools: people viewing the map (fast lane) and background prewarm (slow lane)
const slots = {}, waiting = {}, LIMIT = { u: 6, p: 2 }
const acquire = key => new Promise(r => { slots[key] ??= 0; waiting[key] ??= []; if (slots[key] < LIMIT[key[0]]) { slots[key]++; r() } else waiting[key].push(r) })
const release = key => { const n = waiting[key].shift(); if (n) n(); else slots[key]-- }
const tstats = { ok: 0, fail: 0, lastError: null }
const tileFile = (src, z, x, y) => path.join(TILES, src, String(z), String(x), y + '.' + TILE_SRC[src].ext)
async function fetchTile(src, z, x, y, lane = 'u') {
  const s = TILE_SRC[src], file = tileFile(src, z, x, y)
  try { return await fs.promises.readFile(file) } catch {}
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

// ---------- static ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
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
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)))
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
    fs.stat(file, (err, st) => {
      if (err || st.isDirectory()) file = path.join(ROOT, 'index.html')
      serveFile(res, file, path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000')
    })
  } catch (e) {
    if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : 'Error del servidor. Inténtalo de nuevo.' })
    if (!e.code) console.error(e)
  }
}).listen(PORT, () => console.log(`planetapp en el puerto ${PORT} · base de datos en ${DATA}`))

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

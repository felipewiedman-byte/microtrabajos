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
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason TEXT, created_at INTEGER NOT NULL);
`)

// ---------- helpers ----------
const now = () => Date.now()
const hashPass = (p, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(p, salt, 64).toString('hex')
const checkPass = (p, stored) => { const [salt, h] = stored.split(':'); const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(p, salt, 64); return a.length === b.length && crypto.timingSafeEqual(a, b) }
const CATS = ['eventos', 'lugares', 'planes', 'noticias', 'deportes', 'ciencia', 'cotidiano', 'situaciones']
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
SELECT p.id, p.title, p.text, p.cat, p.city, p.type, p.image, p.scene, p.created_at AS at,
  u.name AS author, u.handle, u.hue,
  p.base_likes + (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  CASE WHEN p.cat = 'planes' THEN (SELECT COUNT(*) FROM joins j WHERE j.post_id = p.id) END AS joined,
  EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = :me) AS liked,
  EXISTS(SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = :me) AS saved,
  EXISTS(SELECT 1 FROM joins j WHERE j.post_id = p.id AND j.user_id = :me) AS joined_me,
  (p.user_id = :me) AS mine
FROM posts p JOIN users u ON u.id = p.user_id`
const shape = r => r && ({ ...r, liked: !!r.liked, saved: !!r.saved, joined_me: !!r.joined_me, mine: !!r.mine })
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
    const cat = CATS.includes(b.cat) ? b.cat : null, city = CITIES.includes(b.city) ? b.city : null
    if (title.length < 3) return send(res, 400, { error: 'Escribe un título de al menos 3 caracteres.' })
    if (!cat || !city) return send(res, 400, { error: 'Elige una categoría y una ciudad.' })
    const image = b.image ? saveImage(b.image) : null
    const r = db.prepare('INSERT INTO posts (user_id, title, text, cat, city, type, image, scene, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(me.id, title, text, cat, city, b.live ? 'directo' : 'usuario', image, 'ciudad', now())
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

  if (p === '/api/stats' && method === 'GET') {
    return send(res, 200, db.prepare('SELECT (SELECT COUNT(*) FROM users WHERE is_example = 0) AS users, (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM comments) AS comments').get())
  }

  return send(res, 404, { error: 'No encontrado.' })
}

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

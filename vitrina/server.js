require('dotenv').config({ quiet: true });
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { one, run, now, settings, DATA_DIR } = require('./lib/db');
const S = require('./lib/shop');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- Sesiones en SQLite ----------
class SqliteStore extends session.Store {
  get(sid, cb) { const r = one('SELECT sess, expires FROM sessions WHERE sid=?', sid); cb(null, !r || r.expires < now() ? null : JSON.parse(r.sess)); }
  set(sid, sess, cb) {
    const exp = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : now() + 86400000;
    run('INSERT OR REPLACE INTO sessions(sid, sess, expires) VALUES (?,?,?)', sid, JSON.stringify(sess), exp); cb && cb(null);
  }
  destroy(sid, cb) { run('DELETE FROM sessions WHERE sid=?', sid); cb && cb(null); }
  touch(sid, sess, cb) {
    const exp = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : now() + 86400000;
    run('UPDATE sessions SET expires=? WHERE sid=? AND expires < ?', exp, sid, exp - 3600000); cb && cb(null);
  }
}
if (PROD && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  console.error('[Vitrina] En producción defina SESSION_SECRET (mínimo 32 caracteres). Ej.: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
app.use(session({
  store: new SqliteStore(), name: 'vt.sid', secret: process.env.SESSION_SECRET || 'cambiar-este-secreto', resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 30 },
}));

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (/^\/(admin|panel|ingresar|registro|recuperar|restablecer)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
  if (PROD && /^https:/.test(process.env.BASE_URL || '')) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Imágenes subidas (nombres aleatorios e imposibles de adivinar; solo se sirven archivos con ese formato).
app.get('/m/:name', (req, res) => {
  const name = path.basename(req.params.name);
  if (!/^[a-f0-9]{28}\.(jpg|png|webp)$/.test(name)) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  res.sendFile(path.join(DATA_DIR, 'uploads', name), (e) => { if (e && !res.headersSent) res.sendStatus(404); });
});
app.use(require('compression')());
const assetV = String(Math.max(...fs.readdirSync(path.join(__dirname, 'public/css')).map((f) => fs.statSync(path.join(__dirname, 'public/css', f)).mtimeMs), ...fs.readdirSync(path.join(__dirname, 'public/js')).map((f) => fs.statSync(path.join(__dirname, 'public/js', f)).mtimeMs)) | 0);
app.locals.assetV = assetV;
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '30d', immutable: true }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

// ---------- Contexto común + CSRF ----------
app.use((req, res, next) => {
  const ck = /(?:^|;\s*)vt_csrf=([a-f0-9]{48})/.exec(req.headers.cookie || '');
  req.csrfToken = ck ? ck[1] : crypto.randomBytes(24).toString('hex');
  if (!ck) res.cookie('vt_csrf', req.csrfToken, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 30 });
  let user = req.session.userId ? one('SELECT * FROM users WHERE id=?', req.session.userId) : null;
  if (user && user.status !== 'active') { req.session.userId = null; user = null; }
  req.user = user;
  req.shop = user ? one('SELECT * FROM shops WHERE user_id=?', user.id) : null;
  const L = res.locals;
  L.user = user; L.shop = req.shop; L.csrf = req.csrfToken; L.settings = settings(); L.path = req.path; L.query = req.query;
  L.baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  L.flash = req.session.flash || null; delete req.session.flash;
  L.icon = require('./lib/icons').icon; L.newOrders = req.shop && req.path.startsWith('/panel') ? one("SELECT COUNT(*) c FROM orders WHERE shop_id=? AND status='new'", req.shop.id).c : 0;
  L.S = S; L.money = S.money; L.plan = S.planOf(user); L.can = (f) => S.can(user, f);
  L.layout = 'site'; L.tab = ''; L.error = null; L.form = {}; L.isProd = PROD; L.title = ''; L.desc = ''; L.og = null; L.noindex = false; L.bodyClass = '';
  L.date = (t) => t ? new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  L.ago = (t) => { const m = Math.round((now() - t) / 60000); if (m < 1) return 'hace un momento'; if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`; };
  req.flash = (type, text) => { req.session.flash = { type, text }; };
  next();
});
app.use((req, res, next) => {
  if (req.method !== 'POST' || req.is('multipart/form-data')) return next();
  if (!req.body || req.body._csrf !== req.csrfToken) {
    if (req.is('json')) return res.status(403).json({ error: 'La sesión expiró. Recarga la página.' });
    return res.status(403).render('error', { title: 'Sesión vencida', message: 'El formulario expiró. Vuelve atrás y recarga la página.' });
  }
  next();
});

app.use(require('./routes/public'));
app.use('/panel', require('./routes/panel'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: 'No encontrada', message: 'La página que buscas no existe o fue movida.' }));
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') { err.status = 400; err.expose = true; err.message = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen es demasiado pesada (máximo 2 MB).' : 'No se pudo subir el archivo.'; }
  if (!err.expose) console.error(err);
  if (req.is && req.is('json')) return res.status(err.status || 500).json({ error: err.expose ? err.message : 'Intenta de nuevo en unos minutos.' });
  res.status(err.status || 500).render('error', { title: 'Ocurrió un problema', message: err.expose ? err.message : 'Intenta de nuevo en unos minutos.' });
});

// ---------- Administrador inicial ----------
if (!one("SELECT 1 x FROM users WHERE role='admin'")) {
  const email = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim(), pass = process.env.ADMIN_PASSWORD || '';
  if (email && pass.length >= 8) {
    run("INSERT INTO users(name,email,password_hash,role,created_at) VALUES ('Administrador',?,?, 'admin',?)", email, bcrypt.hashSync(pass, 11), now());
    console.log(`[Vitrina] Administrador creado: ${email}`);
  } else console.warn('[Vitrina] Sin administrador: defina ADMIN_EMAIL y ADMIN_PASSWORD (mín. 8 caracteres) en .env y reinicie.');
}
setInterval(() => run('DELETE FROM sessions WHERE expires < ?', now()), 60 * 60 * 1000).unref();
require('./lib/backup').schedule();

if (require.main === module) {
  const port = Number(process.env.PORT) || 3006;
  app.listen(port, () => console.log(`[Vitrina] Escuchando en el puerto ${port} (${PROD ? 'producción' : 'desarrollo'})`));
}
module.exports = app;

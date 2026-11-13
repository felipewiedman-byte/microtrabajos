require('dotenv').config({ quiet: true });
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { one, run, now, settings, DATA_DIR } = require('./lib/db');
const S = require('./lib/shop');
const Plans = require('./lib/plans');
const BL = require('./lib/blocks');
const Texts = require('./lib/texts');
const U = require('./lib/util');
require('./lib/pages');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Proxies delante de la app: 1 = solo Caddy/Nginx; 2 = Cloudflare + Caddy/Nginx (así se ve la IP real del visitante).
app.set('trust proxy', Math.max(1, parseInt(process.env.TRUST_PROXY, 10) || 1));
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

// Dominio propio de un negocio (plan Pro): www.tunegocio.com muestra su catálogo directamente.
const MAIN_HOST = (() => { try { return new URL(process.env.BASE_URL || 'http://x').hostname; } catch { return ''; } })();
app.use((req, res, next) => {
  const host = String(req.hostname || '').toLowerCase().replace(/^www\./, '');
  if (!host || host === MAIN_HOST || host === 'localhost' || /^[\d.]+$|:/.test(host)) return next();
  const shop = one('SELECT slug FROM shops WHERE domain=?', host);
  if (!shop) return next();
  if (req.path === '/') req.url = '/t/' + shop.slug + (req.url.slice(1) || '');
  else if (/^\/(panel|admin|ingresar|registro|recuperar)/.test(req.path) && process.env.BASE_URL) return res.redirect(process.env.BASE_URL.replace(/\/$/, '') + req.path);
  next();
});
// Catálogos: se permiten solo los scripts de medición de Meta (píxel) y Google Analytics que configure el negocio.
const CSP = "default-src 'self'; worker-src 'self'; manifest-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const CSP_SHOP = CSP.replace("script-src 'self'", "script-src 'self' https://connect.facebook.net https://www.googletagmanager.com")
  .replace("img-src 'self' data: blob:", "img-src 'self' data: blob: https://www.facebook.com https://www.google-analytics.com https://www.googletagmanager.com")
  .replace("connect-src 'self'", "connect-src 'self' https://www.facebook.com https://connect.facebook.net https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com");
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Content-Security-Policy', req.path.startsWith('/t/') ? CSP_SHOP : CSP);
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (/^\/(admin|panel|ingresar|registro|recuperar|restablecer)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
  if (PROD && /^https:/.test(process.env.BASE_URL || '')) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Imágenes subidas (nombres aleatorios e imposibles de adivinar; solo se sirven archivos con ese formato).
app.get('/m/:name', (req, res) => {
  const name = path.basename(req.params.name);
  if (!/^[a-f0-9]{28}\.(jpg|png|webp|ico)$/.test(name)) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  res.sendFile(path.join(DATA_DIR, 'uploads', name), async (e) => {
    if (!e || res.headersSent) return;
    // No está en el servidor: se trae de Cloudflare R2 (bucket privado).
    try {
      const r2 = require('./lib/r2'), r = r2.has(name) ? await r2.getImage(name) : null;
      if (!r) return res.sendStatus(404);
      res.type(r.type || path.extname(name)).send(r.body);
    } catch { if (!res.headersSent) res.sendStatus(502); }
  });
});
// App instalable: manifiesto, íconos y service worker (el service worker debe servirse desde la raíz).
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').set('Cache-Control', 'public, max-age=3600').send(JSON.stringify(require('./lib/pwa').manifest())));
app.get(/^\/app-icon-(192|512)\.png$/, async (req, res, next) => { try { res.type('image/png').set('Cache-Control', 'public, max-age=86400').send(await require('./lib/pwa').icon(+req.params[0])); } catch (e) { next(e); } });
app.get('/sw.js', (req, res) => res.type('application/javascript').set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }).sendFile(path.join(__dirname, 'public', 'sw.js')));
app.get('/favicon.ico', (req, res) => { const f = settings().favicon; if (!f || !/^[a-f0-9]{28}\.(jpg|png|webp|ico)$/.test(f)) return res.sendStatus(204); res.set('Cache-Control', 'public, max-age=86400'); res.sendFile(path.join(DATA_DIR, 'uploads', f)); });
app.use(require('compression')());
// Versión de los archivos estáticos: cambia si se modifica cualquier CSS, JS, imagen o fuente (rompe la caché de 30 días).
const assetV = String(Math.max(...['css', 'js', 'img', 'fonts'].flatMap((d) => fs.readdirSync(path.join(__dirname, 'public', d)).map((f) => fs.statSync(path.join(__dirname, 'public', d, f)).mtimeMs))) | 0);
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
  L.trialLeft = S.trialDaysLeft(user); L.Plans = Plans; L.BL = BL; L.isStaff = U.isStaff(user); L.hasPerm = (p) => U.hasPerm(user, p); L.TX = Texts.get; L.TXL = Texts.lines; L.S = S; L.money = S.money; L.plan = S.planOf(user); L.can = (f) => S.can(user, f);
  L.layout = /^\/(registro|ingresar|recuperar|restablecer|panel\/crear)/.test(req.path) ? 'auth' : 'site'; L.tab = ''; L.error = null; L.form = {}; L.isProd = PROD; L.title = ''; L.desc = ''; L.og = null; L.noindex = /^\/(admin|panel|ingresar|registro|recuperar|restablecer)/.test(req.path); L.bodyClass = ''; L.keywords = ''; L.jsonld = null; L.reqPath = req.path;
  L.date = (t) => t ? new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  L.ago = (t) => { const m = Math.round((now() - t) / 60000); if (m < 1) return 'hace un momento'; if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`; };
  req.flash = (type, text) => { req.session.flash = { type, text }; };
  next();
});
app.use((req, res, next) => {
  if (req.method !== 'POST' || req.is('multipart/form-data') || req.path.startsWith('/webhooks/')) return next();
  // Pedidos, cupones y pagos del catálogo público: solo JSON del mismo sitio (un formulario ajeno no puede enviar JSON ni pasar la verificación de origen).
  if (/^\/t\/[^/]+\/(pedido|cupon|pagar)$/.test(req.path)) {
    const o = req.get('origin');
    if (!req.is('json') || (o && (() => { try { return new URL(o).host !== req.get('host'); } catch { return true; } })())) return res.status(403).json({ error: 'Solicitud no permitida.' });
    return next();
  }
  if (!req.body || req.body._csrf !== req.csrfToken) {
    if (req.is('json')) return res.status(403).json({ error: 'La sesión expiró. Recarga la página.' });
    return res.status(403).render('error', { title: 'Sesión vencida', message: 'El formulario expiró. Vuelve atrás y recarga la página.' });
  }
  next();
});

app.use(require('./routes/public'));
app.use('/panel', require('./routes/panel'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: Texts.get('err404_title'), message: Texts.get('err404_msg') }));
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') { err.status = 400; err.expose = true; err.message = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen es demasiado pesada (máximo 2 MB).' : 'No se pudo subir el archivo.'; }
  if (!err.expose) console.error(err);
  if (req.is && req.is('json')) return res.status(err.status || 500).json({ error: err.expose ? err.message : Texts.get('err500_msg') });
  res.status(err.status || 500).render('error', { title: Texts.get('err500_title'), message: err.expose ? err.message : Texts.get('err500_msg') });
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
require('./lib/storage').schedule();
require('./lib/reconcile').schedule();
require('./lib/notices').schedule();
require('./lib/trial');
setInterval(() => { try { require('./lib/orders').expirePending(); } catch (e) { console.error(e); } }, Number(process.env.PAY_SWEEP_MS) || 10 * 60 * 1000).unref();

if (require.main === module) {
  const port = Number(process.env.PORT) || 3006;
  app.listen(port, process.env.HOST || undefined, () => console.log(`[Vitrina] Escuchando en el puerto ${port} (${PROD ? 'producción' : 'desarrollo'})`));
}
module.exports = app;

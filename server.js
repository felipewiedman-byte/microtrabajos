require('dotenv').config({ quiet: true });
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { one, run, now, settings } = require('./lib/db');
const market = require('./lib/market');
const payments = require('./lib/payments');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- Sesiones guardadas en SQLite ----------
class SqliteStore extends session.Store {
  get(sid, cb) {
    const r = one('SELECT sess, expires FROM sessions WHERE sid=?', sid);
    if (!r || r.expires < now()) return cb(null, null);
    cb(null, JSON.parse(r.sess));
  }
  set(sid, sess, cb) {
    const exp = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : now() + 86400000;
    run('INSERT OR REPLACE INTO sessions(sid, sess, expires) VALUES (?,?,?)', sid, JSON.stringify(sess), exp);
    cb && cb(null);
  }
  destroy(sid, cb) { run('DELETE FROM sessions WHERE sid=?', sid); cb && cb(null); }
  // Renueva la expiración como máximo una vez por hora (evita escribir en disco en cada visita).
  touch(sid, sess, cb) {
    const exp = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : now() + 86400000;
    run('UPDATE sessions SET expires=? WHERE sid=? AND expires < ?', exp, sid, exp - 3600000);
    cb && cb(null);
  }
}

if (PROD && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET === 'cambiar-este-secreto')) {
  console.error('[Haganapp] En producción defina SESSION_SECRET (mínimo 32 caracteres aleatorios). Ej.: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
app.use(session({
  store: new SqliteStore(),
  secret: process.env.SESSION_SECRET || 'cambiar-este-secreto',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 14 },
}));

// Cabeceras de seguridad básicas
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Política de seguridad de contenido: solo se ejecuta JavaScript propio; nada se puede incrustar en otros sitios.
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  // Las áreas privadas no deben aparecer en Google.
  if (/^\/(admin|panel|cuenta|pedidos|mensajes|notificaciones|postulaciones|billetera|archivos|pagar|pagos|api|restablecer|verificar|mercado\/pedidos|ingresar|registro|recuperar)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  if (PROD && /^https:/.test(process.env.BASE_URL || '')) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Logos y favicon subidos desde el panel (solo esos archivos son públicos).
app.get('/media/:name', (req, res) => {
  const s = settings(), name = path.basename(req.params.name);
  if (!name || ![s.logo_color, s.logo_white, s.favicon, s.hero_image].includes(name)) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(require('./lib/db').DATA_DIR, 'uploads', name));
});
app.use(require('compression')());
// Archivos estáticos con caché larga; la URL lleva la versión (fecha del archivo) para refrescarse al actualizar.
const ASSET_V = String(Math.max(...['css/styles.css', 'js/app.js'].map((f) => require('fs').statSync(path.join(__dirname, 'public', f)).mtimeMs | 0)));
app.locals.assetV = ASSET_V;
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '30d', immutable: true }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));

// ---------- Contexto común de las vistas + CSRF ----------
app.use((req, res, next) => {
  // Token CSRF en una cookie propia (patrón double-submit): no crea sesiones para visitantes anónimos.
  const ck = /(?:^|;\s*)mt_csrf=([a-f0-9]{48})/.exec(req.headers.cookie || '');
  req.csrfToken = ck ? ck[1] : crypto.randomBytes(24).toString('hex');
  if (!ck) res.cookie('mt_csrf', req.csrfToken, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 30 });
  const user = req.session.userId ? one('SELECT * FROM users WHERE id=?', req.session.userId) : null;
  if (user && user.status !== 'active') { req.session.userId = null; }
  req.user = user && user.status === 'active' ? user : null;
  res.locals.impersonating = !!req.session.adminId;
  res.locals.user = req.user;
  res.locals.csrf = req.csrfToken;
  res.locals.money = market.money;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.settings = settings();
  res.locals.mailOn = require('./lib/mail').configured();
  res.locals.isProd = PROD;
  res.locals.baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.unread = req.user ? one('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0', req.user.id).c : 0;
  res.locals.ago = (t) => {
    const m = Math.round((now() - t) / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} d`;
  };
  res.locals.date = (t) => t ? new Date(t).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  res.locals.hours = (h) => h < 24 ? `${h} h` : `${Math.round(h / 24)} día${h >= 48 ? 's' : ''}`;
  res.locals.STATUS = {
    pending_payment: ['Pendiente de pago', 'warn'], in_progress: ['En proceso', 'info'], delivered: ['Entregado', 'accent'],
    revision: ['En corrección', 'warn'], completed: ['Completado', 'ok'], disputed: ['En disputa', 'danger'],
    refunded: ['Reembolsado', ''], cancelled: ['Cancelado', ''], open: ['Abierta', 'ok'], closed: ['Cerrada', ''], removed: ['Eliminada', 'danger'],
    pending: ['Pendiente', 'warn'], accepted: ['Aceptada', 'ok'], rejected: ['No seleccionada', ''], paid: ['Pagado', 'ok'],
    requested: ['Solicitado', 'warn'], assigned: ['Comprando', 'info'], purchased: ['En camino', 'accent'], refund_pending: ['Reembolso pendiente', 'danger'], active: ['Activo', 'ok'], paused: ['Pausado', ''], resolved: ['Resuelta', 'ok'], suspended: ['Suspendido', 'danger'],
  };
  res.locals.badge = (s) => { const v = res.locals.STATUS[s] || [s, '']; return `<span class="badge ${v[1]}">${v[0]}</span>`; };
  // Nombre público: nombre + inicial del apellido (dificulta buscar a la persona por fuera).
  res.locals.publicName = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1].charAt(0).toUpperCase()}.` : p[0]; };
  res.locals.t = require('./lib/texts').t;
  res.locals.navCats = require('./lib/db').all("SELECT slug, name, grp FROM categories WHERE active=1 ORDER BY grp='presencial' DESC, sort");
  // Ciudad elegida por el visitante (cookie firmada) y lista inicial de ciudades (accesos rápidos)
  const geo = require('./lib/geo');
  res.locals.CITIES = String(res.locals.settings.cities || '').split(',').map((c) => c.trim()).filter(Boolean);
  const cm = /(?:^|;\s*)mt_city=([^;]+)/.exec(req.headers.cookie || '');
  let cityCk = ''; try { cityCk = cm ? decodeURIComponent(cm[1]) : ''; } catch { cityCk = ''; }
  const [ckLabel, ckSig] = cityCk.split('|');
  req.city = geo.resolve(ckLabel, ckSig) || (req.user?.city ? geo.cleanLabel(req.user.city) : '');
  res.locals.cityShort = geo.shortName;
  res.locals.citySig = geo.sign;
  res.locals.city = req.city;
  // Precio principal (COP o USD según configuración) y secundario
  res.locals.cop = (cents) => '$' + Math.round((cents / 100) * (res.locals.settings.usd_to_local || 1)).toLocaleString('es-CO');
  res.locals.priceMain = (cents) => String(res.locals.settings.display_currency) === 'USD' ? res.locals.money(cents).replace(' USD', '') : res.locals.cop(cents);
  res.locals.priceCur = () => String(res.locals.settings.display_currency) === 'USD' ? 'USD' : (process.env.MP_CURRENCY || 'COP');
  res.locals.priceSub = (cents) => String(res.locals.settings.display_currency) === 'USD' ? res.locals.local(cents) : res.locals.money(cents);
  res.locals.CAT_COLORS = ['#1d4ed8', '#0e7490', '#be185d', '#047857', '#334155', '#6d28d9', '#c2410c', '#0f766e', '#a16207', '#4338ca', '#15803d', '#b91c1c'];
  res.locals.catStyle = () => '--c:var(--brand);--c-bg:var(--brand-soft)';
  Object.assign(res.locals, require('./lib/icons'));
  // Equivalente aproximado en moneda local (COP por defecto) para mostrar junto al precio en USD.
  res.locals.local = (cents) => {
    const cur = process.env.MP_CURRENCY || 'COP';
    if (cur === 'USD') return '';
    return '≈ $' + Math.round((cents / 100) * (res.locals.settings.usd_to_local || 1)).toLocaleString('es-CO') + ' ' + cur;
  };
  req.flash = (type, text) => { req.session.flash = { type, text }; };
  next();
});

app.use((req, res, next) => {
  if (req.method !== 'POST' || req.path.startsWith('/webhooks/') || req.is('multipart/form-data')) return next();
  if (!req.body || req.body._csrf !== req.csrfToken) return res.status(403).render('error', { title: 'Sesión vencida', message: 'El formulario expiró. Vuelva atrás y recargue la página.' });
  next();
});

app.use(require('./routes/public'));
app.use(require('./routes/app'));
app.use(require('./routes/grocery'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: 'Página no encontrada', message: 'La página que busca no existe o fue movida.' }));
app.use((err, req, res, next) => {
  // Errores de archivos (tamaño, cantidad): volver al formulario con un mensaje claro.
  if (err.name === 'MulterError') {
    const msg = { LIMIT_FILE_SIZE: 'El archivo es demasiado pesado. Las imágenes del panel pueden pesar hasta 3 MB y los archivos de los pedidos hasta 8 MB.', LIMIT_FILE_COUNT: 'Se enviaron demasiados archivos a la vez.', LIMIT_UNEXPECTED_FILE: 'Archivo no esperado en este formulario.' }[err.code] || 'No se pudo subir el archivo.';
    err.code = 'CONTACT'; err.message = msg;
  }
  // Mensaje bloqueado por datos de contacto: volver al formulario con aviso.
  if (err.code === 'CONTACT') {
    req.session.flash = { type: 'error', text: err.message };
    let back = '/';
    try { const u = new URL(req.get('referer') || '', 'http://x'); if (u.pathname.startsWith('/')) back = u.pathname + u.search; } catch { /* */ }
    return res.redirect(back);
  }
  if (!err.expose) console.error(err);
  res.status(err.status || 500).render('error', { title: 'Ocurrió un problema', message: err.expose ? err.message : 'Intente nuevamente en unos minutos.' });
});

// Tareas periódicas: aprobación automática de entregas.
market.autoApprove();
setInterval(() => { try { market.autoApprove(); } catch (e) { console.error(e); } }, 10 * 60 * 1000).unref();
setInterval(() => run('DELETE FROM sessions WHERE expires < ?', now()), 60 * 60 * 1000).unref();
require('./lib/backup').schedule();

// Limpieza diaria de disco: archivos de chat/entregas de pedidos terminados hace más de 180 días.
// Se conserva el registro del pedido y el nombre del archivo; solo se libera el espacio.
function purgeOldFiles() {
  const fs = require('fs');
  const dir = path.join(require('./lib/db').DATA_DIR, 'uploads');
  const cutoff = now() - 180 * 86400000;
  const rows = require('./lib/db').all("SELECT e.id, e.file, e.file_name FROM order_events e JOIN orders o ON o.id=e.order_id WHERE e.file IS NOT NULL AND o.status IN ('completed','cancelled','refunded') AND COALESCE(o.completed_at, o.created_at) < ? LIMIT 500", cutoff);
  for (const r of rows) {
    try { fs.unlinkSync(path.join(dir, path.basename(r.file))); } catch { /* ya no existe */ }
    run('UPDATE order_events SET file=NULL, file_name=? WHERE id=?', `${r.file_name || 'archivo'} (eliminado por antigüedad)`, r.id);
  }
}
setTimeout(() => { try { purgeOldFiles(); } catch (e) { console.error(e); } }, 60 * 1000).unref();
setInterval(() => { try { purgeOldFiles(); } catch (e) { console.error(e); } }, 24 * 60 * 60 * 1000).unref();

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Haganapp] http://localhost:${PORT}`);
    console.log('[Haganapp] Métodos de pago activos:', payments.providers().map((p) => p.name).join(', '));
  });
}
module.exports = app;

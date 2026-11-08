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
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

if (PROD && !process.env.SESSION_SECRET) console.warn('[MICROTRABAJO] Defina SESSION_SECRET en producción.');
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
  next();
});

app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '7d' : 0 }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));

// ---------- Contexto común de las vistas + CSRF ----------
app.use((req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  const user = req.session.userId ? one('SELECT * FROM users WHERE id=?', req.session.userId) : null;
  if (user && user.status === 'suspended') { req.session.userId = null; }
  req.user = user && user.status !== 'suspended' ? user : null;
  res.locals.user = req.user;
  res.locals.csrf = req.session.csrf;
  res.locals.money = market.money;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.settings = settings();
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
    requested: ['Solicitado', 'warn'], refund_pending: ['Reembolso pendiente', 'danger'], active: ['Activo', 'ok'], paused: ['Pausado', ''], resolved: ['Resuelta', 'ok'], suspended: ['Suspendido', 'danger'],
  };
  res.locals.badge = (s) => { const v = res.locals.STATUS[s] || [s, '']; return `<span class="badge ${v[1]}">${v[0]}</span>`; };
  res.locals.stars = (n) => n ? '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n)) : '';
  req.flash = (type, text) => { req.session.flash = { type, text }; };
  next();
});

app.use((req, res, next) => {
  if (req.method !== 'POST' || req.path.startsWith('/webhooks/') || req.is('multipart/form-data')) return next();
  if ((req.body && req.body._csrf) !== req.session.csrf) return res.status(403).render('error', { title: 'Sesión vencida', message: 'El formulario expiró. Vuelva atrás y recargue la página.' });
  next();
});

app.use(require('./routes/public'));
app.use(require('./routes/app'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: 'Página no encontrada', message: 'La página que busca no existe o fue movida.' }));
app.use((err, req, res, next) => {
  if (!err.expose) console.error(err);
  res.status(err.status || 500).render('error', { title: 'Ocurrió un problema', message: err.expose ? err.message : 'Intente nuevamente en unos minutos.' });
});

// Tareas periódicas: aprobación automática y vencimiento de planes.
market.autoApprove();
setInterval(() => { try { market.autoApprove(); } catch (e) { console.error(e); } }, 10 * 60 * 1000).unref();
setInterval(() => run('DELETE FROM sessions WHERE expires < ?', now()), 60 * 60 * 1000).unref();

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[MICROTRABAJO] http://localhost:${PORT}`);
    console.log('[MICROTRABAJO] Métodos de pago activos:', payments.providers().map((p) => p.name).join(', '));
  });
}
module.exports = app;

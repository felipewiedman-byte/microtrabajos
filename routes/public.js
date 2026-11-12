const express = require('express');
const bcrypt = require('bcryptjs');
const { one, all, run, now, settings } = require('../lib/db');
const market = require('../lib/market');
const payments = require('../lib/payments');
const { fail, clean, int } = require('../lib/http');
const geo = require('../lib/geo');
const limiter = require('../lib/limiter');
const tokens = require('../lib/tokens');
const mail = require('../lib/mail');

const r = express.Router();
const COUNTRIES = { CO: 'Colombia', MX: 'México', AR: 'Argentina', CL: 'Chile', PE: 'Perú', EC: 'Ecuador', VE: 'Venezuela', UY: 'Uruguay', PA: 'Panamá', CR: 'Costa Rica', DO: 'República Dominicana', GT: 'Guatemala', BO: 'Bolivia', PY: 'Paraguay', ES: 'España', US: 'Estados Unidos' };
// Resto de países del mundo (ISO 3166-1), con nombre en español, ordenados alfabéticamente.
(() => {
  const names = new Intl.DisplayNames(['es'], { type: 'region', fallback: 'none' });
  const iso = 'AD AE AF AG AI AL AM AO AQ AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CM CN CU CV CW CX CY CZ DE DJ DK DM DZ EG EH ER EE ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PF PG PH PK PL PM PN PR PS PT PW QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UZ VA VC VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
  iso.map((c) => [c, names.of(c)]).filter(([, n]) => n).sort((a, b) => a[1].localeCompare(b[1], 'es')).forEach(([c, n]) => { if (!COUNTRIES[c]) COUNTRIES[c] = n; });
  COUNTRIES.OT = 'Otro';
})();
r.use((req, res, next) => { res.locals.COUNTRIES = COUNTRIES; next(); });

const cats = () => all('SELECT c.*, (SELECT COUNT(*) FROM tasks t WHERE t.category_id=c.id AND t.status=\'open\') open_tasks FROM categories c WHERE active=1 ORDER BY sort');
const questionsFor = (type, id) => all(`SELECT q.*, u.name asker, o.status order_status FROM questions q JOIN users u ON u.id=q.asker_id
  LEFT JOIN orders o ON o.id=q.order_id WHERE q.target_type=? AND q.target_id=? ORDER BY q.created_at DESC LIMIT 50`, type, id);
const TASK_SELECT = `SELECT t.*, c.name cat_name, c.slug cat_slug, c.sort cat_sort, u.name client_name,
  (SELECT COUNT(*) FROM applications a WHERE a.task_id=t.id) apps FROM tasks t
  JOIN categories c ON c.id=t.category_id JOIN users u ON u.id=t.client_id`;
const GIG_SELECT = `SELECT g.*, c.name cat_name, c.slug cat_slug, c.sort cat_sort, u.name worker_name, u.headline,
  (SELECT ROUND(AVG(rating),1) FROM reviews rv WHERE rv.worker_id=g.worker_id) rating,
  (SELECT COUNT(*) FROM reviews rv WHERE rv.worker_id=g.worker_id) reviews
  FROM gigs g JOIN categories c ON c.id=g.category_id JOIN users u ON u.id=g.worker_id`;

// ---------- Inicio ----------
r.get('/', (req, res) => {
  const t = now();
  res.render('home', {
    title: 'Ayuda remunerada entre personas',
    packs: require('../lib/credits').isOn() ? require('../lib/credits').packs() : [],
    sections: all('SELECT * FROM sections WHERE active=1 ORDER BY sort, id'),
    cats: cats(),
    tasks: all(`${TASK_SELECT} WHERE t.status='open' AND t.modality='digital' ORDER BY (COALESCE(t.featured_until,0) > ?) DESC, t.created_at DESC LIMIT 12`, t),
    near: req.city ? all(`${TASK_SELECT} WHERE t.status='open' AND t.modality='presencial' AND t.city=? ORDER BY (COALESCE(t.featured_until,0) > ?) DESC, t.created_at DESC LIMIT 12`, req.city, t) : [],
    hourly: all(`${TASK_SELECT} WHERE t.status='open' AND t.price_type IN ('hourly','open') ORDER BY t.created_at DESC LIMIT 12`),
    gigs: all(`${GIG_SELECT} WHERE g.status='active' AND u.status='active' ORDER BY u.strikes >= 3, rating DESC NULLS LAST, g.created_at DESC LIMIT 12`),
    stats: {
      users: one('SELECT COUNT(*) c FROM users').c,
      tasks: one("SELECT COUNT(*) c FROM tasks WHERE status='open'").c,
      done: one("SELECT COUNT(*) c FROM orders WHERE status='completed'").c,
    },
  });
});

// ---------- Explorar tareas ----------
r.get('/explorar', (req, res) => {
  const where = ["t.status='open'"], params = [];
  const q = clean(req.query.q, 100);
  if (q) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (req.query.cat) { where.push('c.slug=?'); params.push(String(req.query.cat)); }
  if (req.query.min) { where.push('t.budget_cents>=?'); params.push(int(req.query.min) * 100); }
  if (req.query.max) { where.push('t.budget_cents<=?'); params.push(int(req.query.max) * 100); }
  if (req.query.express) where.push('t.express=1');
  if (req.query.modalidad === 'presencial' || req.query.modalidad === 'digital') { where.push('t.modality=?'); params.push(req.query.modalidad); }
  if (req.query.precio === 'hourly' || req.query.precio === 'open') { where.push('t.price_type=?'); params.push(req.query.precio); }
  // Digitales: visibles desde cualquier lugar. Presenciales: solo los de la ciudad elegida (o la de la persona).
  const ciudad = geo.cleanLabel(req.query.ciudad) || req.city || '';
  if (ciudad) { where.push("(t.modality='digital' OR t.city=?)"); params.push(ciudad); }
  else where.push("t.modality='digital'");
  if (req.query.modo === 'units') where.push("t.mode='units'");
  const order = { precio: 't.budget_cents DESC', entrega: 't.delivery_hours ASC' }[req.query.orden] || 't.created_at DESC';
  const page = Math.max(1, int(req.query.p, 1)), per = 12;
  const total = one(`SELECT COUNT(*) c FROM tasks t JOIN categories c ON c.id=t.category_id WHERE ${where.join(' AND ')}`, ...params).c;
  const tasks = all(`${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY (COALESCE(t.featured_until,0) > ?) DESC, ${order} LIMIT ? OFFSET ?`, ...params, now(), per, (page - 1) * per);
  res.render('explore', { ciudad, needCity: !ciudad && req.query.modalidad === 'presencial', title: req.query.express ? 'Express: trabajos urgentes' : req.query.modalidad === 'presencial' ? 'Ayuda en persona' : req.query.modalidad === 'digital' ? 'Trabajos digitales' : req.query.precio === 'hourly' ? 'Ayuda por horas' : req.query.precio === 'open' ? 'Resuelve mi problema' : 'Explorar tareas', tasks, cats: cats(), total, page, pages: Math.ceil(total / per) });
});

// ---------- Para buscadores: robots.txt y sitemap.xml ----------
const siteBase = (req) => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
r.get('/robots.txt', (req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(
    `User-agent: *\nDisallow: /admin\nDisallow: /panel\nDisallow: /cuenta\nDisallow: /pedidos\nDisallow: /mensajes\nDisallow: /notificaciones\nDisallow: /billetera\nDisallow: /archivos\nDisallow: /pagar\nDisallow: /pagos\nDisallow: /api/\nDisallow: /mercado/pedidos\nDisallow: /ingresar\nDisallow: /registro\nDisallow: /recuperar\nAllow: /\n\nSitemap: ${siteBase(req)}/sitemap.xml\n`);
});
let sitemapCache = { at: 0, base: '', xml: '' };
r.get('/sitemap.xml', (req, res) => {
  const base = siteBase(req);
  if (sitemapCache.base !== base || Date.now() - sitemapCache.at > 60 * 60 * 1000) { // se recalcula como máximo una vez por hora
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const day = (t) => new Date(t).toISOString().slice(0, 10);
    const urls = ['/', '/explorar', '/servicios', '/profesionales', '/categorias', '/planes', '/como-funciona', '/ayuda', '/seguridad', '/terminos', '/privacidad', '/reembolsos'].map((p) => `<url><loc>${esc(base + p)}</loc></url>`);
    for (const t of all("SELECT id, created_at FROM tasks WHERE status='open' AND modality='digital' ORDER BY created_at DESC LIMIT 2000")) urls.push(`<url><loc>${base}/tareas/${t.id}</loc><lastmod>${day(t.created_at)}</lastmod></url>`);
    for (const g of all("SELECT g.id, g.created_at FROM gigs g JOIN users u ON u.id=g.worker_id WHERE g.status='active' AND u.status='active' ORDER BY g.created_at DESC LIMIT 2000")) urls.push(`<url><loc>${base}/servicios/${g.id}</loc><lastmod>${day(g.created_at)}</lastmod></url>`);
    sitemapCache = { at: Date.now(), base, xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n` };
  }
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(sitemapCache.xml);
});

r.get('/express', (req, res) => res.redirect('/explorar?express=1'));
r.get('/ciudad', (req, res) => {
  const c = geo.resolve(req.query.c, req.query.s);
  if (c) res.cookie('mt_city', c + '|' + geo.sign(c), { maxAge: 1000 * 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  else res.clearCookie('mt_city');
  const back = String(req.query.volver || '/');
  res.redirect(/^\/[^/\\]/.test(back) || back === '/' ? back : '/');
});

// ---------- Ciudades del mundo: búsqueda y GPS ----------
const geoGuard = (req, res, next) => {
  res.set('Cache-Control', 'private, max-age=600');
  if (!geo.allow(req.ip)) return res.status(429).json({ error: 'rate' });
  next();
};
const geoFail = (res, e) => res.status(e && e.code === 'BUSY' ? 429 : 502).json({ error: e && e.code === 'BUSY' ? 'busy' : 'upstream' });
r.get('/api/geo/buscar', geoGuard, async (req, res) => {
  try { res.json({ results: await geo.search(req.query.q) }); } catch (e) { geoFail(res, e); }
});
r.get('/api/geo/inversa', geoGuard, async (req, res) => {
  try { res.json({ place: await geo.reverse(req.query.lat, req.query.lon) }); } catch (e) { geoFail(res, e); }
});
r.get('/categorias', (req, res) => res.render('categories', { title: 'Categorías', cats: cats() }));
r.get('/categoria/:slug', (req, res) => res.redirect('/explorar?cat=' + encodeURIComponent(req.params.slug)));

// ---------- Servicios a precio fijo ----------
r.get('/servicios', (req, res) => {
  const where = ["g.status='active'", "u.status='active'"], params = [];
  const q = clean(req.query.q, 100);
  if (q) { where.push('(g.title LIKE ? OR g.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (req.query.cat) { where.push('c.slug=?'); params.push(String(req.query.cat)); }
  const gigs = all(`${GIG_SELECT} WHERE ${where.join(' AND ')} ORDER BY u.strikes >= 3, g.created_at DESC LIMIT 60`, ...params);
  res.render('gigs', { title: 'Servicios a precio fijo', gigs, cats: cats() });
});

r.get('/servicios/:id(\\d+)', (req, res, next) => {
  const gig = one(`${GIG_SELECT} WHERE g.id=?`, int(req.params.id));
  if (!gig || (gig.status !== 'active' && req.user?.id !== gig.worker_id)) return next(fail(404, 'Servicio no encontrado.'));
  const reviews = all('SELECT rv.*, u.name FROM reviews rv JOIN users u ON u.id=rv.reviewer_id WHERE rv.worker_id=? ORDER BY rv.created_at DESC LIMIT 5', gig.worker_id);
  res.render('gig', { title: gig.title, description: String(gig.description || '').replace(/\s+/g, ' ').slice(0, 160), gig, questions: questionsFor('gig', gig.id), reviews, stats: market.workerStats(gig.worker_id), fee: market.clientFee(gig.price_cents) });
});

// ---------- Detalle de tarea ----------
r.get('/tareas/:id(\\d+)', (req, res, next) => {
  const task = one(`${TASK_SELECT} WHERE t.id=?`, int(req.params.id));
  if (!task || (task.status === 'removed' && req.user?.role !== 'admin')) return next(fail(404, 'Tarea no encontrada.'));
  const isOwner = req.user && req.user.id === task.client_id;
  const applications = isOwner ? all(`SELECT a.*, u.name, u.headline FROM applications a JOIN users u ON u.id=a.worker_id WHERE a.task_id=? ORDER BY a.status='pending' DESC, a.created_at`, task.id)
    .map((a) => ({ ...a, stats: market.workerStats(a.worker_id) })) : [];
  const myApp = req.user ? one('SELECT * FROM applications WHERE task_id=? AND worker_id=?', task.id, req.user.id) : null;
  const client = { stats: one("SELECT COUNT(*) posted, (SELECT COUNT(*) FROM orders WHERE client_id=? AND status='completed') hired FROM tasks WHERE client_id=?", task.client_id, task.client_id) };
  res.render('task', { leadCost: require('../lib/credits').offerCost(task.budget_cents || 0), myCredits: req.user ? require('../lib/credits').balance(req.user.id) : 0, title: task.title, description: String(task.description || '').replace(/\s+/g, ' ').slice(0, 160), task, questions: questionsFor('task', task.id), isOwner, applications, myApp, client, featured: task.featured_until > now() });
});

// ---------- Profesionales y perfiles ----------
r.get('/profesionales', (req, res) => {
  const q = clean(req.query.q, 100);
  const pros = all(`SELECT u.id, u.name, u.headline, u.skills, u.country, u.verified_id,
    (SELECT ROUND(AVG(rating),1) FROM reviews WHERE worker_id=u.id) rating,
    (SELECT COUNT(*) FROM reviews WHERE worker_id=u.id) reviews,
    (SELECT COUNT(*) FROM orders WHERE worker_id=u.id AND status='completed') done
    FROM users u WHERE u.status='active' AND u.role='user' AND (u.headline!='' OR EXISTS(SELECT 1 FROM gigs WHERE worker_id=u.id))
    ${q ? 'AND (u.name LIKE ? OR u.headline LIKE ? OR u.skills LIKE ?)' : ''}
    ORDER BY u.strikes >= 3, rating DESC NULLS LAST, done DESC LIMIT 60`, ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []));
  res.render('pros', { title: 'Profesionales', pros });
});

r.get('/perfil/:id(\\d+)', (req, res, next) => {
  const p = one('SELECT * FROM users WHERE id=? AND status=?', int(req.params.id), 'active');
  if (!p) return next(fail(404, 'Perfil no encontrado.'));
  const lastOrder = req.user && req.user.id !== p.id ? one("SELECT id FROM orders WHERE client_id=? AND worker_id=? AND status='completed' ORDER BY completed_at DESC LIMIT 1", req.user.id, p.id) : null;
  res.render('profile', {
    title: p.name, p, lastOrder,
    stats: market.workerStats(p.id),
    gigs: all(`${GIG_SELECT} WHERE g.worker_id=? AND g.status='active'`, p.id),
    reviews: all('SELECT rv.*, u.name FROM reviews rv JOIN users u ON u.id=rv.reviewer_id WHERE rv.worker_id=? ORDER BY rv.created_at DESC LIMIT 20', p.id),
  });
});

// ---------- Páginas informativas ----------
const PAGES = { 'como-funciona': 'Cómo funciona', ayuda: 'Centro de ayuda', seguridad: 'Centro de seguridad', terminos: 'Términos y condiciones', privacidad: 'Política de privacidad', reembolsos: 'Política de reembolsos' };
for (const [slug, title] of Object.entries(PAGES)) r.get('/' + slug, (req, res) => res.render('pages/' + slug, { title }));
// Planes de créditos (página pública). Con el modelo de comisión no hay planes.
r.get('/planes', (req, res) => {
  const cr = require('../lib/credits');
  if (!cr.isOn()) return res.redirect(301, '/como-funciona');
  res.render('plans', { title: 'Planes de créditos', packs: cr.packs(), description: 'Compra créditos para enviar ofertas. Solo pagas si te eligen y cobras el 100 % de lo que acuerdes con el cliente.' });
});

// ---------- Autenticación ----------
r.get('/registro', (req, res) => res.render('auth/register', { title: 'Crear cuenta', form: {} }));
r.post('/registro', (req, res) => {
  const form = { name: clean(req.body.name, 80), email: clean(req.body.email, 120).toLowerCase(), country: clean(req.body.country, 2), currency: clean(req.body.currency, 3) };
  const err = (m) => res.status(400).render('auth/register', { title: 'Crear cuenta', form, error: m });
  if (!limiter.take('signup:' + req.ip, 5, 60 * 60000)) return err('Demasiados registros desde esta conexión. Intente en una hora.');
  if (form.name.length < 3) return err('Escriba su nombre y apellido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return err('Correo electrónico no válido.');
  if (String(req.body.password || '').length < 8) return err('La contraseña debe tener al menos 8 caracteres.');
  if (req.body.password !== req.body.password2) return err('Las contraseñas no coinciden.');
  if (!req.body.terms) return err('Debe aceptar los términos y la política de privacidad.');
  if (one('SELECT id FROM users WHERE email=?', form.email)) return err('Ya existe una cuenta con ese correo.');
  const id = run('INSERT INTO users(name,email,password_hash,country,currency,created_at) VALUES (?,?,?,?,?,?)',
    form.name, form.email, bcrypt.hashSync(req.body.password, 10), COUNTRIES[form.country] ? form.country : 'OT', ['USD', 'COP', 'MXN', 'EUR'].includes(form.currency) ? form.currency : 'USD', now()).lastInsertRowid;
  mail.sendVerify({ name: form.name, email: form.email }, tokens.create(Number(id), 'verify', 48 * 3600000));
  { const cr = require('../lib/credits'), w = Math.round(Number(settings().welcome_credits) || 0); if (cr.isOn() && w > 0) cr.add(Number(id), w, 'Créditos de bienvenida'); }
  req.session.regenerate(() => {
    req.session.userId = Number(id);
    market.notify(Number(id), `Bienvenido a ${settings().site_name}. Complete su perfil para conseguir más trabajos.`, '/cuenta');
    req.session.flash = { type: 'ok', text: 'Cuenta creada. ¡Bienvenido!' };
    res.redirect('/panel');
  });
});

r.get('/ingresar', (req, res) => res.render('auth/login', { title: 'Ingresar', next: req.query.next || '' }));
r.post('/ingresar', (req, res) => {
  const key = 'login:' + req.ip;
  const next = /^\/[^/\\]/.test(req.body.next || '') ? req.body.next : '/panel';
  if (limiter.blocked(key, 10)) return res.status(429).render('auth/login', { title: 'Ingresar', next, error: 'Demasiados intentos. Espere 15 minutos.' });
  const u = one('SELECT * FROM users WHERE email=?', clean(req.body.email, 120).toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    limiter.take(key, 1e9, 15 * 60000);
    return res.status(401).render('auth/login', { title: 'Ingresar', next, error: 'Correo o contraseña incorrectos.' });
  }
  if (u.status !== 'active') return res.status(403).render('auth/login', { title: 'Ingresar', next, error: 'Su cuenta está suspendida. Contacte a soporte.' });
  limiter.clear(key);
  run('INSERT INTO logins(user_id, created_at) VALUES (?,?)', u.id, now());
  req.session.regenerate(() => { req.session.userId = u.id; res.redirect(next); });
});
// ---------- Recuperar contraseña y confirmar correo ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
r.get('/recuperar', noStore, (req, res) => res.render('auth/forgot', { title: 'Recuperar contraseña' }));
r.post('/recuperar', noStore, (req, res) => {
  const title = 'Recuperar contraseña', email = clean(req.body.email, 120).toLowerCase();
  if (!limiter.take('forgot:ip:' + req.ip, 8, 60 * 60000)) return res.status(429).render('auth/forgot', { title, error: 'Demasiadas solicitudes. Intente de nuevo en una hora.' });
  if (!EMAIL_RE.test(email)) return res.status(400).render('auth/forgot', { title, error: 'Correo electrónico no válido.' });
  // Siempre la misma respuesta: no revela si el correo tiene cuenta.
  if (limiter.take('forgot:' + email, 3, 60 * 60000)) {
    const u = one('SELECT id, name, email, status FROM users WHERE email=?', email);
    if (u && u.status === 'active') mail.sendReset(u, tokens.create(u.id, 'reset', 3600000));
  }
  res.render('auth/forgot', { title, sent: true });
});
r.get('/restablecer/:token', noStore, (req, res) => {
  if (!tokens.peek('reset', req.params.token)) return res.status(400).render('auth/forgot', { title: 'Recuperar contraseña', error: 'El enlace no es válido o ya venció. Solicite uno nuevo.' });
  res.render('auth/reset', { title: 'Nueva contraseña', token: req.params.token });
});
r.post('/restablecer/:token', noStore, (req, res) => {
  const pw = String(req.body.password || '');
  const err = (m) => res.status(400).render('auth/reset', { title: 'Nueva contraseña', token: req.params.token, error: m });
  if (!tokens.peek('reset', req.params.token)) return res.status(400).render('auth/forgot', { title: 'Recuperar contraseña', error: 'El enlace no es válido o ya venció. Solicite uno nuevo.' });
  if (pw.length < 8) return err('La contraseña debe tener al menos 8 caracteres.');
  if (pw.length > 200) return err('La contraseña es demasiado larga.');
  if (pw !== req.body.password2) return err('Las contraseñas no coinciden.');
  const t = tokens.consume('reset', req.params.token);
  if (!t) return res.status(400).render('auth/forgot', { title: 'Recuperar contraseña', error: 'El enlace no es válido o ya venció. Solicite uno nuevo.' });
  // Llegar con el enlace del correo demuestra que el correo es suyo; se cierran todas sus sesiones abiertas.
  run('UPDATE users SET password_hash=?, email_verified=1 WHERE id=?', bcrypt.hashSync(pw, 10), t.user_id);
  run("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?", t.user_id);
  market.notify(t.user_id, 'Tu contraseña fue cambiada. Si no fuiste tú, contacta a soporte de inmediato.', '/soporte');
  limiter.clear('login:' + req.ip);
  req.flash('ok', 'Contraseña actualizada. Ya puedes ingresar.');
  res.redirect('/ingresar');
});
r.get('/verificar/:token', noStore, (req, res) => {
  const t = tokens.consume('verify', req.params.token);
  if (t) { run('UPDATE users SET email_verified=1 WHERE id=?', t.user_id); req.flash('ok', '¡Correo confirmado!'); }
  else req.flash('error', 'El enlace de confirmación no es válido o ya venció. Puedes pedir uno nuevo desde Mi cuenta.');
  res.redirect(req.user ? (t ? '/panel' : '/cuenta') : '/ingresar');
});

r.post('/salir', (req, res) => req.session.destroy(() => res.redirect('/')));

// ---------- Retorno de pasarelas y webhooks ----------
r.get('/pagos/mp/retorno', async (req, res, next) => {
  try {
    const id = req.query.payment_id || req.query.collection_id;
    const p = id ? await payments.mpVerify(id) : null;
    if (p && p.status === 'paid') return res.redirect(afterPay(p));
    res.render('error', { title: 'Pago en proceso', message: 'Su pago está siendo confirmado por Mercado Pago. Le avisaremos en cuanto se acredite.' });
  } catch (e) { next(e); }
});
r.post('/webhooks/mercadopago', async (req, res) => {
  try {
    const id = req.body?.data?.id || req.query['data.id'] || (req.query.topic === 'payment' ? req.query.id : null);
    if (id && (req.body?.type || req.query.type || req.query.topic) === 'payment') await payments.mpVerify(id);
  } catch (e) { console.error('Webhook MP', e.message); }
  res.sendStatus(200);
});
r.get('/pagos/paypal/retorno', async (req, res, next) => {
  try {
    const p = await payments.ppCapture(String(req.query.token || ''));
    if (p && p.status === 'paid') return res.redirect(afterPay(p));
    res.render('error', { title: 'Pago no completado', message: 'PayPal no confirmó el pago. Intente nuevamente.' });
  } catch (e) { next(e); }
});

function afterPay(p) {
  if (p.purpose === 'order') return `/pedidos/${p.ref_id}?pagado=1`;
  if (p.purpose === 'feature') return `/tareas/${p.ref_id}?destacada=1`;
  if (p.purpose === 'grocery') return `/mercado/pedidos/${p.ref_id}?pagado=1`;
  if (p.purpose === 'credits') return '/creditos?ok=1';
  return '/panel';
}
r.afterPay = afterPay;

// ---------- Boletín ----------
const subsByIp = new Map();
setInterval(() => subsByIp.clear(), 60 * 60000).unref();
r.post('/suscribir', (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const n = (subsByIp.get(req.ip) || 0) + 1; subsByIp.set(req.ip, n);
  if (n > 5) { req.session.flash = { type: 'error', text: 'Demasiados intentos. Intente más tarde.' }; return res.redirect('/#boletin'); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { req.session.flash = { type: 'error', text: 'Escriba un correo válido.' }; return res.redirect('/#boletin'); }
  run('INSERT OR IGNORE INTO subscribers(email, created_at) VALUES (?,?)', email, now());
  req.session.flash = { type: 'ok', text: '¡Gracias! Te avisaremos de nuevas oportunidades.' };
  res.redirect('/#boletin');
});

module.exports = r;

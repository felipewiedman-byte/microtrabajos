// Páginas públicas: inicio, cuentas, catálogo de cada negocio y recepción de pedidos.
const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { one, all, run, now, settings } = require('../lib/db');
const S = require('../lib/shop');
const U = require('../lib/util');
const limiter = require('../lib/limiter');
const tokens = require('../lib/tokens');
const mail = require('../lib/mail');
const trial = require('../lib/trial');
const Pages = require('../lib/pages');
const Texts = require('../lib/texts');

const Plans = require('../lib/plans');
const platpay = require('../lib/platpay');

const r = express.Router();
const ip = (req) => req.ip || 'x';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const DUMMY = bcrypt.hashSync('no-existe', 11);
const BOT = /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slurp|curl|wget/i;
// Un visitante cuenta una vez cada 30 min; se recuerda en memoria (acotada) para no escribir en disco en cada vista.
const seenV = new Map();
setInterval(() => { const cut = Date.now() - 30 * 60000; for (const [k, t] of seenV) if (t < cut) seenV.delete(k); }, 10 * 60000).unref();
function firstVisit(key) { const t = Date.now(), e = seenV.get(key); if (e && t - e < 30 * 60000) return false; if (seenV.size > 50000) seenV.clear(); seenV.set(key, t); return true; }
const PC = require('../lib/pagecache');

// ---------- Inicio y páginas informativas ----------
function showPage(slug, req, res, next) {
  const page = Pages.get(slug);
  if (!page || !page.published) return next();
  const key = 'pg:' + slug, cacheable = !req.user && !res.locals.flash;
  const hit = cacheable && PC.get(key);
  if (hit) return PC.send(req, res, hit);
  res.render('page', { page, title: page.title || '', desc: page.descr || settings().site_tagline }, (err, html) => { if (err) return next(err); cacheable ? PC.send(req, res, PC.set(key, html)) : res.send(html); });
}
r.get('/', (req, res, next) => showPage('home', req, res, next));
r.get('/terminos', (req, res, next) => showPage('terminos', req, res, next));
r.get('/privacidad', (req, res, next) => showPage('privacidad', req, res, next));
r.get('/p/:slug', (req, res, next) => /^[a-z0-9-]{2,40}$/.test(req.params.slug) && !Pages.BUILTIN.has(req.params.slug) ? showPage(req.params.slug, req, res, next) : next());
r.get('/planes', (req, res) => res.render('plans', { title: 'Planes y precios', desc: 'Empieza con una prueba y elige el plan que necesites.' }));
r.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /panel\nSitemap: ${res.locals.baseUrl}/sitemap.xml\n`));
r.get('/sitemap.xml', (req, res) => {
  const b = res.locals.baseUrl;
  const urls = ['/', '/planes', ...Pages.list().filter((p) => p.published && !Pages.BUILTIN.has(p.slug)).map((p) => '/p/' + p.slug), ...all("SELECT s.slug, u.plan, u.plan_until, u.trial_until, u.role AS owner_role FROM shops s JOIN users u ON u.id=s.user_id WHERE s.status='active' AND u.status='active' ORDER BY s.id DESC LIMIT 5000").filter((s) => S.planOf(O.ownerOf(s)) !== 'free').map((s) => '/t/' + s.slug)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${b}${u}</loc></url>`).join('')}</urlset>`);
});

// ---------- Cuentas ----------
const login = (req, userId) => new Promise((ok, no) => req.session.regenerate((e) => { if (e) return no(e); req.session.userId = userId; ok(); }));

r.get('/registro', (req, res) => req.user ? res.redirect('/panel') : res.render('auth/register', { title: 'Crear cuenta', form: {} }));
r.post('/registro', async (req, res, next) => {
  try {
    if (settings().signups_open !== '1') return res.render('auth/register', { title: 'Crear cuenta', form: {}, error: 'Por ahora no estamos aceptando cuentas nuevas.' });
    const f = { name: U.clean(req.body.name, 60), email: U.clean(req.body.email, 120).toLowerCase() }, pass = String(req.body.password || '');
    const bad = (error) => res.status(400).render('auth/register', { title: 'Crear cuenta', form: f, error });
    if (!limiter.take('reg:' + ip(req), Number(process.env.REG_RATE_MAX) || 6, 3600000)) return bad('Demasiados intentos. Prueba de nuevo en una hora.');
    if (f.name.length < 2) return bad('Escribe tu nombre.');
    if (!EMAIL.test(f.email)) return bad('Escribe un correo válido.');
    if (pass.length < 8 || Buffer.byteLength(pass) > 72) return bad('La contraseña debe tener entre 8 y 72 caracteres.');
    if (!req.body.terms) return bad('Debes aceptar los términos de uso.');
    if (one('SELECT 1 x FROM users WHERE email=?', f.email)) return bad('Ese correo ya tiene una cuenta. Prueba a ingresar.');
    // Una sola prueba por persona: correo (normalizado) y máx. 3 por IP al día. Después de la prueba hay que pagar.
    const eligible = !trial.used('email', f.email) && limiter.take('trial:' + ip(req), Number(process.env.TRIAL_IP_MAX) || 3, 24 * 3600000);
    const trialDays = eligible ? (() => { const tp = Plans.get('trial'); return tp && tp.active ? tp.days : 0; })() : 0;
    if (trialDays > 0) trial.mark('email', f.email);
    const id = run("INSERT INTO users(name,email,password_hash,trial_until,created_at) VALUES (?,?,?,?,?)", f.name, f.email, await bcrypt.hash(pass, 11), trialDays > 0 ? now() + trialDays * 86400000 : null, now()).lastInsertRowid;
    await login(req, Number(id));
    res.redirect('/panel/crear');
  } catch (e) { next(e); }
});

r.get('/ingresar', (req, res) => req.user ? res.redirect('/panel') : res.render('auth/login', { title: 'Ingresar', form: {}, next: U.safeNext(req.query.next) }));
r.post('/ingresar', async (req, res, next) => {
  try {
    const email = U.clean(req.body.email, 120).toLowerCase(), key = 'login:' + ip(req) + ':' + email;
    const bad = (error) => res.status(400).render('auth/login', { title: 'Ingresar', form: { email }, error, next: U.safeNext(req.body.next) });
    if (!limiter.take('loginip:' + ip(req), Number(process.env.LOGIN_IP_MAX) || 40, 15 * 60000) || !limiter.take(key, 8, 15 * 60000)) return bad('Demasiados intentos. Espera unos minutos.');
    const u = one('SELECT * FROM users WHERE email=?', email);
    const ok = await bcrypt.compare(String(req.body.password || '').slice(0, 72), u ? u.password_hash : DUMMY);
    if (!u || !ok || u.status !== 'active') return bad('Correo o contraseña incorrectos.');
    limiter.clear(key);
    await login(req, u.id);
    run('UPDATE users SET last_login=? WHERE id=?', now(), u.id);
    res.redirect(U.isStaff(u) && !/^\/admin/.test(String(req.body.next || '')) ? '/admin' : U.safeNext(req.body.next));
  } catch (e) { next(e); }
});
r.post('/salir', (req, res) => req.session.destroy(() => res.redirect('/')));

r.get('/recuperar', (req, res) => res.render('auth/forgot', { title: 'Recuperar contraseña' }));
r.post('/recuperar', async (req, res, next) => {
  try {
    const email = U.clean(req.body.email, 120).toLowerCase();
    if (limiter.take('rec:' + ip(req), 5, 3600000)) {
      const u = EMAIL.test(email) && one("SELECT * FROM users WHERE email=? AND status='active'", email);
      if (u) await mail.send({ to: u.email, subject: Texts.get('reset_mail_subject'), title: Texts.get('reset_mail_title'), lines: Texts.lines('reset_mail_lines'), button: { text: Texts.get('reset_mail_button'), url: `${res.locals.baseUrl}/restablecer/${tokens.create(u.id, 'reset', 3600000)}` } });
    }
    res.render('auth/forgot', { title: 'Recuperar contraseña', sent: true });
  } catch (e) { next(e); }
});
r.get('/restablecer/:token', (req, res) => res.render('auth/reset', { title: 'Nueva contraseña', valid: !!tokens.peek('reset', req.params.token), token: req.params.token }));
r.post('/restablecer/:token', async (req, res, next) => {
  try {
    const pass = String(req.body.password || '');
    if (pass.length < 8 || Buffer.byteLength(pass) > 72) return res.status(400).render('auth/reset', { title: 'Nueva contraseña', valid: true, token: req.params.token, error: 'La contraseña debe tener entre 8 y 72 caracteres.' });
    const t = tokens.consume('reset', req.params.token);
    if (!t) return res.render('auth/reset', { title: 'Nueva contraseña', valid: false, token: '' });
    run('UPDATE users SET password_hash=? WHERE id=?', await bcrypt.hash(pass, 11), t.user_id);
    run("DELETE FROM sessions WHERE json_extract(sess,'$.userId')=?", t.user_id); // cierra las sesiones abiertas
    req.flash('ok', 'Contraseña actualizada. Ya puedes ingresar.');
    res.redirect('/ingresar');
  } catch (e) { next(e); }
});

// ---------- Catálogo público ----------
function loadShop(slug) {
  const shop = one("SELECT s.*, u.plan, u.plan_until, u.trial_until, u.role AS owner_role FROM shops s JOIN users u ON u.id=s.user_id WHERE s.slug=? AND s.status='active' AND u.status='active'", String(slug).toLowerCase());
  return shop && S.planOf(O.ownerOf(shop)) !== 'free' ? shop : null; // sin plan ni prueba vigente: catálogo en pausa
}
const unavailable = (res) => res.status(404).render('error', { title: 'Catálogo no disponible', message: 'Este catálogo no existe o está pausado.' });

const countVisit = (shopId, req) => {
  if (!BOT.test(req.get('user-agent') || '') && firstVisit(`${shopId}:${ip(req)}`)) run('INSERT INTO visits(shop_id, day, n) VALUES (?,?,1) ON CONFLICT(shop_id, day) DO UPDATE SET n=n+1', shopId, S.dayKey());
};
r.get('/t/:slug', (req, res, next) => {
  const pidQ = parseInt(req.query.p, 10) || 0, key = `shop:${String(req.params.slug).toLowerCase()}:${pidQ}`;
  const hit = PC.get(key);
  if (hit) { countVisit(hit.shop, req); return PC.send(req, res, hit); }
  const shop = loadShop(req.params.slug);
  if (!shop) return unavailable(res);
  const { cats, prods } = S.topCategoriesWithProducts(shop.id);
  countVisit(shop.id, req);
  const focus = pidQ && prods.find((p) => p.id === pidQ);
  const url = `${res.locals.baseUrl}/t/${shop.slug}`;
  const img = (focus && focus.image) || shop.cover || shop.logo;
  res.render('shop', {
    title: focus ? `${focus.name} · ${shop.name}` : shop.name, desc: focus ? `${S.money(focus.price_cents, shop.currency)} — ${focus.description || shop.name}`.slice(0, 200) : (shop.tagline || shop.description).slice(0, 200),
    og: { url: focus ? `${url}?p=${focus.id}` : url, image: img ? `${res.locals.baseUrl}/m/${img}` : '', type: focus ? 'product' : 'website' },
    shop, cats, prods, payOn: O.payOn(shop), methods: S.payMethods(shop), state: S.openState(shop), hours: S.parseHours(shop.hours), brand: !S.can({ plan: shop.plan, plan_until: shop.plan_until, role: shop.owner_role }, 'nobrand'), layout: 'shop', focusId: focus ? focus.id : 0,
  }, (err, html) => { if (err) return next(err); PC.send(req, res, PC.set(key, html, shop.id)); });
});

r.get('/t/:slug/qr.svg', async (req, res, next) => {
  try {
    const shop = loadShop(req.params.slug);
    if (!shop) return res.sendStatus(404);
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(await QRCode.toString(`${res.locals.baseUrl}/t/${shop.slug}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 480 }));
  } catch (e) { next(e); }
});

// Archivo de productos para el catálogo de Facebook e Instagram Shops (Meta Commerce Manager, "fuente de datos programada").
r.get('/t/:slug/feed.csv', (req, res) => {
  const shop = loadShop(req.params.slug);
  if (!shop) return res.sendStatus(404);
  const base = res.locals.baseUrl, q = (v) => `"${String(v ?? '').replace(/^[=+@]+/, '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`;
  const rows = all('SELECT * FROM products WHERE shop_id=? AND active=1 AND image IS NOT NULL ORDER BY id', shop.id).map((p) => [
    'vt' + p.id, q(p.name.slice(0, 150)), q((p.description || p.name).slice(0, 5000)), p.stock !== null && p.stock <= 0 ? 'out of stock' : 'in stock', 'new',
    q(`${(p.price_cents / 100).toFixed(2)} ${shop.currency}`), q(`${base}/t/${shop.slug}?p=${p.id}`), q(`${base}/m/${p.image}`), q(shop.name),
  ].join(','));
  res.type('text/csv; charset=utf-8').set('Cache-Control', 'public, max-age=300').send(['id,title,description,availability,condition,price,link,image_link,brand', ...rows].join('\n'));
});

const O = require('../lib/orders');
const { ownerOf, quote } = O;

r.post('/t/:slug/cupon', (req, res, next) => {
  try {
    const shop = loadShop(req.params.slug);
    if (!shop) return res.status(404).json({ error: 'Catálogo no disponible.' });
    if (!limiter.take(`cp:${shop.id}:${ip(req)}`, 30, 3600000)) throw U.fail(429, 'Demasiados intentos.');
    const q = quote(shop, ownerOf(shop), req.body);
    res.json({ ok: true, discount_cents: q.discount, total_cents: q.total });
  } catch (e) { next(e); }
});

r.post('/t/:slug/pedido', (req, res, next) => {
  try {
    const shop = loadShop(req.params.slug);
    if (!shop) return res.status(404).json({ error: 'Catálogo no disponible.' });
    if (!shop.accepting) throw U.fail(400, 'Este negocio no está recibiendo pedidos por ahora.');
    if (!limiter.take(`ord:${shop.id}:${ip(req)}`, Number(process.env.ORDER_RATE_MAX) || 12, 3600000)) throw U.fail(429, 'Hiciste muchos pedidos seguidos. Intenta más tarde.');
    const channel = req.body.channel === 'messenger' && shop.messenger ? 'messenger' : 'whatsapp';
    if (channel === 'whatsapp' && !shop.whatsapp) throw U.fail(400, 'Este negocio aún no configuró su WhatsApp.');
    const order = O.createOrder(shop, req.body, { channel });
    const text = S.orderText(shop, order.o, order.items);
    res.json({
      ok: true, code: order.o.code, text, total_cents: order.o.total_cents, payment_info: order.method ? '' : shop.payment_info, pay_method: order.method,
      url: channel === 'messenger' ? `https://m.me/${shop.messenger}` : S.waLink(shop.whatsapp, text), channel,
    });
  } catch (e) { next(e); }
});

// Pago en línea: se crea el pedido y se envía al cliente a Mercado Pago (cuenta del negocio). El dinero va directo al negocio.
r.post('/t/:slug/pagar', async (req, res, next) => {
  let order = null;
  try {
    const shop = loadShop(req.params.slug);
    if (!shop) return res.status(404).json({ error: 'Catálogo no disponible.' });
    if (!shop.accepting) throw U.fail(400, 'Este negocio no está recibiendo pedidos por ahora.');
    if (!O.payOn(shop)) throw U.fail(400, 'Este negocio no tiene el pago en línea activo.');
    if (!limiter.take(`pay:${shop.id}:${ip(req)}`, Number(process.env.ORDER_RATE_MAX) || 12, 3600000)) throw U.fail(429, 'Hiciste muchos intentos seguidos. Intenta más tarde.');
    order = O.createOrder(shop, req.body, { channel: 'whatsapp', pay: true });
    const url = await O.startPayment(shop, order.id, res.locals.baseUrl);
    res.json({ ok: true, code: order.o.code, url });
  } catch (e) {
    if (order) { const row = one('SELECT * FROM orders WHERE id=?', order.id); O.cancelOrder(row); run("UPDATE orders SET pay_status='failed' WHERE id=?", order.id); }
    if (!e.expose) { console.error('[Vitrina] Pago:', e.message); e = U.fail(502, 'No pudimos iniciar el pago. Intenta de nuevo o pide por WhatsApp.'); }
    next(e);
  }
});

// Regreso desde Mercado Pago: se verifica el pago consultándolo directamente (no se confía en lo que trae la URL).
r.get('/t/:slug/gracias', async (req, res, next) => {
  try {
    const shop = loadShop(req.params.slug);
    if (!shop) return unavailable(res);
    let order = null;
    const m = /^vt-(\d+)-(\d+)$/.exec(String(req.query.external_reference || ''));
    const pid = String(req.query.payment_id || req.query.collection_id || '');
    if (/^\d{3,20}$/.test(pid) && limiter.take(`gr:${ip(req)}`, 30, 600000)) { try { order = await O.syncPayment(shop, pid); } catch (e) { console.error('[Vitrina] Verificación de pago:', e.message); } }
    if (!order && m && Number(m[1]) === shop.id) order = one('SELECT * FROM orders WHERE id=? AND shop_id=?', Number(m[2]), shop.id);
    if (!order) return res.redirect('/t/' + shop.slug);
    const items = JSON.parse(order.items);
    const text = S.orderText(shop, order, items, order.pay_status === 'paid');
    res.render('thanks', { layout: 'shop', noindex: true, title: 'Tu pedido · ' + shop.name, shop, order, wa: shop.whatsapp ? S.waLink(shop.whatsapp, text) : '', brand: false });
  } catch (e) { next(e); }
});

// Aviso automático de Mercado Pago para el cobro de planes: se confirma consultando el pago con tu clave.
r.all('/webhooks/mp-plan', async (req, res) => {
  res.sendStatus(200);
  try {
    const id = String(req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || (req.query.topic === 'payment' && req.query.id) || '');
    if (!/^\d{3,20}$/.test(id) || !limiter.take(`whp:${ip(req)}`, 120, 60000)) return;
    await platpay.verifyMp(id);
  } catch (e) { console.error('[Vitrina] Webhook de plan:', e.message); }
});

// Aviso automático de Mercado Pago: se confirma el pago consultándolo con la clave del negocio.
r.all('/webhooks/mp/:slug', async (req, res) => {
  res.sendStatus(200);
  try {
    const shop = loadShop(req.params.slug);
    const id = String(req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || (req.query.topic === 'payment' && req.query.id) || '');
    if (!shop || !/^\d{3,20}$/.test(id) || !limiter.take(`wh:${ip(req)}`, 120, 60000)) return;
    await O.syncPayment(shop, id);
  } catch (e) { console.error('[Vitrina] Webhook de pago:', e.message); }
});

module.exports = r;

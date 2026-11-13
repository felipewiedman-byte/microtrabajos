// Páginas públicas: inicio, cuentas, catálogo de cada negocio y recepción de pedidos.
const express = require('express');
const Rv = require('../lib/reviews');
const Opt = require('../lib/options');
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
  const st = settings(), base = res.locals.baseUrl;
  const jsonld = slug === 'home' ? { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': base + '/#org', name: st.site_name, url: base + '/', logo: st.logo_light ? `${base}/m/${st.logo_light}` : undefined, email: st.support_email || undefined },
    { '@type': 'WebSite', '@id': base + '/#web', name: st.site_name, url: base + '/', description: st.site_tagline, inLanguage: 'es', publisher: { '@id': base + '/#org' } },
  ] } : null;
  res.render('page', { page, title: page.title || '', desc: page.descr || st.site_tagline, jsonld }, (err, html) => { if (err) return next(err); cacheable ? PC.send(req, res, PC.set(key, html)) : res.send(html); });
}
r.get('/', (req, res, next) => showPage('home', req, res, next));
r.get('/terminos', (req, res, next) => showPage('terminos', req, res, next));
r.get('/privacidad', (req, res, next) => showPage('privacidad', req, res, next));
r.get('/p/:slug', (req, res, next) => /^[a-z0-9-]{2,40}$/.test(req.params.slug) && !Pages.BUILTIN.has(req.params.slug) ? showPage(req.params.slug, req, res, next) : next());
r.get('/planes', (req, res) => res.render('plans', { title: 'Planes y precios', desc: 'Empieza con una prueba y elige el plan que necesites.' }));
r.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(['User-agent: *', 'Allow: /',
  ...['/admin', '/panel', '/ingresar', '/registro', '/recuperar', '/restablecer', '/salir', '/webhooks', '/t/*/gracias', '/t/*/pedido', '/t/*/pagar', '/t/*/cupon'].map((p) => 'Disallow: ' + p),
  '', `Sitemap: ${res.locals.baseUrl}/sitemap.xml`, ''].join('\n')));
// Mapa del sitio para Google Search Console: inicio, planes, páginas publicadas y todos los catálogos activos (con su imagen y última actualización).
r.get('/sitemap.xml', (req, res) => {
  const b = res.locals.baseUrl, x = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const pages = Pages.list().filter((p) => p.published);
  const pageAt = (slug) => { const p = pages.find((q) => q.slug === slug); return p ? p.updated_at : Date.now(); };
  const entries = [
    { loc: '/', lastmod: pageAt('home'), pri: '1.0', freq: 'weekly' },
    { loc: '/planes', pri: '0.8', freq: 'monthly' },
    ...pages.filter((p) => !Pages.BUILTIN.has(p.slug)).map((p) => ({ loc: '/p/' + p.slug, lastmod: p.updated_at, pri: '0.6', freq: 'monthly' })),
    ...['terminos', 'privacidad'].filter((s) => pages.some((p) => p.slug === s)).map((s) => ({ loc: '/' + s, lastmod: pageAt(s), pri: '0.2', freq: 'yearly' })),
    ...all(`SELECT s.slug, s.name, s.logo, s.cover, s.seo_image, s.created_at, u.plan, u.plan_until, u.trial_until, u.role AS owner_role,
      (SELECT MAX(created_at) FROM products p WHERE p.shop_id=s.id AND p.active=1) last_p
      FROM shops s JOIN users u ON u.id=s.user_id WHERE s.status='active' AND u.status='active' ORDER BY s.id DESC LIMIT 45000`)
      .filter((s) => S.planOf(O.ownerOf(s)) !== 'free')
      .map((s) => ({ loc: '/t/' + s.slug, lastmod: Math.max(s.created_at, s.last_p || 0), pri: '0.7', freq: 'daily', img: s.seo_image || s.cover || s.logo, title: s.name })),
  ];
  const body = entries.map((e) => `<url><loc>${x(b + e.loc)}</loc>${e.lastmod ? `<lastmod>${day(e.lastmod)}</lastmod>` : ''}<changefreq>${e.freq}</changefreq><priority>${e.pri}</priority>${e.img ? `<image:image><image:loc>${x(b + '/m/' + e.img)}</image:loc><image:title>${x(e.title)}</image:title></image:image>` : ''}</url>`).join('\n');
  res.type('application/xml').set('Cache-Control', 'public, max-age=900').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`);
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
// ---------- Continuar con Google ----------
const G = require('../lib/google');
r.get('/auth/google', (req, res) => {
  if (req.user) return res.redirect('/panel');
  if (!limiter.take('goog:' + ip(req), 30, 15 * 60000)) return res.status(429).render('error', { title: 'Demasiados intentos', message: 'Espera unos minutos e intenta de nuevo.' });
  const url = G.start(req, res.locals.baseUrl, req.query.r === '1' ? 'register' : 'login');
  if (!url) return res.redirect('/ingresar');
  req.session.save(() => res.redirect(url));
});
r.get('/auth/google/callback', async (req, res, next) => {
  const back = (msg) => { req.flash('error', msg); res.redirect('/ingresar'); };
  try {
    const g = await G.finish(req, res.locals.baseUrl);
    let u = one('SELECT * FROM users WHERE google_sub=?', g.sub) || one('SELECT * FROM users WHERE email=?', g.email);
    if (u) {
      if (u.status !== 'active') return back('Esta cuenta está bloqueada. Escríbenos si crees que es un error.');
      if (!u.google_sub) run('UPDATE users SET google_sub=? WHERE id=?', g.sub, u.id); // Google confirmó que el correo es suyo: se vincula
    } else {
      if (settings().signups_open !== '1') return back('Por ahora no estamos aceptando cuentas nuevas.');
      if (!limiter.take('reg:' + ip(req), Number(process.env.REG_RATE_MAX) || 6, 3600000)) return back('Demasiados registros desde esta conexión. Prueba en una hora.');
      // Mismas reglas que el registro normal: una sola prueba gratis por persona.
      const eligible = !trial.used('email', g.email) && limiter.take('trial:' + ip(req), Number(process.env.TRIAL_IP_MAX) || 3, 24 * 3600000);
      const trialDays = eligible ? (() => { const tp = Plans.get('trial'); return tp && tp.active ? tp.days : 0; })() : 0;
      if (trialDays > 0) trial.mark('email', g.email);
      const pass = await bcrypt.hash(require('crypto').randomBytes(24).toString('hex'), 11); // contraseña aleatoria: puede crear una propia con "Recuperar contraseña"
      const id = Number(run('INSERT INTO users(name,email,password_hash,google_sub,trial_until,created_at) VALUES (?,?,?,?,?,?)', U.clean(g.name, 60) || 'Usuario', g.email, pass, g.sub, trialDays > 0 ? now() + trialDays * 86400000 : null, now()).lastInsertRowid);
      u = one('SELECT * FROM users WHERE id=?', id);
    }
    await login(req, u.id);
    run('UPDATE users SET last_login=? WHERE id=?', now(), u.id);
    res.redirect(U.isStaff(u) ? '/admin' : (one('SELECT 1 x FROM shops WHERE user_id=?', u.id) ? '/panel' : '/panel/crear'));
  } catch (e) { if (e.expose) return back(e.message); console.error('[Vitrina] Google:', e.message); back('No pudimos conectar con Google. Intenta de nuevo.'); }
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
  const { cats, prods: raw } = S.topCategoriesWithProducts(shop.id);
  const prods = raw.map((p) => ({ ...p, opts: Opt.parse(p.options), gal: Opt.gallery(p) }));
  countVisit(shop.id, req);
  const focus = pidQ && prods.find((p) => p.id === pidQ);
  const url = `${res.locals.baseUrl}/t/${shop.slug}`;
  const base = res.locals.baseUrl, abs = (n) => n ? `${base}/m/${n}` : undefined;
  // Imagen al compartir: la del producto enlazado; si no, la que eligió el negocio para redes; si no, portada o logo.
  const img = (focus && (focus.image || focus.gal[0])) || shop.seo_image || shop.cover || shop.logo;
  const shopDesc = (shop.seo_desc || shop.tagline || shop.description || `Catálogo de ${shop.name}. Haz tu pedido por WhatsApp.`).slice(0, 200);
  // Datos estructurados para Google: la tienda y sus productos con precio y disponibilidad.
  const offer = (p) => ({ '@type': 'Offer', price: (p.price_cents / 100).toFixed(S.ZERO.has(shop.currency) ? 0 : 2), priceCurrency: shop.currency, availability: p.stock !== null && p.stock <= 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url: `${url}?p=${p.id}` });
  const product = (p) => ({ '@type': 'Product', name: p.name, description: p.description || undefined, image: abs(p.image || p.gal[0]), url: `${url}?p=${p.id}`, offers: offer(p) });
  const jsonld = focus ? { '@context': 'https://schema.org', ...product(focus), brand: { '@type': 'Brand', name: shop.name } } : {
    '@context': 'https://schema.org', '@type': 'Store', name: shop.name, description: shopDesc, url, image: abs(shop.seo_image || shop.cover || shop.logo), logo: abs(shop.logo),
    telephone: shop.whatsapp ? '+' + shop.whatsapp : undefined, currenciesAccepted: shop.currency,
    address: shop.address || shop.city ? { '@type': 'PostalAddress', streetAddress: shop.address || undefined, addressLocality: shop.city || undefined } : undefined,
    sameAs: shop.instagram ? [`https://instagram.com/${shop.instagram}`] : undefined,
    makesOffer: prods.slice(0, 30).map((p) => ({ ...offer(p), itemOffered: { '@type': 'Product', name: p.name, image: abs(p.image || p.gal[0]) } })),
  };
  const rv = Rv.summary(shop.id), reviews = rv.n ? Rv.latest(shop.id) : [];
  if (rv.n && !focus) jsonld.aggregateRating = { '@type': 'AggregateRating', ratingValue: rv.avg, reviewCount: rv.n, bestRating: 5, worstRating: 1 };
  res.render('shop', {
    title: focus ? `${focus.name} · ${shop.name}` : (shop.seo_title || shop.name), desc: focus ? `${S.money(focus.price_cents, shop.currency)} — ${focus.description || shop.name}`.slice(0, 200) : shopDesc,
    keywords: shop.seo_keywords, jsonld,
    og: { url: focus ? `${url}?p=${focus.id}` : url, image: img ? `${base}/m/${img}` : '', type: focus ? 'product' : 'website' },
    shop, cats, prods, rv, reviews, agendaOn: !!shop.agenda_on, zones: Opt.zones(shop.zones), payOn: O.payOn(shop), methods: S.payMethods(shop), state: S.openState(shop), hours: S.parseHours(shop.hours), brand: !S.can({ plan: shop.plan, plan_until: shop.plan_until, role: shop.owner_role }, 'nobrand'), layout: 'shop', focusId: focus ? focus.id : 0,
  }, (err, html) => { if (err) return next(err); PC.send(req, res, PC.set(key, html, shop.id)); });
});

// ---------- Agenda de citas ----------
const A = require('../lib/agenda');
r.get('/t/:slug/agenda', (req, res) => {
  const shop = loadShop(req.params.slug);
  if (!shop || !shop.agenda_on) return res.status(404).json({ error: 'Este negocio no recibe reservas en línea.' });
  const p = one('SELECT id, duration FROM products WHERE id=? AND shop_id=? AND active=1', parseInt(req.query.p, 10) || 0, shop.id);
  if (!p || !(p.duration > 0)) return res.status(404).json({ error: 'Servicio no disponible.' });
  res.set('Cache-Control', 'no-store');
  if (A.isDay(req.query.d)) return res.json({ slots: A.slots(shop, p.duration, req.query.d) });
  res.json({ days: A.days(shop, p.duration) });
});
r.post('/t/:slug/reservar', (req, res, next) => {
  try {
    const shop = loadShop(req.params.slug);
    if (!shop) return res.status(404).json({ error: 'Catálogo no disponible.' });
    if (!shop.whatsapp) throw U.fail(400, 'Este negocio aún no configuró su WhatsApp.');
    if (!limiter.take(`res:${shop.id}:${ip(req)}`, Number(process.env.ORDER_RATE_MAX) || 12, 3600000)) throw U.fail(429, 'Hiciste muchas reservas seguidas. Intenta más tarde.');
    const a = A.book(shop, req.body || {}), text = A.text(shop, a);
    setImmediate(() => { try { require('../lib/push').notify(shop.id, { title: `Nueva reserva ${a.code} · ${A.label(a.start_min)}`, body: `${a.customer_name} · ${a.service} · ${A.fmtDay(a.day)}`, url: '/panel/agenda', tag: 'reserva-' + a.id }); } catch { /* sin avisos */ } });
    res.json({ ok: true, code: a.code, when: `${A.fmtDay(a.day)}, ${A.label(a.start_min)}`, url: S.waLink(shop.whatsapp, text) });
  } catch (e) { next(e); }
});

// ---------- Reseñas: el cliente califica su pedido con el enlace firmado que recibe al finalizar ----------
function reviewTarget(req) {
  const shop = loadShop(req.params.slug), oid = Rv.orderFromToken(req.params.tok);
  if (!shop || !oid) return {};
  const o = one("SELECT * FROM orders WHERE id=? AND shop_id=? AND status<>'cancelled' AND created_at>?", oid, shop.id, now() - 90 * 86400000);
  return o ? { shop, o, prev: one('SELECT * FROM reviews WHERE order_id=?', o.id) } : { shop };
}
r.get('/t/:slug/opinar/:tok', (req, res) => {
  const { shop, o, prev } = reviewTarget(req);
  if (!shop) return unavailable(res);
  if (!o) return res.status(404).render('error', { title: 'Enlace no válido', message: 'Este enlace para opinar no es válido o ya venció.' });
  res.render('review', { layout: 'shop', noindex: true, title: 'Califica tu pedido · ' + shop.name, shop, o, prev, items: JSON.parse(o.items), done: req.query.ok === '1', brand: false });
});
r.post('/t/:slug/opinar/:tok', (req, res, next) => {
  try {
    const { shop, o } = reviewTarget(req);
    if (!shop || !o) return res.status(404).render('error', { title: 'Enlace no válido', message: 'Este enlace para opinar no es válido o ya venció.' });
    if (!limiter.take('rev:' + ip(req), 20, 3600000)) throw U.fail(429, 'Demasiados intentos. Prueba más tarde.');
    const stars = U.int(req.body.stars, 0);
    if (stars < 1 || stars > 5) throw U.fail(400, 'Elige de 1 a 5 estrellas.');
    Rv.save(shop, o.id, { stars, name: U.clean(req.body.name, 40) || o.customer_name.split(' ')[0], body: U.clean(req.body.body, 500) });
    PC.bust(shop.id);
    res.redirect(303, `/t/${shop.slug}/opinar/${req.params.tok}?ok=1`);
  } catch (e) { next(e); }
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

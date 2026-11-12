// Páginas públicas: inicio, cuentas, catálogo de cada negocio y recepción de pedidos.
const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { one, all, run, now, tx, settings } = require('../lib/db');
const S = require('../lib/shop');
const U = require('../lib/util');
const limiter = require('../lib/limiter');
const tokens = require('../lib/tokens');
const mail = require('../lib/mail');

const r = express.Router();
const ip = (req) => req.ip || 'x';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const DUMMY = bcrypt.hashSync('no-existe', 11);
const BOT = /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slurp|curl|wget/i;

// ---------- Inicio y páginas informativas ----------
r.get('/', (req, res) => res.render('home', { title: '', desc: settings().site_tagline }));
r.get('/planes', (req, res) => res.render('plans', { title: 'Planes y precios', desc: 'Empieza gratis y mejora cuando tu negocio crezca.' }));
r.get('/terminos', (req, res) => res.render('legal', { title: 'Términos de uso', kind: 'terminos' }));
r.get('/privacidad', (req, res) => res.render('legal', { title: 'Política de privacidad', kind: 'privacidad' }));
r.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /panel\nSitemap: ${res.locals.baseUrl}/sitemap.xml\n`));
r.get('/sitemap.xml', (req, res) => {
  const b = res.locals.baseUrl;
  const urls = ['/', '/planes', ...all("SELECT s.slug FROM shops s JOIN users u ON u.id=s.user_id WHERE s.status='active' AND u.status='active' ORDER BY s.id DESC LIMIT 5000").map((s) => '/t/' + s.slug)];
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
    if (!limiter.take('reg:' + ip(req), 6, 3600000)) return bad('Demasiados intentos. Prueba de nuevo en una hora.');
    if (f.name.length < 2) return bad('Escribe tu nombre.');
    if (!EMAIL.test(f.email)) return bad('Escribe un correo válido.');
    if (pass.length < 8 || Buffer.byteLength(pass) > 72) return bad('La contraseña debe tener entre 8 y 72 caracteres.');
    if (!req.body.terms) return bad('Debes aceptar los términos de uso.');
    if (one('SELECT 1 x FROM users WHERE email=?', f.email)) return bad('Ese correo ya tiene una cuenta. Prueba a ingresar.');
    const id = run("INSERT INTO users(name,email,password_hash,created_at) VALUES (?,?,?,?)", f.name, f.email, await bcrypt.hash(pass, 11), now()).lastInsertRowid;
    await login(req, Number(id));
    res.redirect('/panel/crear');
  } catch (e) { next(e); }
});

r.get('/ingresar', (req, res) => req.user ? res.redirect('/panel') : res.render('auth/login', { title: 'Ingresar', form: {}, next: U.safeNext(req.query.next) }));
r.post('/ingresar', async (req, res, next) => {
  try {
    const email = U.clean(req.body.email, 120).toLowerCase(), key = 'login:' + ip(req) + ':' + email;
    const bad = (error) => res.status(400).render('auth/login', { title: 'Ingresar', form: { email }, error, next: U.safeNext(req.body.next) });
    if (!limiter.take(key, 8, 15 * 60000)) return bad('Demasiados intentos. Espera unos minutos.');
    const u = one('SELECT * FROM users WHERE email=?', email);
    const ok = await bcrypt.compare(String(req.body.password || '').slice(0, 72), u ? u.password_hash : DUMMY);
    if (!u || !ok || u.status !== 'active') return bad('Correo o contraseña incorrectos.');
    limiter.clear(key);
    await login(req, u.id);
    res.redirect(U.safeNext(req.body.next));
  } catch (e) { next(e); }
});
r.post('/salir', (req, res) => req.session.destroy(() => res.redirect('/')));

r.get('/recuperar', (req, res) => res.render('auth/forgot', { title: 'Recuperar contraseña' }));
r.post('/recuperar', async (req, res, next) => {
  try {
    const email = U.clean(req.body.email, 120).toLowerCase();
    if (limiter.take('rec:' + ip(req), 5, 3600000)) {
      const u = EMAIL.test(email) && one("SELECT * FROM users WHERE email=? AND status='active'", email);
      if (u) await mail.send({ to: u.email, subject: `Restablece tu contraseña de ${settings().site_name}`, title: 'Restablecer contraseña', lines: ['Recibimos una solicitud para cambiar tu contraseña.', 'El enlace vale 1 hora y solo se puede usar una vez.', 'Si no fuiste tú, ignora este mensaje.'], button: { text: 'Elegir nueva contraseña', url: `${res.locals.baseUrl}/restablecer/${tokens.create(u.id, 'reset', 3600000)}` } });
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
  const shop = one("SELECT s.*, u.plan, u.plan_until, u.role AS owner_role FROM shops s JOIN users u ON u.id=s.user_id WHERE s.slug=? AND s.status='active' AND u.status='active'", String(slug).toLowerCase());
  return shop || null;
}
const unavailable = (res) => res.status(404).render('error', { title: 'Catálogo no disponible', message: 'Este catálogo no existe o está pausado.' });

r.get('/t/:slug', (req, res) => {
  const shop = loadShop(req.params.slug);
  if (!shop) return unavailable(res);
  const { cats, prods } = S.topCategoriesWithProducts(shop.id);
  if (!BOT.test(req.get('user-agent') || '') && limiter.take(`v:${shop.id}:${ip(req)}`, 1, 30 * 60000)) {
    run('INSERT INTO visits(shop_id, day, n) VALUES (?,?,1) ON CONFLICT(shop_id, day) DO UPDATE SET n=n+1', shop.id, S.dayKey());
  }
  const pid = parseInt(req.query.p, 10), focus = pid && prods.find((p) => p.id === pid);
  const url = `${res.locals.baseUrl}/t/${shop.slug}`;
  const img = (focus && focus.image) || shop.cover || shop.logo;
  res.render('shop', {
    title: focus ? `${focus.name} · ${shop.name}` : shop.name, desc: focus ? `${S.money(focus.price_cents, shop.currency)} — ${focus.description || shop.name}`.slice(0, 200) : (shop.tagline || shop.description).slice(0, 200),
    og: { url: focus ? `${url}?p=${focus.id}` : url, image: img ? `${res.locals.baseUrl}/m/${img}` : '', type: focus ? 'product' : 'website' },
    shop, cats, prods, state: S.openState(shop), hours: S.parseHours(shop.hours), brand: !S.can({ plan: shop.plan, plan_until: shop.plan_until, role: shop.owner_role }, 'nobrand'), layout: 'shop', focusId: focus ? focus.id : 0,
  });
});

r.get('/t/:slug/qr.svg', async (req, res, next) => {
  try {
    const shop = loadShop(req.params.slug);
    if (!shop) return res.sendStatus(404);
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(await QRCode.toString(`${res.locals.baseUrl}/t/${shop.slug}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 480 }));
  } catch (e) { next(e); }
});

// Cálculo del pedido en el servidor: nunca se confía en los precios que envía el navegador.
function quote(shop, owner, body) {
  const raw = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  const want = new Map();
  for (const it of raw) {
    const id = parseInt(it && it.id, 10), qty = parseInt(it && it.qty, 10);
    if (id > 0 && qty > 0) want.set(id, Math.min(99, (want.get(id) || 0) + qty));
  }
  if (!want.size) throw U.fail(400, 'Tu pedido está vacío.');
  const items = [];
  let subtotal = 0;
  for (const [id, qty] of want) {
    const p = one('SELECT * FROM products WHERE id=? AND shop_id=? AND active=1', id, shop.id);
    if (!p) throw U.fail(400, 'Un producto ya no está disponible. Actualiza la página.');
    if (p.stock !== null && qty > p.stock) throw U.fail(400, p.stock > 0 ? `De "${p.name}" solo quedan ${p.stock}.` : `"${p.name}" está agotado.`);
    items.push({ id, name: p.name, qty, price_cents: p.price_cents });
    subtotal += p.price_cents * qty;
  }
  let discount = 0, coupon = null;
  const code = U.clean(body.coupon, 30).toUpperCase();
  if (code && S.can(owner, 'coupons')) {
    coupon = one('SELECT * FROM coupons WHERE shop_id=? AND code=? AND active=1', shop.id, code);
    if (!coupon || (coupon.max_uses && coupon.uses >= coupon.max_uses)) throw U.fail(400, 'Ese cupón no es válido.');
    if (subtotal < coupon.min_cents) throw U.fail(400, `El cupón aplica desde ${S.money(coupon.min_cents, shop.currency)}.`);
    discount = coupon.kind === 'pct' ? Math.floor(subtotal * Math.min(coupon.value, 100) / 100) : Math.min(coupon.value, subtotal);
  } else if (code) throw U.fail(400, 'Ese cupón no es válido.');
  const mode = body.mode === 'delivery' && shop.delivery_on ? 'delivery' : 'pickup';
  const delivery = mode === 'delivery' ? shop.delivery_fee_cents : 0;
  if (subtotal - discount < shop.min_order_cents) throw U.fail(400, `El pedido mínimo es ${S.money(shop.min_order_cents, shop.currency)}.`);
  return { items, subtotal, discount, delivery, total: subtotal - discount + delivery, coupon, mode };
}
const ownerOf = (shop) => ({ plan: shop.plan, plan_until: shop.plan_until, role: shop.owner_role });

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
    if (!limiter.take(`ord:${shop.id}:${ip(req)}`, 12, 3600000)) throw U.fail(429, 'Hiciste muchos pedidos seguidos. Intenta más tarde.');
    const name = U.clean(req.body.name, 60), cust = U.phone(req.body.phone), note = U.clean(req.body.note, 300), address = U.clean(req.body.address, 200);
    if (name.length < 2) throw U.fail(400, 'Escribe tu nombre.');
    const channel = req.body.channel === 'messenger' && shop.messenger ? 'messenger' : 'whatsapp';
    if (channel === 'whatsapp' && !shop.whatsapp) throw U.fail(400, 'Este negocio aún no configuró su WhatsApp.');
    const q = quote(shop, ownerOf(shop), req.body);
    if (q.mode === 'delivery' && address.length < 5) throw U.fail(400, 'Escribe la dirección de entrega.');
    const order = tx(() => {
      const q2 = quote(shop, ownerOf(shop), req.body); // se vuelve a calcular dentro de la transacción (stock y cupón al día)
      for (const it of q2.items) run('UPDATE products SET stock = stock - ? WHERE id=? AND stock IS NOT NULL', it.qty, it.id);
      if (q2.coupon) run('UPDATE coupons SET uses = uses + 1 WHERE id=?', q2.coupon.id);
      const n = one('SELECT COUNT(*) c FROM orders WHERE shop_id=?', shop.id).c + 1;
      const o = { code: '#' + n, customer_name: name, customer_phone: cust, mode: q2.mode, address: q2.mode === 'delivery' ? address : '', note, discount_cents: q2.discount, delivery_cents: q2.delivery, total_cents: q2.total, coupon_code: q2.coupon ? q2.coupon.code : '' };
      run('INSERT INTO orders(shop_id,code,customer_name,customer_phone,mode,address,note,items,subtotal_cents,discount_cents,delivery_cents,total_cents,coupon_code,channel,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        shop.id, o.code, o.customer_name, o.customer_phone, o.mode, o.address, o.note, JSON.stringify(q2.items), q2.subtotal, o.discount_cents, o.delivery_cents, o.total_cents, o.coupon_code, channel, now());
      return { o, items: q2.items };
    });
    const text = S.orderText(shop, order.o, order.items);
    res.json({
      ok: true, code: order.o.code, text, total_cents: order.o.total_cents, payment_info: shop.payment_info,
      url: channel === 'messenger' ? `https://m.me/${shop.messenger}` : S.waLink(shop.whatsapp, text), channel,
    });
  } catch (e) { next(e); }
});

module.exports = r;

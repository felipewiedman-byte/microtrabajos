// Panel del dueño del negocio.
const express = require('express');
const bcrypt = require('bcryptjs');
const { one, all, run, now, tx, settings } = require('../lib/db');
const S = require('../lib/shop');
const U = require('../lib/util');
const secrets = require('../lib/secrets');
const mp = require('../lib/mp');
const storage = require('../lib/storage');
const trial = require('../lib/trial');

const r = express.Router();
const own = U.requireOwner;
const L = (res, view, data = {}) => res.render('panel/' + view, { layout: 'panel', noindex: true, ...data });

// ---------- Crear el negocio ----------
r.get('/crear', U.requireAuth, (req, res) => req.shop ? res.redirect('/panel') : res.render('panel/create', { title: 'Crea tu catálogo', form: { currency: 'COP', tz: 'America/Bogota', kind: 'productos' }, noindex: true }));
r.post('/crear', U.requireAuth, (req, res, next) => {
  try {
    if (req.shop) return res.redirect('/panel');
    const b = req.body, f = { name: U.clean(b.name, 60), kind: S.KINDS[b.kind] ? b.kind : 'productos', whatsapp: U.phone(b.whatsapp), city: U.clean(b.city, 60), currency: S.CURRENCIES[b.currency] ? b.currency : 'COP', tz: S.TZ[b.tz] ? b.tz : 'America/Bogota' };
    const bad = (error) => res.status(400).render('panel/create', { title: 'Crea tu catálogo', form: f, error, noindex: true });
    if (f.name.length < 2) return bad('Escribe el nombre de tu negocio.');
    if (!f.whatsapp) return bad('Escribe tu WhatsApp con el código del país, solo números (ej.: 573001234567).');
    const slug = S.uniqueSlug(f.name);
    // Una prueba gratis por número de WhatsApp: evita crear cuentas nuevas para repetirla.
    const repeated = trial.used('wa', f.whatsapp) && !!req.user.trial_until;
    run('INSERT INTO shops(user_id,slug,name,kind,whatsapp,city,currency,tz,created_at) VALUES (?,?,?,?,?,?,?,?,?)', req.user.id, slug, f.name, f.kind, f.whatsapp, f.city, f.currency, f.tz, now());
    if (repeated) run('UPDATE users SET trial_until=NULL WHERE id=?', req.user.id); else if (req.user.trial_until) trial.mark('wa', f.whatsapp);
    req.flash(repeated ? 'error' : 'ok', repeated ? 'Esta prueba gratis ya se usó con ese número de WhatsApp. Elige un plan para activar tu catálogo.' : '¡Listo! Tu catálogo ya existe. Agrega tus primeros productos.');
    res.redirect('/panel/productos/nuevo');
  } catch (e) { next(e); }
});

// ---------- Resumen ----------
r.get('/', own, (req, res) => {
  const id = req.shop.id, today = S.dayKey();
  const startMonth = new Date(); startMonth.setUTCDate(1); startMonth.setUTCHours(0, 0, 0, 0);
  const d14 = S.dayKey(now() - 13 * 86400000);
  const visits = all('SELECT day, n FROM visits WHERE shop_id=? AND day>=? ORDER BY day', id, d14);
  const ordersByDay = all("SELECT date(created_at/1000,'unixepoch') day, COUNT(*) n FROM orders WHERE shop_id=? AND created_at>=? AND status<>'cancelled' GROUP BY day", id, now() - 14 * 86400000);
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = S.dayKey(now() - i * 86400000); days.push({ d, v: (visits.find((x) => x.day === d) || {}).n || 0, o: (ordersByDay.find((x) => x.day === d) || {}).n || 0 }); }
  const st = {
    visitsToday: (visits.find((x) => x.day === today) || {}).n || 0,
    visits7: days.slice(-7).reduce((a, x) => a + x.v, 0),
    newOrders: one("SELECT COUNT(*) c FROM orders WHERE shop_id=? AND status='new'", id).c,
    ordersMonth: one("SELECT COUNT(*) c FROM orders WHERE shop_id=? AND created_at>=? AND status<>'cancelled'", id, startMonth.getTime()).c,
    salesMonth: one("SELECT COALESCE(SUM(total_cents),0) s FROM orders WHERE shop_id=? AND created_at>=? AND status='done'", id, startMonth.getTime()).s,
    products: one('SELECT COUNT(*) c FROM products WHERE shop_id=?', id).c,
  };
  const top = res.locals.can('stats') ? all(`SELECT json_extract(j.value,'$.name') name, SUM(json_extract(j.value,'$.qty')) qty
    FROM orders o, json_each(o.items) j WHERE o.shop_id=? AND o.created_at>=? AND o.status<>'cancelled' GROUP BY name ORDER BY qty DESC LIMIT 5`, id, now() - 30 * 86400000) : [];
  const recent = all('SELECT * FROM orders WHERE shop_id=? ORDER BY id DESC LIMIT 5', id);
  L(res, 'index', { title: 'Resumen', st, days, top, recent, tab: 'resumen' });
});

// ---------- Pedidos ----------
r.get('/pedidos', own, (req, res) => {
  const f = Object.keys(S.STATUS).includes(req.query.estado) ? req.query.estado : '';
  const page = Math.max(1, U.int(req.query.page, 1)), per = 25;
  const where = f ? 'shop_id=? AND status=?' : 'shop_id=?', args = f ? [req.shop.id, f] : [req.shop.id];
  const total = one(`SELECT COUNT(*) c FROM orders WHERE ${where}`, ...args).c;
  const rows = all(`SELECT * FROM orders WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, ...args, per, (page - 1) * per).map((o) => ({ ...o, list: JSON.parse(o.items) }));
  L(res, 'orders', { title: 'Pedidos', rows, f, page, pages: Math.max(1, Math.ceil(total / per)), tab: 'pedidos' });
});
r.post('/pedidos/:id/estado', own, (req, res, next) => {
  try {
    const o = one('SELECT * FROM orders WHERE id=? AND shop_id=?', U.int(req.params.id), req.shop.id);
    const to = req.body.estado;
    if (!o || !S.STATUS[to]) throw U.fail(400, 'Pedido no encontrado.');
    tx(() => {
      // Al cancelar se devuelve el inventario y el uso del cupón; al reabrir se vuelve a descontar.
      if (to === 'cancelled' && o.status !== 'cancelled') {
        for (const it of JSON.parse(o.items)) run('UPDATE products SET stock = stock + ? WHERE id=? AND stock IS NOT NULL', it.qty, it.id);
        if (o.coupon_code) run('UPDATE coupons SET uses = MAX(0, uses - 1) WHERE shop_id=? AND code=?', o.shop_id, o.coupon_code);
      } else if (o.status === 'cancelled' && to !== 'cancelled') {
        for (const it of JSON.parse(o.items)) run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id=? AND stock IS NOT NULL', it.qty, it.id);
        if (o.coupon_code) run('UPDATE coupons SET uses = uses + 1 WHERE shop_id=? AND code=?', o.shop_id, o.coupon_code);
      }
      run('UPDATE orders SET status=? WHERE id=?', to, o.id);
    });
    res.redirect(U.safeNext(req.body.back || '/panel/pedidos'));
  } catch (e) { next(e); }
});

// ---------- Productos y categorías ----------
r.get('/productos', own, (req, res) => {
  const cats = all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) n FROM categories c WHERE shop_id=? ORDER BY sort, id', req.shop.id);
  const q = U.clean(req.query.q, 60);
  const rows = all(`SELECT p.*, c.name AS cat FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.shop_id=? ${q ? "AND p.name LIKE ? ESCAPE '\\'" : ''} ORDER BY p.sort, p.id DESC`, ...(q ? [req.shop.id, '%' + q.replace(/[\\%_]/g, '\\$&') + '%'] : [req.shop.id]));
  L(res, 'products', { title: 'Productos', rows, cats, q, limit: S.productLimit(req.user), count: one('SELECT COUNT(*) c FROM products WHERE shop_id=?', req.shop.id).c, tab: 'productos' });
});
// Espacio del plan: se rechaza la subida si el negocio ya usa (o superaría) su cuota.
function checkQuota(req, incoming) {
  const quota = S.quotaBytes(req.user);
  if (storage.usedBytes(req.shop.id) + incoming > quota) throw U.fail(400, `Llegaste al límite de espacio de tu plan (${Math.round(quota / 1048576)} MB). Elimina imágenes que no uses o mejora tu plan.`);
}
const noun = (shop) => shop.kind === 'servicios' ? ['servicio', 'servicios'] : ['producto', 'productos'];

function productForm(req) {
  const b = req.body, shopId = req.shop.id;
  const cat = U.int(b.category_id, 0);
  const price = U.toCents(b.price), compare = U.toCents(b.compare);
  const stockRaw = String(b.stock ?? '').trim();
  const f = {
    name: U.clean(b.name, 80), description: U.clean(b.description, 500), price_cents: price, compare_cents: compare > price ? compare : 0,
    stock: stockRaw === '' ? null : Math.max(0, Math.min(999999, U.int(stockRaw, 0))),
    category_id: cat && one('SELECT 1 x FROM categories WHERE id=? AND shop_id=?', cat, shopId) ? cat : null,
    active: b.active ? 1 : 0, featured: b.featured ? 1 : 0,
  };
  if (!f.name) throw U.fail(400, 'Escribe el nombre.');
  return f;
}
const formRender = (req, res, p, error) => L(res, 'product-form', { title: p && p.id ? 'Editar' : 'Nuevo', p: p || { active: 1, price_cents: 0, stock: null }, cats: all('SELECT * FROM categories WHERE shop_id=? ORDER BY sort, id', req.shop.id), error, tab: 'productos', noun: noun(req.shop) });
r.get('/productos/nuevo', own, (req, res) => formRender(req, res, null));
r.get('/productos/:id/editar', own, (req, res, next) => {
  const p = one('SELECT * FROM products WHERE id=? AND shop_id=?', U.int(req.params.id), req.shop.id);
  p ? formRender(req, res, p) : next(U.fail(404, 'No encontrado.'));
});
const imgUp = U.upload.fields([{ name: 'image', maxCount: 1 }]);
r.post('/productos/guardar', own, imgUp, U.csrfMultipart, async (req, res, next) => {
  try {
    const id = U.int(req.body.id, 0), old = id ? one('SELECT * FROM products WHERE id=? AND shop_id=?', id, req.shop.id) : null;
    if (id && !old) throw U.fail(404, 'No encontrado.');
    if (!old && one('SELECT COUNT(*) c FROM products WHERE shop_id=?', req.shop.id).c >= S.productLimit(req.user)) throw U.fail(400, `Llegaste al límite de ${S.productLimit(req.user)} ${noun(req.shop)[1]} de tu plan. Mejora tu plan para agregar más.`);
    let f;
    try { f = productForm(req); } catch (e) { U.dropTemp(req); return formRender(req, res.status(400), { ...(old || {}), ...req.body, id, price_cents: U.toCents(req.body.price), stock: req.body.stock === '' ? null : U.int(req.body.stock, 0), image: old && old.image }, e.message); }
    let image = old ? old.image : null;
    const up = req.files && req.files.image && req.files.image[0];
    if (up) { checkQuota(req, up.size); const n = await U.keepImage(up, 1000); if (n) { U.dropImage(image); image = n; } }
    else if (req.body.remove_image && image) { U.dropImage(image); image = null; }
    U.dropTemp(req);
    if (old) run('UPDATE products SET name=?, description=?, price_cents=?, compare_cents=?, stock=?, category_id=?, active=?, featured=?, image=? WHERE id=?', f.name, f.description, f.price_cents, f.compare_cents, f.stock, f.category_id, f.active, f.featured, image, old.id);
    else run('INSERT INTO products(shop_id,category_id,name,description,price_cents,compare_cents,image,stock,active,featured,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', req.shop.id, f.category_id, f.name, f.description, f.price_cents, f.compare_cents, image, f.stock, f.active, f.featured, now());
    req.flash('ok', old ? 'Cambios guardados.' : 'Agregado a tu catálogo.');
    res.redirect(!old && req.body.another ? '/panel/productos/nuevo' : '/panel/productos');
  } catch (e) { U.dropTemp(req); next(e); }
});
r.post('/productos/:id/accion', own, (req, res, next) => {
  try {
    const p = one('SELECT * FROM products WHERE id=? AND shop_id=?', U.int(req.params.id), req.shop.id);
    if (!p) throw U.fail(404, 'No encontrado.');
    const a = req.body.accion;
    if (a === 'toggle') run('UPDATE products SET active=1-active WHERE id=?', p.id);
    else if (a === 'soldout') run('UPDATE products SET stock=0 WHERE id=?', p.id);
    else if (a === 'delete') { run('DELETE FROM products WHERE id=?', p.id); U.dropImage(p.image); req.flash('ok', 'Eliminado.'); }
    res.redirect('/panel/productos');
  } catch (e) { next(e); }
});
r.post('/categorias', own, (req, res, next) => {
  try {
    const a = req.body.accion, name = U.clean(req.body.name, 40);
    if (a === 'add') {
      if (!name) throw U.fail(400, 'Escribe el nombre de la categoría.');
      if (one('SELECT COUNT(*) c FROM categories WHERE shop_id=?', req.shop.id).c >= 30) throw U.fail(400, 'Máximo 30 categorías.');
      run('INSERT INTO categories(shop_id,name,sort) VALUES (?,?,COALESCE((SELECT MAX(sort)+1 FROM categories WHERE shop_id=?),0))', req.shop.id, name, req.shop.id);
    } else if (a === 'delete') run('DELETE FROM categories WHERE id=? AND shop_id=?', U.int(req.body.id), req.shop.id);
    else if (a === 'rename' && name) run('UPDATE categories SET name=? WHERE id=? AND shop_id=?', name, U.int(req.body.id), req.shop.id);
    res.redirect('/panel/productos#categorias');
  } catch (e) { next(e); }
});

// ---------- Cupones ----------
r.get('/cupones', own, (req, res) => L(res, 'coupons', { title: 'Cupones', rows: all('SELECT * FROM coupons WHERE shop_id=? ORDER BY id DESC', req.shop.id), tab: 'cupones' }));
r.post('/cupones', own, (req, res, next) => {
  try {
    if (!res.locals.can('coupons')) throw U.fail(403, 'Los cupones están disponibles desde el plan Básico.');
    const a = req.body.accion;
    if (a === 'add') {
      const code = U.clean(req.body.code, 20).toUpperCase().replace(/[^A-Z0-9_-]/g, ''), kind = req.body.kind === 'fixed' ? 'fixed' : 'pct';
      const value = kind === 'pct' ? Math.max(1, Math.min(100, U.int(req.body.value, 0))) : U.toCents(req.body.value);
      if (code.length < 3) throw U.fail(400, 'El código debe tener al menos 3 letras o números.');
      if (!value) throw U.fail(400, 'Escribe el valor del descuento.');
      if (one('SELECT 1 x FROM coupons WHERE shop_id=? AND code=?', req.shop.id, code)) throw U.fail(400, 'Ya tienes un cupón con ese código.');
      run('INSERT INTO coupons(shop_id,code,kind,value,min_cents,max_uses) VALUES (?,?,?,?,?,?)', req.shop.id, code, kind, value, U.toCents(req.body.min), Math.max(0, U.int(req.body.max_uses, 0)));
      req.flash('ok', `Cupón ${code} creado.`);
    } else if (a === 'toggle') run('UPDATE coupons SET active=1-active WHERE id=? AND shop_id=?', U.int(req.body.id), req.shop.id);
    else if (a === 'delete') run('DELETE FROM coupons WHERE id=? AND shop_id=?', U.int(req.body.id), req.shop.id);
    res.redirect('/panel/cupones');
  } catch (e) { next(e); }
});

// ---------- Mi negocio ----------
r.get('/negocio', own, (req, res) => L(res, 'business', { title: 'Mi negocio', hours: S.parseHours(req.shop.hours), tab: 'negocio' }));
r.post('/negocio', own, U.upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), U.csrfMultipart, async (req, res, next) => {
  try {
    const b = req.body, s = req.shop;
    const name = U.clean(b.name, 60), wa = U.phone(b.whatsapp);
    if (name.length < 2) throw U.fail(400, 'Escribe el nombre de tu negocio.');
    if (!wa) throw U.fail(400, 'El WhatsApp debe tener el código del país y solo números (ej.: 573001234567).');
    const slugWanted = U.clean(b.slug, 40);
    const slug = slugWanted && S.slugify(slugWanted) !== s.slug ? S.uniqueSlug(slugWanted, s.id) : s.slug;
    let logo = s.logo, cover = s.cover;
    const lf = req.files && req.files.logo && req.files.logo[0], cf = req.files && req.files.cover && req.files.cover[0];
    if (lf) { checkQuota(req, lf.size); const n = await U.keepImage(lf, 400); if (n) { U.dropImage(logo); logo = n; } } else if (b.remove_logo && logo) { U.dropImage(logo); logo = null; }
    if (cf) { checkQuota(req, cf.size); const n = await U.keepImage(cf, 1600); if (n) { U.dropImage(cover); cover = n; } } else if (b.remove_cover && cover) { U.dropImage(cover); cover = null; }
    U.dropTemp(req);
    run(`UPDATE shops SET name=?, slug=?, tagline=?, description=?, kind=?, whatsapp=?, messenger=?, instagram=?, address=?, city=?, currency=?, tz=?, color=?, logo=?, cover=?, hours=?,
      pickup_on=?, delivery_on=?, delivery_fee_cents=?, min_order_cents=?, payment_info=?, accepting=? WHERE id=?`,
    name, slug, U.clean(b.tagline, 100), U.clean(b.description, 600), S.KINDS[b.kind] ? b.kind : s.kind, wa, U.handle(b.messenger), U.handle(b.instagram), U.clean(b.address, 150), U.clean(b.city, 60),
    S.CURRENCIES[b.currency] ? b.currency : s.currency, S.TZ[b.tz] ? b.tz : s.tz, /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : s.color, logo, cover, S.hoursFromForm(b),
    b.pickup_on ? 1 : 0, b.delivery_on ? 1 : 0, U.toCents(b.delivery_fee), U.toCents(b.min_order), U.clean(b.payment_info, 400).replace(/\r\n?/g, '\n'), b.accepting ? 1 : 0, s.id);
    req.flash('ok', 'Cambios guardados.');
    res.redirect('/panel/negocio');
  } catch (e) { U.dropTemp(req); next(e); }
});

// ---------- Compartir ----------
r.get('/compartir', own, (req, res) => L(res, 'share', { title: 'Compartir', url: `${res.locals.baseUrl}/t/${req.shop.slug}`, prods: all('SELECT id, name, description, price_cents, image FROM products WHERE shop_id=? AND active=1 ORDER BY featured DESC, sort, id LIMIT 200', req.shop.id), tab: 'compartir' }));

// ---------- Clientes (Pro) ----------
function customers(shopId) {
  return all(`SELECT customer_name name, customer_phone phone, COUNT(*) orders, SUM(CASE WHEN status='done' THEN total_cents ELSE 0 END) spent, MAX(created_at) last
    FROM orders WHERE shop_id=? AND status<>'cancelled' GROUP BY CASE WHEN customer_phone<>'' THEN customer_phone ELSE lower(customer_name) END ORDER BY last DESC LIMIT 500`, shopId);
}
r.get('/clientes', own, (req, res) => L(res, 'clients', { title: 'Clientes', rows: res.locals.can('clients') ? customers(req.shop.id) : [], tab: 'clientes' }));
r.get('/clientes.csv', own, (req, res, next) => {
  if (!res.locals.can('clients')) return next(U.fail(403, 'Disponible en el plan Pro.'));
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="clientes.csv"')
    .send('﻿' + ['Nombre,Teléfono,Pedidos,Total comprado,Último pedido', ...customers(req.shop.id).map((c) => [q(c.name), q(c.phone), c.orders, c.spent / 100, q(new Date(c.last).toISOString().slice(0, 10))].join(','))].join('\n'));
});

// ---------- Cobro en línea (Mercado Pago, cuenta del propio negocio) ----------
r.get('/pagos', own, (req, res) => L(res, 'payments', { title: 'Cobro en línea', tab: 'pagos', connected: !!secrets.get(req.shop.id, 'mp_token'), masked: secrets.mask(req.shop.id, 'mp_token'), hook: `${res.locals.baseUrl}/webhooks/mp/${req.shop.slug}`, https: /^https:/.test(res.locals.baseUrl) }));
r.post('/pagos', own, async (req, res, next) => {
  try {
    if (!res.locals.can('payments')) throw U.fail(403, 'El cobro en línea está disponible desde el plan Básico.');
    const a = req.body.accion, id = req.shop.id;
    if (a === 'connect') {
      const token = U.clean(req.body.token, 300);
      if (!/^[A-Za-z_]{3,10}-[\w-]{20,}$/.test(token)) throw U.fail(400, 'Esa clave no tiene el formato de un Access Token de Mercado Pago.');
      let who;
      try { who = await mp.whoami(token); } catch { throw U.fail(400, 'Mercado Pago no aceptó esa clave. Copia el Access Token completo desde tus credenciales.'); }
      secrets.set(id, 'mp_token', token);
      run('UPDATE shops SET pay_mp=1 WHERE id=?', id);
      req.flash('ok', `Cuenta conectada${who && who.nickname ? ': ' + who.nickname : ''}. Ya puedes cobrar en línea.`);
    } else if (a === 'disconnect') {
      secrets.set(id, 'mp_token', '');
      run('UPDATE shops SET pay_mp=0 WHERE id=?', id);
      req.flash('ok', 'Cuenta desconectada. Los clientes volverán a pedir por WhatsApp.');
    } else if (a === 'toggle' && secrets.get(id, 'mp_token')) {
      run('UPDATE shops SET pay_mp=1-pay_mp WHERE id=?', id);
      req.flash('ok', req.shop.pay_mp ? 'Cobro en línea pausado.' : 'Cobro en línea activado.');
    }
    res.redirect('/panel/pagos');
  } catch (e) { next(e); }
});

// ---------- Plan y cuenta ----------
r.get('/plan', own, (req, res) => L(res, 'plan', { title: 'Mi plan', tab: 'plan', planLink: settings().contact_whatsapp ? `https://wa.me/${settings().contact_whatsapp}?text=${encodeURIComponent(`Hola, quiero mejorar mi plan de ${settings().site_name} (${req.shop.name}).`)}` : '/planes', count: one('SELECT COUNT(*) c FROM products WHERE shop_id=?', req.shop.id).c, limit: S.productLimit(req.user), used: storage.usedBytes(req.shop.id), quota: S.quotaBytes(req.user) }));
r.get('/cuenta', U.requireAuth, (req, res) => res.render('panel/account', { layout: 'panel', noindex: true, title: 'Mi cuenta', tab: 'cuenta' }));
r.post('/cuenta/clave', U.requireAuth, async (req, res, next) => {
  try {
    const np = String(req.body.new || '');
    if (!(await bcrypt.compare(String(req.body.current || '').slice(0, 72), req.user.password_hash))) throw U.fail(400, 'La contraseña actual no es correcta.');
    if (np.length < 8 || Buffer.byteLength(np) > 72) throw U.fail(400, 'La nueva contraseña debe tener entre 8 y 72 caracteres.');
    run('UPDATE users SET password_hash=? WHERE id=?', await bcrypt.hash(np, 11), req.user.id);
    req.flash('ok', 'Contraseña actualizada.');
    res.redirect('/panel/cuenta');
  } catch (e) { next(e); }
});
r.post('/cuenta/eliminar', U.requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') throw U.fail(400, 'La cuenta de administrador no se puede eliminar aquí.');
    if (!(await bcrypt.compare(String(req.body.password || '').slice(0, 72), req.user.password_hash))) throw U.fail(400, 'La contraseña no es correcta.');
    for (const p of all('SELECT image FROM products WHERE shop_id=(SELECT id FROM shops WHERE user_id=?)', req.user.id)) U.dropImage(p.image);
    if (req.shop) { U.dropImage(req.shop.logo); U.dropImage(req.shop.cover); }
    run('DELETE FROM users WHERE id=?', req.user.id); // borra en cascada negocio, productos, pedidos y cupones
    req.session.destroy(() => res.redirect('/'));
  } catch (e) { next(e); }
});

module.exports = r;

// Supermercado a domicilio: catálogo, comparación de la canasta, pedido, compra con recibo y entrega con código.
const express = require('express');
const crypto = require('crypto');
const { one, all, run, now, settings, tx } = require('../lib/db');
const market = require('../lib/market');
const payments = require('../lib/payments');
const g = require('../lib/grocery');
const { upload, fail, requireAuth, csrfMultipart, clean, int } = require('../lib/http');

const r = express.Router();
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO');
r.use((req, res, next) => { res.locals.cop = cop; next(); });
const loadOrder = (req) => {
  const o = one('SELECT o.*, c.name chain_name, c.color chain_color FROM g_orders o JOIN g_chains c ON c.id=o.chain_id WHERE o.id=?', int(req.params.id));
  if (!o) throw fail(404, 'Pedido no encontrado.');
  const role = o.client_id === req.user.id ? 'client' : o.shopper_id === req.user.id ? 'shopper' : req.user.role === 'admin' ? 'admin' : null;
  // Los compradores verificados de la ciudad pueden ver pedidos disponibles (sin dirección exacta).
  if (!role && o.status === 'open' && req.user.verified_id) return { o, role: 'viewer' };
  if (!role) throw fail(403, 'No tiene acceso a este pedido.');
  return { o, role };
};
// Carrito en la URL / formulario: { productId: cantidad }
const parseCart = (body) => {
  const cart = {};
  for (const [k, v] of Object.entries(body || {})) {
    const m = /^q(\d+)$/.exec(k); const q = Math.min(50, Math.max(0, int(v, 0)));
    if (m && q > 0) cart[Number(m[1])] = q;
  }
  return cart;
};

// ---------- Catálogo ----------
r.get('/mercado', (req, res) => {
  const q = clean(req.query.q, 60), cat = clean(req.query.cat, 40);
  const where = ['p.active=1'], params = [];
  if (q) { where.push('p.name LIKE ?'); params.push(`%${q}%`); }
  if (cat) { where.push('p.category=?'); params.push(cat); }
  const products = all(`SELECT p.*, (SELECT MIN(price) FROM g_prices x WHERE x.product_id=p.id) min_price FROM g_products p WHERE ${where.join(' AND ')} ORDER BY p.category, p.name`, ...params);
  res.render('grocery', {
    title: 'Mercado a domicilio', products, q, cat,
    categories: all('SELECT category, COUNT(*) n FROM g_products WHERE active=1 GROUP BY category ORDER BY category'),
    chains: g.chainsIn(req.city),
  });
});

// ---------- Comparar la canasta en cada supermercado ----------
r.post('/mercado/comparar', (req, res) => {
  const cart = parseCart(req.body);
  if (!Object.keys(cart).length) { req.flash('error', 'Agregue al menos un producto a su mercado.'); return res.redirect('/mercado'); }
  if (!req.city) { req.flash('error', 'Elija su ciudad arriba (Tu ciudad) para comparar los supermercados.'); return res.redirect('/mercado'); }
  const ids = Object.keys(cart).map(Number);
  const products = all(`SELECT * FROM g_products WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const results = g.compare(req.city, cart).map((x) => ({ ...x, q: g.quote(x.total) }));
  res.render('grocery-compare', { title: 'Comparar supermercados', cart, products, results });
});

// ---------- Crear pedido ----------
r.post('/mercado/pedido', requireAuth, (req, res, next) => {
  const s = settings(), cart = parseCart(req.body);
  const chain = one('SELECT * FROM g_chains WHERE id=? AND active=1', int(req.body.chain_id));
  if (!chain || !req.city || !g.chainsIn(req.city).some((c) => c.id === chain.id)) return next(fail(400, 'Supermercado no disponible en su ciudad.'));
  const res0 = g.compare(req.city, cart).find((x) => x.chain.id === chain.id);
  if (!res0 || !res0.lines.length) return next(fail(400, 'Ningún producto disponible en ese supermercado.'));
  const back = (m) => { req.flash('error', m); res.redirect('/mercado'); };
  const zone = market.safe(req.user.id, clean(req.body.zone, 80)), address = clean(req.body.address, 200);
  const notes = market.safe(req.user.id, clean(req.body.notes, 500));
  if (zone.length < 3 || address.length < 5) return back('Indique barrio y dirección de entrega.');
  if (res0.total < s.grocery_min_cop) return back(`El mercado mínimo es ${cop(s.grocery_min_cop)}.`);
  if (res0.total > s.grocery_max_cop) return back(`El mercado máximo por pedido es ${cop(s.grocery_max_cop)}.`);
  const qt = g.quote(res0.total);
  const names = Object.fromEntries(all('SELECT id, name FROM g_products').map((p) => [p.id, p.name]));
  const items = res0.lines.map((l) => ({ id: l.id, name: names[l.id], qty: l.qty, price: l.price }));
  const id = Number(run(`INSERT INTO g_orders(client_id,chain_id,city,zone,address,scheduled_at,notes,substitutions,items,estimate,reserve,service,fee,total,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, req.user.id, chain.id, req.city, zone, address, clean(req.body.scheduled_at, 16), notes,
  req.body.substitutions ? 1 : 0, JSON.stringify(items), qt.estimate, qt.reserve, qt.service, qt.fee, qt.total, now()).lastInsertRowid);
  const payId = payments.createPayment(req.user.id, 'grocery', id, `Mercado #${id} en ${chain.name} (${cop(qt.total)} COP)`, g.copToUsdCents(qt.total));
  res.redirect('/pagar/' + payId);
});

// ---------- Mis mercados (cliente) y pedidos disponibles (compradores) ----------
r.get('/mercado/pedidos', requireAuth, (req, res) => {
  const mine = all('SELECT o.*, c.name chain_name FROM g_orders o JOIN g_chains c ON c.id=o.chain_id WHERE o.client_id=? ORDER BY o.created_at DESC LIMIT 50', req.user.id);
  const jobs = all('SELECT o.*, c.name chain_name FROM g_orders o JOIN g_chains c ON c.id=o.chain_id WHERE o.shopper_id=? ORDER BY o.created_at DESC LIMIT 50', req.user.id);
  const city = req.city || req.user.city;
  const open = city ? all("SELECT o.*, c.name chain_name FROM g_orders o JOIN g_chains c ON c.id=o.chain_id WHERE o.status='open' AND o.city=? AND o.client_id!=? ORDER BY o.paid_at LIMIT 50", city, req.user.id) : [];
  res.render('grocery-orders', { title: 'Mercados', mine, jobs, open, city });
});

r.get('/mercado/pedidos/:id(\\d+)', requireAuth, (req, res) => {
  const { o, role } = loadOrder(req);
  res.render('grocery-order', { title: `Mercado #${o.id}`, o, role, items: JSON.parse(o.items) });
});

// Aceptar un pedido (comprador verificado de la misma ciudad). Atómico: solo uno lo obtiene.
r.post('/mercado/pedidos/:id(\\d+)/aceptar', requireAuth, (req, res, next) => {
  if (!req.user.verified_id) { req.flash('error', 'Para hacer mercados debe verificar su identidad (Mi cuenta → Verificación).'); return res.redirect('/mercado/pedidos'); }
  const o = one('SELECT * FROM g_orders WHERE id=?', int(req.params.id));
  if (!o || o.client_id === req.user.id) return next(fail(400, 'Pedido no disponible.'));
  const active = one("SELECT COUNT(*) c FROM g_orders WHERE shopper_id=? AND status IN ('assigned','purchased')", req.user.id).c;
  if (active >= 2) { req.flash('error', 'Termine sus mercados en curso antes de aceptar otro.'); return res.redirect('/mercado/pedidos'); }
  const ok = run("UPDATE g_orders SET shopper_id=?, status='assigned', accepted_at=? WHERE id=? AND status='open' AND shopper_id IS NULL", req.user.id, now(), o.id).changes;
  if (!ok) { req.flash('error', 'Otra persona ya tomó este pedido.'); return res.redirect('/mercado/pedidos'); }
  market.notify(o.client_id, `Un comprador aceptó tu mercado #${o.id}.`, `/mercado/pedidos/${o.id}`);
  req.flash('ok', 'Pedido aceptado. Haga la compra y suba la foto del recibo.');
  res.redirect(`/mercado/pedidos/${o.id}`);
});

// Registrar la compra: precios reales por producto + foto del recibo (actualiza los precios del catálogo).
r.post('/mercado/pedidos/:id(\\d+)/compra', requireAuth, upload.single('receipt'), csrfMultipart, (req, res, next) => {
  const { o, role } = loadOrder(req);
  if (role !== 'shopper' || o.status !== 'assigned') return next(fail(400, 'No es posible registrar la compra ahora.'));
  if (!req.file || !/\.(jpe?g|png|webp|pdf)$/i.test(req.file.originalname)) { req.flash('error', 'Suba la foto del recibo (JPG, PNG o PDF).'); return res.redirect(`/mercado/pedidos/${o.id}`); }
  const items = JSON.parse(o.items);
  let total = 0;
  for (const it of items) {
    it.found = !!req.body['found' + it.id];
    it.real = it.found ? Math.max(0, Math.min(it.price * 3, int(String(req.body['p' + it.id] || '').replace(/\D/g, ''), it.price))) : 0;
    total += it.real * it.qty;
  }
  if (total <= 0) { req.flash('error', 'Indique al menos un producto comprado.'); return res.redirect(`/mercado/pedidos/${o.id}`); }
  if (total > o.reserve) { req.flash('error', `El total (${cop(total)}) supera lo reservado por el cliente (${cop(o.reserve)}). Quite productos o elija equivalentes más económicos.`); return res.redirect(`/mercado/pedidos/${o.id}`); }
  tx(() => {
    run("UPDATE g_orders SET status='purchased', items=?, receipt_total=?, receipt_file=?, refund=?, purchased_at=? WHERE id=?",
      JSON.stringify(items), total, req.file.filename, o.reserve - total, now(), o.id);
    for (const it of items) if (it.found && it.real > 0) run(`INSERT INTO g_prices(product_id,chain_id,price,source,updated_at) VALUES (?,?,?,'recibo',?)
      ON CONFLICT(product_id,chain_id) DO UPDATE SET price=excluded.price, source='recibo', updated_at=excluded.updated_at`, it.id, o.chain_id, it.real, now());
  });
  market.notify(o.client_id, `Tu mercado #${o.id} fue comprado (${cop(total)}). Va en camino.`, `/mercado/pedidos/${o.id}`);
  res.redirect(`/mercado/pedidos/${o.id}`);
});

// Entregar con el código de cierre del cliente → se paga al comprador y se registra el reembolso del sobrante.
r.post('/mercado/pedidos/:id(\\d+)/entregar', requireAuth, (req, res, next) => {
  const { o, role } = loadOrder(req);
  if (role !== 'shopper' || o.status !== 'purchased') return next(fail(400, 'No es posible entregar este pedido ahora.'));
  const k = `gcode:${o.id}`, tries = (req.session[k] || 0) + 1; req.session[k] = tries;
  if (tries > 5) { req.flash('error', 'Demasiados intentos. Contacte a soporte.'); return res.redirect(`/mercado/pedidos/${o.id}`); }
  if (String(req.body.code || '').trim() !== String(o.done_code)) { req.flash('error', 'Código incorrecto. Pídale al cliente su código de cierre.'); return res.redirect(`/mercado/pedidos/${o.id}`); }
  delete req.session[k];
  const s = settings(), rate = Number(s.usd_to_local) || 1, toUsd = (c) => Math.round(c / rate * 100);
  const commission = Math.round(o.service * s.commission_pct / 100);
  tx(() => {
    const done = run("UPDATE g_orders SET status='completed', completed_at=? WHERE id=? AND status='purchased'", now(), o.id).changes;
    if (!done) return;
    // Reintegro de la compra: disponible de inmediato. Servicio: con el periodo normal de retención.
    run('INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,?,?,?,?,?)', o.shopper_id, 'earning', toUsd(o.receipt_total), now(), `Reintegro compra mercado #${o.id} (${cop(o.receipt_total)} COP)`, now());
    run('INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,?,?,?,?,?)', o.shopper_id, 'earning', toUsd(o.service - commission), now() + s.clearance_days * market.DAY, `Servicio mercado #${o.id} (${cop(o.service - commission)} COP)`, now());
    if (o.refund > 0) run("UPDATE payments SET status='refund_pending', meta=? WHERE purpose='grocery' AND ref_id=? AND status='paid'", JSON.stringify({ partial_refund_cop: o.refund }), o.id);
  });
  market.notify(o.client_id, `Mercado #${o.id} entregado.${o.refund > 0 ? ` Te devolveremos ${cop(o.refund)} que sobraron de la reserva.` : ''}`, `/mercado/pedidos/${o.id}`);
  req.flash('ok', 'Entrega confirmada. Tu pago quedó en la billetera.');
  res.redirect(`/mercado/pedidos/${o.id}`);
});

// Cancelar: el cliente, antes de que alguien acepte. Reembolso total.
r.post('/mercado/pedidos/:id(\\d+)/cancelar', requireAuth, (req, res, next) => {
  const { o, role } = loadOrder(req);
  if (role !== 'client' || !['pending_payment', 'open'].includes(o.status)) return next(fail(400, 'Ya no se puede cancelar: un comprador aceptó el pedido. Use soporte.'));
  run("UPDATE g_orders SET status='cancelled' WHERE id=?", o.id);
  if (o.status === 'open') run("UPDATE payments SET status='refund_pending' WHERE purpose='grocery' AND ref_id=? AND status='paid'", o.id);
  req.flash('ok', o.status === 'open' ? 'Pedido cancelado. Te devolveremos el pago completo.' : 'Pedido cancelado.');
  res.redirect(`/mercado/pedidos/${o.id}`);
});

// Recibo: solo el cliente, el comprador o un administrador.
r.get('/mercado/recibo/:id(\\d+)', requireAuth, (req, res, next) => {
  const { o, role } = loadOrder(req);
  if (!o.receipt_file || !['client', 'shopper', 'admin'].includes(role)) return next(fail(404, 'Recibo no disponible.'));
  res.download(require('path').join(require('../lib/db').DATA_DIR, 'uploads', require('path').basename(o.receipt_file)), `recibo-mercado-${o.id}${require('path').extname(o.receipt_file)}`);
});

// Se llama al confirmarse el pago.
function onPaid(orderId) {
  const o = one('SELECT * FROM g_orders WHERE id=?', orderId);
  if (!o || o.status !== 'pending_payment') return;
  run("UPDATE g_orders SET status='open', paid_at=?, done_code=? WHERE id=?", now(), String(crypto.randomInt(1000, 10000)), o.id);
  market.notify(o.client_id, `Pago confirmado. Buscando comprador para tu mercado #${o.id}.`, `/mercado/pedidos/${o.id}`);
}
r.onPaid = onPaid;
module.exports = r;

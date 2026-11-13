// Pedidos: cálculo en el servidor, creación, cancelación y cobro en línea (Mercado Pago, cuenta del propio negocio).
const { one, all, run, now, tx, settings } = require('./db');
const S = require('./shop');
const U = require('./util');
const secrets = require('./secrets');
const mp = require('./mp');
const PC = require('./pagecache');
const Opt = require('./options');

const ownerOf = (shop) => ({ plan: shop.plan, plan_until: shop.plan_until, trial_until: shop.trial_until, role: shop.owner_role });
const payOn = (shop) => settings().mp_enabled === '1' && !!shop.pay_mp && S.can(ownerOf(shop), 'payments') && !!secrets.get(shop.id, 'mp_token');

// Cálculo del pedido en el servidor: nunca se confía en los precios que envía el navegador.
function quote(shop, owner, body) {
  const raw = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  // Cada línea es producto + opciones elegidas; la misma combinación se suma en una sola línea.
  const lines = new Map(), perProduct = new Map(), prodCache = new Map();
  for (const it of raw) {
    const id = parseInt(it && it.id, 10), qty = parseInt(it && it.qty, 10);
    if (!(id > 0 && qty > 0)) continue;
    let p = prodCache.get(id);
    if (p === undefined) { p = one('SELECT * FROM products WHERE id=? AND shop_id=? AND active=1', id, shop.id) || null; prodCache.set(id, p); }
    if (!p) throw U.fail(400, 'Un producto ya no está disponible. Actualiza la página.');
    const r = Opt.resolve(Opt.parse(p.options), it.opts);
    const k = id + '#' + r.key, prev = lines.get(k);
    lines.set(k, { p, r, qty: Math.min(99, (prev ? prev.qty : 0) + qty) });
    perProduct.set(id, (perProduct.get(id) || 0) + qty);
  }
  if (!lines.size) throw U.fail(400, 'Tu pedido está vacío.');
  for (const [id, qty] of perProduct) {
    const p = prodCache.get(id);
    if (p.stock !== null && qty > p.stock) throw U.fail(400, p.stock > 0 ? `De "${p.name}" solo quedan ${p.stock}.` : `"${p.name}" está agotado.`);
  }
  const items = [];
  let subtotal = 0;
  for (const { p, r, qty } of lines.values()) {
    const unit = p.price_cents + r.extra;
    items.push({ id: p.id, name: p.name, qty, price_cents: unit, ...(r.label ? { opt: r.label } : {}) });
    subtotal += unit * qty;
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
  let delivery = mode === 'delivery' ? shop.delivery_fee_cents : 0, zone = null;
  const zl = Opt.zones(shop.zones);
  if (mode === 'delivery' && zl.length) {
    zone = zl[parseInt(body.zone, 10)];
    if (!zone) throw U.fail(400, 'Elige tu zona o barrio de entrega.');
    delivery = zone.p;
  }
  if (subtotal - discount < shop.min_order_cents) throw U.fail(400, `El pedido mínimo es ${S.money(shop.min_order_cents, shop.currency)}.`);
  return { items, subtotal, discount, delivery, total: subtotal - discount + delivery, coupon, mode, zone };
}

// Valida los datos del cliente y crea el pedido (descuenta inventario y cupón en una sola transacción).
function createOrder(shop, body, { channel = 'whatsapp', pay = false } = {}) {
  const owner = ownerOf(shop);
  const name = U.clean(body.name, 60), cust = U.phone(body.phone), note = U.clean(body.note, 300), address = U.clean(body.address, 200);
  if (name.length < 2) throw U.fail(400, 'Escribe tu nombre.');
  const q = quote(shop, owner, body);
  if (q.mode === 'delivery' && address.length < 5) throw U.fail(400, 'Escribe la dirección de entrega.');
  const res_ = tx(() => {
    const methods = S.payMethods(shop), pm = methods[parseInt(body.pay, 10)] || null;
    const q2 = quote(shop, owner, body); // se recalcula dentro de la transacción (stock y cupón al día)
    for (const it of q2.items) run('UPDATE products SET stock = stock - ? WHERE id=? AND stock IS NOT NULL', it.qty, it.id);
    if (q2.coupon) run('UPDATE coupons SET uses = uses + 1 WHERE id=?', q2.coupon.id);
    const n = one('SELECT COUNT(*) c FROM orders WHERE shop_id=?', shop.id).c + 1;
    const o = { code: '#' + n, customer_name: name, customer_phone: cust, mode: q2.mode, address: q2.mode === 'delivery' ? (q2.zone ? `${q2.zone.n} — ${address}` : address).slice(0, 260) : '', note, discount_cents: q2.discount, delivery_cents: q2.delivery, total_cents: q2.total, coupon_code: q2.coupon ? q2.coupon.code : '', pay_choice: pay ? '' : (pm ? pm.label : '') };
    const id = Number(run('INSERT INTO orders(shop_id,code,customer_name,customer_phone,mode,address,note,items,subtotal_cents,discount_cents,delivery_cents,total_cents,coupon_code,channel,pay_status,pay_choice,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      shop.id, o.code, o.customer_name, o.customer_phone, o.mode, o.address, o.note, JSON.stringify(q2.items), q2.subtotal, o.discount_cents, o.delivery_cents, o.total_cents, o.coupon_code, channel, pay ? 'pending' : 'none', o.pay_choice, now()).lastInsertRowid);
    return { id, o, items: q2.items, method: o.pay_choice ? pm : null };
  });
  PC.softBust(shop.id); // el stock cambió: el catálogo se renueva en máx. 2 s (muchos pedidos seguidos = una sola renovación)
  return res_;
}

// Anula un pedido y devuelve inventario y cupón (una sola vez).
function cancelOrder(order) {
  if (order.status === 'cancelled') return;
  tx(() => {
    for (const it of JSON.parse(order.items)) run('UPDATE products SET stock = stock + ? WHERE id=? AND stock IS NOT NULL', it.qty, it.id);
    if (order.coupon_code) run('UPDATE coupons SET uses = MAX(0, uses - 1) WHERE shop_id=? AND code=?', order.shop_id, order.coupon_code);
    run("UPDATE orders SET status='cancelled' WHERE id=?", order.id);
  });
  PC.bust(order.shop_id);
}
function reopenOrder(order) {
  if (order.status !== 'cancelled') return;
  tx(() => {
    for (const it of JSON.parse(order.items)) run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id=? AND stock IS NOT NULL', it.qty, it.id);
    if (order.coupon_code) run('UPDATE coupons SET uses = uses + 1 WHERE shop_id=? AND code=?', order.shop_id, order.coupon_code);
    run("UPDATE orders SET status='new' WHERE id=?", order.id);
  });
  PC.bust(order.shop_id);
}

// ---------- Cobro en línea ----------
const ref = (shop, order) => `vt-${shop.id}-${order.id}`;
async function startPayment(shop, orderId, baseUrl) {
  const order = one('SELECT * FROM orders WHERE id=? AND shop_id=?', orderId, shop.id);
  const token = secrets.get(shop.id, 'mp_token');
  const https = /^https:/.test(baseUrl), page = `${baseUrl}/t/${shop.slug}/gracias`;
  const pref = await mp.createPreference(token, {
    items: [{ title: `Pedido ${order.code} · ${shop.name}`.slice(0, 250), quantity: 1, unit_price: order.total_cents / 100, currency_id: shop.currency }],
    external_reference: ref(shop, order), statement_descriptor: shop.name.replace(/[^\w ]/g, '').slice(0, 22) || undefined,
    back_urls: { success: page, pending: page, failure: page },
    ...(https ? { auto_return: 'approved', notification_url: `${baseUrl}/webhooks/mp/${shop.slug}` } : {}),
  });
  if (!pref.init_point) throw new Error('Mercado Pago no devolvió el enlace de pago');
  return pref.init_point;
}

// Consulta el pago directamente a Mercado Pago con la clave del negocio (así nadie puede falsificar un aviso) y actualiza el pedido.
async function syncPayment(shop, paymentId) { return applyPayment(shop, await mp.getPayment(secrets.get(shop.id, 'mp_token'), paymentId)); }
function applyPayment(shop, p) {
  const m = /^vt-(\d+)-(\d+)$/.exec(String(p.external_reference || ''));
  if (!m || Number(m[1]) !== shop.id) return null;
  const order = one('SELECT * FROM orders WHERE id=? AND shop_id=?', Number(m[2]), shop.id);
  if (!order) return null;
  if (Math.round(Number(p.transaction_amount) * 100) !== order.total_cents || String(p.currency_id).toUpperCase() !== shop.currency) return null; // monto o moneda distintos
  if (p.status === 'approved') {
    if (order.pay_status !== 'paid') {
      run("UPDATE orders SET pay_status='paid', pay_method=?, pay_ref=?, paid_at=? WHERE id=?", String(p.payment_type_id || 'mercadopago').slice(0, 30), String(p.id), now(), order.id);
      if (order.status === 'cancelled') reopenOrder(order); // pagó después de que el pedido venció
    }
  } else if (['refunded', 'charged_back'].includes(p.status)) run("UPDATE orders SET pay_status='refunded' WHERE id=? AND pay_status='paid'", order.id);
  else if (['rejected', 'cancelled'].includes(p.status)) run("UPDATE orders SET pay_status='failed' WHERE id=? AND pay_status='pending'", order.id);
  return one('SELECT * FROM orders WHERE id=?', order.id);
}

// Pedidos con pago iniciado que nunca se completó: se anulan y vuelve el inventario.
function expirePending() {
  const cutoff = now() - (Number(process.env.PAY_EXPIRE_MS) || 24 * 3600 * 1000);
  for (const o of all("SELECT * FROM orders WHERE pay_status='pending' AND status<>'cancelled' AND created_at<?", cutoff)) { cancelOrder(o); run("UPDATE orders SET pay_status='failed' WHERE id=?", o.id); }
}

// Busca en Mercado Pago los pagos de un pedido con pago pendiente (por si el aviso o el regreso del cliente no llegaron).
async function reconcileOrder(shop, order) {
  const r = await mp.searchPayments(secrets.get(shop.id, 'mp_token'), ref(shop, order));
  for (const p of (r.results || [])) applyPayment(shop, p);
}
module.exports = { applyPayment, reconcileOrder, ownerOf, payOn, quote, createOrder, cancelOrder, reopenOrder, startPayment, syncPayment, expirePending, ref };

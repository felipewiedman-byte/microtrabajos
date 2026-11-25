// Seña (anticipo) para confirmar citas. Se cobra con la cuenta del propio negocio: Mercado Pago o PayPal.
// Mientras el cliente paga, el horario queda retenido unos minutos; si no paga, se libera solo.
const { one, all, run, now, settings } = require('./db');
const S = require('./shop');
const secrets = require('./secrets');
const mp = require('./mp');
const pp = require('./pp');
const O = require('./orders');
const I = require('./i18n');

const HOLD = () => Number(process.env.DEP_HOLD_MS) || 15 * 60 * 1000;
// Monedas que acepta PayPal (las de Latinoamérica como COP, ARS, CLP o PEN no están; con ellas solo se ofrece Mercado Pago).
const PP_CURRENCIES = new Set(['AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS', 'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'SGD', 'SEK', 'CHF', 'THB', 'USD']);
const PP_ZERO = new Set(['JPY', 'HUF', 'TWD']);
const ref = (shop, a) => `vt-a-${shop.id}-${a.id}`;
const ppMode = (shopId) => (secrets.get(shopId, 'pp_mode') === 'live' ? 'live' : 'sandbox');

// Qué medios de cobro tiene disponibles el negocio para la seña.
function providers(shop) {
  const can = S.can(O.ownerOf(shop), 'payments');
  return {
    mp: can && settings().mp_enabled === '1' && !!shop.pay_mp && !!secrets.get(shop.id, 'mp_token'),
    pp: can && !!shop.pay_pp && !!secrets.get(shop.id, 'pp_id') && !!secrets.get(shop.id, 'pp_secret') && PP_CURRENCIES.has(shop.currency),
  };
}
// Monto de la seña (centavos) para un servicio de ese precio. 0 = no se pide.
function amountFor(shop, priceCents) {
  const v = Number(shop.dep_value) || 0;
  if (shop.dep_mode === 'off' || v <= 0) return 0;
  let c = shop.dep_mode === 'percent' ? Math.round((priceCents || 0) * Math.min(100, v) / 100) : v;
  if (priceCents > 0) c = Math.min(c, priceCents);
  return c > 0 ? c : 0;
}
// ¿Esta reserva exige seña? → { cents, providers } (sin medios conectados, no se exige nada).
function required(shop, priceCents) {
  const pv = providers(shop), list = Object.keys(pv).filter((k) => pv[k]), cents = amountFor(shop, priceCents);
  return cents > 0 && list.length ? { cents, providers: list } : { cents: 0, providers: [] };
}
const hold = () => now() + HOLD();

// Crea el cobro en el medio elegido y devuelve el enlace de pago.
async function start(shop, a, provider, baseUrl) {
  const t = I.tr(shop.lang), page = `${baseUrl}/t/${shop.slug}/cita/${a.token}`, title = `${t('Seña')} · ${a.service} · ${shop.name}`;
  if (provider === 'mp') {
    const https = /^https:/.test(baseUrl);
    const pref = await mp.createPreference(secrets.get(shop.id, 'mp_token'), {
      items: [{ title: title.slice(0, 250), quantity: 1, unit_price: a.dep_cents / 100, currency_id: shop.currency }],
      external_reference: ref(shop, a), statement_descriptor: shop.name.replace(/[^\w ]/g, '').slice(0, 22) || undefined,
      back_urls: { success: page, pending: page, failure: page },
      ...(https ? { auto_return: 'approved', notification_url: `${baseUrl}/webhooks/mp/${shop.slug}` } : {}),
    });
    if (!pref.init_point) throw new Error('Mercado Pago no devolvió el enlace de pago');
    return pref.init_point;
  }
  const mode = ppMode(shop.id), tok = await pp.token(secrets.get(shop.id, 'pp_id'), secrets.get(shop.id, 'pp_secret'), mode);
  const value = PP_ZERO.has(shop.currency) ? String(Math.round(a.dep_cents / 100)) : (a.dep_cents / 100).toFixed(2);
  const o = await pp.createOrder(mode, tok, {
    intent: 'CAPTURE', purchase_units: [{ reference_id: String(a.id), custom_id: ref(shop, a), description: title.slice(0, 120), amount: { currency_code: shop.currency, value } }],
    application_context: { return_url: page, cancel_url: page, brand_name: shop.name.slice(0, 120), user_action: 'PAY_NOW' },
  });
  run('UPDATE appointments SET dep_ref=? WHERE id=?', o.id, a.id);
  const link = (o.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
  if (!link) throw new Error('PayPal no devolvió el enlace de aprobación');
  return link.href;
}

// Marca la seña como pagada una sola vez y confirma la cita. Si el pago llegó tarde (la retención venció) solo se reabre si el horario sigue libre.
function markPaid(shop, a, payRef) {
  const cur = one('SELECT * FROM appointments WHERE id=?', a.id);
  if (!cur || cur.dep_status === 'paid') return cur;
  let status = cur.status;
  if (cur.status === 'awaiting_payment') status = 'confirmed';
  else if (cur.status === 'expired') {
    const A = require('./agenda');
    const free = A.slots(shop, cur.end_min - cur.start_min, cur.day).some((s) => s.m === cur.start_min);
    status = free ? 'confirmed' : 'expired';
  }
  run("UPDATE appointments SET dep_status='paid', dep_ref=?, dep_paid_at=?, status=? WHERE id=?", String(payRef || cur.dep_ref), now(), status, cur.id);
  setImmediate(() => { try { require('./push').notify(shop.id, { title: `${I.tr('es')('Seña pagada')} · ${cur.code} · ${S.money(cur.dep_cents, shop.currency)}`, body: `${cur.customer_name} · ${cur.service}`, url: '/panel/agenda', tag: 'sena-' + cur.id }); } catch { /* sin avisos */ } });
  return one('SELECT * FROM appointments WHERE id=?', cur.id);
}

// Mercado Pago: se valida la referencia, el monto y la moneda del pago consultado con la clave del negocio.
function applyMp(shop, p) {
  const m = /^vt-a-(\d+)-(\d+)$/.exec(String(p.external_reference || ''));
  if (!m || Number(m[1]) !== shop.id) return null;
  const a = one('SELECT * FROM appointments WHERE id=? AND shop_id=?', Number(m[2]), shop.id);
  if (!a || a.dep_provider !== 'mp') return null;
  if (Math.round(Number(p.transaction_amount) * 100) !== a.dep_cents || String(p.currency_id).toUpperCase() !== shop.currency) return null;
  if (p.status === 'approved') return markPaid(shop, a, p.id);
  if (['refunded', 'charged_back'].includes(p.status)) run("UPDATE appointments SET dep_status='refunded' WHERE id=? AND dep_status='paid'", a.id);
  else if (['rejected', 'cancelled'].includes(p.status)) run("UPDATE appointments SET dep_status='failed', status=CASE WHEN status='awaiting_payment' THEN 'expired' ELSE status END WHERE id=? AND dep_status='pending'", a.id);
  return one('SELECT * FROM appointments WHERE id=?', a.id);
}
async function syncMp(shop, paymentId) { return applyMp(shop, await mp.getPayment(secrets.get(shop.id, 'mp_token'), paymentId)); }

// PayPal: al volver el cliente se captura el pago y se valida la orden, el monto y la moneda.
async function capturePp(shop, a, orderToken) {
  if (a.dep_provider !== 'pp' || !a.dep_ref || a.dep_ref !== String(orderToken)) return a;
  if (a.dep_status === 'paid') return a;
  const mode = ppMode(shop.id), tok = await pp.token(secrets.get(shop.id, 'pp_id'), secrets.get(shop.id, 'pp_secret'), mode);
  let r;
  try { r = await pp.capture(mode, tok, orderToken); } catch { r = await pp.getOrder(mode, tok, orderToken); } // si ya estaba capturada, se lee el estado de la orden
  const unit = (r.purchase_units || [])[0] || {}, cap = ((unit.payments || {}).captures || [])[0] || {};
  const value = PP_ZERO.has(shop.currency) ? a.dep_cents / 100 : a.dep_cents / 100;
  const ok = r.status === 'COMPLETED' && cap.status === 'COMPLETED' && unit.custom_id === ref(shop, a) && cap.amount && cap.amount.currency_code === shop.currency && Math.round(Number(cap.amount.value) * 100) === Math.round(value * 100);
  if (ok) return markPaid(shop, a, cap.id || orderToken);
  if (r.status === 'VOIDED') run("UPDATE appointments SET dep_status='failed', status=CASE WHEN status='awaiting_payment' THEN 'expired' ELSE status END WHERE id=? AND dep_status='pending'", a.id);
  return one('SELECT * FROM appointments WHERE id=?', a.id);
}

// Consulta el estado del cobro pendiente de una cita (por si el aviso o el regreso del cliente no llegaron).
async function reconcile(shop, a) {
  if (a.dep_status !== 'pending') return a;
  if (a.dep_provider === 'mp') {
    const r = await mp.searchPayments(secrets.get(shop.id, 'mp_token'), ref(shop, a));
    for (const p of (r.results || [])) applyMp(shop, p);
  } else if (a.dep_provider === 'pp' && a.dep_ref) {
    const mode = ppMode(shop.id), tok = await pp.token(secrets.get(shop.id, 'pp_id'), secrets.get(shop.id, 'pp_secret'), mode), o = await pp.getOrder(mode, tok, a.dep_ref);
    if (o.status === 'APPROVED' || o.status === 'COMPLETED') await capturePp(shop, a, a.dep_ref);
  }
  return one('SELECT * FROM appointments WHERE id=?', a.id);
}

// Citas que esperaban la seña y no se pagó a tiempo: se liberan (el pago sigue verificándose unas horas por si llega tarde).
function expire() { run("UPDATE appointments SET status='expired' WHERE status='awaiting_payment' AND dep_expires<?", now()); }
// El cobro no pudo iniciarse: la cita se anula en el acto y el horario queda libre.
function release(a) { run("UPDATE appointments SET status='expired', dep_status='failed' WHERE id=?", a.id); }
const pending = () => all("SELECT * FROM appointments WHERE dep_status='pending' AND dep_provider<>'' AND created_at>? ORDER BY id DESC LIMIT 40", now() - 24 * 3600000);

module.exports = { providers, amountFor, required, hold, start, markPaid, applyMp, syncMp, capturePp, reconcile, expire, release, pending, ref, PP_CURRENCIES };

// Cobro de los planes de la plataforma con TUS credenciales (Mercado Pago y/o PayPal). El plan se activa solo al confirmarse el pago.
const crypto = require('crypto');
const { db, one, all, run, now, tx, settings } = require('./db');
const Plans = require('./plans');
const secrets = require('./secrets');
const mp = require('./mp');
const pp = require('./pp');
const mail = require('./mail');
const Texts = require('./texts');

db.exec(`CREATE TABLE IF NOT EXISTS plan_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan TEXT NOT NULL, months INTEGER NOT NULL,
  amount REAL NOT NULL, currency TEXT NOT NULL, provider TEXT NOT NULL, ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  provider_ref TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, paid_at INTEGER)`);

const MONTHS = [1, 3, 12];
const ppConfig = () => ({ id: secrets.appGet('plat_pp_id'), secret: secrets.appGet('plat_pp_secret'), mode: settings().plat_pp_mode === 'live' ? 'live' : 'sandbox' });
const providers = () => ({
  mp: settings().plat_mp_on === '1' && !!secrets.appGet('plat_mp_token'),
  pp: settings().plat_pp_on === '1' && !!secrets.appGet('plat_pp_id') && !!secrets.appGet('plat_pp_secret'),
});
const refOf = (o) => `vtp-${o.id}-${o.ref}`;

async function startCheckout(user, planKey, months, provider, baseUrl) {
  const plan = Plans.get(planKey), pv = providers();
  if (!plan || plan.key === 'trial' || !plan.active || plan.price <= 0) throw Object.assign(new Error('Plan no disponible.'), { expose: true, status: 400 });
  if (!MONTHS.includes(months)) throw Object.assign(new Error('Periodo no válido.'), { expose: true, status: 400 });
  if (!pv[provider === 'paypal' ? 'pp' : 'mp']) throw Object.assign(new Error('Ese medio de pago no está disponible.'), { expose: true, status: 400 });
  const amount = Plans.priceFor(plan, months), currency = Plans.currency();
  const id = Number(run('INSERT INTO plan_orders(user_id,plan,months,amount,currency,provider,ref,created_at) VALUES (?,?,?,?,?,?,?,?)', user.id, planKey, months, amount, currency, provider, crypto.randomBytes(8).toString('hex'), now()).lastInsertRowid);
  const order = one('SELECT * FROM plan_orders WHERE id=?', id);
  const title = `Plan ${plan.name} · ${months} ${months === 1 ? 'mes' : 'meses'} · ${settings().site_name}`;
  try {
    if (provider === 'mp') {
      const https = /^https:/.test(baseUrl), back = `${baseUrl}/panel/plan/gracias`;
      const pref = await mp.createPreference(secrets.appGet('plat_mp_token'), {
        items: [{ title: title.slice(0, 250), quantity: 1, unit_price: amount, currency_id: currency }], external_reference: refOf(order),
        back_urls: { success: back, pending: back, failure: back }, ...(https ? { auto_return: 'approved', notification_url: `${baseUrl}/webhooks/mp-plan` } : {}),
      });
      if (!pref.init_point) throw new Error('Mercado Pago no devolvió el enlace de pago');
      return pref.init_point;
    }
    const c = ppConfig(), t = await pp.token(c.id, c.secret, c.mode);
    const o = await pp.createOrder(c.mode, t, {
      intent: 'CAPTURE', purchase_units: [{ reference_id: String(order.id), custom_id: refOf(order), description: title.slice(0, 120), amount: { currency_code: currency, value: amount.toFixed(2) } }],
      application_context: { return_url: `${baseUrl}/panel/plan/paypal`, cancel_url: `${baseUrl}/panel/plan`, brand_name: settings().site_name.slice(0, 120), user_action: 'PAY_NOW' },
    });
    run('UPDATE plan_orders SET provider_ref=? WHERE id=?', o.id, order.id);
    const link = (o.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
    if (!link) throw new Error('PayPal no devolvió el enlace de aprobación');
    return link.href;
  } catch (e) { run("UPDATE plan_orders SET status='failed' WHERE id=?", order.id); throw e; }
}

// Activa (o extiende) el plan una sola vez por pago.
function activate(orderId, providerRef) {
  const done = tx(() => {
    const o = one('SELECT * FROM plan_orders WHERE id=?', orderId);
    if (!o || o.status === 'paid') return null;
    run("UPDATE plan_orders SET status='paid', provider_ref=?, paid_at=? WHERE id=?", String(providerRef || ''), now(), o.id);
    const u = one('SELECT * FROM users WHERE id=?', o.user_id);
    const start = u.plan === o.plan && u.plan_until && u.plan_until > now() ? u.plan_until : now();
    run('UPDATE users SET plan=?, plan_until=? WHERE id=?', o.plan, start + o.months * 30 * 86400000, u.id);
    return { o, u };
  });
  if (done) {
    require('./pagecache').bustAll();
    const plan = Plans.get(done.o.plan);
    const v = { plan: plan ? plan.name : done.o.plan, meses: `${done.o.months} ${done.o.months === 1 ? 'mes' : 'meses'}`, monto: `${done.o.amount} ${done.o.currency}` };
    mail.send({ to: done.u.email, subject: Texts.get('receipt_mail_subject', v), title: Texts.get('receipt_mail_title', v), lines: Texts.lines('receipt_mail_lines', v) }).catch(() => {});
  }
  return !!done;
}

// Mercado Pago: se consulta el pago con tu clave (no se confía en la URL) y se valida pedido, monto y moneda.
async function verifyMp(paymentId) {
  const p = await mp.getPayment(secrets.appGet('plat_mp_token'), paymentId);
  const m = /^vtp-(\d+)-([a-f0-9]{16})$/.exec(String(p.external_reference || ''));
  if (!m) return null;
  const o = one('SELECT * FROM plan_orders WHERE id=? AND ref=? AND provider=\'mp\'', Number(m[1]), m[2]);
  if (!o) return null;
  if (Math.round(Number(p.transaction_amount) * 100) !== Math.round(o.amount * 100) || String(p.currency_id).toUpperCase() !== o.currency) return null;
  if (p.status === 'approved') { activate(o.id, p.id); return one('SELECT * FROM plan_orders WHERE id=?', o.id); }
  if (['rejected', 'cancelled'].includes(p.status)) run("UPDATE plan_orders SET status='failed' WHERE id=? AND status='pending'", o.id);
  return one('SELECT * FROM plan_orders WHERE id=?', o.id);
}
// PayPal: al volver el cliente se captura el pago y se valida el monto, la moneda y la referencia.
async function capturePp(orderToken) {
  const o = one("SELECT * FROM plan_orders WHERE provider='paypal' AND provider_ref=?", String(orderToken));
  if (!o) return null;
  if (o.status === 'paid') return o;
  const c = ppConfig(), t = await pp.token(c.id, c.secret, c.mode);
  const r = await pp.capture(c.mode, t, orderToken);
  const unit = (r.purchase_units || [])[0] || {}, cap = ((unit.payments || {}).captures || [])[0] || {};
  const ok = r.status === 'COMPLETED' && cap.status === 'COMPLETED' && unit.custom_id === refOf(o) && cap.amount && cap.amount.currency_code === o.currency && Math.round(Number(cap.amount.value) * 100) === Math.round(o.amount * 100);
  if (ok) activate(o.id, cap.id || orderToken); else run("UPDATE plan_orders SET status='failed' WHERE id=? AND status='pending'", o.id);
  return one('SELECT * FROM plan_orders WHERE id=?', o.id);
}
const recent = (n = 30) => all('SELECT o.*, u.email FROM plan_orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT ?', n);
const revenue = () => one("SELECT COALESCE(SUM(amount),0) s, COUNT(*) c FROM plan_orders WHERE status='paid'");
module.exports = { MONTHS, providers, startCheckout, activate, verifyMp, capturePp, recent, revenue, ppConfig };

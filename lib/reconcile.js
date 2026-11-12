// Revisa cada pocos minutos los pagos pendientes directamente en Mercado Pago y PayPal.
// Así el plan o el pedido se confirma aunque el cliente cierre la página o no haya dominio con HTTPS para los avisos.
const { one, all, now } = require('./db');
const platpay = require('./platpay');
const O = require('./orders');
const secrets = require('./secrets');
const mp = require('./mp');
const pp = require('./pp');
let busy = false;

async function run() {
  if (busy) return; busy = true;
  try {
    const pv = platpay.providers();
    for (const o of all("SELECT * FROM plan_orders WHERE status='pending' AND created_at>? ORDER BY id DESC LIMIT 40", now() - 3 * 86400000)) {
      try {
        if (o.provider === 'mp' && pv.mp) { const r = await mp.searchPayments(secrets.appGet('plat_mp_token'), platpay.refOf(o)); for (const p of (r.results || [])) platpay.applyMpPayment(p); }
        else if (o.provider === 'paypal' && pv.pp && o.provider_ref) {
          const c = platpay.ppConfig(), t = await pp.token(c.id, c.secret, c.mode), ord = await pp.getOrder(c.mode, t, o.provider_ref);
          if (ord.status === 'APPROVED' || ord.status === 'COMPLETED') await platpay.capturePp(o.provider_ref);
        }
      } catch (e) { console.error('[Vitrina] Revisión de pago de plan:', e.message); }
    }
    for (const o of all("SELECT * FROM orders WHERE pay_status='pending' AND status<>'cancelled' AND created_at>? ORDER BY id DESC LIMIT 40", now() - 24 * 3600000)) {
      try { const shop = one('SELECT * FROM shops WHERE id=?', o.shop_id); if (shop && secrets.get(shop.id, 'mp_token')) await O.reconcileOrder(shop, o); }
      catch (e) { console.error('[Vitrina] Revisión de pago de pedido:', e.message); }
    }
  } finally { busy = false; }
}
const schedule = () => setInterval(() => run().catch((e) => console.error(e)), Number(process.env.RECONCILE_MS) || 2 * 60 * 1000).unref();
module.exports = { run, schedule };

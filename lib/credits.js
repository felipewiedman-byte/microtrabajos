// Créditos: el trabajador compra créditos a la plataforma y gasta uno por cada oferta que envía.
// El dinero del trabajo se acuerda y paga directamente entre cliente y trabajador: la plataforma no lo toca.
const { one, all, run, tx, now, settings } = require('./db');

const DAY = 24 * 3600 * 1000;
const isOn = () => String(settings().business_model) === 'creditos';
const balance = (userId) => one('SELECT credits c FROM users WHERE id=?', userId)?.c || 0;
// Cuánto cuesta una oferta según el valor del trabajo: a más valor, más créditos (se cobra solo si te eligen).
function offerCost(valueCents) {
  const s = settings(), v = Number(valueCents) || 0, n = (k, d) => Math.max(1, Math.round(Number(s[k]) || d));
  if (v <= Number(s.lead_t1_max_cents)) return n('lead_t1_credits', 1);
  if (v <= Number(s.lead_t2_max_cents)) return n('lead_t2_credits', 3);
  if (v <= Number(s.lead_t3_max_cents)) return n('lead_t3_credits', 6);
  return n('lead_t4_credits', 10);
}
// Devuelve los créditos de una oferta que no fue elegida (descartada, vencida o publicación cerrada).
function refundOfferInTx(a, reason) { // para usar dentro de una transacción ya abierta
  if (!run("UPDATE applications SET status=? WHERE id=? AND status='pending'", reason.status, a.id).changes) return false;
  if (a.credit_spent > 0) add(a.worker_id, a.credit_spent, reason.text, a.id);
  return true;
}
const refundOffer = (a, reason) => tx(() => refundOfferInTx(a, reason));

function add(userId, delta, reason, ref) {
  run('UPDATE users SET credits = credits + ? WHERE id=?', delta, userId);
  run('INSERT INTO credit_log(user_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)', userId, delta, reason, ref || null, now());
}
// Gasta créditos de forma atómica: nunca deja el saldo en negativo.
function spend(userId, cost, reason, ref) {
  const ok = run('UPDATE users SET credits = credits - ? WHERE id=? AND credits >= ?', cost, userId, cost).changes;
  if (!ok) return false;
  run('INSERT INTO credit_log(user_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)', userId, -cost, reason, ref || null, now());
  return true;
}
// Paquetes a la venta (se configuran en el panel).
function packs() {
  const s = settings(), out = [];
  for (const n of [1, 2, 3]) {
    const credits = Math.round(Number(s['credit_pack_' + n + '_credits']) || 0), cents = Math.round(Number(s['credit_pack_' + n + '_cents']) || 0);
    if (credits > 0 && cents > 0) out.push({ n, credits, cents });
  }
  return out;
}
// Ofertas sin respuesta del cliente tras N días: vencen y se devuelve el crédito.
function refundExpired() {
  const limit = now() - Math.max(1, Number(settings().credit_refund_days) || 7) * DAY;
  for (const a of all("SELECT id, worker_id, credit_spent FROM applications WHERE status='pending' AND created_at < ?", limit)) refundOffer(a, { status: 'expired', text: 'Oferta sin respuesta: créditos devueltos' });
}
// El cliente cerró la publicación sin elegir a nadie: se devuelven los créditos de las ofertas pendientes.
function refundPendingForTask(taskId) {
  for (const a of all("SELECT id, worker_id, credit_spent FROM applications WHERE task_id=? AND status='pending'", taskId)) refundOffer(a, { status: 'expired', text: 'Publicación cerrada: créditos devueltos' });
}
const history = (userId) => all('SELECT * FROM credit_log WHERE user_id=? ORDER BY id DESC LIMIT 20', userId);

module.exports = { isOn, balance, offerCost, add, spend, packs, refundOffer, refundOfferInTx, refundExpired, refundPendingForTask, history };

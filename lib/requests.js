// Solicitudes a un servicio publicado: el cliente pide a un profesional y este decide si toma el trabajo.
// El profesional paga créditos SOLO si acepta (rechazar es gratis). El contacto del cliente se revela al aceptar.
const { one, all, run, tx, now, settings } = require('./db');
const credits = require('./credits');

const DAY = 24 * 3600 * 1000;

function create({ gigId, workerId, clientId, message, contact }) {
  return Number(run('INSERT INTO gig_requests(gig_id, worker_id, client_id, message, client_contact, created_at) VALUES (?,?,?,?,?,?)', gigId, workerId, clientId, message, contact, now()).lastInsertRowid);
}
// Acepta la solicitud gastando créditos de forma atómica. Devuelve { ok, rq, cost } o { error }.
function accept(requestId, workerId) {
  try {
    return tx(() => {
      const rq = one('SELECT r.*, g.price_cents, g.title gtitle FROM gig_requests r JOIN gigs g ON g.id=r.gig_id WHERE r.id=? AND r.worker_id=?', requestId, workerId);
      if (!rq) return { error: 'NOT_FOUND' };
      if (rq.status !== 'pending') return { error: 'DONE' };
      const cost = credits.offerCost(rq.price_cents);
      if (!credits.spend(workerId, cost, 'Solicitud aceptada: ' + rq.gtitle.slice(0, 60), rq.id)) return { error: 'NO_CREDITS', cost };
      if (!run("UPDATE gig_requests SET status='accepted', credit_spent=?, decided_at=? WHERE id=? AND status='pending'", cost, now(), rq.id).changes) throw new Error('RACE');
      return { ok: true, rq, cost };
    });
  } catch { return { error: 'DONE' }; }
}
function decline(requestId, workerId) {
  const rq = one("SELECT r.*, g.title gtitle FROM gig_requests r JOIN gigs g ON g.id=r.gig_id WHERE r.id=? AND r.worker_id=? AND r.status='pending'", requestId, workerId);
  if (!rq || !run("UPDATE gig_requests SET status='declined' WHERE id=? AND status='pending'", rq.id).changes) return null;
  return rq;
}
// Solicitudes sin respuesta vencen (no se había cobrado nada).
function expireOld() {
  return run("UPDATE gig_requests SET status='expired' WHERE status='pending' AND created_at < ?", now() - Math.max(1, Number(settings().credit_refund_days) || 7) * DAY).changes;
}
const received = (workerId) => all('SELECT r.*, g.title gtitle, g.price_cents, u.name client_name FROM gig_requests r JOIN gigs g ON g.id=r.gig_id JOIN users u ON u.id=r.client_id WHERE r.worker_id=? ORDER BY r.status=\'pending\' DESC, r.created_at DESC LIMIT 50', workerId);
const sent = (clientId) => all('SELECT r.*, (SELECT rating FROM reviews rv WHERE rv.req_id=r.id) my_rating, g.title gtitle, u.name worker_name FROM gig_requests r JOIN gigs g ON g.id=r.gig_id JOIN users u ON u.id=r.worker_id WHERE r.client_id=? ORDER BY r.created_at DESC LIMIT 50', clientId);

module.exports = { create, accept, decline, expireOld, received, sent };

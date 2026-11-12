// Calificaciones de quien contrata a un trabajador elegido (modelo de créditos). Una por contratación.
const { one, run, now } = require('./db');
const market = require('./market');

// kind: 'app' (oferta elegida) o 'req' (solicitud a servicio aceptada). Devuelve { ok } o { error }.
function rate({ kind, refId, reviewerId, rating, comment }) {
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) return { error: 'Elige de 1 a 5 estrellas.' };
  const text = market.filterContact(String(comment || '').replace(/\s+/g, ' ').trim().slice(0, 500));
  let workerId, col, title;
  if (kind === 'app') {
    const a = one("SELECT a.id, a.worker_id, a.status, t.client_id, t.title FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.id=?", refId);
    if (!a || a.client_id !== reviewerId || a.status !== 'accepted') return { error: 'No puedes calificar esta contratación.' };
    workerId = a.worker_id; col = 'app_id'; title = a.title;
  } else {
    const q = one("SELECT q.id, q.worker_id, q.status, q.client_id, g.title FROM gig_requests q JOIN gigs g ON g.id=q.gig_id WHERE q.id=?", refId);
    if (!q || q.client_id !== reviewerId || q.status !== 'accepted') return { error: 'No puedes calificar esta contratación.' };
    workerId = q.worker_id; col = 'req_id'; title = q.title;
  }
  if (one(`SELECT 1 x FROM reviews WHERE ${col}=?`, refId)) return { error: 'Ya calificaste esta contratación.' };
  run(`INSERT INTO reviews(${col}, reviewer_id, worker_id, rating, comment, created_at) VALUES (?,?,?,?,?,?)`, refId, reviewerId, workerId, r, text, now());
  market.notify(workerId, `Recibiste una calificación de ${r} ★ por «${title}».`, '/perfil/' + workerId);
  return { ok: true };
}
// Recordatorio (una sola vez) para calificar contrataciones aceptadas hace N días.
function remindToRate(days) {
  const limit = now() - Math.max(1, Number(days) || 3) * 86400000;
  for (const a of require('./db').all("SELECT a.id, t.client_id, t.title FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.status='accepted' AND a.rate_reminded=0 AND a.decided_at IS NOT NULL AND a.decided_at < ? AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.app_id=a.id) LIMIT 200", limit)) {
    run('UPDATE applications SET rate_reminded=1 WHERE id=?', a.id);
    market.notify(a.client_id, `¿Cómo te fue con «${a.title}»? Califica a la persona que elegiste.`, '/tareas/' + one('SELECT task_id t FROM applications WHERE id=?', a.id).t);
  }
  for (const q of require('./db').all("SELECT q.id, q.client_id, g.title FROM gig_requests q JOIN gigs g ON g.id=q.gig_id WHERE q.status='accepted' AND q.rate_reminded=0 AND q.decided_at IS NOT NULL AND q.decided_at < ? AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.req_id=q.id) LIMIT 200", limit)) {
    run('UPDATE gig_requests SET rate_reminded=1 WHERE id=?', q.id);
    market.notify(q.client_id, `¿Cómo te fue con «${q.title}»? Califica al profesional.`, '/solicitudes');
  }
}
module.exports = { rate, remindToRate };

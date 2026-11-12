// Derechos del titular de los datos: descargar lo que tenemos y eliminar la cuenta (se anonimiza lo que debe conservarse).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { one, all, run, tx, now, DATA_DIR } = require('./db');
const credits = require('./credits');

function exportData(userId) {
  const u = one('SELECT id, name, email, country, currency, headline, bio, skills, languages, company, city, zone, availability, verified_id, email_verified, notify_email, credits, created_at FROM users WHERE id=?', userId);
  return {
    generado: new Date().toISOString(), perfil: u,
    tareas_publicadas: all('SELECT id, title, description, budget_cents, status, created_at FROM tasks WHERE client_id=?', userId),
    ofertas_enviadas: all('SELECT a.id, t.title tarea, a.message, a.price_cents, a.status, a.created_at FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.worker_id=?', userId),
    servicios: all('SELECT id, title, description, price_cents, status, created_at FROM gigs WHERE worker_id=?', userId),
    solicitudes_enviadas: all('SELECT q.id, g.title servicio, q.message, q.status, q.created_at FROM gig_requests q JOIN gigs g ON g.id=q.gig_id WHERE q.client_id=?', userId),
    solicitudes_recibidas: all('SELECT q.id, g.title servicio, q.message, q.status, q.created_at FROM gig_requests q JOIN gigs g ON g.id=q.gig_id WHERE q.worker_id=?', userId),
    calificaciones_recibidas: all('SELECT rating, comment, created_at FROM reviews WHERE worker_id=?', userId),
    calificaciones_dadas: all('SELECT rating, comment, created_at FROM reviews WHERE reviewer_id=?', userId),
    movimientos_de_creditos: all('SELECT delta, reason, created_at FROM credit_log WHERE user_id=? ORDER BY id', userId),
    pagos: all('SELECT purpose, description, amount_cents, status, created_at FROM payments WHERE user_id=?', userId),
  };
}

// Devuelve { ok } o { error }. No elimina si hay pedidos activos o dinero pendiente.
function deleteAccount(userId) {
  const u = one('SELECT * FROM users WHERE id=?', userId);
  if (!u) return { error: 'Cuenta no encontrada.' };
  if (u.role === 'admin') return { error: 'La cuenta de administrador no se puede eliminar desde aquí.' };
  const busy = one("SELECT COUNT(*) c FROM orders WHERE (client_id=? OR worker_id=?) AND status IN ('pending_payment','in_progress','revision','delivered','disputed')", userId, userId).c
    + one("SELECT COUNT(*) c FROM withdrawals WHERE user_id=? AND status='requested'", userId).c
    + one("SELECT COUNT(*) c FROM g_orders WHERE (client_id=? OR shopper_id=?) AND status IN ('open','assigned','purchased')", userId, userId).c;
  if (busy) return { error: 'Tienes pedidos o retiros en curso. Termínalos antes de eliminar tu cuenta.' };
  const files = [];
  tx(() => {
    for (const t of all("SELECT id FROM tasks WHERE client_id=? AND status='open'", userId)) {
      for (const a of all("SELECT id, worker_id, credit_spent FROM applications WHERE task_id=? AND status='pending'", t.id)) credits.refundOfferInTx(a, { status: 'expired', text: 'Publicación eliminada: créditos devueltos' });
    }
    run("UPDATE tasks SET status='closed' WHERE client_id=? AND status='open'", userId);
    run("UPDATE gigs SET status='removed' WHERE worker_id=?", userId);
    run("UPDATE applications SET status='expired' WHERE worker_id=? AND status='pending'", userId);
    run("UPDATE gig_requests SET status='expired' WHERE (worker_id=? OR client_id=?) AND status='pending'", userId, userId);
    for (const r of all("SELECT reason FROM reports WHERE reporter_id=? AND target_type='verification'", userId)) files.push(r.reason);
    run("DELETE FROM reports WHERE reporter_id=? AND target_type='verification'", userId);
    run('DELETE FROM conv_messages WHERE conv_id IN (SELECT id FROM conversations WHERE a_id=? OR b_id=?)', userId, userId);
    run('DELETE FROM conversations WHERE a_id=? OR b_id=?', userId, userId);
    run('DELETE FROM questions WHERE asker_id=?', userId);
    run('DELETE FROM ticket_messages WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id=?)', userId);
    run('DELETE FROM tickets WHERE user_id=?', userId);
    run('DELETE FROM notifications WHERE user_id=?', userId);
    run('DELETE FROM logins WHERE user_id=?', userId);
    run('DELETE FROM auth_tokens WHERE user_id=?', userId);
    run('DELETE FROM subscribers WHERE email=?', u.email);
    run("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?", userId);
    // La cuenta queda anonimizada: los pedidos y pagos pasados se conservan sin datos personales (obligación contable).
    run(`UPDATE users SET name='Cuenta eliminada', email=?, password_hash=?, headline='', bio='', skills='', languages='', company='', city='', zone='', availability='',
      payout_method='', payout_account='', credits=0, status='deleted', ref_code=NULL, deleted_at=? WHERE id=?`, `eliminado-${userId}@eliminado.invalid`, crypto.randomBytes(24).toString('hex'), now(), userId);
  });
  for (const f of files) { try { fs.unlinkSync(path.join(DATA_DIR, 'uploads', path.basename(f))); } catch { /* ya no está */ } }
  return { ok: true };
}
module.exports = { exportData, deleteAccount };

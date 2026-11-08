const express = require('express');
const { one, all, run, now, settings } = require('../lib/db');
const market = require('../lib/market');
const { requireAdmin, fail, clean, int, toCents } = require('../lib/http');

const r = express.Router();
r.use(requireAdmin);
r.use((req, res, next) => { res.locals.adminNav = req.path; next(); });
const audit = (req, action) => run('INSERT INTO audit_log(admin_id,action,created_at) VALUES (?,?,?)', req.user.id, action, now());

r.get('/', (req, res) => {
  const month = now() - 30 * market.DAY;
  const k = {
    users: one('SELECT COUNT(*) c FROM users').c,
    newUsers: one('SELECT COUNT(*) c FROM users WHERE created_at>?', month).c,
    openTasks: one("SELECT COUNT(*) c FROM tasks WHERE status='open'").c,
    tasks30: one('SELECT COUNT(*) c FROM tasks WHERE created_at>?', month).c,
    active: one("SELECT COUNT(*) c FROM orders WHERE status IN ('in_progress','delivered','revision')").c,
    completed: one("SELECT COUNT(*) c FROM orders WHERE status='completed'").c,
    gmv: one("SELECT COALESCE(SUM(amount_cents),0) v FROM orders WHERE paid_at IS NOT NULL AND status NOT IN ('refunded','cancelled')").v,
    commissions: one("SELECT COALESCE(SUM(commission_cents),0) v FROM orders WHERE status='completed'").v,
    clientFees: one("SELECT COALESCE(SUM(client_fee_cents),0) v FROM orders WHERE status='completed'").v,
    other: one("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE status='paid' AND purpose IN ('plan','feature')").v,
    disputes: one("SELECT COUNT(*) c FROM disputes WHERE status='open'").c,
    withdrawals: one("SELECT COUNT(*) c FROM withdrawals WHERE status='requested'").c,
    reports: one("SELECT COUNT(*) c FROM reports WHERE status='open'").c,
    paidOrders: one('SELECT COUNT(*) c FROM orders WHERE paid_at IS NOT NULL').c,
    disputed: one('SELECT COUNT(DISTINCT order_id) c FROM disputes').c,
  };
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(); start.setHours(0, 0, 0, 0); const s = start.getTime() - i * market.DAY;
    const v = one("SELECT COALESCE(SUM(commission_cents + client_fee_cents),0) v FROM orders WHERE status='completed' AND completed_at>=? AND completed_at<?", s, s + market.DAY).v
      + one("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE status='paid' AND purpose IN ('plan','feature') AND paid_at>=? AND paid_at<?", s, s + market.DAY).v;
    days.push({ label: new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }), v });
  }
  res.render('admin/index', { title: 'Panel de administración', k, days, recent: all('SELECT o.*, c.name client_name, w.name worker_name FROM orders o JOIN users c ON c.id=o.client_id JOIN users w ON w.id=o.worker_id ORDER BY o.created_at DESC LIMIT 8') });
});

// ---------- Usuarios ----------
r.get('/usuarios', (req, res) => {
  const q = clean(req.query.q, 100);
  const users = all(`SELECT u.*, (SELECT COUNT(*) FROM orders WHERE worker_id=u.id AND status='completed') done,
    (SELECT reason FROM reports WHERE target_type='verification' AND target_id=u.id AND status='open' ORDER BY id DESC LIMIT 1) doc
    FROM users u ${q ? 'WHERE u.name LIKE ? OR u.email LIKE ?' : req.query.alertas ? 'WHERE u.strikes >= 3' : req.query.verificar ? "WHERE EXISTS(SELECT 1 FROM reports WHERE target_type='verification' AND target_id=u.id AND status='open')" : ''}
    ORDER BY u.created_at DESC LIMIT 200`, ...(q ? [`%${q}%`, `%${q}%`] : []));
  res.render('admin/users', { title: 'Usuarios', users });
});
r.post('/usuarios/:id(\\d+)', (req, res, next) => {
  const u = one('SELECT * FROM users WHERE id=?', int(req.params.id));
  if (!u) return next(fail(404, 'Usuario no encontrado.'));
  const a = req.body.action;
  if (a === 'suspend' && u.id !== req.user.id) run("UPDATE users SET status=CASE status WHEN 'active' THEN 'suspended' ELSE 'active' END WHERE id=?", u.id);
  if (a === 'verify') {
    run('UPDATE users SET verified_id=1 WHERE id=?', u.id);
    run("UPDATE reports SET status='closed' WHERE target_type='verification' AND target_id=?", u.id);
    market.notify(u.id, 'Su identidad fue verificada. Ya puede retirar sus ganancias.', '/billetera');
  }
  if (a === 'reject_verify') {
    run("UPDATE reports SET status='closed' WHERE target_type='verification' AND target_id=?", u.id);
    market.notify(u.id, 'No pudimos verificar su documento. Envíe una foto legible.', '/cuenta');
  }
  if (a === 'admin' && u.id !== req.user.id) run("UPDATE users SET role=CASE role WHEN 'admin' THEN 'user' ELSE 'admin' END WHERE id=?", u.id);
  audit(req, `usuario #${u.id}: ${a}`);
  res.redirect('/admin/usuarios');
});

// ---------- Tareas y servicios ----------
r.get('/tareas', (req, res) => {
  res.render('admin/tasks', {
    title: 'Tareas y servicios',
    tasks: all("SELECT t.*, u.name client_name, c.name cat_name FROM tasks t JOIN users u ON u.id=t.client_id JOIN categories c ON c.id=t.category_id ORDER BY t.created_at DESC LIMIT 200"),
    gigs: all("SELECT g.*, u.name worker_name FROM gigs g JOIN users u ON u.id=g.worker_id ORDER BY g.created_at DESC LIMIT 200"),
    reports: all("SELECT r.*, u.name FROM reports r JOIN users u ON u.id=r.reporter_id WHERE r.status='open' AND r.target_type!='verification' ORDER BY r.created_at DESC"),
  });
});
r.post('/tareas/:id(\\d+)/eliminar', (req, res) => {
  run("UPDATE tasks SET status='removed' WHERE id=?", int(req.params.id));
  audit(req, `tarea #${req.params.id} eliminada`);
  res.redirect('/admin/tareas');
});
r.post('/servicios/:id(\\d+)/eliminar', (req, res) => {
  run("UPDATE gigs SET status='removed' WHERE id=?", int(req.params.id));
  audit(req, `servicio #${req.params.id} eliminado`);
  res.redirect('/admin/tareas');
});
r.post('/reportes/:id(\\d+)/cerrar', (req, res) => {
  run("UPDATE reports SET status='closed' WHERE id=?", int(req.params.id));
  res.redirect('/admin/tareas');
});

// ---------- Pedidos y disputas ----------
r.get('/pedidos', (req, res) => {
  res.render('admin/orders', { title: 'Pedidos', orders: all('SELECT o.*, c.name client_name, w.name worker_name FROM orders o JOIN users c ON c.id=o.client_id JOIN users w ON w.id=o.worker_id ORDER BY o.created_at DESC LIMIT 300') });
});
r.get('/disputas', (req, res) => {
  res.render('admin/disputes', { title: 'Disputas', disputes: all(`SELECT d.*, o.title, o.amount_cents, o.status ostatus, u.name opener FROM disputes d JOIN orders o ON o.id=d.order_id JOIN users u ON u.id=d.opened_by ORDER BY d.status='open' DESC, d.created_at DESC`) });
});
r.post('/disputas/:id(\\d+)', (req, res, next) => {
  const d = one("SELECT * FROM disputes WHERE id=? AND status='open'", int(req.params.id));
  if (!d) return next(fail(404, 'Disputa no disponible.'));
  const note = clean(req.body.note, 1000) || 'Resuelta por moderación.';
  if (req.body.decision === 'worker') {
    run("UPDATE orders SET status='delivered' WHERE id=?", d.order_id);
    market.completeOrder(d.order_id, req.user.id);
  } else {
    market.refundOrder(d.order_id, 'Disputa resuelta a favor del cliente. ' + note);
  }
  run("UPDATE disputes SET status='resolved', resolution=?, resolved_at=? WHERE id=?", `${req.body.decision === 'worker' ? 'A favor del trabajador' : 'Reembolso al cliente'}: ${note}`, now(), d.id);
  market.event(d.order_id, req.user.id, 'system', 'Decisión de moderación: ' + note);
  audit(req, `disputa #${d.id}: ${req.body.decision}`);
  res.redirect('/admin/disputas');
});

// ---------- Finanzas ----------
r.get('/finanzas', (req, res) => {
  res.render('admin/finance', {
    title: 'Finanzas',
    payments: all('SELECT p.*, u.name FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200'),
    withdrawals: all("SELECT w.*, u.name, u.email FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.status='requested' DESC, w.created_at DESC LIMIT 200"),
  });
});
r.post('/retiros/:id(\\d+)', (req, res, next) => {
  const w = one("SELECT * FROM withdrawals WHERE id=? AND status='requested'", int(req.params.id));
  if (!w) return next(fail(404, 'Retiro no disponible.'));
  if (req.body.action === 'paid') {
    run("UPDATE withdrawals SET status='paid', note=?, processed_at=? WHERE id=?", clean(req.body.note, 200), now(), w.id);
    market.notify(w.user_id, `Su retiro de ${market.money(w.amount_cents)} fue enviado.`, '/billetera');
  } else {
    run("UPDATE withdrawals SET status='rejected', note=?, processed_at=? WHERE id=?", clean(req.body.note, 200), now(), w.id);
    run('INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,?,?,?,?,?)', w.user_id, 'reversal', w.amount_cents, now(), `Retiro #${w.id} rechazado`, now());
    market.notify(w.user_id, `Su retiro fue rechazado: ${clean(req.body.note, 200) || 'datos incorrectos'}. El saldo fue devuelto.`, '/billetera');
  }
  audit(req, `retiro #${w.id}: ${req.body.action}`);
  res.redirect('/admin/finanzas');
});
r.post('/pagos/:id(\\d+)/reembolsado', (req, res) => {
  run("UPDATE payments SET status='refunded' WHERE id=? AND status='refund_pending'", int(req.params.id));
  audit(req, `pago #${req.params.id} reembolsado`);
  res.redirect('/admin/finanzas');
});

// ---------- Configuración ----------
r.get('/configuracion', (req, res) => {
  res.render('admin/settings', { title: 'Configuración', cats: all('SELECT * FROM categories ORDER BY sort'), log: all('SELECT a.*, u.name FROM audit_log a JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 30') });
});
r.post('/configuracion', (req, res) => {
  const pct = ['commission_pct', 'pro_commission_pct', 'client_fee_pct', 'clearance_days', 'auto_approve_hours', 'max_revisions', 'usd_to_local'];
  const cents = ['client_fee_min_cents', 'min_task_cents', 'min_withdraw_cents', 'feature_24h_cents', 'feature_7d_cents', 'plan_pro_cents', 'plan_business_cents'];
  for (const k of pct) if (req.body[k] !== undefined && req.body[k] !== '') run('UPDATE settings SET value=? WHERE key=?', String(Math.max(0, Number(req.body[k]) || 0)), k);
  for (const k of cents) if (req.body[k] !== undefined && req.body[k] !== '') run('UPDATE settings SET value=? WHERE key=?', String(toCents(req.body[k])), k);
  audit(req, 'configuración actualizada');
  req.flash('ok', 'Configuración guardada.');
  res.redirect('/admin/configuracion');
});
r.post('/categorias/:id(\\d+)', (req, res) => {
  run('UPDATE categories SET active=1-active WHERE id=?', int(req.params.id));
  audit(req, `categoría #${req.params.id} activada/desactivada`);
  res.redirect('/admin/configuracion');
});

module.exports = r;

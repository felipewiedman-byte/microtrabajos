const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { one, all, run, now, settings, DATA_DIR } = require('../lib/db');
const market = require('../lib/market');
const payments = require('../lib/payments');
const { upload, fail, requireAuth, csrfMultipart, toCents, clean, int } = require('../lib/http');

const r = express.Router();
const cats = () => all('SELECT * FROM categories WHERE active=1 ORDER BY sort');
const getOrder = (req) => {
  const o = one(`SELECT o.*, c.name client_name, w.name worker_name FROM orders o JOIN users c ON c.id=o.client_id JOIN users w ON w.id=o.worker_id WHERE o.id=?`, int(req.params.id));
  if (!o) throw fail(404, 'Pedido no encontrado.');
  const role = o.client_id === req.user.id ? 'client' : o.worker_id === req.user.id ? 'worker' : req.user.role === 'admin' ? 'admin' : null;
  if (!role) throw fail(403, 'No tiene acceso a este pedido.');
  return { o, role };
};

// ---------- Panel ----------
r.get('/panel', requireAuth, (req, res) => {
  const u = req.user.id;
  res.render('dashboard', {
    title: 'Mi panel',
    wallet: market.wallet(u),
    stats: market.workerStats(u),
    asWorker: all("SELECT * FROM orders WHERE worker_id=? AND status IN ('in_progress','revision','delivered','disputed') ORDER BY due_at LIMIT 6", u),
    asClient: all("SELECT * FROM orders WHERE client_id=? AND status IN ('pending_payment','in_progress','revision','delivered','disputed') ORDER BY created_at DESC LIMIT 6", u),
    myTasks: all("SELECT t.*, (SELECT COUNT(*) FROM applications a WHERE a.task_id=t.id AND a.status='pending') apps FROM tasks t WHERE client_id=? AND status='open' ORDER BY created_at DESC LIMIT 6", u),
    notes: all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 6', u),
  });
});

// ---------- Publicar tarea ----------
r.get('/tareas/nueva', requireAuth, (req, res) => res.render('task-form', { title: 'Publicar tarea', cats: cats(), form: { delivery_hours: 24, quantity: 1, mode: 'single', category_id: req.query.cat } }));
r.post('/tareas', requireAuth, upload.single('attachment'), csrfMultipart, (req, res) => {
  const s = settings();
  const form = {
    title: clean(req.body.title, 120), description: clean(req.body.description, 4000), category_id: int(req.body.category_id),
    budget: req.body.budget, delivery_hours: int(req.body.delivery_hours, 24), mode: req.body.mode === 'units' ? 'units' : 'single',
    quantity: Math.min(1000, Math.max(1, int(req.body.quantity, 1))), express: req.body.express ? 1 : 0,
  };
  const cents = toCents(form.budget);
  const err = (m) => res.status(400).render('task-form', { title: 'Publicar tarea', cats: cats(), form, error: m });
  if (form.title.length < 8) return err('El título debe tener al menos 8 caracteres.');
  if (form.description.length < 30) return err('Describa la tarea con al menos 30 caracteres.');
  if (!one('SELECT id FROM categories WHERE id=?', form.category_id)) return err('Seleccione una categoría.');
  if (cents < s.min_task_cents) return err(`El presupuesto mínimo por tarea (o por unidad) es ${market.money(s.min_task_cents)}.`);
  if (cents > 500000) return err('El presupuesto máximo por tarea es $5.000 USD.');
  if (form.delivery_hours < 1 || form.delivery_hours > 720) return err('Plazo de entrega no válido.');
  const id = run(`INSERT INTO tasks(client_id,category_id,title,description,budget_cents,delivery_hours,mode,quantity,express,attachment,attachment_name,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, req.user.id, form.category_id, form.title, market.filterContact(form.description), cents, form.delivery_hours,
  form.mode, form.mode === 'units' ? form.quantity : 1, form.express, req.file?.filename || null, req.file ? clean(req.file.originalname, 120) : null, now()).lastInsertRowid;
  req.flash('ok', 'Tarea publicada. Le avisaremos cuando reciba postulaciones.');
  res.redirect('/tareas/' + id);
});

r.post('/tareas/:id(\\d+)/cerrar', requireAuth, (req, res) => {
  run("UPDATE tasks SET status='closed' WHERE id=? AND client_id=? AND status='open'", int(req.params.id), req.user.id);
  req.flash('ok', 'Publicación cerrada.');
  res.redirect('/tareas/' + req.params.id);
});

r.post('/tareas/:id(\\d+)/destacar', requireAuth, (req, res, next) => {
  const t = one("SELECT * FROM tasks WHERE id=? AND client_id=? AND status='open'", int(req.params.id), req.user.id);
  if (!t) return next(fail(404, 'Tarea no disponible.'));
  const s = settings(), week = req.body.plan === '7d';
  const payId = payments.createPayment(req.user.id, 'feature', t.id, `Destacar "${t.title}" ${week ? '7 días' : '24 horas'}`, week ? s.feature_7d_cents : s.feature_24h_cents);
  run('UPDATE payments SET meta=? WHERE id=?', JSON.stringify({ hours: week ? 168 : 24 }), payId);
  res.redirect('/pagar/' + payId);
});

// ---------- Postulaciones ----------
r.post('/tareas/:id(\\d+)/postular', requireAuth, (req, res, next) => {
  const t = one("SELECT * FROM tasks WHERE id=? AND status='open'", int(req.params.id));
  if (!t) return next(fail(404, 'Esta tarea ya no está disponible.'));
  if (t.client_id === req.user.id) return next(fail(400, 'No puede postularse a su propia tarea.'));
  const msg = clean(req.body.message, 2000);
  const cents = toCents(req.body.price) || t.budget_cents;
  if (msg.length < 20) { req.flash('error', 'Escriba una propuesta de al menos 20 caracteres.'); return res.redirect('/tareas/' + t.id); }
  if (cents < settings().min_task_cents) { req.flash('error', 'Precio por debajo del mínimo permitido.'); return res.redirect('/tareas/' + t.id); }
  const today = one('SELECT COUNT(*) c FROM applications WHERE worker_id=? AND created_at > ?', req.user.id, now() - market.DAY).c;
  const limit = market.isPro(req.user) ? 50 : 10;
  if (today >= limit) { req.flash('error', `Alcanzó el límite de ${limit} postulaciones diarias${limit === 10 ? '. Con el plan Pro puede enviar hasta 50.' : '.'}`); return res.redirect('/tareas/' + t.id); }
  try {
    run('INSERT INTO applications(task_id,worker_id,message,price_cents,created_at) VALUES (?,?,?,?,?)', t.id, req.user.id, market.filterContact(msg), cents, now());
  } catch { req.flash('error', 'Ya se postuló a esta tarea.'); return res.redirect('/tareas/' + t.id); }
  market.notify(t.client_id, `${req.user.name} se postuló a "${t.title}"`, '/tareas/' + t.id);
  req.flash('ok', 'Postulación enviada.');
  res.redirect('/tareas/' + t.id);
});

r.post('/postulaciones/:id(\\d+)/retirar', requireAuth, (req, res) => {
  run("DELETE FROM applications WHERE id=? AND worker_id=? AND status='pending'", int(req.params.id), req.user.id);
  res.redirect('/postulaciones');
});

r.post('/postulaciones/:id(\\d+)/aceptar', requireAuth, (req, res, next) => {
  const a = one(`SELECT a.*, t.client_id, t.title, t.delivery_hours, t.status tstatus, t.id tid FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.id=?`, int(req.params.id));
  if (!a || a.client_id !== req.user.id) return next(fail(404, 'Postulación no encontrada.'));
  if (a.tstatus !== 'open' || a.status !== 'pending') return next(fail(400, 'Esta postulación ya no está disponible.'));
  const existing = one("SELECT * FROM orders WHERE application_id=? AND status='pending_payment'", a.id);
  if (existing) { const p = one("SELECT id FROM payments WHERE purpose='order' AND ref_id=? AND status='pending'", existing.id); return res.redirect('/pagar/' + p.id); }
  const { payId } = market.createOrder({ taskId: a.tid, applicationId: a.id, clientId: req.user.id, workerId: a.worker_id, title: a.title, amountCents: a.price_cents, deliveryHours: a.delivery_hours });
  res.redirect('/pagar/' + payId);
});

r.post('/postulaciones/:id(\\d+)/rechazar', requireAuth, (req, res) => {
  const a = one('SELECT a.*, t.client_id, t.title FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.id=?', int(req.params.id));
  if (a && a.client_id === req.user.id && a.status === 'pending') {
    run("UPDATE applications SET status='rejected' WHERE id=?", a.id);
    market.notify(a.worker_id, `Su postulación a "${a.title}" no fue seleccionada.`, '/postulaciones');
  }
  res.redirect('/tareas/' + (a?.task_id || ''));
});

r.get('/postulaciones', requireAuth, (req, res) => {
  res.render('applications', { title: 'Mis postulaciones', apps: all(`SELECT a.*, t.title, t.status tstatus FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.worker_id=? ORDER BY a.created_at DESC`, req.user.id) });
});

// ---------- Servicios del trabajador ----------
r.get('/servicios/nuevo', requireAuth, (req, res) => res.render('gig-form', { title: 'Publicar servicio', cats: cats(), form: { delivery_hours: 24, revisions: 2 } }));
r.post('/servicios', requireAuth, (req, res) => {
  const form = { title: clean(req.body.title, 100), description: clean(req.body.description, 4000), category_id: int(req.body.category_id), price: req.body.price, delivery_hours: int(req.body.delivery_hours, 24), revisions: Math.min(5, Math.max(0, int(req.body.revisions, 2))) };
  const cents = toCents(form.price);
  const err = (m) => res.status(400).render('gig-form', { title: 'Publicar servicio', cats: cats(), form, error: m });
  if (form.title.length < 8) return err('El título debe tener al menos 8 caracteres.');
  if (form.description.length < 30) return err('Describa su servicio con al menos 30 caracteres.');
  if (!one('SELECT id FROM categories WHERE id=?', form.category_id)) return err('Seleccione una categoría.');
  if (cents < settings().min_task_cents || cents > 500000) return err('Precio fuera del rango permitido.');
  const count = one("SELECT COUNT(*) c FROM gigs WHERE worker_id=? AND status='active'", req.user.id).c;
  if (count >= (market.isPro(req.user) ? 30 : 5)) return err('Alcanzó el máximo de servicios activos de su plan.');
  const id = run('INSERT INTO gigs(worker_id,category_id,title,description,price_cents,delivery_hours,revisions,created_at) VALUES (?,?,?,?,?,?,?,?)',
    req.user.id, form.category_id, form.title, market.filterContact(form.description), cents, form.delivery_hours, form.revisions, now()).lastInsertRowid;
  req.flash('ok', 'Servicio publicado.');
  res.redirect('/servicios/' + id);
});
r.post('/servicios/:id(\\d+)/pausar', requireAuth, (req, res) => {
  run("UPDATE gigs SET status=CASE status WHEN 'active' THEN 'paused' ELSE 'active' END WHERE id=? AND worker_id=?", int(req.params.id), req.user.id);
  res.redirect('/servicios/' + req.params.id);
});
r.post('/servicios/:id(\\d+)/comprar', requireAuth, (req, res, next) => {
  const g = one("SELECT * FROM gigs WHERE id=? AND status='active'", int(req.params.id));
  if (!g) return next(fail(404, 'Servicio no disponible.'));
  if (g.worker_id === req.user.id) return next(fail(400, 'No puede comprar su propio servicio.'));
  const { orderId, payId } = market.createOrder({ gigId: g.id, clientId: req.user.id, workerId: g.worker_id, title: g.title, amountCents: g.price_cents, deliveryHours: g.delivery_hours, maxRevisions: g.revisions });
  const brief = clean(req.body.brief, 2000);
  if (brief) market.event(orderId, req.user.id, 'message', market.filterContact(brief));
  res.redirect('/pagar/' + payId);
});

// ---------- Pago ----------
r.get('/pagar/:id(\\d+)', requireAuth, (req, res, next) => {
  const p = one('SELECT * FROM payments WHERE id=? AND user_id=?', int(req.params.id), req.user.id);
  if (!p) return next(fail(404, 'Pago no encontrado.'));
  if (p.status === 'paid') return res.redirect(require('./public').afterPay(p));
  const order = p.purpose === 'order' ? one('SELECT * FROM orders WHERE id=?', p.ref_id) : null;
  res.render('checkout', { title: 'Pagar', p, order, providers: payments.providers(), error: req.query.error ? 'El pago no se completó. Puede intentarlo de nuevo.' : null });
});
r.post('/pagar/:id(\\d+)', requireAuth, async (req, res, next) => {
  try {
    const p = one("SELECT * FROM payments WHERE id=? AND user_id=? AND status='pending'", int(req.params.id), req.user.id);
    if (!p) throw fail(404, 'Pago no disponible.');
    res.redirect(await payments.checkout(p.id, String(req.body.provider)));
  } catch (e) { e.expose = true; next(e); }
});
r.get('/pagos/demo/:id(\\d+)', requireAuth, (req, res, next) => {
  const p = one("SELECT * FROM payments WHERE id=? AND user_id=? AND provider='demo'", int(req.params.id), req.user.id);
  if (!p || !payments.isDemoAllowed()) return next(fail(404, 'Pago no disponible.'));
  res.render('demo-pay', { title: 'Pago de prueba', p });
});
r.post('/pagos/demo/:id(\\d+)', requireAuth, (req, res, next) => {
  const p = one("SELECT * FROM payments WHERE id=? AND user_id=? AND provider='demo'", int(req.params.id), req.user.id);
  if (!p || !payments.isDemoAllowed()) return next(fail(404, 'Pago no disponible.'));
  market.markPaid(p.id);
  res.redirect(require('./public').afterPay(p));
});

// ---------- Pedidos ----------
r.get('/pedidos', requireAuth, (req, res) => {
  const tab = req.query.rol === 'cliente' ? 'cliente' : 'trabajador';
  const col = tab === 'cliente' ? 'client_id' : 'worker_id';
  const orders = all(`SELECT o.*, c.name client_name, w.name worker_name FROM orders o JOIN users c ON c.id=o.client_id JOIN users w ON w.id=o.worker_id WHERE o.${col}=? ORDER BY o.created_at DESC`, req.user.id);
  res.render('orders', { title: 'Mis trabajos', orders, tab });
});

r.get('/pedidos/:id(\\d+)', requireAuth, (req, res) => {
  const { o, role } = getOrder(req);
  const events = all('SELECT e.*, u.name FROM order_events e LEFT JOIN users u ON u.id=e.user_id WHERE order_id=? ORDER BY e.created_at', o.id);
  const payment = one("SELECT * FROM payments WHERE purpose='order' AND ref_id=? ORDER BY id DESC", o.id);
  const review = one('SELECT * FROM reviews WHERE order_id=?', o.id);
  const dispute = one('SELECT * FROM disputes WHERE order_id=? ORDER BY id DESC', o.id);
  res.render('order', { title: `Pedido #${o.id}`, o, role, events, payment, review, dispute, commission: market.commissionFor(o.worker_id, o.amount_cents) });
});

r.post('/pedidos/:id(\\d+)/mensaje', requireAuth, upload.single('file'), csrfMultipart, (req, res) => {
  const { o, role } = getOrder(req);
  const text = market.filterContact(clean(req.body.text, 3000));
  if (role !== 'admin' && ['completed', 'refunded', 'cancelled'].includes(o.status) && !text) return res.redirect('/pedidos/' + o.id);
  if (text || req.file) {
    market.event(o.id, req.user.id, 'message', text, req.file?.filename, req.file && clean(req.file.originalname, 120));
    const to = role === 'client' ? o.worker_id : o.client_id;
    market.notify(to, `Nuevo mensaje en "${o.title}"`, `/pedidos/${o.id}#chat`);
  }
  res.redirect(`/pedidos/${o.id}#chat`);
});

r.post('/pedidos/:id(\\d+)/entregar', requireAuth, upload.single('file'), csrfMultipart, (req, res, next) => {
  const { o, role } = getOrder(req);
  if (role !== 'worker' || !['in_progress', 'revision'].includes(o.status)) return next(fail(400, 'No es posible entregar este pedido ahora.'));
  const text = market.filterContact(clean(req.body.text, 3000));
  if (!text && !req.file) { req.flash('error', 'Adjunte un archivo o describa la entrega.'); return res.redirect('/pedidos/' + o.id); }
  run("UPDATE orders SET status='delivered', delivered_at=? WHERE id=?", now(), o.id);
  market.event(o.id, req.user.id, 'delivery', text || 'Entrega realizada.', req.file?.filename, req.file && clean(req.file.originalname, 120));
  market.notify(o.client_id, `Recibió una entrega en "${o.title}". Revísela y apruébela.`, `/pedidos/${o.id}`);
  req.flash('ok', 'Entrega enviada al cliente.');
  res.redirect('/pedidos/' + o.id);
});

r.post('/pedidos/:id(\\d+)/aprobar', requireAuth, (req, res, next) => {
  const { o, role } = getOrder(req);
  if (role !== 'client' || o.status !== 'delivered') return next(fail(400, 'Este pedido no se puede aprobar ahora.'));
  market.completeOrder(o.id, req.user.id);
  req.flash('ok', 'Trabajo aprobado. Ahora puede calificar al trabajador.');
  res.redirect('/pedidos/' + o.id);
});

r.post('/pedidos/:id(\\d+)/correccion', requireAuth, (req, res, next) => {
  const { o, role } = getOrder(req);
  if (role !== 'client' || o.status !== 'delivered') return next(fail(400, 'No puede solicitar correcciones ahora.'));
  if (o.revisions_used >= o.max_revisions) { req.flash('error', 'Ya usó todas las correcciones incluidas. Puede aprobar o abrir una disputa.'); return res.redirect('/pedidos/' + o.id); }
  const text = market.filterContact(clean(req.body.text, 2000));
  if (text.length < 10) { req.flash('error', 'Explique qué debe corregirse.'); return res.redirect('/pedidos/' + o.id); }
  run("UPDATE orders SET status='revision', revisions_used=revisions_used+1, due_at=? WHERE id=?", now() + Math.max(24, Math.ceil(o.delivery_hours / 2)) * market.HOUR, o.id);
  market.event(o.id, req.user.id, 'revision', text);
  market.notify(o.worker_id, `El cliente solicitó una corrección en "${o.title}"`, `/pedidos/${o.id}`);
  res.redirect('/pedidos/' + o.id);
});

r.post('/pedidos/:id(\\d+)/disputa', requireAuth, (req, res, next) => {
  const { o, role } = getOrder(req);
  if (!['client', 'worker'].includes(role) || !['in_progress', 'delivered', 'revision'].includes(o.status)) return next(fail(400, 'No puede abrir una disputa en este estado.'));
  const reason = clean(req.body.reason, 2000);
  if (reason.length < 20) { req.flash('error', 'Explique el motivo con al menos 20 caracteres.'); return res.redirect('/pedidos/' + o.id); }
  run("UPDATE orders SET status='disputed' WHERE id=?", o.id);
  run('INSERT INTO disputes(order_id,opened_by,reason,created_at) VALUES (?,?,?,?)', o.id, req.user.id, reason, now());
  market.event(o.id, req.user.id, 'dispute', reason);
  market.notify(role === 'client' ? o.worker_id : o.client_id, `Se abrió una disputa en "${o.title}"`, `/pedidos/${o.id}`);
  for (const a of all("SELECT id FROM users WHERE role='admin'")) market.notify(a.id, `Nueva disputa en pedido #${o.id}`, '/admin/disputas');
  req.flash('ok', 'Disputa abierta. Un moderador revisará el caso en máximo 72 horas.');
  res.redirect('/pedidos/' + o.id);
});

r.post('/pedidos/:id(\\d+)/cancelar', requireAuth, (req, res, next) => {
  const { o, role } = getOrder(req);
  // El cliente cancela antes de pagar; el trabajador puede rechazar un pedido pagado antes de entregarlo (reembolso al cliente).
  if (role === 'client' && o.status === 'pending_payment') market.refundOrder(o.id, 'Pedido cancelado por el cliente antes del pago.');
  else if (role === 'worker' && o.status === 'in_progress') market.refundOrder(o.id, 'El trabajador canceló el pedido. Se reembolsará el pago al cliente.');
  else return next(fail(400, 'Este pedido no puede cancelarse. Use el centro de disputas.'));
  res.redirect('/pedidos/' + o.id);
});

r.post('/pedidos/:id(\\d+)/calificar', requireAuth, (req, res, next) => {
  const { o, role } = getOrder(req);
  if (role !== 'client' || o.status !== 'completed') return next(fail(400, 'Solo puede calificar pedidos completados.'));
  const rating = Math.min(5, Math.max(1, int(req.body.rating, 5)));
  try {
    run('INSERT INTO reviews(order_id,reviewer_id,worker_id,rating,comment,created_at) VALUES (?,?,?,?,?,?)', o.id, req.user.id, o.worker_id, rating, market.filterContact(clean(req.body.comment, 1000)), now());
    market.notify(o.worker_id, `Recibió una calificación de ${rating} estrellas.`, `/perfil/${o.worker_id}`);
  } catch { /* ya calificado */ }
  res.redirect('/pedidos/' + o.id);
});

// Archivos privados: solo participantes del pedido o administradores.
r.get('/archivos/:name', requireAuth, (req, res, next) => {
  const name = path.basename(req.params.name);
  const ev = one('SELECT e.file_name, o.client_id, o.worker_id FROM order_events e JOIN orders o ON o.id=e.order_id WHERE e.file=?', name);
  const task = one('SELECT attachment_name name FROM tasks WHERE attachment=?', name);
  const allowed = req.user.role === 'admin' || task || (ev && [ev.client_id, ev.worker_id].includes(req.user.id));
  const file = path.join(DATA_DIR, 'uploads', name);
  if (!allowed || !fs.existsSync(file)) return next(fail(404, 'Archivo no disponible.'));
  res.download(file, ev?.file_name || task?.name || name);
});

// ---------- Mensajes ----------
r.get('/mensajes', requireAuth, (req, res) => {
  const threads = all(`SELECT o.id, o.title, o.status, CASE WHEN o.client_id=? THEN w.name ELSE c.name END other,
    (SELECT text FROM order_events e WHERE e.order_id=o.id AND e.type IN ('message','delivery','revision') ORDER BY e.id DESC LIMIT 1) last,
    (SELECT MAX(created_at) FROM order_events e WHERE e.order_id=o.id) at
    FROM orders o JOIN users c ON c.id=o.client_id JOIN users w ON w.id=o.worker_id
    WHERE o.client_id=? OR o.worker_id=? ORDER BY at DESC NULLS LAST`, req.user.id, req.user.id, req.user.id);
  res.render('messages', { title: 'Mensajes', threads });
});

// ---------- Notificaciones ----------
r.get('/notificaciones', requireAuth, (req, res) => {
  const notes = all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', req.user.id);
  run('UPDATE notifications SET read=1 WHERE user_id=?', req.user.id);
  res.render('notifications', { title: 'Notificaciones', notes });
});

// ---------- Billetera ----------
r.get('/billetera', requireAuth, (req, res) => {
  res.render('wallet', {
    title: 'Mi billetera',
    w: market.wallet(req.user.id),
    txs: all('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 50', req.user.id),
    withdrawals: all('SELECT * FROM withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT 20', req.user.id),
    spent: one("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE user_id=? AND status='paid'", req.user.id).v,
    commissions: one("SELECT COALESCE(SUM(commission_cents),0) v FROM orders WHERE worker_id=? AND status='completed'", req.user.id).v,
  });
});
r.post('/billetera/retiro', requireAuth, (req, res) => {
  const s = settings(), w = market.wallet(req.user.id), cents = toCents(req.body.amount);
  const method = ['paypal', 'nequi', 'bancolombia', 'banco', 'mercadopago'].includes(req.body.method) ? req.body.method : null;
  const account = clean(req.body.account, 200);
  const back = (m) => { req.flash('error', m); res.redirect('/billetera'); };
  if (!req.user.verified_id) return back('Debe verificar su identidad antes de retirar (Cuenta → Verificación).');
  if (!method || account.length < 5) return back('Indique el método y la cuenta de destino.');
  if (cents < s.min_withdraw_cents) return back(`El retiro mínimo es ${market.money(s.min_withdraw_cents)}.`);
  if (cents > w.available) return back('Saldo disponible insuficiente.');
  const wid = run('INSERT INTO withdrawals(user_id,amount_cents,method,account,created_at) VALUES (?,?,?,?,?)', req.user.id, cents, method, account, now()).lastInsertRowid;
  run('INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,?,?,?,?,?)', req.user.id, 'withdrawal', -cents, now(), `Retiro #${wid} (${method})`, now());
  run('UPDATE users SET payout_method=?, payout_account=? WHERE id=?', method, account, req.user.id);
  req.flash('ok', 'Solicitud de retiro registrada. Se procesa en 1 a 3 días hábiles.');
  res.redirect('/billetera');
});

// ---------- Cuenta ----------
r.get('/cuenta', requireAuth, (req, res) => res.render('account', { title: 'Mi cuenta' }));
r.post('/cuenta', requireAuth, (req, res) => {
  run('UPDATE users SET name=?, headline=?, bio=?, skills=?, languages=?, company=?, country=? WHERE id=?',
    clean(req.body.name, 80) || req.user.name, clean(req.body.headline, 100), market.filterContact(clean(req.body.bio, 2000)),
    clean(req.body.skills, 300), clean(req.body.languages, 200), clean(req.body.company, 100), clean(req.body.country, 2) || req.user.country, req.user.id);
  req.flash('ok', 'Perfil actualizado.');
  res.redirect('/cuenta');
});
r.post('/cuenta/clave', requireAuth, (req, res) => {
  if (!bcrypt.compareSync(String(req.body.current || ''), req.user.password_hash)) { req.flash('error', 'La contraseña actual no es correcta.'); return res.redirect('/cuenta'); }
  if (String(req.body.password || '').length < 8) { req.flash('error', 'La nueva contraseña debe tener al menos 8 caracteres.'); return res.redirect('/cuenta'); }
  run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(req.body.password, 10), req.user.id);
  req.flash('ok', 'Contraseña actualizada.');
  res.redirect('/cuenta');
});
r.post('/cuenta/verificacion', requireAuth, upload.single('document'), csrfMultipart, (req, res) => {
  if (!req.file) { req.flash('error', 'Adjunte una foto de su documento.'); return res.redirect('/cuenta'); }
  run('INSERT INTO reports(reporter_id,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?)', req.user.id, 'verification', req.user.id, req.file.filename, now());
  for (const a of all("SELECT id FROM users WHERE role='admin'")) market.notify(a.id, `Solicitud de verificación de ${req.user.name}`, '/admin/usuarios?verificar=1');
  req.flash('ok', 'Documento enviado. Lo revisaremos en 24 a 48 horas.');
  res.redirect('/cuenta');
});

// ---------- Planes ----------
r.post('/planes/:plan(pro|business)', requireAuth, (req, res) => {
  const s = settings(), plan = req.params.plan;
  const payId = payments.createPayment(req.user.id, 'plan', 0, `Plan ${plan.toUpperCase()} (30 días)`, plan === 'pro' ? s.plan_pro_cents : s.plan_business_cents);
  run('UPDATE payments SET meta=? WHERE id=?', JSON.stringify({ plan }), payId);
  res.redirect('/pagar/' + payId);
});

// ---------- Denuncias ----------
r.post('/reportar', requireAuth, (req, res) => {
  const type = ['task', 'gig', 'user', 'order'].includes(req.body.type) ? req.body.type : 'user';
  const reason = clean(req.body.reason, 1000);
  if (reason.length >= 5) run('INSERT INTO reports(reporter_id,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?)', req.user.id, type, int(req.body.id), reason, now());
  req.flash('ok', 'Gracias. Nuestro equipo revisará la denuncia.');
  res.redirect(/^\/[^/\\]/.test(req.body.back || '') ? req.body.back : '/');
});

module.exports = r;

const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { one, all, run, tx, now, settings, DATA_DIR } = require('../lib/db');
const market = require('../lib/market');
const payments = require('../lib/payments');
const geo = require('../lib/geo');
const limiter = require('../lib/limiter');
const tokens = require('../lib/tokens');
const mail = require('../lib/mail');
const credits = require('../lib/credits');
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
r.get('/tareas/nueva', requireAuth, (req, res) => res.render('task-form', { title: 'Publicar tarea', cats: cats(), form: { delivery_hours: 24, quantity: 1, mode: 'single', category_id: req.query.cat, modality: req.query.modalidad === 'presencial' ? 'presencial' : (req.query.modalidad === 'digital' ? 'digital' : ''), price_type: ['hourly', 'open'].includes(req.query.precio) ? req.query.precio : 'fixed', city: req.city || req.user.city || '', currency: 'COP' } }));
r.post('/tareas', requireAuth, upload.single('attachment'), csrfMultipart, (req, res) => {
  const s = settings();
  const form = {
    title: clean(req.body.title, 120), description: clean(req.body.description, 4000), category_id: int(req.body.category_id),
    budget: req.body.budget, currency: req.body.currency === 'USD' ? 'USD' : 'COP', delivery_hours: int(req.body.delivery_hours, 24),
    mode: req.body.mode === 'units' ? 'units' : 'single', quantity: Math.min(1000, Math.max(1, int(req.body.quantity, 1))), express: req.body.express ? 1 : 0,
    modality: req.body.modality === 'presencial' ? 'presencial' : 'digital', city: geo.resolve(req.body.city, req.body.city_sig), zone: clean(req.body.zone, 80),
    address: clean(req.body.address, 200), scheduled_at: clean(req.body.scheduled_at, 16),
    price_type: ['hourly', 'open'].includes(req.body.price_type) ? req.body.price_type : 'fixed', hours: Math.min(24, Math.max(0, int(req.body.hours, 0))),
  };
  // El presupuesto se puede escribir en pesos o en dólares; se guarda en centavos de USD.
  const raw = parseFloat(String(form.budget || '0').replace(/\./g, form.currency === 'COP' ? '' : '.').replace(',', '.')) || 0;
  const cents = form.currency === 'COP' ? Math.round(raw / (Number(s.usd_to_local) || 1) * 100) : Math.round(raw * 100);
  const err = (m) => res.status(400).render('task-form', { title: 'Publicar tarea', cats: cats(), form, error: m });
  const cat = one('SELECT * FROM categories WHERE id=?', form.category_id);
  if (form.title.length < 8) return err('El título debe tener al menos 8 caracteres.');
  if (form.description.length < 15) return err('Describa la tarea con al menos 15 caracteres.');
  if (!cat) return err('Seleccione una categoría.');
  if (cat.grp === 'presencial') form.modality = 'presencial';
  if (form.modality === 'presencial') {
    if (!form.city) return err('Busque y seleccione la ciudad donde se hará el trabajo.');
    if (form.zone.length < 3) return err('Indique el barrio o sector.');
    if (form.address.length < 5) return err('Indique la dirección. Solo la verá la persona que contrate.');
    if (form.mode === 'units') form.mode = 'single';
  }
  if (form.price_type === 'hourly' && (form.hours < 1)) return err('Indique cuántas horas necesita.');
  const total = form.price_type === 'hourly' ? cents * form.hours : cents;
  if (cents < s.min_task_cents && form.price_type !== 'hourly') return err(`El presupuesto mínimo es ${market.money(s.min_task_cents)} (unos $${Math.round(s.min_task_cents / 100 * s.usd_to_local).toLocaleString('es-CO')} COP).`);
  if (form.price_type === 'hourly' && total < s.min_task_cents) return err('El pago total (valor por hora × horas) está por debajo del mínimo.');
  if (total > 500000) return err('El presupuesto máximo por tarea es $5.000 USD.');
  if (form.delivery_hours < 1 || form.delivery_hours > 720) return err('Plazo de entrega no válido.');
  const id = run(`INSERT INTO tasks(client_id,category_id,title,description,budget_cents,delivery_hours,mode,quantity,express,attachment,attachment_name,modality,city,zone,address,scheduled_at,price_type,hours,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, req.user.id, form.category_id, market.safe(req.user.id, form.title), market.safe(req.user.id, form.description), total, form.delivery_hours,
  form.mode, form.mode === 'units' ? form.quantity : 1, form.express, req.file?.filename || null, req.file ? clean(req.file.originalname, 120) : null,
  form.modality, form.modality === 'presencial' ? form.city : '', form.modality === 'presencial' ? market.safe(req.user.id, form.zone) : '',
  form.modality === 'presencial' ? form.address : '', form.scheduled_at, form.price_type, form.price_type === 'hourly' ? form.hours : 0, now()).lastInsertRowid;
  req.flash('ok', 'Tarea publicada. Le avisaremos cuando reciba propuestas.');
  res.redirect('/tareas/' + id);
});

r.post('/tareas/:id(\\d+)/cerrar', requireAuth, (req, res) => {
  if (run("UPDATE tasks SET status='closed' WHERE id=? AND client_id=? AND status='open'", int(req.params.id), req.user.id).changes && credits.isOn()) credits.refundPendingForTask(int(req.params.id));
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
  if (t.modality === 'presencial' && !req.user.verified_id) { req.flash('error', 'Para trabajos presenciales debe verificar su identidad primero (Mi cuenta → Verificación). Es por la seguridad de todos.'); return res.redirect('/tareas/' + t.id); }
  if (t.modality === 'presencial' && t.city && req.city !== t.city) { req.flash('error', `Este trabajo es en persona en ${geo.shortName(t.city)}. Elige esa ciudad en "Tu ciudad" o en tu perfil si vives allí.`); return res.redirect('/tareas/' + t.id); }
  const msg = clean(req.body.message, 2000);
  const cents = toCents(req.body.price) || t.budget_cents;
  if (msg.length < 20) { req.flash('error', 'Escriba una propuesta de al menos 20 caracteres.'); return res.redirect('/tareas/' + t.id); }
  if (cents < settings().min_task_cents) { req.flash('error', 'Precio por debajo del mínimo permitido.'); return res.redirect('/tareas/' + t.id); }
  const today = one('SELECT COUNT(*) c FROM applications WHERE worker_id=? AND created_at > ?', req.user.id, now() - market.DAY).c;
  if (today >= market.MAX_APPLICATIONS_DAY) { req.flash('error', `Alcanzó el límite de ${market.MAX_APPLICATIONS_DAY} postulaciones diarias. Mañana podrá enviar más.`); return res.redirect('/tareas/' + t.id); }
  // Modelo de créditos: el costo depende de lo que vale el trabajo y solo se queda la plataforma si te eligen (si no, se devuelve).
  const cost = credits.isOn() ? credits.offerCost(t.budget_cents || cents) : 0;
  const maxOffers = Math.max(1, Number(settings().max_offers_per_task) || 8);
  if (cost && credits.balance(req.user.id) < cost) { req.flash('error', `Esta oferta cuesta ${cost} crédito${cost > 1 ? 's' : ''} y no te alcanza. Compra créditos y vuelve.`); return res.redirect('/creditos'); }
  try {
    tx(() => {
      // Se vuelve a comprobar todo dentro de la misma operación: la tarea sigue abierta y quedan cupos. Así no se paga en vano.
      if (!one("SELECT 1 x FROM tasks WHERE id=? AND status='open'", t.id)) throw new Error('CLOSED');
      if (cost && one("SELECT COUNT(*) c FROM applications WHERE task_id=? AND status='pending'", t.id).c >= maxOffers) throw new Error('FULL');
      const aid = run('INSERT INTO applications(task_id,worker_id,message,price_cents,credit_spent,created_at) VALUES (?,?,?,?,?,?)', t.id, req.user.id, market.safe(req.user.id, msg), cents, cost, now()).lastInsertRowid;
      if (cost && !credits.spend(req.user.id, cost, 'Oferta enviada: ' + t.title.slice(0, 60), Number(aid))) throw new Error('NO_CREDITS');
    });
  } catch (e) {
    if (e.message === 'NO_CREDITS') { req.flash('error', 'No tienes créditos suficientes para enviar la oferta.'); return res.redirect('/creditos'); }
    if (e.message === 'CLOSED') { req.flash('error', 'Esta tarea ya no está disponible. No se te cobró nada.'); return res.redirect('/explorar'); }
    if (e.message === 'FULL') { req.flash('error', `Esta tarea ya tiene el máximo de ${maxOffers} ofertas. No se te cobró nada.`); return res.redirect('/tareas/' + t.id); }
    req.flash('error', 'Ya se postuló a esta tarea.'); return res.redirect('/tareas/' + t.id);
  }
  market.notify(t.client_id, `${req.user.name} se postuló a "${t.title}"`, '/tareas/' + t.id);
  req.flash('ok', cost ? `Oferta enviada (${cost} crédito${cost > 1 ? 's' : ''} reservado${cost > 1 ? 's' : ''}). Solo pagas si te eligen: si no te eligen o no responden en ${Number(settings().credit_refund_days) || 7} días, se te devuelven.` : 'Postulación enviada.');
  res.redirect('/tareas/' + t.id);
});

r.post('/postulaciones/:id(\\d+)/retirar', requireAuth, (req, res) => {
  run("DELETE FROM applications WHERE id=? AND worker_id=? AND status='pending'", int(req.params.id), req.user.id);
  res.redirect('/postulaciones');
});

r.post('/postulaciones/:id(\\d+)/aceptar', requireAuth, (req, res, next) => {
  const a = one(`SELECT a.*, t.client_id, t.title, t.delivery_hours, t.status tstatus, t.id tid, t.modality FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.id=?`, int(req.params.id));
  if (!a || a.client_id !== req.user.id) return next(fail(404, 'Postulación no encontrada.'));
  if (a.tstatus !== 'open' || a.status !== 'pending') return next(fail(400, 'Esta postulación ya no está disponible.'));
  if (credits.isOn()) {
    // Modelo de créditos: el cliente da su contacto y se pone de acuerdo directo con quien elige. La plataforma no maneja el pago.
    const contact = clean(req.body.contact, 300);
    if (contact.length < 5) { req.flash('error', 'Escribe cómo quieres que te contacte esta persona (WhatsApp, correo o teléfono).'); return res.redirect('/tareas/' + a.tid); }
    const done = tx(() => {
      if (!run("UPDATE applications SET status='accepted', client_contact=? WHERE id=? AND status='pending'", contact, a.id).changes) return false;
      run("UPDATE tasks SET status='hired' WHERE id=? AND status='open'", a.tid);
      // A las demás ofertas se les devuelven los créditos: no pagan si no los eligen.
      for (const o of all("SELECT id, worker_id, credit_spent FROM applications WHERE task_id=? AND status='pending'", a.tid)) { credits.refundOfferInTx(o, { status: 'rejected', text: 'No fuiste elegido: créditos devueltos' }); market.notify(o.worker_id, `La tarea "${a.title}" ya tiene a la persona elegida. Te devolvimos tus créditos.`, '/postulaciones'); }
      return true;
    });
    if (!done) return next(fail(400, 'Esta postulación ya no está disponible.'));
    market.notify(a.worker_id, `¡Te eligieron para "${a.title}"! Contacta al cliente: ${contact}`, '/postulaciones');
    req.flash('ok', 'Listo. Le avisamos a la persona elegida y recibió tu contacto. Pónganse de acuerdo directamente.');
    return res.redirect('/tareas/' + a.tid);
  }
  const existing = one("SELECT * FROM orders WHERE application_id=? AND status='pending_payment'", a.id);
  if (existing) { const p = one("SELECT id FROM payments WHERE purpose='order' AND ref_id=? AND status='pending'", existing.id); return res.redirect('/pagar/' + p.id); }
  const { payId } = market.createOrder({ taskId: a.tid, applicationId: a.id, clientId: req.user.id, workerId: a.worker_id, title: a.title, amountCents: a.price_cents, deliveryHours: a.delivery_hours, modality: a.modality });
  res.redirect('/pagar/' + payId);
});

r.post('/postulaciones/:id(\\d+)/rechazar', requireAuth, (req, res) => {
  const a = one('SELECT a.*, t.client_id, t.title FROM applications a JOIN tasks t ON t.id=a.task_id WHERE a.id=?', int(req.params.id));
  if (a && a.client_id === req.user.id && a.status === 'pending') {
    if (credits.isOn()) credits.refundOffer(a, { status: 'rejected', text: 'Oferta no elegida: créditos devueltos' });
    else run("UPDATE applications SET status='rejected' WHERE id=?", a.id);
    market.notify(a.worker_id, `Su postulación a "${a.title}" no fue seleccionada.${credits.isOn() ? ' Te devolvimos tus créditos.' : ''}`, '/postulaciones');
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
  if (count >= market.MAX_ACTIVE_GIGS) return err(`Alcanzó el máximo de ${market.MAX_ACTIVE_GIGS} servicios activos. Pause o elimine alguno para publicar otro.`);
  const id = run('INSERT INTO gigs(worker_id,category_id,title,description,price_cents,delivery_hours,revisions,created_at) VALUES (?,?,?,?,?,?,?,?)',
    req.user.id, form.category_id, market.safe(req.user.id, form.title), market.safe(req.user.id, form.description), cents, form.delivery_hours, form.revisions, now()).lastInsertRowid;
  req.flash('ok', 'Servicio publicado.');
  res.redirect('/servicios/' + id);
});
r.post('/servicios/:id(\\d+)/pausar', requireAuth, (req, res) => {
  run("UPDATE gigs SET status=CASE status WHEN 'active' THEN 'paused' ELSE 'active' END WHERE id=? AND worker_id=?", int(req.params.id), req.user.id);
  res.redirect('/servicios/' + req.params.id);
});
r.post('/servicios/:id(\\d+)/comprar', requireAuth, (req, res, next) => {
  if (credits.isOn()) { req.flash('error', 'Para contratar, publica una tarea y recibe ofertas de varios profesionales: es gratis.'); return res.redirect('/tareas/nueva'); }
  const g = one("SELECT * FROM gigs WHERE id=? AND status='active'", int(req.params.id));
  if (!g) return next(fail(404, 'Servicio no disponible.'));
  if (g.worker_id === req.user.id) return next(fail(400, 'No puede comprar su propio servicio.'));
  const { orderId, payId } = market.createOrder({ gigId: g.id, clientId: req.user.id, workerId: g.worker_id, title: g.title, amountCents: g.price_cents, deliveryHours: g.delivery_hours, maxRevisions: g.revisions });
  const brief = clean(req.body.brief, 2000);
  if (brief) market.event(orderId, req.user.id, 'message', market.safe(req.user.id, brief));
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
  const task = o.task_id ? one('SELECT modality, city, zone, address, scheduled_at FROM tasks WHERE id=?', o.task_id) : null;
  const dispute = one('SELECT * FROM disputes WHERE order_id=? ORDER BY id DESC', o.id);
  res.render('order', { title: `Pedido #${o.id}`, o, role, task, events, payment, review, dispute, commission: market.commissionFor(o.worker_id, o.amount_cents) });
});

r.post('/pedidos/:id(\\d+)/mensaje', requireAuth, upload.single('file'), csrfMultipart, (req, res) => {
  const { o, role } = getOrder(req);
  const text = market.safe(req.user.id, clean(req.body.text, 3000));
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
  const text = market.safe(req.user.id, clean(req.body.text, 3000));
  if (!text && !req.file) { req.flash('error', 'Adjunte un archivo o describa la entrega.'); return res.redirect('/pedidos/' + o.id); }
  run("UPDATE orders SET status='delivered', delivered_at=? WHERE id=?", now(), o.id);
  market.event(o.id, req.user.id, 'delivery', text || 'Entrega realizada.', req.file?.filename, req.file && clean(req.file.originalname, 120));
  market.notify(o.client_id, `Recibió una entrega en "${o.title}". Revísela y apruébela.`, `/pedidos/${o.id}`);
  req.flash('ok', 'Entrega enviada al cliente.');
  res.redirect('/pedidos/' + o.id);
});

r.post('/pedidos/:id(\\d+)/codigo', requireAuth, (req, res, next) => {
  const { o, role } = getOrder(req);
  if (role !== 'worker' || o.modality !== 'presencial' || !['in_progress', 'revision', 'delivered'].includes(o.status)) return next(fail(400, 'No es posible cerrar este pedido ahora.'));
  const k = `code:${o.id}`, tries = (req.session[k] || 0) + 1; req.session[k] = tries;
  if (tries > 5) { req.flash('error', 'Demasiados intentos. Pida al cliente que apruebe el trabajo desde su cuenta.'); return res.redirect('/pedidos/' + o.id); }
  if (String(req.body.code || '').trim() !== String(o.done_code)) { req.flash('error', 'Código incorrecto. Pídale al cliente el código de cierre de 4 dígitos.'); return res.redirect('/pedidos/' + o.id); }
  delete req.session[k];
  run("UPDATE orders SET status='delivered', delivered_at=? WHERE id=?", now(), o.id);
  market.event(o.id, req.user.id, 'delivery', 'Trabajo terminado y confirmado con el código de cierre del cliente.');
  market.completeOrder(o.id, req.user.id);
  market.notify(o.client_id, `Trabajo terminado: "${o.title}". Califica al ayudante.`, `/pedidos/${o.id}`);
  req.flash('ok', 'Trabajo cerrado. El pago quedó liberado en tu billetera.');
  res.redirect('/pedidos/' + o.id);
});

// Volver a contratar a la misma persona (solo el cliente de un pedido completado). Crea un pedido nuevo con tarifa reducida.
const rehireLimit = new Map();
setInterval(() => rehireLimit.clear(), 60 * 60000).unref();
r.post('/pedidos/:id(\\d+)/recontratar', requireAuth, (req, res, next) => {
  const { o, role } = getOrder(req);
  if (role !== 'client' || o.status !== 'completed') return next(fail(400, 'Solo puede volver a contratar desde un pedido completado.'));
  const worker = one("SELECT id, status FROM users WHERE id=?", o.worker_id);
  if (!worker || worker.status !== 'active') return next(fail(400, 'Esta persona ya no está disponible.'));
  const n = (rehireLimit.get(req.user.id) || 0) + 1; rehireLimit.set(req.user.id, n);
  if (n > 20) return next(fail(429, 'Demasiadas solicitudes. Intente más tarde.'));
  const s = settings();
  const title = market.safe(req.user.id, clean(req.body.title, 120));
  const desc = market.safe(req.user.id, clean(req.body.description, 2000));
  const cur = req.body.currency === 'USD' ? 'USD' : 'COP';
  const raw = parseFloat(String(req.body.price || '0').replace(/\./g, cur === 'COP' ? '' : '.').replace(',', '.')) || 0;
  const cents = cur === 'COP' ? Math.round(raw / (Number(s.usd_to_local) || 1) * 100) : Math.round(raw * 100);
  const hrs = Math.min(720, Math.max(1, int(req.body.hours, o.delivery_hours)));
  if (title.length < 5) { req.flash('error', 'Escriba qué necesita esta vez.'); return res.redirect(`/pedidos/${o.id}#recontratar`); }
  if (cents < s.min_task_cents || cents > 500000) { req.flash('error', 'Valor fuera del rango permitido.'); return res.redirect(`/pedidos/${o.id}#recontratar`); }
  let taskId = null;
  if (o.modality === 'presencial' && o.task_id) {
    // Copia privada de la tarea original (misma dirección), no visible en búsquedas.
    const t = one('SELECT * FROM tasks WHERE id=?', o.task_id);
    taskId = Number(run(`INSERT INTO tasks(client_id,category_id,title,description,budget_cents,delivery_hours,modality,city,zone,address,scheduled_at,status,filled,created_at)
      VALUES (?,?,?,?,?,?,'presencial',?,?,?,?,'closed',1,?)`, req.user.id, t.category_id, title, desc || title, cents, hrs, t.city, t.zone,
    clean(req.body.address, 200) || t.address, clean(req.body.scheduled_at, 16), now()).lastInsertRowid);
  }
  const { orderId, payId } = market.createOrder({ taskId, clientId: req.user.id, workerId: o.worker_id, title, amountCents: cents, deliveryHours: hrs, modality: o.modality, rehire: true });
  if (desc) market.event(orderId, req.user.id, 'message', desc);
  market.event(orderId, null, 'system', `Recontratación desde el pedido #${o.id}. Tarifa de servicio reducida a la mitad.`);
  market.notify(o.worker_id, `${req.user.name.split(' ')[0]} quiere volver a contratarte: "${title}"`, `/pedidos/${orderId}`);
  res.redirect('/pagar/' + payId);
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
  const text = market.safe(req.user.id, clean(req.body.text, 2000));
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
    run('INSERT INTO reviews(order_id,reviewer_id,worker_id,rating,comment,created_at) VALUES (?,?,?,?,?,?)', o.id, req.user.id, o.worker_id, rating, market.safe(req.user.id, clean(req.body.comment, 1000)), now());
    market.notify(o.worker_id, `Recibió una calificación de ${rating} estrellas.`, `/perfil/${o.worker_id}`);
  } catch { /* ya calificado */ }
  res.redirect('/pedidos/' + o.id);
});

// Archivos privados: solo participantes del pedido o administradores.
r.get('/archivos/:name', requireAuth, (req, res, next) => {
  const name = path.basename(req.params.name);
  const ev = one('SELECT e.file_name, o.client_id, o.worker_id FROM order_events e JOIN orders o ON o.id=e.order_id WHERE e.file=?', name);
  // Adjunto de tarea: visible mientras la tarea está abierta (así los interesados lo ven antes de postular);
  // después solo el dueño, quienes postularon, quien fue contratado y el administrador.
  const task = one('SELECT id, client_id, status, attachment_name name FROM tasks WHERE attachment=?', name);
  const taskOk = task && (task.status === 'open' || task.client_id === req.user.id
    || one('SELECT 1 x FROM applications WHERE task_id=? AND worker_id=?', task.id, req.user.id)
    || one('SELECT 1 x FROM orders WHERE task_id=? AND (client_id=? OR worker_id=?)', task.id, req.user.id, req.user.id));
  const allowed = req.user.role === 'admin' || taskOk || (ev && [ev.client_id, ev.worker_id].includes(req.user.id));
  const file = path.join(DATA_DIR, 'uploads', name);
  if (!allowed || !fs.existsSync(file)) return next(fail(404, 'Archivo no disponible.'));
  res.download(file, ev?.file_name || task?.name || name);
});

// ---------- Preguntas públicas (antes de contratar no hay chat privado) ----------
const targetOf = (type, id) => type === 'gig'
  ? one("SELECT id, worker_id owner_id, title, 'gig' type FROM gigs WHERE id=?", id)
  : one("SELECT id, client_id owner_id, title, 'task' type FROM tasks WHERE id=?", id);
const targetUrl = (q) => `/${q.target_type === 'gig' ? 'servicios' : 'tareas'}/${q.target_id}#preguntas`;

r.post('/preguntas', requireAuth, (req, res, next) => {
  const type = req.body.type === 'gig' ? 'gig' : 'task';
  const t = targetOf(type, int(req.body.id));
  if (!t) return next(fail(404, 'Publicación no encontrada.'));
  if (t.owner_id === req.user.id) return next(fail(400, 'No puede preguntar en su propia publicación.'));
  const text = market.safe(req.user.id, clean(req.body.text, 600));
  if (text.length < 5) { req.flash('error', 'Escriba su pregunta.'); return res.redirect(targetUrl({ target_type: type, target_id: t.id })); }
  run('INSERT INTO questions(target_type,target_id,asker_id,text,created_at) VALUES (?,?,?,?,?)', type, t.id, req.user.id, text, now());
  market.notify(t.owner_id, `Nueva pregunta en "${t.title}"`, targetUrl({ target_type: type, target_id: t.id }));
  req.flash('ok', 'Pregunta publicada. Le avisaremos cuando la respondan.');
  res.redirect(targetUrl({ target_type: type, target_id: t.id }));
});

// El dueño responde en público. En un servicio puede adjuntar una oferta personalizada que el cliente paga con un clic.
r.post('/preguntas/:id(\\d+)/responder', requireAuth, (req, res, next) => {
  const q = one('SELECT * FROM questions WHERE id=?', int(req.params.id));
  const t = q && targetOf(q.target_type, q.target_id);
  if (!t || t.owner_id !== req.user.id) return next(fail(404, 'Pregunta no encontrada.'));
  const answer = market.safe(req.user.id, clean(req.body.answer, 1000));
  if (answer.length < 2) { req.flash('error', 'Escriba una respuesta.'); return res.redirect(targetUrl(q)); }
  let orderId = q.order_id;
  const cents = toCents(req.body.offer_price);
  if (q.target_type === 'gig' && cents && !orderId) {
    if (cents < settings().min_task_cents) { req.flash('error', `La oferta mínima es ${market.money(settings().min_task_cents)}.`); return res.redirect(targetUrl(q)); }
    const hrs = Math.min(720, Math.max(1, int(req.body.offer_hours, 24)));
    orderId = market.createOrder({ gigId: t.id, clientId: q.asker_id, workerId: req.user.id, title: `${t.title} (oferta personalizada)`, amountCents: cents, deliveryHours: hrs }).orderId;
  }
  run('UPDATE questions SET answer=?, answered_at=COALESCE(answered_at, ?), order_id=? WHERE id=?', answer, now(), orderId || null, q.id);
  market.notify(q.asker_id, orderId && !q.order_id ? `Recibió una oferta personalizada en "${t.title}"` : `Respondieron su pregunta en "${t.title}"`, targetUrl(q));
  res.redirect(targetUrl(q));
});

// ---------- Mensajes ----------
r.get('/mensajes', requireAuth, (req, res) => {
  const threads = all(`SELECT o.id, o.title, o.status, CASE WHEN o.client_id=? THEN w.name ELSE c.name END other,
    (SELECT text FROM order_events e WHERE e.order_id=o.id AND e.type IN ('message','delivery','revision') ORDER BY e.id DESC LIMIT 1) last,
    (SELECT MAX(created_at) FROM order_events e WHERE e.order_id=o.id) at
    FROM orders o JOIN users c ON c.id=o.client_id JOIN users w ON w.id=o.worker_id
    WHERE o.client_id=? OR o.worker_id=? ORDER BY at DESC NULLS LAST`, req.user.id, req.user.id, req.user.id);
  const questions = all(`SELECT q.*, COALESCE(g.title, t.title) title FROM questions q
    LEFT JOIN gigs g ON q.target_type='gig' AND g.id=q.target_id LEFT JOIN tasks t ON q.target_type='task' AND t.id=q.target_id
    WHERE q.asker_id=? OR COALESCE(g.worker_id, t.client_id)=? ORDER BY q.created_at DESC LIMIT 30`, req.user.id, req.user.id);
  res.render('messages', { title: 'Mensajes', threads, questions });
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
  const fee = Math.max(0, Number(s.withdraw_fee_cents) || 0); // costo del retiro: lo paga quien retira, se descuenta del importe
  if (cents <= fee) return back(`El importe debe ser mayor al costo del retiro (${market.money(fee)}).`);
  if (!limiter.take('withdraw:' + req.user.id, 5, 24 * 60 * 60000)) return back('Alcanzó el máximo de solicitudes de retiro por hoy. Intente mañana.');
  // Atómico: el saldo se vuelve a calcular dentro de la misma transacción que reserva el dinero (no se puede gastar dos veces).
  const ok = tx(() => {
    if (cents > market.wallet(req.user.id).available) return false;
    const wid = run('INSERT INTO withdrawals(user_id,amount_cents,fee_cents,method,account,created_at) VALUES (?,?,?,?,?,?)', req.user.id, cents, fee, method, account, now()).lastInsertRowid;
    run('INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,?,?,?,?,?)', req.user.id, 'withdrawal', -cents, now(), `Retiro #${wid} (${method})`, now());
    run('UPDATE users SET payout_method=?, payout_account=? WHERE id=?', method, account, req.user.id);
    return true;
  });
  if (!ok) return back('Saldo disponible insuficiente.');
  req.flash('ok', fee > 0 ? `Solicitud de retiro registrada. Recibirás ${market.money(cents - fee)} (costo del retiro ${market.money(fee)}). Se paga los ${s.payout_days_text}.` : `Solicitud de retiro registrada. Se paga los ${s.payout_days_text}.`);
  res.redirect('/billetera');
});

// ---------- Cuenta ----------
r.get('/cuenta', requireAuth, (req, res) => res.render('account', { title: 'Mi cuenta' }));
r.post('/cuenta', requireAuth, (req, res) => {
  run('UPDATE users SET city=?, zone=?, availability=?, works_presencial=? WHERE id=?', geo.resolve(req.body.city, req.body.city_sig), market.safe(req.user.id, clean(req.body.zone, 80)), market.safe(req.user.id, clean(req.body.availability, 200)), req.body.works_presencial ? 1 : 0, req.user.id);
  run('UPDATE users SET name=?, headline=?, bio=?, skills=?, languages=?, company=?, country=? WHERE id=?',
    clean(req.body.name, 80) || req.user.name, market.safe(req.user.id, clean(req.body.headline, 100)), market.safe(req.user.id, clean(req.body.bio, 2000)),
    market.safe(req.user.id, clean(req.body.skills, 300)), clean(req.body.languages, 200), market.safe(req.user.id, clean(req.body.company, 100)), clean(req.body.country, 2) || req.user.country, req.user.id);
  req.flash('ok', 'Perfil actualizado.');
  res.redirect('/cuenta');
});
r.post('/cuenta/correo', requireAuth, (req, res) => {
  if (req.user.email_verified) { req.flash('ok', 'Tu correo ya está confirmado.'); return res.redirect('/cuenta'); }
  if (!mail.configured()) { req.flash('error', 'El envío de correos no está disponible por ahora.'); return res.redirect('/cuenta'); }
  if (!limiter.take('verify:' + req.user.id, 3, 60 * 60000)) { req.flash('error', 'Ya enviamos varios mensajes. Revisa tu bandeja (y spam) o intenta en una hora.'); return res.redirect('/cuenta'); }
  mail.sendVerify(req.user, tokens.create(req.user.id, 'verify', 48 * 3600000));
  req.flash('ok', 'Te enviamos un enlace de confirmación. Revisa tu correo (y la carpeta de spam).');
  res.redirect('/cuenta');
});
r.post('/cuenta/avisos', requireAuth, (req, res) => {
  run('UPDATE users SET notify_email=? WHERE id=?', req.body.notify_email === '1' ? 1 : 0, req.user.id);
  req.flash('ok', 'Preferencia de avisos guardada.');
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

// ---------- Créditos ----------
r.get('/creditos', requireAuth, (req, res) => {
  res.render('credits', { title: 'Mis créditos', balance: credits.balance(req.user.id), packs: credits.packs(), history: credits.history(req.user.id), cost: credits.offerCost(), on: credits.isOn(), refundDays: Number(settings().credit_refund_days) || 7 });
});
r.post('/creditos/comprar/:n(\\d)', requireAuth, (req, res, next) => {
  const pack = credits.packs().find((x) => x.n === Number(req.params.n));
  if (!credits.isOn() || !pack) return next(fail(404, 'Paquete no disponible.'));
  const payId = payments.createPayment(req.user.id, 'credits', pack.n, `${pack.credits} créditos`, pack.cents);
  run('UPDATE payments SET meta=? WHERE id=?', JSON.stringify({ credits: pack.credits }), payId);
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

// ---------- Soporte para usuarios ----------
r.get('/soporte', requireAuth, (req, res) => res.render('support', { title: 'Soporte', tickets: all('SELECT * FROM tickets WHERE user_id=? ORDER BY updated_at DESC', req.user.id) }));
r.post('/soporte', requireAuth, (req, res) => {
  const subject = clean(req.body.subject, 120), text = clean(req.body.text, 4000);
  if (subject.length < 4 || text.length < 10) { req.flash('error', 'Escriba un asunto y describa su consulta.'); return res.redirect('/soporte'); }
  const id = run('INSERT INTO tickets(user_id,subject,created_at,updated_at) VALUES (?,?,?,?)', req.user.id, subject, now(), now()).lastInsertRowid;
  run('INSERT INTO ticket_messages(ticket_id,user_id,text,created_at) VALUES (?,?,?,?)', id, req.user.id, text, now());
  for (const a of all("SELECT id FROM users WHERE role='admin'")) market.notify(a.id, `Nuevo ticket de soporte: ${subject}`, `/admin/soporte?id=${id}`);
  req.flash('ok', 'Recibimos su consulta. Le responderemos pronto.');
  res.redirect('/soporte/' + id);
});
r.get('/soporte/:id(\\d+)', requireAuth, (req, res, next) => {
  const tk = one('SELECT * FROM tickets WHERE id=? AND user_id=?', int(req.params.id), req.user.id);
  if (!tk) return next(fail(404, 'Consulta no encontrada.'));
  res.render('ticket', { title: tk.subject, tk, msgs: all('SELECT m.*, u.name FROM ticket_messages m JOIN users u ON u.id=m.user_id WHERE ticket_id=? ORDER BY m.id', tk.id) });
});
r.post('/soporte/:id(\\d+)', requireAuth, (req, res, next) => {
  const tk = one('SELECT * FROM tickets WHERE id=? AND user_id=?', int(req.params.id), req.user.id);
  if (!tk) return next(fail(404, 'Consulta no encontrada.'));
  const text = clean(req.body.text, 4000);
  if (text) {
    run('INSERT INTO ticket_messages(ticket_id,user_id,text,created_at) VALUES (?,?,?,?)', tk.id, req.user.id, text, now());
    run("UPDATE tickets SET status='open', updated_at=? WHERE id=?", now(), tk.id);
    for (const a of all("SELECT id FROM users WHERE role='admin'")) market.notify(a.id, `Respuesta en ticket: ${tk.subject}`, `/admin/soporte?id=${tk.id}`);
  }
  res.redirect('/soporte/' + tk.id);
});
// Volver a la cuenta de administrador después de "Entrar como usuario".
r.post('/volver-admin', (req, res) => {
  if (req.session.adminId) { req.session.userId = req.session.adminId; delete req.session.adminId; }
  res.redirect('/admin/usuarios');
});

module.exports = r;

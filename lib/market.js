// Reglas del negocio: tarifas, pagos, entregas, liberación de dinero y billetera.
const { one, all, run, tx, now, settings } = require('./db');
const payments = require('./payments');

// Límites contra el spam, iguales para todos.
const MAX_APPLICATIONS_DAY = 30, MAX_ACTIVE_GIGS = 15;
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

function money(cents) {
  const v = (Number(cents) || 0) / 100;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
}

// rehire = recontratar a la misma persona por la plataforma: la tarifa al cliente baja a la mitad.
function clientFee(amountCents, clientId, rehire = false) {
  const s = settings();
  if (!(s.client_fee_pct > 0)) return 0; // sin tarifa al cliente: paga exactamente el precio publicado
  const pct = rehire ? s.client_fee_pct / 2 : s.client_fee_pct, min = rehire ? Math.round(s.client_fee_min_cents / 2) : s.client_fee_min_cents;
  return Math.max(min, Math.round(amountCents * pct / 100));
}

function commissionFor(workerId, amountCents) {
  const s = settings();
  // Porcentaje único con un mínimo opcional (cubre la tarifa fija de las pasarelas en trabajos baratos); nunca más que el trabajo.
  return Math.min(amountCents, Math.max(Number(s.commission_min_cents) || 0, Math.round(amountCents * s.commission_pct / 100)));
}

// Costo estimado de la pasarela (en centavos de USD) para cobrar un monto. Solo informativo (calculadora del panel).
function gatewayCost(provider, amountCents) {
  const s = settings(), rate = Number(s.usd_to_local) || 1;
  if (provider === 'paypal') return Math.round(amountCents * s.gw_pp_pct / 100 + Number(s.gw_pp_fixed_cents));
  const local = amountCents / 100 * rate; // monto en la moneda de Mercado Pago
  return Math.round(((local * s.gw_mp_pct / 100 + Number(s.gw_mp_fixed_cop)) * (1 + s.gw_mp_iva_pct / 100)) / rate * 100);
}

function notify(userId, text, link) {
  run('INSERT INTO notifications(user_id,text,link,created_at) VALUES (?,?,?,?)', userId, text, link || null, now());
  require('./mail').notifyUser(userId, text, link); // copia por correo (si está verificado y activado)
}

function event(orderId, userId, type, text, file, fileName) {
  run('INSERT INTO order_events(order_id,user_id,type,text,file,file_name,created_at) VALUES (?,?,?,?,?,?,?)',
    orderId, userId, type, text || null, file || null, fileName || null, now());
}

// ---------- Protección contra contacto externo ----------
const HIDDEN = '[dato de contacto oculto]';
const NUM_WORDS = { cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };

// Oculta correos, teléfonos, enlaces y redes; devuelve también si encontró algo.
function scanContact(text) {
  let hit = false;
  const rep = (re) => { out = out.replace(re, () => { hit = true; return HIDDEN; }); };
  let out = String(text || '');
  rep(/[\w.+-]+\s*(@|\(at\)|\[at\]|\barroba\b)\s*[\w-]+\s*(\.|\bpunto\b)\s*[a-z]{2,}(\s*(\.|\bpunto\b)\s*[a-z]{2,})?/gi);
  rep(/(https?:\/\/|www\.)\S+/gi);
  rep(/\b(wa\.me|t\.me|bit\.ly|linktr\.ee)\S*/gi);
  rep(/\b(whats?\s*app|wsp|wasap|guasap|telegram|signal|instagram|insta|facebook|messenger|tiktok|skype|discord|zoom|gmail|hotmail|outlook|yahoo|celular|cel\.|tel[eé]fono|n[uú]mero de contacto|ll[aá]mame|escr[ií]beme al)\b/gi);
  rep(/(^|\s)@[a-z0-9_.]{3,}/gi);
  // Teléfonos: 7 o más dígitos, aunque estén separados o escritos con palabras ("tres cero cero...").
  const money = /(\$\s?[\d.,]+|[\d.,]+\s?(usd|cop|mxn|eur|pesos|d[oó]lares|mil)\b)/gi;
  const norm = out.replace(money, ' ').toLowerCase()
    .replace(/\b(cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g, (w) => NUM_WORDS[w]);
  if (/(\d[\s().\-_/]*){7,}/.test(norm)) {
    const before = out;
    out = out.replace(/(\+?\d[\d\s().\-_/]{5,}\d)/g, (m) => (m.replace(/\D/g, '').length >= 7 && !/^\$/.test(m) ? HIDDEN : m));
    hit = true;
    if (before === out) out = 'Mensaje bloqueado: parece contener datos de contacto. Toda la comunicación debe hacerse dentro de ' + settings().site_name + '.';
  }
  return { text: out, hit };
}
function filterContact(text) { return scanContact(text).text; }

// Bloquea el envío si hay datos de contacto (modelo Mercado Libre) y registra el intento.
// 3 intentos = baja reputación y visibilidad + alerta al admin; 5 = cuenta pausada automáticamente.
function safe(userId, text) {
  const { text: out, hit } = scanContact(text);
  if (!hit) return out;
  if (userId) {
    run('UPDATE users SET strikes = strikes + 1 WHERE id=?', userId);
    const n = one('SELECT strikes FROM users WHERE id=?', userId).strikes;
    notify(userId, `Aviso ${n} de 5: intentaste compartir datos de contacto. Con 3 avisos baja tu reputación y visibilidad; con 5 tu cuenta se pausa.`, '/seguridad');
    if (n === 3 || n >= 5) for (const a of all("SELECT id FROM users WHERE role='admin'")) notify(a.id, `Usuario #${userId} acumula ${n} intentos de compartir contacto${n >= 5 ? ' (cuenta pausada)' : ''}.`, '/admin/usuarios?alertas=1');
    if (n >= 5) run("UPDATE users SET status='suspended' WHERE id=? AND role!='admin'", userId);
  }
  const e = new Error('No se envió: el texto contiene datos de contacto (teléfono, correo, enlace o red social). Toda la comunicación y el pago deben hacerse dentro de ' + settings().site_name + '.');
  e.code = 'CONTACT'; e.status = 400; e.expose = true;
  throw e;
}

// Crea un pedido pendiente de pago y su cobro asociado.
function createOrder({ taskId = null, gigId = null, applicationId = null, clientId, workerId, title, amountCents, deliveryHours, maxRevisions, modality = 'digital', rehire = false }) {
  const fee = clientFee(amountCents, clientId, rehire);
  const r = run(`INSERT INTO orders(task_id,gig_id,application_id,client_id,worker_id,title,amount_cents,client_fee_cents,delivery_hours,max_revisions,modality,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, taskId, gigId, applicationId, clientId, workerId, title, amountCents, fee, deliveryHours,
  maxRevisions ?? settings().max_revisions, modality === 'presencial' ? 'presencial' : 'digital', now());
  const orderId = Number(r.lastInsertRowid);
  const payId = payments.createPayment(clientId, 'order', orderId, `Pedido #${orderId}: ${title}`, amountCents + fee);
  return { orderId, payId };
}

// Se ejecuta cuando el proveedor confirma un pago (idempotente).
function markPaid(paymentId) {
  return tx(() => {
    const p = one('SELECT * FROM payments WHERE id=?', paymentId);
    if (!p || p.status === 'paid') return p;
    run('UPDATE payments SET status=?, paid_at=? WHERE id=?', 'paid', now(), p.id);
    if (p.purpose === 'order') {
      const o = one('SELECT * FROM orders WHERE id=?', p.ref_id);
      if (o && o.status === 'pending_payment') {
        run('UPDATE orders SET status=?, paid_at=?, due_at=? WHERE id=?', 'in_progress', now(), now() + o.delivery_hours * HOUR, o.id);
        event(o.id, null, 'system', 'Pago confirmado y protegido. El trabajo puede comenzar.');
        if (o.modality === 'presencial') {
          // Código de cierre: el cliente se lo da al ayudante solo cuando el trabajo quedó hecho.
          run('UPDATE orders SET done_code=? WHERE id=?', String(require('crypto').randomInt(1000, 10000)), o.id);
          event(o.id, null, 'system', 'Trabajo presencial: al terminar, el cliente entrega su código de cierre de 4 dígitos al ayudante para liberar el pago.');
        }
        notify(o.worker_id, `Nuevo pedido pagado: ${o.title}`, `/pedidos/${o.id}`);
        notify(o.client_id, `Tu pago fue confirmado: ${o.title}`, `/pedidos/${o.id}`);
        if (o.application_id) run('UPDATE applications SET status=? WHERE id=?', 'accepted', o.application_id);
        if (o.task_id) {
          const t = one('SELECT * FROM tasks WHERE id=?', o.task_id);
          const filled = t.filled + 1;
          run('UPDATE tasks SET filled=? WHERE id=?', filled, t.id);
          if (t.mode === 'single' || filled >= t.quantity) {
            run('UPDATE tasks SET status=? WHERE id=?', 'closed', t.id);
            run("UPDATE applications SET status='rejected' WHERE task_id=? AND status='pending'", t.id);
          }
        }
      }
    } else if (p.purpose === 'grocery') {
      require('../routes/grocery').onPaid(p.ref_id);
    } else if (p.purpose === 'feature') {
      const hours = JSON.parse(p.meta || '{}').hours || 24;
      const t = one('SELECT featured_until FROM tasks WHERE id=?', p.ref_id);
      const base = Math.max(now(), t?.featured_until || 0);
      run('UPDATE tasks SET featured_until=? WHERE id=?', base + hours * HOUR, p.ref_id);
      notify(p.user_id, 'Tu publicación ahora está destacada.', `/tareas/${p.ref_id}`);
    } else if (p.purpose === 'credits') {
      const c = Number(JSON.parse(p.meta || '{}').credits) || 0;
      if (c > 0) { require('./credits').add(p.user_id, c, 'Compra de créditos', p.id); notify(p.user_id, `Créditos acreditados: +${c}. Ya puedes enviar ofertas.`, '/creditos'); }
    }
    return one('SELECT * FROM payments WHERE id=?', paymentId);
  });
}
payments.setMarkPaid(markPaid);

// Libera el pago al trabajador descontando la comisión.
function completeOrder(orderId, byUserId, auto = false) {
  return tx(() => {
    const o = one('SELECT * FROM orders WHERE id=?', orderId);
    if (!o || !['delivered', 'disputed'].includes(o.status)) return false;
    const s = settings();
    const commission = commissionFor(o.worker_id, o.amount_cents);
    const net = o.amount_cents - commission;
    run('UPDATE orders SET status=?, completed_at=?, commission_cents=? WHERE id=?', 'completed', now(), commission, o.id);
    // El dinero del trabajador se libera cuando pasan los días de retención Y la pasarela ya liberó el pago a la plataforma
    // (nunca se le paga con plata que todavía no es nuestra).
    const pay = one("SELECT meta FROM payments WHERE purpose='order' AND ref_id=? AND status='paid' ORDER BY id DESC", o.id);
    let gatewayRelease = 0; try { gatewayRelease = Number(JSON.parse(pay?.meta || '{}').release_at) || 0; } catch { /* sin fecha */ }
    run('INSERT INTO transactions(user_id,type,amount_cents,available_at,order_id,description,created_at) VALUES (?,?,?,?,?,?,?)',
      o.worker_id, 'earning', net, Math.max(now() + s.clearance_days * DAY, gatewayRelease), o.id, `Trabajo completado: ${o.title}`, now());
    event(o.id, byUserId, 'system', auto ? 'Aprobado automáticamente por vencimiento del plazo de revisión. Pago liberado.' : 'Trabajo aprobado. Pago liberado al trabajador.');
    notify(o.worker_id, `Pago liberado: ${money(net)} por "${o.title}"`, '/billetera');
    // Recordatorio para volver a contratar por la plataforma (con tarifa reducida)
    notify(o.client_id, `¿Te gustó el trabajo? Vuelve a contratar a la misma persona en un clic; tu pago sigue protegido.`, `/pedidos/${o.id}#recontratar`);
    event(o.id, null, 'system', 'Para tu próximo trabajo con esta persona usa "Volver a contratar": tu pago queda protegido.');
    return true;
  });
}

function refundOrder(orderId, note) {
  return tx(() => {
    const o = one('SELECT * FROM orders WHERE id=?', orderId);
    if (!o || ['completed', 'refunded', 'cancelled'].includes(o.status)) return false;
    run('UPDATE orders SET status=? WHERE id=?', o.paid_at ? 'refunded' : 'cancelled', o.id);
    if (o.paid_at) run("UPDATE payments SET status='refund_pending' WHERE purpose='order' AND ref_id=? AND status='paid'", o.id);
    event(o.id, null, 'system', note || 'Pedido cancelado y reembolsado al cliente.');
    notify(o.client_id, `Pedido "${o.title}" cancelado. ${o.paid_at ? 'El reembolso será procesado.' : ''}`, `/pedidos/${o.id}`);
    notify(o.worker_id, `Pedido "${o.title}" cancelado.`, `/pedidos/${o.id}`);
    return true;
  });
}

function wallet(userId) {
  const t = now();
  const r = one(`SELECT
    COALESCE(SUM(CASE WHEN available_at <= ? THEN amount_cents END),0) available,
    COALESCE(SUM(CASE WHEN available_at > ? THEN amount_cents END),0) pending,
    COALESCE(SUM(CASE WHEN type='earning' THEN amount_cents END),0) earned
    FROM transactions WHERE user_id=?`, t, t, userId);
  const inProgress = one("SELECT COALESCE(SUM(amount_cents),0) v FROM orders WHERE worker_id=? AND status IN ('in_progress','delivered','revision','disputed')", userId).v;
  return { ...r, inProgress };
}

function autoApprove() {
  const s = settings();
  if (require('./credits').isOn()) require('./credits').refundExpired();
  const limit = now() - s.auto_approve_hours * HOUR;
  for (const o of all("SELECT id FROM orders WHERE status='delivered' AND delivered_at < ?", limit)) completeOrder(o.id, null, true);
}

function workerStats(userId) {
  const r = one('SELECT COUNT(*) n, AVG(rating) avg FROM reviews WHERE worker_id=?', userId);
  const done = one("SELECT COUNT(*) n FROM orders WHERE worker_id=? AND status='completed'", userId).n;
  const onTime = one("SELECT COUNT(*) n FROM orders WHERE worker_id=? AND status='completed' AND delivered_at <= due_at", userId).n;
  const strikes = one('SELECT strikes FROM users WHERE id=?', userId)?.strikes || 0;
  let level = done >= 50 && (r.avg || 0) >= 4.7 ? 'Top' : done >= 20 ? 'Nivel 2' : done >= 5 ? 'Nivel 1' : 'Nuevo';
  if (strikes >= 3) level = 'En revisión';
  const resp = one(`SELECT AVG(q.answered_at - q.created_at) v FROM questions q
    LEFT JOIN gigs g ON q.target_type='gig' AND g.id=q.target_id LEFT JOIN tasks t ON q.target_type='task' AND t.id=q.target_id
    WHERE q.answered_at IS NOT NULL AND COALESCE(g.worker_id, t.client_id)=?`, userId).v;
  const response = resp == null ? null : resp < HOUR ? `${Math.max(1, Math.round(resp / 60000))} min` : resp < DAY ? `${Math.round(resp / HOUR)} h` : `${Math.round(resp / DAY)} d`;
  return { response, strikes, reviews: r.n, rating: r.avg ? Math.round(r.avg * 10) / 10 : null, done, onTime: done ? Math.round(onTime / done * 100) : null, level };
}

module.exports = { money, clientFee, commissionFor, gatewayCost, MAX_APPLICATIONS_DAY, MAX_ACTIVE_GIGS, notify, event, filterContact, scanContact, safe, createOrder, markPaid, completeOrder, refundOrder, wallet, autoApprove, workerStats, HOUR, DAY };

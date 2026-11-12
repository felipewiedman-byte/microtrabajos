const express = require('express');
const { one, all, run, now, settings, tx } = require('../lib/db');
const market = require('../lib/market');
const { requireAdmin, fail, clean, int, toCents, upload, imageUpload, csrfMultipart } = require('../lib/http');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const texts = require('../lib/texts');

const r = express.Router();
r.use(requireAdmin);
// En el panel se editan las tarifas normales (sin la promoción aplicada).
r.use((req, res, next) => { if (req.path.startsWith('/configuracion')) res.locals.settings = require('../lib/db').settingsRaw(); next(); });
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
    other: one("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE status='paid' AND purpose='feature'").v,
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
      + one("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE status='paid' AND purpose='feature' AND paid_at>=? AND paid_at<?", s, s + market.DAY).v;
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
// Lista de retiros pendientes para pagarlos todos juntos (abre en Excel). Importe = lo que hay que enviar.
r.get('/retiros.csv', (req, res) => {
  const safe = (v) => { let t = String(v ?? '').replace(/[\r\n;]+/g, ' '); if (/^[=+\-@\t]/.test(t)) t = "'" + t; return t; };
  const rows = all("SELECT w.*, u.name, u.email FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.status='requested' ORDER BY w.created_at");
  const lines = ['id;fecha;nombre;correo;metodo;cuenta;monto_a_enviar_usd;costo_retiro_usd', ...rows.map((w) => [w.id, new Date(w.created_at).toISOString().slice(0, 10), w.name, w.email, w.method, w.account, ((w.amount_cents - w.fee_cents) / 100).toFixed(2), (w.fee_cents / 100).toFixed(2)].map(safe).join(';'))];
  res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="retiros-pendientes.csv"').send('\ufeff' + lines.join('\r\n') + '\r\n');
});
r.post('/retiros/:id(\\d+)', (req, res, next) => {
  const w = one("SELECT * FROM withdrawals WHERE id=? AND status='requested'", int(req.params.id));
  if (!w) return next(fail(404, 'Retiro no disponible (ya fue procesado).'));
  const paid = req.body.action === 'paid', note = clean(req.body.note, 200);
  // Atómico: solo un proceso puede cerrar el retiro; el cambio de estado y la devolución del saldo van juntos.
  const done = tx(() => {
    const ch = run("UPDATE withdrawals SET status=?, note=?, processed_at=?, processed_by=? WHERE id=? AND status='requested'", paid ? 'paid' : 'rejected', note, now(), req.user.id, w.id).changes;
    if (!ch) return false;
    if (!paid) run('INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,?,?,?,?,?)', w.user_id, 'reversal', w.amount_cents, now(), `Retiro #${w.id} rechazado`, now());
    return true;
  });
  if (!done) return next(fail(409, 'Este retiro ya fue procesado.'));
  if (paid) market.notify(w.user_id, `Su retiro de ${market.money(w.amount_cents - w.fee_cents)} fue enviado.`, '/billetera');
  else market.notify(w.user_id, `Su retiro fue rechazado: ${note || 'datos incorrectos'}. El saldo fue devuelto.`, '/billetera');
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
  // Calculadora: con las tarifas normales y el costo estimado de cada pasarela, ¿cuánto queda por trabajo?
  const s = require('../lib/db').settingsRaw();
  const calc = [300, 1000, 2500, 5000, 10000].map((amount) => {
    const commission = Math.min(amount, Math.max(Number(s.commission_min_cents) || 0, Math.round(amount * s.commission_pct / 100)));
    const mp = market.gatewayCost('mercadopago', amount), pp = market.gatewayCost('paypal', amount);
    return { amount, commission, mp, pp, netMp: commission - mp, netPp: commission - pp, beMp: mp / amount * 100, bePp: pp / amount * 100 };
  });
  res.render('admin/settings', { title: 'Configuración', calc, demoCount: require('../lib/demo').count(), backups: require('../lib/backup').list().slice(0, 7), cats: all('SELECT * FROM categories ORDER BY sort'), log: all('SELECT a.*, u.name FROM audit_log a JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 30') });
});
// Cambia el nombre de la web en todas partes: ajuste, correos, pagos y todos los textos editables que lo contengan.
function renameSite(name) {
  const db = require('../lib/db'), old = String(db.settingsRaw().site_name || '');
  if (!name || name === old) return false;
  if (old.length >= 3) for (const t of all('SELECT key, value FROM texts WHERE value LIKE ?', `%${old}%`)) run('UPDATE texts SET value=? WHERE key=?', t.value.split(old).join('{{sitio}}'), t.key);
  run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'site_name', name);
  require('../lib/texts').reset();
  return true;
}
r.post('/demo/borrar', (req, res) => {
  const out = require('../lib/demo').purge();
  if (out.ok) audit(req, 'datos de demostración borrados');
  req.flash(out.ok ? 'ok' : 'error', out.msg);
  res.redirect('/admin/configuracion');
});
r.post('/nombre', (req, res) => {
  const name = clean(req.body.site_name, 40);
  if (name.length < 2) { req.flash('error', 'Escriba el nombre de la web (mínimo 2 letras).'); return res.redirect('/admin/configuracion'); }
  if (renameSite(name)) audit(req, `nombre de la web cambiado a «${name}»`);
  req.flash('ok', 'Nombre actualizado en toda la web.');
  res.redirect('/admin/configuracion');
});
// Lo único que hace falta tocar: el porcentaje. El mínimo por trabajo y el resto quedan automáticos.
r.post('/comision', (req, res) => {
  const pct = Math.min(50, Math.max(0, Number(String(req.body.commission_pct).replace(',', '.')) || 0));
  if (!pct) { req.flash('error', 'Escriba un porcentaje válido (por ejemplo 8).'); return res.redirect('/admin/configuracion'); }
  run('UPDATE settings SET value=? WHERE key=?', String(pct), 'commission_pct');
  audit(req, `comisión cambiada a ${pct} %`);
  if (pct < 8) req.flash('error', `Guardado: ${pct} %. Ojo: con menos de 8 % pierdes dinero en los trabajos pequeños (la pasarela cobra más que tu comisión).`);
  else req.flash('ok', `Listo: la comisión es ${pct} % en toda la web.`);
  res.redirect('/admin/configuracion');
});
r.post('/configuracion', (req, res) => {
  const pct = ['commission_pct', 'client_fee_pct', 'clearance_days', 'auto_approve_hours', 'max_revisions', 'usd_to_local', 'gw_mp_pct', 'gw_mp_fixed_cop', 'gw_mp_iva_pct', 'gw_pp_pct', 'promo_commission_pct', 'promo_client_fee_pct'];
  run("INSERT INTO settings(key,value) VALUES ('promo_active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", req.body.promo_active ? '1' : '0');
  const until = Date.parse(String(req.body.promo_until || '') + 'T23:59:59');
  if (until) run("INSERT INTO settings(key,value) VALUES ('promo_until',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(until));
  const cents = ['client_fee_min_cents', 'commission_min_cents', 'gw_pp_fixed_cents', 'min_task_cents', 'min_withdraw_cents', 'withdraw_fee_cents', 'feature_24h_cents', 'feature_7d_cents'];
  for (const k of pct) if (req.body[k] !== undefined && req.body[k] !== '') run('UPDATE settings SET value=? WHERE key=?', String(Math.max(0, Number(req.body[k]) || 0)), k);
  for (const k of cents) if (req.body[k] !== undefined && req.body[k] !== '') run('UPDATE settings SET value=? WHERE key=?', String(toCents(req.body[k])), k);
  for (const k of ['commission_pct', 'client_fee_pct', 'promo_commission_pct', 'promo_client_fee_pct']) run('UPDATE settings SET value=MIN(CAST(value AS REAL), 50) WHERE key=?', k); // tope de seguridad: 50 %
  audit(req, 'configuración actualizada');
  req.flash('ok', 'Configuración guardada.');
  res.redirect('/admin/configuracion');
});
r.post('/categorias/:id(\\d+)', (req, res) => {
  run('UPDATE categories SET active=1-active WHERE id=?', int(req.params.id));
  audit(req, `categoría #${req.params.id} activada/desactivada`);
  res.redirect('/admin/configuracion');
});

// ---------- Apariencia: colores, tipografía, nombre, logos y favicon ----------
const COLOR_KEYS = ['color_brand', 'color_accent', 'color_success', 'color_warning', 'color_dark', 'color_hero'];
const FONTS = ['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'Lato', 'Nunito Sans', 'Source Sans 3'];
const SHOW_KEYS = ['paths', 'categories', 'tasks', 'figures', 'how', 'gigs', 'features', 'payments', 'cta'];
r.get('/apariencia', (req, res) => res.render('admin/appearance', { title: 'Apariencia', FONTS, SHOW_KEYS }));
r.post('/apariencia', imageUpload.fields([{ name: 'logo_color', maxCount: 1 }, { name: 'logo_white', maxCount: 1 }, { name: 'favicon', maxCount: 1 }, { name: 'hero_image', maxCount: 1 }]), csrfMultipart, (req, res) => {
  const set = (k, v) => run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v));
  for (const k of COLOR_KEYS) if (/^#[0-9a-f]{6}$/i.test(req.body[k] || '')) set(k, req.body[k]);
  if (FONTS.includes(req.body.font)) set('font', req.body.font);
  const name = clean(req.body.site_name, 40); if (name) renameSite(name);
  for (const k of SHOW_KEYS) set('show_' + k, req.body['show_' + k] ? '1' : '0');
  set('show_hero_stat', req.body.show_hero_stat ? '1' : '0');
  set('hero_default', req.body.hero_default ? '1' : '0');
  for (const k of ['contact_email', 'contact_phone', 'contact_hours', 'contact_city']) if (req.body[k] !== undefined) set(k, clean(req.body[k], 120));
  for (const k of ['social_facebook', 'social_instagram', 'social_x', 'social_tiktok', 'social_linkedin', 'social_youtube']) {
    if (req.body[k] === undefined) continue;
    const v = clean(req.body[k], 300); set(k, /^https:\/\//.test(v) ? v : '');
  }
  for (const k of ['newsletter', 'topbar']) set('show_' + k, req.body['show_' + k] ? '1' : '0');
  const IMG = /\.(png|jpe?g|webp|gif|ico)$/i;
  for (const k of ['logo_color', 'logo_white', 'favicon', 'hero_image']) {
    const f = req.files?.[k]?.[0];
    if (f && IMG.test(f.originalname)) set(k, f.filename);
    if (req.body['remove_' + k]) set(k, '');
  }
  if (req.body.reset_colors) {
    const d = { color_brand: '#4338ca', color_accent: '#7c3aed', color_success: '#047857', color_warning: '#b45309', color_dark: '#0b1527', color_hero: '#1e1b4b', font: 'Inter' };
    for (const [k, v] of Object.entries(d)) set(k, v);
  }
  audit(req, 'apariencia actualizada');
  if (req.rejectedFiles?.length) { req.flash('error', `Guardado, pero no se subió: ${req.rejectedFiles.join(', ')}. Formatos permitidos: PNG, JPG, WEBP, GIF o ICO (SVG no, por seguridad).`); return res.redirect('/admin/apariencia'); }
  req.flash('ok', 'Apariencia guardada.');
  res.redirect('/admin/apariencia');
});

// ---------- Textos editables ----------
r.get('/textos', (req, res) => {
  const q = clean(req.query.q, 80);
  const rows = all(`SELECT * FROM texts ${q ? 'WHERE key LIKE ? OR default_value LIKE ? OR value LIKE ?' : ''} ORDER BY key`, ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []));
  const groups = {};
  for (const row of rows) { const g = row.key.split('.').slice(0, 2).join('.'); (groups[g] ||= []).push(row); }
  res.render('admin/texts', { title: 'Textos del sitio', groups, total: rows.length });
});
r.post('/textos', (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    if (!k.startsWith('t:')) continue;
    const key = k.slice(2), row = one('SELECT * FROM texts WHERE key=?', key);
    if (!row) continue;
    const val = clean(v, 2000);
    run('UPDATE texts SET value=?, updated_at=? WHERE key=?', val && val !== row.default_value ? val : null, now(), key);
  }
  texts.reset();
  audit(req, 'textos actualizados');
  req.flash('ok', 'Textos guardados.');
  res.redirect('/admin/textos' + (req.body.q ? '?q=' + encodeURIComponent(req.body.q) : ''));
});

// ---------- Secciones personalizadas de la página de inicio ----------
const POSITIONS = { after_hero: 'Después de la portada', after_categories: 'Después de categorías', before_cta: 'Antes del final', end: 'Al final de la página' };
r.get('/secciones', (req, res) => res.render('admin/sections', { title: 'Secciones', sections: all('SELECT * FROM sections ORDER BY position, sort, id'), POSITIONS, edit: req.query.editar ? one('SELECT * FROM sections WHERE id=?', int(req.query.editar)) : null }));
r.post('/secciones', (req, res) => {
  const b = req.body, color = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : d);
  const link = clean(b.button_link, 300);
  const data = [clean(b.title, 150), clean(b.body, 3000), clean(b.eyebrow, 80), clean(b.button_text, 60), /^(\/|https?:\/\/)/.test(link) ? link : '',
    color(b.bg_color, '#ffffff'), color(b.text_color, '#0f172a'), POSITIONS[b.position] ? b.position : 'before_cta', int(b.sort), b.active ? 1 : 0];
  if (!data[0]) { req.flash('error', 'La sección necesita un título.'); return res.redirect('/admin/secciones'); }
  if (int(b.id)) run('UPDATE sections SET title=?, body=?, eyebrow=?, button_text=?, button_link=?, bg_color=?, text_color=?, position=?, sort=?, active=? WHERE id=?', ...data, int(b.id));
  else run('INSERT INTO sections(title, body, eyebrow, button_text, button_link, bg_color, text_color, position, sort, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...data, now());
  audit(req, `sección "${data[0]}" guardada`);
  req.flash('ok', 'Sección guardada.');
  res.redirect('/admin/secciones');
});
r.post('/secciones/:id(\\d+)/eliminar', (req, res) => {
  run('DELETE FROM sections WHERE id=?', int(req.params.id));
  audit(req, `sección #${req.params.id} eliminada`);
  res.redirect('/admin/secciones');
});

// ---------- Métricas ----------
r.get('/metricas', (req, res) => {
  const days = Math.min(90, Math.max(7, int(req.query.dias, 30)));
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const series = (sql) => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const s = start.getTime() - i * market.DAY;
      out.push({ label: new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }), v: one(sql, s, s + market.DAY).v });
    }
    return out;
  };
  const since = start.getTime() - (days - 1) * market.DAY;
  const m = {
    signups: series('SELECT COUNT(*) v FROM users WHERE created_at>=? AND created_at<?'),
    logins: series('SELECT COUNT(DISTINCT user_id) v FROM logins WHERE created_at>=? AND created_at<?'),
    tasks: series('SELECT COUNT(*) v FROM tasks WHERE created_at>=? AND created_at<?'),
    orders: series('SELECT COUNT(*) v FROM orders WHERE paid_at>=? AND paid_at<?'),
    revenue: series("SELECT COALESCE(SUM(commission_cents+client_fee_cents),0) v FROM orders WHERE status='completed' AND completed_at>=? AND completed_at<?"),
  };
  const tot = {
    users: one('SELECT COUNT(*) c FROM users').c,
    signups: one('SELECT COUNT(*) c FROM users WHERE created_at>=?', since).c,
    active: one('SELECT COUNT(DISTINCT user_id) c FROM logins WHERE created_at>=?', since).c,
    workers: one("SELECT COUNT(DISTINCT worker_id) c FROM orders WHERE paid_at>=?", since).c,
    clients: one("SELECT COUNT(DISTINCT client_id) c FROM orders WHERE paid_at>=?", since).c,
    tasks: one('SELECT COUNT(*) c FROM tasks WHERE created_at>=?', since).c,
    hired: one('SELECT COUNT(DISTINCT task_id) c FROM orders WHERE task_id IS NOT NULL AND paid_at IS NOT NULL AND created_at>=?', since).c,
    gmv: one("SELECT COALESCE(SUM(amount_cents),0) v FROM orders WHERE paid_at>=? AND status NOT IN ('refunded','cancelled')", since).v,
    revenue: one("SELECT COALESCE(SUM(commission_cents+client_fee_cents),0) v FROM orders WHERE status='completed' AND completed_at>=?", since).v
      + one("SELECT COALESCE(SUM(amount_cents),0) v FROM payments WHERE status='paid' AND purpose='feature' AND paid_at>=?", since).v,
  };
  const byCountry = all('SELECT country, COUNT(*) c FROM users GROUP BY country ORDER BY c DESC LIMIT 8');
  const byCategory = all('SELECT c.name, COUNT(t.id) n FROM categories c LEFT JOIN tasks t ON t.category_id=c.id AND t.created_at>=? GROUP BY c.id ORDER BY n DESC', since);
  const topWorkers = all(`SELECT u.id, u.name, COUNT(o.id) n, SUM(o.amount_cents) v FROM orders o JOIN users u ON u.id=o.worker_id
    WHERE o.status='completed' AND o.completed_at>=? GROUP BY u.id ORDER BY v DESC LIMIT 8`, since);
  res.render('admin/metrics', { title: 'Métricas', m, tot, days, byCountry, byCategory, topWorkers });
});

// ---------- Soporte (tickets) ----------
r.get('/soporte', (req, res) => {
  const tickets = all(`SELECT t.*, u.name, u.email, (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id=t.id) n FROM tickets t JOIN users u ON u.id=t.user_id
    ORDER BY t.status='open' DESC, t.updated_at DESC LIMIT 200`);
  const current = req.query.id ? one('SELECT t.*, u.name, u.email FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?', int(req.query.id)) : null;
  const msgs = current ? all('SELECT m.*, u.name FROM ticket_messages m JOIN users u ON u.id=m.user_id WHERE ticket_id=? ORDER BY m.id', current.id) : [];
  res.render('admin/support', { title: 'Soporte', tickets, current, msgs });
});
r.post('/soporte/:id(\\d+)', (req, res) => {
  const tk = one('SELECT * FROM tickets WHERE id=?', int(req.params.id));
  if (!tk) return res.redirect('/admin/soporte');
  const text = clean(req.body.text, 4000);
  if (text) {
    run('INSERT INTO ticket_messages(ticket_id,user_id,is_staff,text,created_at) VALUES (?,?,1,?,?)', tk.id, req.user.id, text, now());
    market.notify(tk.user_id, `Soporte respondió: "${tk.subject}"`, `/soporte/${tk.id}`);
  }
  run('UPDATE tickets SET status=?, updated_at=? WHERE id=?', req.body.close ? 'closed' : text ? 'answered' : tk.status, now(), tk.id);
  res.redirect('/admin/soporte?id=' + tk.id);
});

// ---------- Gestión de usuarios ----------
r.get('/usuarios/:id(\\d+)', (req, res, next) => {
  const u = one('SELECT * FROM users WHERE id=?', int(req.params.id));
  if (!u) return next(fail(404, 'Usuario no encontrado.'));
  res.render('admin/user', {
    title: u.name, u, stats: market.workerStats(u.id), w: market.wallet(u.id),
    orders: all('SELECT * FROM orders WHERE client_id=? OR worker_id=? ORDER BY created_at DESC LIMIT 20', u.id, u.id),
    tasks: all('SELECT * FROM tasks WHERE client_id=? ORDER BY created_at DESC LIMIT 20', u.id),
    gigs: all('SELECT * FROM gigs WHERE worker_id=? ORDER BY created_at DESC LIMIT 20', u.id),
    tickets: all('SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC', u.id),
    lastLogin: one('SELECT MAX(created_at) v FROM logins WHERE user_id=?', u.id).v,
  });
});
r.post('/usuarios/:id(\\d+)/editar', (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', int(req.params.id));
  if (!u) return res.redirect('/admin/usuarios');
  const email = clean(req.body.email, 120).toLowerCase();
  if (email && email !== u.email && one('SELECT id FROM users WHERE email=?', email)) { req.flash('error', 'Ese correo ya está en uso.'); return res.redirect('/admin/usuarios/' + u.id); }
  run('UPDATE users SET name=?, email=?, headline=?, country=?, strikes=? WHERE id=?',
    clean(req.body.name, 80) || u.name, email || u.email, clean(req.body.headline, 100), clean(req.body.country, 2) || u.country,
    Math.max(0, int(req.body.strikes, u.strikes)), u.id);
  audit(req, `usuario #${u.id} editado`);
  req.flash('ok', 'Usuario actualizado.');
  res.redirect('/admin/usuarios/' + u.id);
});
r.post('/usuarios/:id(\\d+)/clave', (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', int(req.params.id));
  if (!u) return res.redirect('/admin/usuarios');
  const temp = crypto.randomBytes(5).toString('hex');
  run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(temp, 10), u.id);
  audit(req, `clave restablecida usuario #${u.id}`);
  req.flash('ok', `Nueva contraseña temporal para ${u.email}: ${temp} — entréguesela al usuario y pídale cambiarla.`);
  res.redirect('/admin/usuarios/' + u.id);
});
r.post('/usuarios/:id(\\d+)/mensaje', (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', int(req.params.id));
  const text = clean(req.body.text, 2000);
  if (u && text) {
    const tid = run('INSERT INTO tickets(user_id,subject,status,created_at,updated_at) VALUES (?,?,?,?,?)', u.id, clean(req.body.subject, 120) || 'Mensaje del equipo', 'answered', now(), now()).lastInsertRowid;
    run('INSERT INTO ticket_messages(ticket_id,user_id,is_staff,text,created_at) VALUES (?,?,1,?,?)', tid, req.user.id, text, now());
    market.notify(u.id, 'Tienes un mensaje del equipo de soporte.', `/soporte/${tid}`);
    audit(req, `mensaje enviado a usuario #${u.id}`);
    req.flash('ok', 'Mensaje enviado. El usuario lo verá en Soporte y en sus notificaciones.');
  }
  res.redirect('/admin/usuarios/' + int(req.params.id));
});
// Entrar como el usuario para ayudarle (queda registrado). Para volver: cerrar sesión e ingresar de nuevo.
r.post('/usuarios/:id(\\d+)/entrar', (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', int(req.params.id));
  if (!u || u.role === 'admin') return res.redirect('/admin/usuarios');
  audit(req, `entró como usuario #${u.id}`);
  req.session.adminId = req.user.id;
  req.session.userId = u.id;
  req.flash('info', `Estás viendo la cuenta de ${u.name}. Usa "Volver a mi cuenta" en el menú para regresar.`);
  res.redirect('/panel');
});
// Eliminar: se anonimiza la cuenta (se conserva el historial financiero por obligaciones contables).
r.post('/usuarios/:id(\\d+)/eliminar', (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', int(req.params.id));
  if (!u || u.id === req.user.id || u.role === 'admin') { req.flash('error', 'No se puede eliminar esta cuenta.'); return res.redirect('/admin/usuarios'); }
  const active = one("SELECT COUNT(*) c FROM orders WHERE (client_id=? OR worker_id=?) AND status IN ('in_progress','delivered','revision','disputed')", u.id, u.id).c;
  if (active && !req.body.force) { req.flash('error', `El usuario tiene ${active} pedido(s) activos. Resuélvalos primero o marque "eliminar de todas formas".`); return res.redirect('/admin/usuarios/' + u.id); }
  run(`UPDATE users SET name='Usuario eliminado', email=?, password_hash='-', headline='', bio='', skills='', company='', payout_account='', status='deleted' WHERE id=?`, `eliminado-${u.id}-${Date.now()}@eliminado.local`, u.id);
  run("UPDATE tasks SET status='removed' WHERE client_id=? AND status='open'", u.id);
  run("UPDATE gigs SET status='removed' WHERE worker_id=?", u.id);
  run("DELETE FROM applications WHERE worker_id=? AND status='pending'", u.id);
  run('DELETE FROM sessions WHERE sess LIKE ?', `%"userId":${u.id}}%`);
  audit(req, `usuario #${u.id} eliminado`);
  req.flash('ok', 'Usuario eliminado (datos personales borrados; historial contable conservado).');
  res.redirect('/admin/usuarios');
});

// ---------- Pagos y pasarelas (claves cifradas) ----------
const secrets = require('../lib/secrets');
const payments = require('../lib/payments');
const SECRET_KEYS = ['mp_access_token', 'paypal_client_id', 'paypal_client_secret'];
r.get('/pagos', (req, res) => {
  const masks = {}; for (const k of SECRET_KEYS) masks[k] = secrets.mask(k);
  const base = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.render('admin/payments', { title: 'Pagos y pasarelas', masks, base, providers: payments.providers(), test: req.session.payTest || null });
  delete req.session.payTest;
});
r.post('/pagos', async (req, res) => {
  const set = (k, v) => run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v));
  for (const k of SECRET_KEYS) {
    const v = clean(req.body[k], 500);
    if (req.body['del_' + k]) secrets.set(k, '');
    else if (v) secrets.set(k, v);
  }
  if (['COP', 'USD', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'UYU'].includes(req.body.pay_mp_currency)) set('pay_mp_currency', req.body.pay_mp_currency);
  if (['sandbox', 'live'].includes(req.body.pay_paypal_mode)) set('pay_paypal_mode', req.body.pay_paypal_mode);
  if (['auto', '1', '0'].includes(req.body.pay_demo)) set('pay_demo', req.body.pay_demo);
  if (req.body.usd_to_local) set('usd_to_local', String(Math.max(0, Number(req.body.usd_to_local) || 0)));
  audit(req, 'configuración de pagos actualizada');
  if (req.body.test) req.session.payTest = await payments.testConnections();
  req.flash('ok', req.body.test ? 'Guardado. Resultado de la prueba abajo.' : 'Configuración de pagos guardada.');
  res.redirect('/admin/pagos');
});

// ---------- Suscriptores del boletín ----------
r.get('/suscriptores', (req, res) => {
  const subs = all('SELECT * FROM subscribers ORDER BY created_at DESC');
  if (req.query.csv) {
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="suscriptores.csv"');
    return res.send('correo,fecha\n' + subs.map((s) => `${s.email},${new Date(s.created_at).toISOString()}`).join('\n'));
  }
  res.render('admin/subscribers', { title: 'Suscriptores', subs });
});
r.post('/suscriptores/:id(\\d+)/eliminar', (req, res) => { run('DELETE FROM subscribers WHERE id=?', int(req.params.id)); res.redirect('/admin/suscriptores'); });

// ---------- Mercado: cadenas, catálogo, precios y pedidos ----------
r.get('/mercado', (req, res) => {
  const g = require('../lib/grocery');
  const chains = all('SELECT * FROM g_chains ORDER BY sort');
  const q = clean(req.query.q, 60);
  const products = all(`SELECT * FROM g_products ${q ? 'WHERE name LIKE ?' : ''} ORDER BY category, name LIMIT 300`, ...(q ? [`%${q}%`] : []));
  const prices = all('SELECT * FROM g_prices');
  const pmap = {}; for (const p of prices) (pmap[p.product_id] ||= {})[p.chain_id] = p;
  res.render('admin/grocery', {
    title: 'Mercado', chains, products, pmap, q,
    sample: one("SELECT COUNT(*) c FROM g_prices WHERE source='ejemplo'").c,
    orders: all('SELECT o.*, c.name chain_name, u.name client_name FROM g_orders o JOIN g_chains c ON c.id=o.chain_id JOIN users u ON u.id=o.client_id ORDER BY o.created_at DESC LIMIT 50'),
  });
});
r.post('/mercado/estado', (req, res) => {
  run("INSERT INTO settings(key,value) VALUES ('grocery_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", req.body.enabled ? '1' : '0');
  audit(req, `mercado ${req.body.enabled ? 'activado' : 'desactivado'}`);
  req.flash('ok', req.body.enabled ? 'Mercado activado: ya es visible para los usuarios.' : 'Mercado desactivado: no es visible para nadie.');
  res.redirect('/admin/mercado');
});
r.post('/mercado/cadenas', (req, res) => {
  for (const c of all('SELECT id FROM g_chains')) {
    if (req.body['cities' + c.id] === undefined) continue;
    const CITIES = String(settings().cities || '').split(',').map((x) => x.trim());
    const cities = String(req.body['cities' + c.id]).split(',').map((x) => x.trim()).filter((x) => CITIES.includes(x)).join(',');
    run('UPDATE g_chains SET cities=?, active=? WHERE id=?', cities, req.body['active' + c.id] ? 1 : 0, c.id);
  }
  const name = clean(req.body.new_name, 40);
  if (name) {
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const color = /^#[0-9a-f]{6}$/i.test(req.body.new_color || '') ? req.body.new_color : '#4f46e5';
    if (slug) run('INSERT OR IGNORE INTO g_chains(slug,name,color,cities,sort) VALUES (?,?,?,?,99)', slug, name, color, clean(req.body.new_cities, 600));
  }
  audit(req, 'cadenas de mercado actualizadas');
  req.flash('ok', 'Supermercados guardados.');
  res.redirect('/admin/mercado');
});
r.post('/mercado/precios', (req, res) => {
  let n = 0;
  for (const [k, v] of Object.entries(req.body)) {
    const m = /^pr_(\d+)_(\d+)$/.exec(k); if (!m) continue;
    const price = int(String(v).replace(/\D/g, ''), 0);
    if (!String(v).trim()) { n += run('DELETE FROM g_prices WHERE product_id=? AND chain_id=?', +m[1], +m[2]).changes; continue; }
    if (price < 50 || price > 5000000) continue;
    const cur = one('SELECT price FROM g_prices WHERE product_id=? AND chain_id=?', +m[1], +m[2]);
    if (cur && cur.price === price) continue;
    run(`INSERT INTO g_prices(product_id,chain_id,price,source,updated_at) VALUES (?,?,?,'admin',?)
      ON CONFLICT(product_id,chain_id) DO UPDATE SET price=excluded.price, source='admin', updated_at=excluded.updated_at`, +m[1], +m[2], price, now()); n++;
  }
  const pname = clean(req.body.new_product, 80);
  if (pname) run('INSERT OR IGNORE INTO g_products(name,unit,category) VALUES (?,?,?)', pname, clean(req.body.new_unit, 30), clean(req.body.new_category, 40) || 'Despensa');
  audit(req, `precios de mercado actualizados (${n})`);
  req.flash('ok', `Precios guardados (${n} cambios).`);
  res.redirect('/admin/mercado' + (req.body.q ? '?q=' + encodeURIComponent(req.body.q) : ''));
});
// Importar precios desde CSV: producto;unidad;categoría;exito;olimpica;jumbo;… (encabezado con el código de cada cadena)
r.post('/mercado/importar', upload.single('csv'), csrfMultipart, (req, res) => {
  const fs = require('fs');
  if (!req.file || !/\.(csv|txt)$/i.test(req.file.originalname)) { req.flash('error', 'Suba un archivo .csv'); return res.redirect('/admin/mercado'); }
  const text = fs.readFileSync(req.file.path, 'utf8').slice(0, 2_000_000); fs.unlink(req.file.path, () => {});
  const rows = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(l.includes(';') ? ';' : ',').map((x) => x.trim()));
  const head = (rows.shift() || []).map((h) => h.toLowerCase());
  const chainCols = head.map((h) => one('SELECT id FROM g_chains WHERE slug=?', h)?.id || null);
  let n = 0;
  tx(() => { for (const row of rows.slice(0, 5000)) {
    const name = clean(row[0], 80); if (!name) continue;
    run('INSERT OR IGNORE INTO g_products(name,unit,category) VALUES (?,?,?)', name, clean(row[1], 30), clean(row[2], 40) || 'Despensa');
    const pid = one('SELECT id FROM g_products WHERE name=?', name).id;
    row.forEach((v, i) => { const cid = chainCols[i]; const price = int(String(v).replace(/\D/g, ''), 0); if (cid && price >= 50 && price <= 5000000) {
      run(`INSERT INTO g_prices(product_id,chain_id,price,source,updated_at) VALUES (?,?,?,'admin',?) ON CONFLICT(product_id,chain_id) DO UPDATE SET price=excluded.price, source='admin', updated_at=excluded.updated_at`, pid, cid, price, now()); n++; } });
  } });
  audit(req, `CSV de precios importado (${n})`);
  req.flash('ok', `Importación lista: ${n} precios actualizados.`);
  res.redirect('/admin/mercado');
});
r.get('/mercado/plantilla.csv', (req, res) => {
  const chains = all('SELECT slug FROM g_chains ORDER BY sort').map((c) => c.slug);
  const lines = ['producto;unidad;categoria;' + chains.join(';')].concat(all('SELECT * FROM g_products ORDER BY category, name').map((p) => [p.name, p.unit, p.category, ...chains.map((s) => one('SELECT x.price FROM g_prices x JOIN g_chains c ON c.id=x.chain_id WHERE x.product_id=? AND c.slug=?', p.id, s)?.price || '')].join(';')));
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="precios-mercado.csv"').send('﻿' + lines.join('\n'));
});
r.post('/mercado/ejemplo/borrar', (req, res) => {
  const n = run("DELETE FROM g_prices WHERE source='ejemplo'").changes;
  audit(req, `precios de ejemplo borrados (${n})`);
  req.flash('ok', `${n} precios de ejemplo borrados.`);
  res.redirect('/admin/mercado');
});

module.exports = r;

// Administración de la plataforma: usuarios, planes y ajustes.
const express = require('express');
const { one, all, run, now, settings, setSetting, DEFAULTS } = require('../lib/db');
const U = require('../lib/util');

const r = express.Router();
r.use(U.requireAdmin);
const V = (res, view, data = {}) => res.render('admin/' + view, { layout: 'admin', noindex: true, ...data });

r.get('/', (req, res) => {
  const c = (sql, ...p) => one(sql, ...p).c;
  const st = {
    users: c("SELECT COUNT(*) c FROM users WHERE role='owner'"), shops: c('SELECT COUNT(*) c FROM shops'),
    paid: c("SELECT COUNT(*) c FROM users WHERE plan<>'free' AND (plan_until IS NULL OR plan_until>?)", now()),
    orders7: c('SELECT COUNT(*) c FROM orders WHERE created_at>?', now() - 7 * 86400000), orders: c('SELECT COUNT(*) c FROM orders'), products: c('SELECT COUNT(*) c FROM products'),
    new7: c("SELECT COUNT(*) c FROM users WHERE role='owner' AND created_at>?", now() - 7 * 86400000),
  };
  const mrr = all("SELECT plan, COUNT(*) n FROM users WHERE plan<>'free' AND (plan_until IS NULL OR plan_until>?) GROUP BY plan", now())
    .reduce((a, x) => a + x.n * (parseFloat(settings()['price_' + x.plan]) || 0), 0);
  V(res, 'index', { title: 'Administración', st, mrr, tab: 'resumen', recent: all("SELECT u.name, u.email, u.created_at, s.name AS shop, s.slug FROM users u LEFT JOIN shops s ON s.user_id=u.id WHERE u.role='owner' ORDER BY u.id DESC LIMIT 8") });
});

r.get('/usuarios', (req, res) => {
  const q = U.clean(req.query.q, 60), page = Math.max(1, U.int(req.query.page, 1)), per = 30;
  const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  const where = q ? "WHERE u.role='owner' AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')" : "WHERE u.role='owner'";
  const args = q ? [like, like, like] : [];
  const total = one(`SELECT COUNT(*) c FROM users u LEFT JOIN shops s ON s.user_id=u.id ${where}`, ...args).c;
  const rows = all(`SELECT u.*, s.name AS shop, s.slug, s.status AS shop_status, (SELECT COUNT(*) FROM products p WHERE p.shop_id=s.id) products, (SELECT COUNT(*) FROM orders o WHERE o.shop_id=s.id) orders
    FROM users u LEFT JOIN shops s ON s.user_id=u.id ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`, ...args, per, (page - 1) * per);
  V(res, 'users', { title: 'Usuarios', rows, q, page, pages: Math.max(1, Math.ceil(total / per)), tab: 'usuarios' });
});
r.post('/usuarios/:id', (req, res, next) => {
  try {
    const u = one("SELECT * FROM users WHERE id=? AND role='owner'", U.int(req.params.id));
    if (!u) throw U.fail(404, 'Usuario no encontrado.');
    const a = req.body.accion;
    if (a === 'plan') {
      const plan = ['free', 'basic', 'pro'].includes(req.body.plan) ? req.body.plan : 'free', months = Math.max(0, Math.min(36, U.int(req.body.months, 1)));
      run('UPDATE users SET plan=?, plan_until=? WHERE id=?', plan, plan === 'free' ? null : (months ? Math.max(now(), u.plan_until || 0) + months * 30 * 86400000 : null), u.id);
      req.flash('ok', plan === 'free' ? 'Plan gratuito asignado.' : `Plan ${plan} asignado${months ? ` por ${months} mes(es)` : ' sin vencimiento'}.`);
    } else if (a === 'status') {
      run('UPDATE users SET status=? WHERE id=?', u.status === 'active' ? 'suspended' : 'active', u.id);
      if (u.status === 'active') run("DELETE FROM sessions WHERE json_extract(sess,'$.userId')=?", u.id);
      req.flash('ok', u.status === 'active' ? 'Usuario suspendido (su catálogo deja de verse).' : 'Usuario reactivado.');
    } else if (a === 'shop') {
      run("UPDATE shops SET status=CASE WHEN status='active' THEN 'paused' ELSE 'active' END WHERE user_id=?", u.id);
      req.flash('ok', 'Estado del catálogo actualizado.');
    }
    res.redirect(U.safeNext(req.body.back || '/admin/usuarios'));
  } catch (e) { next(e); }
});

r.get('/ajustes', (req, res) => V(res, 'settings', { title: 'Ajustes', tab: 'ajustes' }));
r.post('/ajustes', (req, res, next) => {
  try {
    const b = req.body;
    const num = (k, min, max) => { const n = parseFloat(String(b[k]).replace(',', '.')); if (!Number.isFinite(n) || n < min || n > max) throw U.fail(400, 'Revisa los valores numéricos.'); return String(n); };
    setSetting('site_name', U.clean(b.site_name, 40) || DEFAULTS.site_name);
    setSetting('site_tagline', U.clean(b.site_tagline, 140) || DEFAULTS.site_tagline);
    setSetting('price_basic', num('price_basic', 0, 1000)); setSetting('price_pro', num('price_pro', 0, 1000));
    setSetting('price_currency', /^[A-Z]{3}$/.test(b.price_currency) ? b.price_currency : 'USD');
    for (const k of ['limit_free', 'limit_basic', 'limit_pro']) setSetting(k, String(Math.round(num(k, 1, 100000))));
    setSetting('contact_whatsapp', U.phone(b.contact_whatsapp)); setSetting('support_email', U.clean(b.support_email, 120));
    setSetting('signups_open', b.signups_open ? '1' : '0');
    req.flash('ok', 'Ajustes guardados.');
    res.redirect('/admin/ajustes');
  } catch (e) { next(e); }
});

module.exports = r;

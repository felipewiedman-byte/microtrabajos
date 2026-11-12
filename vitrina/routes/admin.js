// Administración de la plataforma: usuarios, planes y ajustes.
const express = require('express');
const { one, all, run, now, settings, setSetting, DEFAULTS } = require('../lib/db');
const U = require('../lib/util');
const storage = require('../lib/storage');
const Plans = require('../lib/plans');
const Pages = require('../lib/pages');
const B = require('../lib/blocks');
const secrets = require('../lib/secrets');
const platpay = require('../lib/platpay');
const Texts = require('../lib/texts');
const bcrypt = require('bcryptjs');
const mp = require('../lib/mp');
const pp = require('../lib/pp');

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
    .reduce((a, x) => a + x.n * ((Plans.get(x.plan) || {}).price || 0), 0);
  V(res, 'index', { title: 'Administración', admins: one("SELECT COUNT(*) c FROM users WHERE role='admin' AND status='active'").c, st, mrr, rev: platpay.revenue(), tab: 'resumen', sto: { total: storage.totalBytes(), disk: storage.disk(), top: storage.perShop(8), expired: storage.expiredAccounts(180).length }, recent: all("SELECT u.name, u.email, u.created_at, s.name AS shop, s.slug FROM users u LEFT JOIN shops s ON s.user_id=u.id WHERE u.role='owner' ORDER BY u.id DESC LIMIT 8") });
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
      const plan = ['basic', 'pro'].includes(req.body.plan) ? req.body.plan : 'free', months = Math.max(0, Math.min(36, U.int(req.body.months, 1)));
      run('UPDATE users SET plan=?, plan_until=?, trial_until=CASE WHEN ?=\'free\' THEN NULL ELSE trial_until END WHERE id=?', plan, plan === 'free' ? null : (months ? Math.max(now(), u.plan_until || 0) + months * 30 * 86400000 : null), plan, u.id);
      req.flash('ok', plan === 'free' ? 'Cuenta sin plan: su catálogo queda en pausa.' : `Plan ${plan} asignado${months ? ` por ${months} mes(es)` : ' sin vencimiento'}.`);
    } else if (a === 'trial') {
      run('UPDATE users SET trial_until=? WHERE id=?', Math.max(now(), u.trial_until || 0) + 7 * 86400000, u.id);
      req.flash('ok', 'Prueba extendida 7 días.');
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

r.post('/purgar', (req, res, next) => {
  try {
    const days = Math.max(30, Math.min(3650, U.int(req.body.days, 180)));
    const n = storage.purgeExpired(days);
    req.flash('ok', n ? `Se eliminaron ${n} cuenta(s) vencidas hace más de ${days} días, con sus imágenes.` : 'No había cuentas vencidas para eliminar.');
    res.redirect('/admin');
  } catch (e) { next(e); }
});

// ---------- Ajustes generales ----------
r.get('/ajustes', (req, res) => V(res, 'settings', { title: 'Ajustes', tab: 'ajustes' }));
r.post('/ajustes', (req, res, next) => {
  try {
    const b = req.body;
    setSetting('contact_whatsapp', U.phone(b.contact_whatsapp)); setSetting('support_email', U.clean(b.support_email, 120));
    setSetting('signups_open', b.signups_open ? '1' : '0');
    req.flash('ok', 'Ajustes guardados.');
    res.redirect('/admin/ajustes');
  } catch (e) { next(e); }
});

// ---------- Administradores: quién puede entrar a este panel ----------
const adminRows = () => all("SELECT id, name, email, status, last_login, created_at FROM users WHERE role='admin' ORDER BY id");
r.get('/administradores', (req, res) => V(res, 'admins', { title: 'Administradores', tab: 'equipo', rows: adminRows() }));
r.post('/administradores', async (req, res, next) => {
  try {
    const a = req.body.accion, activeAdmins = () => one("SELECT COUNT(*) c FROM users WHERE role='admin' AND status='active'").c;
    const pass = String(req.body.password || '');
    const okPass = () => { if (pass.length < 8 || Buffer.byteLength(pass) > 72) throw U.fail(400, 'La contraseña debe tener entre 8 y 72 caracteres.'); };
    if (a === 'add') {
      const name = U.clean(req.body.name, 60), email = U.clean(req.body.email, 120).toLowerCase();
      if (name.length < 2) throw U.fail(400, 'Escribe el nombre.');
      if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email)) throw U.fail(400, 'Escribe un correo válido.');
      okPass();
      if (one('SELECT 1 x FROM users WHERE email=?', email)) throw U.fail(400, 'Ya existe una cuenta con ese correo.');
      run("INSERT INTO users(name,email,password_hash,role,created_at) VALUES (?,?,?,'admin',?)", name, email, await bcrypt.hash(pass, 11), now());
      req.flash('ok', `${name} ya puede entrar al administrador con ese correo y contraseña. Pásale los datos por un medio seguro.`);
    } else {
      const t = one("SELECT * FROM users WHERE id=? AND role='admin'", U.int(req.body.id));
      if (!t) throw U.fail(404, 'Administrador no encontrado.');
      const self = t.id === req.user.id;
      if (a === 'password') { okPass(); run('UPDATE users SET password_hash=? WHERE id=?', await bcrypt.hash(pass, 11), t.id); run("DELETE FROM sessions WHERE json_extract(sess,'$.userId')=?", t.id); req.flash('ok', 'Contraseña cambiada. Si estaba conectado, se cerró su sesión.'); }
      else if (a === 'status') {
        if (self) throw U.fail(400, 'No puedes bloquear tu propia cuenta.');
        if (t.status === 'active' && activeAdmins() <= 1) throw U.fail(400, 'Debe quedar al menos un administrador activo.');
        run('UPDATE users SET status=? WHERE id=?', t.status === 'active' ? 'suspended' : 'active', t.id); run("DELETE FROM sessions WHERE json_extract(sess,'$.userId')=?", t.id);
        req.flash('ok', t.status === 'active' ? 'Acceso bloqueado.' : 'Acceso restablecido.');
      } else if (a === 'remove') {
        if (self) throw U.fail(400, 'No puedes quitarte a ti mismo.');
        if (t.status === 'active' && activeAdmins() <= 1) throw U.fail(400, 'Debe quedar al menos un administrador activo.');
        run("DELETE FROM sessions WHERE json_extract(sess,'$.userId')=?", t.id); run('DELETE FROM users WHERE id=?', t.id);
        req.flash('ok', 'Administrador eliminado. Ya no puede entrar.');
      }
    }
    res.redirect('/admin/administradores');
  } catch (e) { next(e); }
});

// ---------- Textos del sistema ----------
r.get('/textos', (req, res) => V(res, 'texts', { title: 'Textos', tab: 'textos', LIST: Texts.LIST, saved: Object.fromEntries(Texts.LIST.map((x) => [x[1], settings()['tx_' + x[1]] || ''])) }));
r.post('/textos', (req, res, next) => {
  try {
    for (const [, key, , def, kind] of Texts.LIST) {
      const v = String(req.body['tx_' + key] ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 2000);
      const keep = v && v !== def && !req.body['reset_' + key];
      setSetting('tx_' + key, keep ? (kind === 'text' ? v.replace(/\n+/g, ' ') : v) : '');
    }
    req.flash('ok', 'Textos guardados. Lo vacío vuelve al texto original.');
    res.redirect('/admin/textos');
  } catch (e) { next(e); }
});

// ---------- Planes ----------
r.get('/planes', (req, res) => V(res, 'plans', { title: 'Planes', tab: 'planes' }));
r.post('/planes', (req, res, next) => {
  try {
    const b = req.body;
    const num = (k, min, max, d) => { const n = parseFloat(String(b[k] ?? d).replace(',', '.')); if (!Number.isFinite(n) || n < min || n > max) throw U.fail(400, 'Revisa los valores numéricos de los planes.'); return n; };
    for (const key of Plans.KEYS) {
      const old = Plans.get(key);
      const name = U.clean(b[key + '_name'], 40);
      if (!name) throw U.fail(400, 'Cada plan necesita un nombre.');
      const features = {}; for (const f of Object.keys(Plans.FEATURES)) features[f] = b[`${key}_f_${f}`] ? 1 : 0;
      Plans.save(key, { name, price: key === 'trial' ? 0 : num(key + '_price', 0, 100000), descr: U.clean(b[key + '_descr'], 120), product_limit: Math.round(num(key + '_limit', 0, 1000000)),
        quota_mb: num(key + '_quota', 0.01, 1000000), days: key === 'trial' ? Math.round(num(key + '_days', 0, 365)) : old.days, features, extra: U.clean(b[key + '_extra'], 600), cta: U.clean(b[key + '_cta'], 40),
        hot: b[key + '_hot'], active: key === 'trial' ? (b[key + '_active'] ? 1 : 0) : (b[key + '_active'] ? 1 : 0), disc3: key === 'trial' ? 0 : num(key + '_disc3', 0, 90, 0), disc12: key === 'trial' ? 0 : num(key + '_disc12', 0, 90, 0) });
    }
    setSetting('price_currency', /^[A-Z]{3}$/.test(String(b.price_currency || '').toUpperCase()) ? String(b.price_currency).toUpperCase() : 'USD');
    setSetting('plans_common', U.clean(b.plans_common, 800));
    req.flash('ok', 'Planes guardados.');
    res.redirect('/admin/planes');
  } catch (e) { next(e); }
});

// ---------- Marca: nombre, color, dos logos, favicon, menú y pie ----------
const brandUp = U.uploadMany.fields([{ name: 'logo_light', maxCount: 1 }, { name: 'logo_dark', maxCount: 1 }, { name: 'favicon', maxCount: 1 }]);
r.get('/marca', (req, res) => V(res, 'brand', { title: 'Marca', tab: 'marca' }));
r.post('/marca', brandUp, U.csrfMultipart, async (req, res, next) => {
  try {
    const b = req.body, st = settings();
    setSetting('site_name', U.clean(b.site_name, 40) || DEFAULTS.site_name);
    setSetting('site_tagline', U.clean(b.site_tagline, 140) || DEFAULTS.site_tagline);
    if (/^#[0-9a-f]{6}$/i.test(b.brand_color || '')) setSetting('brand_color', b.brand_color);
    for (const [k, max] of [['nav', 600], ['nav_cta_label', 40], ['nav_cta_url', 200], ['nav_login_label', 40], ['footer_text', 300], ['footer_links', 1500]]) setSetting(k, U.clean(b[k], max));
    for (const [k, maxPx] of [['logo_light', 600], ['logo_dark', 600]]) {
      const f = req.files && req.files[k] && req.files[k][0];
      if (f) { const n = await U.keepImage(f, maxPx); if (n) { U.dropImage(st[k]); setSetting(k, n); } }
      else if (b['remove_' + k] && st[k]) { U.dropImage(st[k]); setSetting(k, ''); }
    }
    const ff = req.files && req.files.favicon && req.files.favicon[0];
    if (ff) { const n = await U.keepFavicon(ff); if (n) { U.dropImage(st.favicon); setSetting('favicon', n); } }
    else if (b.remove_favicon && st.favicon) { U.dropImage(st.favicon); setSetting('favicon', ''); }
    U.dropTemp(req);
    req.flash('ok', 'Marca guardada.');
    res.redirect('/admin/marca');
  } catch (e) { U.dropTemp(req); next(e); }
});

// ---------- Páginas y secciones ----------
r.get('/paginas', (req, res) => V(res, 'pages', { title: 'Páginas', tab: 'paginas', rows: Pages.list(), builtin: Pages.BUILTIN }));
r.post('/paginas', (req, res, next) => {
  try {
    const slug = String(req.body.slug || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40), title = U.clean(req.body.title, 80);
    if (slug.length < 2 || !title) throw U.fail(400, 'Escribe un título y una dirección (mínimo 2 caracteres).');
    if (Pages.RESERVED.has(slug) || Pages.get(slug)) throw U.fail(400, 'Esa dirección ya existe o está reservada.');
    Pages.create(slug, title);
    req.flash('ok', 'Página creada. Agrega tus secciones.');
    res.redirect('/admin/paginas/' + slug);
  } catch (e) { next(e); }
});
const pageUrl = (slug) => slug === 'home' ? '/' : (Pages.BUILTIN.has(slug) ? '/' + slug : '/p/' + slug);
r.get('/paginas/:slug', (req, res, next) => {
  const page = Pages.get(req.params.slug);
  if (!page) return next(U.fail(404, 'Página no encontrada.'));
  V(res, 'page-edit', { title: 'Editar página', tab: 'paginas', page, TYPES: B.TYPES, url: pageUrl(page.slug), builtin: Pages.BUILTIN.has(page.slug) });
});
// HTML propio: se quitan scripts, manejadores on*= y enlaces javascript: (además la política de seguridad ya impide ejecutarlos).
const clean_ = (v, html) => html ? v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<script[^>]*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '') : v;
function readBlocks(body) {
  const n = Math.min(60, U.int(body.count, 0)), out = [];
  for (let i = 0; i < n; i++) {
    const type = body[`b${i}_type`], def = B.TYPES[type];
    if (!def) continue;
    const blk = { type };
    for (const [k, , kind, extra] of def.fields) {
      const v = body[`b${i}_${k}`];
      if (kind === 'check') blk[k] = v ? '1' : '';
      else if (kind === 'select') blk[k] = (extra || []).some((o) => o[0] === v) ? v : (extra || [[]])[0][0] || '';
      else if (kind === 'image') blk[k] = /^[a-f0-9]{28}\.(jpg|png|webp)$/.test(v || '') && !body[`b${i}_${k}_rm`] ? v : '';
      else blk[k] = clean_(String(v ?? '').replace(/\r\n?/g, '\n').slice(0, type === 'html' || k === 'body' ? 20000 : 6000), type === 'html');
    }
    if (blk.anchor !== undefined) blk.anchor = String(blk.anchor).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    out.push(blk);
  }
  return out;
}
r.post('/paginas/:slug', U.uploadMany.any(), U.csrfMultipart, async (req, res, next) => {
  try {
    const page = Pages.get(req.params.slug);
    if (!page) throw U.fail(404, 'Página no encontrada.');
    const old = JSON.stringify(page.blocks);
    let blocks = readBlocks(req.body);
    // Imágenes nuevas de las secciones
    for (const f of req.files || []) {
      const m = /^b(\d+)_(\w+)_file$/.exec(f.fieldname);
      if (!m || !blocks[+m[1]]) continue;
      const n = await U.keepImage(f, 1400);
      if (n) blocks[+m[1]][m[2]] = n;
    }
    // Acciones: agregar, mover, duplicar, eliminar
    const act = String(req.body.act || 'save'), [a, ix] = act.split(':'), i = parseInt(ix, 10);
    if (a === 'add' && B.TYPES[req.body.newtype]) blocks.push({ type: req.body.newtype, bg: 'white', ...(B.TYPES[req.body.newtype].defaults || {}), title: 'Nueva sección' });
    else if (a === 'up' && i > 0) [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
    else if (a === 'down' && i < blocks.length - 1) [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
    else if (a === 'dup' && blocks[i]) blocks.splice(i + 1, 0, JSON.parse(JSON.stringify(blocks[i])));
    else if (a === 'del' && blocks[i]) blocks.splice(i, 1);
    Pages.save(page.slug, { title: U.clean(req.body.title, 80), descr: U.clean(req.body.descr, 200), blocks, published: page.slug === 'home' ? 1 : (req.body.published ? 1 : 0) });
    // Imágenes que dejaron de usarse
    const now_ = JSON.stringify(blocks);
    for (const m of old.matchAll(/[a-f0-9]{28}\.(?:jpg|png|webp)/g)) if (!now_.includes(m[0])) U.dropImage(m[0]);
    U.dropTemp(req);
    req.flash('ok', a === 'add' ? 'Sección agregada al final.' : a === 'save' ? 'Página guardada.' : 'Listo.');
    res.redirect('/admin/paginas/' + page.slug + (a === 'add' ? '#fin' : (['up', 'down', 'dup'].includes(a) ? '#s' + (a === 'up' ? i - 1 : a === 'down' ? i + 1 : i + 1) : '')));
  } catch (e) { U.dropTemp(req); next(e); }
});
r.post('/paginas/:slug/borrar', (req, res, next) => {
  try {
    if (Pages.BUILTIN.has(req.params.slug)) throw U.fail(400, 'Las páginas base no se eliminan; puedes restaurarlas.');
    const pg = Pages.get(req.params.slug);
    if (pg) for (const m of JSON.stringify(pg.blocks).matchAll(/[a-f0-9]{28}\.(?:jpg|png|webp)/g)) U.dropImage(m[0]);
    Pages.remove(req.params.slug); req.flash('ok', 'Página eliminada.'); res.redirect('/admin/paginas');
  } catch (e) { next(e); }
});
r.post('/paginas/:slug/restaurar', (req, res, next) => {
  try {
    if (!Pages.BUILTIN.has(req.params.slug)) throw U.fail(400, 'Solo las páginas base se pueden restaurar.');
    Pages.reset(req.params.slug); req.flash('ok', 'Página restaurada al contenido original.'); res.redirect('/admin/paginas/' + req.params.slug);
  } catch (e) { next(e); }
});

// ---------- Pagos de la plataforma (tus claves de Mercado Pago y PayPal) ----------
r.get('/pagos', (req, res) => V(res, 'payments', { title: 'Pagos', tab: 'pagos', masks: { mp: secrets.appGet('plat_mp_token') ? '••••••••' + secrets.appGet('plat_mp_token').slice(-4) : '', ppid: secrets.appGet('plat_pp_id') ? '••••' + secrets.appGet('plat_pp_id').slice(-4) : '', pps: secrets.appGet('plat_pp_secret') ? '••••••••' : '' }, pv: platpay.providers(), orders: platpay.recent(25), rev: platpay.revenue(), base: res.locals.baseUrl }));
r.post('/pagos', async (req, res, next) => {
  try {
    const b = req.body, a = b.accion;
    if (a === 'save') {
      if (U.clean(b.mp_token, 400)) secrets.appSet('plat_mp_token', U.clean(b.mp_token, 400));
      if (U.clean(b.pp_id, 300)) secrets.appSet('plat_pp_id', U.clean(b.pp_id, 300));
      if (U.clean(b.pp_secret, 300)) secrets.appSet('plat_pp_secret', U.clean(b.pp_secret, 300));
      for (const k of ['remove_mp', 'remove_pp']) if (b[k]) { if (k === 'remove_mp') secrets.appSet('plat_mp_token', ''); else { secrets.appSet('plat_pp_id', ''); secrets.appSet('plat_pp_secret', ''); } }
      setSetting('plat_pp_mode', b.pp_mode === 'live' ? 'live' : 'sandbox');
      setSetting('plat_mp_on', b.mp_on ? '1' : '0'); setSetting('plat_pp_on', b.pp_on ? '1' : '0'); setSetting('mp_enabled', b.mp_enabled ? '1' : '0');
      req.flash('ok', 'Pagos guardados.');
    } else if (a === 'test_mp') {
      try { const w = await mp.whoami(secrets.appGet('plat_mp_token')); req.flash('ok', `Mercado Pago conectado${w && w.nickname ? ': ' + w.nickname : ''}.`); } catch { req.flash('error', 'Mercado Pago no aceptó el Access Token.'); }
    } else if (a === 'test_pp') {
      try { const c = platpay.ppConfig(); await pp.token(c.id, c.secret, c.mode); req.flash('ok', `PayPal conectado (${c.mode === 'live' ? 'producción' : 'pruebas'}).`); } catch { req.flash('error', 'PayPal no aceptó las credenciales (revisa también el modo pruebas/producción).'); }
    }
    res.redirect('/admin/pagos');
  } catch (e) { next(e); }
});

module.exports = r;

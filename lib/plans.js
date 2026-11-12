// Planes editables desde Admin → Planes: nombre, precio, productos, espacio, días de prueba y qué incluye cada uno.
const { db, one, all, run, now, settings } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS plans (
  key TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, descr TEXT NOT NULL DEFAULT '',
  product_limit INTEGER NOT NULL DEFAULT 10, quota_mb REAL NOT NULL DEFAULT 20, days INTEGER NOT NULL DEFAULT 0,
  features TEXT NOT NULL DEFAULT '{}', extra TEXT NOT NULL DEFAULT '', cta TEXT NOT NULL DEFAULT '',
  hot INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, disc3 REAL NOT NULL DEFAULT 0, disc12 REAL NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0)`);

// Funciones que se pueden activar o quitar a cada plan.
const FEATURES = {
  coupons: 'Cupones de descuento',
  stats: 'Reportes: más vendidos y visitas',
  clients: 'Lista de clientes y exportación a Excel',
  payments: 'Cobro en línea con Mercado Pago',
  nobrand: 'Sin sello de la plataforma',
  domain: 'Dominio propio (www.tunegocio.com)',
};
const KEYS = ['trial', 'basic', 'pro'];

if (!one('SELECT 1 x FROM plans')) {
  const st = settings();
  const f = (o) => JSON.stringify({ coupons: 1, stats: 1, clients: 1, payments: 1, nobrand: 1, ...o });
  const ins = (r) => run('INSERT INTO plans(key,name,price,descr,product_limit,quota_mb,days,features,extra,cta,hot,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', ...r);
  ins(['trial', 'Prueba gratis', 0, 'La experiencia completa, sin tarjeta.', parseInt(st.limit_trial, 10) || 10, parseFloat(st.quota_trial_mb) || 20, parseInt(st.trial_days, 10) || 14, f({}), '', 'Empezar la prueba', 0, 1]);
  ins(['basic', 'Básico', parseFloat(st.price_basic) || 4, 'Para negocios que venden cada semana.', parseInt(st.limit_basic, 10) || 200, parseFloat(st.quota_basic_mb) || 300, 0, f({ stats: 0, clients: 0 }), '', 'Elegir Básico', 1, 2]);
  ins(['pro', 'Pro', parseFloat(st.price_pro) || 8, 'Para negocios que quieren crecer con datos.', parseInt(st.limit_pro, 10) || 1000, parseFloat(st.quota_pro_mb) || 1500, 0, f({}), 'Prioridad en soporte', 'Elegir Pro', 0, 3]);
}

// Migración: el plan Pro existente recibe "Dominio propio" una sola vez.
if (!one("SELECT 1 x FROM settings WHERE key='plan_domain_v1'")) {
  const pro = one("SELECT features FROM plans WHERE key='pro'");
  if (pro) { let ft = {}; try { ft = JSON.parse(pro.features); } catch { /* vacío */ } if (!('domain' in ft)) { ft.domain = 1; run("UPDATE plans SET features=? WHERE key='pro'", JSON.stringify(ft)); } }
  run("INSERT INTO settings(key,value) VALUES ('plan_domain_v1','1')");
}
let cache = null;
function plans() {
  if (cache) return cache;
  const o = {};
  for (const r of all('SELECT * FROM plans ORDER BY sort')) { let ft = {}; try { ft = JSON.parse(r.features); } catch { /* vacío */ } o[r.key] = { ...r, features: ft }; }
  cache = o; return o;
}
const get = (key) => plans()[key] || null;
const list = () => Object.values(plans());
const invalidate = () => { cache = null; };
const currency = () => settings().price_currency || 'USD';
// Precio total por N meses con el descuento configurado (3 y 12 meses).
function priceFor(plan, months) {
  const disc = months >= 12 ? plan.disc12 : months >= 3 ? plan.disc3 : 0;
  return Math.round(plan.price * months * (1 - (disc || 0) / 100) * 100) / 100;
}
function save(key, d) {
  run('UPDATE plans SET name=?, price=?, descr=?, product_limit=?, quota_mb=?, days=?, features=?, extra=?, cta=?, hot=?, active=?, disc3=?, disc12=? WHERE key=?',
    d.name, d.price, d.descr, d.product_limit, d.quota_mb, d.days, JSON.stringify(d.features), d.extra, d.cta, d.hot ? 1 : 0, d.active ? 1 : 0, d.disc3, d.disc12, key);
  invalidate();
}
// Suma meses de calendario (31 ene + 1 mes = 28/29 feb) en UTC.
function addMonths(ts, n) {
  const d = new Date(ts), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d.getTime();
}
module.exports = { addMonths, FEATURES, KEYS, get, list, save, invalidate, currency, priceFor };

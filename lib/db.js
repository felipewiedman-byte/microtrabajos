// Base de datos SQLite (módulo nativo de Node.js 22+): esquema, ajustes y ayudantes.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'vitrina.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'free',
  plan_until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'productos',
  whatsapp TEXT NOT NULL DEFAULT '',
  messenger TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'COP',
  tz TEXT NOT NULL DEFAULT 'America/Bogota',
  color TEXT NOT NULL DEFAULT '#0f766e',
  logo TEXT,
  cover TEXT,
  hours TEXT NOT NULL DEFAULT '{}',
  pickup_on INTEGER NOT NULL DEFAULT 1,
  delivery_on INTEGER NOT NULL DEFAULT 0,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  min_order_cents INTEGER NOT NULL DEFAULT 0,
  payment_info TEXT NOT NULL DEFAULT '',
  accepting INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cat_shop ON categories(shop_id, sort);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  compare_cents INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  stock INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prod_shop ON products(shop_id, active, sort);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'pct',
  value INTEGER NOT NULL,
  min_cents INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 0,
  uses INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(shop_id, code)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'pickup',
  address TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  delivery_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  coupon_code TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ord_shop ON orders(shop_id, created_at DESC);
CREATE TABLE IF NOT EXISTS visits (
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, day)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
`);

const CREATE_SECRETS = `CREATE TABLE IF NOT EXISTS shop_secrets (shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE, k TEXT NOT NULL, v TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (shop_id, k))`;
db.exec(CREATE_SECRETS);
for (const sql of [
  "ALTER TABLE orders ADD COLUMN pay_status TEXT NOT NULL DEFAULT 'none'", "ALTER TABLE orders ADD COLUMN pay_method TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN pay_ref TEXT NOT NULL DEFAULT ''", 'ALTER TABLE orders ADD COLUMN paid_at INTEGER',
  'ALTER TABLE shops ADD COLUMN pay_mp INTEGER NOT NULL DEFAULT 0',
  // Opciones por producto (talla, color, adicionales), fotos extra, zonas de domicilio, estilo, medición y dominio propio.
  "ALTER TABLE products ADD COLUMN options TEXT NOT NULL DEFAULT ''", "ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE shops ADD COLUMN zones TEXT NOT NULL DEFAULT ''", "ALTER TABLE shops ADD COLUMN layout TEXT NOT NULL DEFAULT 'list'",
  "ALTER TABLE shops ADD COLUMN fb_pixel TEXT NOT NULL DEFAULT ''", "ALTER TABLE shops ADD COLUMN ga_id TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE shops ADD COLUMN domain TEXT', "ALTER TABLE shops ADD COLUMN seo_title TEXT NOT NULL DEFAULT ''", "ALTER TABLE shops ADD COLUMN seo_desc TEXT NOT NULL DEFAULT ''", "ALTER TABLE shops ADD COLUMN seo_keywords TEXT NOT NULL DEFAULT ''", 'ALTER TABLE shops ADD COLUMN seo_image TEXT', "ALTER TABLE users ADD COLUMN notice_sent TEXT NOT NULL DEFAULT ''", 'ALTER TABLE users ADD COLUMN google_sub TEXT', 'ALTER TABLE shops ADD COLUMN order_seq INTEGER', 'ALTER TABLE shops ADD COLUMN agenda_on INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE shops ADD COLUMN agenda_days INTEGER NOT NULL DEFAULT 14', 'ALTER TABLE shops ADD COLUMN agenda_step INTEGER NOT NULL DEFAULT 30', 'ALTER TABLE shops ADD COLUMN agenda_cap INTEGER NOT NULL DEFAULT 1', 'ALTER TABLE products ADD COLUMN duration INTEGER', 'ALTER TABLE users ADD COLUMN trial_until INTEGER', 'ALTER TABLE users ADD COLUMN last_login INTEGER', "ALTER TABLE orders ADD COLUMN pay_choice TEXT NOT NULL DEFAULT ''",
]) { try { db.exec(sql); } catch { /* la columna ya existe */ } }
// Índices para que contar pedidos nuevos y numerar pedidos no dependa de cuántos pedidos tenga el negocio.
db.exec('CREATE INDEX IF NOT EXISTS idx_ord_status ON orders(shop_id, status, pay_status)');
db.exec('UPDATE shops SET order_seq=(SELECT COUNT(*) FROM orders o WHERE o.shop_id=shops.id) WHERE order_seq IS NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_google ON users(google_sub) WHERE google_sub IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_domain ON shops(domain) WHERE domain IS NOT NULL');

// ---------- Ayudantes con caché de sentencias preparadas ----------
const stmts = new Map();
const prep = (sql) => { let s = stmts.get(sql); if (!s) { s = db.prepare(sql); stmts.set(sql, s); } return s; };
const one = (sql, ...p) => prep(sql).get(...p);
const all = (sql, ...p) => prep(sql).all(...p);
const run = (sql, ...p) => prep(sql).run(...p);
const now = () => Date.now();
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* ya cerrada */ } throw e; }
}

// ---------- Ajustes editables desde el administrador (caché de 30 s) ----------
const DEFAULTS = {
  site_name: 'Vitrina',
  site_tagline: 'Tu catálogo en un link. Los pedidos llegan a tu WhatsApp.',
  price_basic: '4', price_pro: '8', price_currency: 'USD',
  limit_free: '10', limit_basic: '200', limit_pro: '1000',
  contact_whatsapp: '', support_email: '',
  signups_open: '1', trial_days: '14', limit_trial: '10', quota_trial_mb: '20', quota_basic_mb: '300', quota_pro_mb: '1500',
  // Marca y navegación (todo editable desde Admin → Marca)
  brand_color: '#0f766e', logo_light: '', logo_dark: '', favicon: '',
  nav: 'Cómo funciona | /#como\nFunciones | /#funciones\nPrecios | /#precios', nav_cta_label: 'Crear mi catálogo', nav_cta_url: '/registro', nav_login_label: 'Ingresar',
  footer_text: 'Tu catálogo profesional en un link, con pedidos por WhatsApp y Messenger, para negocios de cualquier tamaño.',
  footer_links: 'Producto | Cómo funciona | /#como\nProducto | Funciones | /#funciones\nProducto | Precios | /#precios\nProducto | Crear mi catálogo | /registro\nCuenta | Ingresar | /ingresar\nCuenta | Recuperar contraseña | /recuperar\nLegal | Términos de uso | /terminos\nLegal | Privacidad | /privacidad',
  // Cobros
  plans_common: 'Pedidos por WhatsApp y Messenger\nInventario con “agotado” automático\nCódigo QR y compartir en redes',
  smtp_host: '', smtp_port: '587', smtp_secure: '', smtp_user: '', smtp_from: '',
  // SEO y redes (Admin → Sitio web → SEO y redes)
  seo_title: '', seo_keywords: '', seo_image: '', google_verify: '', bing_verify: '',
  mp_enabled: '0', plat_mp_on: '0', plat_pp_on: '0', plat_pp_mode: 'sandbox',
};
let cache = null, cacheAt = 0;
function settings() {
  if (cache && now() - cacheAt < 30000) return cache;
  const o = { ...DEFAULTS };
  for (const r of all('SELECT key, value FROM settings')) o[r.key] = r.value;
  cache = o; cacheAt = now();
  return o;
}
function setSetting(key, value) {
  run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value));
  cache = null;
}

// Migración única: las cuentas anteriores (plan gratis) reciben una prueba desde hoy para no quedar pausadas de golpe.
if (!one("SELECT 1 x FROM settings WHERE key='trial_v1'")) {
  const days = parseInt(settings().trial_days, 10) || 0;
  if (days > 0) run("UPDATE users SET trial_until=? WHERE role='owner' AND trial_until IS NULL AND plan='free'", now() + days * 86400000);
  run("INSERT INTO settings(key,value) VALUES ('trial_v1','1')");
  cache = null;
}

module.exports = { db, DATA_DIR, one, all, run, now, tx, settings, setSetting, DEFAULTS };

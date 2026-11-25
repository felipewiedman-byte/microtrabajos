// Reseñas: solo quien hizo un pedido real puede calificar (enlace firmado por pedido). Una reseña por pedido.
const crypto = require('crypto');
const { db, one, all, run, now } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL UNIQUE, name TEXT NOT NULL, stars INTEGER NOT NULL, body TEXT NOT NULL DEFAULT '', visible INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_rev_shop ON reviews(shop_id, visible, id DESC)');

const KEY = String(process.env.SESSION_SECRET || 'cambiar-este-secreto') + ':vitrina-review';
const token = (orderId) => orderId + '-' + crypto.createHmac('sha256', KEY).update(String(orderId)).digest('base64url').slice(0, 16);
function orderFromToken(t) {
  const m = /^(\d{1,10})-([\w-]{16})$/.exec(String(t || ''));
  if (!m) return null;
  const good = token(Number(m[1]));
  return crypto.timingSafeEqual(Buffer.from(good), Buffer.from(m[0])) ? Number(m[1]) : null;
}
const linkFor = (base, shop, orderId) => `${base}/t/${shop.slug}/opinar/${token(orderId)}`;

// Promedio y cantidad (caché corta por negocio: se pide en cada visita al catálogo).
const cache = new Map();
function summary(shopId) {
  const c = cache.get(shopId);
  if (c && Date.now() - c.at < 60000) return c.v;
  const r = one('SELECT COUNT(*) n, AVG(stars) avg FROM reviews WHERE shop_id=? AND visible=1', shopId);
  const v = { n: r.n, avg: r.n ? Math.round(r.avg * 10) / 10 : 0 };
  if (cache.size > 5000) cache.clear();
  cache.set(shopId, { at: Date.now(), v });
  return v;
}
const bust = (shopId) => cache.delete(shopId);
const latest = (shopId, n = 12) => all('SELECT name, stars, body, created_at FROM reviews WHERE shop_id=? AND visible=1 ORDER BY id DESC LIMIT ?', shopId, n);
function save(shop, orderId, { stars, name, body }) {
  run(`INSERT INTO reviews(shop_id,order_id,name,stars,body,created_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(order_id) DO UPDATE SET name=excluded.name, stars=excluded.stars, body=excluded.body`, shop.id, orderId, name, stars, body, now());
  bust(shop.id);
}
module.exports = { token, orderFromToken, linkFor, summary, latest, save, bust };

// Notificaciones push de pedidos nuevos al celular o computador del negocio (aunque tenga el panel cerrado).
// Claves VAPID generadas una sola vez y guardadas cifradas. Suscripciones vencidas se eliminan solas.
const { db, one, all, run, now, settings } = require('./db');
const secrets = require('./secrets');

db.exec(`CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_push_shop ON push_subs(shop_id)');

let wp = null;
function lib() {
  if (wp) return wp;
  try { wp = require('web-push'); } catch { return null; }
  let pub = settings().vapid_public, priv = secrets.appGet('vapid_private');
  if (!pub || !priv) {
    const k = wp.generateVAPIDKeys(); pub = k.publicKey; priv = k.privateKey;
    secrets.appSet('vapid_private', priv);
    require('./db').setSetting('vapid_public', pub);
  }
  const mail = settings().support_email || 'soporte@' + (String(process.env.BASE_URL || 'localhost').replace(/^https?:\/\//, '').replace(/[:/].*$/, '') || 'localhost');
  wp.setVapidDetails('mailto:' + mail, pub, priv);
  wp._pub = pub;
  return wp;
}
const publicKey = () => { const w = lib(); return w ? w._pub : ''; };

const MAX_PER_SHOP = 10;
function subscribe(shopId, sub) {
  const ep = String(sub && sub.endpoint || ''), k = (sub && sub.keys) || {};
  if (!/^https:\/\/[^\s]{10,900}$/.test(ep) || !/^[\w-]{20,200}$/.test(k.p256dh || '') || !/^[\w-]{10,100}$/.test(k.auth || '')) return false;
  run('INSERT INTO push_subs(shop_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET shop_id=excluded.shop_id, p256dh=excluded.p256dh, auth=excluded.auth', shopId, ep, k.p256dh, k.auth, now());
  // Máximo 10 dispositivos por negocio: se conservan los más recientes.
  run('DELETE FROM push_subs WHERE shop_id=? AND id NOT IN (SELECT id FROM push_subs WHERE shop_id=? ORDER BY id DESC LIMIT ?)', shopId, shopId, MAX_PER_SHOP);
  return true;
}
const unsubscribe = (shopId, endpoint) => run('DELETE FROM push_subs WHERE shop_id=? AND endpoint=?', shopId, String(endpoint || ''));
const count = (shopId) => one('SELECT COUNT(*) c FROM push_subs WHERE shop_id=?', shopId).c;

// Envía en segundo plano; nunca demora ni rompe el pedido.
function notify(shopId, payload) {
  const subs = all('SELECT * FROM push_subs WHERE shop_id=?', shopId);
  if (!subs.length) return;
  const w = lib(); if (!w) return;
  const body = JSON.stringify(payload);
  for (const s of subs) {
    w.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: 'high', timeout: 8000 })
      .catch((e) => { if (e && (e.statusCode === 404 || e.statusCode === 410)) run('DELETE FROM push_subs WHERE id=?', s.id); });
  }
}
module.exports = { publicKey, subscribe, unsubscribe, notify, count };

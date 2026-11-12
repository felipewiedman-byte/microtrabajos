// Claves de cobro de cada negocio guardadas cifradas (AES-256-GCM). Nunca se envían a las vistas: solo se muestran enmascaradas.
const crypto = require('crypto');
const { one, run, now } = require('./db');

const KEY = crypto.createHash('sha256').update(String(process.env.SESSION_SECRET || 'cambiar-este-secreto') + ':vitrina-secrets').digest();
function enc(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function dec(payload) {
  try {
    const [iv, tag, data] = payload.split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return ''; }
}
const get = (shopId, k) => { const r = one('SELECT v FROM shop_secrets WHERE shop_id=? AND k=?', shopId, k); return r ? dec(r.v) : ''; };
function set(shopId, k, v) {
  if (!v) return run('DELETE FROM shop_secrets WHERE shop_id=? AND k=?', shopId, k);
  run('INSERT INTO shop_secrets(shop_id,k,v,updated_at) VALUES (?,?,?,?) ON CONFLICT(shop_id,k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at', shopId, k, enc(v), now());
}
const mask = (shopId, k) => { const v = get(shopId, k); return v ? '••••••••' + v.slice(-4) : ''; };
module.exports = { get, set, mask };

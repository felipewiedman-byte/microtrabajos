// Claves de pasarelas guardadas cifradas (AES-256-GCM) en la base de datos.
// Nunca se envían completas a las vistas: solo se muestran enmascaradas.
const crypto = require('crypto');
const { db, one, run, now } = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
const KEY = crypto.createHash('sha256').update(String(process.env.SESSION_SECRET || 'cambiar-este-secreto') + ':microtrabajo-secrets').digest();

function enc(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function dec(payload) {
  try {
    const [iv, tag, data] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return ''; }
}
function get(key) { const r = one('SELECT value FROM secrets WHERE key=?', key); return r ? dec(r.value) : ''; }
function set(key, value) {
  if (!value) return run('DELETE FROM secrets WHERE key=?', key);
  run('INSERT INTO secrets(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', key, enc(value), now());
}
function mask(key) { const v = get(key); return v ? '••••••••' + v.slice(-4) : ''; }
module.exports = { get, set, mask };

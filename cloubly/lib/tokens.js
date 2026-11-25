// Enlaces de un solo uso (recuperar contraseña). En la base solo se guarda el hash.
const crypto = require('crypto');
const { one, run, now } = require('./db');

const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
function create(userId, kind, ttlMs) {
  run('DELETE FROM auth_tokens WHERE user_id=? AND kind=?', userId, kind);
  const raw = crypto.randomBytes(32).toString('base64url');
  run('INSERT INTO auth_tokens(user_id, kind, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)', userId, kind, hash(raw), now() + ttlMs, now());
  return raw;
}
function peek(kind, raw) {
  if (typeof raw !== 'string' || raw.length < 20 || raw.length > 80) return null;
  return one('SELECT * FROM auth_tokens WHERE kind=? AND token_hash=? AND expires_at>?', kind, hash(raw), now()) || null;
}
function consume(kind, raw) {
  const t = peek(kind, raw);
  return t && run('DELETE FROM auth_tokens WHERE id=?', t.id).changes ? t : null;
}
setInterval(() => { try { run('DELETE FROM auth_tokens WHERE expires_at < ?', now()); } catch (e) { console.error(e); } }, 60 * 60 * 1000).unref();

module.exports = { create, peek, consume };

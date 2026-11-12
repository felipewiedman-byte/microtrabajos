// Límites de intentos guardados en SQLite: sobreviven a reinicios.
const { one, run, now } = require('./db');

// Cuenta un intento. Devuelve true si sigue dentro del máximo de la ventana.
function take(key, max, windowMs) {
  const t = now();
  const r = one('SELECT n, reset_at FROM rate_limits WHERE k=?', key);
  if (!r || r.reset_at <= t) { run('INSERT OR REPLACE INTO rate_limits(k, n, reset_at) VALUES (?,?,?)', key, 1, t + windowMs); return max >= 1; }
  run('UPDATE rate_limits SET n=n+1 WHERE k=?', key);
  return r.n + 1 <= max;
}
const clear = (key) => run('DELETE FROM rate_limits WHERE k=?', key);
setInterval(() => { try { run('DELETE FROM rate_limits WHERE reset_at < ?', now()); } catch (e) { console.error(e); } }, 60 * 60 * 1000).unref();

module.exports = { take, clear };

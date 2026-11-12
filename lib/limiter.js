// Límites de intentos guardados en SQLite: sobreviven a reinicios y funcionan con varios procesos.
const { one, run, now } = require('./db');

// Cuenta un intento. Devuelve true si todavía está dentro del máximo de la ventana.
function take(key, max, windowMs) {
  const t = now();
  const r = one('SELECT n, reset_at FROM rate_limits WHERE k=?', key);
  if (!r || r.reset_at <= t) { run('INSERT OR REPLACE INTO rate_limits(k, n, reset_at) VALUES (?,?,?)', key, 1, t + windowMs); return max >= 1; }
  run('UPDATE rate_limits SET n=n+1 WHERE k=?', key);
  return r.n + 1 <= max;
}
// ¿Ya se alcanzó el máximo? (no cuenta un intento nuevo)
function blocked(key, max) {
  const r = one('SELECT n, reset_at FROM rate_limits WHERE k=?', key);
  return !!r && r.reset_at > now() && r.n >= max;
}
const clear = (key) => run('DELETE FROM rate_limits WHERE k=?', key);

// Limpieza horaria de registros vencidos.
setInterval(() => { try { run('DELETE FROM rate_limits WHERE reset_at < ?', now()); } catch (e) { console.error(e); } }, 60 * 60 * 1000).unref();

module.exports = { take, blocked, clear };

// Textos editables desde el panel. Cada texto se registra solo la primera vez que se muestra,
// con su valor original; el administrador puede cambiarlo y volver al original cuando quiera.
const { all, run, now, one } = require('./db');
// {{sitio}} se reemplaza por el nombre actual de la web (Admin → Configuración → Nombre de la web).
const withName = (s) => (typeof s === 'string' && s.includes('{{sitio}}') ? s.split('{{sitio}}').join(String(one("SELECT value FROM settings WHERE key='site_name'")?.value || '')) : s);

let cache = null;
function load() {
  cache = new Map();
  for (const r of all('SELECT key, value, default_value FROM texts')) cache.set(r.key, r);
}
function t(key, def) {
  if (!cache) load();
  const r = cache.get(key);
  if (!r) {
    run('INSERT OR IGNORE INTO texts(key, default_value, updated_at) VALUES (?,?,?)', key, def, now());
    cache.set(key, { key, value: null, default_value: def });
    return withName(def);
  }
  if (r.default_value !== def) { run('UPDATE texts SET default_value=? WHERE key=?', def, key); r.default_value = def; }
  return withName(r.value != null && r.value !== '' ? r.value : def);
}
function reset() { cache = null; }
module.exports = { t, reset };

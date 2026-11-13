// Caché de páginas públicas (catálogos e inicio) para visitantes anónimos: se renderiza una vez y se sirve ya comprimida.
// Se invalida sola a los 30 s y al instante cuando se edita algo (producto, pedido, plan, textos, páginas...).
const zlib = require('zlib');
const store = new Map(); // clave -> { gz, at, shop, size }
let bytes = 0;
const TTL = 30000, MAX_BYTES = 30 * 1024 * 1024;
const drop = (k) => { const e = store.get(k); if (e) { bytes -= e.size; store.delete(k); } };
function get(key) { const e = store.get(key); if (!e) return null; if (Date.now() - e.at > TTL) { drop(key); return null; } return e; }
function set(key, html, shopId = 0) {
  const gz = zlib.gzipSync(html, { level: 6 });
  drop(key);
  while (bytes + gz.length > MAX_BYTES && store.size) drop(store.keys().next().value);
  const e = { gz, at: Date.now(), shop: shopId, size: gz.length }; store.set(key, e); bytes += gz.length; return e;
}
const bust = (shopId) => { for (const [k, e] of store) if (e.shop === shopId) drop(k); };
// Por pedidos (solo cambia el inventario): la página se renueva a más tardar en 2 s en vez de al instante.
// Con muchos pedidos seguidos el catálogo se vuelve a armar una sola vez. El inventario real siempre se valida al pedir.
const SOFT = Number(process.env.CACHE_SOFT_MS || 2000);
const softBust = (shopId) => { const lim = Date.now() - TTL + SOFT; for (const e of store.values()) if (e.shop === shopId && e.at > lim) e.at = lim; };
const bustAll = () => { store.clear(); bytes = 0; };
function send(req, res, e) {
  res.set({ 'Content-Type': 'text/html; charset=utf-8', Vary: 'Accept-Encoding', 'Cache-Control': 'no-cache' });
  if (req.acceptsEncodings('gzip')) { res.set('Content-Encoding', 'gzip'); return res.send(e.gz); }
  res.send(zlib.gunzipSync(e.gz));
}
module.exports = { get, set, bust, softBust, bustAll, send, stats: () => ({ entries: store.size, bytes }) };

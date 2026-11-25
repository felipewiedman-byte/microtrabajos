// Seguimiento de pedidos: historial de estados con fecha y hora, enlace firmado para el cliente y número de guía.
const crypto = require('crypto');
const { db, all, run, now } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS order_events (order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, status TEXT NOT NULL, at INTEGER NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_oev_order ON order_events(order_id, at)');

const KEY = String(process.env.SESSION_SECRET || 'cambiar-este-secreto') + ':vitrina-track';
const token = (orderId) => orderId + '-' + crypto.createHmac('sha256', KEY).update(String(orderId)).digest('base64url').slice(0, 16);
function orderFromToken(t) {
  const m = /^(\d{1,10})-([\w-]{16})$/.exec(String(t || ''));
  if (!m) return null;
  const good = Buffer.from(token(Number(m[1])));
  return good.length === Buffer.byteLength(m[0]) && crypto.timingSafeEqual(good, Buffer.from(m[0])) ? Number(m[1]) : null;
}
const linkFor = (base, shop, orderId) => `${base}/t/${shop.slug}/seguimiento/${token(orderId)}`;
const log = (orderId, status) => run('INSERT INTO order_events(order_id,status,at) VALUES (?,?,?)', orderId, status, now());

// Pasos que ve el cliente (el 4.º cambia si recoge en el local).
const STEPS = ['new', 'confirmed', 'preparing', 'ready', 'done'];
const label = (st, pickup) => ({ new: 'Recibido', confirmed: 'Confirmado', preparing: 'En preparación', ready: pickup ? 'Listo para recoger' : 'Enviado', done: 'Entregado', cancelled: 'Cancelado' })[st] || st;
const detail = (st, pickup) => ({ new: 'El negocio recibió tu pedido.', confirmed: 'El negocio confirmó tu pedido.', preparing: 'Están preparando tu pedido.', ready: pickup ? 'Tu pedido te espera en el local.' : 'Tu pedido va en camino.', done: pickup ? 'Recogiste tu pedido.' : 'Tu pedido fue entregado.', cancelled: 'El pedido fue cancelado.' })[st] || '';

// Historial: el momento de recibido es la fecha del pedido; luego cada cambio registrado (el último de cada estado).
function timeline(o) {
  const ev = all('SELECT status, at FROM order_events WHERE order_id=? ORDER BY at', o.id);
  const at = { new: o.created_at };
  for (const e of ev) at[e.status] = e.at;
  const cur = STEPS.indexOf(o.status);
  // Pasos saltados (p. ej. de Recibido directo a Enviado) se muestran como hechos, sin hora.
  return { cur, steps: STEPS.map((s, i) => ({ s, done: o.status !== 'cancelled' && i <= cur, at: i <= cur ? at[s] || null : null })), events: ev };
}

// Transportadoras: el código se copia y se abre la página de rastreo de la empresa.
const CARRIERS = {
  servientrega: ['Servientrega', 'https://www.servientrega.com/wps/portal/rastreo-envio'],
  coordinadora: ['Coordinadora', 'https://coordinadora.com/rastreo/rastreo-de-guia/'],
  interrapidisimo: ['Interrapidísimo', 'https://www.interrapidisimo.com/sigue-tu-envio/'],
  envia: ['Envía', 'https://envia.co/'],
  tcc: ['TCC', 'https://tcc.com.co/'],
  deprisa: ['Deprisa', 'https://www.deprisa.com/'],
  fedex: ['FedEx', 'https://www.fedex.com/fedextrack/?trknbr={code}'],
  dhl: ['DHL', 'https://www.dhl.com/co-es/home/rastreo.html?tracking-id={code}'],
  otra: ['Otra', ''],
};
const trackUrl = (carrier, code) => { const c = CARRIERS[carrier]; return c && c[1] ? c[1].replace('{code}', encodeURIComponent(code)) : ''; };
module.exports = { token, orderFromToken, linkFor, log, timeline, label, detail, STEPS, CARRIERS, trackUrl };

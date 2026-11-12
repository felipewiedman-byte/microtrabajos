// Cliente mínimo de la API de Mercado Pago. Cada negocio usa SU PROPIA clave: el dinero va directo a su cuenta.
// MP_API_BASE solo se cambia en pruebas automáticas.
const BASE = () => (process.env.MP_API_BASE || 'https://api.mercadopago.com').replace(/\/$/, '');

async function api(token, method, path, body) {
  const r = await fetch(BASE() + path, {
    method, signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(body && body.external_reference ? { 'X-Idempotency-Key': 'vt-' + body.external_reference } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { /* respuesta no JSON */ }
  if (!r.ok) { const e = new Error(json.message || `Mercado Pago respondió ${r.status}`); e.status = r.status; throw e; }
  return json;
}
const whoami = (token) => api(token, 'GET', '/users/me');
const createPreference = (token, payload) => api(token, 'POST', '/checkout/preferences', payload);
const searchPayments = (token, ref) => api(token, 'GET', `/v1/payments/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc&limit=5`);
const getPayment = (token, id) => api(token, 'GET', `/v1/payments/${encodeURIComponent(id)}`);
module.exports = { searchPayments, whoami, createPreference, getPayment };

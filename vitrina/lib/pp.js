// Cliente mínimo de PayPal (API REST v2). PP_API_BASE solo se cambia en pruebas automáticas.
const base = (mode) => (process.env.PP_API_BASE || (mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')).replace(/\/$/, '');
async function call(url, opts) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || j.error_description || `PayPal respondió ${r.status}`); e.status = r.status; throw e; }
  return j;
}
async function token(clientId, secret, mode) {
  const j = await call(base(mode) + '/v1/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!j.access_token) throw new Error('PayPal no devolvió un token');
  return j.access_token;
}
const json = (t, extra = {}) => ({ headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...extra } });
const createOrder = (mode, t, body) => call(base(mode) + '/v2/checkout/orders', { method: 'POST', ...json(t), body: JSON.stringify(body) });
const capture = (mode, t, id) => call(base(mode) + `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { method: 'POST', ...json(t, { 'PayPal-Request-Id': 'vt-cap-' + id }), body: '{}' });
module.exports = { token, createOrder, capture };

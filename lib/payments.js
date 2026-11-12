// Integración de pagos: Mercado Pago (Checkout Pro), PayPal (Orders v2) y modo demostración.
// El dinero lo custodia el proveedor; la plataforma solo registra y libera según las reglas.
const { one, run, now, settings } = require('./db');

const BASE_URL = () => (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
// Las claves se configuran en Administración → Pagos (cifradas). El archivo .env queda como respaldo.
const secrets = require('./secrets');
const cfg = (k, envK, d = '') => { const v = settings()[k]; return v !== undefined && v !== '' ? String(v) : (process.env[envK] || d); };
const MP_TOKEN = () => secrets.get('mp_access_token') || process.env.MP_ACCESS_TOKEN || '';
const MP_CURRENCY = () => cfg('pay_mp_currency', 'MP_CURRENCY', 'COP');
const PP_ID = () => secrets.get('paypal_client_id') || process.env.PAYPAL_CLIENT_ID || '';
const PP_SECRET = () => secrets.get('paypal_client_secret') || process.env.PAYPAL_CLIENT_SECRET || '';
const PP_LIVE = () => cfg('pay_paypal_mode', 'PAYPAL_MODE', 'sandbox') === 'live';
const PP_API = () => (PP_LIVE() ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

function providers() {
  const list = [];
  if (MP_TOKEN()) list.push({ id: 'mercadopago', name: 'Mercado Pago', note: 'Tarjetas, PSE, Nequi, Efecty y más (Latinoamérica)' });
  if (PP_ID() && PP_SECRET()) list.push({ id: 'paypal', name: 'PayPal', note: 'Pagos internacionales con tarjeta o saldo PayPal' });
  const demo = cfg('pay_demo', 'DEMO_PAYMENTS', 'auto');
  // En producción el modo de prueba solo se activa con una decisión explícita ('1'); 'auto' nunca lo activa.
  const prod = process.env.NODE_ENV === 'production';
  const demoAllowed = demo === '1' || (demo !== '0' && !prod && list.length === 0);
  if (demoAllowed) list.push({ id: 'demo', name: 'Pago de prueba', note: 'Simulación sin dinero real (solo para pruebas)' });
  return list;
}

// El importe y la moneda esperados se guardan al crear el checkout; la confirmación del proveedor debe coincidir.
const metaOf = (p) => { try { return JSON.parse(p.meta || '{}') || {}; } catch { return {}; } };
const saveMeta = (id, patch) => { const p = one('SELECT meta FROM payments WHERE id=?', id); run('UPDATE payments SET meta=? WHERE id=?', JSON.stringify({ ...metaOf(p || {}), ...patch }), id); };

function createPayment(userId, purpose, refId, description, amountCents) {
  const r = run('INSERT INTO payments(user_id,purpose,ref_id,description,amount_cents,created_at) VALUES (?,?,?,?,?,?)',
    userId, purpose, refId, description, amountCents, now());
  return Number(r.lastInsertRowid);
}

// ---------- Mercado Pago ----------
async function mpCheckout(p) {
  const rate = Number(settings().usd_to_local) || 1;
  const local = MP_CURRENCY() === 'USD' ? p.amount_cents / 100 : Math.round((p.amount_cents / 100) * rate);
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MP_TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: p.description.slice(0, 250), quantity: 1, unit_price: local, currency_id: MP_CURRENCY() }],
      external_reference: String(p.id),
      back_urls: {
        success: `${BASE_URL()}/pagos/mp/retorno`,
        pending: `${BASE_URL()}/pagos/mp/retorno`,
        failure: `${BASE_URL()}/pagar/${p.id}?error=1`,
      },
      auto_return: 'approved',
      notification_url: `${BASE_URL()}/webhooks/mercadopago`,
      statement_descriptor: 'HAGANAPP',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Mercado Pago: ' + (data.message || res.status));
  run('UPDATE payments SET provider=?, provider_ref=? WHERE id=?', 'mercadopago', data.id, p.id);
  saveMeta(p.id, { expect: { amount: local, currency: MP_CURRENCY() } });
  return MP_TOKEN().startsWith('TEST-') ? (data.sandbox_init_point || data.init_point) : data.init_point;
}

// Consulta el pago en la API de Mercado Pago (nunca se confía en los parámetros de la URL).
async function mpVerify(mpPaymentId) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN()}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const paymentId = Number(data.external_reference);
  if (data.status !== 'approved' || !paymentId) return null;
  const p = one('SELECT * FROM payments WHERE id=?', paymentId);
  if (!p || p.provider !== 'mercadopago') return null;
  if (p.status === 'paid') return p;
  // Importe y moneda deben coincidir con lo que se cobró al crear el checkout.
  const m = metaOf(p);
  const rate = Number(settings().usd_to_local) || 1;
  const expect = m.expect || { amount: MP_CURRENCY() === 'USD' ? p.amount_cents / 100 : Math.round((p.amount_cents / 100) * rate), currency: MP_CURRENCY() };
  if (String(data.currency_id) !== String(expect.currency) || Number(data.transaction_amount) + 0.005 < Number(expect.amount)) {
    saveMeta(p.id, { rejected: { mp_payment: data.id, amount: data.transaction_amount, currency: data.currency_id } });
    console.warn(`[Haganapp] Pago MP ${data.id} rechazado: importe o moneda no coinciden con el pago #${p.id}.`);
    return null;
  }
  saveMeta(p.id, { mp_payment: data.id });
  return markPaid(paymentId);
}

// ---------- PayPal ----------
async function ppToken() {
  const res = await fetch(`${PP_API()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${PP_ID()}:${PP_SECRET()}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal: autenticación fallida');
  return data.access_token;
}

async function ppCheckout(p) {
  const token = await ppToken();
  const res = await fetch(`${PP_API()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(p.id),
        custom_id: String(p.id),
        description: p.description.slice(0, 120),
        amount: { currency_code: 'USD', value: (p.amount_cents / 100).toFixed(2) },
      }],
      application_context: {
        brand_name: 'Haganapp',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: `${BASE_URL()}/pagos/paypal/retorno`,
        cancel_url: `${BASE_URL()}/pagar/${p.id}?error=1`,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal: ' + (data.message || res.status));
  run('UPDATE payments SET provider=?, provider_ref=? WHERE id=?', 'paypal', data.id, p.id);
  saveMeta(p.id, { expect: { amount: p.amount_cents / 100, currency: 'USD' } });
  const link = (data.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
  return link.href;
}

async function ppCapture(orderId) {
  const p = one('SELECT * FROM payments WHERE provider=? AND provider_ref=?', 'paypal', orderId);
  if (!p) return null;
  if (p.status === 'paid') return p;
  const token = await ppToken();
  const res = await fetch(`${PP_API()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (data.status === 'COMPLETED') {
    const cap = data.purchase_units?.[0]?.payments?.captures?.[0];
    const paidCents = Math.round(Number(cap?.amount?.value || 0) * 100);
    if (paidCents < p.amount_cents) throw new Error('Monto pagado inferior al esperado');
    if (cap?.amount?.currency_code !== 'USD') throw new Error('Moneda de pago no válida');
    if (String(data.purchase_units?.[0]?.payments?.captures?.[0]?.status || 'COMPLETED') !== 'COMPLETED') return null;
    const refs = [data.purchase_units?.[0]?.reference_id, cap?.custom_id].filter(Boolean).map(String);
    if (refs.length && !refs.includes(String(p.id))) throw new Error('Referencia de pago no coincide');
    return markPaid(p.id);
  }
  return null;
}

async function checkout(paymentId, provider) {
  const p = one('SELECT * FROM payments WHERE id=?', paymentId);
  if (!p || p.status !== 'pending') throw new Error('Pago no disponible');
  if (!providers().some((x) => x.id === provider)) throw new Error('Método de pago no disponible');
  if (provider === 'mercadopago') return mpCheckout(p);
  if (provider === 'paypal') return ppCheckout(p);
  run('UPDATE payments SET provider=? WHERE id=?', 'demo', p.id);
  return `/pagos/demo/${p.id}`;
}

// markPaid se inyecta desde lib/market.js para evitar dependencias circulares.
let markPaid = () => { throw new Error('markPaid no configurado'); };
function setMarkPaid(fn) { markPaid = fn; }

// Prueba de conexión desde el panel.
async function testConnections() {
  const out = {};
  if (MP_TOKEN()) {
    try { const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${MP_TOKEN()}` } }); const d = await r.json(); out.mp = r.ok ? `Conectado como ${d.nickname || d.email || d.id} (${MP_TOKEN().startsWith('TEST-') ? 'prueba' : 'producción'})` : `Error: ${d.message || r.status}`; }
    catch (e) { out.mp = 'Error de red: ' + e.message; }
  } else out.mp = 'Sin configurar';
  if (PP_ID() && PP_SECRET()) {
    try { await ppToken(); out.paypal = `Conectado (${PP_LIVE() ? 'producción' : 'sandbox / prueba'})`; } catch (e) { out.paypal = 'Error: credenciales incorrectas o modo equivocado'; }
  } else out.paypal = 'Sin configurar';
  return out;
}

module.exports = { testConnections, providers, createPayment, checkout, mpVerify, ppCapture, setMarkPaid, isDemoAllowed: () => providers().some((p) => p.id === 'demo') };

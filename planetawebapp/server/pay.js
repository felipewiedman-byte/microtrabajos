// Pagos: Mercado Pago, PayPal y Stripe. Sin webhooks: al volver del pago (y cada 10 min en segundo plano)
// el servidor pregunta a la pasarela si el pago quedó aprobado y activa el servicio.
module.exports = (secret) => {
  const T = () => AbortSignal.timeout(15000)
  const has = { mercadopago: () => !!secret('mercadopago', 'accessToken'), paypal: () => !!(secret('paypal', 'clientId') && secret('paypal', 'secret')), stripe: () => !!secret('stripe', 'secretKey') }
  const available = () => Object.keys(has).filter(k => has[k]())
  const ppHost = () => secret('paypal', 'mode') === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com'
  async function ppToken() {
    const r = await fetch(`https://${ppHost()}/v1/oauth2/token`, { method: 'POST', body: 'grant_type=client_credentials', headers: { Authorization: 'Basic ' + Buffer.from(secret('paypal', 'clientId') + ':' + secret('paypal', 'secret')).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, signal: T() })
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('PayPal no respondió. Intenta con otro medio de pago.'); return d.access_token
  }
  // crea el cobro y devuelve { url, extId }
  async function create({ provider, ref, title, amount, currency, usd, back }) {
    if (provider === 'mercadopago') {
      const body = { items: [{ title, quantity: 1, unit_price: amount, currency_id: currency }], external_reference: ref, back_urls: { success: back, failure: back, pending: back } }
      if (back.startsWith('https://')) body.auto_return = 'approved'
      const r = await fetch('https://api.mercadopago.com/checkout/preferences', { method: 'POST', headers: { Authorization: 'Bearer ' + secret('mercadopago', 'accessToken'), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: T() })
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Mercado Pago no aceptó el cobro: ' + (d.message || r.status))
      return { url: secret('mercadopago', 'mode') === 'test' ? (d.sandbox_init_point || d.init_point) : d.init_point, extId: d.id }
    }
    if (provider === 'stripe') {
      const f = new URLSearchParams({ mode: 'payment', 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': currency.toLowerCase(), 'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)), 'line_items[0][price_data][product_data][name]': title, success_url: back + '&sid={CHECKOUT_SESSION_ID}', cancel_url: back, client_reference_id: ref })
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + secret('stripe', 'secretKey'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: f, signal: T() })
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Stripe no aceptó el cobro: ' + (d.error?.message || r.status))
      return { url: d.url, extId: d.id }
    }
    if (provider === 'paypal') {
      const tok = await ppToken()
      const r = await fetch(`https://${ppHost()}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: ref, description: title, amount: { currency_code: 'USD', value: Number(usd).toFixed(2) } }], application_context: { return_url: back, cancel_url: back, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' } }), signal: T() })
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('PayPal no aceptó el cobro: ' + (d.message || r.status))
      return { url: (d.links || []).find(l => l.rel === 'approve' || l.rel === 'payer-action')?.href, extId: d.id }
    }
    throw new Error('Medio de pago no disponible.')
  }
  // true si la pasarela confirma el pago
  async function check(p) {
    if (p.provider === 'mercadopago') {
      const r = await fetch('https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(p.ref), { headers: { Authorization: 'Bearer ' + secret('mercadopago', 'accessToken') }, signal: T() })
      const d = await r.json().catch(() => ({})); return (d.results || []).some(x => x.status === 'approved' && x.external_reference === p.ref && +x.transaction_amount >= p.amount - 0.5)
    }
    if (p.provider === 'stripe') {
      if (!p.ext_id) return false
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(p.ext_id), { headers: { Authorization: 'Bearer ' + secret('stripe', 'secretKey') }, signal: T() })
      const d = await r.json().catch(() => ({})); return d.payment_status === 'paid' && d.client_reference_id === p.ref
    }
    if (p.provider === 'paypal') {
      if (!p.ext_id) return false
      const tok = await ppToken(), H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }
      let r = await fetch(`https://${ppHost()}/v2/checkout/orders/${encodeURIComponent(p.ext_id)}`, { headers: H, signal: T() }); let d = await r.json().catch(() => ({}))
      if (d.status === 'APPROVED') { r = await fetch(`https://${ppHost()}/v2/checkout/orders/${encodeURIComponent(p.ext_id)}/capture`, { method: 'POST', headers: H, signal: T() }); d = await r.json().catch(() => ({})) }
      return d.status === 'COMPLETED' && d.purchase_units?.[0]?.reference_id === p.ref
    }
    return false
  }
  return { available, create, check }
}

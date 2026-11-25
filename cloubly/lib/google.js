// "Continuar con Google" (OAuth 2.0 / OpenID Connect, flujo de código con PKCE). Sin librerías externas.
// El token de identidad se pide directamente a Google por HTTPS desde el servidor (nunca pasa por el navegador)
// y aun así se validan emisor, destinatario, vencimiento, nonce y correo verificado.
const crypto = require('crypto');
const { settings } = require('./db');
const secrets = require('./secrets');

const AUTH = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const ISS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const cfg = () => { const id = String(settings().google_client_id || '').trim(), secret = secrets.appGet('google_secret'); return id && secret && settings().google_on === '1' ? { id, secret } : null; };
const on = () => !!cfg();
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const redirectUri = (base) => `${base}/auth/google/callback`;

function start(req, base, intent) {
  const c = cfg(); if (!c) return null;
  const state = b64u(crypto.randomBytes(24)), nonce = b64u(crypto.randomBytes(24)), verifier = b64u(crypto.randomBytes(48));
  req.session.g = { state, nonce, verifier, intent: intent === 'register' ? 'register' : 'login', at: Date.now() };
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri(base), response_type: 'code', scope: 'openid email profile', state, nonce,
    code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', prompt: 'select_account', access_type: 'online' });
  return `${AUTH}?${q}`;
}
// Devuelve { sub, email, name, picture } o lanza un error con mensaje amable.
async function finish(req, base) {
  const c = cfg(), g = req.session.g; delete req.session.g;
  const fail = (m) => Object.assign(new Error(m), { expose: true, status: 400 });
  if (!c) throw fail('El ingreso con Google no está activo.');
  if (req.query.error) throw fail(req.query.error === 'access_denied' ? 'Cancelaste el ingreso con Google.' : 'Google no autorizó el ingreso. Intenta de nuevo.');
  if (!g || !req.query.state || req.query.state !== g.state || Date.now() - g.at > 10 * 60000) throw fail('La solicitud venció. Intenta de nuevo.');
  const code = String(req.query.code || ''); if (!code || code.length > 2000) throw fail('Respuesta de Google no válida.');
  const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(base), grant_type: 'authorization_code', code_verifier: g.verifier }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id_token) { console.error('[Vitrina] Google token:', r.status, j.error || ''); throw fail('No pudimos verificar tu cuenta de Google. Intenta de nuevo.'); }
  let p; try { p = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString('utf8')); } catch { throw fail('Respuesta de Google no válida.'); }
  const t = Math.floor(Date.now() / 1000);
  if (!ISS.has(p.iss) || p.aud !== c.id || !(p.exp > t) || p.nonce !== g.nonce || !p.sub) throw fail('No pudimos verificar tu cuenta de Google.');
  if (!p.email || p.email_verified !== true && p.email_verified !== 'true') throw fail('Tu correo de Google no está verificado.');
  return { sub: String(p.sub).slice(0, 64), email: String(p.email).toLowerCase().slice(0, 120), name: String(p.name || p.given_name || p.email.split('@')[0]).slice(0, 60), intent: g.intent };
}
module.exports = { on, start, finish, redirectUri };

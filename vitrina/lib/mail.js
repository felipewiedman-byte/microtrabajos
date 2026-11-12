// Correo saliente por SMTP (Brevo, Mailgun, SES, el de tu dominio...). Se configura en Admin → Ajustes (o con variables de entorno).
// Sin SMTP: en desarrollo el correo se imprime en consola; en producción se descarta con un aviso.
const { settings } = require('./db');
const secrets = require('./secrets');

const PROD = process.env.NODE_ENV === 'production';
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const outbox = [];
let transport = null, transportKey = '', warned = false;

function cfg() {
  const s = settings(), host = oneLine(s.smtp_host || process.env.SMTP_HOST || '');
  if (!host) return null;
  const port = Number(s.smtp_port || process.env.SMTP_PORT) || 587, user = oneLine(s.smtp_user || process.env.SMTP_USER || '');
  return { host, port, secure: s.smtp_secure === '1' || process.env.SMTP_SECURE === '1' || port === 465, user, pass: secrets.appGet('smtp_pass') || process.env.SMTP_PASS || '', from: oneLine(s.smtp_from || process.env.MAIL_FROM || user || 'no-reply@localhost') };
}
const configured = () => !!cfg();
function getTransport(c) {
  const key = JSON.stringify(c);
  if (!transport || key !== transportKey) {
    transport = require('nodemailer').createTransport({ host: c.host, port: c.port, secure: c.secure, auth: c.user ? { user: c.user, pass: c.pass } : undefined, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
    transportKey = key;
  }
  return transport;
}

async function send({ to, subject, title, lines, button }) {
  const name = settings().site_name, c = cfg();
  const text = [title, '', ...lines, ...(button ? ['', `${button.text}: ${button.url}`] : []), '', '— ' + name].join('\n');
  if (!c) {
    if (PROD) { if (!warned) { warned = true; console.warn('[Vitrina] Correo sin configurar: los correos no se envían (Admin → Ajustes → Correo).'); } return false; }
    outbox.push({ to, subject, text }); if (outbox.length > 50) outbox.shift();
    if (!process.env.MAIL_QUIET) console.log(`[Vitrina] (sin SMTP) Correo para ${to}\n  ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return true;
  }
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827"><h2 style="margin:0 0 12px">${esc(title)}</h2>${lines.map((l) => `<p style="line-height:1.5">${esc(l)}</p>`).join('')}${button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:${/^#[0-9a-f]{6}$/i.test(settings().brand_color) ? settings().brand_color : '#0f766e'};color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(button.text)}</a></p>` : ''}<p style="color:#6b7280;font-size:12px">— ${esc(name)}</p></div>`;
  try {
    await getTransport(c).sendMail({ from: /</.test(c.from) ? c.from : `"${oneLine(name).replace(/["\\]/g, '')}" <${c.from}>`, to: oneLine(to), subject: oneLine(subject).slice(0, 150), text, html });
    return true;
  } catch (e) { console.error(`[Vitrina] Correo no enviado (${e.code || e.message})`); send.lastError = e.message; return false; }
}
// Para el botón "Enviar correo de prueba" del admin: devuelve el motivo si falla.
async function test(to) {
  const c = cfg();
  if (!c) return { ok: false, error: 'Primero guarda el servidor de correo.' };
  try { await getTransport(c).verify(); } catch (e) { return { ok: false, error: `No se pudo conectar al servidor de correo (${e.code || e.message}).` }; }
  const ok = await send({ to, subject: `Prueba de correo de ${settings().site_name}`, title: '¡El correo funciona!', lines: ['Este es un mensaje de prueba. Si lo lees, tu servidor de correo está bien configurado.'] });
  return ok ? { ok: true } : { ok: false, error: `El servidor rechazó el mensaje (${send.lastError || 'error desconocido'}).` };
}
module.exports = { send, test, configured, outbox };

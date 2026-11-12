// Correo saliente por SMTP (Brevo, Mailgun, SES, el de su dominio...). nodemailer se carga solo si hay SMTP.
// Variables: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM.
// Sin SMTP: en desarrollo se imprime en consola; en producción se descarta con un aviso.
const { settings } = require('./db');

const PROD = process.env.NODE_ENV === 'production';
const configured = () => !!process.env.SMTP_HOST;
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const outbox = [];
let transport = null, warned = false;

async function send({ to, subject, title, lines, button }) {
  const name = settings().site_name;
  const text = [title, '', ...lines, ...(button ? ['', `${button.text}: ${button.url}`] : []), '', '— ' + name].join('\n');
  if (!configured()) {
    if (PROD) { if (!warned) { warned = true; console.warn('[Vitrina] SMTP sin configurar: los correos no se envían.'); } return false; }
    outbox.push({ to, subject, text }); if (outbox.length > 50) outbox.shift();
    if (!process.env.MAIL_QUIET) console.log(`[Vitrina] (sin SMTP) Correo para ${to}\n  ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return true;
  }
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827"><h2 style="margin:0 0 12px">${esc(title)}</h2>${lines.map((l) => `<p style="line-height:1.5">${esc(l)}</p>`).join('')}${button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:#0f766e;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(button.text)}</a></p>` : ''}<p style="color:#6b7280;font-size:12px">— ${esc(name)}</p></div>`;
  try {
    if (!transport) {
      const port = Number(process.env.SMTP_PORT) || 587;
      transport = require('nodemailer').createTransport({
        host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === '1' || port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      });
    }
    const addr = oneLine(process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@localhost');
    await transport.sendMail({ from: /</.test(addr) ? addr : `"${oneLine(name).replace(/["\\]/g, '')}" <${addr}>`, to: oneLine(to), subject: oneLine(subject).slice(0, 150), text, html });
    return true;
  } catch (e) { console.error(`[Vitrina] Correo no enviado (${e.code || e.message})`); return false; }
}

module.exports = { send, configured, outbox };

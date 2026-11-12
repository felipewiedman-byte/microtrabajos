// Correo saliente por SMTP (cualquier proveedor: Brevo, Mailgun, Amazon SES, el correo de su dominio...).
// Variables: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (1 para el puerto 465), SMTP_USER, SMTP_PASS, MAIL_FROM.
// Bajo consumo: nodemailer solo se carga si hay SMTP configurado, la cola vive en memoria (máx. 200),
// se envía de a uno y cada usuario recibe como máximo 10 avisos por hora.
// Sin SMTP: en desarrollo el correo se imprime en consola; en producción se descarta con un aviso.
const { one, settings } = require('./db');
const limiter = require('./limiter');

const PROD = process.env.NODE_ENV === 'production';
const configured = () => !!process.env.SMTP_HOST;
const baseUrl = () => (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

const outbox = []; // solo fuera de producción y sin SMTP (pruebas); máximo 50
let transport = null, warned = false;
const queue = [];
let busy = false;

function from() {
  const addr = oneLine(process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@localhost');
  return /</.test(addr) ? addr : `"${oneLine(settings().site_name).replace(/["\\]/g, '')}" <${addr}>`;
}
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = require('nodemailer').createTransport({
      host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === '1' || port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    });
  }
  return transport;
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      try { await getTransport().sendMail({ from: from(), to: job.to, subject: job.subject, text: job.text, html: job.html, headers: job.headers }); }
      catch (e) {
        if (++job.tries < 3) setTimeout(() => { queue.push(job); pump(); }, 30000 * job.tries).unref();
        else console.error(`[Haganapp] Correo no enviado tras 3 intentos (${e.code || e.message})`);
      }
    }
  } finally { busy = false; }
}

function deliver(job) {
  if (!configured()) {
    if (PROD) { if (!warned) { warned = true; console.warn('[Haganapp] SMTP sin configurar: los correos no se envían (defina SMTP_HOST, SMTP_USER, SMTP_PASS y MAIL_FROM).'); } return false; }
    outbox.push({ to: job.to, subject: job.subject, text: job.text }); if (outbox.length > 50) outbox.shift();
    if (!process.env.MAIL_QUIET) console.log(`[Haganapp] (sin SMTP) Correo para ${job.to}\n  Asunto: ${job.subject}\n  ${job.text.replace(/\n/g, '\n  ')}`);
    return true;
  }
  if (queue.length >= 200) { console.warn('[Haganapp] Cola de correo llena: se descarta un aviso.'); return false; }
  queue.push({ ...job, tries: 0 }); pump();
  return true;
}

// Plantilla sencilla y liviana (HTML sin imágenes ni fuentes externas).
function send({ to, subject, title, lines, button, footer, bulk }) {
  const name = settings().site_name, brand = /^#[0-9a-f]{3,8}$/i.test(settings().color_brand) ? settings().color_brand : '#0f766e';
  const text = [title, '', ...lines, ...(button ? ['', `${button.text}: ${button.url}`] : []), '', footer || '', '— ' + name].join('\n');
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937"><h2 style="margin:0 0 12px">${esc(title)}</h2>${lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join('')}${button ? `<p style="margin:18px 0"><a href="${esc(button.url)}" style="background:${brand};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${esc(button.text)}</a></p>` : ''}${footer ? `<p style="color:#6b7280;font-size:12px;margin-top:20px">${esc(footer)}</p>` : ''}<p style="color:#6b7280;font-size:12px">— ${esc(name)}</p></div>`;
  return deliver({ to: oneLine(to), subject: oneLine(subject).slice(0, 150), text, html, headers: bulk ? { 'List-Unsubscribe': `<${baseUrl()}/cuenta>`, Precedence: 'bulk' } : undefined });
}

const sendVerify = (u, token) => send({
  to: u.email, subject: `Confirma tu correo en ${settings().site_name}`, title: `Hola ${u.name.split(' ')[0]}, confirma tu correo`,
  lines: ['Necesitamos confirmar que este correo es tuyo para enviarte avisos de tus trabajos y ayudarte a recuperar tu cuenta.', 'El enlace vale 48 horas.'],
  button: { text: 'Confirmar mi correo', url: `${baseUrl()}/verificar/${token}` }, footer: 'Si no creaste una cuenta, ignora este mensaje.',
});
const sendReset = (u, token) => send({
  to: u.email, subject: `Restablece tu contraseña de ${settings().site_name}`, title: 'Restablecer contraseña',
  lines: ['Recibimos una solicitud para cambiar tu contraseña.', 'El enlace vale 1 hora y solo se puede usar una vez.'],
  button: { text: 'Elegir nueva contraseña', url: `${baseUrl()}/restablecer/${token}` }, footer: 'Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.',
});

// Aviso de la plataforma por correo: solo a correos verificados que no lo hayan desactivado.
function notifyUser(userId, text, link) {
  try {
    if (PROD && !configured()) return;
    const u = one('SELECT email, name, email_verified, notify_email, status FROM users WHERE id=?', userId);
    if (!u || u.status !== 'active' || !u.email_verified || !u.notify_email) return;
    if (!limiter.take('mail:' + userId, 10, 60 * 60 * 1000)) return;
    const name = settings().site_name;
    send({ to: u.email, subject: `${name}: ${oneLine(text)}`.slice(0, 110), title: oneLine(text), lines: [], bulk: true,
      button: link ? { text: `Ver en ${name}`, url: baseUrl() + link } : undefined,
      footer: `Recibes este aviso porque tienes los avisos por correo activados. Puedes desactivarlos en ${baseUrl()}/cuenta` });
  } catch (e) { console.error('[Haganapp] aviso por correo:', e.message); }
}

module.exports = { send, sendVerify, sendReset, notifyUser, configured, outbox };

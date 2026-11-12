// Una sola prueba gratis por persona: se guarda una huella (hash) del correo normalizado y del WhatsApp.
// La huella permanece aunque la cuenta se elimine, y no permite recuperar el dato original.
const crypto = require('crypto');
const { db, one, run, all, now } = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS trial_used (kind TEXT NOT NULL, h TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (kind, h))');
const SALT = String(process.env.SESSION_SECRET || 'cambiar-este-secreto') + ':vitrina-trial';
const hash = (v) => crypto.createHmac('sha256', SALT).update(v).digest('hex');

// ana+tienda@dominio.com y a.na@gmail.com cuentan como el mismo correo que ana@dominio.com / ana@gmail.com
function normEmail(e) {
  const [local, domain] = String(e || '').toLowerCase().trim().split('@');
  if (!domain) return String(e || '').toLowerCase();
  let l = local.split('+')[0];
  const d = domain === 'googlemail.com' ? 'gmail.com' : domain;
  if (d === 'gmail.com') l = l.replace(/\./g, '');
  return `${l}@${d}`;
}
const key = (kind, v) => kind === 'email' ? hash('e:' + normEmail(v)) : hash('w:' + String(v).replace(/\D/g, ''));
const used = (kind, v) => !!one('SELECT 1 x FROM trial_used WHERE kind=? AND h=?', kind, key(kind, v));
const mark = (kind, v) => run('INSERT OR IGNORE INTO trial_used(kind,h,created_at) VALUES (?,?,?)', kind, key(kind, v), now());

// Migración única: las cuentas que ya existen cuentan como que usaron su prueba.
if (!one("SELECT 1 x FROM settings WHERE key='trial_used_v1'")) {
  for (const u of all("SELECT email FROM users WHERE role='owner'")) mark('email', u.email);
  for (const s of all('SELECT whatsapp FROM shops')) mark('wa', s.whatsapp);
  run("INSERT INTO settings(key,value) VALUES ('trial_used_v1','1')");
}
module.exports = { used, mark, normEmail };

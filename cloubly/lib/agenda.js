// Agenda de citas para negocios de servicios: horarios disponibles según el horario del negocio, la duración
// de cada servicio y cuántas citas atiende a la vez. Todo en la hora local del negocio (fecha 'AAAA-MM-DD' + minutos).
const { db, one, all, run, now, tx } = require('./db');
const S = require('./shop');
const U = require('./util');
const Countries = require('./countries');
const I = require('./i18n');

db.exec(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id INTEGER, service TEXT NOT NULL, price_cents INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
  customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', code TEXT NOT NULL, created_at INTEGER NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_appt_day ON appointments(shop_id, day, status)');
// Seña (anticipo): monto, estado (none, pending, paid, failed, refunded), medio (mp, pp), referencia del pago, vencimiento de la retención y un código para volver a la cita.
for (const q of ["ALTER TABLE appointments ADD COLUMN dep_cents INTEGER NOT NULL DEFAULT 0", "ALTER TABLE appointments ADD COLUMN dep_status TEXT NOT NULL DEFAULT 'none'", "ALTER TABLE appointments ADD COLUMN dep_provider TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE appointments ADD COLUMN dep_ref TEXT NOT NULL DEFAULT ''", 'ALTER TABLE appointments ADD COLUMN dep_expires INTEGER', 'ALTER TABLE appointments ADD COLUMN dep_paid_at INTEGER', "ALTER TABLE appointments ADD COLUMN token TEXT NOT NULL DEFAULT ''"]) { try { db.exec(q); } catch { /* la columna ya existe */ } }
// Bloqueos: días completos (start_min NULL) o franjas de horas dentro de un rango de días (vacaciones, festivos, un día cerrado...).
db.exec(`CREATE TABLE IF NOT EXISTS agenda_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day_from TEXT NOT NULL, day_to TEXT NOT NULL, start_min INTEGER, end_min INTEGER, reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_blk_shop ON agenda_blocks(shop_id, day_to)');

const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const NAMES = { sun: 'Dom', mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const toM = (s) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3), 10);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const label = (m, lang) => I.fmtTime(hhmm(m), lang);

// Fecha y minuto actuales en la zona horaria del negocio.
function localNow(shop) {
  let p; try { p = new Intl.DateTimeFormat('en-CA', { timeZone: shop.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); } catch { p = null; }
  const g = (t) => p.find((x) => x.type === t).value;
  return p ? { day: `${g('year')}-${g('month')}-${g('day')}`, mins: parseInt(g('hour'), 10) * 60 + parseInt(g('minute'), 10) } : { day: new Date().toISOString().slice(0, 10), mins: 0 };
}
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowKey = (day) => KEYS[new Date(day + 'T12:00:00Z').getUTCDay()];
const isDay = (d) => /^\d{4}-\d\d-\d\d$/.test(String(d || ''));

// Ventana de atención de un día [abre, cierra) en minutos; si cierra después de medianoche, hasta las 24:00.
function window_(shop, day) {
  const h = S.parseHours(shop.hours)[dowKey(day)];
  if (!h) return null;
  const o = toM(h[0]), c = toM(h[1]);
  return [o, c > o ? c : 24 * 60];
}
// Horarios libres de un servicio en un día.
function slots(shop, dur, day) {
  const w = window_(shop, day); if (!w || !(dur > 0)) return [];
  const t = localNow(shop), step = Math.max(5, Math.min(120, shop.agenda_step || 30)), cap = Math.max(1, Math.min(20, shop.agenda_cap || 1));
  if (day < t.day || day > addDays(t.day, Math.max(1, Math.min(60, shop.agenda_days || 14)))) return [];
  const bl = all('SELECT start_min s, end_min e FROM agenda_blocks WHERE shop_id=? AND day_from<=? AND day_to>=?', shop.id, day, day);
  if (bl.some((b) => b.s === null)) return []; // día bloqueado completo
  const busy = all("SELECT start_min s, end_min e FROM appointments WHERE shop_id=? AND day=? AND status NOT IN ('cancelled','expired') AND NOT (status='awaiting_payment' AND dep_expires<?)", shop.id, day, now());
  const out = [];
  for (let m = w[0]; m + dur <= w[1]; m += step) {
    if (day === t.day && m < t.mins + 30) continue; // mínimo 30 min de anticipación
    if (bl.some((b) => b.s < m + dur && b.e > m)) continue; // franja bloqueada
    if (busy.filter((b) => b.s < m + dur && b.e > m).length < cap) out.push({ m, t: label(m, shop.lang) });
  }
  return out;
}
// Próximos días con atención (y si les queda algún horario).
function days(shop, dur) {
  const tt = I.tr(shop.lang);
  const t = localNow(shop), n = Math.max(1, Math.min(60, shop.agenda_days || 14)), out = [];
  for (let i = 0; i <= n && out.length < 21; i++) {
    const day = addDays(t.day, i);
    if (!window_(shop, day)) continue;
    const d = new Date(day + 'T12:00:00Z');
    const es = I.norm(shop.lang) === 'es', sh = es ? null : I.dayShort(day, shop.lang);
    out.push({ day, wd: i === 0 ? tt('Hoy') : i === 1 ? tt('Mañana') : (es ? NAMES[dowKey(day)] : sh.wd), dm: es ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : sh.dm, free: slots(shop, dur, day).length });
  }
  return out;
}
function fmtDay(day, lang) { if (I.norm(lang) !== 'es') return I.dayLong(day, lang); const d = new Date(day + 'T12:00:00Z'); return `${({ sun: 'domingo', mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado' })[dowKey(day)]} ${d.getUTCDate()} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getUTCMonth()]}`; }

// ÚNICA puerta para saber qué se reserva: un servicio del negocio (p) o, si p viene ausente o vacío, una "Cita" genérica
// con la duración del negocio. Un p con valor que no resuelve (inexistente, inactivo, sin duración o de otro negocio) devuelve
// null: nunca cae en la genérica.
function resolve(shop, p) {
  if (p === undefined || p === null || p === '') return { id: null, name: I.tr(shop.lang)('Cita'), price_cents: 0, dur: Math.max(5, Math.min(720, parseInt(shop.appt_duration, 10) || 30)) };
  const r = one('SELECT id, name, price_cents, duration FROM products WHERE id=? AND shop_id=? AND active=1', parseInt(p, 10) || 0, shop.id);
  return r && r.duration > 0 ? { id: r.id, name: r.name, price_cents: r.price_cents, dur: r.duration } : null;
}

// Crea la reserva verificando de nuevo, dentro de una transacción, que el horario siga libre.
function book(shop, b) {
  const t = I.tr(shop.lang);
  const name = U.clean(b.name, 60), phone = U.intlPhone(b.phone, Countries.dialOf(shop)), note = U.clean(b.note, 300), day = String(b.day || ''), m = parseInt(b.start, 10);
  if (!shop.agenda_on) throw U.fail(400, t('Este negocio no está recibiendo reservas en línea.'));
  if (name.length < 2) throw U.fail(400, t('Escribe tu nombre.'));
  if (!phone) throw U.fail(400, t('Escribe tu WhatsApp para confirmarte la cita.'));
  const p = resolve(shop, b.product);
  if (!p) throw U.fail(400, t('Ese servicio no se puede reservar en línea.'));
  if (!isDay(day) || !(m >= 0)) throw U.fail(400, t('Elige el día y la hora.'));
  // Seña: si el negocio la pide (y tiene un medio de cobro conectado), la cita queda "esperando pago" y retiene el horario unos minutos.
  const D = require('./deposits'), need = D.required(shop, p.price_cents), pay = String(b.pay || '');
  if (need.cents > 0 && !need.providers.includes(pay)) throw U.fail(402, t('Para reservar hay que pagar la seña.'));
  return tx(() => {
    if (!slots(shop, p.dur, day).some((x) => x.m === m)) throw U.fail(409, t('Ese horario se acaba de ocupar. Elige otro, por favor.'));
    const n = one('SELECT COUNT(*) c FROM appointments WHERE shop_id=?', shop.id).c + 1, dep = need.cents > 0;
    const a = { code: 'R' + n, service: p.name, price_cents: p.price_cents, day, start_min: m, end_min: m + p.dur, customer_name: name, customer_phone: phone, note, dep_cents: dep ? need.cents : 0, dep_provider: dep ? pay : '', dep_status: dep ? 'pending' : 'none', token: dep ? require('crypto').randomBytes(12).toString('hex') : '' };
    a.id = Number(run('INSERT INTO appointments(shop_id,product_id,service,price_cents,day,start_min,end_min,customer_name,customer_phone,note,code,created_at,status,dep_cents,dep_status,dep_provider,dep_expires,token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      shop.id, p.id, a.service, a.price_cents, day, m, a.end_min, name, phone, note, a.code, now(), dep ? 'awaiting_payment' : 'pending', a.dep_cents, a.dep_status, a.dep_provider, dep ? D.hold() : null, a.token).lastInsertRowid);
    return a;
  });
}
const text = (shop, a) => { const t = I.tr(shop.lang), L = shop.lang; return [`📅 *${t('Nueva reserva {c}', { c: a.code })}*`, '', `• ${a.service}${a.price_cents > 0 ? ' — ' + S.money(a.price_cents, shop.currency, S.shopLocale(shop)) : ''}`, `🗓️ ${fmtDay(a.day, L)}`, `🕒 ${t('{a} a {b}', { a: label(a.start_min, L), b: label(a.end_min, L) })}`, '', `👤 ${a.customer_name}`, a.note ? `📝 ${a.note}` : '', a.dep_status === 'paid' ? `💳 ${t('Seña pagada: {m}', { m: S.money(a.dep_cents, shop.currency, S.shopLocale(shop)) })}` : ''].filter((l, i, arr) => l || (arr[i - 1] && arr[i - 1] !== '')).join('\n').trim(); };
module.exports = { toM, hhmm, slots, days, resolve, book, text, fmtDay, label, localNow, addDays, isDay };

// Agenda de citas para negocios de servicios: horarios disponibles según el horario del negocio, la duración
// de cada servicio y cuántas citas atiende a la vez. Todo en la hora local del negocio (fecha 'AAAA-MM-DD' + minutos).
const { db, one, all, run, now, tx } = require('./db');
const S = require('./shop');
const U = require('./util');

db.exec(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id INTEGER, service TEXT NOT NULL, price_cents INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
  customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', code TEXT NOT NULL, created_at INTEGER NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_appt_day ON appointments(shop_id, day, status)');

const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const NAMES = { sun: 'Dom', mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const toM = (s) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3), 10);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const label = (m) => S.fmtTime(hhmm(m));

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
  const busy = all("SELECT start_min s, end_min e FROM appointments WHERE shop_id=? AND day=? AND status<>'cancelled'", shop.id, day);
  const out = [];
  for (let m = w[0]; m + dur <= w[1]; m += step) {
    if (day === t.day && m < t.mins + 30) continue; // mínimo 30 min de anticipación
    if (busy.filter((b) => b.s < m + dur && b.e > m).length < cap) out.push({ m, t: label(m) });
  }
  return out;
}
// Próximos días con atención (y si les queda algún horario).
function days(shop, dur) {
  const t = localNow(shop), n = Math.max(1, Math.min(60, shop.agenda_days || 14)), out = [];
  for (let i = 0; i <= n && out.length < 21; i++) {
    const day = addDays(t.day, i);
    if (!window_(shop, day)) continue;
    const d = new Date(day + 'T12:00:00Z');
    out.push({ day, wd: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : NAMES[dowKey(day)], dm: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, free: slots(shop, dur, day).length });
  }
  return out;
}
function fmtDay(day) { const d = new Date(day + 'T12:00:00Z'); return `${({ sun: 'domingo', mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado' })[dowKey(day)]} ${d.getUTCDate()} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getUTCMonth()]}`; }

// Crea la reserva verificando de nuevo, dentro de una transacción, que el horario siga libre.
function book(shop, b) {
  const name = U.clean(b.name, 60), phone = U.phone(b.phone), note = U.clean(b.note, 300), day = String(b.day || ''), m = parseInt(b.start, 10);
  if (!shop.agenda_on) throw U.fail(400, 'Este negocio no está recibiendo reservas en línea.');
  if (name.length < 2) throw U.fail(400, 'Escribe tu nombre.');
  if (!phone) throw U.fail(400, 'Escribe tu WhatsApp para confirmarte la cita.');
  const p = one('SELECT * FROM products WHERE id=? AND shop_id=? AND active=1', parseInt(b.product, 10) || 0, shop.id);
  if (!p || !(p.duration > 0)) throw U.fail(400, 'Ese servicio no se puede reservar en línea.');
  if (!isDay(day) || !(m >= 0)) throw U.fail(400, 'Elige el día y la hora.');
  return tx(() => {
    if (!slots(shop, p.duration, day).some((x) => x.m === m)) throw U.fail(409, 'Ese horario se acaba de ocupar. Elige otro, por favor.');
    const n = one('SELECT COUNT(*) c FROM appointments WHERE shop_id=?', shop.id).c + 1;
    const a = { code: 'R' + n, service: p.name, price_cents: p.price_cents, day, start_min: m, end_min: m + p.duration, customer_name: name, customer_phone: phone, note };
    a.id = Number(run('INSERT INTO appointments(shop_id,product_id,service,price_cents,day,start_min,end_min,customer_name,customer_phone,note,code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      shop.id, p.id, a.service, a.price_cents, day, m, a.end_min, name, phone, note, a.code, now()).lastInsertRowid);
    return a;
  });
}
const text = (shop, a) => [`📅 *Nueva reserva ${a.code}*`, '', `• ${a.service} — ${S.money(a.price_cents, shop.currency)}`, `🗓️ ${fmtDay(a.day)}`, `🕒 ${label(a.start_min)} a ${label(a.end_min)}`, '', `👤 ${a.customer_name}`, a.note ? `📝 ${a.note}` : ''].filter((l, i, arr) => l || (arr[i - 1] && arr[i - 1] !== '')).join('\n').trim();
module.exports = { slots, days, book, text, fmtDay, label, localNow, addDays, isDay };

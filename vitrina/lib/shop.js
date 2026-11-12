// Reglas del negocio: planes, horarios, dinero, mensajes de pedido y enlaces.
const { one, all, settings, now } = require('./db');

const CURRENCIES = { COP: 'Peso colombiano', MXN: 'Peso mexicano', ARS: 'Peso argentino', CLP: 'Peso chileno', PEN: 'Sol peruano', USD: 'Dólar', EUR: 'Euro', BRL: 'Real brasileño', UYU: 'Peso uruguayo', BOB: 'Boliviano', PYG: 'Guaraní', DOP: 'Peso dominicano', GTQ: 'Quetzal', CRC: 'Colón costarricense' };
const TZ = {
  'America/Bogota': 'Colombia', 'America/Mexico_City': 'México', 'America/Lima': 'Perú', 'America/Santiago': 'Chile', 'America/Argentina/Buenos_Aires': 'Argentina',
  'America/Sao_Paulo': 'Brasil', 'America/Caracas': 'Venezuela', 'America/Montevideo': 'Uruguay', 'America/La_Paz': 'Bolivia', 'America/Asuncion': 'Paraguay',
  'America/Guayaquil': 'Ecuador', 'America/Panama': 'Panamá', 'America/Costa_Rica': 'Costa Rica', 'America/Guatemala': 'Guatemala', 'America/Santo_Domingo': 'Rep. Dominicana',
  'Europe/Madrid': 'España', 'America/New_York': 'EE. UU. (Este)', 'America/Los_Angeles': 'EE. UU. (Oeste)',
};
const KINDS = { productos: 'Productos', comida: 'Comida y bebidas', servicios: 'Servicios' };
const DAYS = [['mon', 'Lunes'], ['tue', 'Martes'], ['wed', 'Miércoles'], ['thu', 'Jueves'], ['fri', 'Viernes'], ['sat', 'Sábado'], ['sun', 'Domingo']];
const STATUS = { new: ['Nuevo', 'warn'], preparing: ['Preparando', 'info'], ready: ['Listo', 'accent'], done: ['Entregado', 'ok'], cancelled: ['Cancelado', ''] };
const RESERVED = new Set(['admin', 'panel', 'api', 'static', 'media', 'ingresar', 'registro', 'salir', 'recuperar', 'restablecer', 'planes', 't', 'www', 'app', 'ayuda', 'terminos', 'privacidad']);

// ---------- Planes ----------
const PLAN_LABEL = { free: 'Sin plan', trial: 'Prueba', basic: 'Básico', pro: 'Pro' };
function planOf(user) {
  if (!user) return 'free';
  if (user.role === 'admin') return 'pro';
  if (['basic', 'pro'].includes(user.plan) && (!user.plan_until || user.plan_until > now())) return user.plan;
  if (user.trial_until && user.trial_until > now()) return 'trial';
  return 'free'; // sin plan vigente: el catálogo queda en pausa (no se borra nada)
}
const trialDaysLeft = (user) => user && user.trial_until && user.trial_until > now() ? Math.ceil((user.trial_until - now()) / 86400000) : 0;
const productLimit = (user) => { const p = planOf(user); return p === 'free' ? 0 : parseInt(settings()['limit_' + p], 10) || 10; };
const quotaBytes = (user) => { const p = planOf(user); return p === 'free' ? 0 : Math.round((parseFloat(settings()['quota_' + p + '_mb']) || 0) * 1048576); };
const can = (user, feature) => {
  const p = planOf(user);
  if (feature === 'coupons' || feature === 'payments') return p !== 'free';
  if (feature === 'stats' || feature === 'clients') return p === 'pro' || p === 'trial';
  if (feature === 'nobrand') return p === 'basic' || p === 'pro';
  return false;
};

// ---------- Dinero ----------
const ZERO = new Set(['COP', 'CLP', 'PYG', 'CRC']);
const LOCALE = { COP: 'es-CO', MXN: 'es-MX', ARS: 'es-AR', CLP: 'es-CL', PEN: 'es-PE', USD: 'en-US', EUR: 'es-ES', BRL: 'pt-BR', UYU: 'es-UY', BOB: 'es-BO', PYG: 'es-PY', DOP: 'es-DO', GTQ: 'es-GT', CRC: 'es-CR' };
const localeOf = (cur) => LOCALE[cur] || 'es';
const fmtCache = new Map();
function money(cents, cur = 'COP') {
  const frac = !ZERO.has(cur) && cents % 100 !== 0 ? 2 : 0;
  const k = cur + frac;
  let f = fmtCache.get(k);
  if (!f) { f = new Intl.NumberFormat(localeOf(cur), { style: 'currency', currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac }); fmtCache.set(k, f); }
  return f.format(cents / 100);
}

// ---------- Horarios ----------
// hours = { mon: ['08:00','18:00'], ... } ; un día sin entrada está cerrado.
function parseHours(raw) { try { const h = JSON.parse(raw || '{}'); return h && typeof h === 'object' ? h : {}; } catch { return {}; } }
function hoursFromForm(b) {
  const h = {};
  for (const [d] of DAYS) {
    const o = String(b['h_' + d + '_o'] || ''), c = String(b['h_' + d + '_c'] || '');
    if (b['h_' + d + '_on'] && /^\d\d:\d\d$/.test(o) && /^\d\d:\d\d$/.test(c)) h[d] = [o, c];
  }
  return JSON.stringify(h);
}
function openState(shop) {
  const h = parseHours(shop.hours);
  if (!Object.keys(h).length) return { open: true, label: '', known: false };
  let parts;
  try { parts = new Intl.DateTimeFormat('en-US', { timeZone: shop.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); }
  catch { return { open: true, label: '', known: false }; }
  const get = (t) => parts.find((p) => p.type === t).value;
  const dayIdx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  const mins = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
  const toM = (s) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3), 10);
  const today = h[DAYS[dayIdx][0]], prev = h[DAYS[(dayIdx + 6) % 7][0]];
  if (today) {
    const [o, c] = [toM(today[0]), toM(today[1])];
    if (c > o ? mins >= o && mins < c : mins >= o) return { open: true, label: 'Abierto hasta las ' + fmtTime(today[1]), known: true };
  }
  if (prev) { const [o, c] = [toM(prev[0]), toM(prev[1])]; if (c <= o && mins < c) return { open: true, label: 'Abierto hasta las ' + fmtTime(prev[1]), known: true }; }
  if (today && mins < toM(today[0])) return { open: false, label: 'Cerrado · abre a las ' + fmtTime(today[0]), known: true };
  for (let i = 1; i <= 7; i++) {
    const d = h[DAYS[(dayIdx + i) % 7][0]];
    if (d) return { open: false, label: 'Cerrado · abre ' + (i === 1 ? 'mañana' : 'el ' + DAYS[(dayIdx + i) % 7][1].toLowerCase()) + ' a las ' + fmtTime(d[0]), known: true };
  }
  return { open: false, label: 'Cerrado', known: true };
}
function fmtTime(s) { const [h, m] = s.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'a. m.' : 'p. m.'}`; }

// ---------- Textos y enlaces ----------
function slugify(s) {
  const base = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base.length >= 3 ? base : (base + '-tienda').replace(/^-/, '');
}
function uniqueSlug(wanted, exceptId = 0) {
  let base = slugify(wanted);
  if (RESERVED.has(base)) base += '-tienda';
  let slug = base, i = 1;
  while (one('SELECT 1 x FROM shops WHERE slug=? AND id<>?', slug, exceptId)) slug = `${base}-${++i}`;
  return slug;
}
// Formas de pago del negocio: una por línea ("Nequi: 300 123 4567"). El nombre es lo que va antes de los dos puntos o del primer número.
function payMethods(shop) {
  return String(shop.payment_info || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8)
    .map((text) => ({ text, label: (text.split(/[:\d]/)[0].trim() || text).slice(0, 40) }));
}
const waLink = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
function orderText(shop, o, items, paid = false) {
  const L = [`🛒 *Nuevo pedido ${o.code}*`, ''];
  for (const it of items) L.push(`• ${it.qty} × ${it.name} — ${money(it.price_cents * it.qty, shop.currency)}`);
  L.push('');
  if (o.discount_cents) L.push(`Descuento${o.coupon_code ? ' (' + o.coupon_code + ')' : ''}: -${money(o.discount_cents, shop.currency)}`);
  if (o.delivery_cents) L.push(`Domicilio: ${money(o.delivery_cents, shop.currency)}`);
  L.push(`*Total: ${money(o.total_cents, shop.currency)}*`);
  if (paid) L.push('✅ Pagado en línea');
  L.push('');
  L.push(`👤 ${o.customer_name}`);
  if (o.pay_choice) L.push(`💳 Pago: ${o.pay_choice}`);
  L.push(o.mode === 'delivery' ? `📍 Domicilio: ${o.address}` : '📍 Recoge en el local');
  if (o.note) L.push(`📝 ${o.note}`);
  return L.join('\n');
}
// Color de texto legible (blanco o negro) sobre el color de marca del negocio.
function inkOn(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0f172a' : '#fff';
}
const shopUrl = (base, shop) => `${base}/t/${shop.slug}`;
const dayKey = (t = now()) => new Date(t).toISOString().slice(0, 10);

function topCategoriesWithProducts(shopId) {
  const cats = all('SELECT id, name FROM categories WHERE shop_id=? ORDER BY sort, id', shopId);
  const prods = all('SELECT * FROM products WHERE shop_id=? AND active=1 ORDER BY featured DESC, sort, id', shopId);
  return { cats, prods };
}

module.exports = { PLAN_LABEL, trialDaysLeft, quotaBytes, payMethods, localeOf, inkOn, CURRENCIES, TZ, KINDS, DAYS, STATUS, RESERVED, planOf, productLimit, can, money, parseHours, hoursFromForm, openState, fmtTime, slugify, uniqueSlug, waLink, orderText, shopUrl, dayKey, topCategoriesWithProducts, ZERO };

// Banners de la portada: lectura para la web y validación de lo que escribe el administrador.
const { all } = require('./db');

const ICONS = ['shield', 'mappin', 'question', 'star', 'bolt', 'wallet', 'check', 'bell', 'users', 'chat'];
const TILE_SETS = { 'icons:tool,paw,truck,bag': 'Herramientas, mascota, camión, bolsa', 'icons:plug,monitor,home,chat': 'Enchufe, pantalla, casa, chat', 'icons:star,check,bolt,wallet': 'Estrella, check, rayo, billetera' };
const MAX_SLIDES = 8;

const active = () => all('SELECT * FROM slides WHERE active=1 ORDER BY sort, id');
const everything = () => all('SELECT * FROM slides ORDER BY sort, id');

const text = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// Enlaces permitidos: de la propia web (/ruta) o https://… ; cualquier otra cosa (javascript:, etc.) se descarta.
const link = (v) => { const s = String(v ?? '').trim().slice(0, 200); return /^\/(?!\/)[^\s]*$/.test(s) || /^https:\/\/[^\s]+$/.test(s) ? s : ''; };
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);

// Campos limpios a partir del formulario del administrador (la imagen se resuelve aparte).
function fields(b) {
  return {
    sort: b.sort === undefined || String(b.sort).trim() === '' ? null : Math.max(0, Math.min(999, Math.round(Number(b.sort) || 0))), active: b.active ? 1 : 0,
    icon: ICONS.includes(b.icon) ? b.icon : 'shield', kicker: text(b.kicker, 60), title: text(b.title, 100), body: text(b.body, 260),
    btn1_text: text(b.btn1_text, 32), btn1_link: link(b.btn1_link), btn2_text: text(b.btn2_text, 32), btn2_link: link(b.btn2_link),
    g1: color(b.g1, '#312e81'), g2: color(b.g2, '#6d28d9'), layout: ['right', 'left', 'full'].includes(b.layout) ? b.layout : 'right',
  };
}
module.exports = { ICONS, TILE_SETS, MAX_SLIDES, active, everything, fields };

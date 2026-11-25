// Idiomas de lo que ve el cliente final (tienda, reservas, mensajes de WhatsApp): español, inglés y portugués.
// Las claves son el texto en español; si falta la traducción se muestra el español.
const D = require('./i18n-dict');
const LANGS = { es: 'Español', en: 'English', pt: 'Português' };
const norm = (l) => (LANGS[l] ? l : 'es');
const fill = (o, vars) => (vars ? o.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : o);
function tr(lang) {
  const d = D[norm(lang)];
  return (s, vars) => fill(d && d[s] !== undefined ? d[s] : s, vars);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Nombre del día de la semana (0 = lunes).
function weekday(lang, idx, style = 'long') {
  const l = norm(lang);
  return cap(new Intl.DateTimeFormat(l, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + idx))));
}
// Hora "HH:MM" en el formato de cada idioma (es: 10 a. m.; en: 10 AM; pt: 10:00).
function fmtTime(s, lang) {
  const [h, m] = s.split(':').map(Number), mm = String(m).padStart(2, '0'), l = norm(lang);
  if (l === 'en') return `${h % 12 || 12}${m ? ':' + mm : ''} ${h < 12 ? 'AM' : 'PM'}`;
  if (l === 'pt') return `${String(h).padStart(2, '0')}:${mm}`;
  return `${h % 12 || 12}${m ? ':' + mm : ''} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
// Fecha larga ("jueves 26 de noviembre", "Thursday, November 26") y corta (día y mes) de un 'AAAA-MM-DD'.
const dayLong = (day, lang) => new Intl.DateTimeFormat(norm(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
const dayShort = (day, lang) => {
  const d = new Date(day + 'T12:00:00Z'), l = norm(lang);
  return { wd: cap(new Intl.DateTimeFormat(l, { weekday: 'short', timeZone: 'UTC' }).format(d).replace('.', '')), dm: new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d).replace('.', '') };
};
// Textos que usa public/js/shop.js: se leen del propio archivo (T('...')) para no mantener dos listas.
const JS_KEYS = (() => { try { const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'shop.js'), 'utf8'); return [...new Set([...src.matchAll(/\bT\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")))]; } catch { return []; } })();
module.exports = { JS_KEYS, LANGS, norm, tr, weekday, fmtTime, dayLong, dayShort };

// Ciudades de todo el mundo: búsqueda, GPS (geocodificación inversa) y validación firmada.
// Proveedor por defecto: OpenStreetMap Nominatim (gratis). Es compatible con cualquier servicio
// con la misma API (LocationIQ, Nominatim propio...) cambiando GEO_URL / GEO_KEY.
//
// Diseño para costo mínimo y política de uso de Nominatim (máx. 1 consulta/s, con caché):
//  - Caché en SQLite (búsquedas 30 días, GPS 90 días): la misma ciudad nunca se consulta dos veces.
//  - Cola global con 1 consulta/s hacia el proveedor y límite por IP hacia nuestra API.
//  - Las coordenadas del GPS se redondean (~1 km) antes de consultar y NO se guardan en la base.
//  - Cada ciudad elegida viaja con una firma HMAC: el servidor solo acepta ciudades que él mismo
//    entregó (o las de la lista inicial), así no se guardan textos inventados.
const crypto = require('crypto');
const { db, one, run, now, settings } = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS geo_cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)');

const BASE = String(process.env.GEO_URL || 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
const KEY = process.env.GEO_KEY || '';
const EMAIL = process.env.GEO_EMAIL || '';
const LANG = process.env.GEO_LANG || 'es,en';
const UA = process.env.GEO_USER_AGENT || `Haganapp/1.0 (${process.env.BASE_URL || 'sitio web'})`;
const SECRET = () => process.env.SESSION_SECRET || 'cambiar-este-secreto';
const DAY = 86400000;

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const cleanLabel = (s) => String(s || '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>"|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
const shortName = (label) => String(label || '').split(',')[0].trim();
const legacy = () => String(settings().cities || '').split(',').map((c) => c.trim()).filter(Boolean);

// ---------- Firma ----------
const sign = (label) => crypto.createHmac('sha256', SECRET()).update('city:' + cleanLabel(label)).digest('base64url').slice(0, 22);
function verify(label, sig) {
  const a = Buffer.from(sign(label)), b = Buffer.from(String(sig || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Devuelve la ciudad válida o ''. Acepta la lista inicial (sin firma) o una ciudad firmada.
function resolve(label, sig) {
  const l = cleanLabel(label);
  if (!l) return '';
  if (legacy().includes(l)) return l;
  return verify(l, sig) ? l : '';
}

// ---------- Normalización ----------
function normalize(item) {
  const a = item?.address || {};
  const name = a.city || a.town || a.village || a.municipality || a.city_district || a.hamlet || a.suburb || a.county || item?.name || '';
  const cc = String(a.country_code || '').toUpperCase();
  if (!name || !cc) return null;
  let region = a.state || a.region || a.province || a.state_district || '';
  if (fold(region).includes(fold(name))) region = '';
  let label = [name, region, a.country].filter(Boolean).join(', ');
  // Las ciudades de la lista inicial (Colombia) conservan su nombre corto para que los
  // supermercados, filtros y pedidos ya existentes sigan funcionando igual.
  if (cc === 'CO') { const l = legacy().find((x) => fold(x) === fold(name)); if (l) label = l; }
  label = cleanLabel(label);
  return { label, name: cleanLabel(name), region: cleanLabel(region), country: cleanLabel(a.country || ''), cc, sig: sign(label) };
}

// ---------- Caché ----------
const cget = (k, ttl) => { const r = one('SELECT v, at FROM geo_cache WHERE k=?', k); return r && now() - r.at < ttl ? JSON.parse(r.v) : null; };
const cset = (k, v) => run('INSERT OR REPLACE INTO geo_cache(k,v,at) VALUES (?,?,?)', k, JSON.stringify(v), now());
setInterval(() => { try { run('DELETE FROM geo_cache WHERE at < ?', now() - 100 * DAY); } catch {} }, 6 * 3600000).unref();

// ---------- Cola hacia el proveedor (1 consulta por segundo) ----------
let chain = Promise.resolve(), waiting = 0, last = 0;
function upstream(path, params) {
  if (waiting >= 15) return Promise.reject(Object.assign(new Error('busy'), { code: 'BUSY' }));
  waiting++;
  const job = chain.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const u = new URL(BASE + path);
    const p = { format: 'jsonv2', addressdetails: 1, 'accept-language': LANG, ...params };
    if (KEY) p.key = KEY;
    if (EMAIL) p.email = EMAIL;
    Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, v));
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
    try {
      const res = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw Object.assign(new Error('http ' + res.status), { code: 'UPSTREAM' });
      return await res.json();
    } finally { clearTimeout(t); }
  }).finally(() => { waiting--; });
  chain = job.catch(() => {});
  return job;
}

// ---------- API pública ----------
async function search(q) {
  q = String(q || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 3) return [];
  const k = 's:' + fold(q);
  const hit = cget(k, 30 * DAY);
  if (hit) return hit;
  const raw = await upstream('/search', { q, limit: 10, featuretype: 'settlement', dedupe: 1 });
  const seen = new Set(), out = [];
  for (const it of Array.isArray(raw) ? raw : []) {
    const p = normalize(it);
    if (p && !seen.has(p.label)) { seen.add(p.label); out.push(p); }
    if (out.length >= 8) break;
  }
  cset(k, out);
  return out;
}

async function reverse(lat, lon) {
  lat = Number(lat); lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  lat = lat.toFixed(2); lon = lon.toFixed(2); // ~1 km: suficiente para la ciudad y no guarda la ubicación exacta
  const k = `r:${lat},${lon}`;
  const hit = cget(k, 90 * DAY);
  if (hit) return hit.none ? null : hit;
  const raw = await upstream('/reverse', { lat, lon, zoom: 10 });
  const p = raw && !raw.error ? normalize(raw) : null;
  cset(k, p || { none: true });
  return p;
}

// ---------- Límite por IP (memoria; no escribe en disco) ----------
const hits = new Map();
setInterval(() => { const lim = Date.now() - 60000; for (const [k, v] of hits) if (v.t < lim) hits.delete(k); }, 60000).unref();
function allow(ip, max = 40) {
  const h = hits.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - h.t > 60000) { h.n = 0; h.t = Date.now(); }
  h.n++; hits.set(ip, h);
  return h.n <= max;
}

module.exports = { search, reverse, sign, verify, resolve, cleanLabel, shortName, allow, fold };

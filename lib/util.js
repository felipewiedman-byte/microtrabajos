// Ayudantes HTTP: errores, validación, subida segura de imágenes y control de acceso.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { DATA_DIR } = require('./db');

const UP = path.join(DATA_DIR, 'uploads');
const fail = (status, message) => { const e = new Error(message); e.status = status; e.expose = true; return e; };
const clean = (v, max = 500) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
// "12.500" / "12,5" / "12500" -> centavos. Se aceptan miles con punto cuando hay más de 2 dígitos tras el separador.
function toCents(v) {
  let s = String(v ?? '').trim().replace(/[^\d.,]/g, '');
  if (!s) return 0;
  const m = /^(.*)[.,](\d{1,2})$/.exec(s);
  const whole = (m ? m[1] : s).replace(/[.,]/g, ''), frac = m ? m[2].padEnd(2, '0') : '00';
  const n = parseInt(whole || '0', 10) * 100 + parseInt(frac, 10);
  return Number.isFinite(n) && n >= 0 && n <= 99999999999 ? n : 0;
}
const phone = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 8 && d.length <= 15 ? d : ''; };
const handle = (v) => String(v ?? '').trim().replace(/^.*(?:facebook\.com|fb\.com|m\.me|instagram\.com)\//i, '').replace(/^@/, '').replace(/[^\w.]/g, '').slice(0, 60);

// Subida: se guarda en carpeta temporal y se valida el contenido real (no la extensión).
const upload = multer({
  storage: multer.diskStorage({ destination: UP, filename: (req, f, cb) => cb(null, 'tmp-' + crypto.randomBytes(12).toString('hex')) }),
  limits: { fileSize: 2 * 1024 * 1024, files: 2, fields: 60, fieldSize: 20000 },
});
const uploadMany = multer({ storage: multer.diskStorage({ destination: UP, filename: (req, f, cb) => cb(null, 'tmp-' + crypto.randomBytes(12).toString('hex')) }), limits: { fileSize: 2 * 1024 * 1024, files: 40, fields: 1500, fieldSize: 30000 } });
function sniff(file) {
  const fd = fs.openSync(file, 'r'), b = Buffer.alloc(12);
  fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return '.ico';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}
let sharp = null;
try { sharp = require('sharp'); sharp.cache(false); sharp.concurrency(2); } catch { console.warn('[Vitrina] sharp no está instalado: las imágenes se guardan sin reducir.'); }
// Máximo 2 imágenes procesándose a la vez: si suben muchas juntas, esperan turno y la memoria no se dispara.
let active = 0; const waiting = [];
const acquire = () => new Promise((ok) => { if (active < 2) { active++; ok(); } else waiting.push(ok); });
const release = () => { const n = waiting.shift(); if (n) n(); else active--; };
// Convierte un archivo subido en una imagen definitiva; devuelve el nombre o null (y borra lo inválido).
// Con sharp, TODA imagen se reduce a un tamaño máximo y se guarda en WebP: el espacio por foto queda acotado (unos 30–120 KB).
async function keepImage(f, max = 1000) {
  if (!f) return null;
  const ext = sniff(f.path);
  if (!ext) { fs.unlink(f.path, () => {}); return null; }
  const base = crypto.randomBytes(14).toString('hex');
  if (sharp) {
    await acquire();
    try {
      await sharp(f.path, { limitInputPixels: 50e6 }).rotate().resize(max, max, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(UP, base + '.webp'));
      fs.unlink(f.path, () => {});
      return base + '.webp';
    } catch { fs.unlink(f.path, () => {}); return null; } finally { release(); }
  }
  fs.renameSync(f.path, path.join(UP, base + ext));
  return base + ext;
}
// Ícono de la pestaña: .ico tal cual; PNG/JPG/WebP se convierten a PNG cuadrado de 128 px.
async function keepFavicon(f) {
  if (!f) return null;
  const ext = sniff(f.path);
  if (!ext) { fs.unlink(f.path, () => {}); return null; }
  const base = crypto.randomBytes(14).toString('hex');
  if (ext === '.ico' || !sharp) { fs.renameSync(f.path, path.join(UP, base + (ext === '.ico' ? '.ico' : ext))); return base + (ext === '.ico' ? '.ico' : ext); }
  try { await sharp(f.path).resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(UP, base + '.png')); fs.unlink(f.path, () => {}); return base + '.png'; }
  catch { fs.unlink(f.path, () => {}); return null; }
}
const dropImage = (name) => { if (name && /^[a-f0-9]{28}\.(jpg|png|webp|ico)$/.test(name)) fs.unlink(path.join(UP, name), () => {}); };
// Limpia archivos temporales de peticiones fallidas.
const dropTemp = (req) => { const f = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat(); for (const x of f) fs.unlink(x.path, () => {}); };

// Administradores: todos pueden hacer todo en el panel de administración.
const isStaff = (u) => !!u && u.role === 'admin';
const hasPerm = (u) => isStaff(u);
const requireStaff = (req, res, next) => !req.user ? res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl)) : isStaff(req.user) ? next() : next(fail(403, 'Acceso restringido.'));
const requireAuth = (req, res, next) => req.user ? next() : res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl));
const requireOwner = (req, res, next) => {
  if (!req.user) return res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl));
  if (!req.shop) return res.redirect(isStaff(req.user) ? '/admin' : '/panel/crear');
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl));
  if (!hasPerm(req.user, 'system')) return next(fail(403, 'Acceso restringido.'));
  next();
};
// CSRF para formularios con archivos (se valida después de multer).
const csrfMultipart = (req, res, next) => {
  if (!req.body || req.body._csrf !== req.csrfToken) { dropTemp(req); return next(fail(403, 'El formulario expiró. Recarga la página.')); }
  next();
};
const safeNext = (n) => (typeof n === 'string' && /^\/[a-z0-9\-_/?=&.%]*$/i.test(n) && !n.startsWith('//')) ? n : '/panel';

module.exports = { isStaff, hasPerm, requireStaff, uploadMany, keepFavicon, fail, clean, int, toCents, phone, handle, upload, keepImage, dropImage, dropTemp, requireAuth, requireOwner, requireAdmin, csrfMultipart, safeNext, UP };

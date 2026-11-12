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
function sniff(file) {
  const fd = fs.openSync(file, 'r'), b = Buffer.alloc(12);
  fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}
// Convierte un archivo subido en una imagen definitiva; devuelve el nombre o null (y borra lo inválido).
function keepImage(f) {
  if (!f) return null;
  const ext = sniff(f.path);
  if (!ext) { fs.unlink(f.path, () => {}); return null; }
  const name = crypto.randomBytes(14).toString('hex') + ext;
  fs.renameSync(f.path, path.join(UP, name));
  return name;
}
const dropImage = (name) => { if (name && /^[a-f0-9]{28}\.(jpg|png|webp)$/.test(name)) fs.unlink(path.join(UP, name), () => {}); };
// Limpia archivos temporales de peticiones fallidas.
const dropTemp = (req) => { const f = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat(); for (const x of f) fs.unlink(x.path, () => {}); };

const requireAuth = (req, res, next) => req.user ? next() : res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl));
const requireOwner = (req, res, next) => {
  if (!req.user) return res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl));
  if (!req.shop) return res.redirect('/panel/crear');
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl));
  if (req.user.role !== 'admin') return next(fail(403, 'Acceso restringido.'));
  next();
};
// CSRF para formularios con archivos (se valida después de multer).
const csrfMultipart = (req, res, next) => {
  if (!req.body || req.body._csrf !== req.csrfToken) { dropTemp(req); return next(fail(403, 'El formulario expiró. Recarga la página.')); }
  next();
};
const safeNext = (n) => (typeof n === 'string' && /^\/[a-z0-9\-_/?=&.%]*$/i.test(n) && !n.startsWith('//')) ? n : '/panel';

module.exports = { fail, clean, int, toCents, phone, handle, upload, keepImage, dropImage, dropTemp, requireAuth, requireOwner, requireAdmin, csrfMultipart, safeNext, UP };

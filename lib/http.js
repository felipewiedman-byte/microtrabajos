const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { DATA_DIR } = require('./db');

const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|ps1|sh|js|vbs|jar|apk|dll|html?|svg|php)$/i;

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'uploads'),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase().slice(0, 10)),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !BLOCKED.test(file.originalname)),
});

// Imágenes del panel (logos, ícono, portada): hasta 4 a la vez, máximo 5 MB cada una.
const IMG_OK = /\.(png|jpe?g|webp|gif|ico)$/i;
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'uploads'),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase().slice(0, 10)),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (IMG_OK.test(file.originalname)) return cb(null, true);
    (req.rejectedFiles ||= []).push(file.originalname);
    cb(null, false);
  },
});

function fail(status, message) { const e = new Error(message); e.status = status; e.expose = true; return e; }

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl));
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect('/ingresar?next=' + encodeURIComponent(req.originalUrl));
  if (req.user.role !== 'admin') return next(fail(403, 'Acceso restringido.'));
  next();
}
// CSRF para formularios con archivos (se valida después de multer).
function csrfMultipart(req, res, next) {
  if (!req.body || req.body._csrf !== req.csrfToken) return next(fail(403, 'El formulario expiró. Recargue la página.'));
  next();
}
const toCents = (v) => Math.round(parseFloat(String(v || '0').replace(',', '.')) * 100) || 0;
const clean = (v, max = 5000) => String(v || '').trim().slice(0, max);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

module.exports = { imageUpload, upload, fail, requireAuth, requireAdmin, csrfMultipart, toCents, clean, int };

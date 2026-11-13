// Cloudflare R2: guarda las imágenes y las copias de seguridad fuera del servidor.
// El bucket queda PRIVADO: la web trae cada imagen de R2 y la entrega en /m/... (los enlaces no cambian).
// Se configura en Admin → Ajustes → Cloudflare R2. Firma de peticiones AWS SigV4 (API compatible con S3), sin librerías externas.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { db, one, all, run, now, settings, DATA_DIR } = require('./db');
const secrets = require('./secrets');

db.exec('CREATE TABLE IF NOT EXISTS r2_files (name TEXT PRIMARY KEY, size INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)');
const UP = path.join(DATA_DIR, 'uploads');
const NAME = /^[a-f0-9]{28}\.(jpg|png|webp)$/;

// creds(): solo las claves (sirve para leer y borrar lo que ya está en R2 aunque se apague el interruptor).
// cfg(): claves + interruptor encendido (decide si las imágenes NUEVAS van a R2).
function cfg() { return settings().r2_on === '1' ? creds() : null; }
function creds() {
  const s = settings();
  const account = String(s.r2_account || '').trim(), bucket = String(s.r2_bucket || '').trim(), key = String(s.r2_key_id || '').trim(), secret = secrets.appGet('r2_secret');
  if (!account || !bucket || !key || !secret) return null;
  return { endpoint: process.env.R2_ENDPOINT || `https://${account}.r2.cloudflarestorage.com`, bucket, key, secret };
}
const on = () => !!cfg();
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();

// Petición firmada a R2. Devuelve { status, headers, body (Buffer) }.
function request(c, method, key, body = Buffer.alloc(0), type) {
  const u = new URL(c.endpoint), host = u.host, uri = `/${encodeURIComponent(c.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const amz = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''), day = amz.slice(0, 8), ph = sha(body);
  const canon = [method, uri, '', `host:${host}`, `x-amz-content-sha256:${ph}`, `x-amz-date:${amz}`, '', 'host;x-amz-content-sha256;x-amz-date', ph].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const sig = crypto.createHmac('sha256', hmac(hmac(hmac(hmac('AWS4' + c.secret, day), 'auto'), 's3'), 'aws4_request')).update(['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n')).digest('hex');
  const headers = { host, 'x-amz-date': amz, 'x-amz-content-sha256': ph, authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`, 'content-length': body.length };
  if (type) headers['content-type'] = type;
  return new Promise((ok, ko) => {
    const rq = (u.protocol === 'http:' ? http : https).request({ hostname: u.hostname, port: u.port || undefined, method, path: uri, headers, timeout: 20000 }, (rs) => {
      const parts = []; rs.on('data', (d) => parts.push(d)); rs.on('end', () => ok({ status: rs.statusCode, headers: rs.headers, body: Buffer.concat(parts) }));
    });
    rq.on('timeout', () => rq.destroy(new Error('R2 no respondió a tiempo')));
    rq.on('error', ko); rq.end(body);
  });
}
const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.db': 'application/octet-stream' };
async function put(key, buf) {
  const c = cfg(); if (!c) throw new Error('R2 no está configurado');
  const r = await request(c, 'PUT', key, buf, TYPES[path.extname(key)] || 'application/octet-stream');
  if (r.status !== 200) throw new Error(`R2 respondió ${r.status}: ${r.body.toString().slice(0, 160)}`);
}
async function get(key) { const c = creds(); if (!c) return null; const r = await request(c, 'GET', key); return r.status === 200 ? r : null; }
async function del(key) { const c = creds(); if (c) await request(c, 'DELETE', key).catch(() => {}); }

// Sube una imagen recién guardada y la borra del disco. Si R2 falla, la imagen se queda en el servidor (no se pierde nada).
async function offload(name) {
  if (!on() || !NAME.test(name)) return false;
  const file = path.join(UP, name);
  try {
    const buf = await fs.promises.readFile(file);
    await put(name, buf);
    run('INSERT OR REPLACE INTO r2_files(name,size,at) VALUES (?,?,?)', name, buf.length, now());
    await fs.promises.unlink(file).catch(() => {});
    return true;
  } catch (e) { console.error('[Vitrina] R2: no se pudo subir', name, '-', e.message); return false; }
}
const has = (name) => !!one('SELECT 1 x FROM r2_files WHERE name=?', name);
const sizeOf = (name) => (one('SELECT size FROM r2_files WHERE name=?', name) || {}).size || 0;
function remove(name) { if (!has(name)) return; run('DELETE FROM r2_files WHERE name=?', name); del(name); }
const totals = () => one('SELECT COUNT(*) n, COALESCE(SUM(size),0) bytes FROM r2_files');

// Pasa a R2 las imágenes que aún están en el servidor (en segundo plano, de a una).
const job = { running: false, done: 0, failed: 0, total: 0 };
function migrate() {
  if (job.running || !on()) return job;
  const keepLocal = new Set([settings().favicon].filter(Boolean));
  const list = fs.readdirSync(UP).filter((f) => NAME.test(f) && !keepLocal.has(f));
  Object.assign(job, { running: true, done: 0, failed: 0, total: list.length });
  (async () => { for (const f of list) { if (await offload(f)) job.done++; else job.failed++; } job.running = false; })();
  return job;
}
// Prueba completa: sube, lee y borra un archivo.
async function test() {
  const c = cfg(); if (!c) return { ok: false, error: 'Completa los 4 datos y activa la opción.' };
  const key = `prueba-${Date.now()}.txt`, body = Buffer.from('ok');
  try {
    const p = await request(c, 'PUT', key, body, 'text/plain');
    if (p.status === 403 || p.status === 401) return { ok: false, error: 'Cloudflare rechazó las claves. Revisa el Access Key ID, la clave secreta y que el token tenga permiso de "Lectura y escritura" sobre el bucket.' };
    if (p.status === 404) return { ok: false, error: 'No existe un bucket con ese nombre en esa cuenta. Revisa el nombre del bucket y el Account ID.' };
    if (p.status !== 200) return { ok: false, error: `Cloudflare respondió ${p.status}.` };
    const g = await request(c, 'GET', key);
    await request(c, 'DELETE', key);
    return g.status === 200 && g.body.toString() === 'ok' ? { ok: true } : { ok: false, error: 'Se pudo subir pero no leer el archivo de prueba.' };
  } catch (e) { return { ok: false, error: `No se pudo conectar con Cloudflare (${e.code || e.message}). Revisa el Account ID.` }; }
}
// Copia de la base de datos a R2 (carpeta backups/). Se conservan 30 días.
async function backup(file) {
  if (!on()) return false;
  const name = path.basename(file);
  await put('backups/' + name, await fs.promises.readFile(file));
  const old = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  del(`backups/vitrina-${old}.db`);
  return true;
}
module.exports = { on, cfg, put, get, del, offload, has, sizeOf, remove, totals, migrate, job, test, backup, NAME, request };

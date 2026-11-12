// Copia de seguridad diaria de la base de datos (usuarios, pedidos, billetera, ajustes).
// VACUUM INTO genera una copia consistente aunque la web esté en uso. Se guardan las últimas 7 en DATA_DIR/backups.
// Los archivos subidos (uploads/) no se copian aquí: use scripts/backup.sh desde el cron del servidor.
// Una copia en el mismo disco no protege de un fallo del disco: descargue copias a otro lugar (ver scripts/backup.sh).
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

const DIR = path.join(DATA_DIR, 'backups');
const KEEP = 7;

function backupNow() {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `haganapp-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(file)) return null; // ya hay copia de hoy
  const tmp = file + '.tmp';
  try { fs.unlinkSync(tmp); } catch { /* no existe */ }
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  fs.renameSync(tmp, file); // la copia aparece completa o no aparece
  const old = fs.readdirSync(DIR).filter((f) => /^haganapp-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -KEEP);
  for (const f of old) { try { fs.unlinkSync(path.join(DIR, f)); } catch { /* ignorar */ } }
  return file;
}
const list = () => { try { return fs.readdirSync(DIR).filter((f) => /^haganapp-.*\.db$/.test(f)).sort().reverse(); } catch { return []; } };

function schedule() {
  const run = () => { try { const f = backupNow(); if (f) console.log(`[Haganapp] Copia de seguridad creada: ${path.basename(f)}`); } catch (e) { console.error('[Haganapp] Falló la copia de seguridad:', e.message); } };
  setTimeout(run, 2 * 60 * 1000).unref();           // 2 min después de arrancar (no frena el inicio)
  setInterval(run, 6 * 60 * 60 * 1000).unref();     // revisa cada 6 h; solo crea una por día
}
module.exports = { backupNow, list, schedule, DIR };

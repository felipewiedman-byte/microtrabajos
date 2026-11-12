// Copia diaria consistente de la base (VACUUM INTO). Se conservan las últimas 7 en DATA_DIR/backups.
// Para copiar también las imágenes y llevarlas a otro lugar use scripts/backup.sh desde el cron.
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

const DIR = path.join(DATA_DIR, 'backups'), KEEP = 7;
function backupNow() {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `vitrina-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(file)) return null;
  const tmp = file + '.tmp';
  try { fs.unlinkSync(tmp); } catch { /* no existe */ }
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  fs.renameSync(tmp, file);
  for (const f of fs.readdirSync(DIR).filter((x) => /^vitrina-\d{4}-\d{2}-\d{2}\.db$/.test(x)).sort().slice(0, -KEEP)) { try { fs.unlinkSync(path.join(DIR, f)); } catch { /* ignorar */ } }
  return file;
}
function schedule() {
  const go = () => { try { const f = backupNow(); if (f) console.log(`[Vitrina] Copia creada: ${path.basename(f)}`); } catch (e) { console.error('[Vitrina] Falló la copia:', e.message); } };
  setTimeout(go, 2 * 60 * 1000).unref();
  setInterval(go, 6 * 60 * 60 * 1000).unref();
}
module.exports = { backupNow, schedule };

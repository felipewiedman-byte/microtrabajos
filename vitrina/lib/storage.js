// Control del espacio: uso por negocio, imágenes huérfanas, disco libre y limpieza de cuentas vencidas.
const fs = require('fs');
const path = require('path');
const { all, one, run, now, DATA_DIR } = require('./db');
const U = require('./util');

const UP = path.join(DATA_DIR, 'uploads');
const NAME = /^[a-f0-9]{28}\.(jpg|png|webp|ico)$/;
const size = (name) => { try { return name ? fs.statSync(path.join(UP, name)).size : 0; } catch { return 0; } };

// Bytes que ocupa un negocio (logo, portada y fotos de productos).
function usedBytes(shopId) {
  const s = one('SELECT logo, cover FROM shops WHERE id=?', shopId);
  let n = s ? size(s.logo) + size(s.cover) : 0;
  for (const p of all('SELECT image FROM products WHERE shop_id=? AND image IS NOT NULL', shopId)) n += size(p.image);
  return n;
}
let shopCache = null;
const perShop = (limit = 10) => { if (shopCache && Date.now() - shopCache.at < 300000 && shopCache.limit === limit) return shopCache.v; const v = perShop_(limit); shopCache = { at: Date.now(), limit, v }; return v; };
const perShop_ = (limit = 10) => all('SELECT s.id, s.name, s.slug, u.email FROM shops s JOIN users u ON u.id=s.user_id')
  .map((s) => ({ ...s, bytes: usedBytes(s.id) })).sort((a, b) => b.bytes - a.bytes).slice(0, limit);
let totalCache = null;
function totalBytes() { if (totalCache && Date.now() - totalCache.at < 300000) return totalCache.v; let v = 0; try { v = fs.readdirSync(UP).reduce((a, f) => a + size(f), 0); } catch { /* sin carpeta */ } totalCache = { at: Date.now(), v }; return v; }
function disk() { try { const d = fs.statfsSync(DATA_DIR); return { free: d.bavail * d.bsize, total: d.blocks * d.bsize }; } catch { return null; } }

// Archivos que ningún producto, logo o portada usa (subidas interrumpidas, productos borrados, etc.).
function cleanOrphans() {
  const used = new Set();
  for (const r of all('SELECT logo, cover FROM shops')) { if (r.logo) used.add(r.logo); if (r.cover) used.add(r.cover); }
  for (const r of all('SELECT image FROM products WHERE image IS NOT NULL')) used.add(r.image);
  for (const r of all("SELECT value FROM settings WHERE key IN ('logo_light','logo_dark','favicon')")) if (r.value) used.add(r.value);
  for (const r of all('SELECT blocks FROM pages')) { for (const m of String(r.blocks).matchAll(/[a-f0-9]{28}\.(?:jpg|png|webp|ico)/g)) used.add(m[0]); }
  const minAge = Number(process.env.ORPHAN_MIN_AGE_MS) || 24 * 3600 * 1000;
  let removed = 0;
  for (const f of fs.readdirSync(UP)) {
    if (!(NAME.test(f) || f.startsWith('tmp-')) || used.has(f)) continue;
    try { const st = fs.statSync(path.join(UP, f)); if (now() - st.mtimeMs > (f.startsWith('tmp-') ? Math.min(minAge, 3600000) : minAge)) { fs.unlinkSync(path.join(UP, f)); removed++; } } catch { /* ya no existe */ }
  }
  return removed;
}

// Cuentas cuya prueba/plan terminó hace más de `days` días y siguen sin pagar: se borran con sus imágenes.
function expiredAccounts(days) {
  const cut = now() - days * 86400000;
  return all("SELECT id FROM users WHERE role='owner' AND created_at < ? AND (trial_until IS NULL OR trial_until < ?) AND NOT (plan IN ('basic','pro') AND (plan_until IS NULL OR plan_until >= ?))", cut, cut, cut);
}
function purgeExpired(days) {
  let n = 0;
  for (const { id } of expiredAccounts(days)) {
    const s = one('SELECT id, logo, cover FROM shops WHERE user_id=?', id);
    if (s) { U.dropImage(s.logo); U.dropImage(s.cover); for (const p of all('SELECT image FROM products WHERE shop_id=?', s.id)) U.dropImage(p.image); }
    run('DELETE FROM users WHERE id=?', id); n++;
  }
  return n;
}
function schedule() {
  const go = () => { try { const n = cleanOrphans(); if (n) console.log(`[Vitrina] Imágenes huérfanas eliminadas: ${n}`); } catch (e) { console.error(e); } };
  setTimeout(go, 5 * 60 * 1000).unref();
  setInterval(go, Number(process.env.ORPHAN_SWEEP_MS) || 24 * 3600 * 1000).unref();
}
module.exports = { usedBytes, perShop, totalBytes, disk, cleanOrphans, expiredAccounts, purgeExpired, schedule };

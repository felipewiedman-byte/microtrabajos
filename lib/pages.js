// Páginas editables (inicio, términos, privacidad y las que crees) guardadas como una lista de secciones.
const { db, one, all, run, now } = require('./db');
const B = require('./blocks');

db.exec('CREATE TABLE IF NOT EXISTS pages (slug TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT \'\', descr TEXT NOT NULL DEFAULT \'\', blocks TEXT NOT NULL DEFAULT \'[]\', published INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)');
const RESERVED = new Set(['admin', 'panel', 'api', 'static', 'media', 'm', 't', 'p', 'ingresar', 'registro', 'salir', 'recuperar', 'restablecer', 'planes', 'webhooks', 'robots.txt', 'sitemap.xml', 'favicon.ico']);
for (const slug of Object.keys(B.DEFAULT_PAGES)) {
  if (!one('SELECT 1 x FROM pages WHERE slug=?', slug)) { const d = B.DEFAULT_PAGES[slug](); run('INSERT INTO pages(slug,title,descr,blocks,updated_at) VALUES (?,?,?,?,?)', slug, d.title, d.descr, JSON.stringify(d.blocks), now()); }
}
// Migración única: agrega las secciones de Agenda y Reseñas a la página de inicio ya existente (antes de las preguntas frecuentes).
if (!one("SELECT 1 x FROM settings WHERE key='home_v3'")) {
  const row = one("SELECT blocks FROM pages WHERE slug='home'");
  if (row) {
    let bl = []; try { bl = JSON.parse(row.blocks); } catch { bl = []; }
    if (Array.isArray(bl) && !bl.some((b) => b && (b.visual === 'agenda' || b.visual === 'resenas'))) {
      const add = B.DEFAULT_PAGES.home().blocks.filter((b) => b.visual === 'agenda' || b.visual === 'resenas');
      const at = bl.findIndex((b) => b && (b.type === 'faq' || b.type === 'cta'));
      bl.splice(at < 0 ? bl.length : at, 0, ...add);
      run("UPDATE pages SET blocks=? WHERE slug='home'", JSON.stringify(bl));
    }
  }
  run("INSERT INTO settings(key,value) VALUES ('home_v3','1')");
}
function parse(row) { if (!row) return null; let blocks = []; try { blocks = JSON.parse(row.blocks); } catch { /* vacío */ } return { ...row, blocks: Array.isArray(blocks) ? blocks : [] }; }
const get = (slug) => parse(one('SELECT * FROM pages WHERE slug=?', slug));
const list = () => all('SELECT slug, title, published, updated_at FROM pages ORDER BY slug=\'home\' DESC, slug');
const save = (slug, { title, descr, blocks, published }) => run('UPDATE pages SET title=?, descr=?, blocks=?, published=?, updated_at=? WHERE slug=?', title, descr, JSON.stringify(blocks), published ? 1 : 0, now(), slug);
const create = (slug, title) => run('INSERT INTO pages(slug,title,blocks,updated_at) VALUES (?,?,?,?)', slug, title, JSON.stringify([{ type: 'text', title, body: 'Escribe aquí el contenido de la página.', narrow: '1', bg: 'white' }]), now());
const remove = (slug) => run('DELETE FROM pages WHERE slug=?', slug);
const reset = (slug) => { const d = B.DEFAULT_PAGES[slug]; if (d) { const x = d(); run('UPDATE pages SET title=?, descr=?, blocks=?, published=1, updated_at=? WHERE slug=?', x.title, x.descr, JSON.stringify(x.blocks), now(), slug); } };
module.exports = { get, list, save, create, remove, reset, RESERVED, BUILTIN: new Set(Object.keys(B.DEFAULT_PAGES)) };

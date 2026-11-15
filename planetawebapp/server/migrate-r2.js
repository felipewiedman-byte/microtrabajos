// Pasa a Cloudflare R2 TODO lo que esta web guardó en el disco del servidor (fotos, videos, logos de emisoras, escudos, avatares, logos del sitio…)
// y actualiza la base de datos. Busca en todas las tablas cualquier texto que apunte a /uploads/…
// Uso:  node --no-warnings migrate-r2.js            → copia a R2 y deja los originales
//       node --no-warnings migrate-r2.js --borrar   → copia a R2 y, si todo salió bien, borra los archivos del disco
'use strict'
const fs = require('fs'), path = require('path')
try { for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') } } catch { /* sin .env */ }
const { DatabaseSync } = require('node:sqlite')
const R2 = require('./r2'), r2 = R2.config()
if (!r2) { console.error('Faltan datos de R2 en .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL).'); process.exit(1) }
const DATA = process.env.PLANETA_DATA || path.join(__dirname, 'data'), UP = path.join(DATA, 'uploads')
const db = new DatabaseSync(path.join(DATA, 'planeta.db'))
const TYPE = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }
const RE = /\/uploads\/([a-f0-9]{24}(?:-t)?\.(?:jpg|png|webp|gif|ico|mp4|webm|mov))/g
const borrar = process.argv.includes('--borrar')
;(async () => {
  const subidos = new Map(), fallos = [], perdidos = []
  let cambios = 0
  const subir = async name => {
    if (subidos.has(name)) return subidos.get(name)
    const file = path.join(UP, name); if (!fs.existsSync(file)) { perdidos.push(name); subidos.set(name, null); return null }
    try { const url = await R2.put(r2, `media/legacy/${name}`, fs.readFileSync(file), TYPE[name.split('.').pop()] || 'application/octet-stream'); subidos.set(name, url); return url }
    catch (e) { fallos.push(name + ' - ' + e.message); subidos.set(name, null); return null }
  }
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name)
  for (const t of tablas) {
    const cols = db.prepare(`PRAGMA table_info("${t}")`).all().filter(c => /TEXT|CHAR|^$/i.test(c.type || '')).map(c => c.name)
    for (const c of cols) {
      let filas; try { filas = db.prepare(`SELECT rowid AS _r, "${c}" AS v FROM "${t}" WHERE "${c}" LIKE '%/uploads/%'`).all() } catch { continue }
      for (const f of filas) {
        let v = String(f.v), cambio = false
        for (const m of [...new Set([...v.matchAll(RE)].map(x => x[1]))]) { const url = await subir(m); if (url) { v = v.split('/uploads/' + m).join(url); cambio = true } }
        if (cambio) { db.prepare(`UPDATE "${t}" SET "${c}" = ? WHERE rowid = ?`).run(v, f._r); cambios++ }
      }
    }
  }
  const ok = [...subidos.values()].filter(Boolean).length
  console.log(`Listo: ${ok} archivos copiados a R2 y ${cambios} registros actualizados${fallos.length ? ', ' + fallos.length + ' con problema:' : '.'}`)
  fallos.forEach(f => console.error('  - ' + f))
  if (perdidos.length) console.log(`Aviso: ${perdidos.length} registros apuntan a archivos que ya no existen en el disco (se quedan como están; no es un error de la migración).`)
  if (borrar) {
    if (fallos.length) { console.log('NO se borró nada del disco porque hubo problemas. Revisa lo de arriba y vuelve a correrlo.'); return }
    let n = 0; for (const name of subidos.keys()) { try { fs.unlinkSync(path.join(UP, name)); n++ } catch { /* ya no estaba */ } }
    fs.rmSync(path.join(DATA, 'cards'), { recursive: true, force: true })
    console.log(`Borrados ${n} archivos del disco (y la carpeta de tarjetas). Reinicia la web: pm2 restart planetapp`)
  } else console.log('Los originales siguen en data/uploads. Cuando verifiques que todo se ve bien, corre con --borrar.')
})()

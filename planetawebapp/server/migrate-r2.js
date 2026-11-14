// Copia a Cloudflare R2 las fotos y videos guardados en disco y actualiza la base de datos.
// Uso: node --no-warnings migrate-r2.js     (los archivos locales NO se borran)
'use strict'
const fs = require('fs'), path = require('path')
try { for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') } } catch {}
const { DatabaseSync } = require('node:sqlite')
const R2 = require('./r2'), r2 = R2.config()
if (!r2) { console.error('Faltan datos de R2 en .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL).'); process.exit(1) }
const DATA = process.env.PLANETA_DATA || path.join(__dirname, 'data')
const db = new DatabaseSync(path.join(DATA, 'planeta.db'))
const TYPE = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }
;(async () => {
  let done = 0, fail = 0
  for (const col of ['image', 'video', 'thumb']) {
    for (const row of db.prepare(`SELECT id, ${col} AS u FROM posts WHERE ${col} LIKE '/uploads/%'`).all()) {
      const name = path.basename(row.u), ext = name.split('.').pop()
      try {
        const url = await R2.put(r2, `media/legacy/${name}`, fs.readFileSync(path.join(DATA, 'uploads', name)), TYPE[ext] || 'application/octet-stream')
        db.prepare(`UPDATE posts SET ${col} = ? WHERE id = ?`).run(url, row.id); done++
      } catch (e) { fail++; console.error('No se pudo subir', name, '-', e.message) }
    }
  }
  console.log(`Listo: ${done} archivos copiados a R2${fail ? ', ' + fail + ' con error' : ''}. Los originales siguen en data/uploads.`)
})()

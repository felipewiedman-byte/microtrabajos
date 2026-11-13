// Convierte un usuario en administrador.  Uso: node --no-warnings make-admin.js NOMBRE_DE_USUARIO
'use strict'
const path = require('path'), { DatabaseSync } = require('node:sqlite')
const handle = (process.argv[2] || '').toLowerCase().replace(/^@/, '')
if (!handle) { console.error('Uso: node --no-warnings make-admin.js NOMBRE_DE_USUARIO'); process.exit(1) }
const db = new DatabaseSync(path.join(process.env.PLANETA_DATA || path.join(__dirname, 'data'), 'planeta.db'))
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'") } catch {}
const r = db.prepare("UPDATE users SET role = 'admin' WHERE handle = ? AND is_example = 0").run(handle)
console.log(r.changes ? `Listo: @${handle} ahora es administrador. Recarga la web y verás el escudo en la barra.` : `No existe una cuenta real con el usuario @${handle}.`)

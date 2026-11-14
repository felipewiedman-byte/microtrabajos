// Convierte una cuenta en administradora.  Uso: node --no-warnings make-admin.js TU_CORREO (o nombre de usuario)
'use strict'
const path = require('path'), { DatabaseSync } = require('node:sqlite')
const handle = (process.argv[2] || '').toLowerCase().replace(/^@/, '')
if (!handle) { console.error('Uso: node --no-warnings make-admin.js NOMBRE_DE_USUARIO'); process.exit(1) }
const db = new DatabaseSync(path.join(process.env.PLANETA_DATA || path.join(__dirname, 'data'), 'planeta.db'))
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'") } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN email TEXT') } catch {}
const r = db.prepare("UPDATE users SET role = 'admin' WHERE (handle = ? OR email = ?) AND is_example = 0").run(handle, handle)
console.log(r.changes ? `Listo: ${handle} ahora es administrador. Recarga la web y verás el escudo en la barra.` : `No existe una cuenta con «${handle}». Primero créala en la web.`)

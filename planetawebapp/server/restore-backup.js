// Descifra una copia de seguridad bajada de Cloudflare R2 (backups/planeta-diaN.db.enc).
// Uso:  node restore-backup.js archivo.db.enc salida.db      (usa data/secret.key de este servidor)
'use strict'
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const [inp, out] = process.argv.slice(2); if (!inp || !out) { console.error('Uso: node restore-backup.js archivo.db.enc salida.db'); process.exit(1) }
const keyFile = path.join(process.env.PLANETA_DATA || path.join(__dirname, 'data'), 'secret.key')
const secret = fs.readFileSync(keyFile, 'utf8').trim()
const key = crypto.createHash('sha256').update('planeta-backup:' + secret).digest(), b = fs.readFileSync(inp)
const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28))
fs.writeFileSync(out, Buffer.concat([d.update(b.subarray(28)), d.final()])); console.log('Listo:', out)

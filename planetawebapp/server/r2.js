// Cloudflare R2 (S3-compatible) helpers: AWS Signature V4 presigned URLs, no dependencies.
'use strict'
const crypto = require('crypto')
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest()
const hex = b => Buffer.from(b).toString('hex')
const sha = s => crypto.createHash('sha256').update(s).digest('hex')
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())

function config(env = process.env) {
  const c = { account: env.R2_ACCOUNT_ID, key: env.R2_ACCESS_KEY_ID, secret: env.R2_SECRET_ACCESS_KEY, bucket: env.R2_BUCKET, publicUrl: (env.R2_PUBLIC_URL || '').replace(/\/+$/, '') }
  return c.account && c.key && c.secret && c.bucket && c.publicUrl ? c : null
}

// Presign a request. signedHeaders: extra headers the client MUST send with exactly these values.
function presign(c, { method = 'PUT', key, expires = 600, headers = {}, now = new Date() }) {
  const host = `${c.account}.r2.cloudflarestorage.com`
  const amz = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const date = amz.slice(0, 8), scope = `${date}/auto/s3/aws4_request`
  const path = '/' + c.bucket + '/' + key.split('/').map(enc).join('/')
  const hdrs = { host, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])) }
  const names = Object.keys(hdrs).sort()
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD', 'X-Amz-Credential': `${c.key}/${scope}`, 'X-Amz-Date': amz, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': names.join(';'), 'x-id': method === 'PUT' ? 'PutObject' : 'GetObject' }
  const qs = Object.keys(q).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(k => enc(k) + '=' + enc(q[k])).join('&')
  const canonical = [method, path, qs, names.map(n => n + ':' + hdrs[n] + '\n').join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n')
  const kSign = hmac(hmac(hmac(hmac('AWS4' + c.secret, date), 'auto'), 's3'), 'aws4_request')
  return `https://${host}${path}?${qs}&X-Amz-Signature=${hex(hmac(kSign, toSign))}`
}

// Server-side upload (used by the migration script)
async function put(c, key, body, contentType) {
  const url = presign(c, { key, headers: { 'content-type': contentType } })
  const r = await fetch(url, { method: 'PUT', body, headers: { 'content-type': contentType } })
  if (!r.ok) throw new Error(`R2 ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return c.publicUrl + '/' + key
}
module.exports = { config, presign, put }

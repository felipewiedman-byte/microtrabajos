// Admin: site settings (public), encrypted integration keys, moderation API. Used by server.js
'use strict'
const crypto = require('crypto'), fs = require('fs'), path = require('path')

const DEFAULTS = {
  name: 'PLANETA',
  tagline: 'El mundo está pasando.',
  tagline2: 'Descúbrelo ahora.',
  description: 'Descubre lo que está pasando en cualquier parte del mundo: eventos, lugares, planes y noticias en un mapa vivo.',
  logoDark: '', logoLight: '', favicon: '',
  seoTitle: '', seoKeywords: 'red social, mapa, eventos, planes, noticias, lugares, qué hacer, ciudad, en vivo', ogImage: '', googleVerify: '', indexable: true,
  categories: [['eventos', 'Eventos'], ['lugares', 'Lugares'], ['planes', 'Planes'], ['noticias', 'Noticias'], ['deportes', 'Deportes'], ['ciencia', 'Ciencia y tecnología'], ['cotidiano', 'Vida cotidiana'], ['situaciones', 'Situaciones']],
  bizTypes: [['cafe', 'Café'], ['restaurante', 'Restaurante'], ['bar', 'Bar'], ['tienda', 'Tienda'], ['belleza', 'Belleza'], ['servicio', 'Servicio'], ['hotel', 'Hotel'], ['cultura', 'Cultura'], ['deporte', 'Deporte'], ['otro', 'Otro']],
  regions: [['Mundo', 18, -40, 2.5], ['Colombia', 5, -74, 5.5], ['Latinoamérica', -12, -68, 3.2], ['Norteamérica', 42, -100, 3.4], ['Europa', 46, 5, 4], ['África', 3, 20, 3.3], ['Asia', 30, 105, 3.2], ['Oceanía', -25, 140, 3.6]],
  planRadio: { name: 'Emisora', days: 30, perks: ['Tu emisora suena en toda la web mientras la gente navega', 'Pin con tu logo en tu ciudad y en la ficha de la ciudad', 'Aparece en la lista de Radio, por género'] },
  planBiz: { name: 'Negocio destacado', days: 30, perks: ['Pin dorado en el mapa, visible antes que los demás', 'Tus ofertas y publicaciones salen primero', 'Ficha con fotos, horario, WhatsApp y "Cómo llegar"'] },
  legalTerms: '', legalPrivacy: '',
  sizes: {}, textColors: {},
  dailyOn: true, dailyTitle: 'Muéstranos tu cielo ahora', dailyText: 'Sube una foto del cielo desde donde estás y mira el cielo del mundo hoy.', dailyTZ: 'America/Bogota',
  colors: { accent: '#5cc8b0', bg: '#0b0e12', surface: '#13171d', text: '#eef1f4', muted: '#8a94a0', live: '#e5484d', verified: '#6aa9ff' },
  texts: {},
  bizPrice: '29.900 COP al mes', radioPrice: '49.900 COP al mes', bizAmount: 29900, radioAmount: 49900, currency: 'COP', bizUSD: 8, radioUSD: 12, bizContact: '', videoMaxSeconds: 60, imageMaxMB: 8, postsPerHour: 20, maintenance: false, maintenanceText: 'Estamos mejorando la web. Vuelve en unos minutos.',
}
// every editable text: key -> default (use {name} for the site name)
const TEXTS = {
  joinTitle: 'Únete a {name}', joinSub: 'Crea tu cuenta para publicar, comentar y guardar.',
  welcomeBack: 'Bienvenido de nuevo', createAccount: 'Crea tu cuenta', authSub: 'Descubre y comparte lo que pasa en el mundo.',
  dropButton: 'Soltar en el planeta', publishButton: 'Publicar en {name}', published: 'Publicado en {name}',
  pinHint: 'Haz clic en el mapa donde está ocurriendo', pinTip: 'Clic derecho en el mapa para publicar ahí',
  whatsHappening: '¿Qué está pasando aquí?', inThisView: 'En esta vista', wall: 'Muro', liveNow: 'En directo ahora',
  nearTitle: 'Explorar cerca', messagesTitle: 'Mensajes', communityTitle: 'Comunidad', communitySub: 'Personas que comparten lo que pasa en el mundo.',
  roomTitle: 'Lo que pasa hoy en {city}', emptyRoom: 'La sala de {city} está en silencio. Escribe el primer mensaje.',
  footer: '{name} · 2026',
}
const INTEGRATIONS = {
  google: { label: 'Google (iniciar sesión con Gmail)', fields: { clientId: 'Client ID', clientSecret: 'Client Secret*' } },
  mercadopago: { label: 'Mercado Pago', fields: { publicKey: 'Public Key', accessToken: 'Access Token*', mode: 'Modo (test o live)' } },
  paypal: { label: 'PayPal', fields: { clientId: 'Client ID', secret: 'Secret*', mode: 'Modo (sandbox o live)' } },
  translate: { label: 'Traducción automática (opcional: sin llave usa un servicio gratuito limitado)', fields: { deeplKey: 'DeepL API Key*', googleKey: 'Google Translate API Key*' } },
  stripe: { label: 'Stripe', fields: { publishableKey: 'Publishable Key', secretKey: 'Secret Key*', webhookSecret: 'Webhook Secret*' } },
}

function init(db, DATA) {
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
           CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`)
  for (const col of ["role TEXT NOT NULL DEFAULT 'user'", 'suspended INTEGER NOT NULL DEFAULT 0']) { try { db.exec('ALTER TABLE users ADD COLUMN ' + col) } catch {} }
  try { db.exec('ALTER TABLE reports ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0') } catch {}
  // encryption key for integration secrets, created once, readable only by root
  const keyFile = path.join(DATA, 'secret.key')
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
  const KEY = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex')
  const enc = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv); const d = Buffer.concat([c.update(t, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.') }
  const dec = s => { const [iv, tag, d] = s.split('.').map(b => Buffer.from(b, 'base64')); const c = crypto.createDecipheriv('aes-256-gcm', KEY, iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString('utf8') }

  let cache = null
  const settings = () => {
    if (cache) return cache
    const s = JSON.parse(JSON.stringify(DEFAULTS))
    for (const r of db.prepare('SELECT key, value FROM settings').all()) { try { s[r.key] = JSON.parse(r.value) } catch {} }
    s.colors = { ...DEFAULTS.colors, ...(s.colors || {}) }; s.texts = { ...TEXTS, ...(s.texts || {}) }
    return (cache = s)
  }
  const saveSettings = patch => {
    const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    const str = (x, n) => String(x ?? '').trim().slice(0, n), slug = x => str(x, 40).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const pairs = v => Array.isArray(v) ? v.filter(r => Array.isArray(r) && str(r[1], 60)).map(r => [slug(r[0]) || slug(r[1]), str(r[1], 60)]).filter((r, i, a) => r[0] && a.findIndex(x => x[0] === r[0]) === i).slice(0, 40) : null
    const fix = {
      categories: pairs, bizTypes: pairs,
      regions: v => Array.isArray(v) ? v.filter(r => Array.isArray(r) && str(r[0], 40) && Number.isFinite(+r[1]) && Number.isFinite(+r[2])).map(r => [str(r[0], 40), +r[1], +r[2], Math.min(18, Math.max(2, +r[3] || 4))]).slice(0, 30) : null,
      planRadio: v => v && typeof v === 'object' ? { name: str(v.name, 40) || 'Plan', days: Math.min(366, Math.max(1, Math.round(+v.days) || 30)), perks: (Array.isArray(v.perks) ? v.perks : []).map(x => str(x, 140)).filter(Boolean).slice(0, 8) } : null,
      sizes: v => v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k, n]) => /^\w{1,30}$/.test(k) && +n >= 8 && +n <= 80).map(([k, n]) => [k, +n])) : null, textColors: v => v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k, c]) => /^\w{1,30}$/.test(k) && /^#[0-9a-f]{6}$/i.test(c))) : null, legalTerms: v => str(v, 20000), dailyTitle: v => str(v, 80), dailyText: v => str(v, 200), dailyOn: v => !!v, dailyTZ: v => { try { new Date().toLocaleDateString('en-CA', { timeZone: str(v, 60) }); return str(v, 60) } catch { return 'America/Bogota' } }, legalPrivacy: v => str(v, 20000), seoTitle: v => str(v, 70), seoKeywords: v => str(v, 300), googleVerify: v => str(v, 100).replace(/[^\w-]/g, ''), indexable: v => !!v,
    }
    fix.planBiz = fix.planRadio
    for (let [k, v] of Object.entries(patch)) { if (!(k in DEFAULTS)) continue; if (fix[k]) { v = fix[k](v); if (v === null || (Array.isArray(v) && !v.length)) continue } up.run(k, JSON.stringify(v)) }
    cache = null; return settings()
  }
  const secret = (provider, field) => { const r = db.prepare('SELECT value FROM secrets WHERE key = ?').get(provider + '.' + field); try { return r ? dec(r.value) : '' } catch { return '' } }
  const integrations = () => Object.fromEntries(Object.entries(INTEGRATIONS).map(([p, def]) => [p, { label: def.label, fields: Object.fromEntries(Object.entries(def.fields).map(([f, label]) => {
    const v = secret(p, f), hidden = label.endsWith('*')
    return [f, { label: label.replace('*', ''), secret: hidden, set: !!v, value: hidden ? (v ? '••••••' + v.slice(-4) : '') : v }]
  })) }]))
  const saveIntegration = (provider, values) => {
    const def = INTEGRATIONS[provider]; if (!def) throw Object.assign(new Error('Integración desconocida.'), { code: 404 })
    const up = db.prepare('INSERT INTO secrets (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    for (const f of Object.keys(def.fields)) { const v = values[f]; if (typeof v !== 'string' || v.startsWith('••••••')) continue; if (v === '') db.prepare('DELETE FROM secrets WHERE key = ?').run(provider + '.' + f); else up.run(provider + '.' + f, enc(v.trim().slice(0, 500)), Date.now()) }
  }
  async function testIntegration(provider) {
    const get = f => secret(provider, f)
    if (provider === 'mercadopago') { const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: 'Bearer ' + get('accessToken') }, signal: AbortSignal.timeout(10000) }); const d = await r.json().catch(() => ({})); return r.ok ? `Conectado como ${d.nickname || d.email || d.id}` : 'Mercado Pago rechazó el Access Token (' + r.status + ').' }
    if (provider === 'paypal') { const host = get('mode') === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com'; const r = await fetch(`https://${host}/v1/oauth2/token`, { method: 'POST', body: 'grant_type=client_credentials', headers: { Authorization: 'Basic ' + Buffer.from(get('clientId') + ':' + get('secret')).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000) }); return r.ok ? `Conectado a PayPal (${host.includes('sandbox') ? 'sandbox' : 'live'})` : 'PayPal rechazó las credenciales (' + r.status + ').' }
    if (provider === 'stripe') { const r = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: 'Bearer ' + get('secretKey') }, signal: AbortSignal.timeout(10000) }); return r.ok ? 'Conectado a Stripe' : 'Stripe rechazó la Secret Key (' + r.status + ').' }
    if (provider === 'translate') return get('deeplKey') ? 'Se usará DeepL para traducir.' : get('googleKey') ? 'Se usará Google Translate para traducir.' : 'Sin llave: se usa el servicio gratuito MyMemory (limitado por día).'
    if (provider === 'google') return get('clientId') && get('clientSecret') ? 'Llaves guardadas. El inicio de sesión con Google se activa cuando la web tenga dominio con HTTPS.' : 'Faltan el Client ID o el Client Secret.'
    return 'Sin prueba disponible.'
  }
  return { settings, saveSettings, integrations, saveIntegration, testIntegration, secret, TEXTS, DEFAULTS }
}
module.exports = { init }

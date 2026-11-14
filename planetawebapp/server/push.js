// Notificaciones push (Web Push + VAPID). Las claves propias se crean solas la primera vez y se guardan en data/vapid.json.
// El audio/texto va cifrado de extremo a extremo hacia el navegador (RFC 8291); aquí solo se guardan las suscripciones.
'use strict'
const fs = require('fs'), path = require('path')
let webpush = null
try { webpush = require('web-push') } catch { /* sin la librería, la web sigue funcionando sin push */ }

const OFF = { enabled: false, key: () => '', save: () => false, remove: () => {}, prefs: () => ({ on: false, goals: false }), notify: () => {}, goal: () => {} }

module.exports = function push({ db, DATA, S }) {
  if (!webpush) { console.warn('Notificaciones push desactivadas: falta la librería web-push (carpeta node_modules).'); return OFF }
  db.exec(`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, goals INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
           CREATE INDEX IF NOT EXISTS push_user ON push_subs(user_id)`)
  // claves VAPID propias (identifican a este servidor ante Google/Apple/Mozilla)
  const file = path.join(DATA, 'vapid.json'); let keys
  try { keys = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  if (!keys?.publicKey || !keys?.privateKey) { keys = webpush.generateVAPIDKeys(); fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 }) }
  webpush.setVapidDetails(process.env.PUSH_SUBJECT || 'https://worbita.com', keys.publicKey, keys.privateKey)

  const b64u = /^[A-Za-z0-9_-]+$/
  const ok = s => s && typeof s.endpoint === 'string' && /^https:\/\/[^\s]{10,900}$/.test(s.endpoint) && typeof s.keys?.p256dh === 'string' && b64u.test(s.keys.p256dh) && s.keys.p256dh.length < 200 && typeof s.keys?.auth === 'string' && b64u.test(s.keys.auth) && s.keys.auth.length < 60

  function save(userId, sub, goals) {
    if (!ok(sub)) return false
    db.prepare('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, goals, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, goals = excluded.goals')
      .run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, goals ? 1 : 0, Date.now())
    // máximo 10 dispositivos por persona (se quitan los más viejos)
    db.prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10)').run(userId, userId)
    return true
  }
  const remove = (endpoint, userId) => { db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').run(String(endpoint || ''), userId) }
  const prefs = (endpoint, userId) => { const r = db.prepare('SELECT goals FROM push_subs WHERE endpoint = ? AND user_id = ?').get(String(endpoint || ''), userId); return { on: !!r, goals: !!r?.goals } }

  // envío en tandas pequeñas (poca RAM/CPU); las suscripciones muertas (404/410) se borran solas
  async function send(rows, payload) {
    const body = JSON.stringify(payload)
    for (let i = 0; i < rows.length; i += 20) {
      await Promise.allSettled(rows.slice(i, i + 20).map(async r => {
        try { await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, body, { TTL: 3600, urgency: 'normal', timeout: 8000 }) }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(r.endpoint) }
      }))
    }
  }
  // el icono del aviso es el de tu marca (favicon del panel); si no hay, el de la app
  const icon = () => { const f = String(S?.().favicon || ''); return /^(https:\/\/|\/)[^\s"'<>]{1,300}$/.test(f) && !/\.(ico|svg)(\?|$)/i.test(f) ? f : '' }
  const fire = (rows, payload) => { if (rows.length) send(rows, { ...payload, icon: icon() }).catch(e => console.error('push:', e.message)) }

  const TXT = { comment: 'comentó tu publicación', like: 'le gustó tu publicación', join: 'se unió a tu plan', message: 'te envió un mensaje', follow: 'publicó en algo que sigues' }
  // mismo aviso que ya aparece en la campana, ahora también en el celular
  function notify(userId, type, actorId, postId, text) {
    if (!userId) return
    const rows = db.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?').all(userId)
    if (!rows.length) return
    const actor = actorId ? db.prepare('SELECT name FROM users WHERE id = ?').get(actorId)?.name : ''
    const post = postId ? db.prepare('SELECT title FROM posts WHERE id = ?').get(postId)?.title : ''
    const title = type === 'bizexp' ? 'Aviso' : `${actor || 'Alguien'} ${TXT[type] || ''}`.trim()
    const body = String(type === 'follow' ? (post || text || '') : (text || post || '')).slice(0, 140)
    fire(rows, { title: title.slice(0, 80), body, url: postId ? '/p/' + postId : '/', tag: type + ':' + (postId || actorId || '') })
  }
  // gol: solo a quienes activaron «Avisar de goles»
  function goal(ev) {
    const rows = db.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE goals = 1').all()
    const who = [ev.player, ev.min ? ev.min + "'" : ''].filter(Boolean).join(' ')
    fire(rows, { title: `⚽ ¡Gol de ${ev.team}!`.slice(0, 80), body: `${ev.h} ${ev.gh} - ${ev.ga} ${ev.a}${who ? ' · ' + who : ''}`.slice(0, 140), url: ev.post ? '/p/' + ev.post : '/', tag: 'gol:' + ev.h + ev.a + ev.gh + '-' + ev.ga })
  }
  return { enabled: true, key: () => keys.publicKey, save, remove, prefs, notify, goal }
}

// Avisos push del navegador (Web Push). El servicio de fondo es public/sw.js.
const b64 = s => { const r = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)) }
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext
// en iPhone los avisos solo funcionan si la web está instalada en la pantalla de inicio
export const needsInstall = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone
const ready = () => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)
const post = (u, body) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'No se pudo completar.'); return j })
export async function pushState() {
  if (!pushSupported()) return { supported: false }
  const perm = Notification.permission
  try {
    const sub = await (await ready()).pushManager.getSubscription()
    if (!sub) return { supported: true, perm, on: false }
    const p = await fetch('/api/push/prefs?endpoint=' + encodeURIComponent(sub.endpoint)).then(r => r.ok ? r.json() : { on: false })
    return { supported: true, perm, on: !!p.on, goals: !!p.goals }
  } catch { return { supported: true, perm, on: false } }
}
export async function enablePush(goals) {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Permiso denegado. Puedes activarlo en la configuración del navegador (candado junto a la dirección).')
  const { key, enabled } = await fetch('/api/push/key').then(r => r.json())
  if (!enabled || !key) throw new Error('Los avisos no están disponibles en este momento.')
  const reg = await ready()
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) })
  await post('/api/push/subscribe', { subscription: sub.toJSON(), goals: !!goals })
}
export async function setGoals(goals) { const sub = await (await ready()).pushManager.getSubscription(); if (sub) await post('/api/push/subscribe', { subscription: sub.toJSON(), goals: !!goals }) }
export async function disablePush() {
  const sub = await (await ready()).pushManager.getSubscription()
  if (sub) { await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe() }
}

// Service worker de PLANETA: solo recibe notificaciones push. No guarda nada en caché, así que no puede mostrar versiones viejas de la web.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {} } catch {}
  e.waitUntil((async () => {
    // si la web está abierta y a la vista, ya se ve dentro de la app: no se duplica el aviso
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (open.some(c => c.visibilityState === 'visible')) return
    await self.registration.showNotification(d.title || 'PLANETA', { body: d.body || '', icon: d.icon || '/icon-192.png', badge: '/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/' } })
  })())
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const mine = all.find(c => c.url.startsWith(self.location.origin))
    if (mine) { await mine.focus(); if ('navigate' in mine) try { await mine.navigate(url) } catch {} } else await self.clients.openWindow(url)
  })())
})

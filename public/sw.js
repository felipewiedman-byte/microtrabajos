// Service worker: abre el panel como app, muestra avisos de pedidos nuevos y guarda en caché solo los archivos estáticos.
const STATIC = 'vt-static-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// Solo /static/ (CSS, JS, fuente, íconos): primero caché, luego red. Las páginas siempre van a la red (datos al día).
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith('/static/')) return;
  e.respondWith(caches.open(STATIC).then(async (c) => {
    const hit = await c.match(e.request);
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok) { c.put(e.request, r.clone()); c.keys().then((ks) => ks.length > 40 && c.delete(ks[0])); }
    return r;
  }));
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Nuevo pedido', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Nuevo pedido', {
    body: d.body || '', tag: d.tag || 'pedido', renotify: true, icon: '/app-icon-192.png', badge: '/app-icon-192.png', data: { url: d.url || '/panel/pedidos' }, vibrate: [120, 60, 120],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/panel/pedidos';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => new URL(x.url).pathname.startsWith('/panel'));
    return c ? c.focus().then((w) => w && w.navigate ? w.navigate(url) : null) : self.clients.openWindow(url);
  }));
});

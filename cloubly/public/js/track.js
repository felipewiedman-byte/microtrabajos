// Seguimiento: consulta liviana cada 30 s (solo con la pestaña visible) y recarga si el estado cambió.
(() => {
  const el = document.getElementById('trk');
  if (!el) return;
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b && navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = '¡Copiado!'; }).catch(() => {}); });
  if (el.dataset.final === '1') return;
  const url = location.pathname.replace(/\/$/, '') + '/estado';
  let t = null;
  async function check() {
    if (document.hidden) return;
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok && (await r.json()).sig !== el.dataset.sig) location.reload(); } catch { /* sin conexión */ }
  }
  const start = () => { clearInterval(t); t = setInterval(check, 30000); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); start(); } });
  start();
})();

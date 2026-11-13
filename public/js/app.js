// Panel y sitio: copiar, confirmar, compresión de imágenes antes de subirlas e imagen para publicar. JavaScript nativo.
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- App instalable y avisos de pedidos nuevos (solo en el panel del negocio) ----------
  if ('serviceWorker' in navigator && (document.body.dataset.panel === '1' || /^\/(admin|ingresar)/.test(location.pathname))) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (document.body.dataset.panel === '1') {
    const csrf = document.body.dataset.csrf, bar = $('#alertBar'), cta = $('#pushCta');
    let last = null, beeped = 0, baseTitle = document.title;
    // Sonido corto sin archivos (Web Audio). Los navegadores solo lo permiten después de un toque en la página.
    let ac = null; document.addEventListener('pointerdown', () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); } catch { /* sin audio */ } }, { once: true });
    const beep = () => { if (!ac) return; try { const t = ac.currentTime; [0, .18].forEach((d, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = i ? 1046 : 784; g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.25, t + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d + .16); o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + .17); }); } catch { /* sin audio */ } };
    const show = (n) => {
      document.title = n ? `(${n}) ${baseTitle}` : baseTitle;
      document.querySelectorAll('.tabbar em, .side .cnt').forEach((e) => { e.textContent = n; e.hidden = !n; }); document.querySelectorAll('[data-new-count]').forEach((e) => { e.textContent = n; });
    };
    async function check() {
      if (document.hidden) return;
      try {
        const r = await fetch('/panel/api/nuevos', { credentials: 'same-origin', cache: 'no-store' }); if (!r.ok) return;
        const j = await r.json();
        if (last !== null && j.last > last) {
          bar.hidden = false; $('#alertTxt').textContent = j.n === 1 ? 'Tienes un pedido nuevo' : `Tienes ${j.n} pedidos nuevos`;
          if (Date.now() - beeped > 4000) { beep(); beeped = Date.now(); }
          if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        }
        last = j.last; show(j.n);
      } catch { /* sin conexión: se reintenta */ }
    }
    check(); let timer = setInterval(check, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); clearInterval(timer); timer = setInterval(check, 20000); } });
    // Avisos push: se ofrecen una vez; si el navegador no los permite, no se muestra nada.
    const pushOk = 'PushManager' in window && 'Notification' in window && 'serviceWorker' in navigator && window.isSecureContext;
    let dismissed = false; try { dismissed = localStorage.getItem('vt_push_no') === '1'; } catch { /* ignorar */ }
    const b64 = (s) => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
    const post = (body) => fetch('/panel/api/push', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _csrf: csrf, ...body }) });
    async function subscribe() {
      const reg = await navigator.serviceWorker.ready, k = await (await fetch('/panel/api/push-key', { credentials: 'same-origin' })).json();
      if (!k.key) return false;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.key) });
      return (await post({ sub: sub.toJSON() })).ok;
    }
    if (pushOk && cta) {
      if (Notification.permission === 'granted') subscribe().catch(() => {});
      else if (Notification.permission === 'default' && !dismissed) cta.hidden = false;
      $('#pushOn').onclick = async () => {
        const p = await Notification.requestPermission(); cta.hidden = true;
        if (p === 'granted') { const ok = await subscribe().catch(() => false); if (ok) new Notification('Avisos activados', { body: 'Te avisaremos aquí con cada pedido nuevo.', icon: '/app-icon-192.png' }); }
      };
      $('#pushNo').onclick = () => { cta.hidden = true; try { localStorage.setItem('vt_push_no', '1'); } catch { /* ignorar */ } };
    }
  }

  // Celular: el botón "Más" de la barra inferior abre el menú completo como hoja desde abajo.
  const moreBtn = $('#moreBtn'), side = $('#sideMenu'), sideOv = $('#sideOv');
  if (moreBtn && side) {
    const setMore = (on) => { document.body.classList.toggle('more-open', on); moreBtn.setAttribute('aria-expanded', on); };
    moreBtn.addEventListener('click', () => setMore(!document.body.classList.contains('more-open')));
    sideOv.addEventListener('click', () => setMore(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMore(false); });
  }

  // SEO: la vista previa (Google y WhatsApp) se actualiza mientras se escribe, con contador de caracteres.
  document.querySelectorAll('[data-bind-src]').forEach((inp) => {
    const key = inp.dataset.bindSrc, fallback = inp.placeholder || '';
    const upd = () => document.querySelectorAll(`[data-bind="${key}"]`).forEach((n) => { n.textContent = inp.value.trim() || fallback; });
    inp.addEventListener('input', upd);
  });
  document.querySelectorAll('[data-count]').forEach((inp) => {
    const out = document.querySelector(`[data-count-for="${inp.id}"]`), max = +inp.dataset.count;
    if (!out) return;
    const upd = () => { out.textContent = inp.value.length + ' / ' + max + ' ·'; out.classList.toggle('cnt-bad', inp.value.length > max); };
    inp.addEventListener('input', upd); upd();
  });
  const seoFile = document.querySelector('input[name=seo_image]');
  if (seoFile) seoFile.addEventListener('change', () => { const f = seoFile.files && seoFile.files[0]; if (!f) return; const u = URL.createObjectURL(f);
    document.querySelectorAll('.pv-wa-img').forEach((b) => { const i = document.createElement('img'); i.alt = ''; i.src = u; b.replaceChildren(i); }); });

  // Vista previa al elegir logo o portada
  document.querySelectorAll('input[data-preview]').forEach((inp) => inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0], pv = inp.closest('.upbox')?.querySelector('.pv'); if (!f || !pv) return;
    const img = document.createElement('img'); img.alt = ''; img.src = URL.createObjectURL(f); pv.replaceChildren(img);
  }));

  // Menús con desplazamiento lateral (celular): muestra la opción activa y quita el degradado al llegar al final.
  document.querySelectorAll('.side, .tabs').forEach((n) => {
    if (n.scrollWidth <= n.clientWidth) { n.classList.add('end'); return; }
    const on = n.querySelector('a.on'); if (on) n.scrollLeft = on.offsetLeft - (n.clientWidth - on.offsetWidth) / 2;
    const upd = () => n.classList.toggle('end', n.scrollLeft + n.clientWidth >= n.scrollWidth - 4);
    n.addEventListener('scroll', upd, { passive: true }); upd();
  });

  // Editor de páginas: abre la sección indicada en la dirección (#s3) o la última (#fin)
  if (/^#s\d+$/.test(location.hash)) { const d = document.querySelector(location.hash); if (d && d.tagName === 'DETAILS') { d.open = true; d.scrollIntoView({ block: 'start' }); } }
  else if (location.hash === '#fin') { const all = document.querySelectorAll('details.card'); if (all.length) { all[all.length - 1].open = true; all[all.length - 1].scrollIntoView({ block: 'center' }); } }

  // Copiar al portapapeles
  document.addEventListener('click', async (e) => {
    const cf = e.target.closest('[data-copy-from]');
    if (cf) { const src = document.getElementById(cf.dataset.copyFrom), old = cf.innerHTML; try { await navigator.clipboard.writeText(src.value); cf.textContent = '¡Copiado!'; } catch { src.select(); } setTimeout(() => { cf.innerHTML = old; }, 1600); }
    const c = e.target.closest('[data-copy]');
    if (c) {
      const old = c.innerHTML;
      try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = '¡Copiado!'; }
      catch { window.prompt('Copia el enlace:', c.dataset.copy); }
      setTimeout(() => { c.innerHTML = old; }, 1600);
    }
    if (e.target.closest('[data-print]')) window.print();
    // Confirmación en botones
    const b = e.target.closest('button[data-confirm]');
    if (b && !window.confirm(b.dataset.confirm)) e.preventDefault();
  });
  // Confirmación en formularios
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset && f.dataset.confirm && !window.confirm(f.dataset.confirm)) e.preventDefault();
  });

  // Reducir imágenes en el navegador: ahorra datos del celular y espacio y ancho de banda del servidor.
  async function shrink(file, max) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { return file; }
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 250 * 1024) return file;
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    const toBlob = (type, q) => new Promise((ok) => cv.toBlob(ok, type, q));
    let blob = await toBlob('image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.84);
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.jpg'), { type: blob.type });
  }
  document.addEventListener('change', async (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement) || inp.type !== 'file' || !inp.dataset.compress || !inp.files[0]) return;
    const f = await shrink(inp.files[0], +inp.dataset.compress || 900);
    if (f !== inp.files[0]) { const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; }
    if (inp.dataset.preview) {
      const box = document.getElementById(inp.dataset.preview);
      if (box) { const img = document.createElement('img'); img.className = 'imgprev'; img.id = box.id; img.alt = ''; img.src = URL.createObjectURL(inp.files[0]); box.replaceWith(img); }
    }
  });

  // Imagen para publicar (estados e historias): se dibuja en el navegador, sin gastar servidor.
  const sel = $('[data-poster]');
  if (sel) {
    const cv = document.getElementById('poster'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, D = sel.dataset;
    const money = (c) => new Intl.NumberFormat(D.locale || 'es', { style: 'currency', currency: D.cur, minimumFractionDigits: D.zero === '1' || c % 100 === 0 ? 0 : 2, maximumFractionDigits: D.zero === '1' || c % 100 === 0 ? 0 : 2 }).format(c / 100);
    const wrap = (text, x, y, maxW, lh, maxLines) => {
      const words = text.split(' '); let line = '', n = 0;
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines - 1) break; } else line = t;
      }
      ctx.fillText(line.length > 38 && n >= maxLines - 1 ? line.slice(0, 36) + '…' : line, x, y);
    };
    const draw = () => {
      const o = sel.selectedOptions[0]; if (!o) return;
      const paint = (img) => {
        ctx.fillStyle = D.color; ctx.fillRect(0, 0, W, H);
        const pad = 54, ph = 840;
        ctx.save(); ctx.beginPath(); ctx.roundRect(pad, pad, W - pad * 2, ph, 36); ctx.clip();
        ctx.fillStyle = '#f5f5f4'; ctx.fillRect(pad, pad, W - pad * 2, ph);
        if (img) { const k = Math.max((W - pad * 2) / img.width, ph / img.height), w = img.width * k, h = img.height * k; ctx.drawImage(img, pad + (W - pad * 2 - w) / 2, pad + (ph - h) / 2, w, h); }
        ctx.restore();
        ctx.fillStyle = D.ink; ctx.textBaseline = 'alphabetic';
        ctx.font = '700 62px system-ui,-apple-system,Segoe UI,Arial,sans-serif'; wrap(o.dataset.name, pad, pad + ph + 92, W - pad * 2, 70, 2);
        ctx.font = '800 92px system-ui,-apple-system,Segoe UI,Arial,sans-serif'; ctx.fillText(money(+o.dataset.price), pad, pad + ph + 232);
        ctx.font = '500 36px system-ui,-apple-system,Segoe UI,Arial,sans-serif'; ctx.globalAlpha = .9; ctx.fillText(D.shop + ' · ' + D.url, pad, H - 60); ctx.globalAlpha = 1;
      };
      if (o.dataset.img) { const im = new Image(); im.onload = () => paint(im); im.onerror = () => paint(null); im.src = o.dataset.img; } else paint(null);
    };
    const cap = document.getElementById('caption'), capBtn = document.getElementById('captionCopy');
    const caption = () => {
      if (!cap) return; const o = sel.selectedOptions[0];
      cap.value = `${o.dataset.name} — ${money(+o.dataset.price)}\n${o.dataset.desc ? o.dataset.desc + '\n' : ''}\n📲 Pídelo aquí: ${D.full}?p=${o.value}\n\n#${D.shop.replace(/[^\p{L}\p{N}]/gu, '')}`;
    };
    if (capBtn) capBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(cap.value); capBtn.textContent = '¡Copiado!'; } catch { cap.select(); } });
    sel.addEventListener('change', () => { draw(); caption(); }); draw(); caption();
    const dl = document.getElementById('posterDl');
    if (dl) dl.addEventListener('click', () => cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'publicacion.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png'));
  }
})();

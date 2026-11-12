// Panel y sitio: copiar, confirmar, compresión de imágenes antes de subirlas e imagen para publicar. JavaScript nativo.
(() => {
  const $ = (s, r = document) => r.querySelector(s);

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

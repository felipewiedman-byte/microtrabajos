// Catálogo público: búsqueda, categorías, carrito (localStorage) y envío del pedido. JavaScript nativo, sin librerías.
(() => {
  const root = document.getElementById('shop');
  if (!root) return;
  const D = root.dataset, $ = (id) => document.getElementById(id);
  const KEY = 'vt_cart_' + D.slug;
  const zero = D.zero === '1', cur = D.cur;
  const fmtC = {};
  const money = (cents) => {
    const frac = !zero && cents % 100 !== 0 ? 2 : 0;
    return (fmtC[frac] ||= new Intl.NumberFormat(D.locale || 'es', { style: 'currency', currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac })).format(cents / 100);
  };
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };
  const products = {};
  document.querySelectorAll('.item').forEach((n) => { products[n.dataset.id] = { id: +n.dataset.id, name: n.dataset.name, price: +n.dataset.price, stock: n.dataset.stock === '' ? null : +n.dataset.stock, node: n }; });

  // ---------- Carrito ----------
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { cart = {}; }
  for (const id of Object.keys(cart)) if (!products[id] || !(cart[id] > 0)) delete cart[id];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* modo privado */ } };
  const maxQty = (p) => Math.min(99, p.stock === null ? 99 : p.stock);
  const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = () => Object.entries(cart).reduce((a, [id, q]) => a + products[id].price * q, 0);
  let coupon = null; // { code, discount }

  function stepper(id, small) {
    const w = el('div', 'qty');
    const minus = el('button'), plus = el('button'), n = el('b', '', String(cart[id] || 0));
    minus.type = plus.type = 'button'; minus.setAttribute('aria-label', 'Quitar uno'); plus.setAttribute('aria-label', 'Agregar uno');
    minus.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>';
    plus.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>';
    minus.onclick = () => change(id, -1); plus.onclick = () => change(id, 1);
    w.append(minus, n, plus);
    return w;
  }
  function change(id, d) {
    const p = products[id], q = Math.max(0, Math.min(maxQty(p), (cart[id] || 0) + d));
    if (q) cart[id] = q; else delete cart[id];
    coupon = null; save(); render();
  }
  function render() {
    // Botones de cada producto
    for (const p of Object.values(products)) {
      const box = p.node.querySelector('.ctl');
      if (!box) continue;
      box.textContent = '';
      if (cart[p.id]) box.append(stepper(p.id));
      else { const b = el('button', 'add'); b.type = 'button'; b.dataset.add = p.id; b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg> Agregar'; box.append(b); }
    }
    const n = count(), bar = $('cartbar');
    bar.classList.toggle('show', n > 0 && D.accepting === '1');
    $('cartN').textContent = n; $('cartT').textContent = money(subtotal());
    if (!n && $('sheet').classList.contains('show') && $('vDone').hidden) closeSheet();
    renderSheet();
  }
  const mode = () => (root.querySelector('input[name=mode]:checked') || root.querySelector('input[name=mode]') || {}).value || 'pickup';
  function totals() {
    const sub = subtotal(), disc = coupon ? coupon.discount : 0, fee = mode() === 'delivery' ? +D.fee : 0;
    return { sub, disc, fee, total: sub - disc + fee };
  }
  function renderSheet() {
    const list = $('cartList'); list.textContent = '';
    for (const [id, q] of Object.entries(cart)) {
      const p = products[id], row = el('div', 'ci'), nm = el('div', 'nm');
      nm.append(el('b', '', p.name), el('span', 'muted small', money(p.price * q)));
      row.append(nm, stepper(id)); list.append(row);
    }
    const t = totals(), sum = $('sum'); sum.textContent = '';
    const line = (a, b, c) => { const d = el('div', c || ''); d.append(el('span', '', a), el('span', '', b)); sum.append(d); };
    line('Subtotal', money(t.sub));
    if (t.disc) line('Descuento (' + coupon.code + ')', '-' + money(t.disc));
    if (t.fee) line('Domicilio', money(t.fee));
    line('Total', money(t.total), 't');
    $('couponBox').hidden = D.coupons !== '1';
    $('addrBox').hidden = mode() !== 'delivery';
  }

  // ---------- Hoja del pedido ----------
  const sheet = $('sheet'), ov = $('ov');
  function openSheet() { $('vCart').hidden = false; $('vDone').hidden = true; $('sheetT').textContent = 'Tu pedido'; $('err').hidden = true; sheet.classList.add('show'); ov.classList.add('show'); document.body.style.overflow = 'hidden'; renderSheet(); }
  const shareSheet = $('shareSheet');
  function closeSheet() { sheet.classList.remove('show'); shareSheet.classList.remove('show'); ov.classList.remove('show'); document.body.style.overflow = ''; }
  $('openCart').onclick = openSheet; $('closeCart').onclick = closeSheet; $('closeShare').onclick = closeSheet; ov.onclick = closeSheet; $('doneClose').onclick = closeSheet;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); $('zoom').classList.remove('show'); } });
  root.addEventListener('change', (e) => { if (e.target.name === 'mode') { renderSheet(); } });
  try { const n = localStorage.getItem('vt_name'), ph = localStorage.getItem('vt_phone'); if (n) $('cName').value = n; if (ph) $('cPhone').value = ph; } catch { /* sin almacenamiento */ }

  // ---------- Cupón ----------
  const payload = (channel) => ({
    _csrf: D.csrf, items: Object.entries(cart).map(([id, qty]) => ({ id: +id, qty })), coupon: coupon ? coupon.code : $('coupon').value.trim(), mode: mode(), channel,
    name: $('cName').value.trim(), phone: $('cPhone').value.trim(), address: $('cAddr').value.trim(), note: $('cNote').value.trim(),
  });
  async function post(path, body) {
    const r = await fetch(`/t/${D.slug}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo completar. Intenta de nuevo.');
    return j;
  }
  $('applyCoupon').onclick = async () => {
    const code = $('coupon').value.trim().toUpperCase(), msg = $('couponMsg');
    if (!code) return;
    msg.style.color = ''; msg.textContent = 'Revisando…';
    try { coupon = null; const j = await post('cupon', { ...payload('whatsapp'), coupon: code }); coupon = { code, discount: j.discount_cents }; msg.style.color = 'var(--ok)'; msg.textContent = '¡Cupón aplicado!'; renderSheet(); }
    catch (e) { msg.style.color = 'var(--bad)'; msg.textContent = e.message; }
  };

  // ---------- Enviar ----------
  async function send(channel, btn) {
    const err = $('err'); err.hidden = true;
    if (payload(channel).name.length < 2) { err.textContent = 'Escribe tu nombre.'; err.hidden = false; $('cName').focus(); return; }
    if (mode() === 'delivery' && $('cAddr').value.trim().length < 5) { err.textContent = 'Escribe la dirección de entrega.'; err.hidden = false; $('cAddr').focus(); return; }
    const t = totals();
    if (+D.min && t.sub - t.disc < +D.min) { err.textContent = 'El pedido mínimo es ' + money(+D.min) + '.'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      const j = await post('pedido', payload(channel));
      try { localStorage.setItem('vt_name', $('cName').value.trim()); localStorage.setItem('vt_phone', $('cPhone').value.trim()); } catch { /* ignorar */ }
      $('vCart').hidden = true; $('vDone').hidden = false; $('sheetT').textContent = 'Pedido enviado';
      cart = {}; coupon = null; save(); render();
      $('doneCode').textContent = j.code;
      const link = $('doneLink'); link.href = j.url; link.textContent = channel === 'messenger' ? 'Abrir Messenger' : 'Abrir WhatsApp';
      link.className = 'btn btn-block btn-lg ' + (channel === 'messenger' ? '' : 'btn-wa');
      const pay = $('donePay'); pay.textContent = ''; pay.hidden = !j.payment_info;
      if (j.payment_info) {
        pay.append(el('b', '', 'Cómo pagar'));
        j.payment_info.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
          const row = el('div', 'payl'), txt = el('span', '', l), num = (l.match(/\d[\d\s.-]{5,}\d/) || [''])[0].replace(/[\s.-]/g, '');
          row.append(txt);
          if (num) { const b = el('button', 'btn btn-sm', 'Copiar'); b.type = 'button'; b.onclick = () => navigator.clipboard.writeText(num).then(() => { b.textContent = '¡Copiado!'; }).catch(() => {}); row.append(b); }
          pay.append(row);
        });
      }
      const cp = $('doneCopy'); cp.hidden = channel !== 'messenger';
      if (channel === 'messenger') {
        $('doneMsg').textContent = 'En Messenger pega el mensaje del pedido (ya lo copiamos).';
        cp.onclick = () => navigator.clipboard.writeText(j.text).then(() => { cp.textContent = '¡Copiado!'; });
        try { await navigator.clipboard.writeText(j.text); } catch { /* el botón de copiar queda disponible */ }
      } else $('doneMsg').textContent = 'Se abrirá tu chat con el pedido ya escrito. Solo toca enviar.';
      window.location.href = j.url;
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { btn.disabled = false; }
  };
  const wa = $('sendWa'), ms = $('sendMs');
  if (wa) wa.onclick = () => send('whatsapp', wa);
  if (ms) ms.onclick = () => send('messenger', ms);

  // ---------- Agregar, búsqueda, categorías ----------
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) change(b.dataset.add, 1); });
  const q = $('q'), none = $('none');
  function filter() {
    const term = (q ? q.value : '').trim().toLowerCase(), cat = (document.querySelector('#cats .on') || {}).dataset?.cat || '';
    let shown = 0;
    document.querySelectorAll('.grp').forEach((g) => {
      let any = 0;
      g.querySelectorAll('.item').forEach((i) => { const ok = (!term || i.dataset.search.includes(term)) && (!cat || g.dataset.cat === cat); i.hidden = !ok; if (ok) any++; });
      g.hidden = !any; shown += any;
    });
    if (none) none.hidden = shown > 0;
  }
  if (q) q.addEventListener('input', filter);
  const cats = $('cats');
  if (cats) cats.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cats.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); filter(); });

  // ---------- Información, compartir, zoom ----------
  const info = $('info'), ib = $('infoBtn');
  ib.onclick = () => { const o = info.classList.toggle('open'); ib.setAttribute('aria-expanded', o); ib.classList.toggle('on', o); };
  function openShare(url, title) {
    const text = encodeURIComponent(title + ' — mira mi catálogo y haz tu pedido: ' + url), u = encodeURIComponent(url);
    const box = $('shr'); box.textContent = '';
    const link = (label, href, icon) => { const a = el('a', '', label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.prepend(icon()); box.append(a); };
    const svg = (d) => () => { const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); n.setAttribute('class', 'i'); n.setAttribute('width', 20); n.setAttribute('height', 20); n.setAttribute('viewBox', '0 0 24 24'); n.setAttribute('fill', 'none'); n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '1.8'); n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); n.append(p); return n; };
    const chat = svg('M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z'), arrow = svg('M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7');
    link('WhatsApp', 'https://wa.me/?text=' + text, chat);
    link('Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + u, arrow);
    link('Telegram', 'https://t.me/share/url?url=' + u + '&text=' + encodeURIComponent(title), arrow);
    link('X (Twitter)', 'https://twitter.com/intent/tweet?url=' + u + '&text=' + encodeURIComponent(title), arrow);
    const cp = el('button', '', 'Copiar enlace'); cp.type = 'button'; cp.prepend(svg('M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')());
    cp.onclick = () => navigator.clipboard.writeText(url).then(() => { cp.lastChild.textContent = '¡Enlace copiado!'; }).catch(() => window.prompt('Copia el enlace:', url));
    box.append(cp);
    if (navigator.share) { const n = el('button', '', 'Más opciones (Instagram, otras apps)'); n.type = 'button'; n.prepend(svg('M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13')()); n.onclick = () => navigator.share({ title, url }).catch(() => {}); box.append(n); }
    $('shareT').textContent = title; shareSheet.classList.add('show'); ov.classList.add('show');
  }
  $('shareBtn').onclick = function () { openShare(this.dataset.url, this.dataset.title); };
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-share]'); if (!b) return; const p = products[b.dataset.share]; openShare(location.origin + '/t/' + D.slug + '?p=' + p.id, p.name + ' · ' + D.name); });
  const zoom = $('zoom');
  root.addEventListener('click', (e) => { const z = e.target.closest('[data-zoom]'); if (z) { zoom.querySelector('img').src = z.dataset.zoom; zoom.classList.add('show'); } });
  zoom.onclick = () => zoom.classList.remove('show');

  render();
  if (D.focus !== '0') { const n = $('p' + D.focus); if (n) { n.classList.add('hl'); setTimeout(() => n.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150); } }
})();

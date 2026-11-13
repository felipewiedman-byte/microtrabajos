// Catálogo público: búsqueda, categorías, carrito (localStorage) y envío del pedido. JavaScript nativo, sin librerías.
(() => {
  const root = document.getElementById('shop');
  if (!root) return;
  const D = root.dataset, $ = (id) => document.getElementById(id);
  let TXT = {}; try { TXT = JSON.parse(D.tx || '{}'); } catch { /* textos por defecto */ }
  const KEY = 'vt_cart_' + D.slug;
  const zero = D.zero === '1', cur = D.cur;
  const fmtC = {};
  const money = (cents) => {
    const frac = !zero && cents % 100 !== 0 ? 2 : 0;
    return (fmtC[frac] ||= new Intl.NumberFormat(D.locale || 'es', { style: 'currency', currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac })).format(cents / 100);
  };
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };
  const products = {};
  const json = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
  document.querySelectorAll('.item').forEach((n) => { products[n.dataset.id] = { id: +n.dataset.id, name: n.dataset.name, price: +n.dataset.price, stock: n.dataset.stock === '' ? null : +n.dataset.stock, opts: json(n.dataset.opts, []), gal: json(n.dataset.gal, null), dur: +n.dataset.dur || 0, img: (n.querySelector('.ph img') || {}).src || '', node: n }; });

  // ---------- Medición (píxel de Meta y Google Analytics, solo si el negocio los configuró) ----------
  const track = (() => {
    const px = /^\d{8,20}$/.test(D.px || '') ? D.px : '', ga = /^G-[A-Z0-9]{4,15}$/.test(D.ga || '') ? D.ga : '';
    if (px) {
      const f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      if (!window._fbq) window._fbq = f; f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      const sc = document.createElement('script'); sc.async = true; sc.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.append(sc);
      window.fbq('init', px); window.fbq('track', 'PageView');
    }
    if (ga) {
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
      const sc = document.createElement('script'); sc.async = true; sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + ga; document.head.append(sc);
      window.gtag('js', new Date()); window.gtag('config', ga);
    }
    return (fbEvent, gaEvent, value) => {
      const v = { value: value / 100, currency: cur };
      try { if (px) window.fbq('track', fbEvent, v); if (ga) window.gtag('event', gaEvent, v); } catch { /* ignorar */ }
    };
  })();

  // ---------- Carrito: cada línea es producto + opciones elegidas ----------
  // cart = { "id#clave": { id, opts: [[índices], ...], label, extra, qty } }
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { cart = {}; }
  for (const [k, v] of Object.entries(cart)) {
    if (typeof v === 'number') { delete cart[k]; if (products[k] && v > 0 && !products[k].opts.length) cart[k + '#'] = { id: +k, opts: [], label: '', extra: 0, qty: v }; continue; } // carrito de la versión anterior
    if (!v || !products[v.id] || !(v.qty > 0)) delete cart[k];
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* modo privado */ } };
  const inCart = (id) => Object.values(cart).reduce((a, l) => a + (l.id === +id ? l.qty : 0), 0);
  const roomFor = (id) => { const p = products[id]; return Math.min(99, p.stock === null ? 99 : p.stock) - inCart(id); };
  const count = () => Object.values(cart).reduce((a, l) => a + l.qty, 0);
  const unit = (l) => products[l.id].price + (l.extra || 0);
  const subtotal = () => Object.values(cart).reduce((a, l) => a + unit(l) * l.qty, 0);
  let coupon = null; // { code, discount }
  const svgMinus = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  const svgPlus = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>';

  function stepper(get, set) {
    const w = el('div', 'qty'), minus = el('button'), plus = el('button'), n = el('b', '', String(get()));
    minus.type = plus.type = 'button'; minus.setAttribute('aria-label', 'Quitar uno'); plus.setAttribute('aria-label', 'Agregar uno');
    minus.innerHTML = svgMinus; plus.innerHTML = svgPlus;
    minus.onclick = () => set(-1); plus.onclick = () => set(1);
    w.append(minus, n, plus);
    return w;
  }
  function addLine(id, opts, label, extra, qty) {
    const k = id + '#' + opts.map((g) => g.join('.')).join('|'), q = Math.min(qty, roomFor(id));
    if (q <= 0) return false;
    if (cart[k]) cart[k].qty += q; else cart[k] = { id: +id, opts, label, extra, qty: q };
    track('AddToCart', 'add_to_cart', (products[id].price + extra) * q);
    coupon = null; save(); render(); return true;
  }
  function changeLine(k, d) {
    const l = cart[k]; if (!l) return;
    if (d > 0 && roomFor(l.id) <= 0) return;
    l.qty += d; if (l.qty <= 0) delete cart[k];
    coupon = null; save(); render();
  }
  const addBtn = (id) => { const b = el('button', 'add'); b.type = 'button'; b.dataset.add = id; b.innerHTML = svgPlus + ' Agregar'; return b; };
  function render() {
    // Botón de cada producto: sin opciones muestra el contador; con opciones siempre abre el selector.
    for (const p of Object.values(products)) {
      const box = p.node.querySelector('.ctl');
      if (!box) continue;
      box.textContent = '';
      const n = inCart(p.id);
      if (p.dur) { const b = el('button', 'add'); b.type = 'button'; b.dataset.book = p.id; b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Reservar'; box.append(b); continue; }
      if (!p.opts.length && n) box.append(stepper(() => n, (d) => changeLine(p.id + '#', d)));
      else { box.append(addBtn(p.id)); if (n) box.append(el('span', 'incart', n + ' en tu pedido')); }
    }
    const n = count(), bar = $('cartbar');
    bar.classList.toggle('show', n > 0 && D.accepting === '1');
    $('cartN').textContent = n; $('cartT').textContent = money(subtotal());
    if (!n && $('sheet').classList.contains('show') && $('vDone').hidden) closeSheet();
    $('sheet').classList.toggle('empty', !n && $('vDone').hidden);
    renderSheet();
  }
  const mode = () => (root.querySelector('input[name=mode]:checked') || root.querySelector('input[name=mode]') || {}).value || 'pickup';
  const zoneSel = $('cZone');
  const fee = () => {
    if (mode() !== 'delivery') return 0;
    if (zoneSel) { const o = zoneSel.selectedOptions[0]; return o && o.value !== '' ? +o.dataset.fee : 0; }
    return +D.fee;
  };
  function totals() {
    const sub = subtotal(), disc = coupon ? coupon.discount : 0, f = fee();
    return { sub, disc, fee: f, total: sub - disc + f };
  }
  function renderSheet() {
    const list = $('cartList'); list.textContent = '';
    for (const [k, l] of Object.entries(cart)) {
      const p = products[l.id], row = el('div', 'ci'), nm = el('div', 'nm');
      const th = el(p.img ? 'img' : 'span', 'cth'); if (p.img) { th.src = p.img; th.alt = ''; th.loading = 'lazy'; } row.append(th);
      nm.append(el('b', '', p.name));
      if (l.label) nm.append(el('span', 'opt', l.label));
      nm.append(el('span', 'muted small', money(unit(l) * l.qty)));
      row.append(nm, stepper(() => l.qty, (d) => changeLine(k, d))); list.append(row);
    }
    const t = totals(), sum = $('sum'); sum.textContent = '';
    const line = (a, b, c) => { const d = el('div', c || ''); d.append(el('span', '', a), el('span', '', b)); sum.append(d); };
    line('Subtotal', money(t.sub));
    if (t.disc) line('Descuento (' + coupon.code + ')', '-' + money(t.disc));
    if (t.fee) line('Domicilio', money(t.fee));
    line('Total', money(t.total), 't');
    $('couponBox').hidden = D.coupons !== '1';
    $('addrBox').hidden = mode() !== 'delivery';
    if ($('zoneBox')) $('zoneBox').hidden = mode() !== 'delivery';
  }
  if (zoneSel) zoneSel.addEventListener('change', renderSheet);

  // ---------- Selector de opciones (talla, color, adicionales) ----------
  const optSheet = $('optSheet');
  let optState = null;
  function openOptions(id) {
    const p = products[id];
    if (roomFor(id) <= 0) return;
    optState = { id, qty: 1, sel: p.opts.map(() => []) };
    $('optT').textContent = p.name; $('optErr').hidden = true;
    const oi = $('optImg'); if (oi) { oi.hidden = !p.img; if (p.img) oi.src = p.img; }
    const body = $('optBody'); body.textContent = '';
    p.opts.forEach((g, gi) => {
      const box = el('fieldset', 'og');
      const lg = el('legend', '', g.name); lg.append(el('small', '', g.multi ? (g.required ? ' · elige una o más' : ' · opcional, puedes elegir varias') : (g.required ? ' · elige una' : ' · opcional')));
      box.append(lg);
      g.choices.forEach((c, ci) => {
        const lab = el('label', 'oc'), inp = el('input');
        inp.type = g.multi ? 'checkbox' : 'radio'; inp.name = 'og' + gi; inp.value = ci;
        inp.onchange = () => { optState.sel[gi] = [...box.querySelectorAll('input:checked')].map((x) => +x.value); updOpt(); };
        lab.append(inp, el('span', '', c.n));
        if (c.p) lab.append(el('em', '', '+' + money(c.p)));
        box.append(lab);
      });
      body.append(box);
    });
    updOpt();
    optSheet.classList.add('show'); ov.classList.add('show'); document.body.style.overflow = 'hidden';
  }
  function updOpt() {
    const p = products[optState.id];
    const extra = optState.sel.reduce((a, s, gi) => a + s.reduce((b, ci) => b + p.opts[gi].choices[ci].p, 0), 0);
    optState.extra = extra; $('optErr').hidden = true;
    const q = $('optQty'); q.replaceWith(Object.assign(stepper(() => optState.qty, (d) => { optState.qty = Math.max(1, Math.min(roomFor(optState.id), optState.qty + d)); updOpt(); }), { id: 'optQty' }));
    $('optAdd').textContent = 'Agregar · ' + money((p.price + extra) * optState.qty);
  }
  $('optAdd').onclick = () => {
    const p = products[optState.id], miss = p.opts.findIndex((g, gi) => g.required && !optState.sel[gi].length);
    if (miss >= 0) { $('optErr').textContent = 'Elige ' + p.opts[miss].name.toLowerCase() + '.'; $('optErr').hidden = false; return; }
    const label = p.opts.map((g, gi) => optState.sel[gi].length ? g.name + ': ' + optState.sel[gi].map((ci) => g.choices[ci].n).join(', ') : '').filter(Boolean).join(' · ');
    const opts = optState.sel.map((x) => [...x].sort((a, b) => a - b));
    addLine(optState.id, opts, label, optState.extra, optState.qty);
    closeOpt();
  };
  function closeOpt() { optSheet.classList.remove('show'); if (!sheet.classList.contains('show') && !shareSheet.classList.contains('show')) { ov.classList.remove('show'); document.body.style.overflow = ''; } }
  $('closeOpt').onclick = closeOpt;

  // ---------- Hoja del pedido ----------
  const sheet = $('sheet'), ov = $('ov');
  function openSheet() { $('vCart').hidden = false; $('vDone').hidden = true; $('sheetT').textContent = 'Tu pedido'; $('err').hidden = true; sheet.classList.add('show'); ov.classList.add('show'); document.body.style.overflow = 'hidden'; renderSheet(); }
  const shareSheet = $('shareSheet');
  // Computador: el pedido vive en una columna fija a la derecha; en celular, en una hoja que sube desde abajo.
  const wide = window.matchMedia('(min-width:1100px)'), side = document.createElement('div'); side.className = 'sidecol';
  function placeSheet() {
    const on = wide.matches && D.accepting === '1';
    document.body.classList.toggle('sidecart', on);
    if (on && sheet.parentNode !== side) { document.querySelector('.sh-wrap').append(side); side.append(sheet); sheet.setAttribute('role', 'region'); sheet.removeAttribute('aria-modal'); closeSheet(); }
    else if (!on && sheet.parentNode === side) { document.body.append(sheet); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); }
  }
  function closeSheet() { if (document.body.classList.contains('sidecart')) { $('vCart').hidden = false; $('vDone').hidden = true; $('sheetT').textContent = 'Tu pedido'; sheet.classList.toggle('empty', !count()); } sheet.classList.remove('show'); shareSheet.classList.remove('show'); optSheet.classList.remove('show'); ov.classList.remove('show'); document.body.style.overflow = ''; }
  placeSheet(); wide.addEventListener('change', placeSheet);
  $('openCart').onclick = openSheet; $('closeCart').onclick = closeSheet; $('closeShare').onclick = closeSheet; ov.onclick = closeSheet; $('doneClose').onclick = closeSheet;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); $('zoom').classList.remove('show'); } });
  root.addEventListener('change', (e) => { if (e.target.name === 'mode') { renderSheet(); } });
  try { const n = localStorage.getItem('vt_name'), ph = localStorage.getItem('vt_phone'); if (n) $('cName').value = n; if (ph) $('cPhone').value = ph; } catch { /* sin almacenamiento */ }

  // ---------- Cupón ----------
  const payload = (channel) => ({
    items: Object.values(cart).map((l) => ({ id: l.id, qty: l.qty, opts: l.opts })), zone: zoneSel ? zoneSel.value : '', coupon: coupon ? coupon.code : $('coupon').value.trim(), mode: mode(), channel,
    pay: (root.querySelector('input[name=pay]:checked') || {}).value ?? '', name: $('cName').value.trim(), phone: $('cPhone').value.trim(), address: $('cAddr').value.trim(), note: $('cNote').value.trim(),
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
    if (mode() === 'delivery' && zoneSel && zoneSel.value === '') { err.textContent = 'Elige tu zona de entrega.'; err.hidden = false; zoneSel.focus(); return; }
    if (mode() === 'delivery' && $('cAddr').value.trim().length < 5) { err.textContent = 'Escribe la dirección de entrega.'; err.hidden = false; $('cAddr').focus(); return; }
    const t = totals();
    if (+D.min && t.sub - t.disc < +D.min) { err.textContent = 'El pedido mínimo es ' + money(+D.min) + '.'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      const j = await post(channel === 'pay' ? 'pagar' : 'pedido', payload(channel));
      track(channel === 'pay' ? 'InitiateCheckout' : 'Lead', channel === 'pay' ? 'begin_checkout' : 'generate_lead', t.total);
      if (channel === 'pay') { cart = {}; coupon = null; save(); window.location.href = j.url; return; }
      try { localStorage.setItem('vt_name', $('cName').value.trim()); localStorage.setItem('vt_phone', $('cPhone').value.trim()); } catch { /* ignorar */ }
      $('vCart').hidden = true; $('vDone').hidden = false; $('sheetT').textContent = 'Pedido enviado';
      cart = {}; coupon = null; save(); render();
      $('doneTitle').textContent = (TXT.done_title || '¡Pedido {codigo} listo!').replace('{codigo}', j.code);
      const link = $('doneLink'); link.href = j.url; link.textContent = channel === 'messenger' ? 'Abrir Messenger' : (TXT.open_wa || 'Abrir WhatsApp');
      link.className = 'btn btn-block btn-lg ' + (channel === 'messenger' ? '' : 'btn-wa');
      const lines = j.pay_method ? [j.pay_method.text] : (j.payment_info || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const pay = $('donePay'); pay.textContent = ''; pay.hidden = !lines.length;
      if (lines.length) {
        pay.append(el('b', '', j.pay_method ? 'Pagarás con ' + j.pay_method.label : 'Cómo pagar'));
        lines.forEach((l) => {
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
      } else $('doneMsg').textContent = TXT.done_msg || 'Se abrirá tu chat con el pedido ya escrito. Solo toca enviar.';
      window.location.href = j.url;
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { btn.disabled = false; }
  };
  const wa = $('sendWa'), ms = $('sendMs'), pn = $('payNow');
  if (pn) pn.onclick = () => send('pay', pn);
  if (wa) wa.onclick = () => send('whatsapp', wa);
  if (ms) ms.onclick = () => send('messenger', ms);

  // ---------- Agregar, búsqueda, categorías ----------
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (!b) return; const p = products[b.dataset.add]; if (p.opts.length) openOptions(p.id); else addLine(p.id, [], '', 0, 1); });
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
  // ---------- Reservar una cita (servicios con duración) ----------
  const bk = $('bkSheet');
  if (bk) {
    let cur = null, pick = null;
    const showBk = () => { bk.classList.add('show'); ov.classList.add('show'); document.body.style.overflow = 'hidden'; };
    const hideBk = () => { bk.classList.remove('show'); if (!sheet.classList.contains('show') && !shareSheet.classList.contains('show')) { ov.classList.remove('show'); document.body.style.overflow = ''; } };
    $('closeBk').onclick = hideBk; ov.addEventListener('click', hideBk);
    const step = (two) => { $('bkStep1').hidden = two; $('bkStep2').hidden = !two; };
    async function loadSlots(day, btn) {
      $('bkDays').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
      const box = $('bkSlots'); box.textContent = ''; box.append(el('p', 'small muted', 'Cargando…'));
      try {
        const j = await (await fetch(`/t/${D.slug}/agenda?p=${cur.id}&d=${day}`, { cache: 'no-store' })).json(); box.textContent = '';
        if (!j.slots || !j.slots.length) { box.append(el('p', 'small muted', 'No quedan horarios este día. Prueba otro.')); return; }
        j.slots.forEach((s) => { const b = el('button', 'chip', s.t); b.type = 'button'; b.onclick = () => { pick = { day, start: s.m, t: s.t, dl: btn.dataset.full }; $('bkSum').textContent = `${cur.name} · ${pick.dl}, ${pick.t}`; $('bkErr').hidden = true; step(true); }; box.append(b); });
      } catch { box.textContent = ''; box.append(el('p', 'small muted', 'No pudimos cargar los horarios. Intenta de nuevo.')); }
    }
    async function openBk(id) {
      cur = products[id]; pick = null; $('bkT').textContent = 'Reservar · ' + cur.name; step(false);
      const days = $('bkDays'); days.textContent = ''; $('bkSlots').textContent = '';
      showBk();
      try {
        const j = await (await fetch(`/t/${D.slug}/agenda?p=${id}`, { cache: 'no-store' })).json();
        if (!j.days || !j.days.length) { days.append(el('p', 'small muted', 'No hay días disponibles por ahora.')); return; }
        let first = null;
        j.days.forEach((d) => { const b = el('button', 'bkday'); b.type = 'button'; b.dataset.full = `${d.wd} ${d.dm}`; b.disabled = !d.free; b.append(el('small', '', d.wd), el('b', '', d.dm)); b.onclick = () => loadSlots(d.day, b); days.append(b); if (!first && d.free) first = [d.day, b]; });
        if (first) loadSlots(first[0], first[1]); else $('bkSlots').append(el('p', 'small muted', 'No quedan horarios en los próximos días.'));
      } catch { days.append(el('p', 'small muted', 'No pudimos cargar la agenda.')); }
    }
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-book]'); if (b) openBk(b.dataset.book); });
    $('bkBack').onclick = () => step(false);
    try { const n = localStorage.getItem('vt_name'), ph = localStorage.getItem('vt_phone'); if (n) $('bkName').value = n; if (ph) $('bkPhone').value = ph; } catch { /* sin almacenamiento */ }
    $('bkSend').onclick = async () => {
      const err = $('bkErr'), btn = $('bkSend'); err.hidden = true; btn.disabled = true;
      try {
        const r = await fetch(`/t/${D.slug}/reservar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: cur.id, day: pick.day, start: pick.start, name: $('bkName').value.trim(), phone: $('bkPhone').value.trim(), note: $('bkNote').value.trim() }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { err.textContent = j.error || 'No se pudo reservar.'; err.hidden = false; if (r.status === 409) { step(false); openBk(cur.id); } return; }
        try { localStorage.setItem('vt_name', $('bkName').value.trim()); localStorage.setItem('vt_phone', $('bkPhone').value.trim()); } catch { /* ignorar */ }
        track('Schedule', 'generate_lead', cur.price);
        $('bkSum').textContent = `¡Listo! Reserva ${j.code} · ${j.when}. Envíala por WhatsApp para confirmarla.`.replace('m.. ', 'm. ');
        window.location.href = j.url;
      } catch { err.textContent = 'Sin conexión. Intenta de nuevo.'; err.hidden = false; } finally { btn.disabled = false; }
    };
  }

  // Fotos: al tocarla se abre en grande; si tiene varias, se pasan con las flechas o deslizando.
  const zoom = $('zoom'), zimg = zoom.querySelector('img');
  let zl = [], zi = 0;
  const zshow = () => { zimg.src = '/m/' + zl[zi]; const many = zl.length > 1; $('zoomP').hidden = $('zoomN').hidden = !many; $('zoomC').textContent = many ? (zi + 1) + ' / ' + zl.length : ''; };
  const zmove = (d) => { if (zl.length > 1) { zi = (zi + d + zl.length) % zl.length; zshow(); } };
  root.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]'); if (!z) return;
    const p = products[z.dataset.zoom]; zl = p.gal || [z.getAttribute('src').replace('/m/', '')]; zi = 0; zshow(); zoom.classList.add('show');
  });
  $('zoomP').onclick = (e) => { e.stopPropagation(); zmove(-1); }; $('zoomN').onclick = (e) => { e.stopPropagation(); zmove(1); };
  zimg.onclick = (e) => { e.stopPropagation(); zmove(1); };
  let tx0 = null;
  zoom.addEventListener('touchstart', (e) => { tx0 = e.touches[0].clientX; }, { passive: true });
  zoom.addEventListener('touchend', (e) => { if (tx0 === null) return; const dx = e.changedTouches[0].clientX - tx0; if (Math.abs(dx) > 40) zmove(dx < 0 ? 1 : -1); tx0 = null; });
  document.addEventListener('keydown', (e) => { if (!zoom.classList.contains('show')) return; if (e.key === 'ArrowRight') zmove(1); if (e.key === 'ArrowLeft') zmove(-1); });
  zoom.onclick = () => zoom.classList.remove('show');

  render();
  if (D.focus !== '0') { const n = $('p' + D.focus); if (n) { n.classList.add('hl'); setTimeout(() => n.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150); } }
})();

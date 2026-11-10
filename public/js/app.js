// Menú móvil
document.querySelectorAll('[data-toggle="nav"]').forEach((b) => {
  b.addEventListener('click', () => {
    const nav = document.getElementById('nav');
    const open = nav.classList.toggle('open');
    b.setAttribute('aria-expanded', open);
  });
});
// Mostrar/ocultar cantidad según modalidad
document.querySelectorAll('[name="mode"]').forEach((el) => {
  const sync = () => {
    const units = document.querySelector('[name="mode"]:checked')?.value === 'units';
    document.querySelectorAll('[data-units]').forEach((x) => (x.hidden = !units));
  };
  el.addEventListener('change', sync); sync();
});
// Cálculo en vivo del total del cliente
const budget = document.querySelector('[data-fee-pct]');
if (budget && document.querySelector('[data-fee-out]')) {
  const out = document.querySelector('[data-fee-out]');
  const calc = () => {
    const v = parseFloat(String(budget.value).replace(',', '.')) || 0;
    const pct = +budget.dataset.feePct, min = +budget.dataset.feeMin / 100, com = +budget.dataset.commission;
    const qty = document.querySelector('[name="mode"]:checked')?.value === 'units' ? (+document.querySelector('[name="quantity"]').value || 1) : 1;
    const fee = Math.max(min, Math.round(v * pct) / 100);
    out.textContent = v ? `Pagará $${(v + fee).toFixed(2)} por ${qty > 1 ? 'unidad' : 'tarea'} (incluye tarifa de servicio $${fee.toFixed(2)}). El trabajador recibe $${(v * (1 - com / 100)).toFixed(2)}.${qty > 1 ? ` Total estimado: $${((v + fee) * qty).toFixed(2)}.` : ''}` : '';
  };
  document.querySelectorAll('input').forEach((i) => i.addEventListener('input', calc)); calc();
}
// Confirmaciones
document.querySelectorAll('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
// Chat: desplazarse al final
const chat = document.querySelector('.chat-log'); if (chat) chat.scrollTop = chat.scrollHeight;

// Precio habitual según la categoría
const catSel = document.querySelector('select[name="category_id"]'), hintEl = document.querySelector('[data-price-hint]');
if (catSel && hintEl) {
  const upd = () => { const h = catSel.selectedOptions[0]?.dataset.hint; hintEl.textContent = h ? `Precio habitual en esta categoría: $${h} USD.` : ''; };
  catSel.addEventListener('change', upd); upd();
}
// En celular, los filtros empiezan cerrados
if (window.innerWidth < 760) document.querySelectorAll('details.filters').forEach((d) => d.removeAttribute('open'));
// Sliders de 3 tarjetas con flechas (en celular: 1 tarjeta, deslizable con el dedo)
document.querySelectorAll('[data-slider]').forEach((sl) => {
  const track = sl.querySelector('.sl-track');
  const prev = sl.querySelector('.sl-prev'), next = sl.querySelector('.sl-next');
  const step = () => track.clientWidth + parseFloat(getComputedStyle(track).columnGap || 0);
  const sync = () => {
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    sl.classList.toggle('sl-static', prev.disabled && next.disabled);
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  track.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
});

// Formulario de publicación guiado: muestra pasos según modalidad y tipo de precio
const tf = document.getElementById('taskForm');
if (tf) {
  const $ = (s) => tf.querySelector(s), $$ = (s) => tf.querySelectorAll(s);
  const sel = $('select[name="category_id"]');
  const sync = () => {
    const mod = (tf.querySelector('[name="modality"]:checked') || {}).value || '';
    const pt = (tf.querySelector('[name="price_type"]:checked') || {}).value || 'fixed';
    $$('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== mod; });
    $$('[data-show-price]').forEach((el) => { el.hidden = el.dataset.showPrice !== pt; });
    $$('optgroup[data-grp]').forEach((g) => { const off = !!mod && g.dataset.grp !== mod; g.hidden = off; g.disabled = off; });
    if (sel.selectedOptions[0] && sel.selectedOptions[0].dataset.grp && mod && sel.selectedOptions[0].dataset.grp !== mod) sel.value = '';
    $('[data-step-n]').textContent = mod === 'presencial' ? '4' : '3';
    $('[data-budget-label]').textContent = pt === 'hourly' ? 'Valor por hora' : pt === 'open' ? 'Presupuesto máximo (referencia)' : 'Valor total';
    const units = (tf.querySelector('[name="mode"]:checked') || {}).value === 'units';
    $$('[data-units]').forEach((x) => (x.hidden = !units));
    const b = $('input[name="budget"]'), cur = $('select[name="currency"]').value, rate = +b.dataset.rate || 1;
    const v = parseFloat(String(b.value).replace(/\./g, cur === 'COP' ? '' : '.').replace(',', '.')) || 0;
    const h = pt === 'hourly' ? (+$('input[name="hours"]').value || 0) : 1;
    const totalUsd = (cur === 'COP' ? v / rate : v) * h;
    const fee = Math.max(+b.dataset.feeMin / 100, totalUsd * (+b.dataset.feePct) / 100);
    const fmt = (usd) => '$' + Math.round(usd * rate).toLocaleString('es-CO') + ' COP';
    $('[data-total-out]').textContent = totalUsd ? `${pt === 'open' ? 'Referencia: ' : 'Pagarás '}${fmt(totalUsd + fee)} (incluye tarifa de servicio de ${fmt(fee)}). El dinero queda protegido hasta el final.` : '';
    const hint = sel.selectedOptions[0] && sel.selectedOptions[0].dataset.hint; const ph = $('[data-price-hint]');
    if (ph) ph.textContent = hint ? `Precio habitual en esta categoría: $${hint} USD.` : '';
  };
  tf.addEventListener('change', sync); tf.addEventListener('input', sync); sync();
}

// Banners rotativos (cambian cada 6 s; se pausan al pasar el mouse)
document.querySelectorAll('[data-carousel]').forEach((c) => {
  const slides = [...c.querySelectorAll('.mk-slide')], dots = [...c.querySelectorAll('.mk-dots button')];
  let i = 0, timer;
  const go = (n) => { i = (n + slides.length) % slides.length; slides.forEach((s, k) => s.classList.toggle('on', k === i)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
  const play = () => { clearInterval(timer); timer = setInterval(() => go(i + 1), 6000); };
  c.querySelector('.mk-next')?.addEventListener('click', () => { go(i + 1); play(); });
  c.querySelector('.mk-prev')?.addEventListener('click', () => { go(i - 1); play(); });
  dots.forEach((d, k) => d.addEventListener('click', () => { go(k); play(); }));
  c.addEventListener('mouseenter', () => clearInterval(timer)); c.addEventListener('mouseleave', play);
  let x0 = null; c.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  c.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); play(); } x0 = null; });
  play();
});
// Cerrar menús desplegables al hacer clic fuera
document.addEventListener('click', (e) => { document.querySelectorAll('details.mh-drop[open], details.usermenu[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); }); });
// Mercado: botones + / − y contador del carrito
const gx = document.getElementById('gxCart');
if (gx) {
  const count = gx.querySelector('[data-gx-count]'), go = gx.querySelector('[data-gx-go]');
  const sync = () => { let n = 0; gx.querySelectorAll('.gx-qty input').forEach((i) => { const v = Math.max(0, Math.min(50, +i.value || 0)); i.value = v; n += v; i.closest('.gx-item').classList.toggle('on', v > 0); }); count.textContent = n; go.disabled = n === 0; };
  gx.addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (!b) return; const i = b.parentElement.querySelector('input'); i.value = (+i.value || 0) + (+b.dataset.step); sync(); });
  gx.addEventListener('input', sync); sync();
}

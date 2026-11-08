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
if (budget) {
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

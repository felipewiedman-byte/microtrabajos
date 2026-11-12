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
    out.textContent = v ? `Pagará $${(v + fee).toFixed(2)} por ${qty > 1 ? 'unidad' : 'tarea'} ${fee > 0 ? `(incluye tarifa de servicio $${fee.toFixed(2)})` : '(sin recargos)'}. El trabajador recibe $${(v * (1 - com / 100)).toFixed(2)}.${qty > 1 ? ` Total estimado: $${((v + fee) * qty).toFixed(2)}.` : ''}` : '';
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
    $('[data-total-out]').textContent = totalUsd ? `${pt === 'open' ? 'Referencia: ' : 'Pagarás '}${fmt(totalUsd + fee)} ${fee > 0 ? `(incluye tarifa de servicio de ${fmt(fee)})` : '(sin recargos)'}. El dinero queda protegido hasta el final.` : '';
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

// Selector mundial de ciudades: búsqueda por texto + GPS del dispositivo
document.querySelectorAll('[data-cityp]').forEach((box) => {
  const q = box.querySelector('.cityp-q'), list = box.querySelector('.cityp-list'), msg = box.querySelector('.cityp-msg'), gps = box.querySelector('.cityp-gps');
  const hc = box.querySelector('[data-f="city"]'), hs = box.querySelector('[data-f="sig"]');
  const nav = box.dataset.mode === 'nav';
  let timer, ctl, active = -1, items = [];
  const say = (t) => { msg.textContent = t || ''; };
  const hide = () => { list.hidden = true; list.textContent = ''; items = []; active = -1; };
  const api = async (url) => {
    if (ctl) ctl.abort();
    ctl = new AbortController();
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (r.status === 429) throw new Error('busy');
    if (!r.ok) throw new Error('fail');
    return r.json();
  };
  const choose = (p) => {
    hide(); say('');
    if (nav) { location.href = '/ciudad?c=' + encodeURIComponent(p.label) + '&s=' + encodeURIComponent(p.sig) + '&volver=' + encodeURIComponent(box.dataset.back || '/'); return; }
    q.value = p.label;
    if (hc) hc.value = p.label;
    if (hs) hs.value = p.sig || '';
    say('✓ ' + p.label);
  };
  const show = (res) => {
    hide();
    if (!res.length) { say('No encontramos esa ciudad. Revisa la ortografía o agrega el país.'); return; }
    say('');
    items = res;
    res.forEach((p, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      const b = document.createElement('b'); b.textContent = p.name;
      const s = document.createElement('span'); s.textContent = [p.region, p.country].filter(Boolean).join(', ');
      li.append(b, s);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(p); });
      list.appendChild(li);
    });
    list.hidden = false;
  };
  const mark = (n) => {
    const els = list.children; if (!els.length) return;
    active = (n + els.length) % els.length;
    [...els].forEach((el, i) => el.classList.toggle('on', i === active));
  };
  const err = (e) => say(e.name === 'AbortError' ? '' : e.message === 'busy' ? 'Hay muchas búsquedas ahora. Intenta de nuevo en unos segundos.' : 'No se pudo buscar ahora. Intenta de nuevo.');

  q.addEventListener('input', () => {
    // Si la persona edita el texto, la ciudad elegida deja de ser válida hasta que elija otra
    if (hc) hc.value = ''; if (hs) hs.value = '';
    clearTimeout(timer); hide();
    const v = q.value.trim();
    if (!v) { say(''); return; }
    if (v.length < 3) { say('Escribe al menos 3 letras.'); return; }
    say('Buscando…');
    timer = setTimeout(() => api('/api/geo/buscar?q=' + encodeURIComponent(v)).then((d) => show(d.results || [])).catch(err), 500);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(active - 1); }
    else if (e.key === 'Escape') hide();
    else if (e.key === 'Enter' && items.length) { e.preventDefault(); choose(items[active >= 0 ? active : 0]); }
  });
  q.addEventListener('blur', () => setTimeout(hide, 150));

  gps.addEventListener('click', () => {
    if (!navigator.geolocation) { say('Este dispositivo no permite GPS. Escribe tu ciudad.'); return; }
    if (!window.isSecureContext) { say('El GPS solo funciona en una conexión segura (https). Escribe tu ciudad.'); return; }
    gps.disabled = true; say('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition((pos) => {
      api('/api/geo/inversa?lat=' + pos.coords.latitude.toFixed(3) + '&lon=' + pos.coords.longitude.toFixed(3))
        .then((d) => { if (d.place) choose(d.place); else say('No pudimos identificar tu ciudad. Escríbela en el buscador.'); })
        .catch(err).finally(() => { gps.disabled = false; });
    }, (e) => {
      gps.disabled = false;
      say(e.code === 1 ? 'No diste permiso de ubicación. Puedes escribir tu ciudad.' : e.code === 3 ? 'Tardó demasiado en ubicarte. Intenta de nuevo o escribe tu ciudad.' : 'No se pudo obtener tu ubicación. Escribe tu ciudad.');
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  });
});
// Al abrir el menú "Tu ciudad", el cursor queda en el buscador
document.querySelectorAll('details.mh-city').forEach((d) => d.addEventListener('toggle', () => { if (d.open) d.querySelector('.cityp-q')?.focus(); }));

// Fotos más livianas: antes de subir se reducen a 1600 px y se convierten a WebP (ahorra disco y ancho de banda).
// Solo se usa el resultado si pesa menos; GIF, SVG, ICO y las pantallas de administración no se tocan.
document.addEventListener('change', (ev) => {
  const inp = ev.target;
  if (!(inp instanceof HTMLInputElement) || inp.type !== 'file' || !inp.files || inp.multiple || location.pathname.startsWith('/admin') || !window.DataTransfer) return;
  const f = inp.files[0];
  if (!f || !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 150 * 1024) return;
  createImageBitmap(f).then((bmp) => {
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    c.toBlob((b) => {
      if (!b || b.type !== 'image/webp' || b.size >= f.size) return;
      const dt = new DataTransfer(); dt.items.add(new File([b], f.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })); inp.files = dt.files;
    }, 'image/webp', 0.82);
  }).catch(() => {});
});

// Campos enlazados y selección al hacer clic (reemplazan manejadores en línea, para poder usar una política CSP estricta).
document.addEventListener('input', (e) => {
  const t = e.target, mode = t.dataset && t.dataset.sync;
  if (!mode) return;
  const o = mode === 'prev' ? t.previousElementSibling : t.nextElementSibling;
  if (o) o.value = t.value;
});
document.addEventListener('click', (e) => { if (e.target.dataset && 'select' in e.target.dataset && e.target.select) e.target.select(); });

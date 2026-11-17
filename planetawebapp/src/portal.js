import { SCRIPT, whistle, crowd, speak, soundOn, unlock, locked } from './matchAudio'
// Script de las páginas de resultados (/partidos, /liga, /partido): búsqueda, tema claro/oscuro, expandir/contraer y compartir la tarjeta del partido.
// La tarjeta es la MISMA que se comparte desde el mapa (se dibuja en el navegador de quien la pide).

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)]
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// tema: claro, oscuro o el del dispositivo (se recuerda)
const root = document.documentElement
try { const t = localStorage.getItem('portalTheme'); if (t) root.dataset.theme = t } catch { /* sin almacenamiento */ }
$$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  root.dataset.theme = dark ? 'light' : 'dark'
  try { localStorage.setItem('portalTheme', root.dataset.theme) } catch { /* nada */ }
}))

// expandir / contraer todas las ligas
$$('[data-expand]').forEach(b => b.addEventListener('click', () => { const open = b.dataset.expand === 'all'; $$('details.lg').forEach(d => { d.open = open }) }))

// filtros: deporte, liga favorita/liga y búsqueda por equipo o liga (se combinan)
let spSel = 'all', lgSel = 'all', qSel = ''
const favs = () => { try { return JSON.parse(localStorage.getItem('portalFavs') || '[]') } catch { return [] } }
const rowText = r => r.dataset.q ??= norm(($('.rw', r)?.textContent || '') + ' ' + ($('.xl', r)?.textContent || '') + ' ' + ($('summary', r.closest('details.lg'))?.textContent || ''))
const refresh = () => {
  const f = favs(), filtrando = qSel || spSel !== 'all' || lgSel !== 'all'
  $$('.mx').forEach(r => { r.style.display = (spSel === 'all' || r.dataset.sp === spSel) && (!qSel || rowText(r).includes(qSel)) ? '' : 'none' })
  $$('details.lg').forEach(d => {
    const lgOk = lgSel === 'all' || (lgSel === 'fav' ? f.includes(d.dataset.k) : d.dataset.k === lgSel), any = $$('.mx', d).some(r => r.style.display !== 'none')
    d.style.display = lgOk && any ? '' : 'none'; if (lgOk && any && filtrando) d.open = true
  })
  $$('.bk').forEach(k => { k.style.display = $$('details.lg', k).some(d => d.style.display !== 'none') ? '' : 'none' })
}
const q = $('[data-search]')
if (q) { let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { qSel = norm(q.value).trim(); refresh() }, 120) }) }
const paintFavs = () => { const f = favs(); $$('[data-fav]').forEach(b => { const on = f.includes(b.dataset.fav); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆' }) }
paintFavs()
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fav]'); if (!b) return
  e.preventDefault(); e.stopPropagation()
  const f = favs(), k = b.dataset.fav, i = f.indexOf(k); if (i >= 0) f.splice(i, 1); else f.push(k)
  try { localStorage.setItem('portalFavs', JSON.stringify(f.slice(-60))) } catch { /* nada */ }
  paintFavs(); if (lgSel === 'fav') refresh()
})
const chips = $('[data-chips]')
if (chips) chips.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; lgSel = c.dataset.lg; $$('.chip', chips).forEach(x => x.classList.toggle('on', x === c)); refresh() })
const spChips = $('[data-spchips]')
if (spChips) spChips.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; spSel = c.dataset.sp; $$('.chip', spChips).forEach(x => x.classList.toggle('on', x === c)); refresh() })

// compartir: tarjeta con tu marca (igual que en el mapa); si el navegador no puede compartir archivos, se descarga la imagen
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-share]'); if (!b) return
  e.preventDefault()
  if (b.dataset.busy) return; b.dataset.busy = '1'; const old = b.textContent; b.textContent = 'Preparando…'
  try {
    const m = JSON.parse(b.dataset.m || '{}'), site = JSON.parse(document.body.dataset.site || '{}')
    const { shareMatchCard } = await import('./shareCard')   // se baja solo al compartir
    await shareMatchCard({ m, city: b.dataset.city || '', site, link: b.dataset.url }, { url: b.dataset.url, text: b.dataset.text || '' })
  } catch { /* el usuario canceló o el navegador no pudo */ }
  b.textContent = old; delete b.dataset.busy
})
const rowCard = b => { try { return JSON.parse(b.closest('.xp')?.querySelector('.rs')?.dataset.rs || 'null') } catch { return null } }
$$('[data-copy]').forEach(b => b.addEventListener('click', async () => { try { await waitCard(rowCard(b) || cardData); await navigator.clipboard.writeText(b.dataset.copy); const o = b.textContent; b.textContent = 'Enlace copiado'; setTimeout(() => { b.textContent = o }, 1800) } catch { /* sin portapapeles */ } }))

// calendario: elegir cualquier fecha
$$('[data-date]').forEach(i => i.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(i.value)) location.href = (i.dataset.base || '/partidos') + '/' + i.value }))
// la fecha activa queda a la vista en la barra deslizable
$('.bar2 a.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })

// slider de los partidos en vivo
$$('[data-slide]').forEach(b => b.addEventListener('click', () => { const r = $('.lcs', b.parentElement); r?.scrollBy({ left: +b.dataset.slide * r.clientWidth * 0.8, behavior: 'smooth' }) }))

// tarjeta del partido para la vista previa del enlace (WhatsApp, Facebook, X…): este navegador la dibuja y el servidor la guarda
const cards = new Map()
const genCard = d => {
  if (!d || !d.need) return Promise.resolve()
  if (cards.has(d.id + d.k)) return cards.get(d.id + d.k)
  const p = (async () => {
    try {
      const { matchOgBlob } = await import('./shareCard'), site = JSON.parse(document.body.dataset.site || '{}')
      const blob = await matchOgBlob({ m: d.m, city: d.city, site, link: d.link })
      await fetch('/api/match-card/' + d.id + '?k=' + encodeURIComponent(d.k), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
    } catch { /* el enlace se comparte igual */ }
  })()
  cards.set(d.id + d.k, p); return p
}
const waitCard = d => Promise.race([genCard(d), new Promise(ok => setTimeout(ok, 6000))])
const cardData = (() => { try { return JSON.parse(document.body.dataset.card || 'null') } catch { return null } })()
if (cardData && cardData.need) setTimeout(() => genCard(cardData), 1200)
document.addEventListener('click', e => { const b = e.target.closest('.sh a[target], [data-copy]'); if (b && cardData?.need) genCard(cardData) }, true)

// íconos de redes dentro de cada partido desplegado: la tarjeta se prepara antes de abrir la red social
const SOC = {"wa": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"12\" fill=\"#25d366\"/><path d=\"M12 5.6a6.4 6.4 0 0 0-5.5 9.7L5.6 18.4l3.2-.9A6.4 6.4 0 1 0 12 5.6Z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.7\" stroke-linejoin=\"round\"/><path d=\"M9.6 9.2c.2 2.2 2 4.3 4.7 5.2l1-1.2-1.7-.9-.8.7c-.8-.4-1.6-1.2-2-2l.7-.8-.8-1.8Z\" fill=\"#fff\"/></svg>", "fb": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"12\" fill=\"#1877f2\"/><path d=\"M13.4 19v-6.2h2.1l.4-2.5h-2.5V8.7c0-.7.3-1.2 1.3-1.2h1.3V5.3c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.200-3.2 3.300v1.800H8.800v2.500h2.100V19h2.500Z\" fill=\"#fff\"/></svg>", "x": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"12\" fill=\"#111\"/><path d=\"M7.200 7.200l9.600 9.600M16.800 7.200l-9.600 9.600\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>", "tg": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"12\" fill=\"#29a9eb\"/><path d=\"M18.600 6.200 5.400 11.300c-.9.300-.9.900-.2 1.100l3.300 1 1.300 3.900c.2.500.3.600.7.600.3 0 .5-.1.700-.3l1.800-1.700 3.400 2.500c.6.300 1.100.2 1.300-.6l2.200-10.500c.3-1-.4-1.500-1.300-1.100Zm-9 6 6.900-4.300c.3-.2.600-.1.400.1l-5.600 5.100-.2 2.300-1.500-3.200Z\" fill=\"#fff\"/></svg>", "cp": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>"}
const enc = encodeURIComponent
const fillRs = box => {
  if (box.dataset.ok) return; box.dataset.ok = '1'
  let d; try { d = JSON.parse(box.dataset.rs) } catch { return }
  const url = location.origin + d.u, t = d.t
  const L = [['wa', 'WhatsApp', 'https://wa.me/?text=' + enc(t + ' ' + url)], ['fb', 'Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + enc(url)], ['x', 'X', 'https://twitter.com/intent/tweet?text=' + enc(t) + '&url=' + enc(url)], ['tg', 'Telegram', 'https://t.me/share/url?url=' + enc(url) + '&text=' + enc(t)]]
  box.innerHTML = '<small>Compartir</small>' + L.map(([k, n, h]) => `<a href="${h}" target="_blank" rel="noopener" data-net title="${n}" aria-label="Compartir en ${n}">${SOC[k]}</a>`).join('') + `<button type="button" data-rcopy title="Copiar enlace" aria-label="Copiar enlace">${SOC.cp}</button>`
}
document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details.mx') && d.open) { const b = d.querySelector('.rs'); if (b) fillRs(b) } }, true)
document.addEventListener('click', async e => {
  const a = e.target.closest('.rs a[data-net]'), c = e.target.closest('.rs [data-rcopy]'), t = a || c; if (!t) return
  e.preventDefault()
  let d; try { d = JSON.parse(t.closest('.rs').dataset.rs) } catch { return }
  if (a) { const w = window.open('', '_blank'); await waitCard(d); if (w) w.location = a.href; else location.href = a.href }
  else { await waitCard(d); try { await navigator.clipboard.writeText(location.origin + d.u); c.title = 'Enlace copiado'; c.style.color = 'var(--ac)'; setTimeout(() => { c.style.color = '' }, 1600) } catch { /* sin portapapeles */ } }
})

// flechas del slider solo cuando hay más tarjetas de las que caben
const marcarSliders = () => $$('.lw').forEach(w => { const r = $('.lcs', w); if (r) w.classList.toggle('noov', r.scrollWidth <= r.clientWidth + 2) })
marcarSliders(); addEventListener('resize', marcarSliders); addEventListener('load', marcarSliders)

// ---- en vivo: avisos con voz y pitidos (gol, tarjetas, penales, inicio, entretiempo, final) y marcadores que se actualizan solos ----
const siteCfg = (() => { try { return JSON.parse(document.body.dataset.site || '{}') } catch { return {} } })()
const sndBtn = $('[data-snd]')
const paintSnd = () => sndBtn?.classList.toggle('off', !soundOn() || siteCfg.snd === false)
paintSnd()
sndBtn?.addEventListener('click', () => { unlock(); try { localStorage.setItem('goalSound', soundOn() ? '0' : '1') } catch { /* nada */ } if (!soundOn()) try { speechSynthesis.cancel() } catch { /* nada */ } paintSnd(); $('.pt-lock')?.remove() })
addEventListener('pointerdown', unlock, { once: true }); addEventListener('keydown', unlock, { once: true })

let toastT = 0
const toast = (e, s) => {
  $('.pt-toast')?.remove()
  const d = document.createElement('div'); d.className = 'pt-toast ' + (s.tone || ''); d.setAttribute('role', 'status')
  const b = document.createElement('b'); b.textContent = s.title + (e.min && /yellow|red|penmiss/.test(e.kind) ? " · " + e.min + "'" : '')
  const sm = document.createElement('small'); sm.textContent = (e.player ? e.player + ' (' + e.team + ') · ' : '') + e.h + ' ' + e.gh + ' - ' + e.ga + ' ' + e.a
  const w = document.createElement('span'); w.append(b, sm); d.append(w); document.body.append(d)
  clearTimeout(toastT); toastT = setTimeout(() => d.remove(), 7000)
}
const queue = []; let busyQ = false
const runQ = async () => {
  if (busyQ) return; busyQ = true
  while (queue.length) {
    const e = queue.shift(), s = SCRIPT[e.kind]?.(e); if (!s) continue
    toast(e, s)
    if (soundOn() && siteCfg.snd !== false) { const ms = whistle(s.w); if (s.crowd && siteCfg.crowd !== false) crowd(2.5); await new Promise(r => setTimeout(r, ms + 150)); await speak(s.say) }
    else await new Promise(r => setTimeout(r, 2500))
  }
  busyQ = false
}
const onEvent = ev => {
  const e = ev.type === 'goal' ? { ...ev, kind: 'goal' } : ev.type === 'matchev' ? ev : null; if (!e) return
  if ((siteCfg.scope || 'all') !== 'all' && e.imp === 0) return
  if (queue.length >= 5) queue.shift()
  queue.push(e)
  if (soundOn() && siteCfg.snd !== false && locked() && !$('.pt-lock')) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pt-lock'; b.textContent = 'Toca para activar el sonido de los partidos'
    b.addEventListener('click', () => { unlock(); b.remove(); runQ() }); document.body.append(b)
  }
  runQ()
}

// marcadores al día: se vuelve a pedir la página y se cambian solo las partes que se mueven (no se pierde lo que tengas abierto)
let refreshing = false
const liveRefresh = async () => {
  if (refreshing || document.hidden) return; refreshing = true
  try {
    const r = await fetch(location.pathname + location.search, { cache: 'no-store' }); if (!r.ok) return
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html')
    const nlw = $('#live-wrap', doc), olw = $('#live-wrap'), nm = $('main', doc), om = $('main'); if (!nlw || !olw || !nm || !om) return
    const open = new Set($$('details.mx[open]').map(x => x.dataset.id)), closed = new Set($$('details.lg:not([open])').map(x => x.dataset.k)), sc = $$('.lcs').map(x => x.scrollLeft)
    olw.innerHTML = nlw.innerHTML; om.innerHTML = nm.innerHTML
    $$('details.mx', om).forEach(x => { if (open.has(x.dataset.id)) x.open = true })
    $$('details.lg', om).forEach(x => { if (closed.has(x.dataset.k)) x.open = false })
    $$('.lcs').forEach((x, i) => { x.scrollLeft = sc[i] || 0 })
    $$('label[for^=f-]').forEach((l, i) => { const n = $$('label[for^=f-]', doc)[i]; if (n) l.innerHTML = n.innerHTML })
    const sub = $('.hrow .sub'), nsub = $('.hrow .sub', doc); if (sub && nsub) sub.textContent = nsub.textContent
    delete document.body.dataset.q; $$('.mx').forEach(x => { delete x.dataset.q })
    $$('[data-spchips] .chip').forEach(c => c.classList.toggle('on', c.dataset.sp === spSel)); $$('[data-chips] .chip').forEach(c => c.classList.toggle('on', c.dataset.lg === lgSel))
    paintFavs(); refresh(); marcarSliders()
  } catch { /* se intenta en el próximo ciclo */ } finally { refreshing = false }
}
if (document.body.dataset.live) {
  let es, rt = 0
  const conectar = () => {
    try { es = new EventSource('/api/events'); es.onmessage = m => { let ev; try { ev = JSON.parse(m.data) } catch { return }; if (ev.type === 'goal' || ev.type === 'matchev') { onEvent(ev); clearTimeout(rt); rt = setTimeout(liveRefresh, 1500) } else if (ev.type === 'post') { clearTimeout(rt); rt = setTimeout(liveRefresh, 1500) } } } catch { /* sin avisos en vivo */ }
  }
  conectar()
  setInterval(() => { if ($('.mx.lv') || $('.lc:not(.fin)')) liveRefresh() }, 45e3)
}

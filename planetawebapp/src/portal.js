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
const rowText = r => r.dataset.q ??= norm(($('.rw', r)?.textContent || '') + ' ' + ($('.xl', r)?.textContent || '') + ' ' + (r.closest('details.lg') ? $('summary', r.closest('details.lg'))?.textContent || '' : ''))
const refresh = () => {
  const f = favs(), filtrando = qSel || spSel !== 'all' || lgSel !== 'all'
  $$('.mx').forEach(r => { r.style.display = (spSel === 'all' || r.dataset.sp === spSel) && (!qSel || rowText(r).includes(qSel)) ? '' : 'none' })
  $$('.lg').forEach(d => {
    const lgOk = lgSel === 'all' || (lgSel === 'fav' ? f.includes(d.dataset.k) : d.dataset.k === lgSel), any = $$('.mx', d).some(r => r.style.display !== 'none')
    d.style.display = lgOk && any ? '' : 'none'; if (lgOk && any && filtrando && 'open' in d && d.tagName === 'DETAILS') d.open = true
  })
  $$('.bk').forEach(k => { k.style.display = $$('.lg', k).some(d => d.style.display !== 'none') ? '' : 'none' })
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
// filtros por liga y por deporte: el clic se atiende desde el documento (la portada se actualiza sola y cambia estos botones; si el clic estuviera pegado a cada botón dejarían de funcionar)
document.addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return
  const chips = c.closest('[data-chips]'), spChips = c.closest('[data-spchips]')
  if (chips) { lgSel = c.dataset.lg; $$('.chip', chips).forEach(x => x.classList.toggle('on', x === c)); refresh() }
  else if (spChips) { spSel = c.dataset.sp; $$('.chip', spChips).forEach(x => x.classList.toggle('on', x === c)); refresh() }
})

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
document.addEventListener('click', async e => { const b = e.target.closest?.('[data-copy]'); if (!b) return; try { await waitCard(rowCard(b) || cardData); await navigator.clipboard.writeText(b.dataset.copy); const o = b.textContent; b.textContent = 'Enlace copiado'; setTimeout(() => { b.textContent = o }, 1800) } catch { /* sin portapapeles */ } })

// calendario: elegir cualquier fecha
$$('[data-date]').forEach(i => i.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(i.value)) location.href = (i.dataset.base || '/partidos') + '/' + i.value }))
// la fecha activa queda a la vista en la barra deslizable
$('.bar2 a.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })

// slider de los partidos en vivo
// el clic se atiende desde el documento: así las flechas siguen funcionando cuando la portada se actualiza sola y cambia los botones
document.addEventListener('click', e => { const b = e.target.closest?.('[data-slide]'); if (!b) return; const r = $('.lcs', b.parentElement); r?.scrollBy({ left: +b.dataset.slide * r.clientWidth * 0.8, behavior: 'smooth' }) })

// tarjeta del partido para la vista previa del enlace (WhatsApp, Facebook, X…): este navegador la dibuja y el servidor la guarda
const cards = new Map()
const genCard = d => {
  if (!d) return Promise.resolve()
  const key = d.id + (d.k || ''); if (cards.has(key)) return cards.get(key)
  const p = (async () => {
    try {
      if (!d.m) { const r = await fetch('/api/match-card/' + d.id); if (!r.ok) return; d = await r.json() }   // en la lista solo viaja lo mínimo: los datos de la tarjeta se piden al compartir
      if (!d.need) return
      const { matchOgBlob } = await import('./shareCard'), site = JSON.parse(document.body.dataset.site || '{}')
      let blob = await matchOgBlob({ m: d.m, city: d.city, site, link: d.link })
      let r = await fetch('/api/match-card/' + d.id + '?k=' + encodeURIComponent(d.k) + '&t=' + encodeURIComponent(d.t || ''), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
      if (r.status === 409) {   // el marcador cambió mientras se dibujaba (partido en vivo): se pide el dato actual y se dibuja otra vez
        const f = await fetch('/api/match-card/' + d.id); if (!f.ok) return
        d = await f.json(); if (!d.need) return
        blob = await matchOgBlob({ m: d.m, city: d.city, site, link: d.link })
        r = await fetch('/api/match-card/' + d.id + '?k=' + encodeURIComponent(d.k) + '&t=' + encodeURIComponent(d.t || ''), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
      }
    } catch { /* el enlace se comparte igual */ }
  })()
  cards.set(key, p); return p
}
// al compartir o copiar el enlace, el servidor guarda ese partido y su imagen para siempre
const markShared = async d => { try { if (!d?.id) return; const r = await fetch('/api/match-card/' + d.id); if (!r.ok) return; const p = await r.json(); await fetch('/api/match-card/' + d.id + '/shared?t=' + encodeURIComponent(p.t || ''), { method: 'POST' }) } catch { /* se guarda la próxima vez */ } }
const waitCard = d => Promise.race([genCard(d), new Promise(ok => setTimeout(ok, 6000))]).then(() => markShared(d))
const cardData = (() => { try { return JSON.parse(document.body.dataset.card || 'null') } catch { return null } })()
if (cardData && cardData.need) setTimeout(() => genCard(cardData), 1200)
document.addEventListener('click', e => { const b = e.target.closest('.sh a[target], [data-copy]'); if (b && cardData?.need) genCard(cardData); if (b && cardData) setTimeout(() => markShared(cardData), 2500) }, true)

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
  if (voiceMine() && !(isF(e.h) || isF(e.a))) return   // el usuario eligió oír solo a sus equipos
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
    const nlw = $('#live-wrap', doc), olw = $('#live-wrap'), nm = $('main', doc), om = $('main')
    // página de un partido: se renuevan el encabezado y el contenido, conservando qué equipo está viendo en la cancha
    if (!olw) {
      const nmh = $('.mh', doc), omh = $('.mh'), ng = $('.g3', doc), og = $('.g3'); if (!nmh || !omh || !ng || !og) return
      const awayOn = !!$('#pt-a')?.checked
      omh.innerHTML = nmh.innerHTML; og.innerHTML = ng.innerHTML
      if (awayOn && $('#pt-a')) $('#pt-a').checked = true
      if (doc.body.dataset.card) document.body.dataset.card = doc.body.dataset.card
      paintF(); return
    }
    if (!nlw || !nm || !om) return
    const open = new Set($$('details.mx[open]').map(x => x.dataset.id)), closed = new Set($$('details.lg:not([open])').map(x => x.dataset.k)), sc = $$('.lcs').map(x => x.scrollLeft)
    olw.innerHTML = nlw.innerHTML; om.innerHTML = nm.innerHTML
    $$('details.mx', om).forEach(x => { if (open.has(x.dataset.id)) x.open = true })
    $$('details.lg', om).forEach(x => { if (closed.has(x.dataset.k)) x.open = false })
    $$('.lcs').forEach((x, i) => { x.scrollLeft = sc[i] || 0 })
    $$('label[for^=f-]').forEach((l, i) => { const n = $$('label[for^=f-]', doc)[i]; if (n) l.innerHTML = n.innerHTML })
    const sub = $('.hrow .sub'), nsub = $('.hrow .sub', doc); if (sub && nsub) sub.textContent = nsub.textContent
    delete document.body.dataset.q; $$('.mx').forEach(x => { delete x.dataset.q })
    $$('[data-spchips] .chip').forEach(c => c.classList.toggle('on', c.dataset.sp === spSel)); $$('[data-chips] .chip').forEach(c => c.classList.toggle('on', c.dataset.lg === lgSel))
    paintFavs(); refresh(); marcarSliders(); mineBox(); paintF(); predPicks(); $$('details.mx[open] .pred[data-in]').forEach(p => predInit(p)); fillBets()
  } catch { /* se intenta en el próximo ciclo */ } finally { refreshing = false }
}
if (document.body.dataset.live) {
  let es, rt = 0
  const conectar = () => {
    try { es = new EventSource('/api/events'); es.onmessage = m => { let ev; try { ev = JSON.parse(m.data) } catch { return }; if (ev.type === 'goal' || ev.type === 'matchev') { onEvent(ev); window.__lpEvent?.(ev); clearTimeout(rt); rt = setTimeout(liveRefresh, 1500 + Math.random() * 6000) } else if (ev.type === 'post') { clearTimeout(rt); rt = setTimeout(liveRefresh, 1500 + Math.random() * 6000) } } } catch { /* sin avisos en vivo */ }
  }
  conectar()
  const tick = () => { if ($('.mx.lv') || $('.lc:not(.fin)') || $('.mh .st.lv')) liveRefresh(); setTimeout(tick, 40e3 + Math.random() * 25e3) }   // con un poco de azar para que miles de personas no pidan la página en el mismo segundo
  setTimeout(tick, 40e3 + Math.random() * 25e3)
}

// prueba del sonido y de los avisos: abre la página con ?probar=1 (gol, penal, tarjetas, entretiempo y final, uno tras otro)
if (/[?&]probar=/.test(location.search)) {
  const b = { h: 'Local', a: 'Visitante', gh: 1, ga: 0, imp: 1 }
  const demo = [{ type: 'matchev', kind: 'start', ...b }, { type: 'goal', team: 'Local', player: 'Jugador de prueba', min: 23, ...b }, { type: 'goal', team: 'Local', player: 'Jugador de prueba', min: 40, pen: true, ...b }, { type: 'matchev', kind: 'yellow', team: 'Visitante', player: 'Jugador de prueba', min: 44, ...b }, { type: 'matchev', kind: 'red', team: 'Visitante', player: 'Jugador de prueba', min: 61, ...b }, { type: 'matchev', kind: 'penmiss', team: 'Visitante', player: 'Jugador de prueba', min: 70, ...b }, { type: 'matchev', kind: 'ht', ...b }, { type: 'matchev', kind: 'end', ...b }]
  demo.forEach((e, i) => setTimeout(() => onEvent(e), 800 + i * 4500))
}

// barra inferior (celular): la hoja «Deportes» se cierra al tocar fuera o al elegir
document.addEventListener('click', e => { const d = $('.bmore[open]'); if (d && !d.contains(e.target)) d.open = false })

// escudo que no carga (ESPN no tiene la imagen de ese equipo): se cambia por las iniciales con el color del equipo
const crestOf = name => {
  const w = String(name || '').replace(/[/(),.]/g, ' ').split(/\s+/).filter(x => x && !/^(fc|cf|sc|ac|cd|fk|sk|afc|club|de|del|la|el|the|of|and|y|u\d+|w)$/i.test(x))
  let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360
  const s = document.createElement('span'); s.className = 'lo ini'; s.style.setProperty('--h', h); s.setAttribute('aria-hidden', 'true')
  s.textContent = (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); return s
}
document.addEventListener('error', e => { const i = e.target; if (i?.tagName === 'IMG' && i.dataset.n !== undefined && !i.dataset.x) { i.dataset.x = '1'; i.replaceWith(crestOf(i.dataset.n)) } }, true)
$$('img[data-n]').forEach(i => { if (i.complete && i.naturalWidth === 0 && !i.dataset.x) { i.dataset.x = '1'; i.replaceWith(crestOf(i.dataset.n)) } })

// ===== pronósticos con puntos (sin dinero) =====
const el = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids) if (k != null && k !== false) e.append(k); return e }
const PQ = { res: 'Resultado', score: 'Marcador exacto', tg: 'Total de goles', tc: 'Tarjetas', pen: '¿Habrá penal?', red: '¿Habrá tarjeta roja?' }
const pickText = (k, p, h, a) => k === 'res' ? ({ H: 'Gana ' + h, D: 'Empate', A: 'Gana ' + a })[p.res] : k === 'score' ? p.gh + ' - ' + p.ga : k === 'tg' ? (p.tg === 'o' ? 'Más de 2,5' : 'Menos de 2,5') : k === 'tc' ? (p.tc === 'o' ? 'Más de 4,5' : 'Menos de 4,5') : (p[k] === 's' ? 'Sí' : 'No')
const predInit = async (box = $('#pred')) => {
  if (!box) return
  let g; try { const r = await fetch('/api/pred/m/' + box.dataset.mid, { cache: 'no-store' }); if (!r.ok) return; g = await r.json() } catch { return }
  if (!g.on) return
  const h = box.dataset.h, a = box.dataset.a, pick = { ...g.pick }
  box.hidden = false; box.replaceChildren(el('h4', '', 'Tu pronóstico · gana puntos'))
  const tot = Object.values(g.dist).reduce((s, n) => s + n, 0)
  const comm = tot >= 3 ? el('div', 'pq', `La comunidad (${tot}): ${h} ${Math.round(g.dist.H * 100 / tot)}% · Empate ${Math.round(g.dist.D * 100 / tot)}% · ${a} ${Math.round(g.dist.A * 100 / tot)}%`) : null
  if (!g.open) {   // el partido ya empezó: se muestra lo que se pronosticó y cómo salió
    const keys = ['res', 'score', 'tg', 'tc', 'pen', 'red'].filter(k => k === 'score' ? pick.gh !== undefined : pick[k] !== undefined)
    if (!keys.length) { box.append(el('div', 'pq', 'No hiciste pronóstico para este partido.')); if (comm) box.append(comm); return }
    for (const k of keys) { const v = g.hit?.[k]; box.append(el('div', 'pd ' + (g.done ? (v === 1 ? 'hit1' : v === -1 ? 'hitv' : 'hit0') : ''), el('span', '', PQ[k] + ': ' + pickText(k, pick, h, a)), el('b', '', g.done ? (v === 1 ? '+' + g.points[k === 'score' ? 'score' : k] : v === -1 ? 'anulado' : '0') : 'en juego'))) }
    if (g.done) box.append(el('div', 'ok', 'Ganaste ' + g.pts + ' puntos en este partido.'))
    if (comm) box.append(comm); return
  }
  if (!g.me) { box.append(el('div', 'pq', 'Entra a tu cuenta de PLANETA para pronosticar y subir en el ranking.')); const l = el('a', 'go', 'Entrar'); l.href = '/'; l.style.display = 'block'; l.style.textAlign = 'center'; box.append(l); if (comm) box.append(comm); return }
  const group = (q, opts, key) => {
    box.append(el('div', 'pq', q)); const row = el('div', 'pr')
    for (const [v, t] of opts) { const b = el('button', pick[key] === v ? 'on' : '', t); b.type = 'button'; b.onclick = () => { pick[key] = pick[key] === v ? undefined : v; if (pick[key] === undefined) delete pick[key]; [...row.children].forEach((c, i) => c.classList.toggle('on', pick[key] === opts[i][0])); msg.textContent = '' }; row.append(b) }
    box.append(row)
  }
  const msg = el('div', 'ok')
  const fut = g.sport === 'futbol'
  group(fut ? PQ.res + ` (+${g.points.res})` : `¿Quién gana? (+${g.points.res})`, fut ? [['H', h], ['D', 'Empate'], ['A', a]] : [['H', h], ['A', a]], 'res')
  if (!fut) { const go = el('button', 'go', 'Guardar pronóstico'); go.type = 'button'; go.onclick = async () => { go.disabled = true; msg.textContent = ''; try { const r = await fetch('/api/pred/m/' + box.dataset.mid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pick: { res: pick.res } }) }), j = await r.json().catch(() => ({})); msg.textContent = r.ok ? 'Guardado ✓ Puedes cambiarlo hasta que empiece.' : (j.error || 'No se pudo guardar.') } catch { msg.textContent = 'Sin conexión. Intenta otra vez.' } go.disabled = false }; box.append(go, msg); if (comm) box.append(comm); return }
  box.append(el('div', 'pq', PQ.score + ` (+${g.points.score})`))
  const ih = el('input'), ia = el('input'); for (const i of [ih, ia]) { i.type = 'number'; i.min = 0; i.max = 20; i.inputMode = 'numeric'; i.setAttribute('aria-label', 'Goles') }
  ih.value = pick.gh ?? ''; ia.value = pick.ga ?? ''; ih.oninput = ia.oninput = () => { msg.textContent = '' }
  box.append(el('div', 'pr', ih, el('span', 'vs2', '-'), ia))
  group(PQ.tg + ` (+${g.points.tg})`, [['u', 'Menos de 2,5'], ['o', 'Más de 2,5']], 'tg')
  group(PQ.tc + ` (+${g.points.tc})`, [['u', 'Menos de 4,5'], ['o', 'Más de 4,5']], 'tc')
  group(PQ.pen + ` (+${g.points.pen})`, [['s', 'Sí'], ['n', 'No']], 'pen')
  group(PQ.red + ` (+${g.points.red})`, [['s', 'Sí'], ['n', 'No']], 'red')
  const go = el('button', 'go', 'Guardar pronóstico'); go.type = 'button'
  go.onclick = async () => {
    const body = { ...pick }; delete body.gh; delete body.ga
    if (ih.value !== '' && ia.value !== '') { body.gh = ih.value; body.ga = ia.value } else if (ih.value !== '' || ia.value !== '') { msg.textContent = 'Pon los goles de los dos equipos.'; return }
    go.disabled = true; msg.textContent = ''
    try { const r = await fetch('/api/pred/m/' + box.dataset.mid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pick: body }) }); const j = await r.json().catch(() => ({})); msg.textContent = r.ok ? 'Guardado ✓ Puedes cambiarlo hasta que empiece el partido.' : (j.error || 'No se pudo guardar.') } catch { msg.textContent = 'Sin conexión. Intenta otra vez.' }
    go.disabled = false
  }
  box.append(go, msg); if (comm) box.append(comm)
}
const predMine = async () => {
  const box = $('#pr-mine'); if (!box) return
  try {
    const r = await fetch('/api/pred/me', { cache: 'no-store' })
    if (r.status === 401) { box.replaceChildren('Entra a tu cuenta de PLANETA para ver tus pronósticos. ', Object.assign(el('a', 'pill', 'Entrar'), { href: '/' })); return }
    const d = await r.json(); box.replaceChildren()
    box.className = 'mine'; const st = (n, l, c) => { const b = el('b', '', String(n)); if (c) b.style.color = c; return el('div', '', b, el('span', '', l)) }
    box.append(el('div', 'st3', st(d.total.pts, 'Puntos', 'var(--ac)'), st(d.week, 'Esta semana'), st(d.total.ok, 'Aciertos', 'var(--win)'), st(d.total.fail, 'Fallos', '#e0566b')))
    if (!d.rows.length) box.append(el('div', 'empty', 'Todavía no has pronosticado. Abre un partido y elige.'))
    for (const x of d.rows) {
      const a = el('a', 'pd'); a.href = '/partido/' + (x.mid < 0 ? 'e' + -x.mid : 's' + x.mid)
      const sum = ['res', 'score'].filter(k => k === 'score' ? x.pick.gh !== undefined : x.pick[k] !== undefined).map(k => pickText(k, x.pick, x.home, x.away)).join(' · ')
      a.append(el('span', '', x.home + ' - ' + x.away + (sum ? ' · ' + sum : '')), el('b', '', x.done ? '+' + x.pts + ' · ' + x.ok + '✓ ' + x.fail + '✗' : 'pendiente')); box.append(a)
    }
  } catch { box.textContent = 'No se pudieron cargar tus pronósticos.' }
}
predInit(); predMine()

// botones 1-X-2 en cada partido de la lista: un clic guarda el resultado (conserva el resto del pronóstico)
const note = (t, sm) => { const old = $('.pt-toast'); if (old) old.replaceWith(); const d = el('div', 'pt-toast'); d.setAttribute('role', 'status'); d.append(el('span', '', el('b', '', t), sm ? el('small', '', sm) : null)); document.body.append(d); setTimeout(() => d.replaceWith(), 5000) }
const predPicks = async () => {
  const ids = $$('[data-qp]').map(q => q.dataset.qp); if (!ids.length) return
  try { const r = await fetch('/api/pred/picks?ids=' + ids.slice(0, 120).join(','), { cache: 'no-store' }); if (!r.ok) return; const m = await r.json(); $$('[data-qp]').forEach(q => $$('button', q).forEach(b => b.classList.toggle('on', b.dataset.v === m[q.dataset.qp]))) } catch { /* sin marcas */ }
}
document.addEventListener('click', async e => {
  const b = e.target.closest?.('.qp button'); if (!b) return
  e.preventDefault(); e.stopPropagation()
  const q = b.closest('.qp'), mid = q.dataset.qp, v = b.dataset.v
  try {
    const r = await fetch('/api/pred/m/' + mid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pick: { res: v }, merge: true }) }), j = await r.json().catch(() => ({}))
    if (r.status === 401) { note('Entra a tu cuenta de PLANETA para pronosticar', 'Es gratis y gana puntos en el ranking.'); return }
    if (!r.ok) { note(j.error || 'No se pudo guardar'); return }
    $$('button', q).forEach(x => x.classList.toggle('on', x === b)); note('Pronóstico guardado ✓', 'Abre el partido para sumar marcador, tarjetas y penal.')
    const bx = q.closest('details')?.querySelector('.pred[data-in]'); if (bx) predInit(bx)
  } catch { note('Sin conexión. Intenta otra vez.') }
})
document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details.mx') && d.open) { const p = d.querySelector('.pred'); if (p && !p.dataset.in) { p.dataset.in = '1'; predInit(p) } } }, true)
predPicks()

// ===== mis equipos: seguir, caja en la portada, voz solo de mis equipos y avisos al celular =====
const FKEY = 'portalTeams', nk = x => norm(x).replace(/[^a-z0-9]/g, '')
let follows = []; try { follows = JSON.parse(localStorage.getItem(FKEY) || '[]').filter(x => typeof x === 'string').slice(0, 30) } catch { follows = [] }
const saveF = () => { try { localStorage.setItem(FKEY, JSON.stringify(follows)) } catch { /* sin almacenamiento */ } }
const isF = x => !!x && follows.some(f => nk(f) === nk(x))
const voiceMine = () => { try { return localStorage.getItem('portalVoiceMine') === '1' } catch { return false } }
let meUser
const whoami = async () => { if (meUser !== undefined) return meUser; try { const r = await fetch('/api/me', { cache: 'no-store' }); meUser = r.ok ? (await r.json()).user || null : null } catch { meUser = null } return meUser }
const putF = (team, on) => fetch('/api/teams/follow', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team, on }) }).catch(() => {})
const paintF = () => {
  $$('[data-follow]').forEach(b => { const on = isF(b.dataset.follow); b.classList.toggle('on', on); b.textContent = (on ? '★ Siguiendo' : '☆ Seguir') + (b.dataset.s ? '' : ' ' + (b.dataset.l || b.dataset.follow)) })
  $$('details.mx').forEach(d => d.classList.toggle('ft', isF(d.dataset.hn) || isF(d.dataset.an)))
}
const mineBox = () => {
  const old = $('#mine'); if (old) old.remove()
  const main = $('#lista main'); if (!main || !follows.length) return
  const seen = new Set(), rows = []
  $$('details.mx', main).forEach(d => { if ((isF(d.dataset.hn) || isF(d.dataset.an)) && !seen.has(d.dataset.id)) { seen.add(d.dataset.id); rows.push(d) } })
  const sec = el('section', 'bk mine'); sec.id = 'mine'; sec.dataset.b = 'mine'
  sec.append(el('h2', 'sph', 'Mis equipos · ' + rows.length))
  const bar = el('div', 'mh2'), bell = el('button', 'pb', '🔔 Avisos en el celular'), vz = el('button', 'pb', voiceMine() ? '🔊 Voz: solo mis equipos' : '🔊 Voz: todos los partidos')
  bell.type = vz.type = 'button'; bell.dataset.act = 'alerts'; vz.dataset.act = 'voice'; bar.append(bell, vz); sec.append(bar)
  const box = el('div', 'lg flat'), gr = el('div', 'gr')
  if (rows.length) rows.forEach(d => gr.append(d.cloneNode(true))); else gr.append(el('div', 'empty', 'Tus equipos (' + follows.slice(0, 4).join(', ') + (follows.length > 4 ? '…' : '') + ') no juegan hoy.'))
  box.append(gr); sec.append(box); main.prepend(sec); paintF()
}
const enableAlerts = async () => {
  if (!(await whoami())) { note('Entra a tu cuenta de PLANETA', 'Los avisos al celular se guardan en tu cuenta.'); return }
  try {
    const P = await import('./push')
    if (P.needsInstall()) { note('En iPhone, instala la web primero', 'Compártela y elige «Agregar a pantalla de inicio».'); return }
    const st = await P.pushState(); if (!st.supported) { note('Este navegador no permite avisos'); return }
    if (!st.on) await P.enablePush(false)
    await Promise.all(follows.map(t => putF(t, true)))
    note('Avisos activados ✓', 'Gol, roja, inicio y final de tus equipos llegan al celular.')
  } catch (e) { note(e.message || 'No se pudo activar los avisos') }
}
document.addEventListener('click', e => {
  const f = e.target.closest?.('[data-follow]')
  if (f) {
    e.preventDefault(); e.stopPropagation(); const t = f.dataset.follow, on = !isF(t)
    if (on) { if (follows.length >= 30) { note('Máximo 30 equipos'); return } follows.push(t) } else follows = follows.filter(x => nk(x) !== nk(t))
    saveF(); putF(t, on); paintF(); mineBox(); return
  }
  const a = e.target.closest?.('[data-act]'); if (!a) return
  if (a.dataset.act === 'alerts') enableAlerts()
  else if (a.dataset.act === 'voice') { try { localStorage.setItem('portalVoiceMine', voiceMine() ? '0' : '1') } catch { /* nada */ } a.textContent = voiceMine() ? '🔊 Voz: solo mis equipos' : '🔊 Voz: todos los partidos' }
})
// con sesión, los equipos de la cuenta y los de este navegador se unen
let synced = false; try { synced = !!sessionStorage.getItem('pf'); sessionStorage.setItem('pf', '1') } catch { /* nada */ }
;(synced ? Promise.resolve(null) : whoami()).then(async u => {
  if (!u) return
  try { const r = await fetch('/api/teams/follow', { cache: 'no-store' }); if (!r.ok) return; const { teams } = await r.json(); let ch = false
    for (const t of teams) if (!isF(t) && follows.length < 30) { follows.push(t); ch = true }
    for (const t of follows) if (!teams.some(x => nk(x) === nk(t))) putF(t, true)
    if (ch) { saveF(); paintF(); mineBox() } } catch { /* sin sincronizar */ }
})
paintF(); mineBox()

// apuestas (afiliados): casas permitidas en el país de la persona (las decide el servidor). +18 y juego responsable siempre visibles.
let betsP = null
const escB = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function fillBets() {
  const slots = $$('[data-bet]'); if (!slots.length) return
  betsP ||= fetch('/api/bets?tz=' + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || '')).then(r => r.json()).catch(() => ({ on: false }))
  betsP.then(b => { if (!b.on || !b.houses?.length) return
    const html = b.houses.slice(0, 2).map(h => `<button type="button" class="bet-go" data-go="${escB(h.id)}" style="--bc:${escB(h.color)}">Apostar en ${escB(h.name)}</button>`).join('') + '<span class="bet-18">+18 · Juega con responsabilidad</span>'
    slots.forEach(el => { if (!el.childElementCount) el.innerHTML = html }) })
}
document.addEventListener('click', e => { const b = e.target.closest?.('[data-go]'); if (!b) return; e.preventDefault(); e.stopPropagation()
  const mid = b.closest('[data-bet]')?.dataset.bet || ''; window.open('/ir/apuesta/' + encodeURIComponent(b.dataset.go) + (mid ? '?m=' + encodeURIComponent(mid) : ''), '_blank', 'noopener') }, true)
fillBets()

// ---- cancha en vivo: animación ILUSTRATIVA en perspectiva (camisetas con los colores del escudo y balón), con goles, tarjetas y estado REALES ----
// Liviana: un paso cada 1,6 s con transiciones CSS (lo dibuja la tarjeta gráfica); se pausa si la pestaña no está a la vista.
function livePitch() {
  const d = $('#lp'), mh = $('.mh'); if (!d || !mh || $('.lp')) return
  const W = 105, H = 68, VW = 1000, VH = 520, esc2 = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  // perspectiva real (las líneas siguen rectas): y = 0 es el lado lejano, y = 68 el cercano
  const D = 95, NEAR = 505, KX = 8.6
  // y en pantalla: se reparte entre el borde lejano y el cercano según la perspectiva
  const wFar = D / (D + H), sy = w => 48 + (NEAR - 48) * (w - wFar) / (1 - wFar)
  const proj = (x, y) => { const w = D / (D + (H - y)); return [VW / 2 + (x - W / 2) * KX * w, sy(w), w] }
  const pt = (x, y) => { const [a, b] = proj(x, y); return a.toFixed(1) + ',' + b.toFixed(1) }
  const quad = (x1, y1, x2, y2) => `${pt(x1, y1)} ${pt(x2, y1)} ${pt(x2, y2)} ${pt(x1, y2)}`
  const circ = (cx, cy, r) => Array.from({ length: 36 }, (_, k) => { const a = k / 36 * 2 * Math.PI; return pt(cx + r * Math.cos(a), cy + r * Math.sin(a)) }).join(' ')
  let st = d.dataset.st, gh = +d.dataset.gh, ga = +d.dataset.ga, el = +d.dataset.el, t0 = Date.now()
  const F = [[5, 34], [18, 10], [16, 26], [16, 42], [18, 58], [33, 12], [31, 27], [31, 41], [33, 56], [45, 26], [45, 42]]
  const P = [...F.map(([x, y], k) => ({ t: 0, n: k + 1, bx: x, by: y, x, y })), ...F.map(([x, y], k) => ({ t: 1, n: k + 1, bx: W - x, by: H - y, x: W - x, y: H - y }))]
  const crest = u => u ? `<img src="${esc2(u)}" alt="">` : ''
  // camiseta (frente) en una caja de 40×40, centrada abajo en (0,0): cuerpo, mangas, cuello, número, brillo
  const shirt = (i, num) => `<g class="pl" data-i="${i}"><ellipse cx="0" cy="1" rx="13" ry="3.6" fill="#0006"/><g transform="translate(-20,-40)">
    <path class="jb" d="M13 3 L17 1.5 Q20 5 23 1.5 L27 3 L37 9 L33 17 L29 14.5 L29 37 Q20 39 11 37 L11 14.5 L7 17 L3 9 Z" stroke="#0005" stroke-width=".8"/>
    <path class="jc" d="M17 1.5 Q20 5 23 1.5 Q20 7.5 17 1.5 Z"/><path class="js" d="M3 9 L7 17 L9 15.8 L5.2 7.8 Z M37 9 L33 17 L31 15.8 L34.8 7.8 Z"/>
    <path d="M13 3 L17 1.5 Q20 5 23 1.5 L27 3 L29 14.5 L29 37 Q20 39 11 37 L11 14.5 Z" fill="url(#lpsh)"/>
    <text x="20" y="28" text-anchor="middle" font-size="12" font-weight="800" font-family="system-ui,sans-serif" class="jn">${num}</text></g></g>`
  const box = document.createElement('section'); box.className = 'lp'
  const lines = `<polygon points="${quad(0, 0, W, H)}" fill="none"/><line x1="${pt(W / 2, 0).split(',')[0]}" y1="${pt(W / 2, 0).split(',')[1]}" x2="${pt(W / 2, H).split(',')[0]}" y2="${pt(W / 2, H).split(',')[1]}"/>
    <polygon points="${circ(W / 2, H / 2, 9.15)}" fill="none"/><polygon points="${quad(0, 13.85, 16.5, 54.15)}" fill="none"/><polygon points="${quad(W - 16.5, 13.85, W, 54.15)}" fill="none"/>
    <polygon points="${quad(0, 24.85, 5.5, 43.15)}" fill="none"/><polygon points="${quad(W - 5.5, 24.85, W, 43.15)}" fill="none"/>`
  const stripes = Array.from({ length: 10 }, (_, k) => `<polygon points="${quad(k * 10.5, 0, (k + 1) * 10.5, H)}" fill="${k % 2 ? '#1d6b39' : '#22773f'}"/>`).join('')
  const goal = x => { const a = pt(x, 30.34), b = pt(x, 37.66), [ax, ay] = a.split(',').map(Number), [bx2, by2] = b.split(',').map(Number), w = proj(x, 34)[2]; return `<path d="M${ax},${ay} L${ax},${ay - 22 * w} L${bx2},${by2 - 22 * w} L${bx2},${by2}" fill="#ffffff22" stroke="#fff" stroke-width="${2.2 * w}"/>` }
  box.innerHTML = `<div class="lp-h"><span class="lp-t">${crest(d.dataset.hl)}<span>${esc2(d.dataset.hn)}</span></span><span class="lp-s"><b>${gh} - ${ga}</b><small></small></span><span class="lp-t a"><span>${esc2(d.dataset.an)}</span>${crest(d.dataset.al)}</span></div>
  <div class="lp-f"><svg viewBox="0 0 ${VW} ${VH}" aria-hidden="true"><defs>
  <linearGradient id="lpsh" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
  <radialGradient id="lpbl" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#e9e9e9"/><stop offset="1" stop-color="#9a9a9a"/></radialGradient>
  <linearGradient id="lpsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1f14"/><stop offset="1" stop-color="#123522"/></linearGradient></defs>
  <rect width="${VW}" height="${VH}" fill="url(#lpsky)"/>${stripes}<g stroke="#ffffffc0" stroke-width="2" fill="none">${lines}</g>${goal(0)}${goal(W)}
  ${P.map((p, i) => shirt(i, p.n)).join('')}
  <g class="bl"><ellipse cx="0" cy="2" rx="7" ry="2.2" fill="#0007"/><g class="bs"><circle r="7" cy="-6" fill="url(#lpbl)" stroke="#333" stroke-width=".6"/>
  <path d="M0,-9.2 L2.6,-7.3 L1.6,-4.3 L-1.6,-4.3 L-2.6,-7.3 Z" fill="#1b1b1b"/><path d="M-5.6,-10 L-3.6,-9.6 L-4.2,-7.2 L-6.6,-7.6 Z M5.6,-10 L3.6,-9.6 L4.2,-7.2 L6.6,-7.6 Z M-4.4,-1.8 L-2.6,-2.6 L-1.4,-0.6 L-3.4,0.2 Z M4.4,-1.8 L2.6,-2.6 L1.4,-0.6 L3.4,0.2 Z" fill="#1b1b1b"/></g></g></svg>
  <div class="lp-ov"><div><b></b><span></span></div></div></div><div class="lp-c">Animación ilustrativa · goles, tarjetas y marcador reales</div>`
  mh.after(box)
  const dots = $$('.pl', box), ball = $('.bl', box), spin = $('.bs', box), ov = $('.lp-ov', box), small = $('.lp-s small', box), score = $('.lp-s b', box)
  // colores de camiseta: el color principal de cada escudo (si el escudo no se puede leer, azul y rojo); si se parecen, el visitante va de blanco
  const lum = c => { const [r, g, b] = c.match(/\w\w/g).map(h => parseInt(h, 16)); return 0.299 * r + 0.587 * g + 0.114 * b }
  const dist = (a, b) => { const x = a.match(/\w\w/g).map(h => parseInt(h, 16)), y = b.match(/\w\w/g).map(h => parseInt(h, 16)); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }
  const crestColor = u => new Promise(ok => { if (!u) return ok(null); const im = new Image(); im.crossOrigin = 'anonymous'; im.onerror = () => ok(null)
    im.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 24; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 24, 24); const px = g.getImageData(0, 0, 24, 24).data, bins = {}
      for (let k = 0; k < px.length; k += 4) { if (px[k + 3] < 200) continue; const r = px[k], gg = px[k + 1], b = px[k + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (mx < 40 || (mn > 215) || mx - mn < 40) continue
        const key = (r >> 5) + ',' + (gg >> 5) + ',' + (b >> 5); (bins[key] ||= [0, 0, 0, 0]); bins[key][0] += r; bins[key][1] += gg; bins[key][2] += b; bins[key][3]++ }
      const best = Object.values(bins).sort((a, b) => b[3] - a[3])[0]; if (!best || best[3] < 12) return ok(null)
      ok('#' + best.slice(0, 3).map(v => Math.round(v / best[3]).toString(16).padStart(2, '0')).join('')) } catch { ok(null) } }; im.src = u })
  const paint = (hc, ac) => P.forEach((p, i) => { const g = dots[i], c = p.n === 1 ? (p.t ? '#2b2b2b' : '#f2c230') : p.t ? ac : hc, light = lum(c) > 150
    $('.jb', g).setAttribute('fill', c); $('.jc', g).setAttribute('fill', light ? '#222' : '#fff'); $('.js', g).setAttribute('fill', light ? '#222' : '#fff'); $('.jn', g).setAttribute('fill', light ? '#1b1b1b' : '#fff') })
  paint('#2f6fe0', '#d93a3a')
  Promise.all([crestColor(d.dataset.hl), crestColor(d.dataset.al)]).then(([hc, ac]) => { hc ||= '#2f6fe0'; ac ||= '#d93a3a'; if (dist(hc, ac) < 90) ac = lum(hc) > 170 ? '#1f2a44' : '#f3f3f3'; paint(hc, ac) })
  const put = (g, x, y, k = 1.75) => { const [a, b, w] = proj(x, y); g.style.transform = `translate(${a.toFixed(1)}px,${b.toFixed(1)}px) scale(${(w * k).toFixed(3)})` }
  let bx = W / 2, by = H / 2, own = 0, holder = 9, busy = 0, rot = 0
  const draw = () => { P.forEach((p, i) => put(dots[i], p.x, p.y)); put(ball, bx, by, 1.6); rot += 160; spin.style.transform = `rotate(${rot}deg)` }
  const minute = () => st === 'HT' ? 'ENTRETIEMPO' : st === 'FT' ? 'FINAL' : '● EN VIVO · ' + Math.min(el + Math.floor((Date.now() - t0) / 60000), el > 90 ? 130 : 95) + "'"
  const step = () => {
    small.textContent = minute(); if (document.hidden || busy || st === 'HT' || st === 'FT') return
    const dir = own ? -1 : 1, mates = P.map((p, i) => [p, i]).filter(([p, i]) => p.t === own && i !== holder)
    if (Math.random() < 0.22) { own = 1 - own; holder = P.map((p, i) => [p, i]).filter(([p]) => p.t === own).sort((a, b) => Math.hypot(a[0].x - bx, a[0].y - by) - Math.hypot(b[0].x - bx, b[0].y - by))[0][1] }
    else { const ahead = mates.filter(([p]) => (p.x - bx) * dir > -6 && Math.abs(p.y - by) < 30 && p.n !== 1); const pool = ahead.length ? ahead : mates; holder = pool[Math.floor(Math.random() * pool.length)][1] }
    const h = P[holder]; bx = Math.max(2, Math.min(W - 2, h.x + (Math.random() - .5) * 4)); by = Math.max(2, Math.min(H - 2, h.y + (Math.random() - .5) * 4))
    const shift = (bx - W / 2) * 0.45
    P.forEach((p, i) => { const pull = i === holder ? 1 : 0.18, gk = p.n === 1 ? 0.1 : 1; p.x = Math.max(2, Math.min(W - 2, p.bx + (shift + (bx - p.bx - shift) * pull) * gk + (Math.random() - .5) * 3)); p.y = Math.max(2, Math.min(H - 2, p.by + (by - p.by) * pull * 0.6 * gk + (Math.random() - .5) * 3)) })
    P[holder].x = bx - dir * 1.4; P[holder].y = by - 0.6
    draw()
  }
  const show = (big, line, ms) => { $('b', ov).textContent = big; $('span', ov).textContent = line; ov.classList.add('on'); setTimeout(() => ov.classList.remove('on'), ms) }
  const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()
  const onReal = e => {
    if (!(same(e.h, d.dataset.h) && same(e.a, d.dataset.a))) return
    if (e.type === 'goal') {
      const home = same(e.team, d.dataset.h); busy = 1; own = home ? 0 : 1
      bx = home ? W - 0.3 : 0.3; by = H / 2 + (Math.random() - .5) * 5; draw()
      if (e.gh != null) { gh = e.gh; ga = e.ga } else if (home) gh++; else ga++
      score.textContent = gh + ' - ' + ga; show('¡GOL!', (e.player ? e.player + ' ' : '') + (e.min ? e.min + "'" : '') + ' · ' + (home ? d.dataset.hn : d.dataset.an), 4500)
      setTimeout(() => { busy = 0; bx = W / 2; by = H / 2; own = home ? 1 : 0; holder = home ? 20 : 9; P.forEach(p => { p.x = p.bx; p.y = p.by }); draw() }, 3200)
    } else if (e.kind === 'yellow' || e.kind === 'red') show(e.kind === 'red' ? '🟥 Roja' : '🟨 Amarilla', (e.player || '') + (e.min ? ' ' + e.min + "'" : '') + ' · ' + (same(e.team, d.dataset.h) ? d.dataset.hn : d.dataset.an), 3500)
    else if (e.kind === 'ht') { st = 'HT'; P.forEach(p => { p.x = p.bx; p.y = p.by }); bx = W / 2; by = H / 2; draw(); show('Entretiempo', '', 2500) }
    else if (e.kind === 'resume') { st = '2H'; el = 46; t0 = Date.now() }
    else if (e.kind === 'end') { st = 'FT'; show('Final', gh + ' - ' + ga, 6000) }
    small.textContent = minute()
  }
  window.__lpEvent = onReal
  draw(); small.textContent = minute(); setInterval(step, 1600)
}
livePitch()

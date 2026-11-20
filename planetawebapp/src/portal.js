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
    { const nd = $('#lp', doc); if (nd && window.__lpScore) window.__lpScore(nd.dataset.id, +nd.dataset.gh, +nd.dataset.ga) }
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
    const keepLp = $('.lp'); keepLp?.remove()
    olw.innerHTML = nlw.innerHTML; om.innerHTML = nm.innerHTML
    if (keepLp) { const nd = $('#lp'); if (nd && nd.dataset.id === keepLp.dataset.id) nd.after(keepLp); else livePitch() } else livePitch()
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
const mineEv = ev => { const mm = $('#mm'); if (!mm) return true
  const nT2 = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|cf|sc|ac|cd|club|de|the)\b/g, '').replace(/[^a-z0-9]/g, '')
  const eq = (x, y) => { x = nT2(x); y = nT2(y); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }
  return eq(ev.h, mm.dataset.h) || eq(ev.a, mm.dataset.a) }
if (document.body.dataset.live) {
  let es, rt = 0
  const conectar = () => {
    try { es = new EventSource('/api/events'); es.onmessage = m => { let ev; try { ev = JSON.parse(m.data) } catch { return }; if (ev.type === 'goal' || ev.type === 'matchev') { if (!mineEv(ev)) return; onEvent(ev); window.__lpEvent?.(ev); clearTimeout(rt); rt = setTimeout(liveRefresh, 1500 + Math.random() * 6000) } else if (ev.type === 'post') { clearTimeout(rt); rt = setTimeout(liveRefresh, 1500 + Math.random() * 6000) } } } catch { /* sin avisos en vivo */ }
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

// ---- cancha en vivo: animación ILUSTRATIVA en perspectiva (camisetas con los colores del escudo, nombres y formación reales si hay alineación) ----
// Jugadas variadas (toques, ataque por banda y centro, córner, saque de banda, tiro atajado o desviado, saque de arco), un paso cada 2,4 s.
// Goles, tarjetas, marcador y estado son REALES (avisos en vivo). Se pausa si la pestaña no está a la vista.
function livePitch() {
  const d = $('#lp'); if (!d || $('.lp')) return
  const W = 105, H = 68, VW = 1000, VH = 500, esc2 = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  // perspectiva real (líneas rectas): y = 0 lado lejano, y = 68 lado cercano
  const D = 130, KX = 9.35, wFar = D / (D + H), sy = w => 40 + (488 - 40) * (w - wFar) / (1 - wFar)
  const proj = (x, y) => { const w = D / (D + (H - y)); return [VW / 2 + (x - W / 2) * KX * w, sy(w), w] }
  const pt = (x, y) => { const [a, b] = proj(x, y); return a.toFixed(1) + ',' + b.toFixed(1) }
  const quad = (x1, y1, x2, y2) => `${pt(x1, y1)} ${pt(x2, y1)} ${pt(x2, y2)} ${pt(x1, y2)}`
  const circ = (cx, cy, r) => Array.from({ length: 36 }, (_, k) => { const a = k / 36 * 2 * Math.PI; return pt(cx + r * Math.cos(a), cy + r * Math.sin(a)) }).join(' ')
  const live = ['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'HT'].includes(d.dataset.st)
  let st = d.dataset.st, gh = +d.dataset.gh, ga = +d.dataset.ga, el = +d.dataset.el, t0 = Date.now()
  // formación real (p. ej. 4-3-3) o 4-4-2; el local defiende la izquierda
  const lines = f => { const a = String(f || '').split('-').map(Number).filter(n => n > 0); return a.reduce((x, y) => x + y, 0) === 10 ? a : [4, 4, 2] }
  const spots = f => { const L = lines(f), out = [[5, 34]]; L.forEach((k, li) => { const x = 16 + li * (31 / Math.max(1, L.length - 1)); for (let q = 0; q < k; q++) out.push([x, H * (q + 1) / (k + 1)]) }); return out }
  let hp = [], ap = []; try { hp = JSON.parse(d.dataset.hp || '[]'); ap = JSON.parse(d.dataset.ap || '[]') } catch { /* sin alineación */ }
  const P = [...spots(d.dataset.hf).map(([x, y], k) => ({ t: 0, n: hp[k]?.[0] || k + 1, nm: hp[k]?.[1] || '', gk: !k, bx: x, by: y, x, y })),
    ...spots(d.dataset.af).map(([x, y], k) => ({ t: 1, n: ap[k]?.[0] || k + 1, nm: ap[k]?.[1] || '', gk: !k, bx: W - x, by: H - y, x: W - x, y: H - y }))]
  const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d1a074']
  const shirt = (i, p) => `<g class="pl" data-i="${i}"><ellipse cx="0" cy="1" rx="10" ry="3.2" fill="#0007"/><g class="fig">
    <rect class="jk" x="-5" y="-13" width="4" height="12" rx="1"/><rect class="jk" x="1" y="-13" width="4" height="12" rx="1"/><rect x="-5.6" y="-2.4" width="4.8" height="2.6" rx="1" fill="#111"/><rect x="0.8" y="-2.4" width="4.8" height="2.6" rx="1" fill="#111"/>
    <rect class="jo" x="-6.5" y="-19.5" width="13" height="8" rx="1.6"/>
    <rect x="-10.5" y="-32" width="3.4" height="12" rx="1.6" fill="${SKIN[i % 6]}"/><rect x="7.1" y="-32" width="3.4" height="12" rx="1.6" fill="${SKIN[i % 6]}"/>
    <path class="jb" d="M-7.5 -33 Q0 -35.5 7.5 -33 L10.8 -30 L8.6 -26 L7 -27 L7 -18.5 L-7 -18.5 L-7 -27 L-8.6 -26 L-10.8 -30 Z" stroke="#0005" stroke-width=".6"/>
    <path d="M-7.5 -33 Q0 -35.5 7.5 -33 L7 -18.5 L-7 -18.5 Z" fill="url(#lpsh)"/>
    <text x="0" y="-22" text-anchor="middle" font-size="7.5" font-weight="800" font-family="system-ui,sans-serif" class="jn">${esc2(p.n)}</text>
    <circle cy="-39" r="5.2" fill="${SKIN[i % 6]}"/><path d="M-5.2 -40 Q0 -47 5.2 -40 Q3 -43 0 -43 Q-3 -43 -5.2 -40 Z" fill="#2a1d14"/><g class="bd" transform="translate(9,-40)"></g></g>
    ${p.nm ? `<text class="nm" y="11" text-anchor="middle" font-size="8.5" font-weight="700" font-family="system-ui,sans-serif" fill="#fff" stroke="#0009" stroke-width="2.4" paint-order="stroke">${esc2(p.nm)}</text>` : ''}</g>`
  const LITE = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4
  const box = document.createElement('section'); box.className = 'lp' + (LITE ? ' lite' : ''); box.dataset.id = d.dataset.id
  const lns = `<polygon points="${quad(0, 0, W, H)}"/><polyline points="${pt(W / 2, 0)} ${pt(W / 2, H)}"/><polygon points="${circ(W / 2, H / 2, 9.15)}"/>
    <polygon points="${quad(0, 13.85, 16.5, 54.15)}"/><polygon points="${quad(W - 16.5, 13.85, W, 54.15)}"/><polygon points="${quad(0, 24.85, 5.5, 43.15)}"/><polygon points="${quad(W - 5.5, 24.85, W, 43.15)}"/>`
  const stripes = Array.from({ length: 10 }, (_, k) => `<polygon points="${quad(k * 10.5, 0, (k + 1) * 10.5, H)}" fill="${k % 2 ? '#1d6b39' : '#22773f'}"/>`).join('')
  const goal = x => { const [ax, ay] = proj(x, 30.34), [bx2, by2] = proj(x, 37.66), w = proj(x, 34)[2]; return `<path d="M${ax},${ay} L${ax},${ay - 22 * w} L${bx2},${by2 - 22 * w} L${bx2},${by2}" fill="#ffffff22" stroke="#fff" stroke-width="${2.2 * w}"/>` }
  const flags = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => { const [a, b, w] = proj(x, y); return `<path d="M${a},${b} L${a},${b - 16 * w} L${a + 7 * w},${b - 13 * w} L${a},${b - 10 * w}" fill="#ffd34d" stroke="#fff" stroke-width="${w}"/>` }).join('')
  const head = d.dataset.url && !$('.mh') ? `<div class="lp-hd">Partido principal · ${esc2(d.dataset.lg)}<a href="${esc2(d.dataset.url)}">Ver el partido ›</a></div>` : ''
  let hs = [], as2 = [], evs = []; try { hs = JSON.parse(d.dataset.hs || '[]'); as2 = JSON.parse(d.dataset.as || '[]'); evs = JSON.parse(d.dataset.ev || '[]') } catch { /* sin datos */ }
  const xi = (title, list, subs) => `<aside class="lp-x"><h4>Titulares</h4>${list.length ? `<ol>${list.map(x => `<li><b>${esc2(String(x[0]).padStart(2, '0'))}</b><span>${esc2(x[2] || x[1])}</span></li>`).join('')}</ol>` : '<p class="na">La alineación se publica cerca del inicio del partido.</p>'}
    ${subs.length ? `<h5>Suplentes</h5><div class="sbs">${subs.map(x => `<span>${esc2(x[0])}. ${esc2(x[1])}</span>`).join('')}</div>` : ''}</aside>`
  const teamHd = (u, nm, side) => `<div class="lp-tm${side ? ' a' : ''}">${u ? `<img src="${esc2(u)}" alt="">` : '<span class="ph"></span>'}<div><b>${esc2(nm)}</b><small>${esc2(d.dataset.cty || d.dataset.lg || '')}</small></div></div>`
  const plat = (() => { const [ax, ay] = proj(0, H), [bx2, by2] = proj(W, H); return `<polygon points="${ax},${ay} ${bx2},${by2} ${bx2 - 4},${by2 + 16} ${ax + 4},${ay + 16}" fill="#0e3a20"/><polygon points="${ax + 4},${ay + 16} ${bx2 - 4},${by2 + 16} ${bx2 - 10},${by2 + 22} ${ax + 10},${ay + 22}" fill="#0006"/>` })()
  box.innerHTML = `${head}<div class="lp-g">${xi('h', hp, hs)}<div class="lp-m">
  <div class="lp-top">${teamHd(d.dataset.hl, d.dataset.hn, 0)}<div class="lp-sc"><b>${live ? gh + '<i></i>' + ga : 'VS'}</b><small></small></div>${teamHd(d.dataset.al, d.dataset.an, 1)}</div>
  <div class="lp-tl"></div>
  <div class="lp-f"><svg viewBox="0 0 ${VW} ${VH + 24}" aria-hidden="true"><defs>
  <linearGradient id="lpsh" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
  <radialGradient id="lpbl" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#e9e9e9"/><stop offset="1" stop-color="#9a9a9a"/></radialGradient></defs>
  ${plat}${stripes}<g stroke="#ffffffc0" stroke-width="2" fill="none">${lns}</g>${goal(0)}${goal(W)}${flags}
  ${P.map((p, i) => shirt(i, p)).join('')}
  <g class="pl rf"><ellipse cx="0" cy="1" rx="10" ry="3.2" fill="#0007"/><g class="fig">
    <rect x="-5" y="-13" width="4" height="12" rx="1" fill="#111"/><rect x="1" y="-13" width="4" height="12" rx="1" fill="#111"/><rect x="-6.5" y="-19.5" width="13" height="8" rx="1.6" fill="#111"/>
    <g class="ar-dn"><rect x="-10.5" y="-32" width="3.4" height="12" rx="1.6" fill="#e0ac69"/><rect x="7.1" y="-32" width="3.4" height="12" rx="1.6" fill="#e0ac69"/></g>
    <g class="ar-up"><rect x="-11" y="-50" width="3.4" height="18" rx="1.6" fill="#e0ac69"/><rect x="7.6" y="-50" width="3.4" height="18" rx="1.6" fill="#e0ac69"/></g>
    <path d="M-7.5 -33 Q0 -35.5 7.5 -33 L10.8 -30 L8.6 -26 L7 -27 L7 -18.5 L-7 -18.5 L-7 -27 L-8.6 -26 L-10.8 -30 Z" fill="#161616" stroke="#f2c230" stroke-width=".8"/>
    <circle cy="-39" r="5.2" fill="#e0ac69"/><path d="M-5.2 -40 Q0 -47 5.2 -40 Q3 -43 0 -43 Q-3 -43 -5.2 -40 Z" fill="#222"/>
    <g class="rcard"><rect x="7" y="-52" width="3.4" height="18" rx="1.6" fill="#e0ac69"/><rect class="rcc" x="5.5" y="-63" width="8" height="11" rx="1.2" fill="#f4d03f" stroke="#0006" stroke-width=".5"/></g></g>
    <text class="nm" y="11" text-anchor="middle" font-size="8.5" font-weight="700" font-family="system-ui,sans-serif" fill="#f2c230" stroke="#0009" stroke-width="2.4" paint-order="stroke">Árbitro</text></g>
  <g class="bl"><ellipse cx="0" cy="2" rx="7" ry="2.2" fill="#0007"/><g class="bs"><circle r="7" cy="-6" fill="url(#lpbl)" stroke="#333" stroke-width=".6"/>
  <path d="M0,-9.2 L2.6,-7.3 L1.6,-4.3 L-1.6,-4.3 L-2.6,-7.3 Z" fill="#1b1b1b"/><path d="M-5.6,-10 L-3.6,-9.6 L-4.2,-7.2 L-6.6,-7.6 Z M5.6,-10 L3.6,-9.6 L4.2,-7.2 L6.6,-7.6 Z M-4.4,-1.8 L-2.6,-2.6 L-1.4,-0.6 L-3.4,0.2 Z M4.4,-1.8 L2.6,-2.6 L1.4,-0.6 L3.4,0.2 Z" fill="#1b1b1b"/></g></g></svg>
  <div class="lp-ov"><div><b></b><span></span></div></div></div>
  <div class="lp-c">${live ? 'Animación ilustrativa · goles, tarjetas y marcador reales' : 'Así forman los equipos · empieza a las ' + esc2(d.dataset.ko)}</div></div>${xi('a', ap, as2)}</div>`
  ;($('.mh') || d).after(box)
  const dots = $$('.pl', box), ball = $('.bl', box), spin = $('.bs', box), ov = $('.lp-ov', box), small = $('.lp-sc small', box), score = $('.lp-sc b', box), tl = $('.lp-tl', box)
  // colores de camiseta desde el escudo (si no se puede leer: azul y rojo; si se parecen, el visitante cambia)
  const lum = c => { const [r, g, b] = c.match(/\w\w/g).map(h => parseInt(h, 16)); return 0.299 * r + 0.587 * g + 0.114 * b }
  const dist = (a, b) => { const x = a.match(/\w\w/g).map(h => parseInt(h, 16)), y = b.match(/\w\w/g).map(h => parseInt(h, 16)); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }
  const crestColor = u => new Promise(ok => { if (!u) return ok(null); const im = new Image(); im.crossOrigin = 'anonymous'; im.onerror = () => ok(null)
    im.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 24; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 24, 24); const px = g.getImageData(0, 0, 24, 24).data, bins = {}
      for (let k = 0; k < px.length; k += 4) { if (px[k + 3] < 200) continue; const r = px[k], gg = px[k + 1], b = px[k + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (mx < 40 || mn > 215 || mx - mn < 40) continue
        const key = (r >> 5) + ',' + (gg >> 5) + ',' + (b >> 5); (bins[key] ||= [0, 0, 0, 0]); bins[key][0] += r; bins[key][1] += gg; bins[key][2] += b; bins[key][3]++ }
      const best = Object.values(bins).sort((a, b) => b[3] - a[3])[0]; if (!best || best[3] < 12) return ok(null)
      ok('#' + best.slice(0, 3).map(v => Math.round(v / best[3]).toString(16).padStart(2, '0')).join('')) } catch { ok(null) } }; im.src = u })
  const paint = (hc, ac) => P.forEach((p, i) => { const g = dots[i], c = p.gk ? (p.t ? '#2b2b2b' : '#f2c230') : p.t ? ac : hc, light = lum(c) > 150, sh = light ? '#26324a' : '#f2f2f2'
    $('.jb', g).setAttribute('fill', c); $('.jo', g).setAttribute('fill', sh); $$('.jk', g).forEach(k => k.setAttribute('fill', c)); $('.jn', g).setAttribute('fill', light ? '#1b1b1b' : '#fff') })
  paint('#2f6fe0', '#d93a3a')
  Promise.all([crestColor(d.dataset.hl), crestColor(d.dataset.al)]).then(([hc, ac]) => { hc ||= '#2f6fe0'; ac ||= '#d93a3a'; if (dist(hc, ac) < 90) ac = lum(hc) > 170 ? '#1f2a44' : '#f3f3f3'; paint(hc, ac) })
  const put = (g, x, y, k = 1.22) => { const [a, b, w] = proj(x, y); g.style.transform = `translate(${a.toFixed(1)}px,${b.toFixed(1)}px) scale(${(w * k).toFixed(3)})` }
  let bx = W / 2, by = H / 2, own = 0, busy = 0, rot = 0
  const ref = $('.rf', box), RF = { x: W / 2 - 6, y: H / 2 + 8, lock: 0 }
  const draw = () => { if (!RF.lock) { RF.x = cl(bx - 7 * (own ? -1 : 1), 4, W - 4); RF.y = cl(by + (by < H / 2 ? 9 : -9), 3, H - 3) } put(ref, RF.x, RF.y); P.forEach((p, i) => put(dots[i], p.x, p.y)); put(ball, bx, by, 1.25); rot += 220; spin.style.transform = `rotate(${rot}deg)` }
  const minute = () => !live ? 'EMPIEZA ' + d.dataset.ko : st === 'HT' ? 'ENTRETIEMPO' : st === 'FT' ? 'FINAL' : '● EN VIVO · ' + Math.min(el + Math.floor((Date.now() - t0) / 60000), el > 90 ? 130 : 95) + "'"
  // ---- motor de jugadas: cada jugada es una lista de pasos; el bloque se corre con el balón y algunos jugadores tienen papel propio ----
  const R = (a, b) => a + Math.random() * (b - a), cl = (v, a, b) => Math.max(a, Math.min(b, v))
  const team = t => P.map((p, i) => [p, i]).filter(([p]) => p.t === t && !p.gk && !p.gone), keeper = t => P.findIndex(p => p.t === t && p.gk)
  const fwd = t => t ? -1 : 1, goalX = t => t ? 0 : W, nearest = (t, x, y) => team(t).sort((a, b) => Math.hypot(a[0].x - x, a[0].y - y) - Math.hypot(b[0].x - x, b[0].y - y))[0][1]
  const block = (atk, x, y, roles = {}) => { const shift = (x - W / 2) * 0.5
    P.forEach((p, i) => { if (p.gone) { p.x = p.goneX; p.y = -2.5; return } if (roles[i]) { [p.x, p.y] = roles[i]; return } const gk = p.gk ? 0.08 : 1, push = p.t === atk ? 4 * fwd(atk) : -2 * fwd(atk)
      p.x = cl(p.bx + (shift + push) * gk + R(-2, 2), 2, W - 2); p.y = cl(p.by + (y - p.by) * 0.18 * gk + R(-2, 2), 2, H - 2) }) }
  const ballTo = (x, y) => { bx = cl(x, 0.3, W - 0.3); by = cl(y, 0.3, H - 0.3) }
  const at = (i, dx = 0, dy = 0) => ({ [i]: [cl(bx + dx, 1, W - 1), cl(by + dy, 1, H - 1)] })
  let plan = []
  const PLAYS = {
    toques: () => { const t = own; let x = W / 2 + R(-15, 5) * fwd(t), y = R(15, 53); const s = []
      for (let k = 0; k < 4; k++) { x = cl(x + R(6, 12) * fwd(t), 8, W - 8); y = cl(y + R(-14, 14), 6, H - 6); const xx = x, yy = y; s.push(() => { ballTo(xx, yy); const i = nearest(t, xx, yy); block(t, xx, yy, at(i, -1.3 * fwd(t))) }) }
      s.push(() => { own = 1 - own; const i = nearest(own, bx, by); block(own, bx, by, at(i, 1.2)) }); return s },
    banda: () => { const t = own, side = Math.random() < 0.5 ? 6 : H - 6, gx = goalX(t); return [
      () => { ballTo(W / 2 + 8 * fwd(t), side + (side < 30 ? 6 : -6)); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1.2 * fwd(t))) },
      () => { ballTo(gx - 22 * fwd(t), side); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1.2 * fwd(t))) },
      () => { ballTo(gx - 6 * fwd(t), side < 30 ? 9 : H - 9); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) },
      () => { ballTo(gx - 9 * fwd(t), R(29, 39)); const i = nearest(t, bx, by), k = keeper(1 - t); block(t, bx, by, { ...at(i, -0.8 * fwd(t)), [k]: [gx - 1.5 * fwd(t), by] }) },
      () => { const k = keeper(1 - t); if (Math.random() < 0.5) { ballTo(gx - 1.2 * fwd(t), R(31, 37)); block(t, bx, by, { [k]: [bx, by] }) } else { ballTo(gx + 0.3 * fwd(t), R(18, 26)); block(t, bx, by) } } ] },
    corner: () => { const t = own, gx = goalX(t), cy = Math.random() < 0.5 ? 0.6 : H - 0.6, s = []
      s.push(() => { ballTo(gx - 0.6 * fwd(t), cy); const i = nearest(t, bx, by), roles = { ...at(i, -1.2 * fwd(t), cy < 30 ? -1 : 1) }
        team(t).filter(([, j]) => j !== i).slice(0, 5).forEach(([, j], q) => { roles[j] = [gx - R(5, 13) * fwd(t), 25 + q * 4.5] })
        team(1 - t).slice(0, 7).forEach(([, j], q) => { roles[j] = [gx - R(3, 12) * fwd(t), 23 + q * 3.5] }); roles[keeper(1 - t)] = [gx - 1.5 * fwd(t), 34]; P.forEach((p, j) => { if (!roles[j]) roles[j] = null }); block(t, gx - 20 * fwd(t), 34, Object.fromEntries(Object.entries(roles).filter(([, v]) => v))) })
      s.push(() => { ballTo(gx - 7 * fwd(t), R(28, 40)) })
      s.push(() => { const k = keeper(1 - t); if (Math.random() < 0.5) { ballTo(gx - 1.5 * fwd(t), 34); P[k].x = bx; P[k].y = by } else { ballTo(gx - 20 * fwd(t), R(20, 48)); own = 1 - own } draw() })
      return s },
    banda2: () => { const t = own, side = Math.random() < 0.5 ? 0.4 : H - 0.4, x = R(25, 80); return [
      () => { ballTo(x, side); const i = nearest(t, x, side); block(t, x, side < 30 ? 10 : H - 10, at(i, 0, side < 30 ? -0.4 : 0.4)) },
      () => { ballTo(x + 4 * fwd(t), side < 30 ? 7 : H - 7); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) },
      () => { ballTo(bx + 10 * fwd(t), R(20, 48)); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) } ] },
    tiro: () => { const t = own, gx = goalX(t), k = keeper(1 - t); return [
      () => { ballTo(gx - 26 * fwd(t), R(24, 44)); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1.2 * fwd(t))) },
      () => { ballTo(gx - 18 * fwd(t), R(28, 40)); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1.2 * fwd(t))) },
      () => { const y = R(30, 38); ballTo(gx - 1.6 * fwd(t), y); block(t, bx, by, { [k]: [bx, y] }) },
      () => { own = 1 - own; ballTo(W / 2 - 5 * fwd(own), R(15, 53)); const i = nearest(own, bx, by); block(own, bx, by, at(i, 1)) } ] },
    arco: () => { const t = 1 - own, k = keeper(t), gx = goalX(1 - t) === W ? W : 0; const x6 = gx === W ? W - 5.5 : 5.5; return [
      () => { ballTo(x6, 34); block(t, x6, 34, { [k]: [x6 - 1 * (gx === W ? -1 : 1), 34] }) },
      () => { ballTo(W / 2 + R(-6, 6), R(18, 50)); own = Math.random() < 0.5 ? t : 1 - t; const i = nearest(own, bx, by); block(own, bx, by, at(i, 1)) } ] },
    contra: () => { const t = own, gx = goalX(t); return [
      () => { ballTo(goalX(1 - t) + 18 * fwd(t), R(18, 50)); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) },
      () => { ballTo(gx - 30 * fwd(t), R(14, 54)); const i = nearest(t, bx, by); block(1 - t, bx, by, at(i, -1.2 * fwd(t))) },
      () => { ballTo(gx - 15 * fwd(t), R(26, 42)); const i = nearest(t, bx, by); block(1 - t, bx - 8 * fwd(t), by, at(i, -1.2 * fwd(t))) },
      () => { const k = keeper(1 - t); if (Math.random() < 0.5) { ballTo(gx - 1.4 * fwd(t), R(31, 37)); block(t, bx, by, { [k]: [bx, by] }) } else { ballTo(gx + 0.3 * fwd(t), R(16, 24)); block(t, bx, by) } } ] },
    libre: () => { const t = own, gx = goalX(t), fx = gx - R(22, 30) * fwd(t), fy = R(22, 46), k = keeper(1 - t); return [
      () => { ballTo(fx, fy); const i = nearest(t, fx, fy), roles = at(i, -1.4 * fwd(t)); team(1 - t).slice(0, 4).forEach(([, j], q) => { roles[j] = [fx + 9 * fwd(t), fy - 3 + q * 2.1] }); roles[k] = [gx - 1.5 * fwd(t), 34]; block(t, fx, fy, roles) },
      () => { if (Math.random() < 0.5) { ballTo(gx - 1.3 * fwd(t), R(30, 36)); P[k].x = bx; P[k].y = by } else ballTo(gx + 0.4 * fwd(t), R(26, 42)); draw() },
      () => { own = 1 - own; ballTo(goalX(1 - own) + 6 * fwd(own), 34); block(own, bx, by, { [keeper(own)]: [bx - 1 * fwd(own), 34] }) } ] },
    cambio: () => { const t = own, y1 = Math.random() < 0.5 ? 8 : H - 8, y2 = H - y1, x = W / 2 + R(0, 15) * fwd(t); return [
      () => { ballTo(x, y1); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) },
      () => { ballTo(x + 10 * fwd(t), y2); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) },
      () => { ballTo(goalX(t) - 12 * fwd(t), y2 + (y2 < 30 ? 6 : -6)); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) },
      () => { ballTo(goalX(t) - 8 * fwd(t), R(28, 40)); const i = nearest(1 - t, bx, by); own = 1 - own; block(own, bx, by, at(i, 0.8)) } ] },
    regate: () => { const t = own, i0 = nearest(t, bx, by), s = []
      for (let k = 0; k < 3; k++) s.push(() => { ballTo(bx + R(5, 8) * fwd(t), by + R(-5, 5)); const r = at(i0, -1 * fwd(t)), d0 = nearest(1 - t, bx, by); r[d0] = [bx + 2 * fwd(t), by + R(-2, 2)]; block(t, bx, by, r) })
      s.push(() => { ballTo(bx + R(8, 14) * fwd(t), R(15, 53)); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) }); return s },
    despeje: () => { const t = own, gx = goalX(t), side = Math.random() < 0.5 ? 10 : H - 10; return [
      () => { ballTo(gx - 14 * fwd(t), side); const i = nearest(t, bx, by); block(t, bx, by, at(i, -1)) },
      () => { ballTo(gx - 8 * fwd(t), R(28, 40)); const dd = nearest(1 - t, bx, by); block(t, bx, by, { [dd]: [bx, by] }) },
      () => { own = 1 - own; ballTo(W / 2 + R(-8, 8), R(10, 58)); const i = nearest(own, bx, by); block(own, bx, by, at(i, 1)) } ] },
  }
  const W8 = [['toques', 3], ['banda', 2], ['corner', 1], ['banda2', 1], ['tiro', 1], ['arco', 1], ['contra', 1], ['libre', 1], ['cambio', 1], ['regate', 2], ['despeje', 1]], tot = W8.reduce((a, b) => a + b[1], 0)
  let lastPlay = ''
  const pickPlay = () => { for (let n = 0; n < 4; n++) { let r = Math.random() * tot; for (const [k, w] of W8) { if ((r -= w) < 0) { if (k !== lastPlay) return (lastPlay = k); break } } } return (lastPlay = 'toques') }
  const step = () => {
    small.textContent = minute(); if (!live || !onScreen || document.hidden || busy || st === 'HT' || st === 'FT') return
    if (!plan.length) { const k = pickPlay(); plan = PLAYS[k](); box.classList.toggle('crowd', k === 'corner' || k === 'libre') }
    plan.shift()(); draw()
  }
  const confeti = col => { if (LITE || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const f = document.createElement('div'); f.className = 'lp-cf'; const cols = [col, '#ffd34d', '#ffffff', col, '#7fe0bf']
    f.innerHTML = Array.from({ length: 70 }, (_, k) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${cols[k % 5]};animation-delay:${(Math.random() * .6).toFixed(2)}s;--dx:${Math.round(Math.random() * 160 - 80)}px;--r:${Math.round(Math.random() * 900)}deg"></i>`).join('')
    $('.lp-f', box).append(f); setTimeout(() => f.remove(), 4000) }
  const show = (big, line, ms) => { $('b', ov).textContent = big; $('span', ov).textContent = line; ov.classList.add('on'); setTimeout(() => ov.classList.remove('on'), ms) }
  const nT = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|cf|sc|ac|cd|club|de|the)\b/g, '').replace(/[^a-z0-9]/g, '')
  const same = (a, b) => { const x = nT(a), y = nT(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }
  const reset = () => { P.forEach(p => { if (p.gone) { p.x = p.goneX; p.y = -2.5 } else { p.x = p.bx; p.y = p.by } }); bx = W / 2; by = H / 2; plan = []; draw() }
  const norm2 = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const who = (side, name) => { const n = norm2(name), last = n.split(/\s+/).pop(), full = side ? ap : hp
    let i = P.findIndex((p, k) => p.t === side && !p.gone && n && (norm2(p.nm) === last || norm2(full[k - (side ? 11 : 0)]?.[2]) === n))
    if (i < 0) { const pool = team(side); i = pool.length ? pool[(n.length * 7) % pool.length][1] : (side ? 16 : 5) } return i }
  const badges = i => { const p = P[i], g = $('.bd', dots[i]); if (!g) return; let h = '', y = 0
    if (p.cards) { h += `<rect x="0" y="${y}" width="6" height="8.5" rx="1" fill="${p.cards >= 2 || p.red ? '#e74c3c' : '#f4d03f'}" stroke="#0007" stroke-width=".5"/>`; y += 10 }
    for (let k = 0; k < (p.goals || 0); k++) h += `<g transform="translate(${3 + k * 7},${y + 3.5})"><circle r="3.2" fill="#fff" stroke="#222" stroke-width=".5"/><path d="M0,-1.4 L1.3,-.4 L.8,1.1 L-.8,1.1 L-1.3,-.4 Z" fill="#222"/></g>`
    g.innerHTML = h }
  const markGoal = (side, name) => { const i = who(side, name); P[i].goals = (P[i].goals || 0) + 1; badges(i); return i }
  const markCard = (side, name, red) => { const i = who(side, name), p = P[i]; p.cards = (p.cards || 0) + 1; if (red || p.cards >= 2) { p.red = 1; p.gone = 1; p.goneX = cl(p.x, 8, W - 8); p.x = p.goneX; p.y = -2.5 } badges(i); return i }
  // tarjeta: se detiene el juego, el árbitro va al jugador y le muestra la tarjeta; el jugador sigue con su tarjetita (o sale si es roja)
  const cardScene = (side, name, red, minTxt) => {
    busy = 1; plan = []; const i = who(side, name), p = P[i]
    RF.lock = 1; RF.x = cl(p.x + (p.x < W / 2 ? 4 : -4), 3, W - 3); RF.y = cl(p.y + 2, 3, H - 3); draw()
    setTimeout(() => { $('.rcc', ref).setAttribute('fill', red ? '#e74c3c' : '#f4d03f'); ref.classList.add('card'); show(red ? '🟥 Tarjeta roja' : '🟨 Tarjeta amarilla', (name || p.nm || '') + minTxt + ' · ' + (side ? d.dataset.an : d.dataset.hn), 3000) }, 1700)
    setTimeout(() => { ref.classList.remove('card'); markCard(side, name, red); RF.lock = 0; draw(); busy = 0 }, 4600)
  }
  const kickoff = txt => { busy = 1; reset(); RF.lock = 1; RF.x = W / 2 - 3; RF.y = H / 2 + 6; draw(); show('¡Comienza ' + txt + '!', 'Pitazo del árbitro', 2800); setTimeout(() => { RF.lock = 0; busy = 0 }, 3200) }
  const finale = () => { busy = 1; plan = []; reset(); RF.lock = 1; RF.x = W / 2; RF.y = H / 2 + 6; draw(); ref.classList.add('up')
    const win = gh > ga ? 0 : ga > gh ? 1 : -1
    P.forEach((p, i) => { if (win >= 0) dots[i].classList.add(p.t === win ? 'cel' : 'sad') })
    if (win >= 0) confeti($('.jb', dots[win ? 16 : 5])?.getAttribute('fill') || '#ffd34d')
    show('Final del partido', gh + ' - ' + ga + (win < 0 ? ' · Empate' : ' · Gana ' + (win ? d.dataset.an : d.dataset.hn)), 8000) }
  // goles y tarjetas que ya ocurrieron: insignias desde el inicio
  evs.slice().sort((a, b) => a[1] - b[1]).forEach(e => { if (e[0] === 'g') markGoal(e[2], e[3]); else if (e[0] === 'y' || e[0] === 'r') markCard(e[2], e[3], e[0] === 'r') })
  const onReal = e => {
    if (!(same(e.h, d.dataset.h) || same(e.a, d.dataset.a))) return   // solo el partido de ESTA cancha
    if (e.type === 'goal') {
      const home = same(e.team, d.dataset.h); busy = 1; own = home ? 0 : 1; plan = []
      ballTo(home ? W - 0.3 : 0.3, H / 2 + R(-2.5, 2.5)); draw()
      if (e.gh != null) { gh = e.gh; ga = e.ga } else if (home) gh++; else ga++
      score.innerHTML = gh + '<i></i>' + ga; addEv([e.own ? 'og' : 'g', +e.min || 0, home ? 0 : 1, e.player || '']); if (!e.own) markGoal(home ? 0 : 1, e.player); confeti($('.jb', dots[home ? 5 : 16])?.getAttribute('fill') || '#ffd34d'); show('¡GOL!', (e.player ? e.player + ' ' : '') + (e.min ? e.min + "'" : '') + ' · ' + (home ? d.dataset.hn : d.dataset.an), 4500)
      P.forEach((p, i) => { if (p.t === (home ? 0 : 1) && !p.gone) dots[i].classList.add('cel') })
      setTimeout(() => { dots.forEach(x => x.classList.remove('cel')); busy = 0; own = home ? 1 : 0; reset() }, 4200)
    } else if (e.kind === 'yellow' || e.kind === 'red') { const side = same(e.team, d.dataset.h) ? 0 : 1; addEv([e.kind === 'red' ? 'r' : 'y', +e.min || 0, side, e.player || '']); cardScene(side, e.player, e.kind === 'red', e.min ? ' ' + e.min + "'" : '') }
    else if (e.kind === 'start') { st = '1H'; el = 0; t0 = Date.now(); kickoff('el partido') }
    else if (e.kind === 'ht') { st = 'HT'; reset(); show('Entretiempo', gh + ' - ' + ga, 3000) }
    else if (e.kind === 'resume') { st = '2H'; el = 46; t0 = Date.now(); kickoff('el segundo tiempo') }
    else if (e.kind === 'end') { st = 'FT'; finale() }
    small.textContent = minute()
  }
  // línea de tiempo: avanza segundo a segundo; los eventos se acomodan en filas para que nunca queden encimados
  const nowMin = () => live && st !== 'HT' && st !== 'FT' ? Math.min(el + (Date.now() - t0) / 60000, 125) : live ? el : 0
  let tlBuilt = ''
  function paintTl() {
    const nm2 = nowMin(), mx = Math.max(90, Math.ceil(nm2), ...evs.map(e => e[1])), pos = m => (Math.min(m, mx) / mx * 100).toFixed(3) + '%'
    const key = mx + '|' + evs.length + '|' + Math.floor(nm2 / 15) + '|' + (tl.clientWidth >> 4)
    if (key !== tlBuilt) {
      tlBuilt = key
      const cols = ['#e0457b', '#56b4d3', '#f39c12', '#56b4d3', '#f1c40f', '#a3c639', '#56b4d3', '#f39c12']
      // filas: cada evento ocupa su ancho (icono + apellido + minuto); si choca con el anterior de su lado, va a la fila siguiente
      const Wpx = tl.clientWidth || 600, lanes = [[], []], place = []
      evs.slice().sort((a, b) => a[1] - b[1]).forEach(e => { const nm3 = String(e[3]).split(' ').slice(-1)[0], w = 22 + (nm3.length + String(e[1]).length + 2) * 6.2, cx = Math.min(e[1], mx) / mx * Wpx
        const L = lanes[e[2]]; let k = 0; while (L[k] && L[k] > cx - w / 2 - 6) k++; L[k] = cx + w / 2; place.push([e, k, nm3]) })
      const off = Math.max(0, Math.max(lanes[0].length, lanes[1].length) - 1) * 17
      tl.style.height = (92 + off * 2) + 'px'
      tl.innerHTML = `<div class="tl-ln" style="top:${46 + off}px"></div><div class="tl-pg" style="top:${46 + off}px;width:${pos(nm2)}"></div><div class="tl-ht" style="left:${pos(45)}"></div>` +
        [0, 15, 30, 45, 60, 75, 90].map((m, k) => `<div class="tl-dt" style="left:${pos(m)};top:${42 + off}px"></div>` + (m <= nm2 && live ? `<div class="tl-fl" style="left:${pos(m)};top:${24 + off}px;--c:${cols[k]}"></div>` : '')).join('') +
        (live && st !== 'FT' ? `<div class="tl-now" style="left:${pos(nm2)};top:${46 + off}px"><i></i><b></b></div>` : '') +
        place.map(([e, k, nm3]) => `<div class="tl-ev ${e[2] ? 'a' : 'h'}" style="left:${pos(e[1])};top:${e[2] ? 62 + off + k * 17 : off - k * 17}px">${e[0] === 'g' || e[0] === 'og' ? '⚽' : `<i class="${e[0]}"></i>`}<span>${esc2(nm3)}<em> ${e[1]}'</em></span></div>`).join('')
    }
    // avance en tiempo real (sin reconstruir nada)
    const pg = $('.tl-pg', tl), now = $('.tl-now', tl); if (pg) pg.style.width = pos(nm2); if (now) { now.style.left = pos(nm2); $('b', now).textContent = Math.floor(nm2) + "'" }
  }
  function addEv(e) { evs.push(e); tlBuilt = ''; paintTl() }
  let onScreen = true
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; box.classList.toggle('off', !onScreen) }).observe(box)
  paintTl(); setInterval(() => { if (!document.hidden && onScreen) paintTl() }, 1000)
  // respaldo: si el marcador subió en la actualización automática y el aviso de gol no llegó, se celebra igual
  window.__lpScore = (id, ngh, nga) => { if (String(id) !== String(d.dataset.id) || busy) return
    if (ngh > gh) onReal({ type: 'goal', h: d.dataset.h, a: d.dataset.a, team: d.dataset.h, gh: ngh, ga: nga })
    else if (nga > ga) onReal({ type: 'goal', h: d.dataset.h, a: d.dataset.a, team: d.dataset.a, gh: ngh, ga: nga }) }
  window.__lpEvent = onReal
  draw(); small.textContent = minute(); setInterval(step, LITE ? 4000 : 2400)
  if (live && st === '1H' && el <= 1) kickoff('el partido')
}
livePitch()

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

// búsqueda: filtra partidos y ligas de la página por equipo o liga
const q = $('[data-search]')
if (q) {
  let t
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => {
    const k = norm(q.value).trim()
    $$('details.lg').forEach(d => {
      const head = norm($('summary', d)?.textContent), rows = $$('.mx', d)
      let any = !k
      rows.forEach(r => { const hit = !k || head.includes(k) || norm($('.rw', r)?.textContent).includes(k) || norm($('.xl', r)?.textContent).includes(k); r.style.display = hit ? '' : 'none'; if (hit) any = true })
      d.style.display = any ? '' : 'none'; if (k && any) d.open = true
    })
  }, 120) })
}

// ligas favoritas (se recuerdan en este navegador) y filtro por liga
const favs = () => { try { return JSON.parse(localStorage.getItem('portalFavs') || '[]') } catch { return [] } }
const paintFavs = () => { const f = favs(); $$('[data-fav]').forEach(b => { const on = f.includes(b.dataset.fav); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆' }) }
paintFavs()
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fav]'); if (!b) return
  e.preventDefault(); e.stopPropagation()
  const f = favs(), k = b.dataset.fav, i = f.indexOf(k); if (i >= 0) f.splice(i, 1); else f.push(k)
  try { localStorage.setItem('portalFavs', JSON.stringify(f.slice(-60))) } catch { /* nada */ }
  paintFavs()
})
const chips = $('[data-chips]')
if (chips) {
  const show = k => {
    const f = favs()
    $$('details.lg').forEach(d => { const hit = k === 'all' || (k === 'fav' ? f.includes(d.dataset.k) : d.dataset.k === k); d.style.display = hit ? '' : 'none'; if (hit && k !== 'all') d.open = true })
    $$('.chip', chips).forEach(c => c.classList.toggle('on', c.dataset.lg === k))
  }
  chips.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) show(c.dataset.lg) })
}

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

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
$$('[data-copy]').forEach(b => b.addEventListener('click', async () => { try { if (cardData?.need) await waitCard(); await navigator.clipboard.writeText(b.dataset.copy); const o = b.textContent; b.textContent = 'Enlace copiado'; setTimeout(() => { b.textContent = o }, 1800) } catch { /* sin portapapeles */ } }))

// calendario: elegir cualquier fecha
$$('[data-date]').forEach(i => i.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(i.value)) location.href = (i.dataset.base || '/partidos') + '/' + i.value }))
// la fecha activa queda a la vista en la barra deslizable
$('.bar2 a.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })

// slider de los partidos en vivo
$$('[data-slide]').forEach(b => b.addEventListener('click', () => { const r = $('.lcs', b.parentElement); r?.scrollBy({ left: +b.dataset.slide * r.clientWidth * 0.8, behavior: 'smooth' }) }))

// tarjeta del partido para la vista previa del enlace (WhatsApp, Facebook, X…): este navegador la dibuja y el servidor la guarda
let cardP = null
const cardData = (() => { try { return JSON.parse(document.body.dataset.card || 'null') } catch { return null } })()
const ensureCard = () => {
  if (!cardData || !cardData.need) return Promise.resolve()
  return cardP ||= (async () => {
    try {
      const { matchOgBlob } = await import('./shareCard'), site = JSON.parse(document.body.dataset.site || '{}')
      const blob = await matchOgBlob({ m: cardData.m, city: cardData.city, site, link: cardData.link })
      await fetch('/api/match-card/' + cardData.id + '?k=' + encodeURIComponent(cardData.k), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
    } catch { /* el enlace se comparte igual */ }
  })()
}
if (cardData && cardData.need) setTimeout(ensureCard, 1200)
const waitCard = () => Promise.race([ensureCard(), new Promise(ok => setTimeout(ok, 5000))])
document.addEventListener('click', e => { const b = e.target.closest('.sh a[target], [data-copy]'); if (b && cardData?.need) ensureCard() }, true)

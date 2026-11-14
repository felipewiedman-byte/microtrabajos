import { createContext, useContext } from 'react'
export const DEFAULT_SITE = { name: 'PLANETA', tagline: 'El mundo está pasando.', tagline2: 'Descúbrelo ahora.', logoDark: '', logoLight: '', favicon: '', colors: {}, texts: {} }
export const SiteCtx = createContext(DEFAULT_SITE)
export const useSite = () => useContext(SiteCtx)
const FALLBACK = {
  joinTitle: 'Únete a {name}', joinSub: 'Crea tu cuenta para publicar, comentar y guardar.', welcomeBack: 'Bienvenido de nuevo', createAccount: 'Crea tu cuenta', authSub: 'Descubre y comparte lo que pasa en el mundo.',
  dropButton: 'Soltar en el planeta', publishButton: 'Publicar en {name}', published: 'Publicado en {name}', pinHint: 'Haz clic en el mapa donde está ocurriendo', pinTip: 'Clic derecho en el mapa para publicar ahí',
  whatsHappening: '¿Qué está pasando aquí?', inThisView: 'En esta vista', wall: 'Muro', liveNow: 'En directo ahora', nearTitle: 'Explorar cerca', messagesTitle: 'Mensajes', communityTitle: 'Comunidad',
  communitySub: 'Personas que comparten lo que pasa en el mundo.', roomTitle: 'Lo que pasa hoy en {city}', emptyRoom: 'La sala de {city} está en silencio. Escribe el primer mensaje.', footer: '{name} · 2026',
}
// t(site, key, vars): editable text with {name} and other placeholders filled in
export function t(site, key, vars = {}) {
  const raw = (site.texts && site.texts[key]) || FALLBACK[key] || key
  return raw.replace(/\{(\w+)\}/g, (_, k) => k === 'name' ? site.name : (vars[k] ?? ''))
}
// textos que se pueden ajustar desde el panel: tamaño (px) y color
export const TEXT_STYLE = {
  slogan: { label: 'Frase principal de la portada', sel: '.gh-hero h1', def: 33 },
  heroLogo: { label: 'Logo de la portada', sel: '.gh-hero .brand, .gh-hero .brand-logo', def: 17 },
  slogan2: { label: 'Segunda línea de la portada', sel: '.gh-hero p', def: 17 },
  stats: { label: 'Números de la portada', sel: '.gh-stats b', def: 14 },
  btnMain: { label: 'Texto de los botones principales', sel: '.btn', def: 13 },
  panelTitle: { label: 'Títulos de las secciones', sel: '.panelx .top h1, .wall-where b, .pl-place', def: 15 },
  itemTitle: { label: 'Títulos de las publicaciones en listas', sel: '.pl-it-t, .mini-t', def: 13 },
  postTitle: { label: 'Títulos en las tarjetas grandes', sel: '.post h3, .post .media h2, .post-title', def: 18 },
  body: { label: 'Texto de las publicaciones', sel: '.post-text', def: 14 },
  meta: { label: 'Textos pequeños (ciudad, hora…)', sel: '.meta', def: 12 },
  cityName: { label: 'Nombre de la ciudad en su ficha', sel: '.city-n', def: 22 },
  menu: { label: 'Texto del menú del móvil', sel: '.tabbar button', def: 11 },
  ticker: { label: 'Barra "AHORA" de la portada', sel: '.gh-track button', def: 12 },
}
export function applyTheme(site) {
  const c = site.colors || {}, r = document.documentElement.style
  const map = { accent: '--accent', bg: '--bg', surface: '--surface', text: '--text', muted: '--muted', live: '--live', verified: '--verified' }
  for (const [k, v] of Object.entries(map)) if (c[k]) r.setProperty(v, c[k])
  if (c.bg) document.body.style.background = c.bg
  // tamaños y colores de textos editables en el panel
  let css = ''
  for (const [k, def] of Object.entries(TEXT_STYLE)) { const sz = site.sizes?.[k], col = site.textColors?.[k], wt = site.weights?.[k]; if (sz || col || wt) css += `${def.sel}{${sz ? `font-size:${+sz}px!important;` : ''}${col ? `color:${col}!important;` : ''}${wt ? `font-weight:${+wt}!important;` : ''}}` }
  let st = document.getElementById('site-text-style'); if (!st) { st = document.createElement('style'); st.id = 'site-text-style'; document.head.appendChild(st) } st.textContent = css
  document.title = site.name
  if (site.favicon) { let l = document.querySelector('link[rel=icon]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l) } l.href = site.favicon }
}
// precio mensual para mostrar: "49.900 COP / mes"
export const priceTxt = (site, kind) => { const a = +(kind === 'radio' ? site?.radioAmount : site?.bizAmount); return a > 0 ? new Intl.NumberFormat('es-CO').format(a) + ' ' + (site.currency || 'COP') + ' al mes' : '' }
export const openSell = kind => window.dispatchEvent(new CustomEvent('planeta:sell', { detail: kind }))

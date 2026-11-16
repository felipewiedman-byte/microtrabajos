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
  dkMenu: { label: 'Computador: opciones del menú de la izquierda', sel: '.dk-menu .dk-it', def: 14 },
  dkUser: { label: 'Computador: nombre de tu usuario en el menú', sel: '.dk-me b', def: 15 },
  dkStats: { label: 'Computador: números del menú (hoy, en directo, países)', sel: '.dk-stats b', def: 17 },
  dkLive: { label: 'Computador: «En directo ahora» del menú', sel: '.dk-live .dk-lt', def: 13 },
  dkStories: { label: 'Computador: nombres de las historias de arriba', sel: '.dk-stories .story span', def: 10 },
  dkPub: { label: 'Computador: botón Publicar del menú', sel: '.dk-pub', def: 15 },
}
// PALETA ÚNICA de la web: [clave, grupo, nombre, dónde se ve, variable CSS, valor por defecto, clave antigua en Diseño]
export const PALETTE = [
  ['accent', 'General', 'Color principal', 'Botones principales (Entrar, Guardar), enlaces, interruptores encendidos', '--accent', '#5cc8b0'],
  ['bg', 'General', 'Fondo de la página', 'Detrás del mapa y de todas las pantallas', '--bg', '#0a0f1a'],
  ['surface', 'General', 'Tarjetas (móvil y pantallas sueltas)', 'Tarjetas, listas y campos fuera de las ventanas del computador', '--surface', '#111b2e'],
  ['text', 'General', 'Texto', 'Texto principal en toda la web', '--text', '#eef1f4'],
  ['muted', 'General', 'Texto secundario', 'Fechas, ciudades, explicaciones pequeñas', '--muted', '#8a94a0'],
  ['live', 'Etiquetas', 'En directo', 'Etiqueta «EN VIVO» y avisos en directo', '--live', '#e5484d'],
  ['verified', 'Etiquetas', 'Noticia verificada', 'Insignia de verificado y noticias verificadas', '--verified', '#6aa9ff'],
  ['win1', 'Ventanas', 'Ventanas: color de arriba', 'Parte de arriba del degradado de Menú, Lista, Radio y ventanas emergentes', '--win1', '#10203b', 'win1'],
  ['win2', 'Ventanas', 'Ventanas: color de abajo', 'Parte de abajo del mismo degradado', '--win2', '#0a1428', 'win2'],
  ['box', 'Ventanas', 'Cajas y botones dentro de las ventanas', 'Tarjetas de personas, perfil, «Mi cuenta», campos para escribir (se usa transparente sobre la ventana)', '--box-bg', '#7fa6ff', 'box'],
  ['winText', 'Ventanas', 'Texto de las ventanas', 'Títulos y textos dentro de Menú, Lista y Radio', '--win-text', '#eef3f8', 'text'],
  ['winMuted', 'Ventanas', 'Texto secundario de las ventanas', 'Textos pequeños dentro de las ventanas', '--win-muted', '#9fb0c6', 'muted'],
  ['winLine', 'Ventanas', 'Color de resaltado de las ventanas', 'Brillos y detalles azules de las ventanas', '--win-line', '#6fa8ff', 'line'],
  ['strip', 'Ventanas', 'Barra de título (Minimizar / Cerrar)', 'Franja de arriba de Menú y Lista', '--strip-bg', '#0a1428', 'strip'],
  ['sel', 'Ventanas', 'Desplegables: fondo', 'Listas que se abren (Todo, Regiones, ciudades)', '--sel-bg', '#14202f', 'sel'],
  ['selText', 'Ventanas', 'Desplegables: texto', 'Texto de esas listas', '--sel-text', '#eef3f8', 'selText'],
  ['scroll', 'Ventanas', 'Barra de desplazamiento', 'La barrita para bajar en las listas', '--scroll-c', '#4a6a9a', 'scroll'],
  ['menuOn1', 'Botones', 'Opción activa del menú (inicio)', 'Opción elegida del Menú y pestañas activas (Personas, Ahora…)', '--menu-on1', '#2d7bff', 'on1'],
  ['menuOn2', 'Botones', 'Opción activa del menú (final)', 'Final del degradado de esa opción', '--menu-on2', '#1b57d4', 'on2'],
  ['pub1', 'Botones', 'Botón Publicar (inicio)', 'Botón Publicar del menú', '--pub1', '#5ccfb4', 'pub1'],
  ['pub2', 'Botones', 'Botón Publicar (final)', 'Final del degradado del botón Publicar', '--pub2', '#2fa7d6', 'pub2'],
  ['pubText', 'Botones', 'Texto del botón Publicar', 'Letras del botón Publicar', '--pub-text', '#04201b', 'pubText'],
]
// los grises que venían por defecto pasan al azul de la web (si alguien los cambió a otro color, se respeta)
const OLD = { bg: '#0b0e12', surface: '#13171d' }
// colores efectivos: lo guardado en Colores; si no, lo que hubiera en Diseño (antes había dos paletas); si no, el de fábrica
export const effectiveColors = site => Object.fromEntries(PALETTE.map(([k, , , , , def, sk]) => { let v = site.colors?.[k] || (sk && site.layout?.skin?.c?.[sk]) || def; if (OLD[k] && String(v).toLowerCase() === OLD[k]) v = def; return [k, v] }))
export function applyTheme(site) {
  const c = effectiveColors(site), r = document.documentElement.style
  for (const [k, , , , v] of PALETTE) if (/^#[0-9a-f]{6}$/i.test(c[k] || '')) r.setProperty(v, c[k])
  if (c.bg) document.body.style.background = c.bg
  // tamaños y colores de textos editables en el panel
  let css = ''
  for (const [k, def] of Object.entries(TEXT_STYLE)) { const sz = site.sizes?.[k], col = site.textColors?.[k], wt = site.weights?.[k]; if (sz || col || wt) css += `${def.sel}{${sz ? `font-size:${+sz}px!important;` : ''}${col ? `color:${col}!important;` : ''}${wt ? `font-weight:${+wt}!important;` : ''}}` }
  let st = document.getElementById('site-text-style'); if (!st) { st = document.createElement('style'); st.id = 'site-text-style'; document.head.appendChild(st) } st.textContent = css
  document.title = site.name
  if (site.favicon) { let l = document.querySelector('link[rel=icon]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l) } l.href = site.favicon.replace(/^http:\/\//, location.protocol === 'https:' ? 'https://' : 'http://') }
}
// precio mensual para mostrar: "49.900 COP / mes"
export const priceTxt = (site, kind) => { const a = +(kind === 'radio' ? site?.radioAmount : kind === 'evento' ? site?.eventAmount : site?.bizAmount); return a > 0 ? new Intl.NumberFormat('es-CO').format(a) + ' ' + (site.currency || 'COP') + (kind === 'evento' ? ' por ' + (site.planEvento?.days || 7) + ' días' : ' al mes') : '' }
export const openSell = kind => window.dispatchEvent(new CustomEvent('planeta:sell', { detail: kind }))

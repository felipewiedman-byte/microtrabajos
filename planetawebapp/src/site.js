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
export function applyTheme(site) {
  const c = site.colors || {}, r = document.documentElement.style
  const map = { accent: '--accent', bg: '--bg', surface: '--surface', text: '--text', muted: '--muted', live: '--live', verified: '--verified' }
  for (const [k, v] of Object.entries(map)) if (c[k]) r.setProperty(v, c[k])
  if (c.bg) document.body.style.background = c.bg
  document.title = site.name
  if (site.favicon) { let l = document.querySelector('link[rel=icon]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l) } l.href = site.favicon }
}
// precio mensual para mostrar: "49.900 COP / mes"
export const priceTxt = (site, kind) => { const a = +(kind === 'radio' ? site?.radioAmount : site?.bizAmount); return a > 0 ? new Intl.NumberFormat('es-CO').format(a) + ' ' + (site.currency || 'COP') + ' al mes' : '' }
export const openSell = kind => window.dispatchEvent(new CustomEvent('planeta:sell', { detail: kind }))

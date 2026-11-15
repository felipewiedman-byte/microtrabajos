// Diseño del celular configurable desde el panel (Diseño). Sin configuración = el diseño original.
export const MENU_DEFAULT = [['publicar', 'Publicar'], ['planeta', 'Mapa'], ['ahora', 'Ahora'], ['cerca', 'Explorar cerca'], ['mensajes', 'Mensajes'], ['comunidad', 'Comunidad'], ['huella', 'Tu huella'], ['v3d', 'Vista 3D'], ['globo', 'Mundo redondo'], ['capas', 'Cambiar tipo de mapa'], ['radio', 'Radio'], ['planes', 'Planes y precios'], ['admin', 'Panel de administración']]
export const TABS_DEFAULT = [['ahora', 'Ahora'], ['planeta', 'Mapa'], ['publicar', 'Publicar'], ['mensajes', 'Mensajes'], ['comunidad', 'Comunidad']]
export const HOME_DEFAULT = [['stats', 'Estadísticas (publicaciones, directos, países)'], ['btns', 'Botones Explorar / Ver cerca / Planes'], ['live', 'En vivo y países activos'], ['ticker', 'Cinta «AHORA»']]
export const UI_DEFAULT = { fs: 'normal', btn: 'normal', gap: 'normal', radius: 'normal', listW: 280 }
// menú de la ventana izquierda del computador
export const DMENU_DEFAULT = [['planeta', 'Mapa'], ['ahora', 'Ahora'], ['cerca', 'Explorar cerca'], ['mensajes', 'Mensajes'], ['comunidad', 'Comunidad'], ['huella', 'Tu huella'], ['planes', 'Planes y precios'], ['admin', 'Panel de administración']]
// ventanas del computador que se pueden mover y cambiar de tamaño (posiciones en % de la pantalla; 'b' = distancia al borde de abajo)
export const DESK_WINDOWS = [['menu', 'Menú de la izquierda', 'top'], ['panel', 'Ventana de la derecha (lista, ciudad, publicación)', 'top'], ['search', 'Barra de arriba (logo, buscador, regiones e historias)', 'top'], ['ctl', 'Controles del mapa', 'bottom'], ['radio', 'Radio', 'bottom']]
export const DD_DEFAULT = { temas: true, ciudad: true, comunidad: true, panel: true }

// lista guardada + lo que falte (si mañana se agrega una opción nueva, aparece al final)
export function mergeList(def, saved) {
  const out = []
  for (const s of saved || []) { const d = def.find(x => x[0] === s.id); if (d && !out.some(o => o.id === s.id)) out.push({ id: s.id, label: s.label || d[1], show: s.show !== false }) }
  for (const [id, label] of def) if (!out.some(o => o.id === id)) out.push({ id, label, show: true })
  return out
}
export const normalizeLayout = l => ({ menu: mergeList(MENU_DEFAULT, l?.menu), dmenu: mergeList(DMENU_DEFAULT, l?.dmenu), desk: l?.desk || {}, tabs: mergeList(TABS_DEFAULT, l?.tabs), home: mergeList(HOME_DEFAULT, l?.home), ui: { ...UI_DEFAULT, ...(l?.ui || {}) }, dd: { ...DD_DEFAULT, ...(l?.dd || {}) } })

const K = { fs: { small: 0.92, normal: 1, large: 1.12 }, btn: { compact: 0.8, normal: 1, large: 1.25 }, gap: { compact: '4px', normal: '8px', wide: '14px' }, radius: { square: ['4px', '8px'], normal: ['12px', '999px'], round: ['20px', '999px'] } }
const DESK_PROPS = [['l', 'vw'], ['t', 'vh'], ['b', 'vh'], ['w', 'vw'], ['h', 'vh']]
// posiciones de las ventanas del computador como variables CSS (--dk-menu-l, --dk-panel-w…); sin valor = posición original
export function applyDesk(desk, root = document.documentElement) {
  for (const [id] of DESK_WINDOWS) for (const [p, unit] of DESK_PROPS) { const v = desk?.[id]?.[p], name = `--dk-${id}-${p}`; if (Number.isFinite(+v) && v !== null && v !== undefined) root.style.setProperty(name, v + unit); else root.style.removeProperty(name) }
}
// pasa las medidas elegidas a variables CSS (el CSS las usa con valores originales por defecto)
export function applyLayout(layout, root = document.documentElement) {
  const u = { ...UI_DEFAULT, ...(layout?.ui || {}) }, dd = { ...DD_DEFAULT, ...(layout?.dd || {}) }, r = K.radius[u.radius] || K.radius.normal
  root.style.setProperty('--ui-fs', K.fs[u.fs] ?? 1); root.style.setProperty('--ui-k', K.btn[u.btn] ?? 1); root.style.setProperty('--ui-gap', K.gap[u.gap] ?? '8px')
  root.style.setProperty('--ui-card-r', r[0]); root.style.setProperty('--ui-btn-r', r[1]); root.style.setProperty('--list-w', (+u.listW || 280) + 'px'); (+u.panelW ? root.style.setProperty('--panel-w', +u.panelW + 'px') : root.style.removeProperty('--panel-w')); applyDesk(layout?.desk, root)
  const home = mergeList(HOME_DEFAULT, layout?.home); home.forEach((h, i) => { root.setAttribute('data-home-' + h.id, h.show ? '1' : '0'); root.style.setProperty('--home-o-' + h.id, i) }); root.setAttribute('data-home-flip', home.findIndex(h => h.id === 'stats') > home.findIndex(h => h.id === 'btns') ? '1' : '0')
  for (const k of Object.keys(DD_DEFAULT)) root.setAttribute('data-dd-' + k, dd[k] ? '1' : '0')
}

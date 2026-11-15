// Diseño del celular configurable desde el panel (Diseño). Sin configuración = el diseño original.
export const MENU_DEFAULT = [['publicar', 'Publicar'], ['planeta', 'Mapa'], ['ahora', 'Ahora'], ['cerca', 'Explorar cerca'], ['mensajes', 'Mensajes'], ['comunidad', 'Comunidad'], ['huella', 'Tu huella'], ['v3d', 'Vista 3D'], ['globo', 'Mundo redondo'], ['capas', 'Cambiar tipo de mapa'], ['radio', 'Radio'], ['planes', 'Planes y precios'], ['admin', 'Panel de administración']]
export const TABS_DEFAULT = [['ahora', 'Ahora'], ['planeta', 'Mapa'], ['publicar', 'Publicar'], ['mensajes', 'Mensajes'], ['comunidad', 'Comunidad']]
export const HOME_DEFAULT = [['stats', 'Estadísticas (publicaciones, directos, países)'], ['btns', 'Botones Explorar / Ver cerca / Planes'], ['live', 'En vivo y países activos'], ['ticker', 'Cinta «AHORA»']]
export const UI_DEFAULT = { fs: 'normal', btn: 'normal', gap: 'normal', radius: 'normal', listW: 280 }
// Apariencia del computador (todo editable en el panel). Sin valor = el diseño por defecto.
// n: números (px o %), c: colores. 'var' es la variable CSS que usa desk.css.
export const SKIN_NUMS = [['radius', 'Esquinas redondeadas', 0, 24, 'px', 5, '--dk-r'], ['pad', 'Margen interior de las ventanas', 0, 30, 'px', 10, '--dk-pad'], ['gap', 'Espacio entre tarjetas y cajas', 0, 24, 'px', 8, '--dk-gap'], ['bw', 'Grosor de la línea de contorno (0 = sin línea)', 0, 4, 'px', 0, '--dk-bw'], ['alpha', 'Opacidad de las ventanas (100 = sólidas)', 30, 100, '%', 80, '--dk-alpha'], ['menuW', 'Ancho del menú de la izquierda', 180, 400, 'px', 0, '--menu-w'], ['itemH', 'Alto de cada opción del menú', 24, 48, 'px', 0, '--item-h'], ['edge', 'Distancia de las ventanas al borde de la pantalla', 0, 60, 'px', 24, '--dk-edge'], ['pin', 'Tamaño de los pines del mapa (banderas y fotos)', 40, 120, '%', 100, '--pin-pct']]
export const SKIN_COLORS = [['win1', 'Ventanas: color de arriba', '#10203b', '--win1'], ['win2', 'Ventanas: color de abajo', '#0a1428', '--win2'], ['line', 'Línea de contorno de las ventanas', '#6fa8ff', '--win-line'], ['text', 'Texto de las ventanas', '#eef3f8', '--win-text'], ['muted', 'Texto secundario de las ventanas', '#9fb0c6', '--win-muted'], ['box', 'Cajas de adentro (tarjetas, listas)', '#ffffff', '--box-bg'], ['sel', 'Desplegables: fondo (los que salían negros)', '#14202f', '--sel-bg'], ['selText', 'Desplegables: texto', '#eef3f8', '--sel-text'], ['on1', 'Opción activa del menú (inicio)', '#2d7bff', '--menu-on1'], ['on2', 'Opción activa del menú (final)', '#1b57d4', '--menu-on2'], ['pub1', 'Botón Publicar (inicio)', '#5ccfb4', '--pub1'], ['pub2', 'Botón Publicar (final)', '#2fa7d6', '--pub2'], ['pubText', 'Texto del botón Publicar', '#04201b', '--pub-text'], ['strip', 'Barra Menú / Lista (Minimizar y Cerrar)', '#0a1428', '--strip-bg'], ['scroll', 'Barra de desplazamiento (scroll)', '#4a6a9a', '--scroll-c']]
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
export const normalizeLayout = l => ({ menu: mergeList(MENU_DEFAULT, l?.menu), dmenu: mergeList(DMENU_DEFAULT, l?.dmenu), desk: l?.desk || {}, skin: { n: { ...(l?.skin?.n || {}) }, c: { ...(l?.skin?.c || {}) } }, tabs: mergeList(TABS_DEFAULT, l?.tabs), home: mergeList(HOME_DEFAULT, l?.home), ui: { ...UI_DEFAULT, ...(l?.ui || {}) }, dd: { ...DD_DEFAULT, ...(l?.dd || {}) } })

const K = { fs: { small: 0.92, normal: 1, large: 1.12 }, btn: { compact: 0.8, normal: 1, large: 1.25 }, gap: { compact: '4px', normal: '8px', wide: '14px' }, radius: { square: ['4px', '8px'], normal: ['12px', '999px'], round: ['20px', '999px'] } }
const DESK_PROPS = [['l', 'vw'], ['t', 'vh'], ['b', 'vh'], ['w', 'vw'], ['h', 'vh']]
// posiciones de las ventanas del computador como variables CSS (--dk-menu-l, --dk-panel-w…); sin valor = posición original
export function applyDesk(desk, root = document.documentElement) {
  for (const [id] of DESK_WINDOWS) for (const [p, unit] of DESK_PROPS) { const v = desk?.[id]?.[p], name = `--dk-${id}-${p}`; if (Number.isFinite(+v) && v !== null && v !== undefined) root.style.setProperty(name, v + unit); else root.style.removeProperty(name) }
}
export function applySkin(skin, root = document.documentElement) {
  for (const [k, , lo, hi, unit, , v] of SKIN_NUMS) { const x = skin?.n?.[k]; if (x !== undefined && x !== null && x !== '' && Number.isFinite(+x) && !(+x === 0 && (k === 'menuW' || k === 'itemH'))) root.style.setProperty(v, Math.min(hi, Math.max(lo, +x)) + unit); else root.style.removeProperty(v) }
  { const p = skin?.n?.pin; root.style.setProperty('--pin-k', Number.isFinite(+p) && p !== '' && p !== null && p !== undefined ? Math.min(1.2, Math.max(0.4, +p / 100)) : 1) }
  for (const [k, , , v] of SKIN_COLORS) { const c = skin?.c?.[k]; if (/^#[0-9a-f]{6}$/i.test(c || '')) root.style.setProperty(v, c); else root.style.removeProperty(v) }
}
// pasa las medidas elegidas a variables CSS (el CSS las usa con valores originales por defecto)
export function applyLayout(layout, root = document.documentElement) {
  const u = { ...UI_DEFAULT, ...(layout?.ui || {}) }, dd = { ...DD_DEFAULT, ...(layout?.dd || {}) }, r = K.radius[u.radius] || K.radius.normal
  root.style.setProperty('--ui-fs', K.fs[u.fs] ?? 1); root.style.setProperty('--ui-k', K.btn[u.btn] ?? 1); root.style.setProperty('--ui-gap', K.gap[u.gap] ?? '8px')
  root.style.setProperty('--ui-card-r', r[0]); root.style.setProperty('--ui-btn-r', r[1]); root.style.setProperty('--list-w', (+u.listW || 280) + 'px'); (+u.panelW ? root.style.setProperty('--panel-w', +u.panelW + 'px') : root.style.removeProperty('--panel-w')); applyDesk(layout?.desk, root); applySkin(layout?.skin, root)
  const home = mergeList(HOME_DEFAULT, layout?.home); home.forEach((h, i) => { root.setAttribute('data-home-' + h.id, h.show ? '1' : '0'); root.style.setProperty('--home-o-' + h.id, i) }); root.setAttribute('data-home-flip', home.findIndex(h => h.id === 'stats') > home.findIndex(h => h.id === 'btns') ? '1' : '0')
  for (const k of Object.keys(DD_DEFAULT)) root.setAttribute('data-dd-' + k, dd[k] ? '1' : '0')
}

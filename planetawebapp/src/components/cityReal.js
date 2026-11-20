// Ciudad 3D realista (liviana): SOLO datos reales del mapa, nada inventado.
// - Edificios con su color real (cuando el mapa lo tiene registrado), mezclado con el tono del mapa para que no desentone.
// - Se ocultan las «partes» que el mapa trae duplicadas (el contorno completo + sus partes) y se veían encimadas.
// Los estadios se ven tal como están dibujados en el mapa. Se enciende/apaga desde el panel (cityReal: off / admin / all).

// edificios: color real (si el mapa lo tiene) mezclado con el tono del mapa para que no desentone; las «partes» duplicadas se ocultan
const realColor = base => ['case', ['has', 'colour'],
  ['let', 'r', ['to-rgba', ['to-color', ['get', 'colour'], '#8a93a6']], 'b', ['to-rgba', base],
    ['rgba', ['+', ['*', 0.55, ['at', 0, ['var', 'r']]], ['*', 0.45, ['at', 0, ['var', 'b']]]], ['+', ['*', 0.55, ['at', 1, ['var', 'r']]], ['*', 0.45, ['at', 1, ['var', 'b']]]], ['+', ['*', 0.55, ['at', 2, ['var', 'r']]], ['*', 0.45, ['at', 2, ['var', 'b']]]], 1]],
  base]

export function cityReal(m) {
  let on = false, orig = null
  function enable() {
    if (!m.getLayer('edificios')) return
    orig ||= { color: m.getPaintProperty('edificios', 'fill-extrusion-color'), filter: m.getFilter('edificios') }
    try { m.setPaintProperty('edificios', 'fill-extrusion-color', realColor(orig.color)) } catch { /* sin colores reales */ }
    m.setFilter('edificios', orig.filter ? ['all', orig.filter, ['!=', ['get', 'hide_3d'], true]] : ['!=', ['get', 'hide_3d'], true])
  }
  function disable() {
    try { if (orig) { m.setPaintProperty('edificios', 'fill-extrusion-color', orig.color); m.setFilter('edificios', orig.filter || null) } } catch { /* nada */ }
  }
  return v => { if (!!v === on) return; on = !!v; try { on ? enable() : disable() } catch { /* estilo aún cargando */ } }
}

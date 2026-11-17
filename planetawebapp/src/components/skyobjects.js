import { useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import { sunMoon, eclipse, faseNombre } from './skymath'
// Sol y luna sobre el mapa plano, en el lugar del planeta donde están ahora. Se mueven solos (se recalculan cada minuto, sin descargar nada),
// la luna muestra su fase real y, si hay eclipse, la luna se pone roja (eclipse de luna) o la luna tapa al sol (eclipse de sol). Sin textos ni avisos.
const R = Math.PI / 180
function lunaSVG(elong, ecl, r = 20) {
  const c = Math.cos(elong * R), waxing = elong < 180, rx = Math.abs(c) * r, gib = c < 0, lado = waxing ? 1 : 0
  const outer = `M 0 ${-r} A ${r} ${r} 0 0 ${lado} 0 ${r}`, term = `A ${rx} ${r} 0 0 ${gib ? lado : 1 - lado} 0 ${-r} Z`
  const rojo = ecl && ecl.tipo === 'luna'
  const base = rojo ? (ecl.total ? '#5a1a12' : '#2a2028') : '#262c38', luz = rojo ? (ecl.total ? '#b8442c' : '#d8c9b4') : '#e8e6dc'
  const tapa = rojo && !ecl.total ? `<circle r="${r}" fill="#7a2418" opacity="${(0.25 + ecl.f * 0.6).toFixed(2)}"/>` : ''
  return `<svg width="${r * 2 + 8}" height="${r * 2 + 8}" viewBox="${-r - 4} ${-r - 4} ${r * 2 + 8} ${r * 2 + 8}"><circle r="${r}" fill="${base}" stroke="#667" stroke-width=".7"/>${rojo && ecl.total ? '' : `<path d="${outer} ${term}" fill="${luz}"/>`}${tapa}${rojo && ecl.total ? `<circle r="${r}" fill="${luz}" opacity=".55"/>` : ''}</svg>`
}
const solHTML = ecl => {
  const e = ecl && ecl.tipo === 'sol'
  return `<div class="sky-sol"><i></i>${e ? `<b style="transform:translate(${(-(1 - ecl.off) * 6 + ecl.off * 0).toFixed(1)}px,${(-ecl.off * 14).toFixed(1)}px);opacity:${Math.min(1, 0.55 + ecl.f).toFixed(2)}"></b>` : ''}</div>`
}
export function useSkyMarkers(mapRef, ready, active) {
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready || !active) return
    const mk = (cls, ll) => { const el = document.createElement('div'); el.className = 'sky ' + cls; return { el, mk: new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(m) } }
    const sun = mk('sky-s', [0, 0]), moon = mk('sky-m', [0, 0])
    const draw = () => {
      const s = sunMoon(new Date()), ecl = eclipse(s)
      sun.mk.setLngLat([s.sol.lon, s.sol.lat]); sun.el.innerHTML = solHTML(ecl); sun.el.title = ecl && ecl.tipo === 'sol' ? 'Eclipse de sol en este momento' : 'Sol'
      moon.mk.setLngLat([s.luna.lon, s.luna.lat]); moon.el.innerHTML = lunaSVG(s.elong, ecl)
      moon.el.title = faseNombre(s.elong) + ' · ' + Math.round(s.ilum * 100) + ' % iluminada' + (ecl && ecl.tipo === 'luna' ? ' · eclipse de luna en este momento' : '')
    }
    draw()
    const t = setInterval(() => { if (!document.hidden) draw() }, 60e3)
    const v = () => { if (!document.hidden) draw() }; document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); sun.mk.remove(); moon.mk.remove() }
  }, [mapRef, ready, active])
}

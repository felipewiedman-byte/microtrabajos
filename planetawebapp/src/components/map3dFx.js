// Efectos livianos de la vista 3D: luz del sol según la hora del lugar (suave),
// giro de cámara alrededor del estadio y destello de gol. Nada se descarga: todo se calcula en el navegador.
// Se recalcula solo cuando cambia la franja horaria o la zona (no en cada fotograma).
import { LITE } from './mapStyle'

export const CALM = LITE || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)

// hora solar local (sin internet): hora UTC + longitud/15
const solarHour = lon => { const d = new Date(); return ((d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15) % 24 + 24) % 24 }

// posición y color del sol (o de la luna) para MapLibre: [distancia, acimut desde el norte, ángulo desde el cenit]
function sunLight(lat, lon) {
  const h = solarHour(lon), day = h >= 6 && h < 18.5
  if (!day) return { key: 'noche', light: { anchor: 'map', color: '#c9d4ff', intensity: 0.42, position: [1.5, 200, 40] } }
  const t = Math.min(1, Math.max(0, (h - 6) / 12.5))            // 0 = amanecer, 1 = atardecer
  const alt = Math.max(8, 72 * Math.sin(Math.PI * t))            // altura del sol en grados
  const az = lat >= 0 ? 90 + t * 180 : (450 - t * 180) % 360     // este → sur (o norte en el hemisferio sur) → oeste
  const low = alt < 25                                           // sol bajo: luz cálida y sombras largas
  return { key: (low ? 'bajo' : 'alto') + Math.round(az / 15),
    light: { anchor: 'map', color: low ? '#ffe2c4' : '#ffffff', intensity: 0.5, position: [1.5, az, 90 - alt] } }
}

// aplica la luz del lugar (solo cambia de dónde viene la luz y su tono, muy suave: los colores del mapa no cambian)
export function sunAndCity(m) {
  if (LITE) return () => {}
  let last = ''
  const apply = () => { try {
    const c = m.getCenter(), s = sunLight(c.lat, c.lng), k = s.key + '|' + Math.round(c.lng / 7.5)
    if (k === last || !m.getLayer('edificios')) return; last = k
    m.setLight(s.light)
  } catch { /* estilo aún cargando */ } }
  return apply
}

// un solo giro lento alrededor del punto (8 s); se detiene solo si la persona toca el mapa
export function orbit(m) {
  if (CALM) return
  try { m.easeTo({ bearing: m.getBearing() + 70, pitch: Math.min(62, m.getMaxPitch()), duration: 8000, easing: t => t }) } catch { /* mapa cerrado */ }
}

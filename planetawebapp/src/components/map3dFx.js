// Efectos livianos de la vista 3D: luz del sol según la hora del lugar, ventanas encendidas de noche,
// giro de cámara alrededor del estadio y destello de gol. Nada se descarga: todo se calcula en el navegador.
// Se recalcula solo cuando cambia la franja horaria o la zona (no en cada fotograma).
import { LITE } from './mapStyle'

export const CALM = LITE || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)

// hora solar local (sin internet): hora UTC + longitud/15
const solarHour = lon => { const d = new Date(); return ((d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15) % 24 + 24) % 24 }

// posición y color del sol (o de la luna) para MapLibre: [distancia, acimut desde el norte, ángulo desde el cenit]
function sunLight(lat, lon) {
  const h = solarHour(lon), day = h >= 6 && h < 18.5
  if (!day) return { key: 'noche', night: true, light: { anchor: 'map', color: '#9db2ff', intensity: 0.28, position: [1.5, 200, 40] } }
  const t = Math.min(1, Math.max(0, (h - 6) / 12.5))            // 0 = amanecer, 1 = atardecer
  const alt = Math.max(8, 72 * Math.sin(Math.PI * t))            // altura del sol en grados
  const az = lat >= 0 ? 90 + t * 180 : (450 - t * 180) % 360     // este → sur (o norte en el hemisferio sur) → oeste
  const low = alt < 25                                           // sol bajo: luz cálida y sombras largas
  return { key: (low ? 'bajo' : 'alto') + Math.round(az / 15), night: false,
    light: { anchor: 'map', color: low ? '#ffb47a' : '#fff3df', intensity: low ? 0.42 : 0.55, position: [1.5, az, 90 - alt] } }
}

// patrón de ventanas (32×32 px dibujado al vuelo, ~4 KB en memoria y 0 bytes de descarga)
function windows() {
  const S = 32, c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d'); g.fillStyle = '#1a2030'; g.fillRect(0, 0, S, S)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let y = 3; y < S; y += 8) for (let x = 3; x < S; x += 7) { const on = rnd() < 0.42
    g.fillStyle = on ? (rnd() < 0.5 ? '#ffd27a' : '#ffe7b3') : '#262e40'; g.fillRect(x, y, 4, 5) }
  return g.getImageData(0, 0, S, S)
}

// aplica la luz del lugar; devuelve una función para llamar al moverse (solo cambia algo si cambió la franja)
export function sunAndCity(m) {
  if (LITE) return () => {}
  let last = ''
  const apply = () => { try {
    const c = m.getCenter(), s = sunLight(c.lat, c.lng), k = s.key + '|' + Math.round(c.lng / 7.5)
    if (k === last || !m.getLayer('edificios')) return; last = k
    m.setLight(s.light)
    if (s.night) { if (!m.hasImage('ventanas')) m.addImage('ventanas', windows(), { pixelRatio: 2 }); m.setPaintProperty('edificios', 'fill-extrusion-pattern', 'ventanas') }
    else m.setPaintProperty('edificios', 'fill-extrusion-pattern', undefined)
  } catch { /* estilo aún cargando */ } }
  return apply
}

// un solo giro lento alrededor del punto (8 s); se detiene solo si la persona toca el mapa
export function orbit(m) {
  if (CALM) return
  try { m.easeTo({ bearing: m.getBearing() + 70, pitch: Math.min(62, m.getMaxPitch()), duration: 8000, easing: t => t }) } catch { /* mapa cerrado */ }
}

import { cityInfo } from './data'
export function ago(t) {
  const s = Math.max(1, Math.round((Date.now() - t) / 60000))
  if (s < 60) return `hace ${s} min`
  const h = Math.round(s / 60); if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}
export function km(a, b) {
  const R = 6371, r = x => x * Math.PI / 180
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export const geo = p => cityInfo(p.city)
export const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + ' k' : String(n)
export const TYPE = { usuario: 'Publicación de usuario', verificada: 'Noticia verificada', directo: 'En vivo' }

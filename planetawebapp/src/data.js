export const ME = { name: 'Tú', handle: 'yo', city: 'Bogotá', country: 'Colombia', lon: -74.07, lat: 4.71, initials: 'TÚ', hue: 165 }

export const CATEGORIES = [
  { id: 'eventos', label: 'Eventos' },
  { id: 'lugares', label: 'Lugares' },
  { id: 'planes', label: 'Planes' },
  { id: 'noticias', label: 'Noticias' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'ciencia', label: 'Ciencia y tecnología' },
  { id: 'cotidiano', label: 'Vida cotidiana' },
  { id: 'situaciones', label: 'Situaciones' },
]
export const catLabel = id => CATEGORIES.find(c => c.id === id)?.label ?? id

export const CITIES = [
  ['Bogotá', 'Colombia', -74.07, 4.71], ['Medellín', 'Colombia', -75.57, 6.24], ['Cartagena', 'Colombia', -75.51, 10.39],
  ['Cali', 'Colombia', -76.53, 3.45], ['Ciudad de México', 'México', -99.13, 19.43], ['Buenos Aires', 'Argentina', -58.38, -34.6],
  ['Lima', 'Perú', -77.04, -12.05], ['Madrid', 'España', -3.7, 40.42], ['Barcelona', 'España', 2.17, 41.39],
  ['París', 'Francia', 2.35, 48.86], ['Lisboa', 'Portugal', -9.14, 38.72], ['Nueva York', 'Estados Unidos', -74, 40.71],
  ['Tokio', 'Japón', 139.69, 35.69], ['Seúl', 'Corea del Sur', 126.98, 37.57], ['Ciudad del Cabo', 'Sudáfrica', 18.42, -33.92],
  ['Reikiavik', 'Islandia', -21.9, 64.15], ['Sídney', 'Australia', 151.21, -33.87], ['Marrakech', 'Marruecos', -7.99, 31.63],
].map(([city, country, lon, lat]) => ({ city, country, lon, lat }))
// Places registry: any city in the world, learned from posts and people (lat/lon/country come from the server)
const REG = new Map()
export function registerPlaces(list) { for (const p of list || []) if (p && p.city && p.lat != null && p.lon != null && !REG.has(p.city)) REG.set(p.city, { city: p.city, country: p.country || '', lat: +p.lat, lon: +p.lon }) }
export const cityInfo = name => REG.get(name) || CITIES.find(c => c.city === name) || { city: name || '', country: '', lat: 0, lon: 0 }
export const homeOf = u => u && u.lat != null ? { city: u.city, country: u.country || '', lat: +u.lat, lon: +u.lon } : cityInfo(u?.city || 'Bogotá')

// "Scenes": flat illustrative gradients standing in for photos
export const SCENES = {
  concierto: 'radial-gradient(circle at 50% 18%, #f2d6a2 0 4%, transparent 22%), radial-gradient(ellipse at 50% 120%, #1a1420 0 45%, transparent 46%), linear-gradient(180deg, #3b2a4a, #1b1526 70%)',
  playa: 'radial-gradient(circle at 75% 30%, #f6e2b8 0 6%, transparent 7%), linear-gradient(180deg, #8fb3c4 0 52%, #3f7d8f 52% 72%, #d8c4a0 72%)',
  montana: 'linear-gradient(160deg, transparent 55%, #2b3a3f 55%), linear-gradient(200deg, transparent 50%, #3c4f55 50%), linear-gradient(180deg, #a9bcc4, #dfe6e4)',
  aurora: 'radial-gradient(ellipse at 30% 30%, #4fae9a88, transparent 45%), radial-gradient(ellipse at 70% 20%, #6c7fd088, transparent 40%), linear-gradient(180deg, #0f1a2a, #18263a 70%, #0b0f16 70%)',
  ciudad: 'linear-gradient(0deg, #1b2027 0 30%, transparent 30%), repeating-linear-gradient(90deg, #2a313b 0 18px, #222830 18px 34px), linear-gradient(180deg, #c98b6b, #6a4c5c)',
  estadio: 'radial-gradient(ellipse at 50% 85%, #3f7a4a 0 35%, transparent 36%), linear-gradient(180deg, #1c2430 0 40%, #2c3644 40%)',
  ciencia: 'radial-gradient(circle at 50% 50%, #c9d6e6 0 3%, transparent 4%), radial-gradient(circle at 50% 50%, transparent 0 18%, #5e7894 18.5% 19.5%, transparent 20%), radial-gradient(circle at 50% 50%, transparent 0 30%, #44586e 30.5% 31.5%, transparent 32%), linear-gradient(180deg, #121a24, #1d2a38)',
  mercado: 'repeating-linear-gradient(90deg, #c46a4a 0 26px, #e2c290 26px 52px, #5f8a6a 52px 78px), linear-gradient(#0000, #0000)',
  cafe: 'radial-gradient(circle at 50% 60%, #6b4a35 0 16%, #e8dccb 16.5% 22%, transparent 22.5%), linear-gradient(180deg, #b49a7e, #7d6650)',
  calle: 'linear-gradient(180deg, #9aa5ad 0 45%, #59636b 45% 100%), linear-gradient(90deg, transparent 48%, #e9e2c8 48% 52%, transparent 52%)',
  desierto: 'radial-gradient(circle at 70% 28%, #f7e3b5 0 7%, transparent 8%), linear-gradient(170deg, transparent 60%, #b77a4a 60%), linear-gradient(190deg, transparent 55%, #d29a62 55%), linear-gradient(180deg, #e9b98a, #f2d3a9)',
  bosque: 'repeating-linear-gradient(100deg, #24382e 0 14px, #2f4a3b 14px 30px), linear-gradient(180deg, #8fae96, #3b5a47)',
}


// Real photos (Unsplash hotlinks). If one fails to load, the illustrated scene is shown instead.
const U = id => `https://images.unsplash.com/photo-${id}?w=1200&q=75&auto=format&fit=crop`
export const PHOTOS = {
  concierto: U('1501386761578-eac5c94b800a'), playa: U('1507525428034-b723cf961d3e'), montana: U('1506905925346-21bda4d32df4'),
  aurora: U('1531366936337-7c912a4589a7'), ciudad: U('1477959858617-67f85cf4f1df'), estadio: U('1459865264687-595d652de67e'),
  ciencia: U('1485827404703-89b55fcc595e'), mercado: U('1488459716781-31db52582fe9'), cafe: U('1495474472287-4d71bcdd2085'),
  calle: U('1449824913935-59a10b8d2000'), desierto: U('1509316785289-025f5b846b35'), bosque: U('1448375240586-882707db888b'),
}
const FEM = ['Valentina','Inés','Lucía','Amira','Camila','Mia','Juliana','Sofía','Laura']
export const avatarUrl = name => {
  if (!name || ['El Tiempo','Reuters','Tú'].includes(name)) return null
  const n = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 90
  return `https://randomuser.me/api/portraits/${FEM.includes(name.split(' ')[0]) ? 'women' : 'men'}/${n}.jpg`
}

const TZ = { 'Bogotá': 'America/Bogota', 'Medellín': 'America/Bogota', 'Cartagena': 'America/Bogota', 'Cali': 'America/Bogota', 'Ciudad de México': 'America/Mexico_City', 'Buenos Aires': 'America/Argentina/Buenos_Aires', 'Lima': 'America/Lima', 'Madrid': 'Europe/Madrid', 'Barcelona': 'Europe/Madrid', 'París': 'Europe/Paris', 'Lisboa': 'Europe/Lisbon', 'Nueva York': 'America/New_York', 'Tokio': 'Asia/Tokyo', 'Seúl': 'Asia/Seoul', 'Ciudad del Cabo': 'Africa/Johannesburg', 'Reikiavik': 'Atlantic/Reykjavik', 'Sídney': 'Australia/Sydney', 'Marrakech': 'Africa/Casablanca' }
export const localTime = city => { try { return new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: TZ[city] }) } catch { return '' } }

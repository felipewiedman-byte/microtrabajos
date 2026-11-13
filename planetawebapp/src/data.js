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
export const cityInfo = name => CITIES.find(c => c.city === name)

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

const m = n => Date.now() - n * 60000
export const SEED_POSTS = [
  { id: 'p1', author: 'Valentina Ríos', handle: 'valerios', hue: 20, city: 'Cartagena', type: 'directo', cat: 'eventos', scene: 'concierto', title: 'Concierto al atardecer en la Ciudad Amurallada', text: 'Están tocando cumbia en vivo frente a la Torre del Reloj. Ambiente increíble, entrada libre hasta las 10 p. m.', at: m(6), likes: 842, comments: [{ a: 'Andrés', t: '¿Hasta qué hora tocan?' }, { a: 'Valentina Ríos', t: 'Hasta las 10, ¡vengan!' }] },
  { id: 'p2', author: 'Kenji Mori', handle: 'kenji', hue: 210, city: 'Tokio', type: 'usuario', cat: 'ciencia', scene: 'ciencia', title: 'Un robot que dobla ropa en 30 segundos', text: 'Lo presentaron hoy en una feria de robótica en Odaiba. Lo probé con mi chaqueta y funcionó.', at: m(38), likes: 2310, comments: [{ a: 'Laura', t: 'Lo necesito en mi casa.' }] },
  { id: 'p3', author: 'El Tiempo', handle: 'eltiempo', hue: 0, city: 'Bogotá', type: 'verificada', cat: 'noticias', scene: 'ciudad', title: 'Bogotá abre 12 km nuevos de ciclovía permanente', text: 'La nueva ruta conecta el norte con el centro y estará habilitada desde este domingo.', at: m(55), likes: 1204, comments: [] },
  { id: 'p4', author: 'Inés Duarte', handle: 'inesd', hue: 330, city: 'Lisboa', type: 'usuario', cat: 'lugares', scene: 'calle', title: 'Un mirador escondido en Alfama', text: 'Subiendo por las escaleras detrás de la catedral encontré este mirador sin turistas. Vista completa del Tajo.', at: m(80), likes: 960, comments: [{ a: 'Mateo', t: 'Guardado para mi viaje.' }] },
  { id: 'p5', author: 'Santiago Gómez', handle: 'santig', hue: 140, city: 'Medellín', type: 'usuario', cat: 'planes', scene: 'montana', title: 'Busco gente para subir al Cerro Quitasol el sábado', text: 'Salimos a las 6 a. m. desde Bello. Ritmo tranquilo, unas 4 horas ida y vuelta. ¿Quién se apunta?', at: m(95), likes: 134, joined: 7, comments: [{ a: 'Camila', t: '¡Yo voy!' }] },
  { id: 'p6', author: 'Lucía Fernández', handle: 'luciaf', hue: 280, city: 'Buenos Aires', type: 'directo', cat: 'deportes', scene: 'estadio', title: 'Superclásico: el estadio está lleno', text: 'Faltan 20 minutos para el inicio. Así se ve desde la tribuna.', at: m(12), likes: 5320, comments: [] },
  { id: 'p7', author: 'Björn Sigurðsson', handle: 'bjorn', hue: 190, city: 'Reikiavik', type: 'usuario', cat: 'lugares', scene: 'aurora', title: 'Auroras boreales visibles desde la ciudad', text: 'Esta noche se ven sin salir de Reikiavik. Mejor punto: el faro de Grótta.', at: m(140), likes: 7800, comments: [{ a: 'Sofía', t: 'Qué maravilla.' }] },
  { id: 'p8', author: 'Diego Herrera', handle: 'diegoh', hue: 35, city: 'Ciudad de México', type: 'usuario', cat: 'cotidiano', scene: 'mercado', title: 'El mercado de Coyoacán un domingo', text: 'Tostadas, música y artesanías. Si vienen, prueben las de pata en el puesto 14.', at: m(200), likes: 640, comments: [] },
  { id: 'p9', author: 'Amira Benali', handle: 'amira', hue: 45, city: 'Marrakech', type: 'usuario', cat: 'lugares', scene: 'desierto', title: 'Primera noche en el desierto de Agafay', text: 'A 40 minutos de Marrakech. El silencio aquí es otra cosa.', at: m(260), likes: 1900, comments: [] },
  { id: 'p10', author: 'Camila Torres', handle: 'camit', hue: 350, city: 'Bogotá', type: 'usuario', cat: 'planes', scene: 'cafe', title: 'Intercambio de idiomas hoy en Chapinero', text: 'Inglés, francés y portugués. 6 p. m. en un café de la 57. Somos 12, caben más.', at: m(30), likes: 88, joined: 12, comments: [] },
  { id: 'p11', author: 'Reuters', handle: 'reuters', hue: 25, city: 'Madrid', type: 'verificada', cat: 'noticias', scene: 'ciudad', title: 'Madrid estrena su primer bosque urbano en altura', text: 'El jardín vertical cubre seis edificios del centro y reduce la temperatura de la calle hasta 4 °C.', at: m(320), likes: 3100, comments: [] },
  { id: 'p12', author: 'Andrés Pardo', handle: 'apardo', hue: 100, city: 'Bogotá', type: 'usuario', cat: 'situaciones', scene: 'calle', title: 'Cierre por obras en la carrera Séptima', text: 'Cerrado el carril entre calles 45 y 53 hasta las 6 p. m. Mejor tomar la Caracas.', at: m(18), likes: 52, comments: [] },
  { id: 'p13', author: 'Mia Chen', handle: 'miachen', hue: 260, city: 'Sídney', type: 'usuario', cat: 'eventos', scene: 'playa', title: 'Cine al aire libre en Bondi', text: 'Esta semana proyectan clásicos frente al mar. Lleven manta.', at: m(410), likes: 720, comments: [] },
  { id: 'p14', author: 'Juliana Restrepo', handle: 'julir', hue: 160, city: 'Cali', type: 'directo', cat: 'eventos', scene: 'concierto', title: 'Salsa en vivo en el Bulevar del Río', text: 'Orquesta en tarima y cientos de parejas bailando. ¡Cali es Cali!', at: m(4), likes: 410, comments: [] },
]

export const CONVERSATIONS = [
  { id: 'c1', title: 'Viajeros por Colombia', members: 18400, last: 'Alguien ha ido a Caño Cristales en noviembre?', hue: 160 },
  { id: 'c2', title: 'Descubrimientos científicos', members: 9200, last: 'El robot de Tokio ya está en el feed.', hue: 210 },
  { id: 'c3', title: 'Planes en Bogotá', members: 6100, last: 'Intercambio de idiomas hoy a las 6.', hue: 350 },
  { id: 'c4', title: 'Fotografía de paisajes', members: 22700, last: 'Las auroras de Reikiavik son de otro planeta.', hue: 190 },
  { id: 'c5', title: 'Fútbol sudamericano', members: 31500, last: 'Superclásico en directo, ¿quién lo está viendo?', hue: 280 },
]

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

export const TZ = { 'Bogotá': 'America/Bogota', 'Medellín': 'America/Bogota', 'Cartagena': 'America/Bogota', 'Cali': 'America/Bogota', 'Ciudad de México': 'America/Mexico_City', 'Buenos Aires': 'America/Argentina/Buenos_Aires', 'Lima': 'America/Lima', 'Madrid': 'Europe/Madrid', 'Barcelona': 'Europe/Madrid', 'París': 'Europe/Paris', 'Lisboa': 'Europe/Lisbon', 'Nueva York': 'America/New_York', 'Tokio': 'Asia/Tokyo', 'Seúl': 'Asia/Seoul', 'Ciudad del Cabo': 'Africa/Johannesburg', 'Reikiavik': 'Atlantic/Reykjavik', 'Sídney': 'Australia/Sydney', 'Marrakech': 'Africa/Casablanca' }
export const localTime = city => { try { return new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: TZ[city] }) } catch { return '' } }

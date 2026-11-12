// Constructor de páginas: tipos de sección, sus campos editables, contenido por defecto y ayudantes de renderizado.
const { settings } = require('./db');
const Plans = require('./plans');

const BG = [['white', 'Blanco'], ['gray', 'Gris claro'], ['mint', 'Verde menta'], ['dark', 'Oscuro'], ['brand', 'Color de marca']];
const BTN_HINT = 'Uno por línea: Texto | enlace | estilo (primary, secondary, inverse o dark). Ej.: Crear mi catálogo | /registro | primary';
const ICONS = 'chat, box, percent, clock, chart, users, card, qr, instagram, messenger, globe, store, share, zap, shield, star, smile, tag, truck, image, link, phone, lock';
const VISUALS = [['', 'Ninguna'], ['panel-compartir', 'Captura: compartir'], ['panel-pedidos', 'Captura: pedidos'], ['panel-resumen', 'Captura: resumen'], ['shop-desktop', 'Captura: catálogo (escritorio)'], ['phones', 'Dos celulares con el catálogo'], ['upload', 'Mi propia imagen']];

const common = [['anchor', 'Ancla para el menú (opcional)', 'text', 'Ej.: como → se enlaza con /#como'], ['bg', 'Fondo', 'select', BG]];
const TYPES = {
  hero: { label: 'Portada', fields: [
    ['pill', 'Etiqueta superior', 'text'], ['title', 'Título', 'text'], ['hl', 'Parte destacada del título', 'text'], ['lead', 'Texto de apoyo', 'textarea'],
    ['buttons', 'Botones', 'lines', BTN_HINT], ['checks', 'Puntos de confianza (uno por línea)', 'lines'], ['showPrice', 'Mostrar “Planes desde $X al mes”', 'check'],
    ['visual', 'Imagen de la derecha', 'select', [['app', 'Capturas de la app'], ['upload', 'Mi propia imagen'], ['', 'Ninguna']]], ['image', 'Mi propia imagen', 'image']] },
  strip: { label: 'Franja de canales', fields: [['label', 'Texto', 'text'], ['items', 'Elementos (icono | texto)', 'lines', 'Iconos: ' + ICONS], ...common] },
  steps: { label: 'Pasos numerados', fields: [['kicker', 'Etiqueta', 'text'], ['title', 'Título', 'text'], ['sub', 'Subtítulo', 'text'], ['items', 'Pasos (Título | Texto)', 'lines'], ...common] },
  features: { label: 'Tarjetas de funciones', fields: [['kicker', 'Etiqueta', 'text'], ['title', 'Título', 'text'], ['sub', 'Subtítulo', 'text'], ['items', 'Tarjetas (icono | Título | Texto)', 'lines', 'Iconos: ' + ICONS], ...common] },
  split: { label: 'Texto con imagen', fields: [['kicker', 'Etiqueta', 'text'], ['title', 'Título', 'text'], ['text', 'Texto', 'textarea'], ['bullets', 'Lista de puntos (uno por línea)', 'lines'], ['buttons', 'Botones', 'lines', BTN_HINT],
    ['visual', 'Imagen', 'select', VISUALS], ['image', 'Mi propia imagen', 'image'], ['side', 'Imagen a la…', 'select', [['left', 'Izquierda'], ['right', 'Derecha']]], ...common] },
  pricing: { label: 'Planes y precios', fields: [['kicker', 'Etiqueta', 'text'], ['title', 'Título', 'text'], ['sub', 'Subtítulo', 'text'], ...common] },
  faq: { label: 'Preguntas frecuentes', fields: [['kicker', 'Etiqueta', 'text'], ['title', 'Título', 'text'], ['items', 'Preguntas (Pregunta | Respuesta)', 'lines'], ...common] },
  cta: { label: 'Llamado a la acción', fields: [['title', 'Título', 'text'], ['sub', 'Texto', 'text'], ['buttons', 'Botones', 'lines', BTN_HINT], ...common] },
  text: { label: 'Texto libre', fields: [['title', 'Título', 'text'], ['body', 'Contenido', 'textarea', 'Párrafos separados por una línea en blanco. “## Título” para subtítulos, “- ” para listas, **negrita**.'], ['narrow', 'Columna angosta (lectura)', 'check'], ...common] },
  html: { label: 'HTML propio', fields: [['html', 'Código HTML', 'textarea', 'Se permiten etiquetas de texto, listas, enlaces, imágenes y tablas. Se eliminan scripts, formularios, iframes y estilos por seguridad.'], ...common] },
};

// ---------- Contenido inicial de la página de inicio ----------
const home = () => [
  { type: 'hero', pill: 'Nuevo · Tu catálogo en Facebook e Instagram Shops', title: 'Tu catálogo profesional, ', hl: 'en un solo link',
    lead: 'Crea tu tienda en minutos, compártela en WhatsApp, Instagram y Facebook, y recibe cada pedido ordenado: productos, total y dirección de entrega.',
    buttons: 'Crear mi catálogo | /registro | primary\nVer cómo funciona | #como | secondary', checks: 'Sin comisión por ventas\nPrueba gratis de {dias} días, sin tarjeta\nListo en 5 minutos', showPrice: '1', visual: 'app' },
  { type: 'strip', label: 'Vende donde ya están tus clientes', items: 'chat | WhatsApp\ninstagram | Instagram\nglobe | Facebook\nmessenger | Messenger\nqr | Código QR', bg: 'white' },
  { type: 'steps', anchor: 'como', kicker: 'Cómo funciona', title: 'De cero a vender, en tres pasos', sub: 'Sin conocimientos técnicos, desde tu celular.', bg: 'dark',
    items: 'Arma tu catálogo | Sube fotos y precios, define tu horario y escribe cómo recibes los pagos. Tu marca, tus colores.\nComparte tu link | En WhatsApp, Instagram, Facebook o con un código QR en tu local. Se ve bien en cualquier red.\nRecibe pedidos ordenados | Tu cliente elige y el pedido te llega por WhatsApp o Messenger, con total y dirección. Tú confirmas.' },
  { type: 'pricing', anchor: 'precios', kicker: 'Precios', title: 'Precios claros, sin sorpresas', sub: 'Sin comisión por cada venta. Pagas solo el plan, y cambias o cancelas cuando quieras.', bg: 'mint' },
  { type: 'features', anchor: 'funciones', kicker: 'Funciones', title: 'Todo lo que tu negocio necesita para vender', sub: 'Sin complicaciones y sin pagar de más.', bg: 'white',
    items: 'chat | Pedidos por WhatsApp y Messenger | El mensaje sale escrito con productos, total, nombre y dirección. No pierdes ni un detalle.\nbox | Inventario automático | Cada pedido descuenta existencias. Cuando se acaba, el producto aparece como agotado.\npercent | Cupones y ofertas | Códigos de descuento, precios rebajados y productos destacados para mover tu inventario.\nclock | Horario y “abierto ahora” | Tus clientes ven si estás atendiendo y cuándo vuelves a abrir, en tu zona horaria.\nchart | Visitas, ventas y clientes | Mira cuánta gente entra, qué se pide más, cuánto vendes y quiénes son tus mejores clientes.\nqr | Código QR y enlaces | Un link con tu nombre, un QR para tu local y un enlace por cada producto.' },
  { type: 'split', anchor: 'redes', kicker: 'Redes sociales', title: 'Listo para publicar en todas tus redes', text: 'Cada producto tiene su propio link y su texto para publicar. Tu catálogo se ve con foto y precio cuando lo compartes.',
    bullets: 'Link con vista previa en WhatsApp, Facebook y Telegram\nImagen lista para tus estados e historias\nCódigo QR para tu mostrador, empaques y volantes\nTienda en Facebook e Instagram: tus productos en un solo archivo', buttons: 'Probar ahora | /registro | inverse', visual: 'panel-compartir', side: 'left', bg: 'brand' },
  { type: 'split', kicker: 'Tu cliente, sin fricción', title: 'Compra en segundos, sin crear cuenta', text: 'Abre tu link, elige, y envía el pedido. Tu cliente ve cómo pagarte y tú recibes todo ordenado. Sin registros ni descargas.',
    bullets: 'Carrito, cupón, recoger o domicilio\nElige cómo pagar y ve tus datos con botón Copiar\nFunciona en cualquier celular, rápido y liviano', visual: 'phones', side: 'right', bg: 'gray' },
  { type: 'faq', kicker: 'Preguntas', title: 'Preguntas frecuentes', bg: 'white',
    items: '¿Mis clientes necesitan crear una cuenta? | No. Abren tu link, eligen y envían el pedido.\n¿Cómo me pagan mis clientes? | Como ya lo haces: transferencia, Nequi, efectivo o contra entrega. Tú escribes cómo cobras y el cliente elige su forma de pago al pedir. El dinero va directo a ti; nosotros no lo manejamos.\n¿Cobran comisión por mis ventas? | No. Solo pagas el plan mensual.\n¿Sirve para servicios (peluquería, taller, clases)? | Sí. Puedes listar servicios con su precio y recibir las solicitudes por WhatsApp.\n¿Funciona en mi país? | Sí. Eliges tu moneda y tu zona horaria, y el WhatsApp con el código de tu país.\n¿Mis datos y los de mis clientes están seguros? | Las contraseñas se guardan cifradas, los datos de cada pedido solo los ve el negocio al que se le hizo, y puedes eliminar tu cuenta y todos tus datos cuando quieras.' },
  { type: 'cta', title: 'Pon tu negocio a la vista hoy', sub: 'Crea tu catálogo en minutos y compártelo en tu próximo estado de WhatsApp.', buttons: 'Crear mi catálogo | /registro | inverse', bg: 'dark' },
];
const legal = (kind) => [{ type: 'text', narrow: '1', bg: 'white', title: kind === 'terminos' ? 'Términos de uso' : 'Política de privacidad', body: kind === 'terminos'
  ? 'Texto base de referencia. Debe ser revisado por un abogado de tu país antes de lanzar.\n\n## 1. El servicio\n{sitio} permite a negocios crear un catálogo en línea y recibir pedidos por WhatsApp o Messenger. No participamos en la venta, el cobro, el envío ni la entrega: eso ocurre directamente entre el negocio y su cliente.\n\n## 2. Responsabilidad del negocio\nCada negocio es responsable de la veracidad de sus productos, precios, disponibilidad, permisos, impuestos y del cumplimiento de la ley aplicable en su país.\n\n## 3. Contenido prohibido\nNo se permite publicar productos o servicios ilegales, falsificados, peligrosos o que infrinjan derechos de terceros. Podemos pausar o eliminar catálogos que incumplan estas reglas.\n\n## 4. Planes y pagos\nLa prueba gratuita se ofrece una sola vez por persona. Al terminar, el catálogo se pausa hasta contratar un plan; los datos se conservan. Los planes se cobran por periodos y pueden cancelarse en cualquier momento.\n\n## 5. Disponibilidad\nHacemos lo posible por mantener el servicio disponible, pero no garantizamos que funcione sin interrupciones.\n\n## 6. Cambios\nPodemos actualizar estos términos. Los cambios importantes se avisarán con anticipación.'
  : 'Texto base de referencia. Debe ser revisado por un abogado de tu país antes de lanzar.\n\n## Datos que guardamos\nDe los negocios: nombre, correo, contraseña (cifrada), datos del catálogo y pedidos recibidos. De los clientes finales: el nombre, teléfono opcional, dirección de entrega y notas que escriben al hacer un pedido.\n\n## Para qué los usamos\nPara prestar el servicio: mostrar el catálogo, registrar los pedidos y enviarte avisos de tu cuenta. No vendemos datos personales.\n\n## Quién los ve\nLos datos de un pedido los ve únicamente el negocio al que se le hizo. Usamos proveedores de infraestructura y correo estrictamente para operar el servicio.\n\n## Tus derechos\nPuedes corregir tus datos y eliminar tu cuenta desde el panel; al hacerlo se borran tu catálogo, imágenes y pedidos.\n\n## Prueba gratis\nPara que la prueba gratis se use una sola vez por persona, guardamos una huella cifrada (hash) de tu correo y de tu número de WhatsApp. No permite recuperar el dato original y se conserva aunque elimines tu cuenta.\n\n## Cookies\nUsamos cookies solo necesarias para iniciar sesión y proteger los formularios. No usamos cookies de publicidad.' }];
const DEFAULT_PAGES = { home: () => ({ title: '', descr: '', blocks: home() }), terminos: () => ({ title: 'Términos de uso', descr: '', blocks: legal('terminos') }), privacidad: () => ({ title: 'Política de privacidad', descr: '', blocks: legal('privacidad') }) };

// ---------- Ayudantes para las vistas ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const cols = (line, n) => { const p = String(line).split('|').map((x) => x.trim()); const head = p.slice(0, n - 1); head.push(p.slice(n - 1).join(' | ')); while (head.length < n) head.push(''); return head; };
const safeUrl = (u) => { u = String(u || '').trim(); return /^(\/(?!\/)|#|https:\/\/|http:\/\/|mailto:|tel:)/i.test(u) ? u : '#'; };
const BTN = { primary: 'btn btn-p btn-lg', secondary: 'btn btn-lg', inverse: 'btn btn-inv btn-lg', dark: 'btn btn-d btn-lg' };
const buttons = (s) => lines(s).map((l) => { const [text, url, style] = cols(l, 3); return { text, url: safeUrl(url), cls: BTN[style] || BTN.primary }; }).filter((b) => b.text);
function tokens() {
  const st = settings(), paid = Plans.list().filter((p) => p.active && p.price > 0), trial = Plans.get('trial');
  const min = paid.length ? Math.min(...paid.map((p) => p.price)) : 0;
  return { sitio: st.site_name, dias: trial ? trial.days : 0, desde: String(min), moneda: Plans.currency(), anio: String(new Date().getFullYear()) };
}
const tok = (s) => { const t = tokens(); return String(s ?? '').replace(/\{(sitio|dias|desde|moneda|anio)\}/g, (_, k) => t[k]); };
// Texto libre → HTML seguro (títulos "## ", listas "- ", negrita **x**).
function rich(s) {
  const inline = (t) => esc(tok(t)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return String(s || '').split(/\n\s*\n/).map((b) => {
    const ls = b.split(/\r?\n/).map((x) => x.trimEnd()).filter((x) => x.trim());
    if (!ls.length) return '';
    if (/^##\s/.test(ls[0])) return `<h2>${inline(ls[0].replace(/^##\s+/, ''))}</h2>` + (ls.length > 1 ? `<p>${ls.slice(1).map(inline).join('<br>')}</p>` : '');
    if (ls.every((x) => /^-\s/.test(x))) return '<ul>' + ls.map((x) => `<li>${inline(x.replace(/^-\s+/, ''))}</li>`).join('') + '</ul>';
    return `<p>${ls.map(inline).join('<br>')}</p>`;
  }).join('');
}
const bgClass = (bg) => ({ gray: 'band-gray', mint: 'band-mint', dark: 'band-dark', brand: 'band-brand' }[bg] || '');
module.exports = { TYPES, BG, DEFAULT_PAGES, esc, lines, cols, safeUrl, buttons, tok, rich, bgClass, tokens };

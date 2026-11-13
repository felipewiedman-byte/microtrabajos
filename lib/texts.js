// Textos del sistema editables desde Admin → Textos: ingreso, catálogo público, mensaje de WhatsApp, correos y errores.
const { settings } = require('./db');
const B = require('./blocks');

// [grupo, clave, etiqueta, valor por defecto, tipo]
const LIST = [
  ['Ingreso y registro', 'auth_side_title', 'Panel izquierdo: título', 'Tu negocio, a la vista de todos.', 'text'],
  ['Ingreso y registro', 'auth_side_text', 'Panel izquierdo: texto', 'Un catálogo profesional, un link para compartir y pedidos ordenados en tu WhatsApp.', 'textarea'],
  ['Ingreso y registro', 'auth_side_points', 'Panel izquierdo: puntos (uno por línea)', 'Sin comisión por ventas\nPedidos con total y dirección\nListo para WhatsApp, Instagram y Facebook', 'lines'],
  ['Ingreso y registro', 'reg_title', 'Registro: título', 'Crea tu catálogo', 'text'],
  ['Ingreso y registro', 'reg_sub', 'Registro: subtítulo', 'Prueba gratis de {dias} días, sin tarjeta. Tardas menos de 5 minutos.', 'text'],
  ['Ingreso y registro', 'reg_btn', 'Registro: botón', 'Crear cuenta', 'text'],
  ['Ingreso y registro', 'login_title', 'Ingreso: título', 'Ingresar', 'text'],
  ['Ingreso y registro', 'login_sub', 'Ingreso: subtítulo', 'Bienvenido de nuevo.', 'text'],
  ['Ingreso y registro', 'login_btn', 'Ingreso: botón', 'Ingresar', 'text'],
  ['Ingreso y registro', 'forgot_title', 'Recuperar contraseña: título', 'Recuperar contraseña', 'text'],
  ['Ingreso y registro', 'forgot_sub', 'Recuperar contraseña: subtítulo', 'Te enviaremos un enlace para elegir una nueva contraseña.', 'text'],
  ['Ingreso y registro', 'forgot_btn', 'Recuperar contraseña: botón', 'Enviar enlace', 'text'],
  ['Ingreso y registro', 'forgot_sent', 'Recuperar contraseña: mensaje al enviar', 'Si ese correo tiene una cuenta, te enviamos un enlace para elegir una nueva contraseña. Revisa también el spam.', 'textarea'],
  ['Ingreso y registro', 'create_title', 'Crear negocio: título', 'Cuéntanos de tu negocio', 'text'],
  ['Ingreso y registro', 'create_sub', 'Crear negocio: subtítulo', 'Con esto creamos tu catálogo. Todo se puede cambiar después.', 'text'],
  ['Ingreso y registro', 'create_btn', 'Crear negocio: botón', 'Crear mi catálogo', 'text'],

  ['Catálogo público (lo que ve el cliente)', 'shop_search', 'Buscador', 'Buscar en el catálogo', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_more', 'Botón “más información”', 'Más info', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_share', 'Botón compartir', 'Compartir', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_ask', 'Botón para escribir al negocio', 'Escríbenos', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_ask_msg', 'Mensaje al tocar “Escríbenos” o el botón de WhatsApp ({negocio})', 'Hola, vi el catálogo de {negocio} y tengo una pregunta.', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_ask_product', 'Mensaje al preguntar por un producto ({producto}, {precio})', 'Hola, tengo una pregunta sobre: {producto} ({precio}).', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_add', 'Botón agregar producto', 'Agregar', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_cart', 'Botón del carrito', 'Ver pedido', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_send_wa', 'Botón enviar por WhatsApp', 'Enviar pedido por WhatsApp', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_send_ms', 'Botón enviar por Messenger', 'Enviar por Messenger', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_pay_now', 'Botón pagar en línea', 'Pagar ahora', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_nopay_hint', 'Aviso bajo los botones', 'No pagas nada aquí: acuerdas el pago directamente con el negocio.', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_closed', 'Aviso cuando el negocio está cerrado', 'Estamos cerrados ahora. Puedes dejar tu pedido y te responderemos al abrir.', 'textarea'],
  ['Catálogo público (lo que ve el cliente)', 'shop_paused', 'Aviso cuando no recibe pedidos', 'Por ahora este negocio no está recibiendo pedidos. Puedes ver el catálogo.', 'textarea'],
  ['Catálogo público (lo que ve el cliente)', 'shop_done_title', 'Pedido enviado: título ({codigo} = número)', '¡Pedido {codigo} listo!', 'text'],
  ['Catálogo público (lo que ve el cliente)', 'shop_done_msg', 'Pedido enviado: mensaje', 'Se abrirá tu chat con el pedido ya escrito. Solo toca enviar.', 'textarea'],
  ['Catálogo público (lo que ve el cliente)', 'shop_open_wa', 'Pedido enviado: botón de WhatsApp', 'Abrir WhatsApp', 'text'],

  ['Mensajes y correos', 'order_msg', 'Mensaje del pedido que llega al WhatsApp del negocio', '🛒 *Nuevo pedido {codigo}*\n\n{items}\n\n{descuento_linea}\n{envio_linea}\n*Total: {total}*\n{pagado}\n\n👤 {cliente}\n{pago_linea}\n📍 {tipo}\n{nota_linea}', 'textarea',
    'Variables: {codigo} {items} {subtotal} {descuento_linea} {envio_linea} {total} {pagado} {cliente} {pago_linea} {tipo} {nota_linea}. Las líneas vacías se eliminan solas.'],
  ['Mensajes y correos', 'reset_mail_subject', 'Correo de recuperar contraseña: asunto', 'Restablece tu contraseña de {sitio}', 'text'],
  ['Mensajes y correos', 'reset_mail_title', 'Correo de recuperar contraseña: título', 'Restablecer contraseña', 'text'],
  ['Mensajes y correos', 'reset_mail_lines', 'Correo de recuperar contraseña: texto (una línea por párrafo)', 'Recibimos una solicitud para cambiar tu contraseña.\nEl enlace vale 1 hora y solo se puede usar una vez.\nSi no fuiste tú, ignora este mensaje.', 'lines'],
  ['Mensajes y correos', 'reset_mail_button', 'Correo de recuperar contraseña: botón', 'Elegir nueva contraseña', 'text'],
  ['Mensajes y correos', 'receipt_mail_subject', 'Correo de pago de plan: asunto ({plan})', 'Pago recibido: plan {plan}', 'text'],
  ['Mensajes y correos', 'receipt_mail_title', 'Correo de pago de plan: título', '¡Pago recibido!', 'text'],
  ['Mensajes y correos', 'receipt_mail_lines', 'Correo de pago de plan: texto ({plan} {meses} {monto})', 'Activamos tu plan {plan} por {meses}.\nMonto: {monto}.', 'lines'],

  ['Avisos del panel de tus clientes', 'banner_trial', 'Aviso durante la prueba ({restantes} = días que quedan)', 'Prueba gratis: te quedan {restantes}.', 'text'],
  ['Avisos del panel de tus clientes', 'banner_free', 'Aviso cuando terminó la prueba o el plan', 'Tu prueba terminó y tu catálogo está en pausa: tus clientes no pueden verlo. No perdiste nada. Elige un plan para reactivarlo.', 'textarea'],
  ['Avisos del panel de tus clientes', 'banner_link', 'Texto del enlace del aviso', 'Ver planes', 'text'],

  ['Errores', 'err404_title', 'Página no encontrada: título', 'No encontrada', 'text'],
  ['Errores', 'err404_msg', 'Página no encontrada: mensaje', 'La página que buscas no existe o fue movida.', 'textarea'],
  ['Errores', 'err500_title', 'Error del servidor: título', 'Ocurrió un problema', 'text'],
  ['Errores', 'err500_msg', 'Error del servidor: mensaje', 'Intenta de nuevo en unos minutos.', 'textarea'],
];
const BY = Object.fromEntries(LIST.map((x) => [x[1], x]));
// Valor actual (el editado o el original) con las variables {sitio} {dias} {desde} {moneda} y las que pases en `vars`.
function get(key, vars = {}) {
  const d = BY[key]; if (!d) return '';
  const v = settings()['tx_' + key];
  const raw = v === undefined || v === '' ? d[3] : v;
  return B.tok(raw).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
const lines = (key, vars) => get(key, vars).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
module.exports = { LIST, BY, get, lines };

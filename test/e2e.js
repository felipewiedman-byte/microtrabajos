// Prueba de punta a punta: registro, publicación, postulación, pago de prueba, entrega, aprobación, billetera, admin.
// Uso: npm test   (levanta un servidor temporal con una base de datos aislada)
const assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-test-'));
process.env.SEED_DEMO = '0';
process.env.MAIL_QUIET = '1';
process.env.ADMIN_PASSWORD = 'admin12345';
const app = require('../server');
// El flujo completo se prueba con las tarifas normales; la promoción tiene su propia prueba.
require('../lib/db').run("UPDATE settings SET value='0' WHERE key='promo_active'");
// El flujo clásico (pago protegido con comisión) se prueba con ese modelo; el modelo de créditos tiene su propia prueba.
require('../lib/db').run("UPDATE settings SET value='comision' WHERE key='business_model'");

function client(base) {
  let cookie = '', csrf = ''; const jar = {};
  const req = async (method, url, form) => {
    const opts = { method, redirect: 'manual', headers: { cookie } };
    if (form) {
      if (form instanceof FormData) { form.append('_csrf', csrf); opts.body = form; }
      else { opts.headers['content-type'] = 'application/x-www-form-urlencoded'; opts.body = new URLSearchParams({ _csrf: csrf, ...form }); }
    }
    const res = await fetch(base + url, opts);
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const k = kv.split('=')[0]; jar[k] = kv; }
    cookie = Object.values(jar).join('; ');
    const text = await res.text();
    const m = text.match(/name="_csrf" value="([a-f0-9]+)"/); if (m) csrf = m[1];
    return { status: res.status, location: res.headers.get('location'), text };
  };
  return { get: (u) => req('GET', u), post: (u, f) => req('POST', u, f || {}) };
}

(async () => {
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const cli = client(base), wrk = client(base), adm = client(base);
    await cli.get('/registro');
    let r = await cli.post('/registro', { name: 'Cliente Prueba', email: 'c@t.co', country: 'CO', currency: 'USD', password: 'secreto123', password2: 'secreto123', terms: '1' });
    assert.equal(r.location, '/panel', 'registro cliente');
    await wrk.get('/registro');
    r = await wrk.post('/registro', { name: 'Trabajador Prueba', email: 'w@t.co', country: 'CO', currency: 'USD', password: 'secreto123', password2: 'secreto123', terms: '1' });
    assert.equal(r.location, '/panel');

    // Publicar tarea con contacto: se bloquea (modelo Mercado Libre)
    await cli.get('/tareas/nueva');
    const mk = (desc) => { const f = new FormData(); Object.entries({ title: 'Necesito un flyer para evento', category_id: '1', delivery_hours: '24', description: desc, mode: 'single', budget: '10', currency: 'USD' }).forEach(([k, v]) => f.append(k, v)); return f; };
    r = await cli.post('/tareas', mk('Diseñar un flyer de evento. Llamar al 3001234567'));
    assert.ok(!/^\/tareas\/\d+$/.test(r.location || ''), 'publicación con contacto bloqueada');
    r = await cli.get('/tareas/nueva'); assert.ok(r.text.includes('contiene datos de contacto'), 'aviso de bloqueo');
    r = await cli.post('/tareas', mk('Diseñar un flyer para un evento de lanzamiento.'));
    assert.match(r.location, /^\/tareas\/\d+$/, 'publicar tarea');
    const taskUrl = r.location;
    r = await cli.get('/notificaciones'); assert.ok(r.text.includes('Aviso 1 de 5'), 'strike registrado');

    // Postularse
    await wrk.get(taskUrl);
    r = await wrk.post(taskUrl + '/postular', { price: '10', message: 'Tengo 5 años de experiencia en diseño de flyers.' });
    r = await wrk.get(taskUrl); assert.ok(r.text.includes('Tu postulación'), 'postulación');

    // Aceptar y pagar (demo)
    r = await cli.get(taskUrl);
    const appId = r.text.match(/\/postulaciones\/(\d+)\/aceptar/)[1];
    r = await cli.post(`/postulaciones/${appId}/aceptar`);
    assert.match(r.location, /^\/pagar\/\d+$/);
    const payUrl = r.location;
    r = await cli.get(payUrl); assert.ok(r.text.includes('$10.00 USD') && !r.text.includes('Tarifa de servicio'), 'el cliente paga exactamente el precio (sin tarifa)');
    r = await cli.post(payUrl, { provider: 'demo' });
    assert.match(r.location, /^\/pagos\/demo\/\d+$/);
    await cli.get(r.location);
    r = await cli.post(r.location);
    assert.match(r.location, /^\/pedidos\/\d+\?pagado=1$/);
    const orderUrl = r.location.split('?')[0];

    // Entregar
    r = await wrk.get(orderUrl); assert.ok(r.text.includes('Entregar trabajo'));
    const fd2 = new FormData(); fd2.append('text', 'Adjunto el flyer final.'); fd2.append('file', new Blob(['PNGDATA']), 'flyer.png');
    r = await wrk.post(orderUrl + '/entregar', fd2);
    r = await cli.get(orderUrl); assert.ok(r.text.includes('Aprobar y liberar pago'));
    const fileName = r.text.match(/\/archivos\/([a-f0-9]+\.png)/)[1];
    const outsider = client(base); await outsider.get('/registro');
    await outsider.post('/registro', { name: 'Otra Persona', email: 'o@t.co', country: 'CO', currency: 'USD', password: 'secreto123', password2: 'secreto123', terms: '1' });
    r = await outsider.get('/archivos/' + fileName); assert.equal(r.status, 404, 'archivo privado');
    r = await cli.get('/archivos/' + fileName); assert.equal(r.status, 200);

    // Corrección, nueva entrega y aprobación
    await cli.post(orderUrl + '/correccion', { text: 'Cambiar el color del fondo por favor' });
    const fd3 = new FormData(); fd3.append('text', 'Corregido.'); await wrk.get(orderUrl); await wrk.post(orderUrl + '/entregar', fd3);
    await cli.get(orderUrl);
    await cli.post(orderUrl + '/aprobar');
    r = await cli.get(orderUrl); assert.ok(r.text.includes('Califica al trabajador'));
    await cli.post(orderUrl + '/calificar', { rating: '5', comment: 'Excelente' });

    // Billetera: $10 - 8% = $9.20 en liberación
    r = await wrk.get('/billetera'); assert.ok(r.text.includes('+$9.20 USD'), 'ganancia neta (92 %)');
    r = await wrk.post('/billetera/retiro', { amount: '8', method: 'nequi', account: '3001112233' });
    r = await wrk.get('/billetera'); assert.ok(r.text.includes('verificar tu identidad'), 'retiro exige verificación');

    // Admin
    await adm.get('/ingresar');
    r = await adm.post('/ingresar', { email: 'admin@microtrabajo.local', password: 'admin12345', next: '/admin' });
    r = await adm.get('/admin'); assert.ok(r.text.includes('$0.80 USD'), 'ingresos plataforma (comisión 8 %)');
    for (const p of ['/admin/usuarios', '/admin/tareas', '/admin/pedidos', '/admin/disputas', '/admin/finanzas', '/admin/configuracion']) assert.equal((await adm.get(p)).status, 200, p);
    // Servicio a precio fijo + disputa resuelta por el admin
    await wrk.get('/servicios/nuevo');
    r = await wrk.post('/servicios', { title: 'Miniatura para YouTube pro', category_id: '1', description: 'Miniatura llamativa en 1280x720 con 2 correcciones.', price: '6', delivery_hours: '24', revisions: '2' });
    const gigUrl = r.location; assert.match(gigUrl, /^\/servicios\/\d+$/);
    await cli.get(gigUrl);
    r = await cli.post(gigUrl + '/comprar', { brief: 'Video sobre recetas' });
    await cli.post(r.location, { provider: 'demo' });
    const pid = r.location.split('/').pop();
    await cli.get('/pagos/demo/' + pid); r = await cli.post('/pagos/demo/' + pid);
    const order2 = r.location.split('?')[0];
    await cli.get(order2);
    await cli.post(order2 + '/disputa', { reason: 'El trabajador no responde desde hace dos días.' });
    r = await adm.get('/admin/disputas');
    const did = r.text.match(/\/admin\/disputas\/(\d+)/)[1];
    await adm.post('/admin/disputas/' + did, { decision: 'client', note: 'Sin entrega' });
    r = await cli.get(order2); assert.ok(r.text.includes('Reembolsado'), 'disputa reembolsada');
    r = await adm.get('/admin/finanzas'); assert.ok(r.text.includes('Marcar reembolsado'));

    // Pregunta pública y oferta personalizada pagada dentro de la web
    await cli.get(gigUrl);
    r = await cli.post('/preguntas', { type: 'gig', id: gigUrl.split('/').pop(), text: '¿Puedes hacer 3 miniaturas en vez de una?' });
    r = await wrk.get(gigUrl); assert.ok(r.text.includes('3 miniaturas'), 'pregunta pública visible');
    const qid = r.text.match(/\/preguntas\/(\d+)\/responder/)[1];
    await wrk.post(`/preguntas/${qid}/responder`, { answer: 'Sí, te envío una oferta.', offer_price: '15', offer_hours: '48' });
    r = await cli.get(gigUrl); assert.ok(r.text.includes('Ver y pagar'), 'oferta pagable');
    const offerOrder = r.text.match(/href="(\/pedidos\/\d+)">Ver y pagar/)[1];
    r = await cli.get(offerOrder); assert.ok(r.text.includes('Pagar $15.00 USD'), 'oferta sin tarifa al cliente');
    r = await wrk.post(`/preguntas/${qid}/responder`, { answer: 'mi correo es pepe arroba gmail punto com' });
    r = await wrk.get(gigUrl); assert.ok(!r.text.includes('pepe') && r.text.includes('contiene datos de contacto'), 'respuesta con contacto bloqueada');

    r = await cli.get('/admin'); assert.equal(r.status, 403, 'admin protegido');

    // Panel: apariencia (color + logo), textos, secciones, métricas
    await adm.get('/admin/apariencia');
    const ap = new FormData();
    ap.append('site_name', 'MiMarca'); ap.append('font', 'Roboto'); ap.append('color_brand', '#0f766e');
    ['paths', 'categories', 'tasks', 'figures', 'how', 'gigs', 'features', 'payments', 'cta'].forEach((k) => ap.append('show_' + k, '1')); // planes ocultos
    ap.append('logo_color', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'logo.png');
    r = await adm.post('/admin/apariencia', ap);
    r = await adm.get('/');
    assert.ok(r.text.includes('--brand:#0f766e') && r.text.includes('MiMarca') && !r.text.includes('fonts.googleapis.com'), 'apariencia aplicada');
    const logo = r.text.match(/\/media\/([a-f0-9]+\.png)/)[1];
    assert.equal((await fetch(base + '/media/' + logo)).status, 200, 'logo público');
    assert.ok(!r.text.includes('Empieza gratis, crece cuando lo necesites'), 'sección de planes oculta');
    // Subir varias imágenes a la vez (logo blanco + favicon) y archivos no válidos
    await adm.get('/admin/apariencia');
    const ap2 = new FormData(); ap2.append('site_name', 'MiMarca'); ap2.append('font', 'Roboto'); ap2.append('color_brand', '#0f766e');
    ap2.append('logo_white', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')]), 'blanco.PNG'); ap2.append('favicon', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')]), 'fav.ico');
    r = await adm.post('/admin/apariencia', ap2); assert.equal(r.location, '/admin/apariencia', 'varias imágenes a la vez');
    r = await adm.get('/admin/apariencia'); assert.ok(r.text.includes('Apariencia guardada'), 'guardado sin error');
    const ap3 = new FormData(); ap3.append('logo_color', new Blob(['<svg/>']), 'x.svg');
    r = await adm.post('/admin/apariencia', ap3); r = await adm.get('/admin/apariencia'); assert.ok(r.text.includes('no se subió: x.svg'), 'SVG rechazado con aviso');
    const ap4 = new FormData(); ap4.append('logo_color', new Blob([Buffer.alloc(6 * 1024 * 1024)]), 'grande.png');
    r = await adm.post('/admin/apariencia', ap4); assert.equal(r.status, 302, 'imagen pesada no causa error 500');
    r = await adm.get('/admin/textos'); assert.ok(r.text.includes('home.b1.titulo'), 'textos registrados');
    await adm.post('/admin/textos', { 't:home.b1.titulo': 'Título editado desde el panel' });
    r = await adm.get('/'); assert.ok(r.text.includes('Título editado desde el panel'), 'texto editado');
    await adm.get('/admin/secciones');
    await adm.post('/admin/secciones', { title: 'Sección promocional', body: 'Texto de prueba', bg_color: '#fef3c7', text_color: '#111827', position: 'after_hero', sort: '1', active: '1' });
    r = await adm.get('/'); assert.ok(r.text.includes('Sección promocional'), 'sección personalizada');
    r = await adm.get('/admin/metricas'); assert.ok(r.status === 200 && r.text.includes('Registros por día'), 'métricas');

    // Soporte: el usuario escribe, el admin responde
    await wrk.get('/soporte');
    r = await wrk.post('/soporte', { subject: 'No puedo retirar', text: 'Me sale un error al retirar mi saldo.' });
    const ticketUrl = r.location;
    r = await adm.get('/admin/soporte'); const tid = r.text.match(/\?id=(\d+)/)[1];
    await adm.get('/admin/soporte?id=' + tid);
    await adm.post('/admin/soporte/' + tid, { text: 'Primero verifique su identidad en Cuenta.' });
    r = await wrk.get(ticketUrl); assert.ok(r.text.includes('Primero verifique su identidad'), 'respuesta de soporte');

    // Ficha de usuario, entrar como usuario y volver, eliminar usuario
    const oid = (await outsider.get('/cuenta')).text.match(/\/perfil\/(\d+)/)[1];
    r = await adm.get('/admin/usuarios/' + oid); assert.ok(r.text.includes('Otra Persona'), 'ficha de usuario');
    r = await adm.post(`/admin/usuarios/${oid}/entrar`); assert.equal(r.location, '/panel');
    r = await adm.get('/panel'); assert.ok(r.text.includes('Hola, Otra'), 'entró como usuario');
    r = await adm.post('/volver-admin'); r = await adm.get('/admin'); assert.equal(r.status, 200, 'volvió a admin');
    await adm.get('/admin/usuarios/' + oid);
    await adm.post(`/admin/usuarios/${oid}/eliminar`);
    r = await outsider.get('/panel'); assert.match(r.location || '', /^\/ingresar/, 'usuario eliminado sin sesión');
    r = await adm.get('/admin/usuarios/' + oid); assert.ok(r.text.includes('Usuario eliminado'), 'datos anonimizados');

    // Pagos: claves cifradas desde el panel, nunca visibles completas
    await adm.get('/admin/pagos');
    await adm.post('/admin/pagos', { mp_access_token: 'TEST-1234567890-SECRETO-abcd', paypal_client_id: 'CLIENTE-ID-wxyz', paypal_client_secret: 'SECRETO-PP-9876', pay_paypal_mode: 'sandbox', pay_demo: '0', pay_mp_currency: 'COP', usd_to_local: '4100' });
    r = await adm.get('/admin/pagos');
    assert.ok(r.text.includes('••••••••abcd') && !r.text.includes('SECRETO-abcd') && !r.text.includes('SECRETO-PP'), 'claves enmascaradas');
    const { one: dbOne } = require('../lib/db');
    assert.ok(!dbOne("SELECT value FROM secrets WHERE key='mp_access_token'").value.includes('TEST-'), 'clave cifrada en la base de datos');
    assert.equal(require('../lib/secrets').get('mp_access_token'), 'TEST-1234567890-SECRETO-abcd', 'clave recuperable por el servidor');
    assert.deepEqual(require('../lib/payments').providers().map((p) => p.id), ['mercadopago', 'paypal'], 'pasarelas activas y pago simulado desactivado');
    await adm.post('/admin/pagos', { del_mp_access_token: '1', del_paypal_client_id: '1', del_paypal_client_secret: '1', pay_demo: 'auto', pay_paypal_mode: 'sandbox', pay_mp_currency: 'COP' });
    assert.deepEqual(require('../lib/payments').providers().map((p) => p.id), ['demo'], 'claves borradas');

    // Etapa 1: trabajo presencial con ciudad, verificación obligatoria, dirección privada y código de cierre
    await cli.get('/tareas/nueva');
    const fp = new FormData();
    Object.entries({ title: 'Montar un escritorio en casa', category_id: '13', description: 'Escritorio en caja, traer destornillador.', budget: '60000', currency: 'COP', delivery_hours: '24', city: 'Bogotá', zone: 'Chapinero', address: 'Calle 60 # 10-20 apto 301', scheduled_at: '2026-12-01T10:00', price_type: 'fixed' }).forEach(([k, v]) => fp.append(k, v));
    r = await cli.post('/tareas', fp);
    const presUrl = r.location; assert.match(presUrl, /^\/tareas\/\d+$/, 'tarea presencial publicada');
    r = await cli.get(presUrl); assert.ok(r.text.includes('Chapinero') && !r.text.includes('Calle 60'), 'dirección oculta en la publicación');
    r = await wrk.get(presUrl); r = await wrk.post(presUrl + '/postular', { price: '15', message: 'Tengo herramientas y experiencia armando muebles.' });
    r = await wrk.get(presUrl); assert.ok(r.text.includes('verificar su identidad'), 'presencial exige verificación');
    const { run: dbRun, one: dbOne2 } = require('../lib/db');
    dbRun("UPDATE users SET verified_id=1 WHERE email='w@t.co'");
    // Presencial: solo postulan personas de esa ciudad; los digitales se ven desde cualquier lugar
    await wrk.get(presUrl); await wrk.post(presUrl + '/postular', { price: '15', message: 'Tengo herramientas y experiencia armando muebles.' });
    r = await wrk.get(presUrl); assert.ok(r.text.includes('es en persona en'), 'presencial exige estar en la ciudad');
    r = await wrk.get('/explorar'); assert.ok(!r.text.includes('Montar un escritorio en casa'), 'sin ciudad no se ven presenciales');
    r = await wrk.get('/explorar?ciudad=Medell%C3%ADn'); assert.ok(!r.text.includes('Montar un escritorio en casa'), 'otra ciudad no ve el presencial');
    r = await wrk.get('/explorar?ciudad=Bogot%C3%A1'); assert.ok(r.text.includes('Montar un escritorio en casa'), 'su ciudad sí ve el presencial');
    dbRun("UPDATE users SET city='Bogotá' WHERE email='w@t.co'");
    await wrk.get(presUrl); await wrk.post(presUrl + '/postular', { price: '15', message: 'Tengo herramientas y experiencia armando muebles.' });
    r = await cli.get(presUrl); const pApp = r.text.match(/\/postulaciones\/(\d+)\/aceptar/)[1];
    r = await cli.post(`/postulaciones/${pApp}/aceptar`); const pPay = r.location;
    await cli.post(pPay, { provider: 'demo' }); const pdid = pPay.split('/').pop();
    await cli.get('/pagos/demo/' + pdid); r = await cli.post('/pagos/demo/' + pdid); const pOrder = r.location.split('?')[0];
    const code = dbOne2('SELECT done_code FROM orders WHERE id=?', Number(pOrder.split('/').pop())).done_code;
    assert.match(code, /^\d{4}$/, 'código de cierre generado');
    r = await cli.get(pOrder); assert.ok(r.text.includes(code), 'el cliente ve su código');
    r = await wrk.get(pOrder); assert.ok(r.text.includes('Calle 60') && !r.text.includes('>' + code + '<'), 'el ayudante ve la dirección y no el código');
    await wrk.post(pOrder + '/codigo', { code: '0000' === code ? '1111' : '0000' });
    r = await wrk.get(pOrder); assert.ok(r.text.includes('Código incorrecto'), 'código incorrecto rechazado');
    await wrk.post(pOrder + '/codigo', { code });
    r = await wrk.get(pOrder); assert.ok(r.text.includes('Completado'), 'pedido presencial completado con el código');
    r = await cli.get('/explorar?modalidad=presencial&ciudad=Bogot%C3%A1'); assert.ok(r.status === 200, 'filtro por ciudad');

    // Volver a contratar: tarifa reducida, seguridad y datos privados
    r = await cli.get(orderUrl); assert.ok(r.text.includes('Volver a contratar'), 'botón volver a contratar');
    r = await wrk.post(orderUrl + '/recontratar', { title: 'Otro flyer', price: '10', currency: 'USD', hours: '24' });
    assert.ok(r.status === 400 || r.status === 403, 'el trabajador no puede recontratarse');
    r = await outsider.post(orderUrl + '/recontratar', { title: 'Otro flyer', price: '10', currency: 'USD' });
    assert.ok(r.status !== 302 || !String(r.location).startsWith('/pagar'), 'un tercero no puede recontratar');
    await cli.get(orderUrl);
    r = await cli.post(orderUrl + '/recontratar', { title: 'Otro flyer igual', price: '10', currency: 'USD', hours: '24', description: 'llámame al 300 123 4567' });
    r = await cli.get(orderUrl); assert.ok(r.text.includes('contiene datos de contacto'), 'recontratación con contacto bloqueada');
    await cli.get(orderUrl);
    r = await cli.post(orderUrl + '/recontratar', { title: 'Otro flyer igual', price: '10', currency: 'USD', hours: '24' });
    assert.match(r.location || '', /^\/pagar\/\d+$/, 'recontratación crea el pago');
    r = await cli.get(r.location); assert.ok(r.text.includes('$10.00 USD') && r.text.includes('Compra protegida'), 'recontratación sin recargo y garantía visible');
    await cli.get(pOrder);
    r = await cli.post(pOrder + '/recontratar', { title: 'Montar otro mueble', price: '60000', currency: 'COP', scheduled_at: '2026-12-10T10:00' });
    const rp = r.location; assert.match(rp || '', /^\/pagar\/\d+$/, 'recontratación presencial');
    await cli.post(rp, { provider: 'demo' }); const rid = rp.split('/').pop(); await cli.get('/pagos/demo/' + rid); r = await cli.post('/pagos/demo/' + rid);
    const rOrder = r.location.split('?')[0];
    r = await wrk.get(rOrder); assert.ok(r.text.includes('Calle 60'), 'la dirección se conserva para el ayudante');
    r = await cli.get('/explorar?q=Montar%20otro%20mueble'); assert.ok(!r.text.includes('tk-title">Montar otro mueble'), 'la recontratación no aparece en búsquedas públicas');
    r = await cli.get('/notificaciones'); assert.ok(r.text.includes('Vuelve a contratar'), 'recordatorio al terminar');

    // Promoción de lanzamiento: se aplica, respeta la fecha y se configura desde el panel
    { const db = require('../lib/db'), mk = require('../lib/market');
      db.run("UPDATE settings SET value='1' WHERE key='promo_active'"); db.run("UPDATE settings SET value=? WHERE key='promo_until'", String(Date.now() + 86400000));
      assert.equal(db.settings().commission_pct, 3, 'comisión de lanzamiento 3 %');
      assert.equal(mk.clientFee(10000), 0, 'el cliente no paga tarifa');
      assert.equal(mk.commissionFor(1, 10000), 300, 'comisión de lanzamiento aplicada');
      r = await cli.get('/'); assert.ok(r.text.includes('Lanzamiento:'), 'aviso de lanzamiento visible');
      r = await adm.get('/admin/configuracion'); assert.ok(r.text.includes('name="commission_pct" value="8"'), 'el panel muestra la tarifa normal, no la de promoción');
      db.run("UPDATE settings SET value=? WHERE key='promo_until'", String(Date.now() - 1000));
      assert.equal(db.settings().commission_pct, 8, 'al vencer vuelve sola a la tarifa normal (8 %)');
      assert.equal(mk.commissionFor(1, 10000), 800, 'comisión única del 8 %, igual para todos');
      assert.equal(mk.clientFee(10000), 0, 'tarifa al cliente 0 %');
      assert.equal((await cli.get('/planes')).location, '/como-funciona', 'los planes ya no existen');
      r = await cli.get('/como-funciona'); assert.ok(r.text.includes('exactamente el precio publicado') && !r.text.includes('plan Pro'), 'cómo funciona sin planes');
      r = await adm.get('/admin/configuracion'); assert.ok(!r.text.includes('plan_pro_cents') && !r.text.includes('pro_commission_pct'), 'panel sin campos de planes');
      r = await cli.get('/'); assert.ok(!r.text.includes('Lanzamiento:'), 'aviso oculto al vencer');
      await adm.post('/admin/configuracion', { promo_active: '1', promo_until: '2099-01-01', promo_commission_pct: '2', promo_client_fee_pct: '1', commission_pct: '8', client_fee_pct: '0' });
      assert.equal(db.settings().commission_pct, 2, 'promoción configurable desde el panel');
      db.run("UPDATE settings SET value='0' WHERE key='promo_active'");
    }

    // ---------- Mercado a domicilio: comparar, pagar, aceptar, recibo, entrega con código ----------
    { const db = require('../lib/db');
      r = await cli.get('/mercado'); assert.equal(r.status, 404, 'mercado oculto cuando está desactivado');
      r = await cli.get('/'); assert.ok(!r.text.includes('href="/mercado"'), 'sin enlace al mercado');
      await adm.get('/admin/mercado'); await adm.post('/admin/mercado/estado', { enabled: '1' });
      const pid = (n) => db.one('SELECT id FROM g_products WHERE name=?', n).id;
      const chain = (s) => db.one('SELECT id FROM g_chains WHERE slug=?', s).id;
      for (const [n, ex, ol] of [['Arroz blanco 1 kg', 4500, 4300], ['Leche entera 1 L', 4600, 4400], ['Huevos AA 30 unidades', 17500, 16900]]) {
        db.run("INSERT OR REPLACE INTO g_prices(product_id,chain_id,price,source,updated_at) VALUES (?,?,?,'admin',?)", pid(n), chain('exito'), ex, Date.now());
        db.run("INSERT OR REPLACE INTO g_prices(product_id,chain_id,price,source,updated_at) VALUES (?,?,?,'admin',?)", pid(n), chain('olimpica'), ol, Date.now());
      }
      r = await cli.get('/ciudad?c=Barranquilla');
      r = await cli.get('/mercado'); assert.ok(r.text.includes('Olímpica') && r.text.includes('Arroz blanco 1 kg'), 'catálogo y cadenas de la ciudad');
      const cart = { ['q' + pid('Arroz blanco 1 kg')]: '2', ['q' + pid('Leche entera 1 L')]: '3', ['q' + pid('Huevos AA 30 unidades')]: '1' };
      r = await cli.post('/mercado/comparar', cart);
      const iO = r.text.indexOf('Olímpica'), iE = r.text.indexOf('Éxito'); assert.ok(iO > 0 && iO < iE, 'la canasta más barata aparece primero');
      assert.ok(r.text.includes('$38.700'), 'total de la canasta en Olímpica (2×4.300 + 3×4.400 + 16.900)');
      r = await cli.post('/mercado/pedido', { ...cart, chain_id: String(chain('olimpica')), zone: 'El Prado', address: 'Cra 50 # 70-10', notes: 'escribe al 3001234567' });
      r = await cli.get('/mercado'); assert.ok(r.text.includes('contiene datos de contacto'), 'contacto bloqueado en el pedido');
      await cli.post('/mercado/comparar', cart);
      r = await cli.post('/mercado/pedido', { ...cart, chain_id: String(chain('olimpica')), zone: 'El Prado', address: 'Cra 50 # 70-10' });
      const gPay = r.location; assert.match(gPay || '', /^\/pagar\/\d+$/, 'pedido de mercado crea el pago');
      await cli.post(gPay, { provider: 'demo' }); const gid = gPay.split('/').pop(); await cli.get('/pagos/demo/' + gid); r = await cli.post('/pagos/demo/' + gid);
      const gUrl = r.location.split('?')[0]; assert.match(gUrl, /^\/mercado\/pedidos\/\d+$/);
      const go = db.one('SELECT * FROM g_orders WHERE id=?', Number(gUrl.split('/').pop()));
      assert.equal(go.status, 'open'); assert.equal(go.reserve, Math.round(38700 * 1.1));
      r = await outsider.get(gUrl); assert.ok(r.status === 403 || r.status === 404 || !r.text.includes('Cra 50'), 'un tercero no ve la dirección');
      db.run("UPDATE users SET city='Barranquilla' WHERE email='w@t.co'");
      r = await wrk.get('/mercado/pedidos'); await wrk.post(gUrl + '/aceptar');
      r = await wrk.get(gUrl); assert.ok(r.text.includes('Cra 50') && r.text.includes('Registrar compra'), 'el comprador ve la dirección y registra la compra');
      await outsider.post(gUrl + '/aceptar'); assert.equal(db.one('SELECT shopper_id FROM g_orders WHERE id=?', go.id).shopper_id, db.one("SELECT id FROM users WHERE email='w@t.co'").id, 'nadie más puede tomar el pedido');
      const fd = new FormData(); fd.append('found' + pid('Arroz blanco 1 kg'), '1'); fd.append('p' + pid('Arroz blanco 1 kg'), '4200');
      fd.append('found' + pid('Leche entera 1 L'), '1'); fd.append('p' + pid('Leche entera 1 L'), '4400');
      fd.append('receipt', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')]), 'recibo.png');
      r = await wrk.post(gUrl + '/compra', fd);
      const g2 = db.one('SELECT * FROM g_orders WHERE id=?', go.id);
      assert.equal(g2.receipt_total, 2 * 4200 + 3 * 4400, 'total real del recibo (huevos no encontrados)'); assert.equal(g2.refund, g2.reserve - g2.receipt_total, 'sobrante a devolver');
      assert.equal(db.one('SELECT price FROM g_prices WHERE product_id=? AND chain_id=?', pid('Arroz blanco 1 kg'), chain('olimpica')).price, 4200, 'el recibo actualiza el precio del catálogo');
      r = await outsider.get('/mercado/recibo/' + go.id); assert.ok([302, 403, 404].includes(r.status) && !r.text.includes('PNG'), 'recibo privado');
      r = await wrk.post(gUrl + '/entregar', { code: '0000' === g2.done_code ? '1111' : '0000' });
      await wrk.post(gUrl + '/entregar', { code: g2.done_code });
      assert.equal(db.one('SELECT status FROM g_orders WHERE id=?', go.id).status, 'completed', 'entregado con el código');
      r = await wrk.get('/billetera'); assert.ok(r.text.includes('Reintegro compra mercado'), 'reintegro al comprador');
      assert.equal(db.one("SELECT status FROM payments WHERE purpose='grocery' AND ref_id=?", go.id).status, 'refund_pending', 'reembolso del sobrante registrado');
      r = await adm.get('/admin/mercado'); assert.ok(r.text.includes('Supermercados y ciudades'), 'panel de mercado');
      const csv = new FormData(); csv.append('csv', new Blob(['producto;unidad;categoria;exito;olimpica\nPanela 500 g;500 g;Despensa;3300;3100\n']), 'precios.csv');
      await adm.get('/admin/mercado'); await adm.post('/admin/mercado/importar', csv);
      assert.equal(db.one('SELECT price FROM g_prices WHERE product_id=? AND chain_id=?', pid('Panela 500 g'), chain('olimpica')).price, 3100, 'importación CSV');
    }

    // ---------- Correo: confirmar, recuperar contraseña, avisos y límites ----------
    {
      const db = require('../lib/db'), market = require('../lib/market'), mailer = require('../lib/mail'), limiter = require('../lib/limiter'), bcrypt = require('bcryptjs');
      const mails = (to) => mailer.outbox.filter((m) => m.to === to);
      const link = (m, kind) => m.text.match(new RegExp(`/${kind}/([A-Za-z0-9_-]+)`))[1];
      // Confirmar correo (se envió al registrarse)
      assert.equal(mails('c@t.co').filter((m) => /Confirma tu correo/.test(m.subject)).length, 1, 'correo de confirmación enviado al registrarse');
      assert.equal(db.one('SELECT email_verified v FROM users WHERE email=?', 'c@t.co').v, 0, 'sin confirmar al inicio');
      const vt = link(mails('c@t.co')[0], 'verificar');
      r = await cli.get('/verificar/' + vt); assert.equal(r.location, '/panel', 'confirmar correo');
      assert.equal(db.one('SELECT email_verified v FROM users WHERE email=?', 'c@t.co').v, 1, 'correo confirmado');
      r = await cli.get('/verificar/' + vt); assert.equal(r.location, '/cuenta', 'el enlace de confirmación sirve una sola vez');
      r = await cli.get('/verificar/basura'); assert.equal(r.location, '/cuenta', 'enlace inventado');
      // Avisos por correo: solo si está confirmado y activado
      const cid = db.one('SELECT id FROM users WHERE email=?', 'c@t.co').id;
      const before = mails('c@t.co').length;
      market.notify(cid, 'Aviso de prueba', '/panel');
      assert.equal(mails('c@t.co').length, before + 1, 'aviso por correo');
      assert.ok(mails('c@t.co').at(-1).text.includes('/panel'), 'el aviso lleva el enlace');
      await cli.get('/cuenta'); await cli.post('/cuenta/avisos', {});
      market.notify(cid, 'Aviso apagado', '/panel');
      assert.equal(mails('c@t.co').length, before + 1, 'avisos desactivados no se envían');
      await cli.post('/cuenta/avisos', { notify_email: '1' });
      db.run('DELETE FROM rate_limits WHERE k=?', 'mail:' + cid);
      for (let i = 0; i < 15; i++) market.notify(cid, 'Aviso ' + i, '/panel');
      assert.equal(mails('c@t.co').length, before + 1 + 10, 'máximo 10 avisos por hora');
      const wid = db.one('SELECT id FROM users WHERE email=?', 'w@t.co').id;
      market.notify(wid, 'Sin confirmar', '/panel');
      assert.equal(mails('w@t.co').filter((m) => /Sin confirmar/.test(m.subject)).length, 0, 'correo sin confirmar no recibe avisos');
      // Recuperar contraseña
      db.run("INSERT INTO users(name,email,password_hash,country,currency,email_verified,created_at) VALUES ('Olvidadiza Prueba','r@t.co',?,'CO','USD',0,?)", bcrypt.hashSync('vieja12345', 10), Date.now());
      const old = client(base); await old.get('/ingresar'); r = await old.post('/ingresar', { email: 'r@t.co', password: 'vieja12345' }); assert.equal(r.location, '/panel', 'ingreso previo');
      const rc = client(base); await rc.get('/recuperar');
      r = await rc.post('/recuperar', { email: 'nadie@t.co' }); assert.ok(r.text.includes('te enviamos un enlace'), 'misma respuesta aunque no exista');
      assert.equal(mails('nadie@t.co').length, 0, 'no se escribe a correos sin cuenta');
      r = await rc.post('/recuperar', { email: 'R@t.co' }); assert.ok(r.text.includes('te enviamos un enlace'), 'solicitar recuperación');
      assert.equal(mails('r@t.co').length, 1, 'correo de recuperación enviado');
      const rt = link(mails('r@t.co')[0], 'restablecer');
      assert.equal((await rc.get('/restablecer/' + rt)).status, 200, 'formulario de nueva contraseña');
      assert.equal((await rc.get('/restablecer/inventado1234567890123')).status, 400, 'enlace falso');
      r = await rc.post('/restablecer/' + rt, { password: 'nueva12345', password2: 'otra12345' }); assert.equal(r.status, 400, 'contraseñas distintas');
      r = await rc.post('/restablecer/' + rt, { password: 'corta', password2: 'corta' }); assert.equal(r.status, 400, 'contraseña corta');
      r = await rc.post('/restablecer/' + rt, { password: 'nueva12345', password2: 'nueva12345' }); assert.equal(r.location, '/ingresar', 'contraseña restablecida');
      r = await rc.post('/restablecer/' + rt, { password: 'otra123456', password2: 'otra123456' }); assert.equal(r.status, 400, 'el enlace sirve una sola vez');
      r = await old.get('/panel'); assert.equal(r.status, 302, 'se cierran las sesiones anteriores');
      const nw = client(base); await nw.get('/ingresar');
      r = await nw.post('/ingresar', { email: 'r@t.co', password: 'vieja12345' }); assert.equal(r.status, 401, 'la contraseña vieja ya no sirve');
      r = await nw.post('/ingresar', { email: 'r@t.co', password: 'nueva12345' }); assert.equal(r.location, '/panel', 'ingreso con la contraseña nueva');
      assert.equal(db.one('SELECT email_verified v FROM users WHERE email=?', 'r@t.co').v, 1, 'recuperar confirma el correo');
      // Límite de intentos de ingreso (persistente)
      for (let i = 0; i < 10; i++) await nw.post('/ingresar', { email: 'r@t.co', password: 'mala' + i });
      r = await nw.post('/ingresar', { email: 'r@t.co', password: 'nueva12345' }); assert.equal(r.status, 429, 'bloqueo tras 10 intentos fallidos');
      limiter.clear('login:127.0.0.1'); limiter.clear('login:::1'); limiter.clear('login:::ffff:127.0.0.1');
    }

    // ---------- Panel: nombre único, comisión mínima, calculadora de pasarelas ----------
    {
      const db = require('../lib/db'), mk = require('../lib/market'), texts = require('../lib/texts');
      const oldName = db.settings().site_name;
      db.run("INSERT OR REPLACE INTO texts(key, default_value, value, updated_at) VALUES ('prueba.nombre', 'x', ?, ?)", `Bienvenido a ${oldName}`, Date.now()); texts.reset();
      r = await adm.get('/admin/configuracion'); assert.ok(r.text.includes('Nombre de la web') && r.text.includes('Calculadora'), 'panel con nombre único y calculadora');
      r = await adm.post('/admin/nombre', { site_name: 'Marca Nueva' }); assert.equal(r.location, '/admin/configuracion');
      assert.equal(db.settings().site_name, 'Marca Nueva', 'nombre guardado');
      assert.equal(db.one("SELECT value FROM texts WHERE key='prueba.nombre'").value, 'Bienvenido a {{sitio}}', 'el texto guarda el marcador');
      assert.equal(texts.t('prueba.nombre', 'x'), 'Bienvenido a Marca Nueva', 'el texto muestra el nombre nuevo');
      r = await cli.get('/'); db.run("UPDATE settings SET value='1' WHERE key='show_figures'");
      r = await cli.get('/'); assert.ok(r.text.includes('Ejemplo:') && !/y la plataforma/.test(r.text) && !r.text.includes('NaN') && !r.text.includes('undefined'), 'el ejemplo del inicio no muestra lo que gana la plataforma');
      r = await cli.get('/como-funciona'); assert.ok(r.text.includes('Marca Nueva') && !r.text.includes(oldName), 'el nombre cambia en toda la página');
      r = await adm.post('/admin/nombre', { site_name: ' ' }); assert.equal(db.settings().site_name, 'Marca Nueva', 'nombre vacío rechazado');
      // Comisión mínima y tope
      await adm.post('/admin/configuracion', { commission_pct: '5', client_fee_pct: '0', commission_min_cents: '0.50' });
      assert.equal(mk.commissionFor(1, 300), 50, 'comisión mínima en trabajos baratos');
      assert.equal(mk.commissionFor(1, 10000), 500, 'sobre el mínimo manda el porcentaje (5 %)');
      assert.equal(mk.commissionFor(1, 30), 30, 'la comisión nunca supera el trabajo');
      await adm.post('/admin/configuracion', { commission_pct: '500', client_fee_pct: '0', commission_min_cents: '0' });
      assert.equal(db.settingsRaw().commission_pct, 50, 'tope de seguridad del 50 %');
      // Un solo número: el formulario simple de comisión
      r = await adm.post('/admin/comision', { commission_pct: '8' }); assert.equal(r.location, '/admin/configuracion');
      assert.equal(db.settings().commission_pct, 8, 'porcentaje fijado desde el formulario simple');
      await adm.post('/admin/configuracion', { client_fee_pct: '0', commission_min_cents: '0.50' });
      assert.equal(mk.commissionFor(1, 300), 50, 'el mínimo automático por trabajo se conserva');
      assert.equal(mk.commissionFor(1, 10000), 800, 'comisión del 8 % en toda la web');
      await adm.post('/admin/comision', { commission_pct: '999' }); assert.equal(db.settingsRaw().commission_pct, 50, 'tope del 50 % en el formulario simple');
      await adm.post('/admin/comision', { commission_pct: '0' }); assert.equal(db.settingsRaw().commission_pct, 50, 'cero no se acepta');
      await adm.post('/admin/comision', { commission_pct: '8' });
      // Costo de pasarelas: MP (3,29 % + $800 + IVA 19 %, tasa 4000) y PayPal (5,4 % + US$0,30)
      db.run("UPDATE settings SET value='4000' WHERE key='usd_to_local'");
      assert.equal(mk.gatewayCost('mercadopago', 1000), 63, 'costo estimado Mercado Pago');
      assert.equal(mk.gatewayCost('paypal', 1000), 84, 'costo estimado PayPal');
      r = await adm.get('/admin/configuracion'); assert.ok(r.text.includes('Te queda (MP)') && r.text.includes('pierdes dinero'), 'la calculadora avisa cuando se pierde dinero');
    }

    // ---------- Copias, retiros seguros, SEO, CSP y datos de demostración ----------
    {
      const db = require('../lib/db'), bk = require('../lib/backup'), demo = require('../lib/demo'), { DatabaseSync } = require('node:sqlite');
      // Cuentas de demostración (como las crea una base vacía) con una tarea y un servicio abiertos
      const dAna = Number(db.run("INSERT INTO users(name,email,password_hash,created_at) VALUES ('Ana Torres','ana@demo.local','x',?)", Date.now()).lastInsertRowid);
      db.run("INSERT INTO tasks(client_id,category_id,title,description,budget_cents,delivery_hours,created_at) VALUES (?,1,'Tarea demo','Descripción demo',500,24,?)", dAna, Date.now());
      db.run("INSERT INTO gigs(worker_id,category_id,title,description,price_cents,delivery_hours,created_at) VALUES (?,1,'Servicio demo','Descripción demo',500,24,?)", dAna, Date.now());
      // Copia de seguridad: archivo abierto y con los usuarios
      const f = bk.backupNow(); assert.ok(f && fs.existsSync(f), 'copia de seguridad creada');
      const cp = new DatabaseSync(f, { readOnly: true }); assert.ok(cp.prepare('SELECT COUNT(*) c FROM users').get().c >= 3, 'la copia contiene los usuarios'); cp.close();
      assert.equal(bk.backupNow(), null, 'solo una copia por día');
      // Retiros: no se puede gastar dos veces y el admin no puede cerrar dos veces
      const wid = db.one('SELECT id FROM users WHERE email=?', 'w@t.co').id;
      db.run("UPDATE users SET verified_id=1 WHERE id=?", wid);
      db.run("INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,'earning',5000,?,'saldo de prueba',?)", wid, Date.now() - 1000, Date.now());
      await wrk.get('/billetera');
      const wd = { amount: '40', method: 'nequi', account: '3001234567' };
      r = await wrk.post('/billetera/retiro', wd); assert.equal(r.location, '/billetera');
      r = await wrk.post('/billetera/retiro', wd); assert.equal(db.all("SELECT id FROM withdrawals WHERE user_id=?", wid).length, 1, 'el mismo saldo no se retira dos veces');
      const w1 = db.one("SELECT id FROM withdrawals WHERE user_id=?", wid).id;
      await adm.get('/admin/finanzas');
      r = await adm.post('/admin/retiros/' + w1, { action: 'paid', note: 'ref 123' }); assert.ok(r.status < 400, 'retiro marcado como pagado');
      r = await adm.post('/admin/retiros/' + w1, { action: 'rejected', note: 'otra vez' }); assert.equal(r.status, 404, 'un retiro ya procesado no se puede procesar otra vez');
      assert.equal(db.one('SELECT status FROM withdrawals WHERE id=?', w1).status, 'paid', 'sigue como pagado');
      assert.equal(db.one("SELECT COUNT(*) c FROM transactions WHERE user_id=? AND type='reversal'", wid).c, 0, 'no se devolvió saldo por error');
      assert.ok(db.one('SELECT processed_by p FROM withdrawals WHERE id=?', w1).p, 'queda registrado quién lo procesó');
      // Costo por retiro: lo paga quien retira (se descuenta del importe) y el admin ve lo que debe enviar
      db.run("INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,'earning',3000,?,'saldo extra',?)", wid, Date.now() - 1000, Date.now());
      await adm.post('/admin/configuracion', { withdraw_fee_cents: '1.00' });
      assert.equal(db.settings().withdraw_fee_cents, 100, 'costo por retiro guardado');
      await wrk.get('/billetera'); r = await wrk.get('/billetera'); assert.ok(r.text.includes('Costo del retiro'), 'la billetera muestra el costo del retiro');
      const availBefore = require('../lib/market').wallet(wid).available;
      r = await wrk.post('/billetera/retiro', { amount: '20', method: 'nequi', account: '3001234567' });
      const w2 = db.one("SELECT * FROM withdrawals WHERE user_id=? AND status='requested'", wid);
      assert.equal(w2.amount_cents, 2000); assert.equal(w2.fee_cents, 100, 'el costo queda registrado en el retiro');
      assert.equal(require('../lib/market').wallet(wid).available, availBefore - 2000, 'se reserva el importe completo');
      r = await adm.get('/admin/retiros.csv'); assert.ok(r.text.includes('19.00') && r.text.includes('retiros') === false && r.text.includes('monto_a_enviar_usd'), 'el CSV muestra lo que hay que enviar (importe menos costo)');
      db.run("UPDATE settings SET value='1500' WHERE key='withdraw_fee_cents'");
      const cntW = db.all('SELECT id FROM withdrawals WHERE user_id=?', wid).length;
      await wrk.post('/billetera/retiro', { amount: '10', method: 'nequi', account: '3001234567' });
      assert.equal(db.all('SELECT id FROM withdrawals WHERE user_id=?', wid).length, cntW, 'no se puede retirar menos que el costo del retiro');
      db.run("UPDATE settings SET value='0' WHERE key='withdraw_fee_cents'");
      await adm.get('/admin/finanzas'); await adm.post('/admin/retiros/' + w2.id, { action: 'reject', note: 'prueba' });
      assert.equal(require('../lib/market').wallet(wid).available, availBefore, 'al rechazar se devuelve el importe completo');
      // Al trabajador no se le paga antes de que la pasarela libere el dinero a la plataforma
      {
        const mk = require('../lib/market'), cid = db.one('SELECT id FROM users WHERE email=?', 'c@t.co').id, DAYMS = 86400000;
        const release = Date.now() + 20 * DAYMS; // Mercado Pago libera a los 20 días
        const oid = Number(db.run("INSERT INTO orders(client_id,worker_id,title,amount_cents,client_fee_cents,delivery_hours,status,paid_at,delivered_at,created_at) VALUES (?,?,'Pedido con liberación tardía',10000,0,24,'delivered',?,?,?)", cid, wid, Date.now(), Date.now(), Date.now()).lastInsertRowid);
        db.run("INSERT INTO payments(user_id,purpose,ref_id,description,amount_cents,provider,status,meta,created_at,paid_at) VALUES (?,'order',?,'x',10000,'mercadopago','paid',?,?,?)", cid, oid, JSON.stringify({ release_at: release }), Date.now(), Date.now());
        assert.ok(mk.completeOrder(oid, cid), 'pedido completado');
        const av = db.one("SELECT available_at a FROM transactions WHERE order_id=? AND type='earning'", oid).a;
        assert.ok(av >= release, 'el saldo del trabajador no se libera antes que la pasarela (20 días)');
        const oid2 = Number(db.run("INSERT INTO orders(client_id,worker_id,title,amount_cents,client_fee_cents,delivery_hours,status,paid_at,delivered_at,created_at) VALUES (?,?,'Pedido sin fecha',10000,0,24,'delivered',?,?,?)", cid, wid, Date.now(), Date.now(), Date.now()).lastInsertRowid);
        mk.completeOrder(oid2, cid);
        const av2 = db.one("SELECT available_at a FROM transactions WHERE order_id=? AND type='earning'", oid2).a;
        assert.ok(av2 >= Date.now() + (db.settings().clearance_days * DAYMS) - 5000 && av2 < release, 'sin fecha de la pasarela se usan los días de retención');
      }
      // Mercado Pago (simulado): rechaza importes o monedas incorrectos y guarda la fecha de liberación
      {
        const pay = require('../lib/payments'), cid = db.one('SELECT id FROM users WHERE email=?', 'c@t.co').id;
        db.run("UPDATE settings SET value='4000' WHERE key='usd_to_local'");
        const mkPending = () => { const oid = Number(db.run("INSERT INTO orders(client_id,worker_id,title,amount_cents,client_fee_cents,delivery_hours,status,created_at) VALUES (?,?,'Pedido MP',1000,0,24,'pending_payment',?)", cid, wid, Date.now()).lastInsertRowid);
          const pid = Number(db.run("INSERT INTO payments(user_id,purpose,ref_id,description,amount_cents,provider,provider_ref,status,meta,created_at) VALUES (?,'order',?,'x',1000,'mercadopago','pref',?,?,?)", cid, oid, 'pending', JSON.stringify({ expect: { amount: 40000, currency: 'COP' } }), Date.now()).lastInsertRowid); return { oid, pid }; };
        const realFetch = global.fetch, rel = '2027-01-15T10:00:00.000-05:00';
        const fake = (obj) => { global.fetch = async () => ({ ok: true, json: async () => obj }); };
        try {
          let { pid } = mkPending(); process.env.MP_ACCESS_TOKEN = 'TEST-x';
          fake({ id: 111, status: 'approved', external_reference: String(pid), transaction_amount: 100, currency_id: 'COP', money_release_date: rel });
          assert.equal(await pay.mpVerify('111'), null, 'importe menor: no se acepta'); assert.equal(db.one('SELECT status s FROM payments WHERE id=?', pid).s, 'pending', 'sigue pendiente');
          fake({ id: 111, status: 'approved', external_reference: String(pid), transaction_amount: 40000, currency_id: 'USD', money_release_date: rel });
          assert.equal(await pay.mpVerify('111'), null, 'moneda distinta: no se acepta');
          fake({ id: 111, status: 'pending', external_reference: String(pid), transaction_amount: 40000, currency_id: 'COP' });
          assert.equal(await pay.mpVerify('111'), null, 'pago no aprobado: no se acepta');
          fake({ id: 111, status: 'approved', external_reference: String(pid), transaction_amount: 40000, currency_id: 'COP', money_release_date: rel });
          const ok = await pay.mpVerify('111'); assert.equal(ok.status, 'paid', 'importe y moneda correctos: pagado');
          assert.equal(JSON.parse(db.one('SELECT meta m FROM payments WHERE id=?', pid).m).release_at, Date.parse(rel), 'se guarda la fecha de liberación de Mercado Pago');
        } finally { global.fetch = realFetch; delete process.env.MP_ACCESS_TOKEN; }
      }
      // Pago en lote: dos retiros pendientes se cierran con un clic
      {
        const mk = require('../lib/market');
        db.run("INSERT INTO transactions(user_id,type,amount_cents,available_at,description,created_at) VALUES (?,'earning',6000,?,'saldo lote',?)", wid, Date.now() - 1000, Date.now());
        await wrk.get('/billetera');
        await wrk.post('/billetera/retiro', { amount: '15', method: 'nequi', account: '3001234567' });
        await wrk.post('/billetera/retiro', { amount: '12', method: 'bancolombia', account: '12345678901' });
        r = await wrk.get('/billetera'); assert.ok(r.text.includes('martes y viernes'), 'la billetera muestra los días de pago');
        assert.equal(db.all("SELECT id FROM withdrawals WHERE status='requested'").length, 2, 'dos retiros pendientes');
        await adm.get('/admin/finanzas'); r = await adm.post('/admin/retiros/pagar-todos', { note: 'lote prueba' });
        assert.equal(db.all("SELECT id FROM withdrawals WHERE status='requested'").length, 0, 'todos los retiros quedan pagados');
        assert.equal(db.all("SELECT id FROM withdrawals WHERE status='paid' AND note='lote prueba'").length, 2, 'con la referencia del lote');
        r = await adm.post('/admin/retiros/pagar-todos', {}); assert.ok(r.status < 400, 'sin pendientes no falla');
      }
      // SEO y seguridad del navegador
      r = await fetch(base + '/robots.txt'); const rb = await r.text(); assert.ok(rb.includes('Disallow: /admin') && rb.includes('Sitemap:'), 'robots.txt');
      r = await fetch(base + '/sitemap.xml'); const sm = await r.text(); assert.ok(sm.includes('<urlset') && sm.includes('/tareas/') && sm.includes('/servicios/'), 'sitemap con tareas y servicios');
      assert.ok(!sm.includes('/admin') && !sm.includes('/panel'), 'el sitemap no incluye áreas privadas');
      r = await fetch(base + '/'); const hp = await r.text();
      assert.ok(hp.includes('rel="canonical"') && hp.includes('property="og:title"') && hp.includes('name="description"'), 'etiquetas SEO y vista previa');
      assert.ok(/default-src 'self'/.test(r.headers.get('content-security-policy') || '') && /script-src 'self'(;|$)/.test(r.headers.get('content-security-policy') || ''), 'CSP activa');
      assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(hp) && !/ on[a-z]+=/i.test(hp), 'el inicio no usa scripts en línea');
      r = await fetch(base + '/panel', { redirect: 'manual' }); assert.ok(/noindex/.test(r.headers.get('x-robots-tag') || ''), 'áreas privadas con noindex');
      for (const pth of ['/admin/apariencia', '/admin/secciones', '/admin/pagos']) { r = await adm.get(pth); assert.ok(!/ on(input|click)=/i.test(r.text), `${pth} sin manejadores en línea`); }
      // Datos de demostración
      r = await adm.get('/admin/configuracion');
      if (demo.count() > 0) { assert.ok(r.text.includes('Borrar datos de demostración'), 'botón de datos de demostración');
        r = await adm.post('/admin/demo/borrar'); assert.equal(demo.count(), 0, 'datos de demostración borrados');
        assert.ok(db.one("SELECT COUNT(*) c FROM users WHERE email IN ('c@t.co','w@t.co')").c === 2, 'los usuarios reales siguen ahí'); }
      else { assert.ok(!r.text.includes('Borrar datos de demostración'), 'sin demo no hay botón'); }
    }

    // ---------- Modelo de créditos: el trabajador solo paga si lo eligen ----------
    {
      const db = require('../lib/db'), cr = require('../lib/credits'), mkt = require('../lib/market');
      await adm.get('/admin/configuracion');
      r = await adm.post('/admin/modelo', { business_model: 'creditos' }); assert.equal(db.settings().business_model, 'creditos', 'modelo de créditos activado desde el panel');
      r = await adm.get('/admin/configuracion'); assert.ok(r.text.includes('Créditos: precios') && r.text.includes('Paquete 1'), 'el panel muestra los precios de créditos');
      assert.equal(cr.offerCost(1000), 1); assert.equal(cr.offerCost(3000), 3); assert.equal(cr.offerCost(10000), 6); assert.equal(cr.offerCost(50000), 10, 'el costo sube con el valor del trabajo');
      r = await cli.get('/'); assert.ok(!r.text.includes('Pago protegido en toda la plataforma') && !/Te quedas con el 92/.test(r.text), 'el inicio no promete pago protegido ni comisión');
      r = await cli.get('/como-funciona'); assert.ok(r.text.includes('Solo pagas si te eligen') && !r.text.includes('Paga de forma protegida'), 'cómo funciona explica los créditos');
      r = await cli.get('/terminos'); assert.ok(r.text.includes('Créditos y pagos entre usuarios'), 'términos con créditos');
      const wid2 = db.one('SELECT id FROM users WHERE email=?', 'w@t.co').id;
      db.run('UPDATE users SET credits=0 WHERE id=?', wid2); cr.add(wid2, 5, 'prueba');
      const bal = () => cr.balance(wid2);
      const newTask = async (desc) => { await cli.get('/tareas/nueva'); const rr = await cli.post('/tareas', mk(desc)); assert.match(rr.location, /^\/tareas\/\d+$/, 'tarea publicada'); return rr.location; };
      const offer = async (url, price = '10') => { await wrk.get(url); return wrk.post(url + '/postular', { price, message: 'Puedo hacerlo con calidad y en el plazo indicado, tengo experiencia.' }); };
      // 1) ofertar reserva créditos y elegir los gasta
      const t1 = await newTask('Diseñar un flyer limpio para un evento de lanzamiento.');
      await offer(t1); assert.equal(bal(), 4, 'la oferta cuesta 1 crédito');
      r = await cli.get(t1); const appId1 = r.text.match(/\/postulaciones\/(\d+)\/aceptar/)[1]; assert.ok(r.text.includes('Elegir a esta persona'), 'el cliente elige sin pagar');
      r = await cli.post(`/postulaciones/${appId1}/aceptar`, { contact: '' }); assert.equal(db.one('SELECT status s FROM applications WHERE id=?', appId1).s, 'pending', 'sin contacto no se elige');
      r = await cli.post(`/postulaciones/${appId1}/aceptar`, { contact: 'WhatsApp +57 300 111 2222' });
      assert.equal(db.one('SELECT status s FROM applications WHERE id=?', appId1).s, 'accepted', 'oferta elegida');
      assert.equal(db.one('SELECT status s FROM tasks WHERE id=?', Number(t1.split('/').pop())).s, 'hired', 'tarea contratada');
      assert.equal(bal(), 4, 'si te eligen, los créditos quedan usados');
      r = await wrk.get('/postulaciones'); assert.ok(r.text.includes('WhatsApp +57 300 111 2222'), 'el trabajador recibe el contacto del cliente');
      assert.equal(db.all('SELECT id FROM orders WHERE application_id=?', appId1).length, 0, 'no se crea pedido ni cobro: el pago es directo');
      // 2) si el cliente descarta, se devuelven
      const t2 = await newTask('Editar un video corto para redes sociales con música.');
      await offer(t2); assert.equal(bal(), 3);
      r = await cli.get(t2); const appId2 = r.text.match(/\/postulaciones\/(\d+)\/rechazar/)[1];
      await cli.post(`/postulaciones/${appId2}/rechazar`); assert.equal(bal(), 4, 'descartada: créditos devueltos');
      // 3) si cierran la publicación, se devuelven
      const t3 = await newTask('Traducir un documento de dos páginas al inglés técnico.');
      await offer(t3); assert.equal(bal(), 3);
      await cli.post(t3 + '/cerrar'); assert.equal(bal(), 4, 'publicación cerrada: créditos devueltos');
      // 4) si no responden en N días, vencen y se devuelven
      const t4 = await newTask('Crear una presentación de diez diapositivas sobre ventas.');
      await offer(t4); assert.equal(bal(), 3);
      db.run("UPDATE applications SET created_at=? WHERE task_id=?", Date.now() - 9 * 86400000, Number(t4.split('/').pop()));
      mkt.autoApprove(); assert.equal(bal(), 4, 'sin respuesta: créditos devueltos');
      // 5) si eligen a otro, se devuelven
      const t5 = await newTask('Redactar cinco publicaciones para una tienda de ropa.');
      const other = Number(db.run("INSERT INTO users(name,email,password_hash,country,currency,email_verified,created_at) VALUES ('Otra Persona','o@t.co','x','CO','USD',1,?)", Date.now()).lastInsertRowid);
      cr.add(other, 3, 'prueba');
      db.run("INSERT INTO applications(task_id,worker_id,message,price_cents,credit_spent,created_at) VALUES (?,?,'oferta de otra persona con experiencia',1000,1,?)", Number(t5.split('/').pop()), other, Date.now()); cr.spend(other, 1, 'oferta', 0);
      await offer(t5); assert.equal(bal(), 3);
      r = await cli.get(t5); const appId5 = r.text.match(/\/postulaciones\/(\d+)\/aceptar/g).map((x) => x.match(/\d+/)[0]);
      const mine = db.one('SELECT id FROM applications WHERE task_id=? AND worker_id=?', Number(t5.split('/').pop()), wid2).id;
      await cli.post(`/postulaciones/${appId5.find((x) => Number(x) !== mine)}/aceptar`, { contact: 'correo del cliente' });
      assert.equal(bal(), 4, 'eligieron a otro: créditos devueltos'); assert.equal(cr.balance(other), 2, 'el elegido sí usó su crédito');
      // 6) sin créditos no se oferta (y no se cobra nada)
      db.run('UPDATE users SET credits=0 WHERE id=?', wid2);
      const t6 = await newTask('Hacer un logotipo sencillo para una cafetería nueva.');
      r = await offer(t6); assert.equal(r.location, '/creditos', 'sin créditos lleva a comprar');
      assert.equal(db.all('SELECT id FROM applications WHERE task_id=? AND worker_id=?', Number(t6.split('/').pop()), wid2).length, 0, 'no se creó la oferta');
      // 7) cupos: si la tarea ya está llena no se cobra
      cr.add(wid2, 3, 'prueba'); db.run("UPDATE settings SET value='1' WHERE key='max_offers_per_task'");
      db.run("INSERT INTO applications(task_id,worker_id,message,price_cents,credit_spent,created_at) VALUES (?,?,'oferta previa de otra persona',1000,1,?)", Number(t6.split('/').pop()), other, Date.now());
      await offer(t6); assert.equal(bal(), 3, 'tarea llena: no se cobra'); db.run("UPDATE settings SET value='8' WHERE key='max_offers_per_task'");
      // 8) tarea que ya no está abierta: no se cobra
      await cli.post(t6 + '/cerrar'); r = await offer(t6); assert.equal(bal(), 3, 'tarea cerrada: no se cobra');
      // 9) comprar créditos con el flujo de pago existente
      await wrk.get('/creditos'); r = await wrk.get('/creditos'); assert.ok(r.text.includes('Comprar créditos') && r.text.includes('10 créditos'), 'página de créditos con paquetes');
      r = await wrk.post('/creditos/comprar/1'); const cp = r.location; assert.match(cp, /^\/pagar\/\d+$/, 'lleva al pago');
      await wrk.post(cp, { provider: 'demo' }); const cpid = cp.split('/').pop(); await wrk.get('/pagos/demo/' + cpid); r = await wrk.post('/pagos/demo/' + cpid);
      assert.equal(bal(), 13, 'créditos acreditados tras el pago'); assert.equal(db.one("SELECT status s FROM payments WHERE id=?", cpid).s, 'paid');
      // 10) servicios: no se compra con pago retenido en este modelo
      const gigId = db.one("SELECT id FROM gigs WHERE status='active'")?.id;
      if (gigId) { r = await cli.post(`/servicios/${gigId}/comprar`, {}); assert.equal(r.location, '/servicios/' + gigId, 'comprar un servicio ya no cobra: se pide al profesional'); }
      // 10b) solicitudes a un servicio: el profesional paga créditos solo si acepta
      {
        const rq = require('../lib/requests');
        const gid = Number(db.run("INSERT INTO gigs(worker_id,category_id,title,description,price_cents,delivery_hours,created_at) VALUES (?,1,'Diseño de flyers para eventos','Diseño profesional de flyers',500,24,?)", wid2, Date.now()).lastInsertRowid);
        await cli.get('/servicios/' + gid); r = await cli.get('/servicios/' + gid); assert.ok(r.text.includes('Pedir a este profesional') && !r.text.includes('Contratar y pagar'), 'el servicio ofrece pedir, no pagar');
        r = await wrk.get('/servicios/' + gid); await wrk.post(`/servicios/${gid}/pedir`, { message: 'Quiero pedirme mi propio servicio para probar', contact: 'yo@t.co' });
        assert.equal(db.all('SELECT id FROM gig_requests').length, 0, 'no puedes pedir tu propio servicio');
        await cli.post(`/servicios/${gid}/pedir`, { message: 'corto', contact: 'x' }); assert.equal(db.all('SELECT id FROM gig_requests').length, 0, 'validación del mensaje y del contacto');
        await cli.post(`/servicios/${gid}/pedir`, { message: 'Necesito un flyer para el lanzamiento de mi tienda este mes.', contact: 'WhatsApp +57 311 000 1111' });
        assert.equal(db.all("SELECT id FROM gig_requests WHERE status='pending'").length, 1, 'solicitud creada');
        await cli.post(`/servicios/${gid}/pedir`, { message: 'Otra vez el mismo pedido de flyer para mi tienda.', contact: 'WhatsApp +57 311 000 1111' });
        assert.equal(db.all('SELECT id FROM gig_requests').length, 1, 'no se duplica una solicitud pendiente');
        await wrk.get('/solicitudes'); r = await wrk.get('/solicitudes'); assert.ok(r.text.includes('Necesito un flyer') && !r.text.includes('311 000 1111'), 'el profesional ve el pedido pero no el contacto');
        const q1 = db.one('SELECT id FROM gig_requests').id, before = cr.balance(wid2);
        db.run('UPDATE users SET credits=0 WHERE id=?', wid2);
        r = await wrk.post(`/solicitudes/${q1}/aceptar`); assert.equal(r.location, '/creditos', 'sin créditos no puede aceptar'); assert.equal(db.one('SELECT status s FROM gig_requests WHERE id=?', q1).s, 'pending', 'sigue pendiente, sin cobro');
        cr.add(wid2, before, 'prueba');
        await wrk.post(`/solicitudes/${q1}/aceptar`); assert.equal(cr.balance(wid2), before - 1, 'aceptar cuesta créditos según el precio');
        r = await wrk.get('/solicitudes'); assert.ok(r.text.includes('311 000 1111'), 'al aceptar se ve el contacto del cliente');
        await wrk.post(`/solicitudes/${q1}/aceptar`); assert.equal(cr.balance(wid2), before - 1, 'no se cobra dos veces');
        r = await cli.get('/notificaciones'); assert.ok(r.text.includes('Aceptaron tu solicitud'), 'el cliente recibe aviso');
        // rechazar es gratis
        await cli.post(`/servicios/${gid}/pedir`, { message: 'Necesito otro flyer distinto para otra campaña de ventas.', contact: 'correo@cliente.co' });
        const q2 = db.one("SELECT id FROM gig_requests WHERE status='pending'").id, b2 = cr.balance(wid2);
        await wrk.post(`/solicitudes/${q2}/rechazar`); assert.equal(cr.balance(wid2), b2, 'rechazar no cuesta'); assert.equal(db.one('SELECT status s FROM gig_requests WHERE id=?', q2).s, 'declined');
        // vencen sin respuesta
        await cli.post(`/servicios/${gid}/pedir`, { message: 'Un tercer pedido de flyer para el cierre de este año.', contact: 'correo@cliente.co' });
        db.run("UPDATE gig_requests SET created_at=? WHERE status='pending'", Date.now() - 9 * 86400000); rq.expireOld();
        assert.equal(db.all("SELECT id FROM gig_requests WHERE status='pending'").length, 0, 'las solicitudes sin respuesta vencen');
      }
      // 10c) planes de créditos, y lo que ya no aplica queda apagado
      r = await fetch(base + '/planes'); const pl = await r.text(); assert.ok(r.status === 200 && pl.includes('Consigue clientes') && pl.includes('10 créditos') && pl.includes('Solo pagas si te eligen') || pl.includes('Solo se usan si te eligen'), 'página pública de planes de créditos');
      r = await fetch(base + '/'); assert.ok((await r.text()).includes('Planes de créditos'), 'el inicio muestra los planes');
      r = await wrk.get('/billetera'); assert.equal(r.location, '/creditos', 'la billetera está apagada con créditos');
      r = await wrk.post('/billetera/retiro', { amount: '10', method: 'nequi', account: '3001234567' }); assert.equal(r.location, '/creditos', 'los retiros están apagados con créditos');
      r = await wrk.get('/panel'); assert.ok(r.status === 200 && r.text.includes('Mis créditos') && r.text.includes('Mis ofertas recientes') && !r.text.includes('Saldo disponible'), 'panel del modelo de créditos');
      r = await wrk.post('/creditos/comprar/2'); r = await wrk.get(r.location); assert.ok(r.status === 200 && r.text.includes('30 créditos'), 'la pantalla de pago de créditos se muestra');
      // 11) volver al modelo clásico no rompe nada
      await adm.post('/admin/modelo', { business_model: 'comision' }); assert.equal(db.settings().business_model, 'comision');
      r = await cli.get('/'); assert.ok(r.text.includes('Pago protegido en toda la plataforma'), 'modelo clásico intacto');
      // 12) bienvenida: cuenta nueva recibe créditos
      await adm.post('/admin/modelo', { business_model: 'creditos' });
      const rg = client(base); await rg.get('/registro');
      db.run('DELETE FROM rate_limits'); r = await rg.post('/registro', { name: 'Persona Nueva Prueba', email: 'nueva@t.co', country: 'CO', currency: 'USD', password: 'secreto123', password2: 'secreto123', terms: '1' });
      assert.equal(cr.balance(db.one('SELECT id FROM users WHERE email=?', 'nueva@t.co').id), db.settings().welcome_credits, 'créditos de bienvenida');
      await adm.post('/admin/modelo', { business_model: 'comision' });
    }

    // CSRF
    r = await fetch(base + '/salir', { method: 'POST', redirect: 'manual' }); assert.equal(r.status, 403, 'csrf');
    for (const p of ['/panel', '/pedidos', '/pedidos?rol=cliente', '/mensajes', '/notificaciones', '/postulaciones', '/cuenta', '/servicios/nuevo']) assert.equal((await wrk.get(p)).status, 200, p);
    console.log('✔ Todas las pruebas pasaron');
  } finally { srv.close(); }
})().catch((e) => { console.error('✘', e.message, (e.stack || '').split('\n').find((l) => l.includes('e2e.js'))); process.exit(1); });

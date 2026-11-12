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

    // Billetera: $10 - 5% = $9.50 en liberación
    r = await wrk.get('/billetera'); assert.ok(r.text.includes('+$9.50 USD'), 'ganancia neta (95 %)');
    r = await wrk.post('/billetera/retiro', { amount: '8', method: 'nequi', account: '3001112233' });
    r = await wrk.get('/billetera'); assert.ok(r.text.includes('verificar tu identidad'), 'retiro exige verificación');

    // Admin
    await adm.get('/ingresar');
    r = await adm.post('/ingresar', { email: 'admin@microtrabajo.local', password: 'admin12345', next: '/admin' });
    r = await adm.get('/admin'); assert.ok(r.text.includes('$0.50 USD'), 'ingresos plataforma (comisión 5 %)');
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
      r = await adm.get('/admin/configuracion'); assert.ok(r.text.includes('name="commission_pct" value="5"'), 'el panel muestra la tarifa normal, no la de promoción');
      db.run("UPDATE settings SET value=? WHERE key='promo_until'", String(Date.now() - 1000));
      assert.equal(db.settings().commission_pct, 5, 'al vencer vuelve sola a la tarifa normal (5 %)');
      assert.equal(mk.commissionFor(1, 10000), 500, 'comisión única del 5 %, igual para todos');
      assert.equal(mk.clientFee(10000), 0, 'tarifa al cliente 0 %');
      assert.equal((await cli.get('/planes')).location, '/como-funciona', 'los planes ya no existen');
      r = await cli.get('/como-funciona'); assert.ok(r.text.includes('exactamente el precio publicado') && !r.text.includes('plan Pro'), 'cómo funciona sin planes');
      r = await adm.get('/admin/configuracion'); assert.ok(!r.text.includes('plan_pro_cents') && !r.text.includes('pro_commission_pct'), 'panel sin campos de planes');
      r = await cli.get('/'); assert.ok(!r.text.includes('Lanzamiento:'), 'aviso oculto al vencer');
      await adm.post('/admin/configuracion', { promo_active: '1', promo_until: '2099-01-01', promo_commission_pct: '2', promo_client_fee_pct: '1', commission_pct: '5', client_fee_pct: '0' });
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

    // CSRF
    r = await fetch(base + '/salir', { method: 'POST', redirect: 'manual' }); assert.equal(r.status, 403, 'csrf');
    for (const p of ['/panel', '/pedidos', '/pedidos?rol=cliente', '/mensajes', '/notificaciones', '/postulaciones', '/cuenta', '/servicios/nuevo']) assert.equal((await wrk.get(p)).status, 200, p);
    console.log('✔ Todas las pruebas pasaron');
  } finally { srv.close(); }
})().catch((e) => { console.error('✘', e.message, (e.stack || '').split('\n').find((l) => l.includes('e2e.js'))); process.exit(1); });

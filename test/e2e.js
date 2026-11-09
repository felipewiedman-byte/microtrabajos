// Prueba de punta a punta: registro, publicación, postulación, pago de prueba, entrega, aprobación, billetera, admin.
// Uso: npm test   (levanta un servidor temporal con una base de datos aislada)
const assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-test-'));
process.env.SEED_DEMO = '0';
process.env.ADMIN_PASSWORD = 'admin12345';
const app = require('../server');

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
    r = await cli.get(payUrl); assert.ok(r.text.includes('$10.40 USD'), 'total con tarifa 4 %');
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
    r = await adm.get('/admin'); assert.ok(r.text.includes('$0.80 USD') && r.text.includes('$0.40 USD'), 'ingresos plataforma');
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
    r = await cli.get(offerOrder); assert.ok(r.text.includes('Pagar $15.60 USD'), 'oferta con tarifa');
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
    assert.ok(r.text.includes('--brand:#0f766e') && r.text.includes('MiMarca') && r.text.includes('family=Roboto'), 'apariencia aplicada');
    const logo = r.text.match(/\/media\/([a-f0-9]+\.png)/)[1];
    assert.equal((await fetch(base + '/media/' + logo)).status, 200, 'logo público');
    assert.ok(!r.text.includes('Empieza gratis, crece cuando lo necesites'), 'sección de planes oculta');
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

    // CSRF
    r = await fetch(base + '/salir', { method: 'POST', redirect: 'manual' }); assert.equal(r.status, 403, 'csrf');
    for (const p of ['/panel', '/pedidos', '/pedidos?rol=cliente', '/mensajes', '/notificaciones', '/postulaciones', '/cuenta', '/servicios/nuevo']) assert.equal((await wrk.get(p)).status, 200, p);
    console.log('✔ Todas las pruebas pasaron');
  } finally { srv.close(); }
})().catch((e) => { console.error('✘', e.message, (e.stack || '').split('\n').find((l) => l.includes('e2e.js'))); process.exit(1); });

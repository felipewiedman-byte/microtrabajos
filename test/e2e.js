// Prueba de punta a punta: registro, publicación, postulación, pago de prueba, entrega, aprobación, billetera, admin.
// Uso: npm test   (levanta un servidor temporal con una base de datos aislada)
const assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-test-'));
process.env.SEED_DEMO = '0';
process.env.ADMIN_PASSWORD = 'admin12345';
const app = require('../server');

function client(base) {
  let cookie = '', csrf = '';
  const req = async (method, url, form) => {
    const opts = { method, redirect: 'manual', headers: { cookie } };
    if (form) {
      if (form instanceof FormData) { form.append('_csrf', csrf); opts.body = form; }
      else { opts.headers['content-type'] = 'application/x-www-form-urlencoded'; opts.body = new URLSearchParams({ _csrf: csrf, ...form }); }
    }
    const res = await fetch(base + url, opts);
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
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
    const mk = (desc) => { const f = new FormData(); Object.entries({ title: 'Necesito un flyer para evento', category_id: '1', delivery_hours: '24', description: desc, mode: 'single', budget: '10' }).forEach(([k, v]) => f.append(k, v)); return f; };
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
    r = await cli.get(payUrl); assert.ok(r.text.includes('$10.50 USD'), 'total con tarifa 5% (mín 0.50)');
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

    // Billetera: $10 - 15% = $8.50 en liberación
    r = await wrk.get('/billetera'); assert.ok(r.text.includes('+$8.50 USD'), 'ganancia neta');
    r = await wrk.post('/billetera/retiro', { amount: '8', method: 'nequi', account: '3001112233' });
    r = await wrk.get('/billetera'); assert.ok(r.text.includes('verificar tu identidad'), 'retiro exige verificación');

    // Admin
    await adm.get('/ingresar');
    r = await adm.post('/ingresar', { email: 'admin@microtrabajo.local', password: 'admin12345', next: '/admin' });
    r = await adm.get('/admin'); assert.ok(r.text.includes('$1.50 USD') && r.text.includes('$0.50 USD'), 'ingresos plataforma');
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
    r = await cli.get(offerOrder); assert.ok(r.text.includes('Pagar $15.75 USD'), 'oferta con tarifa');
    r = await wrk.post(`/preguntas/${qid}/responder`, { answer: 'mi correo es pepe arroba gmail punto com' });
    r = await wrk.get(gigUrl); assert.ok(!r.text.includes('pepe') && r.text.includes('contiene datos de contacto'), 'respuesta con contacto bloqueada');

    r = await cli.get('/admin'); assert.equal(r.status, 403, 'admin protegido');

    // CSRF
    r = await fetch(base + '/salir', { method: 'POST', redirect: 'manual' }); assert.equal(r.status, 403, 'csrf');
    for (const p of ['/panel', '/pedidos', '/pedidos?rol=cliente', '/mensajes', '/notificaciones', '/postulaciones', '/cuenta', '/servicios/nuevo']) assert.equal((await wrk.get(p)).status, 200, p);
    console.log('✔ Todas las pruebas pasaron');
  } finally { srv.close(); }
})().catch((e) => { console.error('✘', e.message); process.exit(1); });

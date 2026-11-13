// Pruebas de extremo a extremo: levantan el servidor con una base temporal y recorren los flujos reales.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const PORT = 3800 + Math.floor(Math.random() * 150), BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-'));
let pass = 0, SERVER_LOGS = '';
const ok = (name, cond, extra) => { if (!cond) { console.error('✗ ' + name, extra ?? '', '\n--- registro del servidor ---\n' + SERVER_LOGS.slice(0, 900)); process.exitCode = 1; throw new Error('Falló: ' + name); } pass++; };

// Cliente HTTP con cookies
function client() {
  const jar = {};
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  async function req(method, url, { form, json, multipart, headers = {} } = {}) {
    const h = { cookie: cookie(), ...headers };
    let body;
    if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
    if (multipart) body = multipart;
    const r = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '' || /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(c)) delete jar[k]; else jar[k] = v; }
    const text = await r.text();
    return { status: r.status, text, loc: r.headers.get('location'), headers: r.headers, json: () => JSON.parse(text) };
  }
  const csrf = async () => { if (!jar.vt_csrf) await req('GET', '/registro'); return jar.vt_csrf; };
  return {
    get: (u) => req('GET', u), req,
    async post(u, form) { return req('POST', u, { form: { _csrf: await csrf(), ...form } }); },
    async postJson(u, json) { return req('POST', u, { json: { _csrf: await csrf(), ...json } }); },
    async upload(u, fields, file) {
      const fd = new FormData(); fd.append('_csrf', await csrf());
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      for (const f of (Array.isArray(file) ? file : file ? [file] : [])) fd.append(f.field, new Blob([f.data], { type: f.type }), f.name);
      return req('POST', u, { multipart: fd });
    },
    jar,
  };
}

// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// Mercado Pago simulado: responde como su API (credenciales, preferencias y consulta de pagos).
const http = require('http');
const MPTOKEN = 'APP_USR-1111111111111111-010101-abcdefabcdefabcdefabcdef-123456';
const PLATTOKEN = 'APP_USR-2222222222222222-020202-fedcbafedcbafedcbafedcba-654321';
const mpState = { prefs: [], payments: {}, failPref: false, auth: [] };
const ppState = { orders: {}, tamper: false, n: 0, basic: [], approved: new Set(), captured: new Set() };
const fakeMp = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + MPTOKEN && req.headers.authorization !== 'Bearer ' + PLATTOKEN) return send(401, { message: 'invalid token' });
    mpState.auth.push(req.headers.authorization);
    if (req.method === 'GET' && req.url === '/users/me') return send(200, { id: 1, nickname: 'TESTUSER123' });
    if (req.method === 'POST' && req.url === '/checkout/preferences') {
      if (mpState.failPref) return send(500, { message: 'boom' });
      const b = JSON.parse(body); mpState.prefs.push(b); return send(201, { id: 'pref-' + mpState.prefs.length, init_point: 'https://mp.test/pay/' + mpState.prefs.length });
    }
    const sm = /^\/v1\/payments\/search\?external_reference=([^&]+)/.exec(req.url);
    if (req.method === 'GET' && sm) { const ref = decodeURIComponent(sm[1]); return send(200, { results: Object.values(mpState.payments).filter((p) => p.external_reference === ref) }); }
    const m = /^\/v1\/payments\/(\d+)$/.exec(req.url);
    if (req.method === 'GET' && m) return mpState.payments[m[1]] ? send(200, mpState.payments[m[1]]) : send(404, { message: 'not found' });
    send(404, {});
  });
});

const plansBody = (o = {}) => {
  const f = (k, on) => Object.fromEntries(['coupons', 'stats', 'clients', 'payments', 'nobrand', 'domain'].map((x) => [`${k}_f_${x}`, on.includes(x) ? '1' : '']).filter(([, v]) => v));
  return { price_currency: 'USD', plans_common: 'Pedidos por WhatsApp y Messenger\nInventario con “agotado” automático',
    trial_name: 'Prueba gratis', trial_descr: 'Todo, sin tarjeta', trial_limit: '10', trial_quota: '100', trial_days: '14', trial_cta: 'Empezar la prueba', trial_extra: '', trial_active: '1', ...f('trial', 'coupons stats clients payments nobrand'),
    basic_name: 'Básico', basic_price: '4', basic_descr: 'Para vender cada semana', basic_limit: '50', basic_quota: '300', basic_cta: 'Elegir Básico', basic_extra: '', basic_hot: '1', basic_active: '1', basic_disc3: '0', basic_disc12: '10', ...f('basic', 'coupons payments nobrand'),
    pro_name: 'Pro', pro_price: '8', pro_descr: 'Para crecer con datos', pro_limit: '500', pro_quota: '1500', pro_cta: 'Elegir Pro', pro_extra: 'Prioridad en soporte', pro_active: '1', pro_disc3: '5', pro_disc12: '20', ...f('pro', 'coupons stats clients payments nobrand domain'), ...o };
};
// PayPal simulado (OAuth, crear orden y capturar).
const fakePp = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/v1/oauth2/token') { ppState.basic.push(req.headers.authorization); return req.headers.authorization === 'Basic ' + Buffer.from('PPID:PPSECRET').toString('base64') ? send(200, { access_token: 'PPTOK' }) : send(401, { error: 'invalid_client' }); }
    if (req.headers.authorization !== 'Bearer PPTOK') return send(401, { message: 'no auth' });
    if (req.method === 'POST' && req.url === '/v2/checkout/orders') { const b = JSON.parse(body); const id = 'PPORD' + (++ppState.n); ppState.orders[id] = b; return send(201, { id, status: 'CREATED', links: [{ rel: 'approve', href: 'https://pp.test/approve/' + id }] }); }
    const go = /^\/v2\/checkout\/orders\/(\w+)$/.exec(req.url);
    if (req.method === 'GET' && go && ppState.orders[go[1]]) { const id = go[1], u = ppState.orders[id].purchase_units[0], cap = ppState.captured.has(id); return send(200, { id, status: cap ? 'COMPLETED' : (ppState.approved.has(id) ? 'APPROVED' : 'CREATED'), purchase_units: [{ custom_id: u.custom_id, payments: cap ? { captures: [{ id: 'CAP' + id, status: 'COMPLETED', amount: u.amount }] } : {} }] }); }
    const m = /^\/v2\/checkout\/orders\/(\w+)\/capture$/.exec(req.url);
    if (req.method === 'POST' && m && ppState.orders[m[1]]) {
      ppState.captured.add(m[1]);
      const u = ppState.orders[m[1]].purchase_units[0], amt = ppState.tamper ? { currency_code: u.amount.currency_code, value: '0.01' } : u.amount;
      return send(201, { id: m[1], status: 'COMPLETED', purchase_units: [{ custom_id: u.custom_id, payments: { captures: [{ id: 'CAP' + m[1], status: 'COMPLETED', amount: amt }] } }] });
    }
    send(404, {});
  });
});

// Servidor SMTP simulado: guarda los correos que recibe.
const net = require('net'); const smtpMsgs = [];
const fakeSmtp = net.createServer((sock) => {
  let buf = '', inData = false; sock.write('220 fake ESMTP\r\n');
  sock.on('data', (d) => {
    buf += d.toString('latin1');
    for (;;) {
      if (inData) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; smtpMsgs.push(buf.slice(0, i)); buf = buf.slice(i + 5); inData = false; sock.write('250 OK queued\r\n'); continue; }
      const j = buf.indexOf('\r\n'); if (j < 0) return;
      const line = buf.slice(0, j); buf = buf.slice(j + 2); const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-fake\r\n250 8BITMIME\r\n'); else if (cmd === 'DATA') { sock.write('354 go\r\n'); inData = true; } else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); } else sock.write('250 OK\r\n');
    }
  });
  sock.on('error', () => {});
});

async function main() {
  await new Promise((r) => fakeMp.listen(0, '127.0.0.1', r));
  await new Promise((r) => fakeSmtp.listen(0, '127.0.0.1', r));
  await new Promise((r) => fakePp.listen(0, '127.0.0.1', r));
  // Cloudflare R2 simulado: comprueba la firma AWS SigV4 de cada petición con la clave secreta de prueba.
  const R2 = { objects: new Map(), badSig: 0 };
  const fakeR2 = http.createServer((req, res) => {
    const parts = []; req.on('data', (d) => parts.push(d));
    req.on('end', () => {
      const body = Buffer.concat(parts), cr = require('crypto'), h = (k, d) => cr.createHmac('sha256', k).update(d).digest();
      const m = /Credential=([^/]+)\/(\d{8})\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=([a-f0-9]{64})/.exec(req.headers.authorization || '');
      const ph = cr.createHash('sha256').update(body).digest('hex');
      const canon = [req.method, req.url, '', `host:${req.headers.host}`, `x-amz-content-sha256:${req.headers['x-amz-content-sha256']}`, `x-amz-date:${req.headers['x-amz-date']}`, '', 'host;x-amz-content-sha256;x-amz-date', ph].join('\n');
      const sig = m && cr.createHmac('sha256', h(h(h(h('AWS4' + 'r2-secret-de-prueba', m[2]), 'auto'), 's3'), 'aws4_request')).update(['AWS4-HMAC-SHA256', req.headers['x-amz-date'], `${m[2]}/auto/s3/aws4_request`, cr.createHash('sha256').update(canon).digest('hex')].join('\n')).digest('hex');
      if (!m || m[1] !== 'R2KEYID123' || sig !== m[3] || ph !== req.headers['x-amz-content-sha256']) { R2.badSig++; res.writeHead(403); return res.end('SignatureDoesNotMatch'); }
      if (!req.url.startsWith('/vitrina-test/')) { res.writeHead(404); return res.end('NoSuchBucket'); }
      const key = decodeURIComponent(req.url.slice('/vitrina-test/'.length));
      if (req.method === 'PUT') { R2.objects.set(key, { body, type: req.headers['content-type'] }); res.writeHead(200); return res.end(); }
      if (req.method === 'GET') { const o = R2.objects.get(key); if (!o) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': o.type }); return res.end(o.body); }
      if (req.method === 'DELETE') { R2.objects.delete(key); res.writeHead(204); return res.end(); }
      res.writeHead(405); res.end();
    });
  });
  await new Promise((r) => fakeR2.listen(0, '127.0.0.1', r));
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, MP_API_BASE: `http://127.0.0.1:${fakeMp.address().port}`, PP_API_BASE: `http://127.0.0.1:${fakePp.address().port}`, R2_ENDPOINT: `http://127.0.0.1:${fakeR2.address().port}`, ORDER_RATE_MAX: '60', RECONCILE_MS: '400', REG_RATE_MAX: '50', TRIAL_IP_MAX: '50', ORPHAN_SWEEP_MS: '400', ORPHAN_MIN_AGE_MS: '1500', PAY_EXPIRE_MS: '4500', PAY_SWEEP_MS: '400', PORT, DATA_DIR: DATA, ADMIN_EMAIL: 'admin@test.co', ADMIN_PASSWORD: 'admin-pass-123', NODE_ENV: 'development', BASE_URL: BASE, SESSION_SECRET: 'x'.repeat(40) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  srv.stdout.on('data', (d) => { logs += d; SERVER_LOGS = logs; }); srv.stderr.on('data', (d) => { logs += d; SERVER_LOGS = logs; });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/robots.txt'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

    // ---------- Páginas públicas ----------
    const anon = client();
    for (const p of ['/', '/planes', '/registro', '/ingresar', '/recuperar', '/terminos', '/privacidad', '/robots.txt', '/sitemap.xml']) ok('GET ' + p, (await anon.get(p)).status === 200, p);
    const home = await anon.get('/');
    ok('seguridad: CSP presente', /script-src 'self'/.test(home.headers.get('content-security-policy') || ''));
    ok('seguridad: sin script en línea', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(home.text));
    ok('home muestra precios del admin', /\$4/.test(home.text) && /\$8/.test(home.text));
    ok('404 amable', (await anon.get('/nada-aqui')).status === 404);
    ok('panel exige login', (await anon.get('/panel')).loc?.startsWith('/ingresar'));
    ok('admin exige login', (await anon.get('/admin')).loc?.startsWith('/ingresar'));

    // ---------- Registro y validaciones ----------
    const dueno = client();
    let r = await dueno.post('/registro', { name: 'Ana Pérez', email: 'ana@test.co', password: '123', terms: '1' });
    ok('registro: clave corta rechazada', r.status === 400 && /entre 8 y 72/.test(r.text));
    r = await dueno.post('/registro', { name: 'Ana Pérez', email: 'ana@test.co', password: 'clave-segura-1' });
    ok('registro: exige términos', r.status === 400 && /términos/.test(r.text));
    r = await dueno.post('/registro', { name: 'Ana Pérez', email: 'ana@test.co', password: 'clave-segura-1', terms: '1' });
    ok('registro: ok y va a crear negocio', r.status === 302 && r.loc === '/panel/crear', r.status);
    r = await client().post('/registro', { name: 'Otra', email: 'ANA@test.co', password: 'clave-segura-1', terms: '1' });
    ok('registro: correo repetido (sin importar mayúsculas)', r.status === 400 && /ya tiene una cuenta/.test(r.text));
    ok('CSRF: POST sin token rechazado', (await client().req('POST', '/registro', { form: { name: 'x', email: 'x@x.co', password: '12345678', terms: '1' } })).status === 403);

    // ---------- Crear negocio ----------
    r = await dueno.post('/panel/crear', { name: 'Panadería La Espiga', kind: 'comida', whatsapp: '123', currency: 'COP', tz: 'America/Bogota' });
    ok('crear negocio: WhatsApp inválido rechazado', r.status === 400);
    r = await dueno.post('/panel/crear', { name: 'Panadería La Espiga', kind: 'comida', whatsapp: '+57 300 123 4567', currency: 'COP', tz: 'America/Bogota', city: 'Medellín' });
    ok('crear negocio: ok', r.status === 302 && r.loc === '/panel/productos/nuevo', r.text.slice(0, 200));
    ok('panel: resumen carga', (await dueno.get('/panel')).status === 200);
    const slug = 'panaderia-la-espiga';
    { const cv = await anon.get('/t/' + slug); ok('catálogo vacío carga', /Panadería La Espiga/.test(cv.text), cv.status + ' ' + cv.text.slice(0, 600)); }

    // Slug único para otro negocio con el mismo nombre
    const otro = client();
    await otro.post('/registro', { name: 'Beto', email: 'beto@test.co', password: 'clave-segura-2', terms: '1' });
    await otro.post('/panel/crear', { name: 'Panadería La Espiga', whatsapp: '573009998888', currency: 'USD', tz: 'America/Bogota' });
    ok('slug único (-2)', (await anon.get('/t/panaderia-la-espiga-2')).status === 200);

    // ---------- Categorías y productos ----------
    await dueno.post('/panel/categorias', { accion: 'add', name: 'Panes' });
    await dueno.post('/panel/categorias', { accion: 'add', name: 'Bebidas' });
    const pg = await dueno.get('/panel/productos');
    const catId = /name="id" value="(\d+)"/.exec(pg.text)[1];
    const mk = (f) => dueno.upload('/panel/productos/guardar', f.fields, f.file);
    r = await mk({ fields: { name: '', price: '3500' } });
    ok('producto sin nombre rechazado', r.status === 400 && /Escribe el nombre/.test(r.text));
    r = await mk({ fields: { name: 'Croissant', description: 'Mantequilla', price: '3.500', compare: '4.200', stock: '10', category_id: catId, active: '1', featured: '1' }, file: { field: 'image', data: PNG, type: 'image/png', name: 'a.png' } });
    ok('producto con imagen creado', r.status === 302 && r.loc === '/panel/productos', r.text.slice(0, 300));
    r = await mk({ fields: { name: 'Pan integral', price: '6000', active: '1' } });
    r = await mk({ fields: { name: 'Torta', price: '48000', stock: '0', active: '1' } });
    r = await mk({ fields: { name: 'Oculto', price: '1000' } }); // sin active -> oculto
    r = await mk({ fields: { name: 'Falso', price: '1000', active: '1' }, file: { field: 'image', data: Buffer.from('<?php echo 1;'), type: 'image/png', name: 'x.png' } });
    ok('imagen falsa se ignora (producto sin imagen)', r.status === 302);
    const files = fs.readdirSync(path.join(DATA, 'uploads'));
    ok('solo 1 imagen real guardada, sin temporales', files.length === 1 && /^[a-f0-9]{28}\.webp$/.test(files[0]), files);
    const cat = (await anon.get('/t/' + slug)).text;
    ok('catálogo: productos visibles', /Croissant/.test(cat) && /Pan integral/.test(cat) && /Torta/.test(cat));
    ok('catálogo: producto oculto no aparece', !/Oculto/.test(cat));
    ok('catálogo: precio con formato COP', /\$\s?3\.500/.test(cat.replace(/&nbsp;| /g, ' ')), cat.match(/\$[^<]{0,12}/g));
    ok('catálogo: agotado marcado', /Agotado/.test(cat));
    ok('catálogo: precio anterior tachado', /<s>/.test(cat));
    ok('catálogo: OG image del producto', true);
    const imgUrl = /src="(\/m\/[a-f0-9]{28}\.webp)"/.exec(cat)[1];
    const im = await anon.get(imgUrl);
    ok('imagen se sirve con caché', im.status === 200 && /immutable/.test(im.headers.get('cache-control')));
    ok('media: nombre inválido 404', (await anon.get('/m/../../etc/passwd')).status === 404 && (await anon.get('/m/abc.png')).status === 404);
    const prodIds = [...cat.matchAll(/data-id="(\d+)" data-name="([^"]+)"/g)].reduce((a, m) => (a[m[2]] = +m[1], a), {});
    ok('ids de productos', prodIds['Croissant'] && prodIds['Pan integral'] && prodIds['Torta']);
    ok('catálogo de producto con ?p= pone OG de producto', /og:type" content="product"/.test((await anon.get(`/t/${slug}?p=${prodIds['Croissant']}`)).text));
    const feed = await anon.get(`/t/${slug}/feed.csv`);
    ok('feed para Facebook/Instagram Shops', feed.status === 200 && /^id,title,description,availability,condition,price,link,image_link,brand/.test(feed.text) && /vt\d+,"Croissant".*in stock.*"3500\.00 COP".*\/m\/[a-f0-9]{28}\.webp/.test(feed.text), feed.text.slice(0, 400));
    ok('feed: solo productos con foto y visibles', feed.text.split('\n').length === 2 && !/Oculto|Pan integral/.test(feed.text), feed.text);
    ok('catálogo: botón de compartir por producto', /data-share="\d+"/.test(cat));
    ok('qr svg', /<svg/.test((await anon.get(`/t/${slug}/qr.svg`)).text));

    // Un negocio no puede tocar productos de otro
    r = await otro.post(`/panel/productos/${prodIds['Croissant']}/accion`, { accion: 'delete' });
    ok('aislamiento: otro dueño no puede borrar', r.status === 404, r.status);

    // ---------- Límite del plan gratis ----------
    const adm = client();
    r = await adm.post('/ingresar', { email: 'admin@test.co', password: 'admin-pass-123' });
    ok('admin ingresa y va directo a su panel', r.status === 302 && r.loc === '/admin', r.loc);
    ok('el admin no cae en "crear negocio" al abrir /panel', (await adm.get('/panel')).loc === '/admin');
    await adm.post('/admin/planes', plansBody({ trial_limit: '5' }));
    await adm.post('/admin/pagos', { accion: 'save', mp_enabled: '1', pp_mode: 'sandbox' });
    r = await mk({ fields: { name: 'Sexto', price: '10', active: '1' } });
    // ya hay 5 (Croissant, Pan, Torta, Oculto, Falso)
    ok('límite de productos de la prueba aplicado', r.status !== 302 && /límite/.test(r.text), r.status);

    // ---------- Pedidos ----------
    const cust = client();
    const items = [{ id: prodIds['Croissant'], qty: 2 }, { id: prodIds['Pan integral'], qty: 1 }];
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [], name: 'Laura' });
    ok('pedido vacío rechazado', r.status === 400);
    r = await cust.postJson(`/t/${slug}/pedido`, { items, name: '' });
    ok('pedido sin nombre rechazado', r.status === 400 && /nombre/.test(r.json().error));
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Torta'], qty: 1 }], name: 'Laura' });
    ok('producto agotado rechazado', r.status === 400 && /agotado/.test(r.json().error));
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Croissant'], qty: 11 }], name: 'Laura' });
    ok('más que el stock rechazado', r.status === 400 && /solo quedan 10/.test(r.json().error));
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: 99999, qty: 1 }], name: 'Laura' });
    ok('producto inexistente rechazado', r.status === 400);
    r = await cust.postJson(`/t/${slug}/pedido`, { items, name: 'Laura', phone: '3001112222', mode: 'pickup', note: 'Sin azúcar', price_cents: 1 });
    let j = r.json();
    ok('pedido creado', r.status === 200 && j.ok && j.code === '#1', JSON.stringify(j));
    ok('total calculado en el servidor (ignora precios del cliente)', j.total_cents === 2 * 350000 + 600000, j.total_cents);
    ok('enlace de WhatsApp correcto', j.url.startsWith('https://wa.me/573001234567?text=') && decodeURIComponent(j.url).includes('2 × Croissant') && decodeURIComponent(j.url).includes('Laura'), j.url);
    ok('inventario descontado (10 → 8)', /data-stock="8"/.test((await anon.get('/t/' + slug)).text));

    // Domicilio deshabilitado -> se trata como "recoger"
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 1 }], name: 'Pedro', mode: 'delivery', address: 'Calle 1' });
    ok('domicilio apagado cae a recoger', r.status === 200 && /Recoge en el local/.test(decodeURIComponent(r.json().url)));

    // Configurar negocio: domicilio, mínimo, horario, messenger, pagos
    const biz = {
      name: 'Panadería La Espiga', slug, tagline: 'Pan de verdad', description: 'Horneamos cada día.', kind: 'comida', whatsapp: '573001234567', messenger: 'https://facebook.com/laespiga', instagram: '@laespiga',
      address: 'Calle 10 # 5-20', city: 'Medellín', currency: 'COP', tz: 'America/Bogota', color: '#c2410c', pickup_on: '1', delivery_on: '1', delivery_fee: '5000', min_order: '10000',
      payment_info: 'Nequi: 300 123 4567\nEfectivo al recibir', accepting: '1', h_mon_on: '1', h_mon_o: '00:00', h_mon_c: '23:59', h_tue_on: '1', h_tue_o: '00:00', h_tue_c: '23:59', h_wed_on: '1', h_wed_o: '00:00', h_wed_c: '23:59', h_thu_on: '1', h_thu_o: '00:00', h_thu_c: '23:59', h_fri_on: '1', h_fri_o: '00:00', h_fri_c: '23:59', h_sat_on: '1', h_sat_o: '00:00', h_sat_c: '23:59', h_sun_on: '1', h_sun_o: '00:00', h_sun_c: '23:59',
    };
    r = await dueno.upload('/panel/negocio', biz);
    ok('negocio guardado', r.status === 302 && r.loc === '/panel/negocio', r.text.slice(0, 200));
    const shopHtml = (await anon.get('/t/' + slug)).text;
    ok('catálogo: color de marca', /--brand:#c2410c/.test(shopHtml));
    ok('catálogo: abierto 24h', /Abierto hasta/.test(shopHtml));
    ok('catálogo: messenger + domicilio + pagos', /id="sendMs"/.test(shopHtml) && /Domicilio/.test(shopHtml) && /Nequi: 300 123 4567/.test(shopHtml));
    ok('catálogo: sello de plataforma en plan gratis', /Hecho con/.test(shopHtml));

    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 1 }], name: 'Pedro', mode: 'delivery', address: '' });
    ok('mínimo de pedido', r.status === 400 && /mínimo/.test(r.json().error), r.text);
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 2 }], name: 'Pedro', mode: 'delivery', address: '' });
    ok('domicilio exige dirección', r.status === 400 && /dirección/.test(r.json().error));
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 2 }], name: 'Pedro', mode: 'delivery', address: 'Calle 99 # 1-2', channel: 'messenger' });
    j = r.json();
    ok('pedido a domicilio por messenger', r.status === 200 && j.total_cents === 1200000 + 500000 && j.url === 'https://m.me/laespiga' && j.payment_info === 'Nequi: 300 123 4567\nEfectivo al recibir', JSON.stringify(j));

    // Forma de pago elegida por el cliente y respuesta instantánea
    ok('catálogo: el cliente elige cómo pagar', /name="pay" value="0"/.test((await anon.get('/t/' + slug)).text) && /name="pay" value="1"/.test((await anon.get('/t/' + slug)).text));
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 2 }], name: 'Gina', mode: 'pickup', pay: 0 });
    j = r.json();
    ok('pedido incluye la forma de pago elegida y solo sus datos', r.status === 200 && decodeURIComponent(j.url).includes('💳 Pago: Nequi') && j.pay_method.text === 'Nequi: 300 123 4567' && j.payment_info === '', JSON.stringify(j));
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 2 }], name: 'Hugo', mode: 'pickup', pay: 99 });
    ok('forma de pago inválida se ignora', r.status === 200 && !/Pago:/.test(decodeURIComponent(r.json().url)) && r.json().pay_method === null);
    ok('panel: mensaje de bienvenida listo para WhatsApp Business', /id="autoreply"/.test((await dueno.get('/panel/negocio')).text) && /Nequi: 300 123 4567/.test((await dueno.get('/panel/negocio')).text));

    // ---------- Cupones ----------
    const aid = /\/admin\/usuarios\/(\d+)"[^>]*>\s*<input type="hidden" name="_csrf"[^>]*><input type="hidden" name="accion" value="plan"/.exec((await adm.get('/admin/usuarios?q=ana%40test.co')).text)[1];
    ok('prueba: el panel muestra los días que quedan y el catálogo es visible', /te quedan 14 días/.test((await dueno.get('/panel')).text) && (await anon.get('/t/' + slug)).status === 200);
    // Sin plan ni prueba vigente: el catálogo se pausa (no se borra nada)
    r = await adm.post(`/admin/usuarios/${aid}`, { accion: 'plan', plan: 'free', months: '1' });
    ok('sin plan: el catálogo queda en pausa para el público', r.status === 302 && (await anon.get('/t/' + slug)).status === 404 && !/\/t\/panaderia-la-espiga</.test((await anon.get('/sitemap.xml')).text));
    ok('sin plan: el dueño ve el aviso y conserva sus datos', /catálogo está en pausa/.test((await dueno.get('/panel')).text) && /Croissant/.test((await dueno.get('/panel/productos')).text));
    ok('sin plan: no puede cobrar en línea ni crear cupones', /Disponible desde el plan Básico/.test((await dueno.get('/panel/pagos')).text) && (await dueno.post('/panel/cupones', { accion: 'add', code: 'HOLA10', kind: 'pct', value: '10' })).status === 403);
    ok('sin plan: no puede agregar productos', /límite/.test((await mk({ fields: { name: 'Nuevo', price: '10', active: '1' } })).text));
    r = await adm.post(`/admin/usuarios/${aid}`, { accion: 'trial' });
    ok('admin extiende la prueba 7 días y el catálogo vuelve', r.status === 302 && (await anon.get('/t/' + slug)).status === 200 && /te quedan 7 días/.test((await dueno.get('/panel')).text));
    r = await adm.post(`/admin/usuarios/${aid}`, { accion: 'plan', plan: 'basic', months: '1' });
    ok('admin asigna plan básico', r.status === 302 && /Básico/.test((await dueno.get('/panel/plan')).text));
    r = await dueno.post('/panel/cupones', { accion: 'add', code: 'hola10', kind: 'pct', value: '10', max_uses: '1' });
    ok('cupón creado', r.status === 302 && r.loc === '/panel/cupones', r.status + ' ' + (r.text.match(/<p[^>]*>([^<]*)/)||[])[1]);
    ok('cupón repetido rechazado', (await dueno.post('/panel/cupones', { accion: 'add', code: 'HOLA10', kind: 'pct', value: '5' })).status === 400);
    r = await cust.postJson(`/t/${slug}/cupon`, { items, coupon: 'NOEXISTE', mode: 'pickup' });
    ok('cupón inválido', r.status === 400);
    r = await cust.postJson(`/t/${slug}/cupon`, { items, coupon: 'hola10', mode: 'pickup' });
    ok('cupón válido calcula 10%', r.status === 200 && r.json().discount_cents === 130000, r.text);
    r = await cust.postJson(`/t/${slug}/pedido`, { items, coupon: 'HOLA10', name: 'Laura', mode: 'pickup' });
    j = r.json();
    ok('pedido con cupón', r.status === 200 && j.total_cents === 1170000, JSON.stringify(j));
    r = await cust.postJson(`/t/${slug}/pedido`, { items, coupon: 'HOLA10', name: 'Laura', mode: 'pickup' });
    ok('cupón agotado (1 uso)', r.status === 400 && /no es válido/.test(r.json().error));

    // ---------- Gestión de pedidos ----------
    const ords = await dueno.get('/panel/pedidos');
    ok('panel de pedidos lista', ords.status === 200 && /Laura/.test(ords.text) && /Pedro/.test(ords.text));
    const oid = /\/panel\/pedidos\/(\d+)\/estado/.exec(ords.text)[1];
    const stockBefore = +/data-stock="(\d+)" data-search="croissant/.exec((await anon.get('/t/' + slug)).text)[1];
    // pedido más reciente = #5 con cupón; cancelarlo devuelve stock y cupón
    r = await dueno.post(`/panel/pedidos/${oid}/estado`, { estado: 'cancelled' });
    ok('cancelar pedido', r.status === 302);
    const stockAfter = +/data-stock="(\d+)" data-search="croissant/.exec((await anon.get('/t/' + slug)).text)[1];
    ok('cancelar devuelve inventario', stockAfter === stockBefore + 2, [stockBefore, stockAfter]);
    r = await dueno.post(`/panel/pedidos/${oid}/estado`, { estado: 'cancelled' });
    ok('cancelar dos veces no duplica inventario', +/data-stock="(\d+)" data-search="croissant/.exec((await anon.get('/t/' + slug)).text)[1] === stockAfter);
    r = await dueno.post(`/panel/pedidos/${oid}/estado`, { estado: 'inventado' });
    ok('estado inválido rechazado', r.status === 400);
    r = await otro.post(`/panel/pedidos/${oid}/estado`, { estado: 'done' });
    ok('aislamiento: otro dueño no ve pedidos ajenos', r.status === 400 || r.status === 404);

    // ---------- Plan Pro: clientes, reportes ----------
    { const c1 = await dueno.get('/panel/clientes'), c2 = await dueno.get('/panel/clientes.csv'); ok('clientes bloqueado en Básico', /Pro/.test(c1.text) && c2.status === 403, c1.status + ' ' + c2.status + ' ' + (c1.text.match(/badge[^>]*>[^<]*/) || [''])[0]); }
    await adm.post(`/admin/usuarios/${aid}`, { accion: 'plan', plan: 'pro', months: '0' });
    const cl = await dueno.get('/panel/clientes');
    ok('lista de clientes (Pro)', /Laura/.test(cl.text) && /Pedro/.test(cl.text));
    const csv = await dueno.get('/panel/clientes.csv');
    ok('CSV de clientes', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type')) && /Laura/.test(csv.text));
    ok('resumen: más pedidos (Pro)', /Croissant/.test((await dueno.get('/panel')).text));
    ok('sin sello en Pro', !/Hecho con/.test((await anon.get('/t/' + slug)).text));
    const shp = (await dueno.get('/panel/compartir')).text;
    ok('compartir: imagen, texto y guía de Facebook/Instagram Shops', /id="poster"/.test(shp) && /id="caption"/.test(shp) && /feed\.csv/.test(shp) && /Commerce Manager/.test(shp));
    ok('plan, cuenta, cupones, negocio cargan', (await Promise.all(['/panel/plan', '/panel/cuenta', '/panel/cupones', '/panel/negocio', '/panel/productos', `/panel/productos/${prodIds['Croissant']}/editar`, '/panel/productos/nuevo'].map((u) => dueno.get(u)))).every((x) => x.status === 200));


    // ---------- Cobro en línea (Mercado Pago) ----------
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await dueno.upload('/panel/negocio', { ...biz, min_order: '' }); // sin pedido mínimo para estas pruebas
    ok('pagos: página del panel carga', /Cobro en línea/.test((await dueno.get('/panel/pagos')).text));
    ok('pagos: sin clave, el catálogo no muestra "Pagar ahora"', !/id="payNow"/.test((await anon.get('/t/' + slug)).text));
    r = await dueno.post('/panel/pagos', { accion: 'connect', token: 'corta' });
    ok('pagos: formato de clave inválido rechazado', r.status === 400 && /formato/.test(r.text));
    r = await dueno.post('/panel/pagos', { accion: 'connect', token: 'APP_USR-9999999999999999-010101-zzzzzzzzzzzzzzzzzzzzzzzz-999' });
    ok('pagos: clave que Mercado Pago rechaza no se guarda', r.status === 400 && /no aceptó/.test(r.text));
    r = await dueno.post('/panel/pagos', { accion: 'connect', token: MPTOKEN });
    ok('pagos: conecta la cuenta', r.status === 302 && r.loc === '/panel/pagos');
    const pg2 = (await dueno.get('/panel/pagos')).text;
    ok('pagos: la clave se muestra enmascarada, nunca completa', /••••••••3456/.test(pg2) && !pg2.includes(MPTOKEN) && !(await anon.get('/t/' + slug)).text.includes(MPTOKEN));
    const cat2 = (await anon.get('/t/' + slug)).text;
    ok('pagos: el catálogo ofrece "Pagar ahora" y WhatsApp', /id="payNow"/.test(cat2) && /Pedir por WhatsApp/.test(cat2));
    const latest = async () => +/\/panel\/pedidos\/(\d+)\/estado/.exec((await dueno.get('/panel/pedidos')).text)[1];
    const stockOf = async () => +/data-stock="(\d+)" data-search="croissant/.exec((await anon.get('/t/' + slug)).text)[1];
    const itemsPay = [{ id: prodIds['Croissant'], qty: 1 }];
    const st0 = await stockOf();

    r = await cust.postJson(`/t/${slug}/pagar`, { items: itemsPay, name: 'Sofía', mode: 'pickup' });
    j = r.json();
    ok('pagar: devuelve el enlace de Mercado Pago', r.status === 200 && j.ok && j.url === 'https://mp.test/pay/1', r.text);
    const oid1 = await latest();
    const pref = mpState.prefs[0];
    ok('pagar: monto, moneda y referencia correctos', pref.items[0].unit_price === 3500 && pref.items[0].currency_id === 'COP' && pref.external_reference === `vt-1-${oid1}` && pref.items[0].quantity === 1, JSON.stringify(pref));
    ok('pagar: se usó la clave del negocio', mpState.auth.includes('Bearer ' + MPTOKEN));
    ok('pagar: pedido queda como "Pago pendiente" y descuenta stock', /Pago pendiente/.test((await dueno.get('/panel/pedidos')).text) && (await stockOf()) === st0 - 1);
    const pay = (id, o) => { mpState.payments[id] = { id: +id, status: 'approved', transaction_amount: 3500, currency_id: 'COP', external_reference: `vt-1-${oid1}`, payment_type_id: 'credit_card', ...o }; };

    // Montos falsos, pagos de otro negocio y avisos inventados no marcan el pedido como pagado
    pay('900002', { transaction_amount: 1 });
    let g = await anon.get(`/t/${slug}/gracias?payment_id=900002&external_reference=vt-1-${oid1}`);
    ok('seguridad: pago con monto distinto NO confirma el pedido', /en proceso/.test(g.text) && /Pago pendiente/.test((await dueno.get('/panel/pedidos')).text));
    pay('900003', { external_reference: `vt-2-${oid1}` });
    await anon.get(`/t/${slug}/gracias?payment_id=900003`);
    ok('seguridad: pago de otro negocio se ignora', /Pago pendiente/.test((await dueno.get('/panel/pedidos')).text));
    r = await anon.req('POST', `/webhooks/mp/${slug}?data.id=424242`);
    ok('webhook: id desconocido responde 200 sin romper nada', r.status === 200);
    pay('900004', { currency_id: 'USD' });
    await anon.get(`/t/${slug}/gracias?payment_id=900004`);
    ok('seguridad: pago en otra moneda se ignora', /Pago pendiente/.test((await dueno.get('/panel/pedidos')).text));

    // Pago real aprobado (regreso del cliente)
    pay('900001', {});
    g = await anon.get(`/t/${slug}/gracias?payment_id=900001&external_reference=vt-1-${oid1}&status=approved`);
    ok('gracias: pago verificado y confirmado', g.status === 200 && /¡Pago recibido!/.test(g.text) && /wa\.me\/573001234567/.test(g.text) && decodeURIComponent((/href="(https:\/\/wa\.me[^"]+)"/.exec(g.text) || [0, ''])[1]).includes('Pagado en línea'));
    ok('pedido pasa a "Pagado en línea"', /Pagado en línea/.test((await dueno.get('/panel/pedidos')).text) && !/Pago pendiente/.test((await dueno.get('/panel/pedidos')).text));
    await anon.get(`/t/${slug}/gracias?payment_id=900001`);
    ok('repetir la verificación es inofensivo', (await stockOf()) === st0 - 1);

    // Aviso automático (webhook)
    r = await cust.postJson(`/t/${slug}/pagar`, { items: itemsPay, name: 'Tomás', mode: 'pickup' });
    const oid2 = await latest();
    pay('900010', { external_reference: `vt-1-${oid2}` });
    r = await anon.req('POST', `/webhooks/mp/${slug}`, { json: { type: 'payment', data: { id: '900010' } } });
    await sleep(300);
    ok('webhook confirma el pago sin que el cliente vuelva', r.status === 200 && (await dueno.get('/panel/pedidos')).text.split('Pagado en línea').length === 3);

    // Pago rechazado
    r = await cust.postJson(`/t/${slug}/pagar`, { items: itemsPay, name: 'Rita', mode: 'pickup' });
    const oid3 = await latest();
    pay('900020', { external_reference: `vt-1-${oid3}`, status: 'rejected' });
    await anon.req('POST', `/webhooks/mp/${slug}?data.id=900020&type=payment`);
    await sleep(300);
    ok('pago rechazado se marca como fallido', /Pago fallido/.test((await dueno.get('/panel/pedidos')).text));

    // Conciliación: el pedido se confirma solo aunque no llegue el aviso ni el cliente vuelva a la página
    await cust.postJson(`/t/${slug}/pagar`, { items: itemsPay, name: 'Olga', mode: 'pickup' });
    const oid4 = await latest(); pay('900030', { external_reference: `vt-1-${oid4}` }); await sleep(1500);
    ok('conciliación: el pedido pasa a "Pagado en línea" solo, sin aviso ni regreso del cliente', (await dueno.get('/panel/pedidos')).text.split('Pagado en línea').length === 4);

    // Si Mercado Pago falla al crear el pago, no queda un pedido colgado y el inventario vuelve
    const stBefore = await stockOf(); const prefsBefore = mpState.prefs.length;
    mpState.failPref = true;
    r = await cust.postJson(`/t/${slug}/pagar`, { items: itemsPay, name: 'Luis', mode: 'pickup' });
    mpState.failPref = false;
    ok('error de Mercado Pago: mensaje amable (502) y sin filtrar detalles', r.status === 502 && /No pudimos iniciar el pago/.test(r.json().error) && !/boom/.test(r.text));
    ok('error de Mercado Pago: inventario restituido', (await stockOf()) === stBefore && mpState.prefs.length === prefsBefore);

    // Pago iniciado que nunca se completa: vence solo y devuelve el inventario
    const stE = await stockOf();
    r = await cust.postJson(`/t/${slug}/pagar`, { items: itemsPay, name: 'Vera', mode: 'pickup' });
    ok('pago pendiente descuenta stock', (await stockOf()) === stE - 1);
    await sleep(5600);
    ok('pago abandonado: el pedido vence y el stock vuelve', (await stockOf()) === stE && /Pago fallido/.test((await dueno.get('/panel/pedidos')).text));

    // Negocio sin plan de pago no puede cobrar en línea
    r = await otro.postJson(`/t/panaderia-la-espiga-2/pagar`, { items: [{ id: 99, qty: 1 }], name: 'Zed' });
    ok('sin cuenta conectada: cobro en línea no disponible', r.status === 400 && /no tiene el pago en línea/.test(r.json().error));
    ok('prueba: el panel ofrece conectar la cuenta de cobro', /Conectar mi cuenta/.test((await otro.get('/panel/pagos')).text));

    // Desconectar
    await dueno.post('/panel/pagos', { accion: 'disconnect' });
    ok('desconectar: el catálogo vuelve a solo WhatsApp', !/id="payNow"/.test((await anon.get('/t/' + slug)).text) && (await cust.postJson(`/t/${slug}/pagar`, { items: itemsPay, name: 'Q' })).status === 400);

    // ---------- Negocio cerrado / pausado ----------
    await dueno.upload('/panel/negocio', { ...biz, accepting: '' });
    ok('sin recibir pedidos', (await cust.postJson(`/t/${slug}/pedido`, { items, name: 'X', mode: 'pickup' })).status === 400);
    await dueno.upload('/panel/negocio', biz);

    // ---------- Admin ----------
    ok('admin: panel, usuarios, ajustes', (await Promise.all(['/admin', '/admin/usuarios', '/admin/ajustes'].map((u) => adm.get(u)))).every((x) => x.status === 200));
    ok('usuario normal no entra al admin', (await dueno.get('/admin')).status === 403);
    r = await adm.post(`/admin/usuarios/${aid}`, { accion: 'shop' });
    ok('admin pausa catálogo', (await anon.get('/t/' + slug)).status === 404);
    await adm.post(`/admin/usuarios/${aid}`, { accion: 'shop' });
    ok('admin reactiva catálogo', (await anon.get('/t/' + slug)).status === 200);
    await adm.post(`/admin/usuarios/${aid}`, { accion: 'status' });
    ok('suspendido: catálogo no visible y sesión cerrada', (await anon.get('/t/' + slug)).status === 404 && (await dueno.get('/panel')).loc?.startsWith('/ingresar'));
    r = await client().post('/ingresar', { email: 'ana@test.co', password: 'clave-segura-1' });
    ok('suspendido no puede ingresar', r.status === 400);
    await adm.post(`/admin/usuarios/${aid}`, { accion: 'status' });

    // ---------- Sesión, clave y recuperación ----------
    const c2 = client();
    r = await c2.post('/ingresar', { email: 'ana@test.co', password: 'mala' });
    ok('login: clave incorrecta', r.status === 400 && /incorrectos/.test(r.text));
    r = await c2.post('/ingresar', { email: 'ana@test.co', password: 'clave-segura-1', next: 'https://evil.com' });
    ok('login: no redirige a sitios externos', r.status === 302 && r.loc === '/panel', r.loc);
    for (let i = 0; i < 9; i++) await client().post('/ingresar', { email: 'beto@test.co', password: 'x' + i });
    r = await client().post('/ingresar', { email: 'beto@test.co', password: 'clave-segura-2' });
    ok('login: límite de intentos', r.status === 400 && /Demasiados/.test(r.text));

    await dueno.post('/ingresar', { email: 'ana@test.co', password: 'clave-segura-1' }); // la suspensión cerró su sesión
    r = await dueno.post('/panel/cuenta/clave', { current: 'mala', new: 'nueva-clave-99' });
    ok('cambio de clave exige la actual', r.status === 400);

    const rec = client();
    await rec.post('/recuperar', { email: 'ana@test.co' });
    const mailLog = await (async () => { for (let i = 0; i < 20 && !/restablecer\/[\w-]+/.test(logs); i++) await new Promise((x) => setTimeout(x, 50)); return logs; })();
    const tok = /restablecer\/([\w-]+)/.exec(mailLog)[1];
    ok('recuperar: token válido', /Nueva contraseña/.test((await rec.get('/restablecer/' + tok)).text) && !/Enlace vencido/.test((await rec.get('/restablecer/' + tok)).text));
    r = await rec.post('/restablecer/' + tok, { password: 'clave-nueva-777' });
    ok('recuperar: cambia la clave', r.status === 302 && r.loc === '/ingresar');
    ok('recuperar: token de un solo uso', /Enlace vencido/.test((await rec.get('/restablecer/' + tok)).text));
    ok('sesiones anteriores cerradas', (await dueno.get('/panel')).loc?.startsWith('/ingresar'));
    r = await client().post('/ingresar', { email: 'ana@test.co', password: 'clave-nueva-777' });
    ok('ingresa con la clave nueva', r.status === 302);
    r = await client().post('/recuperar', { email: 'noexiste@test.co' });
    ok('recuperar no revela si el correo existe', /enlace/.test(r.text));


    // ---------- Abuso de la prueba ----------
    ok('prueba: incluye reportes y lista de clientes como el plan Pro', !/Disponible en el plan Pro|plan Pro\./.test((await otro.get('/panel/clientes')).text) && (await otro.get('/panel/clientes.csv')).status === 200);
    const dana = client();
    await dana.post('/registro', { name: 'Dana', email: 'dana@test.co', password: 'clave-segura-4', terms: '1' });
    r = await dana.post('/panel/crear', { name: 'Copia Espiga', whatsapp: '573001234567', currency: 'COP', tz: 'America/Bogota' });
    ok('misma línea de WhatsApp: no recibe una segunda prueba', r.status === 302 && (await anon.get('/t/copia-espiga')).status === 404 && /en pausa/.test((await dana.get('/panel')).text));

    // La prueba es una sola vez: ni con alias de correo ni borrando la cuenta y volviendo a registrarse
    const alias = client();
    await alias.post('/registro', { name: 'Alias', email: 'Ana+otra@test.co', password: 'clave-segura-5', terms: '1' });
    await alias.post('/panel/crear', { name: 'Tienda Alias', whatsapp: '573007771111', currency: 'COP', tz: 'America/Bogota' });
    ok('alias de correo (ana+otra@) no recibe otra prueba', (await anon.get('/t/tienda-alias')).status === 404 && /en pausa/.test((await alias.get('/panel')).text));
    const eli = client();
    await eli.post('/registro', { name: 'Eli', email: 'eli@test.co', password: 'clave-segura-6', terms: '1' });
    await eli.post('/panel/crear', { name: 'Tienda Eli', whatsapp: '573007772222', currency: 'COP', tz: 'America/Bogota' });
    ok('una cuenta nueva sí recibe su prueba', (await anon.get('/t/tienda-eli')).status === 200);
    await eli.post('/panel/cuenta/eliminar', { password: 'clave-segura-6' });
    const eli2 = client();
    await eli2.post('/registro', { name: 'Eli', email: 'eli@test.co', password: 'clave-segura-6', terms: '1' });
    await eli2.post('/panel/crear', { name: 'Tienda Eli Dos', whatsapp: '573007773333', currency: 'COP', tz: 'America/Bogota' });
    ok('borrar la cuenta y volver a registrarse NO da otra prueba', (await anon.get('/t/tienda-eli-dos')).status === 404 && /en pausa/.test((await eli2.get('/panel')).text));
    const eli3 = client();
    await eli3.post('/registro', { name: 'Eli', email: 'otro-eli@test.co', password: 'clave-segura-7', terms: '1' });
    await eli3.post('/panel/crear', { name: 'Tienda Eli Tres', whatsapp: '573007772222', currency: 'COP', tz: 'America/Bogota' });
    ok('mismo WhatsApp tras borrar la cuenta tampoco da prueba', (await anon.get('/t/tienda-eli-tres')).status === 404);

    // ---------- Espacio: reducción de imágenes, cuota, huérfanas y limpieza ----------
    const sharp = require('sharp');
    const UPD = path.join(DATA, 'uploads'), ls = () => new Set(fs.readdirSync(UPD));
    const carl = client();
    await carl.post('/registro', { name: 'Carl', email: 'carl@test.co', password: 'clave-segura-3', terms: '1' });
    await carl.post('/panel/crear', { name: 'Tienda Carl', whatsapp: '573004445555', currency: 'COP', tz: 'America/Bogota' });
    const bigImg = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#c2410c' } }).jpeg({ quality: 95 }).toBuffer();
    await adm.post('/admin/planes', plansBody({ trial_limit: '5', trial_quota: '0.01' }));
    const before0 = ls();
    r = await carl.upload('/panel/productos/guardar', { name: 'Foto grande', price: '1000', active: '1' }, { field: 'image', data: bigImg, type: 'image/jpeg', name: 'big.jpg' });
    ok('cuota: se rechaza la subida que supera el espacio del plan', r.status === 400 && /límite de espacio/.test(r.text) && [...ls()].every((f) => before0.has(f)), r.status);
    await adm.post('/admin/planes', plansBody({ trial_limit: '5' }));
    r = await carl.upload('/panel/productos/guardar', { name: 'Foto grande', price: '1000', active: '1' }, { field: 'image', data: bigImg, type: 'image/jpeg', name: 'big.jpg' });
    const added = [...ls()].filter((f) => !before0.has(f));
    ok('imagen subida: se guarda una sola, en WebP', r.status === 302 && added.length === 1 && /\.webp$/.test(added[0]), added);
    const meta = await sharp(path.join(UPD, added[0])).metadata();
    ok('imagen grande (4000 px) se reduce a un máximo de 1000 px y pesa poco', meta.format === 'webp' && Math.max(meta.width, meta.height) <= 1000 && fs.statSync(path.join(UPD, added[0])).size < 60 * 1024, [meta.width, meta.height, fs.statSync(path.join(UPD, added[0])).size]);
    ok('panel: muestra el espacio usado del plan', /Espacio de imágenes: 0\.\d MB de 100 MB/.test((await carl.get('/panel/plan')).text));
    // Archivos huérfanos: se limpian solos, y lo que está en uso se conserva
    const orphan = path.join(UPD, 'a'.repeat(28) + '.webp'), tmp = path.join(UPD, 'tmp-zzzz');
    fs.writeFileSync(orphan, 'x'); fs.writeFileSync(tmp, 'x');
    await sleep(2600);
    ok('huérfanas: se eliminan las sin uso y se conserva la foto del producto', !fs.existsSync(orphan) && !fs.existsSync(tmp) && fs.existsSync(path.join(UPD, added[0])));
    const ad = (await adm.get('/admin')).text;
    ok('admin: ve el espacio por negocio y el disco', /Espacio/.test(ad) && /Tienda Carl/.test(ad) && /GB/.test(ad));
    // Limpieza de cuentas vencidas (manual): borra la cuenta y sus imágenes
    const carlId = /\/admin\/usuarios\/(\d+)"[^>]*>\s*<input type="hidden" name="_csrf"[^>]*><input type="hidden" name="accion" value="plan"/.exec((await adm.get('/admin/usuarios?q=carl%40test.co')).text)[1];
    await adm.post(`/admin/usuarios/${carlId}`, { accion: 'plan', plan: 'free', months: '1' });
    { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(path.join(DATA, 'vitrina.db')); d.exec("PRAGMA busy_timeout=5000"); d.prepare("UPDATE users SET created_at=? WHERE email='carl@test.co'").run(Date.now() - 90 * 86400000); d.close(); }
    r = await adm.post('/admin/purgar', { days: '30' });
    ok('purgar: elimina la cuenta vencida y sus imágenes', r.status === 302 && !fs.existsSync(path.join(UPD, added[0])) && (await client().post('/ingresar', { email: 'carl@test.co', password: 'clave-segura-3' })).status === 400);
    ok('purgar: no toca cuentas con prueba o plan vigente', (await anon.get('/t/panaderia-la-espiga-2')).status === 200);


    // ================= Administrador: planes, marca, páginas y cobro de los planes =================
    const addMonths = (ts, n) => { const d = new Date(ts), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.getTime(); };
    const unesc = (t) => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const fieldsOf = (html) => {
      const o = {};
      for (const m of html.matchAll(/<input[^>]*>/g)) {
        const t = m[0], name = (/name="([^"]+)"/.exec(t) || [])[1], type = (/type="(\w+)"/.exec(t) || [, 'text'])[1];
        if (!name || type === 'file') continue;
        const val = unesc((/value="([^"]*)"/.exec(t) || [, ''])[1]);
        if (type === 'checkbox' || type === 'radio') { if (/\schecked/.test(t)) o[name] = val || '1'; } else o[name] = val;
      }
      for (const m of html.matchAll(/<textarea[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) o[m[1]] = unesc(m[2]).replace(/^\n/, '');
      for (const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) { const sel = /<option value="([^"]*)" selected/.exec(m[2]) || /<option value="([^"]*)"/.exec(m[2]); o[m[1]] = sel ? sel[1] : ''; }
      delete o._csrf; return o;
    };
    const editPage = async (slug, over = {}, files = []) => { const f = fieldsOf((await adm.get('/admin/paginas/' + slug)).text); return adm.upload('/admin/paginas/' + slug, { act: 'save', ...f, ...over }, files); };
    const dbq = (sql, ...a) => { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(path.join(DATA, 'vitrina.db')); d.exec('PRAGMA busy_timeout=5000'); try { return d.prepare(sql).all(...a); } finally { d.close(); } };
    const own1 = client(); await own1.post('/ingresar', { email: 'ana@test.co', password: 'clave-nueva-777' });

    // --- Planes editables ---
    await adm.post('/admin/planes', plansBody({ basic_name: 'Emprendedor', basic_price: '5', basic_extra: 'Soporte por WhatsApp', pro_active: '', trial_limit: '5' }));
    let hm = (await anon.get('/')).text;
    ok('planes: lo que cambias en el admin aparece en el inicio', /Emprendedor/.test(hm) && /\$5/.test(hm) && /Soporte por WhatsApp/.test(hm) && /Hasta 5 productos/.test(hm));
    ok('planes: un plan desactivado desaparece', !/<h3>Pro<\/h3>/.test(hm) && !/Prioridad en soporte/.test(hm) && !/<h3>Pro<\/h3>/.test((await anon.get('/planes')).text));
    ok('planes: el panel del negocio también usa los planes del admin', /Emprendedor/.test((await own1.get('/panel/plan')).text));
    await adm.post('/admin/planes', plansBody({ trial_days: '0', trial_limit: '5' }));
    const zed = client(); await zed.post('/registro', { name: 'Zed', email: 'zed@test.co', password: 'clave-segura-8', terms: '1' }); await zed.post('/panel/crear', { name: 'Tienda Zed', whatsapp: '573008880000', currency: 'COP', tz: 'America/Bogota' });
    ok('planes: con 0 días de prueba las cuentas nuevas quedan en pausa', (await anon.get('/t/tienda-zed')).status === 404);
    await adm.post('/admin/planes', plansBody({ trial_limit: '5' }));
    ok('planes: no acepta valores inválidos', (await adm.post('/admin/planes', plansBody({ basic_price: 'abc' }))).status === 400);

    // --- Marca: dos logos, favicon, color, menú y pie ---
    const logoA = await sharp({ create: { width: 300, height: 80, channels: 4, background: { r: 20, g: 90, b: 200, alpha: 1 } } }).png().toBuffer();
    const logoB = await sharp({ create: { width: 300, height: 80, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } } }).png().toBuffer();
    const ico = Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 40, 0, 0, 0, 22, 0, 0, 0]), Buffer.alloc(40)]);
    const upB = ls();
    r = await adm.upload('/admin/marca', { site_name: 'MiMarca', site_tagline: 'Mi frase', brand_color: '#1d4ed8', nav: 'Nosotros | /p/nosotros\nPrecios | /#precios', nav_login_label: 'Entrar', nav_cta_label: 'Empezar ya', nav_cta_url: '/registro', footer_text: 'Pie propio', footer_links: 'Ayuda | Contacto | mailto:hola@x.co\nLegal | Términos | /terminos' },
      [{ field: 'logo_light', data: logoA, type: 'image/png', name: 'a.png' }, { field: 'logo_dark', data: logoB, type: 'image/png', name: 'b.png' }, { field: 'favicon', data: ico, type: 'image/x-icon', name: 'f.ico' }]);
    const brand = Object.fromEntries(dbq("SELECT key, value FROM settings WHERE key IN ('logo_light','logo_dark','favicon','brand_color')").map((x) => [x.key, x.value]));
    ok('marca: guarda dos logos y el favicon .ico', r.status === 302 && /\.webp$/.test(brand.logo_light) && /\.webp$/.test(brand.logo_dark) && /\.ico$/.test(brand.favicon) && brand.logo_light !== brand.logo_dark, JSON.stringify(brand));
    hm = (await anon.get('/')).text;
    ok('marca: el encabezado usa el logo para fondo claro y el pie también', new RegExp(`class="logo"[^>]*><img src="/m/${brand.logo_light}"`).test(hm) && !hm.includes(brand.logo_dark));
    ok('marca: el ingreso (fondo oscuro) usa el logo oscuro', (await anon.get('/registro')).text.includes(`/m/${brand.logo_dark}`));
    ok('marca: color, menú, botón y pie personalizados', /--brand:#1d4ed8/.test(hm) && /Nosotros/.test(hm) && /Entrar/.test(hm) && /Empezar ya/.test(hm) && /Pie propio/.test(hm) && /mailto:hola@x\.co/.test(hm) && /MiMarca — Mi frase/.test(hm));
    ok('marca: el ícono de la pestaña está enlazado y se sirve en /favicon.ico', hm.includes(`<link rel="icon" href="/m/${brand.favicon}">`));
    const fav = await fetch(BASE + '/favicon.ico'); const favBytes = Buffer.from(await fav.arrayBuffer());
    ok('marca: /favicon.ico devuelve el .ico subido', fav.status === 200 && favBytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])));
    await adm.upload('/admin/marca', { site_name: 'MiMarca', brand_color: 'rojo', nav: 'Nosotros | /p/nosotros', nav_cta_url: '/registro' });
    ok('marca: un color inválido no se guarda', dbq("SELECT value FROM settings WHERE key='brand_color'")[0].value === '#1d4ed8');

    // --- Constructor de páginas ---
    r = await adm.post('/admin/paginas', { title: 'Nosotros', slug: 'Nosotros!' });
    ok('páginas: crear una página nueva', r.status === 302 && r.loc === '/admin/paginas/nosotros' && /Escribe aquí el contenido/.test((await anon.get('/p/nosotros')).text));
    ok('páginas: no deja crear direcciones reservadas ni repetidas', (await adm.post('/admin/paginas', { title: 'x', slug: 'admin' })).status === 400 && (await adm.post('/admin/paginas', { title: 'x', slug: 'nosotros' })).status === 400);
    ok('páginas: el editor del inicio lista sus 9 secciones', (await adm.get('/admin/paginas/home')).text.split('<details class="card"').length - 1 === 9);
    await editPage('nosotros', { b0_title: 'Quiénes somos', b0_body: 'Somos **{sitio}**.\n\n## Misión\nAyudar.\n\n- uno\n- dos' });
    let np = (await anon.get('/p/nosotros')).text;
    ok('páginas: texto con formato y variables', /Quiénes somos/.test(np) && /<b>MiMarca<\/b>/.test(np) && /<h2>Misión<\/h2>/.test(np) && /<li>uno<\/li>/.test(np));
    await editPage('nosotros', { act: 'add', newtype: 'hero' }); await editPage('nosotros', { act: 'add', newtype: 'split' }); await editPage('nosotros', { act: 'add', newtype: 'html' });
    ok('páginas: agregar secciones', (await adm.get('/admin/paginas/nosotros')).text.split('<details class="card"').length - 1 === 4);
    const imgPng = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#c2410c' } }).png().toBuffer();
    const upP = ls();
    await editPage('nosotros', { b1_title: 'Hola {sitio}', b1_hl: 'destacado', b1_buttons: 'Comprar | /registro | primary\nMala | javascript:alert(1) | dark', b1_visual: '', b2_title: 'Con imagen', b2_visual: 'upload', b2_bullets: 'Uno\nDos', b2_buttons: 'Ir | https://example.com | secondary',
      b3_html: '<p id="x">hola</p><script>alert(1)</script><a href="javascript:evil()" onclick="x()">k</a><img src="x" onerror="alert(2)"><svg onload="alert(3)"></svg><iframe src="https://evil.example"></iframe><form action="/x"><input></form><a href="https://ok.example">bien</a><b style="color:red">negrita</b>' }, [{ field: 'b2_image_file', data: imgPng, type: 'image/png', name: 'i.png' }]);
    np = (await anon.get('/p/nosotros')).text;
    const newImgs = [...ls()].filter((f) => !upP.has(f));
    ok('páginas: botones con estilo y enlaces peligrosos neutralizados', /<a class="btn btn-p btn-lg" href="\/registro">Comprar<\/a>/.test(np) && /<a class="btn btn-d btn-lg" href="#">Mala<\/a>/.test(np) && /Hola MiMarca/.test(np) && /<a class="btn btn-lg" href="https:\/\/example\.com">Ir<\/a>/.test(np));
    ok('páginas: imagen propia subida, reducida y mostrada', newImgs.length === 1 && /lp-upimg" src="\/m\//.test(np));
    ok('páginas: HTML propio con lista blanca (sin scripts, manejadores, iframes, formularios ni estilos)', /<p id="x">hola<\/p>/.test(np) && /<a href="https:\/\/ok\.example" rel="noopener nofollow">bien<\/a>/.test(np) && /<b>negrita<\/b>/.test(np) && !/<script|onclick|onerror|onload|javascript:|<iframe|<form|<svg|style=/.test((/<p id="x">hola<\/p>([\s\S]*?)<\/div><\/section>/.exec(np) || [0, 'NO'])[1]));
    await editPage('nosotros', { act: 'up:3' });
    np = (await anon.get('/p/nosotros')).text;
    ok('páginas: subir una sección cambia el orden', np.indexOf('hola</p>') < np.indexOf('Con imagen'));
    await editPage('nosotros', { act: 'dup:1' });
    ok('páginas: duplicar y eliminar secciones', (await adm.get('/admin/paginas/nosotros')).text.split('<details class="card"').length - 1 === 5);
    await editPage('nosotros', { act: 'del:1' });
    ok('páginas: eliminar una sección', (await adm.get('/admin/paginas/nosotros')).text.split('<details class="card"').length - 1 === 4);
    await editPage('nosotros', { published: '' });
    ok('páginas: ocultar una página la quita del público', (await anon.get('/p/nosotros')).status === 404 && !/\/p\/nosotros</.test((await anon.get('/sitemap.xml')).text));
    await editPage('nosotros', { published: '1' });
    ok('páginas: se puede volver a publicar', (await anon.get('/p/nosotros')).status === 200 && /\/p\/nosotros</.test((await anon.get('/sitemap.xml')).text));
    await editPage('home', { b0_title: 'Mi título propio ', b0_hl: 'sin límites' });
    ok('páginas: el inicio es editable', /Mi título propio <span class="lp-hl">sin límites/.test((await anon.get('/')).text));
    await adm.post('/admin/paginas/home/restaurar', {});
    ok('páginas: restaurar el inicio al contenido original', /Tu catálogo profesional, <span class="lp-hl">en un solo link/.test((await anon.get('/')).text));
    ok('páginas: las páginas base no se eliminan', (await adm.post('/admin/paginas/home/borrar', {})).status === 400);
    await adm.post('/admin/paginas/nosotros/borrar', {});
    ok('páginas: eliminar borra la página y sus imágenes', (await anon.get('/p/nosotros')).status === 404 && [...ls()].every((f) => upP.has(f)));
    ok('páginas: las páginas de términos y privacidad salen del constructor', /Términos de uso/.test((await anon.get('/terminos')).text) && /huella cifrada/.test((await anon.get('/privacidad')).text));
    ok('páginas: solo el administrador edita', (await own1.get('/admin/paginas')).status === 403 && (await anon.get('/admin/marca')).loc?.startsWith('/ingresar'));
    await adm.upload('/admin/marca', { site_name: 'Vitrina', brand_color: '#0f766e', nav: 'Precios | /#precios', nav_cta_url: '/registro', remove_logo_light: '1', remove_logo_dark: '1', remove_favicon: '1' });
    ok('marca: quitar logos y favicon borra los archivos', [...ls()].every((f) => upB.has(f)) && (await fetch(BASE + '/favicon.ico')).status === 204);

    // --- Textos del sistema editables ---
    r = await adm.post('/admin/textos', { tx_reg_title: 'Abre tu tienda ya', tx_reg_sub: 'Prueba de {dias} días en {sitio}', tx_shop_add: 'Añadir', tx_shop_cart: 'Mi carrito', tx_err404_msg: 'Aquí no hay nada.', tx_banner_trial: 'Te regalamos {restantes}.',
      tx_reset_mail_subject: 'Clave nueva en {sitio}', tx_order_msg: '🧾 Pedido {codigo}\n{items}\nTotal {total}\n{cliente}\n{pago_linea}\n{nota_linea}' });
    const regp = (await anon.get('/registro')).text;
    ok('textos: el registro muestra lo que escribes (con variables)', r.status === 302 && /Abre tu tienda ya/.test(regp) && /Prueba de 14 días en MiMarca|Prueba de 14 días en Vitrina/.test(regp));
    const shp2 = (await anon.get('/t/' + slug)).text;
    ok('textos: el catálogo público usa los botones que defines', /Añadir/.test(shp2) && /Mi carrito/.test(shp2) && !/>\s*Agregar\s*</.test(shp2.replace(/<svg[\s\S]*?<\/svg>/g, '')));
    ok('textos: el error 404 usa tu mensaje', /Aquí no hay nada\./.test((await anon.get('/no-existe-xyz')).text));
    ok('textos: el aviso de prueba del panel usa tu texto', /Te regalamos 14 días\./.test((await otro.get('/panel')).text));
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 2 }], name: 'Tere', mode: 'pickup', pay: 0 });
    const wtxt = decodeURIComponent(r.json().url);
    ok('textos: el mensaje del pedido sigue tu plantilla y quita las líneas vacías', /🧾 Pedido #\d+\n• 2 × Pan integral/.test(wtxt) && /Total \$\s12\.000\nTere\n💳 Pago: Nequi$/.test(wtxt), wtxt);
    await adm.post('/admin/textos', { tx_reg_title: '', tx_shop_add: '', tx_shop_cart: '', tx_err404_msg: '', tx_banner_trial: '', tx_reset_mail_subject: '', tx_order_msg: '' });
    const tbs = (await adm.get('/admin/textos')).text;
    ok('textos: dejar vacío vuelve al texto original', /Crea tu catálogo/.test((await anon.get('/registro')).text) && /Agregar/.test((await anon.get('/t/' + slug)).text));
    ok('textos: las pestañas de "Sitio web" llevan a Páginas, Textos y Logos', ['/admin/paginas', '/admin/textos', '/admin/marca'].every((u) => (new RegExp(`class="tabs"[\\s\\S]*href="${u.replace(/\//g, '\\/')}"`)).test(tbs)));
    ok('tablero: explica qué se puede hacer', /¿Qué quieres hacer\?/.test((await adm.get('/admin')).text));

    // --- Cobro de los planes con tus claves (Mercado Pago y PayPal) ---
    await adm.post(`/admin/usuarios/${aid}`, { accion: 'plan', plan: 'basic', months: '1' });
    ok('cobro de planes: sin claves no aparecen botones de pago', !/Pagar con/.test((await own1.get('/panel/plan')).text));
    ok('cobro de planes: sin medio activo se rechaza', (await own1.post('/panel/plan/pagar', { plan: 'pro', months: '1', provider: 'mp' })).status === 400);
    await adm.post('/admin/pagos', { accion: 'save', mp_token: PLATTOKEN, mp_on: '1', pp_id: 'PPID', pp_secret: 'PPSECRET', pp_on: '1', pp_mode: 'sandbox', mp_enabled: '1' });
    const pgp = (await adm.get('/admin/pagos')).text;
    ok('cobro de planes: las claves se guardan enmascaradas', !pgp.includes(PLATTOKEN) && !pgp.includes('PPSECRET') && /••••••••4321/.test(pgp) && !(await own1.get('/panel/plan')).text.includes(PLATTOKEN), [pgp.includes(PLATTOKEN), pgp.includes('PPSECRET'), (pgp.match(/guardado[^<]*/g) || []).join('|')].join(' '));
    await adm.post('/admin/pagos', { accion: 'test_mp' }); ok('cobro de planes: prueba de conexión de Mercado Pago', /Mercado Pago conectado: TESTUSER123/.test((await adm.get('/admin/pagos')).text));
    await adm.post('/admin/pagos', { accion: 'test_pp' }); ok('cobro de planes: prueba de conexión de PayPal', /PayPal conectado \(pruebas\)/.test((await adm.get('/admin/pagos')).text));
    const plan1 = (await own1.get('/panel/plan')).text;
    ok('cobro de planes: el negocio ve ambos botones con el precio por periodo y descuento', /Pagar con Mercado Pago/.test(plan1) && /Pagar con PayPal/.test(plan1) && /12 meses — \$7\.2/.test(plan1.replace('Emprendedor', 'x')) || /12 meses/.test(plan1));
    await adm.post('/admin/planes', plansBody({ trial_limit: '5' }));
    const untilOf = () => dbq("SELECT plan, plan_until FROM users WHERE email='ana@test.co'")[0];
    const mpPay = (id, o) => { mpState.payments[id] = { id: +id, status: 'approved', transaction_amount: 22.8, currency_id: 'USD', external_reference: '', payment_type_id: 'credit_card', ...o }; };

    r = await own1.post('/panel/plan/pagar', { plan: 'pro', months: '3', provider: 'mp' });
    const pref1 = mpState.prefs[mpState.prefs.length - 1], ord1 = dbq('SELECT * FROM plan_orders ORDER BY id DESC LIMIT 1')[0];
    ok('pagar plan: lleva al cliente a Mercado Pago con el monto correcto (con descuento por 3 meses)', r.status === 303 && r.loc === 'https://mp.test/pay/' + mpState.prefs.length && pref1.items[0].unit_price === 22.8 && pref1.items[0].currency_id === 'USD' && /^vtp-\d+-[a-f0-9]{16}$/.test(pref1.external_reference) && ord1.status === 'pending', JSON.stringify(pref1));
    ok('pagar plan: usa TU clave de Mercado Pago, no la de ningún negocio', mpState.auth.includes('Bearer ' + PLATTOKEN));
    mpPay('910001', { external_reference: pref1.external_reference, transaction_amount: 1 }); await own1.get('/panel/plan/gracias?payment_id=910001');
    mpPay('910002', { external_reference: `vtp-${ord1.id}-0000000000000000` }); await own1.get('/panel/plan/gracias?payment_id=910002');
    ok('seguridad: monto distinto o referencia falsa NO activan el plan', untilOf().plan === 'basic' && dbq('SELECT status FROM plan_orders WHERE id=?', ord1.id)[0].status === 'pending');
    mpPay('910003', { external_reference: pref1.external_reference }); await own1.get('/panel/plan/gracias?payment_id=910003');
    const u1 = untilOf();
    ok('pago aprobado: el plan Pro se activa por 3 meses', u1.plan === 'pro' && Math.abs(u1.plan_until - addMonths(Date.now(), 3)) < 120000 && /Pro/.test((await own1.get('/panel/plan')).text), JSON.stringify(u1));
    await own1.get('/panel/plan/gracias?payment_id=910003');
    ok('repetir la confirmación no extiende el plan dos veces', untilOf().plan_until === u1.plan_until);
    r = await own1.post('/panel/plan/pagar', { plan: 'pro', months: '1', provider: 'mp' });
    const pref2 = mpState.prefs[mpState.prefs.length - 1]; mpPay('910004', { external_reference: pref2.external_reference, transaction_amount: 8 });
    await anon.req('POST', '/webhooks/mp-plan?data.id=910004&type=payment'); await sleep(400);
    ok('aviso automático (webhook): extiende el mismo plan sumando 1 mes de calendario', untilOf().plan_until === addMonths(u1.plan_until, 1));
    ok('webhook con pago inexistente responde 200 sin romper', (await anon.req('POST', '/webhooks/mp-plan?data.id=999999')).status === 200);

    await own1.post('/panel/plan/pagar', { plan: 'pro', months: '1', provider: 'mp' });
    const pref3 = mpState.prefs[mpState.prefs.length - 1], uR = untilOf().plan_until; mpPay('910005', { external_reference: pref3.external_reference, transaction_amount: 8 }); await sleep(1500);
    ok('conciliación: el plan se activa solo, sin webhook ni regreso del cliente (Mercado Pago)', untilOf().plan_until === addMonths(uR, 1));
    const u2 = untilOf();
    r = await own1.post('/panel/plan/pagar', { plan: 'pro', months: '1', provider: 'paypal' });
    const ppOrd = ppState.orders['PPORD1'];
    ok('PayPal: crea la orden con monto, moneda y referencia y lleva al cliente a aprobar', r.status === 303 && r.loc === 'https://pp.test/approve/PPORD1' && ppOrd.purchase_units[0].amount.value === '8.00' && ppOrd.purchase_units[0].amount.currency_code === 'USD' && /^vtp-\d+-[a-f0-9]{16}$/.test(ppOrd.purchase_units[0].custom_id) && ppState.basic[0] === 'Basic ' + Buffer.from('PPID:PPSECRET').toString('base64'), r.status + ' ' + r.loc + ' ' + r.text.slice(0, 200) + ' ' + JSON.stringify(ppOrd));
    await own1.get('/panel/plan/paypal?token=PPORD1&PayerID=X');
    ok('PayPal: al volver se captura el pago y el plan se extiende 1 mes de calendario', untilOf().plan_until === addMonths(u2.plan_until, 1) && dbq("SELECT status FROM plan_orders WHERE provider='paypal' ORDER BY id DESC LIMIT 1")[0].status === 'paid');
    await own1.get('/panel/plan/paypal?token=PPORD1');
    ok('PayPal: volver a abrir el enlace no suma otra vez', untilOf().plan_until === addMonths(u2.plan_until, 1));
    const u3 = untilOf(); ppState.tamper = true;
    await own1.post('/panel/plan/pagar', { plan: 'pro', months: '1', provider: 'paypal' }); await own1.get('/panel/plan/paypal?token=PPORD2');
    ppState.tamper = false;
    ok('seguridad PayPal: si el monto capturado no coincide, el plan NO se activa', untilOf().plan_until === u3.plan_until && dbq("SELECT status FROM plan_orders WHERE provider_ref='PPORD2'")[0].status === 'failed');
    await own1.get('/panel/plan/paypal?token=NOEXISTE');
    ok('PayPal: una orden desconocida no activa nada', untilOf().plan_until === u3.plan_until);
    ok('cobro de planes: periodo inválido, plan de prueba y proveedor inexistente se rechazan', (await own1.post('/panel/plan/pagar', { plan: 'pro', months: '7', provider: 'mp' })).status === 400 && (await own1.post('/panel/plan/pagar', { plan: 'trial', months: '1', provider: 'mp' })).status === 400);
    const u4 = untilOf().plan_until; await own1.post('/panel/plan/pagar', { plan: 'pro', months: '1', provider: 'paypal' }); ppState.approved.add('PPORD' + ppState.n); await sleep(1500);
    ok('conciliación PayPal: orden aprobada → se captura y activa sola', untilOf().plan_until === addMonths(u4, 1));
    await adm.post('/admin/planes', plansBody({ trial_limit: '5', pro_active: '' }));
    ok('cobro de planes: un plan desactivado no se puede comprar', (await own1.post('/panel/plan/pagar', { plan: 'pro', months: '1', provider: 'mp' })).status === 400);
    await adm.post('/admin/planes', plansBody({ trial_limit: '5' }));
    const ap = (await adm.get('/admin/pagos')).text;
    ok('admin: ve los pagos de planes y lo cobrado', /Pagado/.test(ap) && /PayPal/.test(ap) && /Mercado Pago/.test(ap) && /ana@test\.co/.test(ap) && /Fallido/.test(ap));
    await adm.post('/admin/pagos', { accion: 'save', pp_mode: 'sandbox', mp_enabled: '1' });
    ok('cobro de planes: apagar los medios quita los botones', !/Pagar con/.test((await own1.get('/panel/plan')).text));
    await adm.post('/admin/pagos', { accion: 'save', pp_mode: 'sandbox' });
    ok('cobro de negocios apagado: no aparece en ningún lado', (await own1.get('/panel/pagos')).status === 404 && !/Cobro en línea/.test((await own1.get('/panel')).text) && !/id="payNow"/.test((await anon.get('/t/' + slug)).text));

    // ---------- Rendimiento: caché, concurrencia y paginación ----------
    const dbx = (sql, ...a) => { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(path.join(DATA, 'vitrina.db')); d.exec('PRAGMA busy_timeout=5000'); try { return d.prepare(sql).run(...a); } finally { d.close(); } };
    const g1 = await fetch(BASE + '/t/' + slug, { headers: { 'accept-encoding': 'gzip' } }), g1b = await fetch(BASE + '/t/' + slug, { headers: { 'accept-encoding': 'gzip' } });
    ok('caché: el catálogo se sirve comprimido (gzip) y repetido da lo mismo', g1.status === 200 && g1.headers.get('content-encoding') === 'gzip' && (await g1.text()) === (await g1b.text()));
    const g3 = await fetch(BASE + '/t/' + slug, { headers: { 'accept-encoding': 'identity' } }); const g3t = await g3.text();
    ok('caché: quien no acepta gzip también recibe la página', g3.status === 200 && !g3.headers.get('content-encoding') && /<html/.test(g3t));
    r = await own1.upload('/panel/productos/guardar', { id: String(prodIds['Pan integral']), name: 'Pan integral NUEVO', price: '6000', active: '1' });
    ok('caché: al editar un producto el catálogo cambia al instante', r.status === 302 && /Pan integral NUEVO/.test((await anon.get('/t/' + slug)).text));
    await own1.post(`/panel/productos/${prodIds['Pan integral']}/accion`, { accion: 'toggle' });
    ok('caché: ocultar un producto lo quita al instante', !/Pan integral NUEVO/.test((await anon.get('/t/' + slug)).text));
    await own1.post(`/panel/productos/${prodIds['Pan integral']}/accion`, { accion: 'toggle' });
    r = await own1.upload('/panel/productos/guardar', { name: 'Último cupo', price: '20000', stock: '5', active: '1' });
    const lastId = +/data-id="(\d+)" data-name="Último cupo"/.exec((await anon.get('/t/' + slug)).text)[1];
    const res20 = await Promise.all(Array.from({ length: 20 }, () => cust.postJson(`/t/${slug}/pedido`, { items: [{ id: lastId, qty: 1 }], name: 'Carrera', mode: 'pickup' })));
    ok('concurrencia: 20 pedidos a la vez por 5 unidades → se venden exactamente 5, nunca de más', res20.filter((x) => x.status === 200).length === 5 && res20.filter((x) => x.status === 400).length === 15 && /data-id="\d+" data-name="Último cupo" data-price="2000000" data-stock="0"/.test((await anon.get('/t/' + slug)).text), JSON.stringify(res20.reduce((a, x) => (a[x.status] = (a[x.status] || 0) + 1, a), {})) + ' ' + ((await anon.get('/t/' + slug)).text.match(/data-name="Último cupo"[^>]*>/) || [''])[0] + ' ' + res20.find((x) => x.status !== 200)?.text);
    ok('seguridad: el pedido solo se acepta como JSON del mismo sitio', (await anon.req('POST', `/t/${slug}/pedido`, { form: { name: 'x' } })).status === 403 && (await anon.req('POST', `/t/${slug}/pedido`, { json: { items: [{ id: lastId, qty: 1 }], name: 'Falso' }, headers: { origin: 'https://sitio-malo.example' } })).status === 403);
    const shopId = dbq('SELECT id FROM shops WHERE slug=?', slug)[0].id;
    for (let i = 0; i < 100; i++) dbx("INSERT INTO products(shop_id,name,price_cents,created_at) VALUES (?,?,?,?)", shopId, 'Masivo ' + i, 1000, Date.now());
    const pp1 = (await own1.get('/panel/productos')).text, pp2 = (await own1.get('/panel/productos?page=3')).text;
    ok('panel: la lista de productos se pagina (40 por página)', /Página 1 de 3/.test(pp1) && (pp1.match(/class="prow"/g) || []).length <= 41 && /Página 3 de 3/.test(pp2) && pp1.length < 120000, pp1.length);
    dbx("DELETE FROM products WHERE shop_id=? AND name LIKE 'Masivo %'", shopId);
    await own1.post(`/panel/productos/${lastId}/accion`, { accion: 'delete' });

    // ---------- Administradores: quién puede entrar ----------
    ok('administradores: la pantalla dice cuántas personas pueden entrar', /1 persona puede entrar a este panel/.test((await adm.get('/admin/administradores')).text));
    ok('administradores: rechaza correo repetido y contraseña corta', (await adm.post('/admin/administradores', { accion: 'add', name: 'Otro', email: 'admin@test.co', password: 'otra-clave-123' })).status === 400 && (await adm.post('/admin/administradores', { accion: 'add', name: 'Otro', email: 'x@test.co', password: '123' })).status === 400);
    r = await adm.post('/admin/administradores', { accion: 'add', name: 'Segundo Admin', email: 'admin2@test.co', password: 'otra-clave-123' });
    ok('administradores: agregar uno nuevo', r.status === 302 && /2 personas pueden entrar/.test((await adm.get('/admin/administradores')).text));
    const adm2 = client(); r = await adm2.post('/ingresar', { email: 'admin2@test.co', password: 'otra-clave-123' });
    ok('administradores: el nuevo entra directo al panel y puede administrar', r.loc === '/admin' && (await adm2.get('/admin/planes')).status === 200 && (await adm2.get('/admin/paginas')).status === 200);
    ok('administradores: un dueño de negocio no puede entrar al administrador', (await own1.get('/admin/administradores')).status === 403 && (await own1.get('/admin')).status === 403);
    const a2 = dbq("SELECT id FROM users WHERE email='admin2@test.co'")[0].id, a1 = dbq("SELECT id FROM users WHERE email='admin@test.co'")[0].id;
    await adm.post('/admin/administradores', { accion: 'password', id: String(a2), password: 'clave-nueva-456' });
    ok('administradores: cambiar la contraseña cierra su sesión y vale la nueva', (await adm2.get('/admin')).loc?.startsWith('/ingresar') && (await client().post('/ingresar', { email: 'admin2@test.co', password: 'otra-clave-123' })).status === 400 && (await client().post('/ingresar', { email: 'admin2@test.co', password: 'clave-nueva-456' })).loc === '/admin');
    await adm.post('/admin/administradores', { accion: 'status', id: String(a2) });
    ok('administradores: bloquear el acceso', (await client().post('/ingresar', { email: 'admin2@test.co', password: 'clave-nueva-456' })).status === 400);
    await adm.post('/admin/administradores', { accion: 'status', id: String(a2) });
    ok('administradores: restablecer el acceso', (await client().post('/ingresar', { email: 'admin2@test.co', password: 'clave-nueva-456' })).loc === '/admin');
    ok('administradores: nadie puede bloquearse ni eliminarse a sí mismo', (await adm.post('/admin/administradores', { accion: 'remove', id: String(a1) })).status === 400 && (await adm.post('/admin/administradores', { accion: 'status', id: String(a1) })).status === 400);
    await adm.post('/admin/administradores', { accion: 'remove', id: String(a2) });
    ok('administradores: eliminar a uno le quita el acceso', (await client().post('/ingresar', { email: 'admin2@test.co', password: 'clave-nueva-456' })).status === 400 && /1 persona puede entrar/.test((await adm.get('/admin/administradores')).text));
    { const ta = (await adm.get('/admin')).text, tp = (await own1.get('/panel')).text; ok('admin y clientes están separados y se nota', /Administración · solo tú/.test(ta) && /Este panel es TUYO/.test(ta) && /Panel de <b>/.test(tp) && !/Administración · solo tú/.test(tp)); }
    { const tb = (await adm.get('/admin')).text; ok('menú del admin: seis opciones claras', ['Tablero', 'Sitio web', 'Planes y cobros', 'Negocios', 'Administradores', 'Ajustes'].every((t) => new RegExp(`${t}</a>`).test(tb))); }

    // ---------- Correo desde el admin y copia de seguridad ----------
    await adm.post('/admin/ajustes', { accion: 'test_mail' });
    ok('correo: sin servidor guardado, la prueba avisa qué falta', /Primero guarda el servidor de correo/.test((await adm.get('/admin/ajustes')).text));
    await adm.post('/admin/ajustes', { accion: 'save_mail', signups_open: '1', smtp_host: '127.0.0.1', smtp_port: String(fakeSmtp.address().port), smtp_from: 'Vitrina <no-reply@test.co>', smtp_pass: 'clave-smtp-secreta' });
    const ajp = (await adm.get('/admin/ajustes')).text;
    ok('correo: guarda la configuración y la contraseña nunca se muestra', /configurado \(127\.0\.0\.1\)/.test(ajp) && /\(guardada\)/.test(ajp) && !ajp.includes('clave-smtp-secreta'));
    const nMsg = smtpMsgs.length; await adm.post('/admin/ajustes', { accion: 'test_mail' });
    ok('correo: el correo de prueba llega al servidor SMTP', /Correo de prueba enviado/.test((await adm.get('/admin/ajustes')).text) && smtpMsgs.length === nMsg + 1 && /To: admin@test\.co/i.test(smtpMsgs[smtpMsgs.length - 1]), smtpMsgs.length + ' ' + nMsg);
    await client().post('/recuperar', { email: 'ana@test.co' }); await sleep(600);
    const rm = smtpMsgs[smtpMsgs.length - 1].replace(/=\r\n/g, '');
    ok('correo: la recuperación de contraseña ahora sale por SMTP (ya no por la consola)', smtpMsgs.length === nMsg + 2 && /To: ana@test\.co/i.test(rm) && /restablecer\/[\w-]+/.test(rm));
    await adm.post('/admin/ajustes', { accion: 'save_mail', signups_open: '1', smtp_host: '127.0.0.1', smtp_port: '1', smtp_from: 'x@test.co' }); await adm.post('/admin/ajustes', { accion: 'test_mail' });
    ok('correo: si el servidor no responde, avisa el motivo sin romper', /No se pudo conectar al servidor de correo/.test((await adm.get('/admin/ajustes')).text));
    await adm.post('/admin/ajustes', { accion: 'save_mail', signups_open: '1', smtp_host: '', smtp_port: '587', remove_smtp_pass: '1' });
    const bkRes = await fetch(BASE + '/admin/respaldo', { method: 'POST', headers: { cookie: Object.entries(adm.jar).map(([k, v]) => `${k}=${v}`).join('; '), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: adm.jar.vt_csrf }).toString() });
    const bkBuf = Buffer.from(await bkRes.arrayBuffer()), bkFile = path.join(os.tmpdir(), 'vt-bk-test.tar.gz'); fs.writeFileSync(bkFile, bkBuf);
    const bkList = require('child_process').execSync(`tar -tzf ${bkFile}`).toString(); fs.unlinkSync(bkFile);
    ok('respaldo: se descarga un .tar.gz con la base de datos y las imágenes', bkRes.status === 200 && /application\/gzip/.test(bkRes.headers.get('content-type')) && /attachment; filename="vitrina-respaldo-\d{4}-\d{2}-\d{2}\.tar\.gz"/.test(bkRes.headers.get('content-disposition')) && /^vitrina\.db$/m.test(bkList) && /^uploads\//m.test(bkList), bkList.slice(0, 200));
    ok('respaldo: solo lo puede descargar un administrador y no deja archivos sueltos', (await own1.post('/admin/respaldo', {})).status === 403 && !fs.readdirSync(DATA).some((f) => f.startsWith('respaldo-')));

    // ---------- Opciones por producto, fotos, zonas, estilo, medición, dominio y avisos ----------
    const nv = client();
    await nv.post('/ingresar', { email: 'ana@test.co', password: 'clave-nueva-777' });
    await adm.post(`/admin/usuarios/${aid}`, { accion: 'plan', plan: 'pro', months: '0' });
    r = await nv.upload('/panel/productos/guardar', { name: 'Hamburguesa', price: '20000', active: '1', options: 'Tamaño: Sencilla, Doble +8000\nAdicionales (varios, opcional): Queso +2000, Tocineta +3.000\n línea sin dos puntos' },
      [{ field: 'image', data: PNG, type: 'image/png', name: 'a.png' }, { field: 'gallery', data: PNG, type: 'image/png', name: 'b.png' }, { field: 'gallery', data: PNG, type: 'image/png', name: 'c.png' }]);
    ok('opciones: producto con opciones y 2 fotos extra guardado', r.status === 302, (r.text.match(/<p[^>]*>([^<]{5,})/g) || []).join(' ').slice(0, 400));
    const hb = (await nv.get('/panel/productos?q=Hamburguesa')).text.match(/productos\/(\d+)\/editar/);
    const hid = hb && +hb[1];
    const ed = (await nv.get(`/panel/productos/${hid}/editar`)).text;
    ok('opciones: se guardan limpias (se descarta la línea inválida y se normalizan precios)', ed.includes('Tamaño: Sencilla, Doble +8000') && ed.includes('Adicionales (varios, opcional): Queso +2000, Tocineta +3000') && !ed.includes('sin dos puntos'));
    ok('fotos: el editor muestra las 2 fotos extra para quitarlas', (ed.match(/name="remove_gal"/g) || []).length === 2);
    let catH = (await anon.get('/t/' + slug)).text;
    ok('catálogo: el producto lleva sus opciones y su galería de 3 fotos', /data-opts="[^"]*Tama/.test(catH) && /data-gal="\[[^\]]*,[^\]]*,[^\]]*\]"/.test(catH.replace(/&#34;/g, '"')));
    const ordR = (o) => cust.postJson(`/t/${slug}/pedido`, { name: 'Marta', ...o });
    r = await ordR({ items: [{ id: hid, qty: 1, opts: [[], []] }] });
    ok('opciones: si falta una obligatoria, el servidor la exige', r.status === 400 && /Elige tamaño/.test(r.text), r.text);
    r = await ordR({ items: [{ id: hid, qty: 1, opts: [[0, 1], []] }] });
    ok('opciones: en grupos de una sola opción no se aceptan dos', r.status === 400 && /solo una/.test(r.text));
    r = await ordR({ items: [{ id: hid, qty: 2, opts: [[1], [0, 1]] }, { id: hid, qty: 1, opts: [[0], []] }] });
    ok('opciones: el precio suma los adicionales en el servidor (2 × 33.000 + 20.000)', r.status === 200 && r.json().total_cents === 2 * 3300000 + 2000000, r.text.slice(0, 300));
    ok('opciones: el mensaje de WhatsApp dice qué eligió', decodeURIComponent(r.json().url).includes('Hamburguesa (Tamaño: Doble · Adicionales: Queso, Tocineta)'));
    ok('pedidos: el panel muestra las opciones del pedido', /Tamaño: Doble · Adicionales: Queso, Tocineta/.test((await nv.get('/panel/pedidos')).text));
    r = await ordR({ items: [{ id: hid, qty: 1, opts: [[5], []] }] });
    ok('opciones: una opción inexistente no se acepta', r.status === 400);

    // Zonas de domicilio, estilo cuadrícula, píxel y Analytics, dominio
    const biz2 = { ...biz, min_order: '', zones: 'El Poblado | 5000\nLaureles | 7.000\nmal formada', layout: 'grid', fb_pixel: '123456789012345', ga_id: 'g-abc123xyz', domain: 'https://www.LaEspiga.co/' };
    r = await nv.upload('/panel/negocio', biz2);
    ok('negocio: zonas, estilo, medición y dominio guardados', r.status === 302, r.text.slice(0, 300));
    catH = (await anon.get('/t/' + slug)).text;
    ok('catálogo: estilo cuadrícula', /class="list grid"/.test(catH));
    ok('catálogo: zonas para elegir', /id="cZone"/.test(catH) && /Laureles/.test(catH) && !/mal formada/.test(catH));
    ok('catálogo: píxel y Analytics configurados', /data-px="123456789012345"/.test(catH) && /data-ga="G-ABC123XYZ"/.test(catH));
    const csp = (await anon.get('/t/' + slug)).headers.get('content-security-policy');
    ok('seguridad: el catálogo permite solo los scripts de Meta y Google', /connect\.facebook\.net/.test(csp) && /googletagmanager/.test(csp) && !/facebook/.test((await anon.get('/')).headers.get('content-security-policy')));
    r = await ordR({ items: [{ id: hid, qty: 1, opts: [[0], []] }], mode: 'delivery', address: 'Calle 5 # 1-2' });
    ok('zonas: con zonas el cliente debe elegir la suya', r.status === 400 && /zona/.test(r.text));
    r = await ordR({ items: [{ id: hid, qty: 1, opts: [[0], []] }], mode: 'delivery', address: 'Calle 5 # 1-2', zone: '1' });
    ok('zonas: se cobra el valor de la zona elegida (20.000 + 7.000)', r.status === 200 && r.json().total_cents === 2700000 && decodeURIComponent(r.json().url).includes('Laureles — Calle 5'), r.text.slice(0, 200));
    r = await nv.upload('/panel/negocio', { ...biz2, ga_id: 'UA-123' });
    ok('medición: un ID de Analytics inválido se rechaza con un aviso claro', r.status === 400 && /G-/.test(r.text));
    const viaHost = (host) => new Promise((ok_, ko) => { http.get({ host: '127.0.0.1', port: PORT, path: '/', headers: { host } }, (rs) => { let b = ''; rs.on('data', (c) => { b += c; }); rs.on('end', () => ok_({ status: rs.statusCode, text: b })); }).on('error', ko); });
    let dres = await viaHost('laespiga.co');
    ok('dominio propio: laespiga.co muestra el catálogo del negocio', dres.status === 200 && /id="shop"/.test(dres.text) && /Panadería La Espiga/.test(dres.text), dres.status);
    ok('dominio propio: también con www', /id="shop"/.test((await viaHost('www.laespiga.co')).text));
    ok('dominio propio: un dominio desconocido muestra la página principal', !/id="shop"/.test((await viaHost('otro.com')).text));
    const dora = client(); await dora.post('/registro', { name: 'Dora', email: 'dora@test.co', password: 'clave-segura-9', terms: '1' });
    await dora.post('/panel/crear', { name: 'Tienda Dora', whatsapp: '573005550000', currency: 'COP', tz: 'America/Bogota', kind: 'productos' });
    const doraId = /\/admin\/usuarios\/(\d+)"[^>]*>\s*<input type="hidden" name="_csrf"[^>]*><input type="hidden" name="accion" value="plan"/.exec((await adm.get('/admin/usuarios?q=dora%40test.co')).text)[1];
    await adm.post(`/admin/usuarios/${doraId}`, { accion: 'plan', plan: 'pro', months: '1' });
    r = await dora.upload('/panel/negocio', { name: 'Tienda Dora', whatsapp: '573005550000', currency: 'COP', tz: 'America/Bogota', kind: 'productos', domain: 'laespiga.co' });
    ok('dominio propio: no se puede usar el dominio de otro negocio', r.status === 400 && /ya lo usa otro negocio/.test(r.text), r.status);
    await adm.post(`/admin/usuarios/${doraId}`, { accion: 'plan', plan: 'basic', months: '1' });
    r = await dora.upload('/panel/negocio', { name: 'Tienda Dora', whatsapp: '573005550000', currency: 'COP', tz: 'America/Bogota', kind: 'productos', domain: 'dora.co' });
    ok('dominio propio: solo en planes que lo incluyen (Básico no)', r.status === 302 && !/value="dora\.co"/.test((await dora.get('/panel/negocio')).text));

    // Estado del pedido: botón de WhatsApp con el mensaje listo
    const pd = (await nv.get('/panel/pedidos')).text;
    ok('pedidos: botón para confirmar el pedido al cliente por WhatsApp', /Confirmar pedido/.test(pd));
    // Quitar una foto extra
    const gal1 = ed.match(/name="remove_gal" value="([^"]+)"/)[1];
    r = await nv.upload('/panel/productos/guardar', { id: String(hid), name: 'Hamburguesa', price: '20000', active: '1', options: 'Tamaño: Sencilla', remove_gal: gal1 });
    await new Promise((res_) => setTimeout(res_, 300));
    ok('fotos: se puede quitar una foto extra y se borra del disco', r.status === 302 && !fs.existsSync(path.join(DATA, 'uploads', gal1)));

    // Avisos de vencimiento por correo
    const notices = require('../lib/notices');
    ok('avisos: etapas 3 días, 1 día y vencido', notices.stageOf(Date.now() + 2.5 * 86400000, Date.now()) === 'd3' && notices.stageOf(Date.now() + 3600000, Date.now()) === 'd1' && notices.stageOf(Date.now() - 3600000, Date.now()) === 'exp' && notices.stageOf(Date.now() + 9 * 86400000, Date.now()) === null);

    // ---------- Nombre de la web en un solo lugar ----------
    { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(path.join(DATA, 'vitrina.db')); d.exec('PRAGMA busy_timeout=5000');
      const cur = d.prepare("SELECT value FROM settings WHERE key='site_name'").get(); const nm = cur ? cur.value : 'Vitrina';
      d.prepare("UPDATE pages SET blocks=replace(blocks, 'Crea tu tienda', ?) WHERE slug='home'").run('Con ' + nm + ' crea tu tienda');
      d.prepare("INSERT INTO settings(key,value) VALUES ('footer_text', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(nm + ' es tu catálogo. VitrinaX no cambia.'); d.close(); }
    r = await adm.post('/admin/nombre', { site_name: 'TiendaYa' });
    ok('nombre: se cambia desde el tablero del admin', r.status === 302 && /TiendaYa/.test((await adm.get('/admin')).text));
    const homeTxt = (await client().get('/')).text;
    ok('nombre: cambia en el encabezado, la pestaña y los textos guardados', /<title>[^<]*TiendaYa/.test(homeTxt) && /Con TiendaYa crea tu tienda/.test(homeTxt) && /TiendaYa es tu catálogo\. VitrinaX no cambia\./.test(homeTxt), homeTxt.slice(0, 300));
    ok('nombre: el sello de los catálogos usa el nuevo nombre', /Hecho con <a href="\/">TiendaYa/.test((await anon.get('/t/' + slug)).text) || !/Hecho con/.test((await anon.get('/t/' + slug)).text));
    ok('nombre: un nombre vacío se rechaza', (await adm.post('/admin/nombre', { site_name: ' ' })).status === 400);
    ok('nombre: solo un administrador puede cambiarlo', (await nv.post('/admin/nombre', { site_name: 'Hack' })).status === 403);
    await adm.post('/admin/nombre', { site_name: 'Vitrina' });

    // ---------- Cloudflare R2: imágenes y copias fuera del servidor ----------
    const r2form = (o) => adm.post('/admin/r2', { r2_account: 'abc123', r2_bucket: 'vitrina-test', r2_key_id: 'R2KEYID123', r2_secret: 'r2-secret-de-prueba', r2_on: '1', ...o });
    r = await r2form({ accion: 'test', r2_secret: 'clave-mala' });
    ok('R2: con una clave secreta equivocada, avisa que Cloudflare rechazó las claves', /rechazó las claves/.test((await adm.get('/admin/ajustes')).text));
    r = await r2form({ accion: 'test', r2_bucket: 'otro-bucket' });
    ok('R2: con un bucket que no existe, lo dice claro', /No existe un bucket/.test((await adm.get('/admin/ajustes')).text));
    r = await r2form({ accion: 'test' });
    const ajR2 = (await adm.get('/admin/ajustes')).text;
    ok('R2: probar conexión sube, lee y borra un archivo de prueba', /Conexión con Cloudflare R2 correcta/.test(ajR2) && ![...R2.objects.keys()].some((k) => k.startsWith('prueba-')));
    ok('R2: la clave secreta no se muestra en la página', !ajR2.includes('r2-secret-de-prueba') && /\(guardada\)/.test(ajR2));
    const localBefore = fs.readdirSync(path.join(DATA, 'uploads')).filter((f) => /^[a-f0-9]{28}\.(webp|png|jpg)$/.test(f)).length;
    r = await nv.upload('/panel/productos/guardar', { name: 'Foto en la nube', price: '1000', active: '1' }, { field: 'image', data: PNG, type: 'image/png', name: 'n.png' });
    const cloudImg = /src="\/m\/([a-f0-9]{28}\.webp)" alt="Foto en la nube"/.exec((await anon.get('/t/' + slug)).text);
    ok('R2: una foto nueva queda en Cloudflare y no en el disco del servidor', r.status === 302 && cloudImg && R2.objects.has(cloudImg[1]) && !fs.existsSync(path.join(DATA, 'uploads', cloudImg[1])));
    const imgRes = await anon.get('/m/' + cloudImg[1]);
    ok('R2: la foto se sigue viendo en el mismo enlace /m/… (bucket privado)', imgRes.status === 200 && /image\/webp/.test(imgRes.headers.get('content-type')));
    r = await adm.post('/admin/r2', { accion: 'migrate' });
    for (let i = 0; i < 40 && /Pasando imágenes/.test((await adm.get('/admin/ajustes')).text); i++) await sleep(100);
    const leftLocal = fs.readdirSync(path.join(DATA, 'uploads')).filter((f) => /^[a-f0-9]{28}\.(webp|png|jpg)$/.test(f) && !/\.ico$/.test(f));
    ok('R2: “Pasar imágenes existentes” sube las fotos que estaban en el servidor', localBefore > 0 && leftLocal.length <= 1, `${localBefore} -> ${leftLocal.length}`);
    ok('R2: las fotos pasadas se siguen viendo en el catálogo', (await Promise.all([...(await anon.get('/t/' + slug)).text.matchAll(/src="\/m\/([a-f0-9]{28}\.\w+)"/g)].slice(0, 4).map((m) => anon.get('/m/' + m[1])))).every((x) => x.status === 200));
    const pid2 = /productos\/(\d+)\/editar[^>]*>[\s\S]{0,400}?Foto en la nube|Foto en la nube[\s\S]{0,600}?productos\/(\d+)\/editar/.exec((await nv.get('/panel/productos?q=Foto+en+la+nube')).text);
    const fid = pid2 && (pid2[1] || pid2[2]);
    await nv.post(`/panel/productos/${fid}/accion`, { accion: 'delete' }); await sleep(300);
    ok('R2: al borrar un producto, su foto se borra también de Cloudflare', !R2.objects.has(cloudImg[1]));
    await r2form({ accion: 'save', r2_on: '' });
    ok('R2: si se apaga, las fotos que ya están en Cloudflare se siguen viendo', (await Promise.all([...(await anon.get('/t/' + slug)).text.matchAll(/src="\/m\/([a-f0-9]{28}\.\w+)"/g)].slice(0, 3).map((m) => anon.get('/m/' + m[1])))).every((x) => x.status === 200));
    ok('R2: todas las peticiones a Cloudflare iban bien firmadas', R2.badSig === 1, R2.badSig); // solo la de la clave secreta equivocada a propósito
    await r2form({ accion: 'save' });

    // ---------- Eliminar cuenta ----------
    const ana = client();
    await ana.post('/ingresar', { email: 'ana@test.co', password: 'clave-nueva-777' });
    ok('eliminar: exige clave', (await ana.post('/panel/cuenta/eliminar', { password: 'mala' })).status === 400);
    r = await ana.post('/panel/cuenta/eliminar', { password: 'clave-nueva-777' });
    ok('cuenta eliminada', r.status === 302 && (await anon.get('/t/' + slug)).status === 404);
    ok('imágenes eliminadas del disco', fs.readdirSync(path.join(DATA, 'uploads')).length === 0);

    // ---------- Rendimiento básico ----------
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 100 }, () => anon.get('/t/panaderia-la-espiga-2')));
    ok('100 visitas simultáneas al catálogo < 3 s', Date.now() - t0 < 3000, Date.now() - t0);

    ok('sin errores en el log del servidor', !/Error|TypeError|ReferenceError/.test(logs.replace(/ExperimentalWarning/g, '')), logs.slice(-600));
    console.log(`\n✔ ${pass} comprobaciones correctas`);
  } finally { srv.kill(); fakeMp.close(); fakePp.close(); fakeSmtp.close(); fakeR2.close(); fs.rmSync(DATA, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });

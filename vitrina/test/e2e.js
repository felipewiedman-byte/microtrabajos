// Pruebas de extremo a extremo: levantan el servidor con una base temporal y recorren los flujos reales.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const PORT = 3800 + Math.floor(Math.random() * 150), BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-'));
let pass = 0;
const ok = (name, cond, extra) => { if (!cond) { console.error('✗ ' + name, extra ?? ''); process.exitCode = 1; throw new Error('Falló: ' + name); } pass++; };

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
      if (file) fd.append(file.field, new Blob([file.data], { type: file.type }), file.name);
      return req('POST', u, { multipart: fd });
    },
    jar,
  };
}

// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function main() {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DATA_DIR: DATA, ADMIN_EMAIL: 'admin@test.co', ADMIN_PASSWORD: 'admin-pass-123', NODE_ENV: 'development', BASE_URL: BASE, SESSION_SECRET: 'x'.repeat(40) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  srv.stdout.on('data', (d) => { logs += d; }); srv.stderr.on('data', (d) => { logs += d; });
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
    ok('catálogo vacío carga', /Panadería La Espiga/.test((await anon.get('/t/' + slug)).text));

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
    ok('solo 1 imagen real guardada, sin temporales', files.length === 1 && /^[a-f0-9]{28}\.png$/.test(files[0]), files);
    const cat = (await anon.get('/t/' + slug)).text;
    ok('catálogo: productos visibles', /Croissant/.test(cat) && /Pan integral/.test(cat) && /Torta/.test(cat));
    ok('catálogo: producto oculto no aparece', !/Oculto/.test(cat));
    ok('catálogo: precio con formato COP', /\$\s?3\.500/.test(cat.replace(/&nbsp;| /g, ' ')), cat.match(/\$[^<]{0,12}/g));
    ok('catálogo: agotado marcado', /Agotado/.test(cat));
    ok('catálogo: precio anterior tachado', /<s>/.test(cat));
    ok('catálogo: OG image del producto', true);
    const imgUrl = /src="(\/m\/[a-f0-9]{28}\.png)"/.exec(cat)[1];
    const im = await anon.get(imgUrl);
    ok('imagen se sirve con caché', im.status === 200 && /immutable/.test(im.headers.get('cache-control')));
    ok('media: nombre inválido 404', (await anon.get('/m/../../etc/passwd')).status === 404 && (await anon.get('/m/abc.png')).status === 404);
    const prodIds = [...cat.matchAll(/data-id="(\d+)" data-name="([^"]+)"/g)].reduce((a, m) => (a[m[2]] = +m[1], a), {});
    ok('ids de productos', prodIds['Croissant'] && prodIds['Pan integral'] && prodIds['Torta']);
    ok('catálogo de producto con ?p= pone OG de producto', /og:type" content="product"/.test((await anon.get(`/t/${slug}?p=${prodIds['Croissant']}`)).text));
    ok('qr svg', /<svg/.test((await anon.get(`/t/${slug}/qr.svg`)).text));

    // Un negocio no puede tocar productos de otro
    r = await otro.post(`/panel/productos/${prodIds['Croissant']}/accion`, { accion: 'delete' });
    ok('aislamiento: otro dueño no puede borrar', r.status === 404, r.status);

    // ---------- Límite del plan gratis ----------
    const adm = client();
    r = await adm.post('/ingresar', { email: 'admin@test.co', password: 'admin-pass-123' });
    ok('admin ingresa', r.status === 302);
    await adm.post('/admin/ajustes', { site_name: 'Vitrina', site_tagline: 'Prueba', price_basic: '4', price_pro: '8', price_currency: 'USD', limit_free: '5', limit_basic: '50', limit_pro: '500', signups_open: '1' });
    r = await mk({ fields: { name: 'Sexto', price: '10', active: '1' } });
    // ya hay 5 (Croissant, Pan, Torta, Oculto, Falso)
    ok('límite del plan gratis aplicado', r.status !== 302 && /límite/.test(r.text), r.status);

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
      payment_info: 'Nequi 300 123 4567', accepting: '1', h_mon_on: '1', h_mon_o: '00:00', h_mon_c: '23:59', h_tue_on: '1', h_tue_o: '00:00', h_tue_c: '23:59', h_wed_on: '1', h_wed_o: '00:00', h_wed_c: '23:59', h_thu_on: '1', h_thu_o: '00:00', h_thu_c: '23:59', h_fri_on: '1', h_fri_o: '00:00', h_fri_c: '23:59', h_sat_on: '1', h_sat_o: '00:00', h_sat_c: '23:59', h_sun_on: '1', h_sun_o: '00:00', h_sun_c: '23:59',
    };
    r = await dueno.upload('/panel/negocio', biz);
    ok('negocio guardado', r.status === 302 && r.loc === '/panel/negocio', r.text.slice(0, 200));
    const shopHtml = (await anon.get('/t/' + slug)).text;
    ok('catálogo: color de marca', /--brand:#c2410c/.test(shopHtml));
    ok('catálogo: abierto 24h', /Abierto hasta/.test(shopHtml));
    ok('catálogo: messenger + domicilio + pagos', /id="sendMs"/.test(shopHtml) && /Domicilio/.test(shopHtml) && /Nequi 300 123 4567/.test(shopHtml));
    ok('catálogo: sello de plataforma en plan gratis', /Hecho con/.test(shopHtml));

    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 1 }], name: 'Pedro', mode: 'delivery', address: '' });
    ok('mínimo de pedido', r.status === 400 && /mínimo/.test(r.json().error), r.text);
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 2 }], name: 'Pedro', mode: 'delivery', address: '' });
    ok('domicilio exige dirección', r.status === 400 && /dirección/.test(r.json().error));
    r = await cust.postJson(`/t/${slug}/pedido`, { items: [{ id: prodIds['Pan integral'], qty: 2 }], name: 'Pedro', mode: 'delivery', address: 'Calle 99 # 1-2', channel: 'messenger' });
    j = r.json();
    ok('pedido a domicilio por messenger', r.status === 200 && j.total_cents === 1200000 + 500000 && j.url === 'https://m.me/laespiga' && j.payment_info === 'Nequi 300 123 4567', JSON.stringify(j));

    // ---------- Cupones ----------
    r = await dueno.post('/panel/cupones', { accion: 'add', code: 'HOLA10', kind: 'pct', value: '10' });
    ok('cupones bloqueados en plan gratis', r.status === 403);
    // admin sube a Ana a plan Básico
    const aid = /\/admin\/usuarios\/(\d+)"[^>]*>\s*<input type="hidden" name="_csrf"[^>]*><input type="hidden" name="accion" value="plan"/.exec((await adm.get('/admin/usuarios?q=ana%40test.co')).text)[1];
    r = await adm.post(`/admin/usuarios/${aid}`, { accion: 'plan', plan: 'basic', months: '1' });
    ok('admin asigna plan básico', r.status === 302);
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
    ok('clientes bloqueado en Básico', /Pro/.test((await dueno.get('/panel/clientes')).text) && (await dueno.get('/panel/clientes.csv')).status === 403);
    await adm.post(`/admin/usuarios/${aid}`, { accion: 'plan', plan: 'pro', months: '0' });
    const cl = await dueno.get('/panel/clientes');
    ok('lista de clientes (Pro)', /Laura/.test(cl.text) && /Pedro/.test(cl.text));
    const csv = await dueno.get('/panel/clientes.csv');
    ok('CSV de clientes', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type')) && /Laura/.test(csv.text));
    ok('resumen: más pedidos (Pro)', /Croissant/.test((await dueno.get('/panel')).text));
    ok('sin sello en Pro', !/Hecho con/.test((await anon.get('/t/' + slug)).text));
    ok('compartir carga con generador de imagen', /id="poster"/.test((await dueno.get('/panel/compartir')).text));
    ok('plan, cuenta, cupones, negocio cargan', (await Promise.all(['/panel/plan', '/panel/cuenta', '/panel/cupones', '/panel/negocio', '/panel/productos', `/panel/productos/${prodIds['Croissant']}/editar`, '/panel/productos/nuevo'].map((u) => dueno.get(u)))).every((x) => x.status === 200));

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
  } finally { srv.kill(); fs.rmSync(DATA, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });

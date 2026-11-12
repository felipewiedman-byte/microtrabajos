// Base de datos SQLite (módulo nativo de Node.js 22+), esquema y datos iniciales.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'microtrabajo.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CO',
  currency TEXT NOT NULL DEFAULT 'USD',
  role TEXT NOT NULL DEFAULT 'user',
  headline TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  languages TEXT DEFAULT 'Español',
  company TEXT DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free',
  plan_until INTEGER,
  verified_id INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  payout_method TEXT DEFAULT '',
  payout_account TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  items TEXT NOT NULL,
  sort INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES users(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget_cents INTEGER NOT NULL,
  delivery_hours INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'single',
  quantity INTEGER NOT NULL DEFAULT 1,
  filled INTEGER NOT NULL DEFAULT 0,
  express INTEGER NOT NULL DEFAULT 0,
  featured_until INTEGER,
  attachment TEXT,
  attachment_name TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gigs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES users(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  delivery_hours INTEGER NOT NULL,
  revisions INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  worker_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  UNIQUE(task_id, worker_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id),
  gig_id INTEGER REFERENCES gigs(id),
  application_id INTEGER REFERENCES applications(id),
  client_id INTEGER NOT NULL REFERENCES users(id),
  worker_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  client_fee_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  delivery_hours INTEGER NOT NULL,
  max_revisions INTEGER NOT NULL DEFAULT 2,
  revisions_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  paid_at INTEGER, due_at INTEGER, delivered_at INTEGER, completed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  user_id INTEGER,
  type TEXT NOT NULL,
  text TEXT,
  file TEXT,
  file_name TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  reviewer_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  available_at INTEGER NOT NULL,
  order_id INTEGER,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL,
  account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  note TEXT,
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  provider TEXT,
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  meta TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  opened_by INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_users ON orders(client_id, worker_id);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
`);

try { db.exec('ALTER TABLE users ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0'); } catch { /* ya existe */ }
db.exec(`CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, a_id INTEGER NOT NULL, b_id INTEGER NOT NULL,
  gig_id INTEGER, task_id INTEGER, last_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS conv_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conv_id INTEGER NOT NULL REFERENCES conversations(id),
  user_id INTEGER NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);`);

db.exec(`CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id INTEGER NOT NULL,
  asker_id INTEGER NOT NULL REFERENCES users(id), text TEXT NOT NULL, answer TEXT, answered_at INTEGER,
  order_id INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_questions_target ON questions(target_type, target_id);`);
try { db.exec('ALTER TABLE categories ADD COLUMN price_hint TEXT'); } catch { /* ya existe */ }

db.exec(`CREATE TABLE IF NOT EXISTS texts (key TEXT PRIMARY KEY, value TEXT, default_value TEXT NOT NULL, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, eyebrow TEXT,
  button_text TEXT, button_link TEXT, bg_color TEXT NOT NULL DEFAULT '#ffffff', text_color TEXT NOT NULL DEFAULT '#0f172a',
  position TEXT NOT NULL DEFAULT 'before_cta', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id), user_id INTEGER NOT NULL,
  is_staff INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS logins (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL);`);

// Etapa 1: ayuda presencial, por horas y "resuelve mi problema"
for (const sql of [
  "ALTER TABLE tasks ADD COLUMN modality TEXT NOT NULL DEFAULT 'digital'",
  "ALTER TABLE tasks ADD COLUMN city TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN zone TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN address TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN scheduled_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE tasks ADD COLUMN price_type TEXT NOT NULL DEFAULT 'fixed'",
  "ALTER TABLE tasks ADD COLUMN hours INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN city TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN zone TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN availability TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN works_presencial INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN modality TEXT NOT NULL DEFAULT 'digital'",
  "ALTER TABLE orders ADD COLUMN done_code TEXT",
  "ALTER TABLE categories ADD COLUMN grp TEXT NOT NULL DEFAULT 'digital'",
  "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1",
]) { try { db.exec(sql); } catch { /* ya existe */ } }
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_city ON tasks(modality, city, status)');
// Enlaces de un solo uso (verificar correo, recuperar contraseña) y límites de intentos que sobreviven a reinicios.
db.exec(`CREATE TABLE IF NOT EXISTS auth_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, kind);
CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL);`);

const now = () => Date.now();
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- Configuración del negocio (editable desde el panel admin) ----------
const DEFAULT_SETTINGS = {
  commission_pct: '8',         // comisión única a quien ayuda (se queda con el 92 %)
  client_fee_pct: '0',         // tarifa al cliente: 0 = el cliente paga exactamente el precio publicado
  client_fee_min_cents: '0',   // mínimo de la tarifa al cliente (0 = sin mínimo)
  commission_min_cents: '50',  // comisión mínima por trabajo a quien ayuda (0 = sin mínimo); cubre la tarifa fija de las pasarelas
  // Costo estimado de las pasarelas (solo para la calculadora del panel; verifique en su cuenta de cada una)
  gw_mp_pct: '3.29', gw_mp_fixed_cop: '800', gw_mp_iva_pct: '19', gw_pp_pct: '5.4', gw_pp_fixed_cents: '30',
  min_task_cents: '500',       // precio mínimo de una tarea
  min_withdraw_cents: '1000',  // retiro mínimo
  clearance_days: '7',         // días de retención antes de poder retirar
  auto_approve_hours: '72',    // aprobación automática tras entrega
  max_revisions: '2',
  feature_24h_cents: '100',
  feature_7d_cents: '300',
  usd_to_local: '4000',        // tasa USD -> moneda de Mercado Pago (ej. COP)
  display_currency: 'COP',     // moneda que se muestra en grande (COP o USD)
  cities: 'Bogotá,Medellín,Cali,Barranquilla,Cartagena,Bucaramanga,Pereira,Manizales,Cúcuta,Ibagué,Santa Marta,Villavicencio,Pasto,Montería,Neiva,Armenia',
  // Apariencia (panel > Apariencia)
  site_name: 'Haganapp',
  color_brand: '#4338ca',
  color_accent: '#7c3aed',
  color_success: '#047857',
  color_warning: '#b45309',
  color_dark: '#0b1527',
  color_hero: '#1e1b4b',
  font: 'Inter',
  logo_color: '',
  logo_white: '',
  favicon: '',
  hero_image: '',
  hero_default: '1',
  pay_mp_currency: 'COP',
  pay_paypal_mode: 'sandbox',
  pay_demo: 'auto',
  show_hero_stat: '1',
  // Secciones de inicio visibles (1 = sí, 0 = no)
  show_paths: '1', show_categories: '1', show_tasks: '1', show_figures: '1', show_how: '1',
  show_gigs: '1', show_features: '1', show_payments: '1', show_cta: '1', show_newsletter: '1', show_topbar: '1',
  // Contacto y redes (panel > Apariencia)
  contact_email: '', contact_phone: '', contact_hours: 'Lun a Sáb · 8:00 a. m. – 9:00 p. m.', contact_city: 'Colombia',
  social_facebook: '', social_instagram: '', social_x: '', social_tiktok: '', social_linkedin: '', social_youtube: '',
};
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  run('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', k, v);
}
// Migración de la paleta anterior (azul brillante y amarillo) a la paleta sobria, solo si no se cambió desde el panel.
// Nuevo nombre de la plataforma (solo si no se cambió desde el panel)
run("UPDATE settings SET value='Haganapp' WHERE key='site_name' AND value='MICROTRABAJO'");
run("UPDATE texts SET value=REPLACE(value, 'MICROTRABAJO', 'Haganapp') WHERE value LIKE '%MICROTRABAJO%'");
for (const [k, oldV, newV] of [['commission_pct', '15', '8'], ['commission_pct', '10', '8'], ['pro_commission_pct', '12', '5'], ['pro_commission_pct', '7', '5'], ['pro_commission_pct', '3', '5'], ['plan_pro_cents', '499', '625'], ['client_fee_pct', '5', '4'], ['client_fee_min_cents', '50', '25'], ['color_brand', '#13233f', '#4338ca'], ['color_hero', '#13233f', '#1e1b4b'], ['color_accent', '#2563eb', '#7c3aed'], ['color_brand', '#1d4ed8', '#4338ca'], ['color_hero', '#1d4ed8', '#13233f'], ['color_accent', '#f59e0b', '#2563eb'], ['color_dark', '#0b1730', '#0b1527']]) {
  run('UPDATE settings SET value=? WHERE key=? AND value=?', newV, k, oldV);
}
// Promoción de lanzamiento: tarifas reducidas hasta una fecha (90 días desde la primera instalación).
for (const [k, v] of [['promo_active', '1'], ['promo_until', String(Date.now() + 90 * 86400000)], ['promo_commission_pct', '3'], ['promo_client_fee_pct', '2']]) {
  run('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', k, v);
}
// Modelo de tarifas único (sin planes): 5 % a quien ayuda, 0 % al cliente, sin promoción. Se aplica una sola vez.
if (!one("SELECT 1 x FROM settings WHERE key='fee_model_v2'")) {
  for (const [k, v] of [['commission_pct', '5'], ['client_fee_pct', '0'], ['client_fee_min_cents', '0'], ['promo_active', '0']]) run('UPDATE settings SET value=? WHERE key=?', v, k);
  run("INSERT INTO settings(key, value) VALUES ('fee_model_v2', '1')");
}
// El nombre de la web dentro de los textos editables se guarda como {{sitio}}: al cambiar el nombre desde el panel
// se actualiza en toda la web sin tocar cada texto. Se aplica una sola vez a los textos ya guardados.
if (!one("SELECT 1 x FROM settings WHERE key='name_token_v1'")) {
  const nm = String(one("SELECT value FROM settings WHERE key='site_name'")?.value || '');
  if (nm.length >= 3) for (const r of all('SELECT key, value FROM texts WHERE value LIKE ?', `%${nm}%`)) run('UPDATE texts SET value=? WHERE key=?', r.value.split(nm).join('{{sitio}}'), r.key);
  run("INSERT INTO settings(key, value) VALUES ('name_token_v1', '1')");
}
// Valores recomendados para cubrir el costo de las pasarelas: 8 %, mínimo $0,50 por trabajo y tarea mínima de $5. Una sola vez.
if (!one("SELECT 1 x FROM settings WHERE key='fee_model_v3'")) {
  for (const [k, v] of [['commission_pct', '8'], ['commission_min_cents', '50'], ['min_task_cents', '500']]) run('UPDATE settings SET value=? WHERE key=?', v, k);
  run("INSERT INTO settings(key, value) VALUES ('fee_model_v3', '1')");
}
function settingsRaw() {
  const s = {};
  for (const r of all('SELECT key, value FROM settings')) s[r.key] = isNaN(r.value) ? r.value : Number(r.value);
  return s;
}
// Tarifas vigentes (aplica la promoción de lanzamiento mientras esté activa).
function settings() {
  const s = settingsRaw();
  s.promo_on = String(s.promo_active) === '1' && Number(s.promo_until) > Date.now();
  if (s.promo_on) {
    s.base_commission_pct = s.commission_pct; s.base_client_fee_pct = s.client_fee_pct;
    s.commission_pct = Math.min(s.commission_pct, s.promo_commission_pct);
    s.client_fee_pct = Math.min(s.client_fee_pct, s.promo_client_fee_pct);
  }
  return s;
}

// ---------- Categorías (12 departamentos) ----------
const CATEGORIES = [
  ['diseno-grafico', 'Diseño gráfico y creatividad', 'Logotipos, flyers, miniaturas y piezas para redes.', ['Logotipos sencillos', 'Flyers y carteles', 'Portadas de canciones y álbumes', 'Miniaturas para YouTube', 'Publicaciones para Instagram y Facebook', 'Banners publicitarios', 'Edición y retoque de fotografías', 'Diseños para tiendas virtuales']],
  ['escritura-traduccion', 'Escritura, traducción y documentos', 'Transcripción, corrección, traducción y formato.', ['Transcripción de audio', 'Digitación de documentos', 'Corrección ortográfica', 'Traducciones', 'Resúmenes', 'Conversión de PDF', 'Formato de documentos', 'Redacción comercial', 'Creación de presentaciones']],
  ['edicion-audiovisual', 'Edición audiovisual', 'Videos cortos, subtítulos, reels y audio.', ['Edición de videos cortos', 'Subtítulos', 'Limpieza de audio', 'Cortes de podcasts', 'Conversión de formatos', 'Edición de reels', 'Clips musicales', 'Sincronización de audio y video']],
  ['datos-organizacion', 'Datos y organización', 'Excel, bases de datos, inventarios e informes.', ['Hojas de Excel', 'Organizar bases de datos', 'Clasificar archivos', 'Directorios de empresas (datos públicos)', 'Organizar inventarios', 'PDF a Excel', 'Revisar datos', 'Informes sencillos']],
  ['tecnologia', 'Tecnología e informática', 'Soporte, configuración y ajustes web.', ['Corrección de errores sencillos', 'Instalación de software', 'Formularios', 'Configuración de correos', 'Ajustes de páginas web', 'Automatizaciones sencillas', 'Configuración de dominios', 'Soporte técnico remoto']],
  ['investigacion', 'Investigación digital', 'Precios, proveedores, competencia y tendencias.', ['Investigar precios', 'Buscar proveedores', 'Comparar productos', 'Investigar empresas', 'Información pública', 'Directorios', 'Tendencias', 'Informes']],
  ['pruebas', 'Pruebas y evaluaciones', 'Pruebas de webs, apps y usabilidad.', ['Probar páginas web', 'Detectar errores', 'Facilidad de uso', 'Revisar formularios', 'Comprobar enlaces', 'Probar aplicaciones', 'Visualización móvil', 'Reportes de errores']],
  ['asistencia-virtual', 'Asistencia virtual', 'Correo, agenda, cotizaciones y apoyo administrativo.', ['Atención por correo', 'Organización de agendas', 'Gestión de archivos', 'Investigación administrativa', 'Cotizaciones', 'Organización de citas', 'Carga de productos', 'Apoyo administrativo']],
  ['comercio-electronico', 'Comercio electrónico', 'Catálogos, fichas y fotos de producto.', ['Carga de productos', 'Descripciones comerciales', 'Fotografías de productos', 'Organización de catálogos', 'Investigación de competidores', 'Fichas comerciales', 'Preparación de publicaciones']],
  ['inteligencia-artificial', 'Inteligencia artificial', 'Prompts, revisión y automatización con IA.', ['Crear prompts', 'Instrucciones para IA', 'Revisar resultados generados', 'Organizar documentos con IA', 'Clasificar información', 'Preparar contenido', 'Verificar resultados', 'Automatizaciones sencillas']],
  ['educacion', 'Educación y conocimientos', 'Clases breves, tutorías y material educativo.', ['Clases particulares breves', 'Explicaciones de temas', 'Tutorías de idiomas', 'Ayuda con programas', 'Herramientas digitales', 'Material educativo']],
  ['musica', 'Música y producción digital', 'Mezcla, edición vocal, portadas y metadatos.', ['Mezcla básica', 'Edición vocal', 'Limpieza de grabaciones', 'Portadas musicales', 'Visualizadores', 'Edición de podcasts', 'Metadatos', 'Material promocional']],
];
const PRICE_HINTS = { 'diseno-grafico': '3 – 15', 'escritura-traduccion': '3 – 10', 'edicion-audiovisual': '5 – 20', 'datos-organizacion': '4 – 15', tecnologia: '5 – 25', investigacion: '4 – 15', pruebas: '3 – 10', 'asistencia-virtual': '3 – 12', 'comercio-electronico': '3 – 12', 'inteligencia-artificial': '4 – 15', educacion: '5 – 15', musica: '5 – 20' };
const PRESENCIAL = [
  ['hogar-reparaciones', 'Hogar y reparaciones', 'Arreglos, instalaciones y montaje en casa.', ['Reparar electrodomésticos', 'Instalar lámparas y repisas', 'Arreglar puertas y cerraduras', 'Pintar una habitación', 'Montar muebles', 'Plomería sencilla']],
  ['limpieza', 'Limpieza y orden', 'Aseo de casas, oficinas y organización.', ['Limpieza de casa', 'Limpieza profunda', 'Organizar closets', 'Lavar ventanas', 'Limpieza después de un evento']],
  ['mudanzas', 'Mudanzas y cargas', 'Ayuda para trasteos, cargar y transportar.', ['Ayudante de mudanza', 'Cargar y descargar', 'Empacar cajas', 'Subir muebles', 'Llevar cosas al reciclaje']],
  ['mascotas', 'Mascotas', 'Paseos, cuidado y compañía para tu mascota.', ['Pasear perros', 'Cuidar mascotas en casa', 'Alimentar mascotas', 'Llevar al veterinario']],
  ['eventos', 'Eventos y celebraciones', 'Apoyo para fiestas, reuniones y eventos.', ['Decorar', 'Meseros y ayudantes', 'Montaje y desmontaje', 'Atención de invitados']],
  ['mandados', 'Mandados y gestiones', 'Diligencias, compras y filas por ti.', ['Hacer filas y trámites', 'Recoger y entregar paquetes', 'Compras puntuales', 'Acompañar a una gestión']],
  ['tecnologia-casa', 'Tecnología en casa', 'Ayuda con equipos y conexiones en tu hogar.', ['Configurar computador', 'Instalar impresora', 'Configurar televisor', 'Mejorar el wifi', 'Enseñar a usar el celular']],
  ['ayuda-horas', 'Ayudante por horas', 'Alguien que te acompañe o ayude unas horas.', ['Ayudante por una mañana', 'Acompañar una actividad', 'Apoyo en un negocio', 'Ayuda general por horas']],
];
const PRES_HINTS = { 'hogar-reparaciones': '10 – 40', limpieza: '10 – 30', mudanzas: '15 – 50', mascotas: '4 – 12', eventos: '10 – 40', mandados: '4 – 15', 'tecnologia-casa': '8 – 25', 'ayuda-horas': '4 – 8 /h' };

CATEGORIES.forEach(([slug, name, description, items], i) => {
  run('INSERT OR IGNORE INTO categories(slug, name, description, items, sort) VALUES (?,?,?,?,?)', slug, name, description, JSON.stringify(items), i + 1);
  run('UPDATE categories SET price_hint=? WHERE slug=? AND price_hint IS NULL', PRICE_HINTS[slug], slug);
});
PRESENCIAL.forEach(([slug, name, description, items], i) => {
  run('INSERT OR IGNORE INTO categories(slug, name, description, items, sort, grp) VALUES (?,?,?,?,?,?)', slug, name, description, JSON.stringify(items), 100 + i, 'presencial');
  run("UPDATE categories SET grp='presencial', price_hint=COALESCE(price_hint, ?) WHERE slug=?", PRES_HINTS[slug], slug);
});

// ---------- Administrador ----------
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@microtrabajo.local').toLowerCase();
if (!one('SELECT id FROM users WHERE role = ?', 'admin')) {
  if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 10 || process.env.ADMIN_PASSWORD === 'admin12345' || !process.env.ADMIN_EMAIL)) {
    console.error('[Haganapp] En producción defina ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 10 caracteres) antes del primer arranque.');
    process.exit(1);
  }
  const pass = process.env.ADMIN_PASSWORD || 'admin12345';
  run('INSERT INTO users(name, email, password_hash, role, verified_id, email_verified, created_at) VALUES (?,?,?,?,1,1,?)',
    'Administrador', ADMIN_EMAIL, bcrypt.hashSync(pass, 10), 'admin', now());
  console.log(`[Haganapp] Administrador creado: ${ADMIN_EMAIL} (cambie la contraseña)`);
}

// ---------- Datos de demostración (solo si la base está vacía) ----------
if (process.env.SEED_DEMO !== '0' && one('SELECT COUNT(*) c FROM tasks').c === 0) {
  const pw = bcrypt.hashSync('demo12345', 10);
  const mk = (name, email, headline, skills) => Number(run(
    'INSERT OR IGNORE INTO users(name,email,password_hash,headline,skills,bio,verified_id,created_at) VALUES (?,?,?,?,?,?,1,?)',
    name, email, pw, headline, skills, 'Perfil de demostración.', now()).lastInsertRowid);
  const ana = mk('Ana Torres', 'ana@demo.local', 'Diseñadora gráfica', 'Illustrator, Photoshop, Canva');
  const luis = mk('Luis Gómez', 'luis@demo.local', 'Transcriptor y editor', 'Transcripción, Subtítulos, Premiere');
  const cli = mk('Tienda Aurora', 'cliente@demo.local', 'Tienda virtual', 'Comercio electrónico');
  const cat = (slug) => one('SELECT id FROM categories WHERE slug=?', slug).id;
  const t = (c, title, desc, cents, hrs, express = 0, mode = 'single', qty = 1) => run(
    'INSERT INTO tasks(client_id,category_id,title,description,budget_cents,delivery_hours,express,mode,quantity,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    cli, cat(c), title, desc, cents, hrs, express, mode, qty, now());
  t('diseno-grafico', 'Diseño de flyer publicitario', 'Flyer para evento de lanzamiento. Entrego logo y textos. Formato 1080x1350.', 500, 24, 1);
  t('escritura-traduccion', 'Transcribir audio de 5 minutos', 'Entrevista en español, audio claro. Entregar en Word.', 300, 24);
  t('datos-organizacion', 'Crear una hoja de Excel de inventario', 'Inventario de 80 productos con fórmulas de stock mínimo.', 800, 48);
  t('comercio-electronico', 'Editar 20 fotos de producto', 'Fondo blanco y recorte. Cada unidad es una foto.', 300, 72, 0, 'units', 20);
  t('edicion-audiovisual', 'Subtítulos para video de 3 minutos', 'Subtítulos en español, archivo .srt.', 400, 12, 1);
  const g = (w, c, title, desc, cents, hrs) => run(
    'INSERT INTO gigs(worker_id,category_id,title,description,price_cents,delivery_hours,created_at) VALUES (?,?,?,?,?,?,?)',
    w, cat(c), title, desc, cents, hrs, now());
  const tp = (c, title, desc, cents, hrs, city, zone, ptype = 'fixed', hours = 0) => run(
    "INSERT INTO tasks(client_id,category_id,title,description,budget_cents,delivery_hours,modality,city,zone,price_type,hours,scheduled_at,created_at) VALUES (?,?,?,?,?,?,'presencial',?,?,?,?,?,?)",
    cli, cat(c), title, desc, cents, hrs, city, zone, ptype, hours, new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16), now());
  tp('hogar-reparaciones', 'Montar un clóset de 3 puertas', 'Clóset en caja, trae todas las piezas. Necesito que traigas destornillador.', 1500, 24, 'Bogotá', 'Chapinero');
  tp('mascotas', 'Pasear a mi perro 1 hora', 'Labrador tranquilo, paseo por el parque del barrio.', 400, 24, 'Bogotá', 'Usaquén');
  tp('mudanzas', 'Ayudante para trasteo pequeño', 'Bajar cajas y algunos muebles de un tercer piso.', 300, 24, 'Medellín', 'Laureles', 'hourly', 4);
  tp('tecnologia-casa', 'Mi computador no prende, ¿quién me ayuda?', 'No sé si es la fuente o el disco. Busco quien lo revise y me diga el precio.', 2000, 48, 'Cali', 'San Fernando', 'open');
  g(ana, 'diseno-grafico', 'Diseño tu flyer profesional', 'Flyer para redes o impresión con 2 correcciones incluidas.', 500, 24);
  g(ana, 'diseno-grafico', 'Miniatura para YouTube', 'Miniatura llamativa 1280x720.', 400, 24);
  g(luis, 'escritura-traduccion', 'Transcribo 10 minutos de audio', 'Transcripción precisa con marcas de tiempo.', 600, 24);
  g(luis, 'edicion-audiovisual', 'Subtítulos .srt para tu video', 'Hasta 5 minutos de video.', 500, 24);
}

module.exports = { db, one, all, run, tx, now, settings, settingsRaw, DATA_DIR };

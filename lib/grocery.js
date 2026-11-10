// Módulo de supermercado: cadenas, catálogo, precios por cadena, pedidos de mercado.
// Montos del mercado en pesos colombianos (enteros). El cobro se convierte a centavos de USD para la pasarela.
const { db, one, all, run, now, settings } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS g_chains (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#4f46e5',
  website TEXT NOT NULL DEFAULT '', cities TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS g_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, unit TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Despensa',
  active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS g_prices (
  product_id INTEGER NOT NULL REFERENCES g_products(id), chain_id INTEGER NOT NULL REFERENCES g_chains(id),
  price INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'admin', updated_at INTEGER NOT NULL, PRIMARY KEY (product_id, chain_id));
CREATE TABLE IF NOT EXISTS g_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL REFERENCES users(id), shopper_id INTEGER REFERENCES users(id),
  chain_id INTEGER NOT NULL REFERENCES g_chains(id), city TEXT NOT NULL, zone TEXT NOT NULL, address TEXT NOT NULL, scheduled_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '', substitutions INTEGER NOT NULL DEFAULT 1, items TEXT NOT NULL,
  estimate INTEGER NOT NULL, reserve INTEGER NOT NULL, service INTEGER NOT NULL, fee INTEGER NOT NULL, total INTEGER NOT NULL,
  receipt_total INTEGER, receipt_file TEXT, refund INTEGER NOT NULL DEFAULT 0, done_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment', created_at INTEGER NOT NULL, paid_at INTEGER, accepted_at INTEGER, purchased_at INTEGER, completed_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_gorders_status ON g_orders(status, city);
`);

const DEFAULTS = { grocery_enabled: '0', grocery_service_cop: '8000', grocery_fee_pct: '3', grocery_reserve_pct: '10', grocery_max_cop: '400000', grocery_min_cop: '30000' };
for (const [k, v] of Object.entries(DEFAULTS)) run('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', k, v);

// Cadenas de supermercados (las ciudades se editan desde el panel).
const BIG = 'Bogotá,Medellín,Cali,Barranquilla,Cartagena,Bucaramanga,Pereira,Manizales,Cúcuta,Ibagué,Santa Marta,Villavicencio,Pasto,Montería,Neiva,Armenia';
const CHAINS = [
  ['exito', 'Éxito', '#f5c400', 'https://www.exito.com', BIG],
  ['carulla', 'Carulla', '#0f7a3a', 'https://www.carulla.com', 'Bogotá,Medellín,Cali,Barranquilla,Cartagena,Bucaramanga,Pereira'],
  ['jumbo', 'Jumbo', '#00a650', 'https://www.tiendasjumbo.co', 'Bogotá,Medellín,Cali,Barranquilla,Bucaramanga,Pereira,Manizales,Ibagué,Villavicencio,Neiva'],
  ['olimpica', 'Olímpica', '#e30613', 'https://www.olimpica.com', 'Bogotá,Medellín,Cali,Barranquilla,Cartagena,Santa Marta,Montería,Bucaramanga,Cúcuta,Pereira,Armenia'],
  ['d1', 'D1', '#d50000', 'https://domicilios.tiendasd1.com', BIG],
  ['ara', 'Ara', '#e4002b', 'https://aratiendas.com', 'Bogotá,Medellín,Barranquilla,Cartagena,Santa Marta,Bucaramanga,Cúcuta,Pereira,Manizales,Armenia,Ibagué,Montería'],
  ['metro', 'Metro', '#f39200', 'https://www.tiendasmetro.co', 'Bogotá,Medellín,Cali,Barranquilla,Cartagena,Bucaramanga,Cúcuta,Villavicencio,Neiva'],
  ['makro', 'Makro', '#003da5', 'https://www.makro.com.co', 'Bogotá,Medellín,Cali,Barranquilla,Cartagena,Bucaramanga,Pereira'],
];
CHAINS.forEach(([slug, name, color, website, cities], i) => run('INSERT OR IGNORE INTO g_chains(slug,name,color,website,cities,sort) VALUES (?,?,?,?,?,?)', slug, name, color, website, cities, i));

// Catálogo básico (sin precios: los precios se cargan desde el panel o con los recibos).
const PRODUCTS = [
  ['Arroz blanco', '1 kg', 'Despensa'], ['Arroz blanco', '5 kg', 'Despensa'], ['Azúcar', '1 kg', 'Despensa'], ['Sal refinada', '1 kg', 'Despensa'],
  ['Aceite vegetal', '1 L', 'Despensa'], ['Panela', '500 g', 'Despensa'], ['Café molido', '500 g', 'Despensa'], ['Chocolate de mesa', '500 g', 'Despensa'],
  ['Pasta spaghetti', '500 g', 'Despensa'], ['Fríjol cargamanto', '500 g', 'Despensa'], ['Lenteja', '500 g', 'Despensa'], ['Harina de maíz precocida', '1 kg', 'Despensa'],
  ['Atún en lata', '170 g', 'Despensa'], ['Avena en hojuelas', '500 g', 'Despensa'],
  ['Leche entera', '1 L', 'Lácteos y huevos'], ['Huevos AA', '30 unidades', 'Lácteos y huevos'], ['Queso campesino', '500 g', 'Lácteos y huevos'],
  ['Mantequilla', '250 g', 'Lácteos y huevos'], ['Yogur', '1 L', 'Lácteos y huevos'],
  ['Pechuga de pollo', '1 kg', 'Carnes'], ['Carne molida de res', '500 g', 'Carnes'], ['Salchichas', '500 g', 'Carnes'],
  ['Papa pastusa', '1 kg', 'Frutas y verduras'], ['Tomate chonto', '1 kg', 'Frutas y verduras'], ['Cebolla cabezona', '1 kg', 'Frutas y verduras'],
  ['Plátano verde', '1 kg', 'Frutas y verduras'], ['Banano', '1 kg', 'Frutas y verduras'], ['Zanahoria', '1 kg', 'Frutas y verduras'],
  ['Pan tajado', '500 g', 'Panadería'], ['Arepas de maíz', '10 unidades', 'Panadería'],
  ['Agua', '6 L', 'Bebidas'], ['Gaseosa', '1,5 L', 'Bebidas'], ['Jugo en caja', '1 L', 'Bebidas'],
  ['Papel higiénico', '12 rollos', 'Aseo del hogar'], ['Detergente en polvo', '1 kg', 'Aseo del hogar'], ['Jabón de loza', '500 g', 'Aseo del hogar'],
  ['Limpiador multiusos', '1 L', 'Aseo del hogar'], ['Jabón de baño', '3 unidades', 'Aseo personal'], ['Crema dental', '100 ml', 'Aseo personal'], ['Champú', '400 ml', 'Aseo personal'],
];
PRODUCTS.forEach(([n, u, c]) => run('INSERT OR IGNORE INTO g_products(name,unit,category) VALUES (?,?,?)', `${n} ${u}`, u, c));

// Precios de ejemplo solo en instalaciones de demostración (marcados como 'ejemplo').
if (process.env.SEED_DEMO !== '0' && one('SELECT COUNT(*) c FROM g_prices').c === 0) {
  const base = { 'Arroz blanco 1 kg': 4500, 'Arroz blanco 5 kg': 21000, 'Azúcar 1 kg': 4800, 'Sal refinada 1 kg': 2200, 'Aceite vegetal 1 L': 9800, 'Panela 500 g': 3200, 'Café molido 500 g': 16500, 'Chocolate de mesa 500 g': 11000, 'Pasta spaghetti 500 g': 3600, 'Fríjol cargamanto 500 g': 7800, 'Lenteja 500 g': 4200, 'Harina de maíz precocida 1 kg': 5600, 'Atún en lata 170 g': 6900, 'Avena en hojuelas 500 g': 4900, 'Leche entera 1 L': 4600, 'Huevos AA 30 unidades': 17500, 'Queso campesino 500 g': 12500, 'Mantequilla 250 g': 8900, 'Yogur 1 L': 9500, 'Pechuga de pollo 1 kg': 17900, 'Carne molida de res 500 g': 13900, 'Salchichas 500 g': 9900, 'Papa pastusa 1 kg': 3200, 'Tomate chonto 1 kg': 4500, 'Cebolla cabezona 1 kg': 3900, 'Plátano verde 1 kg': 3600, 'Banano 1 kg': 3300, 'Zanahoria 1 kg': 2900, 'Pan tajado 500 g': 6500, 'Arepas de maíz 10 unidades': 5900, 'Agua 6 L': 7500, 'Gaseosa 1,5 L': 5800, 'Jugo en caja 1 L': 5200, 'Papel higiénico 12 rollos': 18900, 'Detergente en polvo 1 kg': 11500, 'Jabón de loza 500 g': 5400, 'Limpiador multiusos 1 L': 7200, 'Jabón de baño 3 unidades': 8900, 'Crema dental 100 ml': 6400, 'Champú 400 ml': 15900 };
  const factor = { exito: 1, carulla: 1.12, jumbo: 1.02, olimpica: 0.98, d1: 0.82, ara: 0.85, metro: 0.97, makro: 0.93 };
  for (const p of all('SELECT id, name FROM g_products')) {
    for (const c of all('SELECT id, slug FROM g_chains')) {
      if (!base[p.name] || ((c.slug === 'd1' || c.slug === 'ara') && (p.id * 7 + c.id) % 6 === 0)) continue; // tiendas de descuento: no todo disponible
      run('INSERT OR IGNORE INTO g_prices(product_id,chain_id,price,source,updated_at) VALUES (?,?,?,?,?)', p.id, c.id, Math.round(base[p.name] * factor[c.slug] / 50) * 50, 'ejemplo', now());
    }
  }
}

const chainsIn = (city) => all('SELECT * FROM g_chains WHERE active=1 ORDER BY sort').filter((c) => !city || c.cities.split(',').map((x) => x.trim()).includes(city));

// Compara la canasta completa en cada cadena de la ciudad (todo en un solo supermercado).
function compare(city, cart) {
  const ids = Object.keys(cart).map(Number).filter((id) => cart[id] > 0);
  if (!ids.length) return [];
  const prices = all(`SELECT product_id, chain_id, price, source, updated_at FROM g_prices WHERE product_id IN (${ids.map(() => '?').join(',')})`, ...ids);
  return chainsIn(city).map((c) => {
    let total = 0, found = 0; const missing = []; const lines = [];
    for (const id of ids) {
      const p = prices.find((x) => x.product_id === id && x.chain_id === c.id);
      if (p) { total += p.price * cart[id]; found++; lines.push({ id, qty: cart[id], price: p.price }); } else missing.push(id);
    }
    return { chain: c, total, found, missing, lines, complete: missing.length === 0 };
  }).filter((r) => r.found > 0).sort((a, b) => (b.found - a.found) || (a.total - b.total));
}

function quote(estimate) {
  const s = settings();
  const reserve = Math.round(estimate * (1 + s.grocery_reserve_pct / 100));
  const service = Number(s.grocery_service_cop);
  const fee = Math.max(1000, Math.round(estimate * s.grocery_fee_pct / 100));
  return { estimate, reserve, service, fee, total: reserve + service + fee };
}
const copToUsdCents = (cop) => Math.max(1, Math.round(cop / (Number(settings().usd_to_local) || 1) * 100));

module.exports = { chainsIn, compare, quote, copToUsdCents };

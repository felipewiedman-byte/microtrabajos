// App instalable (PWA): manifiesto, íconos generados del logo/ícono de la web y service worker liviano.
const path = require('path');
const fs = require('fs');
const { settings, DATA_DIR } = require('./db');

let sharp = null; try { sharp = require('sharp'); } catch { /* sin sharp: ícono por defecto */ }
const cache = new Map(); // tamaño -> { key, buf }
// Ícono cuadrado: el ícono de la pestaña (o el logo) centrado sobre el color de marca; si no hay, la inicial del nombre.
async function icon(size) {
  const st = settings(), src = st.favicon || st.logo_light || '', key = `${src}|${st.brand_color}|${st.site_name}`;
  const hit = cache.get(size);
  if (hit && hit.key === key) return hit.buf;
  let buf;
  const bg = /^#[0-9a-f]{6}$/i.test(st.brand_color) ? st.brand_color : '#0f766e';
  if (sharp) {
    const pad = Math.round(size * 0.18), inner = size - pad * 2;
    let over = null;
    const file = src && /^[a-f0-9]{28}\.(png|webp|jpg)$/.test(src) ? path.join(DATA_DIR, 'uploads', src) : '';
    try {
      let raw = file && fs.existsSync(file) ? fs.readFileSync(file) : null;
      if (!raw && src) { const r = await require('./r2').getImage(src).catch(() => null); raw = r && r.body; }
      if (raw) over = await sharp(raw).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    } catch { over = null; }
    if (!over) {
      const letter = String(st.site_name || 'C').trim().charAt(0).toUpperCase().replace(/[<&>"]/g, '');
      over = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${Math.round(inner * 0.62)}" fill="#fff">${letter}</text></svg>`)).png().toBuffer();
    }
    buf = await sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: over, top: pad, left: pad }]).png().toBuffer();
  } else buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  cache.set(size, { key, buf });
  return buf;
}
function manifest(base) {
  const st = settings();
  return {
    name: st.site_name, short_name: st.site_name.slice(0, 12), description: st.site_tagline, lang: 'es', dir: 'ltr',
    start_url: '/panel?app=1', scope: '/', id: '/panel', display: 'standalone', orientation: 'portrait',
    background_color: '#f6f7f9', theme_color: st.brand_color,
    icons: [192, 512].map((s) => ({ src: `/app-icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any maskable' })),
    shortcuts: [{ name: 'Pedidos', url: '/panel/pedidos' }, { name: 'Nuevo producto', url: '/panel/productos/nuevo' }],
  };
}
module.exports = { icon, manifest };

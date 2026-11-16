// Revisa la ubicación de TODOS los sitios turísticos contra Wikipedia y guarda las correcciones en data/sites-fix.json.
// La web aplica ese archivo al arrancar (sites.js), así que basta con ejecutar esto una vez y reiniciar:
//   node check-sites.js            → revisa y guarda las correcciones
//   node check-sites.js --ver      → solo muestra lo que cambiaría, sin guardar
// Regla: se usa la coordenada oficial del artículo de Wikipedia (español; si no hay, inglés) cuando la nuestra se aleja más de 0,5 km.
// Si Wikipedia queda a más de 300 km, NO se cambia sola (puede ser otro artículo con el mismo nombre): sale en la lista «revisar a mano».
const fs = require('fs'), path = require('path')
const DATA = [...require('./sites-data'), ...require('./sites-data2')]
const DIR = process.env.PLANETA_DATA || path.join(__dirname, 'data'), OUT = path.join(DIR, 'sites-fix.json')
const ONLY_SHOW = process.argv.includes('--ver')
const UA = { 'User-Agent': 'planetapp/1.0 (revision de ubicaciones)' }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const km = (a, b) => { const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r, h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)) }

async function coords(lang, title) {
  const u = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({ action: 'query', format: 'json', redirects: '1', prop: 'coordinates', titles: title })
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(r.status)
      const d = await r.json(), pg = Object.values(d?.query?.pages || {})[0], c = pg?.coordinates?.[0]
      return c ? { lat: +c.lat, lon: +c.lon, title: pg.title } : null } catch { await sleep(1500 * (i + 1)) }
  }
  return null
}

;(async () => {
  const fixes = {}, review = [], missing = []
  let ok = 0, n = 0
  for (const [name, country, lat, lon, , , wiki] of DATA) {
    n++
    const title = wiki || name
    let w = await coords('es', title); if (!w) w = await coords('en', title)
    if (!w) { missing.push(`${name} (${country})`); continue }
    const d = km({ lat, lon }, w)
    if (d <= 0.5) ok++
    else if (d > 300) review.push(`${name} (${country}): Wikipedia «${w.title}» queda a ${Math.round(d)} km → no se cambió`)
    else { fixes[name + '|' + country] = { lat: +w.lat.toFixed(5), lon: +w.lon.toFixed(5) }; console.log(`corregido: ${name} (${country}) se movió ${d.toFixed(1)} km`) }
    if (n % 50 === 0) console.log(`… ${n}/${DATA.length} revisados`)
    await sleep(120)
  }
  console.log(`\nRESUMEN: ${DATA.length} sitios · ${ok} ya estaban bien · ${Object.keys(fixes).length} corregidos · ${review.length} para revisar a mano · ${missing.length} sin coordenadas en Wikipedia`)
  if (review.length) console.log('\nREVISAR A MANO:\n' + review.join('\n'))
  if (missing.length) console.log('\nSIN COORDENADAS EN WIKIPEDIA (se quedan como están):\n' + missing.join('\n'))
  if (ONLY_SHOW) return console.log('\n(solo se mostró, no se guardó nada)')
  fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(fixes, null, 1))
  console.log(`\nGuardado en ${OUT}. Reinicia la web para aplicarlo: pm2 restart planetapp`)
})()

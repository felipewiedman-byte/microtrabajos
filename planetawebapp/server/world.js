// Geocoding (any place on Earth) via OpenStreetMap Nominatim + translation, with caching and polite rate limits.
'use strict'
const crypto = require('crypto')
module.exports = function world(db, ADMIN) {
  db.exec(`CREATE TABLE IF NOT EXISTS geocache (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);
           CREATE TABLE IF NOT EXISTS translations (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);`)
  const UA = { 'User-Agent': 'planetapp/1.0 (social map; contact via site admin)', 'Accept-Language': 'es' }
  // Nominatim allows max 1 request per second: serialize calls
  let chain = Promise.resolve(), last = 0
  const queued = fn => (chain = chain.then(async () => { const wait = 1100 - (Date.now() - last); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last = Date.now(); return fn() }, () => {}).then(r => r))
  const cached = async (key, fn) => {
    const hit = db.prepare('SELECT value FROM geocache WHERE key = ?').get(key); if (hit) return JSON.parse(hit.value)
    const v = await queued(fn); db.prepare('INSERT OR REPLACE INTO geocache (key, value, created_at) VALUES (?, ?, ?)').run(key, JSON.stringify(v), Date.now()); return v
  }
  const placeOf = a => a ? (a.city || a.town || a.village || a.municipality || a.county || a.state || a.region || '') : ''
  async function search(q) {
    q = String(q || '').trim().slice(0, 80); if (q.length < 2) return []
    return cached('s:' + q.toLowerCase(), async () => {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=' + encodeURIComponent(q), { headers: UA, signal: AbortSignal.timeout(10000) })
      if (!r.ok) throw new Error('geo ' + r.status)
      return (await r.json()).map(x => ({ name: x.display_name.split(',').slice(0, 3).join(','), city: placeOf(x.address) || x.name, country: x.address?.country || '', lat: +(+x.lat).toFixed(5), lon: +(+x.lon).toFixed(5) }))
    })
  }
  async function reverse(lat, lon) {
    const key = `r:${(+lat).toFixed(2)},${(+lon).toFixed(2)}`
    return cached(key, async () => {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`, { headers: UA, signal: AbortSignal.timeout(10000) })
      if (!r.ok) throw new Error('geo ' + r.status)
      const d = await r.json(); return d.error ? null : { city: placeOf(d.address) || d.name || '', country: d.address?.country || '' }
    })
  }
  // Translation: DeepL or Google if a key is set in the admin panel, otherwise free MyMemory (limited per day)
  async function translate(text, to) {
    text = String(text || '').slice(0, 1500); to = String(to || 'es').slice(0, 5).toLowerCase().split('-')[0]
    if (!text.trim()) return ''
    const key = crypto.createHash('sha1').update(to + '|' + text).digest('hex')
    const hit = db.prepare('SELECT value FROM translations WHERE key = ?').get(key); if (hit) return hit.value
    let out = ''
    const deepl = ADMIN.secret('translate', 'deeplKey'), google = ADMIN.secret('translate', 'googleKey')
    if (deepl) {
      const host = deepl.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'
      const r = await fetch(`https://${host}/v2/translate`, { method: 'POST', headers: { Authorization: 'DeepL-Auth-Key ' + deepl, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: [text], target_lang: to.toUpperCase() }), signal: AbortSignal.timeout(10000) })
      if (!r.ok) throw new Error('DeepL respondió ' + r.status); out = (await r.json()).translations?.[0]?.text || ''
    } else if (google) {
      const r = await fetch('https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(google), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, target: to, format: 'text' }), signal: AbortSignal.timeout(10000) })
      if (!r.ok) throw new Error('Google respondió ' + r.status); out = (await r.json()).data?.translations?.[0]?.translatedText || ''
    } else {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=autodetect|${to}`, { signal: AbortSignal.timeout(10000) })
      const d = await r.json(); if (d.responseStatus !== 200 && d.responseStatus !== '200') throw new Error(d.responseDetails || 'Servicio de traducción no disponible')
      out = d.responseData?.translatedText || ''
    }
    if (out) db.prepare('INSERT OR REPLACE INTO translations (key, value, created_at) VALUES (?, ?, ?)').run(key, out, Date.now())
    return out
  }
  return { search, reverse, translate }
}

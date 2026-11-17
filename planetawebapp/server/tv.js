// Canales de televisión en vivo desde YouTube. Se pega un enlace (video en vivo, canal o @usuario) y la web detecta sola el canal, su nombre,
// su logo y si YouTube permite mostrarlo en otras páginas. Se guarda el CANAL (no el video), así siempre muestra lo que esté en vivo.
// El video lo sirve YouTube con su reproductor oficial: tu servidor no transmite nada.
module.exports = function tv({ db, now, putImage, secret }) {
  db.exec('CREATE TABLE IF NOT EXISTS tv_channels (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL DEFAULT \'\', yt_channel TEXT, yt_video TEXT, logo TEXT, active INTEGER NOT NULL DEFAULT 1, ord INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)')
  for (const c of ['live INTEGER', 'checked_at INTEGER']) { try { db.exec('ALTER TABLE tv_channels ADD COLUMN ' + c) } catch { /* ya existe */ } }
  const UA = {}   // sin cabeceras de navegador inventadas: YouTube corta esas conexiones desde un servidor (con las de Node sin tocar, responde 200)
  const HOSTS = /^(www\.|m\.)?youtube\.com$|^youtu\.be$/
  const unesc = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\u0026/g, '&')
  async function page(url) {
    const x = new URL(url); if (x.protocol !== 'https:' || !HOSTS.test(x.hostname)) throw new Error('Solo se aceptan enlaces de YouTube.')
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(12000) })
    if (/(^|\.)consent\.youtube\.com$/.test(new URL(r.url || url).hostname)) throw new Error('YouTube pidió aceptar cookies antes de mostrar la página')
    if (!r.ok) throw new Error('YouTube respondió ' + r.status)
    const t = (await r.text()).slice(0, 3_500_000)
    if (/consent\.youtube\.com|Antes de ir a YouTube|Before you continue to YouTube/i.test(t.slice(0, 20000)) && !/"channelId"/.test(t)) throw new Error('YouTube pidió aceptar cookies antes de mostrar la página')
    return t
  }
  // qué es lo que se pegó
  function parse(u) {
    u = String(u || '').trim(); let m
    if ((m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(u))) return { kind: 'video', id: m[1] }
    if ((m = /youtube\.com\/channel\/(UC[\w-]{22})/.exec(u))) return { kind: 'channel', id: m[1] }
    if ((m = /youtube\.com\/(@[\w.%-]{2,60})/.exec(u))) return { kind: 'handle', path: m[1] }
    if ((m = /youtube\.com\/(?:c|user)\/([\w.%-]{2,60})/.exec(u))) return { kind: 'handle', path: (/\/user\//.test(u) ? 'user/' : 'c/') + m[1] }
    if (/^@[\w.%-]{2,60}$/.test(u)) return { kind: 'handle', path: u }
    if (/^[\w-]{11}$/.test(u)) return { kind: 'video', id: u }
    return null
  }
  const meta = (html, prop) => { const t = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*>', 'i').exec(html)?.[0]; return t ? unesc(/content=["']([^"']*)["']/i.exec(t)?.[1]) : '' }
  // el identificador del PROPIO canal: primero lo más fiable de la página (dirección canónica y metadatos del canal); «channelId» a secas puede ser de otro canal recomendado
  const chanId = html => /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})/i.exec(html)?.[1] || /itemprop=["']identifier["'][^>]+content=["'](UC[\w-]{22})/i.exec(html)?.[1] || /"externalId":"(UC[\w-]{22})"/.exec(html)?.[1] || /feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/.exec(html)?.[1] || /"channelId":"(UC[\w-]{22})"/.exec(html)?.[1] || /"browseId":"(UC[\w-]{22})"/.exec(html)?.[1] || ''
  async function oembed(id) {   // dice si YouTube deja mostrar ese video en otras páginas (200 sí, 401 no, 404 no existe)
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: AbortSignal.timeout(10000) })
    if (r.status === 401 || r.status === 403) throw new Error('Ese canal no permite mostrar su transmisión en otras páginas.')
    if (r.status === 404) throw new Error('Ese video no existe o es privado.')
    if (!r.ok) throw new Error('YouTube respondió ' + r.status)
    return r.json()
  }
  // ---- Con llave de la API de YouTube (gratis, oficial): detecta canal, nombre, logo, país y si permite incrustar, sin depender del formato de la página ----
  const apiKey = () => (secret && secret('youtube', 'key')) || ''
  async function yt(path, params) {
    const u = new URL('https://www.googleapis.com/youtube/v3/' + path); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('key', apiKey())
    const r = await fetch(u, { signal: AbortSignal.timeout(12000) }); const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error('API de YouTube: ' + (d.error?.errors?.[0]?.reason || d.error?.message || r.status))
    return d
  }
  const countryName = c => { try { return c ? new Intl.DisplayNames(['es'], { type: 'region' }).of(String(c).toUpperCase()) : '' } catch { return String(c || '') } }
  async function detectApi(p) {
    const out = { name: '', channel: '', video: '', logo: '', country: '', warn: [] }
    let ch = null
    if (p.kind === 'video') {
      const d = await yt('videos', { part: 'snippet,status', id: p.id }), v = d.items?.[0]
      if (!v) throw new Error('Ese video no existe o es privado.')
      if (v.status?.embeddable === false) throw new Error('Ese canal no permite mostrar su transmisión en otras páginas.')
      out.video = p.id; out.channel = v.snippet.channelId
    } else if (p.kind === 'channel') out.channel = p.id
    if (out.channel) ch = (await yt('channels', { part: 'snippet', id: out.channel })).items?.[0]
    else if (p.kind === 'handle') {
      const h = p.path.startsWith('@') ? { forHandle: p.path } : p.path.startsWith('user/') ? { forUsername: p.path.slice(5) } : null
      if (!h) throw new Error('Ese tipo de enlace (/c/…) no se reconoce: usa el de la página del canal con @usuario o youtube.com/channel/UC…')
      ch = (await yt('channels', { part: 'snippet', ...h })).items?.[0]; if (!ch) throw new Error('No encontré ese canal en YouTube.')
      out.channel = ch.id
    }
    if (ch) { out.name = String(ch.snippet.title || '').slice(0, 80); out.logo = ch.snippet.thumbnails?.high?.url || ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || ''; out.country = countryName(ch.snippet.country) }
    if (!out.video && out.channel) {   // su transmisión en vivo de ahora, y si YouTube deja incrustarla
      const s2 = await yt('search', { part: 'snippet', channelId: out.channel, eventType: 'live', type: 'video', maxResults: 1 }), id = s2.items?.[0]?.id?.videoId
      if (id) { const v = (await yt('videos', { part: 'status', id })).items?.[0]; if (v?.status?.embeddable === false) throw new Error('Ese canal no permite mostrar su transmisión en otras páginas.'); out.video = id }
      else out.warn.push('Ahora mismo no está transmitiendo en vivo.')
    }
    return out
  }
  // Detecta todo a partir del enlace pegado. No guarda nada.
  async function detect(input) {
    const p = parse(input); if (!p) throw new Error('Pega un enlace de YouTube: un video en vivo, la página del canal o su @usuario.')
    let viaApi = null
    if (apiKey()) { try { return await detectApi(p) } catch (e) { if (/permite|no existe|no encontré|no se reconoce/.test(e.message)) throw e; viaApi = e.message } }   // si la API falla (cupo, llave) se sigue con la lectura de la página
    const out = { name: '', channel: '', video: '', logo: '', country: '', warn: viaApi ? [viaApi + '. Se intentó leer la página.'] : [] }
    let pageUrl = ''
    if (p.kind === 'video') {
      const o = await oembed(p.id); out.video = p.id; out.name = String(o.author_name || o.title || '').slice(0, 80); pageUrl = o.author_url
    } else if (p.kind === 'channel') { out.channel = p.id; pageUrl = 'https://www.youtube.com/channel/' + p.id }
    else pageUrl = 'https://www.youtube.com/' + p.path
    const tries = pageUrl ? [pageUrl, pageUrl.replace(/\/$/, '') + '/videos', pageUrl.replace(/\/$/, '') + '/live', pageUrl.replace(/\/$/, '') + '/about'] : []
    const why = []
    for (const u of tries) {
      if (out.channel && out.logo) break
      try {
        const html = await page(u)
        out.channel = out.channel || chanId(html)
        out.name = unesc(meta(html, 'og:title')).slice(0, 80) || out.name
        const logo = meta(html, 'og:image'); if (!out.logo && /^https:\/\//.test(logo)) out.logo = logo
        const c = /"country":"([^"]{2,40})"/.exec(html)?.[1]; if (c && !out.country) out.country = unesc(c)
        if (!out.channel) why.push(u.replace('https://www.youtube.com', '') + ': sin identificador')
      } catch (e) { why.push(u.replace('https://www.youtube.com', '') + ': ' + e.message + (e.cause ? ' (' + (e.cause.code || e.cause.message) + ')' : '')) }
    }
    if (why.length && !out.channel) out.warn.push('No pude leer la página del canal (' + why.join(' · ') + ').')
    if (!out.channel && !out.video) throw new Error('No pude identificar el canal. ' + (out.warn.join(' ') || '') + ' Pega el enlace de la página del canal con la forma youtube.com/channel/UC… o el de un video en vivo.')
    if (!out.channel) out.warn.push('No pude sacar el identificador del canal: se guardó el video, y si esa transmisión termina habrá que pegar otro enlace.')
    // si se pegó el canal, se busca su transmisión actual para comprobar que se puede incrustar
    if (out.channel && !out.video) {
      try { const html = await page('https://www.youtube.com/channel/' + out.channel + '/live'); const v = /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})/i.exec(html)?.[1]; if (v) { out.video = v; await oembed(v) } else out.warn.push('Ahora mismo no está transmitiendo en vivo.') }
      catch (e) { if (/permite|no existe/.test(e.message)) throw e; out.warn.push('No pude comprobar si está en vivo (' + e.message + ').') }
    }
    return out
  }
  const row = r => ({ id: r.id, name: r.name, country: r.country, channel: r.yt_channel, video: r.yt_video, logo: r.logo, active: !!r.active, ord: r.ord, live: r.live == null ? null : !!r.live, checked: r.checked_at || 0 })
  async function add(input, { name, country } = {}) {
    const d = await detect(input)
    if (db.prepare('SELECT 1 FROM tv_channels WHERE (yt_channel = ? AND yt_channel != \'\') OR (yt_video = ? AND yt_video != \'\')').get(d.channel || '', d.video || '')) throw new Error('Ese canal ya está en la lista.')
    let logo = d.logo || null; if (logo && putImage) { try { logo = await putImage(logo, 'tv') } catch { logo = null } }
    const ord = (db.prepare('SELECT COALESCE(MAX(ord), 0) m FROM tv_channels').get().m || 0) + 1, live0 = d.video && d.channel ? 1 : null
    const r = db.prepare('INSERT INTO tv_channels (name, country, yt_channel, yt_video, logo, active, ord, created_at, live, checked_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)').run(String(name || d.name || 'Canal').slice(0, 80), String(country || d.country || '').slice(0, 60), d.channel || '', d.video || '', logo, ord, now(), live0, now())
    return { ...row(db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(Number(r.lastInsertRowid))), warn: d.warn }
  }
  const list = all => db.prepare('SELECT * FROM tv_channels' + (all ? '' : ' WHERE active = 1') + ' ORDER BY ord, id').all().map(row)
  const update = (id, b) => { const r = db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id); if (!r) return null
    db.prepare('UPDATE tv_channels SET name = ?, country = ?, active = ?, ord = ? WHERE id = ?').run(String(b.name ?? r.name).slice(0, 80) || r.name, String(b.country ?? r.country).slice(0, 60), b.active === undefined ? r.active : (b.active ? 1 : 0), Number.isFinite(+b.ord) && b.ord !== undefined ? Math.round(+b.ord) : r.ord, id); return row(db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id)) }
  const remove = id => db.prepare('DELETE FROM tv_channels WHERE id = ?').run(id).changes

  // ¿está transmitiendo ahora? Se mira la página /live del canal: si apunta a un video EN VIVO y YouTube deja incrustarlo, se guarda su número; si no, queda «sin transmisión».
  // Si no se puede comprobar (red, YouTube), queda «sin saber» y el reproductor prueba el canal igual.
  async function check(r) {
    if (!/^UC[\w-]{22}$/.test(r.yt_channel || '')) return { live: null }
    try {
      const html = await page('https://www.youtube.com/channel/' + r.yt_channel + '/live')
      const v = /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})/i.exec(html)?.[1]
      if (!v || !/"isLiveNow":\s*true|"isLive":\s*true/.test(html)) return { live: false }
      try { await oembed(v) } catch (e) { if (/permite|no existe/.test(e.message)) return { live: false, motivo: e.message }; throw e }
      return { live: true, video: v }
    } catch (e) { return { live: null, error: e.message } }
  }
  async function recheck(id) {
    const r = db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id); if (!r) return null
    const c = await check(r)
    if (c.live === null) db.prepare('UPDATE tv_channels SET checked_at = ? WHERE id = ?').run(now(), id)
    else db.prepare('UPDATE tv_channels SET live = ?, yt_video = COALESCE(?, yt_video), checked_at = ? WHERE id = ?').run(c.live ? 1 : 0, c.video || null, now(), id)
    return { ...row(db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id)), error: c.error || c.motivo || '' }
  }
  let busy = false
  async function refreshAll() {
    if (busy) return; busy = true
    try { for (const r of db.prepare('SELECT id FROM tv_channels WHERE active = 1').all()) { await recheck(r.id); await new Promise(x => setTimeout(x, 1500)) } } finally { busy = false }
  }
  setTimeout(() => refreshAll().catch(() => {}), 60e3).unref(); setInterval(() => refreshAll().catch(() => {}), 15 * 60e3).unref()
  return { detect, add, list, update, remove, parse, recheck, refreshAll }
}

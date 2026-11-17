// Canales de televisión en vivo desde YouTube. Se pega un enlace (video en vivo, canal o @usuario) y la web detecta sola el canal, su nombre,
// su logo y si YouTube permite mostrarlo en otras páginas. Se guarda el CANAL (no el video), así siempre muestra lo que esté en vivo.
// El video lo sirve YouTube con su reproductor oficial: tu servidor no transmite nada.
module.exports = function tv({ db, now, putImage }) {
  db.exec('CREATE TABLE IF NOT EXISTS tv_channels (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL DEFAULT \'\', yt_channel TEXT, yt_video TEXT, logo TEXT, active INTEGER NOT NULL DEFAULT 1, ord INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)')
  const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0', 'Accept-Language': 'es-419,es;q=0.9,en;q=0.5', Cookie: 'SOCS=CAI; CONSENT=PENDING+987' }
  const HOSTS = /^(www\.|m\.)?youtube\.com$|^youtu\.be$/
  const unesc = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\u0026/g, '&')
  async function page(url) {
    const x = new URL(url); if (x.protocol !== 'https:' || !HOSTS.test(x.hostname)) throw new Error('Solo se aceptan enlaces de YouTube.')
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(12000) })
    if (/(^|\.)consent\.youtube\.com$/.test(new URL(r.url || url).hostname)) throw new Error('YouTube pidió aceptar cookies antes de mostrar la página')
    if (!r.ok) throw new Error('YouTube respondió ' + r.status)
    const t = (await r.text()).slice(0, 1_800_000)
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
  const chanId = html => /"channelId":"(UC[\w-]{22})"/.exec(html)?.[1] || /"externalId":"(UC[\w-]{22})"/.exec(html)?.[1] || /"browseId":"(UC[\w-]{22})"/.exec(html)?.[1] || /feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/.exec(html)?.[1] || /"channelUrl":"https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html)?.[1] || /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})/i.exec(html)?.[1] || /itemprop=["']identifier["'][^>]+content=["'](UC[\w-]{22})/i.exec(html)?.[1] || ''
  async function oembed(id) {   // dice si YouTube deja mostrar ese video en otras páginas (200 sí, 401 no, 404 no existe)
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { headers: { 'User-Agent': UA['User-Agent'] }, signal: AbortSignal.timeout(10000) })
    if (r.status === 401 || r.status === 403) throw new Error('Ese canal no permite mostrar su transmisión en otras páginas.')
    if (r.status === 404) throw new Error('Ese video no existe o es privado.')
    if (!r.ok) throw new Error('YouTube respondió ' + r.status)
    return r.json()
  }
  // Detecta todo a partir del enlace pegado. No guarda nada.
  async function detect(input) {
    const p = parse(input); if (!p) throw new Error('Pega un enlace de YouTube: un video en vivo, la página del canal o su @usuario.')
    const out = { name: '', channel: '', video: '', logo: '', country: '', warn: [] }
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
      } catch (e) { why.push(u.replace('https://www.youtube.com', '') + ': ' + e.message) }
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
  const row = r => ({ id: r.id, name: r.name, country: r.country, channel: r.yt_channel, video: r.yt_video, logo: r.logo, active: !!r.active, ord: r.ord })
  async function add(input, { name, country } = {}) {
    const d = await detect(input)
    if (db.prepare('SELECT 1 FROM tv_channels WHERE (yt_channel = ? AND yt_channel != \'\') OR (yt_video = ? AND yt_video != \'\')').get(d.channel || '', d.video || '')) throw new Error('Ese canal ya está en la lista.')
    let logo = d.logo || null; if (logo && putImage) { try { logo = await putImage(logo, 'tv') } catch { logo = null } }
    const ord = (db.prepare('SELECT COALESCE(MAX(ord), 0) m FROM tv_channels').get().m || 0) + 1
    const r = db.prepare('INSERT INTO tv_channels (name, country, yt_channel, yt_video, logo, active, ord, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(String(name || d.name || 'Canal').slice(0, 80), String(country || d.country || '').slice(0, 60), d.channel || '', d.video || '', logo, ord, now())
    return { ...row(db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(Number(r.lastInsertRowid))), warn: d.warn }
  }
  const list = all => db.prepare('SELECT * FROM tv_channels' + (all ? '' : ' WHERE active = 1') + ' ORDER BY ord, id').all().map(row)
  const update = (id, b) => { const r = db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id); if (!r) return null
    db.prepare('UPDATE tv_channels SET name = ?, country = ?, active = ?, ord = ? WHERE id = ?').run(String(b.name ?? r.name).slice(0, 80) || r.name, String(b.country ?? r.country).slice(0, 60), b.active === undefined ? r.active : (b.active ? 1 : 0), Number.isFinite(+b.ord) && b.ord !== undefined ? Math.round(+b.ord) : r.ord, id); return row(db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id)) }
  const remove = id => db.prepare('DELETE FROM tv_channels WHERE id = ?').run(id).changes
  return { detect, add, list, update, remove, parse }
}

// Canales de televisión en vivo desde YouTube, Twitch y Kick. Se pega un enlace (video en vivo, canal o @usuario) y la web detecta sola el canal, su nombre,
// su logo y si YouTube permite mostrarlo en otras páginas. Se guarda el CANAL (no el video), así siempre muestra lo que esté en vivo.
// El video lo sirve YouTube con su reproductor oficial: tu servidor no transmite nada.
module.exports = function tv({ db, now, putImage, secret }) {
  db.exec('CREATE TABLE IF NOT EXISTS tv_channels (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL DEFAULT \'\', yt_channel TEXT, yt_video TEXT, logo TEXT, active INTEGER NOT NULL DEFAULT 1, ord INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)')
  for (const c of ['live INTEGER', 'checked_at INTEGER', "platform TEXT NOT NULL DEFAULT 'youtube'", 'slug TEXT']) { try { db.exec('ALTER TABLE tv_channels ADD COLUMN ' + c) } catch { /* ya existe */ } }
  const UA = {}   // sin cabeceras de navegador inventadas: YouTube corta esas conexiones desde un servidor (con las de Node sin tocar, responde 200)
  const HOSTS = /^(www\.|m\.)?youtube\.com$|^youtu\.be$/
  const unesc = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\\u0026/g, '&')
  async function page(url) {
    const x = new URL(url); if (x.protocol !== 'https:' || !HOSTS.test(x.hostname)) throw new Error('Solo se aceptan enlaces de YouTube.')
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(12000) })
    if (/(^|\.)consent\.youtube\.com$/.test(new URL(r.url || url).hostname)) throw new Error('YouTube pidió aceptar cookies antes de mostrar la página')
    if (r.status === 429) throw new Error('YouTube limitó las consultas desde tu servidor (demasiadas seguidas). Espera unos minutos o configura la llave de la API de YouTube en «Pagos y Google».')
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
    if (r.status === 429) throw new Error('YouTube limitó las consultas desde tu servidor (demasiadas seguidas). Espera unos minutos o configura la llave de la API de YouTube en «Pagos y Google».')
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
      if (v.status?.embeddable === false) { out.noEmbed = true; out.warn.push('YouTube indica que esa transmisión no se puede incrustar en otras páginas. El canal se guardó igual; revísalo con «Revisar».') }
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
      if (id) { const v = (await yt('videos', { part: 'status', id })).items?.[0]; if (v?.status?.embeddable === false) { out.noEmbed = true; out.warn.push('YouTube indica que esa transmisión no se puede incrustar en otras páginas. El canal se guardó igual; revísalo con «Revisar».') } out.video = id }
      else out.warn.push('Ahora mismo no está transmitiendo en vivo.')
    }
    return out
  }

  // ---- Twitch y Kick: se pega el enlace del canal (twitch.tv/nombre o kick.com/nombre). Los reproductores son los oficiales de cada plataforma ----
  const TW_RESERVED = new Set(['videos', 'directory', 'downloads', 'jobs', 'turbo', 'settings', 'p', 'search', 'login', 'signup', 'popout', 'embed', 'moderator', 'subscriptions', 'friends', 'wallet', 'drops'])
  const KICK_RESERVED = new Set(['api', 'categories', 'video', 'videos', 'search', 'browse', 'following', 'dashboard', 'terms-of-service', 'privacy-policy'])
  function parseLive(u) {
    u = String(u || '').trim(); let m
    if ((m = /^(?:https?:\/\/)?(?:www\.|m\.|player\.)?twitch\.tv\/(?:\?(?:.*&)?channel=)?([A-Za-z0-9_]{3,25})(?:[/?#&]|$)/i.exec(u)) && !TW_RESERVED.has(m[1].toLowerCase())) return { platform: 'twitch', slug: m[1].toLowerCase() }
    if ((m = /^(?:https?:\/\/)?(?:www\.|player\.)?kick\.com\/([A-Za-z0-9_-]{2,25})(?:[/?#&]|$)/i.exec(u)) && !KICK_RESERVED.has(m[1].toLowerCase())) return { platform: 'kick', slug: m[1].toLowerCase() }
    return null
  }
  // Twitch: con llave gratis (Client ID y Secret de dev.twitch.tv) se sabe el nombre, el logo y si está en vivo; sin llave igual se agrega y el reproductor muestra su estado.
  let twTok = { t: '', exp: 0 }
  const twKeys = () => (secret && { id: secret('twitch', 'clientId'), sec: secret('twitch', 'clientSecret') }) || {}
  async function twFetch(path) {
    const { id, sec } = twKeys(); if (!id || !sec) return null
    if (!twTok.t || twTok.exp < now() + 60e3) {
      const r = await fetch('https://id.twitch.tv/oauth2/token?client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(sec) + '&grant_type=client_credentials', { method: 'POST', signal: AbortSignal.timeout(10000) })
      const d = await r.json().catch(() => ({})); if (!r.ok || !d.access_token) throw new Error('Twitch rechazó la llave (' + (d.message || r.status) + ')')
      twTok = { t: d.access_token, exp: now() + (+d.expires_in || 3600) * 1000 }
    }
    const r = await fetch('https://api.twitch.tv/helix/' + path, { headers: { 'Client-Id': id, Authorization: 'Bearer ' + twTok.t }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Twitch respondió ' + r.status); return r.json()
  }
  async function liveStatus(platform, slug) {   // { live: true|false|null, name?, logo? }
    if (platform === 'twitch') {
      const k = twKeys(); if (!k.id || !k.sec) return { live: null }
      const u = (await twFetch('users?login=' + encodeURIComponent(slug)))?.data?.[0]; if (!u) throw new Error('No encontré ese canal en Twitch.')
      const st = (await twFetch('streams?user_login=' + encodeURIComponent(slug)))?.data?.[0]
      return { live: !!st && st.type === 'live', name: u.display_name, logo: u.profile_image_url }
    }
    try {   // Kick no ofrece una consulta pública estable; se prueba y, si no responde, queda «sin saber»
      const r = await fetch('https://kick.com/api/v2/channels/' + encodeURIComponent(slug), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
      if (!r.ok) return { live: null }
      const d = await r.json(); return { live: !!d.livestream, name: d.user?.username, logo: d.user?.profile_pic }
    } catch { return { live: null } }
  }
  // Detecta todo a partir del enlace pegado. No guarda nada.
  async function detect(input) {
    const pl = parseLive(input)
    if (pl) { const st = await liveStatus(pl.platform, pl.slug).catch(e => { if (/No encontré/.test(e.message)) throw e; return { live: null, err: e.message } }); return { platform: pl.platform, slug: pl.slug, name: st.name || pl.slug, channel: '', video: '', logo: st.logo || '', country: '', live: st.live, warn: [...(st.live === null ? ['No se pudo comprobar si está en vivo: el reproductor mostrará su estado.'] : []), ...(st.err ? ['(' + st.err + ')'] : [])] } }
    const p = parse(input); if (!p) throw new Error('Pega un enlace de YouTube (video en vivo, canal o @usuario), de Twitch (twitch.tv/nombre) o de Kick (kick.com/nombre).')
    let viaApi = null
    if (apiKey()) { try { return await detectApi(p) } catch (e) { if (/permite|no existe|no encontré|no se reconoce/.test(e.message)) throw e; viaApi = e.message } }   // si la API falla (cupo, llave) se sigue con la lectura de la página
    const out = { name: '', channel: '', video: '', logo: '', country: '', warn: viaApi ? [viaApi + '. Se intentó leer la página.'] : [] }
    let pageUrl = ''
    if (p.kind === 'video') {
      out.video = p.id
      try { const o = await oembed(p.id); out.name = String(o.author_name || o.title || '').slice(0, 80); pageUrl = o.author_url }
      catch (e) {
        if (!/permite/.test(e.message)) throw e
        out.noEmbed = true; out.warn.push('YouTube indica que esa transmisión no se puede incrustar en otras páginas. El canal se guardó igual; revísalo con «Revisar».')   // no se rechaza: se intenta sacar el canal de la propia página del video
        try { const html = await page('https://www.youtube.com/watch?v=' + p.id); out.channel = /"channelId":"(UC[\w-]{22})"/.exec(html)?.[1] || ''; out.name = unesc(/<link itemprop="name" content="([^"]*)"/.exec(html)?.[1] || '').slice(0, 80); if (out.channel) pageUrl = 'https://www.youtube.com/channel/' + out.channel } catch { /* se sigue con lo que haya */ }
      }
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
      try { const html = await page('https://www.youtube.com/channel/' + out.channel + '/live'); const v = /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})/i.exec(html)?.[1]; if (v) { out.video = v; try { await oembed(v) } catch (e) { if (/permite/.test(e.message)) { out.noEmbed = true; out.warn.push('YouTube indica que esa transmisión no se puede incrustar en otras páginas. El canal se guardó igual; revísalo con «Revisar».') } else throw e } } else out.warn.push('Ahora mismo no está transmitiendo en vivo.') }
      catch (e) { out.warn.push('No pude comprobar si está en vivo (' + e.message + ').') }
    }
    return out
  }
  const row = r => ({ id: r.id, name: r.name, country: r.country, channel: r.yt_channel, video: r.yt_video, logo: r.logo, active: !!r.active, ord: r.ord, live: r.live == null ? null : !!r.live, checked: r.checked_at || 0, platform: r.platform || 'youtube', slug: r.slug || '' })
  async function add(input, { name, country } = {}) {
    const d = await detect(input)
    const plat = d.platform || 'youtube'
    if (plat !== 'youtube') { if (db.prepare('SELECT 1 FROM tv_channels WHERE platform = ? AND slug = ?').get(plat, d.slug)) throw new Error('Ese canal ya está en la lista.') }
    else {
      const ex = db.prepare('SELECT * FROM tv_channels WHERE (yt_channel = ? AND yt_channel != \'\') OR (yt_video = ? AND yt_video != \'\')').get(d.channel || '', d.video || '')
      if (ex) {   // ya estaba: si este enlace trae más datos (el video en vivo, el canal correcto) se actualiza en vez de rechazarlo
        db.prepare('UPDATE tv_channels SET yt_channel = COALESCE(NULLIF(?, \'\'), yt_channel), yt_video = COALESCE(NULLIF(?, \'\'), yt_video), live = ?, checked_at = ? WHERE id = ?').run(d.channel || '', d.video || '', d.noEmbed ? 0 : d.video ? 1 : ex.live, now(), ex.id)
        return { ...row(db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(ex.id)), warn: ['Ya estaba en la lista: se actualizó con este enlace.', ...d.warn] }
      }
    }
    let logo = d.logo || null; if (logo && putImage) { try { logo = await putImage(logo, 'tv') } catch { logo = null } }
    const ord = (db.prepare('SELECT COALESCE(MAX(ord), 0) m FROM tv_channels').get().m || 0) + 1, live0 = plat !== 'youtube' ? (d.live === null || d.live === undefined ? null : d.live ? 1 : 0) : (d.noEmbed ? 0 : d.video && d.channel ? 1 : null)
    const r = db.prepare('INSERT INTO tv_channels (name, country, yt_channel, yt_video, logo, active, ord, created_at, live, checked_at, platform, slug) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)').run(String(name || d.name || 'Canal').slice(0, 80), String(country || d.country || '').slice(0, 60), d.channel || '', d.video || '', logo, ord, now(), live0, now(), plat, plat === 'youtube' ? null : d.slug)
    return { ...row(db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(Number(r.lastInsertRowid))), warn: d.warn }
  }
  const list = all => db.prepare('SELECT * FROM tv_channels' + (all ? '' : ' WHERE active = 1') + ' ORDER BY ord, id').all().map(row)
  const update = (id, b) => { const r = db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id); if (!r) return null
    db.prepare('UPDATE tv_channels SET name = ?, country = ?, active = ?, ord = ? WHERE id = ?').run(String(b.name ?? r.name).slice(0, 80) || r.name, String(b.country ?? r.country).slice(0, 60), b.active === undefined ? r.active : (b.active ? 1 : 0), Number.isFinite(+b.ord) && b.ord !== undefined ? Math.round(+b.ord) : r.ord, id); return row(db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id)) }
  const remove = id => db.prepare('DELETE FROM tv_channels WHERE id = ?').run(id).changes

  // ¿está transmitiendo ahora? Se miran DOS señales: la página /live del canal y, si ya se conoce, el último video en vivo guardado (los canales de TV de 24 horas suelen mantener el mismo).
  // Solo se afirma «en vivo» cuando YouTube lo marca. Si no se puede confirmar queda «sin saber» (nunca se afirma que no transmite): el reproductor prueba el canal igual.
  // Además se autocorrige el identificador del canal con el dueño real del video en vivo.
  const isLive = html => /"isLiveNow":\s*true|"isLive":\s*true|BADGE_STYLE_TYPE_LIVE_NOW/.test(html)
  async function check(r) {
    if (r.platform === 'twitch' || r.platform === 'kick') { try { const st = await liveStatus(r.platform, r.slug); return { live: st.live } } catch (e) { return { live: null, error: e.message } } }
    let motivo = '', error = ''
    if (/^UC[\w-]{22}$/.test(r.yt_channel || '')) {
      try {
        const html = await page('https://www.youtube.com/channel/' + r.yt_channel + '/live')
        const v = /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})/i.exec(html)?.[1]
        if (v && isLive(html)) { try { await oembed(v); return { live: true, video: v } } catch (e) { if (/permite|no existe/.test(e.message)) motivo = e.message; else throw e } }
      } catch (e) { error = e.message }
    }
    if (/^[\w-]{11}$/.test(r.yt_video || '')) {
      try {
        const html = await page('https://www.youtube.com/watch?v=' + r.yt_video)
        if (isLive(html)) {
          try { await oembed(r.yt_video) } catch (e) { if (/permite/.test(e.message)) return { live: false, motivo: e.message }; throw e }
          const dueno = /"channelId":"(UC[\w-]{22})"/.exec(html)?.[1]
          return { live: true, video: r.yt_video, canal: dueno && dueno !== r.yt_channel ? dueno : undefined }
        }
      } catch (e) { error = error || e.message }
    }
    return motivo ? { live: false, motivo } : { live: null, error }
  }
  async function recheck(id) {
    const r = db.prepare('SELECT * FROM tv_channels WHERE id = ?').get(id); if (!r) return null
    const c = await check(r)
    if (c.canal) db.prepare('UPDATE tv_channels SET yt_channel = ? WHERE id = ?').run(c.canal, id)   // el dueño real del video en vivo manda
    if (c.live === null) db.prepare('UPDATE tv_channels SET live = NULL, checked_at = ? WHERE id = ?').run(now(), id)   // sin confirmar: no se afirma nada
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

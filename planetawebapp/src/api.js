async function req(method, url, body) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  let data = {}; try { data = await r.json() } catch {}
  if (!r.ok) throw Object.assign(new Error(data.error || 'No se pudo conectar con el servidor. Revisa tu conexión.'), { status: r.status })
  return data
}
export const api = {
  me: () => req('GET', '/api/me'),
  register: b => req('POST', '/api/register', b),
  login: b => req('POST', '/api/login', b),
  logout: () => req('POST', '/api/logout'),
  posts: () => req('GET', '/api/posts'),
  post: id => req('GET', `/api/posts/${id}`),
  create: b => req('POST', '/api/posts', b),
  remove: id => req('DELETE', `/api/posts/${id}`),
  toggle: (id, what) => req('POST', `/api/posts/${id}/${what}`),
  comment: (id, text) => req('POST', `/api/posts/${id}/comments`, { text }),
  people: () => req('GET', '/api/people'),
  activity: () => req('GET', '/api/activity'),
  chats: () => req('GET', '/api/chats'),
  chat: id => req('GET', `/api/chats/${id}`),
  sendMsg: (id, text) => req('POST', `/api/chats/${id}`, { text }),
  room: city => req('GET', `/api/rooms/${encodeURIComponent(city)}`),
  roomSend: (city, text) => req('POST', `/api/rooms/${encodeURIComponent(city)}`, { text }),
  follows: () => req('GET', '/api/follows'),
  follow: (kind, value) => req('POST', '/api/follows', { kind, value }),
  stats: () => req('GET', '/api/stats'),
  report: (id, reason) => req('POST', `/api/posts/${id}/report`, { reason }),
}
// Resize photos in the browser before upload (max 1600px, JPEG)
export function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.85)) }
    img.onerror = () => reject(new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.'))
    img.src = url
  })
}

// ---- media upload: ask the server for a one-time upload URL, then PUT the file there (R2 or local) ----
api.posts = (before) => req('GET', '/api/posts' + (before ? '?before=' + before : ''))
export function uploadFile(blob, kind, extra = {}, onProgress) {
  return req('POST', '/api/upload', { kind, contentType: blob.type, size: blob.size, ...extra }).then(t => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('PUT', t.uploadUrl)
    for (const [k, v] of Object.entries(t.headers || {})) x.setRequestHeader(k, v)
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total)
    x.onload = () => x.status < 300 ? resolve(t.url) : reject(new Error('No se pudo subir el archivo (' + x.status + '). Inténtalo de nuevo.'))
    x.onerror = () => reject(new Error('Se cortó la conexión al subir el archivo. Inténtalo de nuevo.'))
    x.send(blob)
  }))
}
const toBlob = (canvas, q = 0.85) => new Promise(r => canvas.toBlob(r, 'image/jpeg', q))
function drawScaled(src, w, h, max) { const k = Math.min(1, max / Math.max(w, h)); const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c }
// Photo -> full (1600px) + thumbnail (480px), both JPEG
export function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = async () => { const full = await toBlob(drawScaled(img, img.width, img.height, 1600)); const thumb = await toBlob(drawScaled(img, img.width, img.height, 480), 0.8); URL.revokeObjectURL(url); resolve({ kind: 'image', full, thumb, preview: URL.createObjectURL(full) }) }
    img.onerror = () => reject(new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.'))
    img.src = url
  })
}
// Video -> checks duration/size/format and grabs a poster frame as thumbnail
export function prepareVideo(file, maxSeconds = 60) {
  return new Promise((resolve, reject) => {
    if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) return reject(new Error('Formato de video no permitido. Usa MP4, MOV o WEBM.'))
    if (file.size > 60e6) return reject(new Error('El video pesa ' + Math.round(file.size / 1e6) + ' MB. El máximo es 60 MB.'))
    const v = document.createElement('video'), url = URL.createObjectURL(file)
    v.preload = 'metadata'; v.muted = true; v.playsInline = true
    v.onloadedmetadata = () => {
      if (!isFinite(v.duration)) return reject(new Error('No se pudo leer la duración del video.'))
      if (v.duration > maxSeconds + 0.5) { URL.revokeObjectURL(url); return reject(new Error(`El video dura ${Math.round(v.duration)} segundos. El máximo es ${maxSeconds}. Recórtalo e inténtalo de nuevo.`)) }
      v.currentTime = Math.min(1, v.duration / 2)
    }
    v.onseeked = async () => { const thumb = await toBlob(drawScaled(v, v.videoWidth, v.videoHeight, 480), 0.8); resolve({ kind: 'video', full: file, thumb, duration: v.duration, preview: url }) }
    v.onerror = () => reject(new Error('No se pudo leer el video. Prueba con un MP4.'))
    v.src = url
  })
}
// Upload a prepared media item; returns fields for the post
export async function uploadMedia(m, onProgress) {
  if (!m) return {}
  const thumb = await uploadFile(m.thumb, 'thumb')
  if (m.kind === 'video') return { video: await uploadFile(m.full, 'video', { duration: m.duration }, onProgress), thumb, duration: m.duration }
  return { image: await uploadFile(m.full, 'image', {}, onProgress), thumb }
}

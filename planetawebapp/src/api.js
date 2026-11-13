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

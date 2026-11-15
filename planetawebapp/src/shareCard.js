// Tarjeta del partido para compartir en redes (1080x1350, formato 4:5).
// Se dibuja en el navegador de quien la pide: no gasta CPU, RAM ni consultas del servidor.
const W = 1080, H = 1350, TEAL = '#5ccfb4', RED = '#ff5a62'
const LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'], DONE = ['FT', 'AET', 'PEN', 'AWD', 'WO']
const FONT = 'Manrope, system-ui, -apple-system, Segoe UI, sans-serif'

// imagen del mismo sitio o con permiso (CORS); si no se puede usar sin «ensuciar» el lienzo, devuelve null y se dibujan las iniciales
const loadImg = src => new Promise(res => { if (!src) return res(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src })

// texto con separación entre letras (hecho a mano para que funcione en todos los navegadores)
function txt(c, s, x, y, { size, weight = 600, color = '#fff', align = 'left', sp = 0, max = 0 }) {
  s = String(s ?? ''); let sz = size
  c.font = `${weight} ${sz}px ${FONT}`
  if (max) { while (sz > 18 && textWidth(c, s, sp) > max) { sz -= 2; c.font = `${weight} ${sz}px ${FONT}` } }
  c.fillStyle = color; c.textBaseline = 'alphabetic'
  if (!sp) { c.textAlign = align; c.fillText(s, x, y); return }
  const chars = [...s], ws = chars.map(ch => c.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  c.textAlign = 'left'; chars.forEach((ch, i) => { c.fillText(ch, cx, y); cx += ws[i] + sp })
}
const textWidth = (c, s, sp) => sp ? [...s].reduce((a, ch) => a + c.measureText(ch).width + sp, -sp) : c.measureText(s).width

function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }

function background(c) {
  c.fillStyle = '#0a1d10'; c.fillRect(0, 0, W, H)
  const g = c.createRadialGradient(540, 607, 0, 540, 607, 760); g.addColorStop(0, '#2b6a30'); g.addColorStop(0.65, '#14341a'); g.addColorStop(1, '#0a1c0f'); c.fillStyle = g; c.fillRect(0, 0, W, H)
  c.save(); c.globalAlpha = 0.03; c.fillStyle = '#fff'; for (let y = 0; y < H; y += 11) c.fillRect(0, y, W, 3); c.restore()      // trama del pasto
  // franja clara de la cancha (como en la tarjeta de la web)
  c.save(); c.translate(540, 620); c.rotate(-13 * Math.PI / 180)
  const b = c.createLinearGradient(0, -170, 0, 170); b.addColorStop(0, 'rgba(255,255,255,0)'); b.addColorStop(0.5, 'rgba(255,255,255,0.30)'); b.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = b; c.fillRect(-900, -170, 1800, 340); c.restore()
  const s = c.createLinearGradient(0, 0, 0, H); s.addColorStop(0, 'rgba(4,10,6,.77)'); s.addColorStop(0.3, 'rgba(4,10,6,.40)'); s.addColorStop(0.6, 'rgba(4,10,6,.33)'); s.addColorStop(1, 'rgba(4,10,6,.88)'); c.fillStyle = s; c.fillRect(0, 0, W, H)
}

function crest(c, img, name, cx) {
  const top = 450, bw = 210, bh = 240
  c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 26; c.shadowOffsetY = 16
  if (img) { const r = Math.min(bw / img.width, bh / img.height), w = img.width * r, h = img.height * r; c.drawImage(img, cx - w / 2, top + (bh - h) / 2, w, h); c.restore() }
  else { c.beginPath(); c.arc(cx, top + bh / 2, 100, 0, Math.PI * 2); c.fillStyle = '#1d3b52'; c.fill(); c.restore(); txt(c, String(name).split(/\s+/).map(w => w[0]).slice(0, 3).join('').toUpperCase(), cx, top + bh / 2 + 22, { size: 62, weight: 800, align: 'center' }) }
}

const fechaLarga = ms => new Date(ms).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const horaCorta = ms => new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
const esHoy = ms => new Date(ms).toDateString() === new Date().toDateString()

// m = datos del partido (post.match). goal = { team, player, min, own } cuando viene del aviso de gol. site = { name, logoDark, logoLight }
export async function matchCardBlob({ m, city, site = {}, goal }) {
  try { await Promise.all(['500 20px', '700 20px', '800 20px'].map(f => document.fonts.load(`${f} Manrope`))) } catch { /* se usa la fuente de respaldo */ }
  const [logo, ihome, iaway] = await Promise.all([loadImg(site.logoDark || site.logoLight), loadImg(m.hl), loadImg(m.al)])
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')
  background(c)
  const live = LIVE.includes(m.st), done = DONE.includes(m.st)
  const goals = (m.ev || []).filter(e => e.type === 'Goal' && e.d !== 'Missed Penalty'), last = goals[goals.length - 1]
  const isGoal = !!goal || (live && last && (m.el || 0) - (last.t || 0) <= 3)
  const gl = goal || (isGoal ? { team: last.team, player: last.p, min: last.t, own: last.d === 'Own Goal' } : null)
  // textos según el momento
  let tag, status, statusColor, head, sub
  const venue = [m.venue, city].filter(Boolean).join(' · ')
  if (isGoal) { tag = 'EN VIVO'; status = `GOL · ${gl.min || m.el || ''}'`; statusColor = TEAL; head = gl.player ? `${gl.player} · ${gl.min}'${gl.own ? ' · en contra' : ''}` : `Gol de ${gl.team}`; sub = venue }
  else if (live) { tag = 'EN VIVO'; status = m.st === 'HT' ? 'ENTRETIEMPO' : `EN VIVO · ${m.el || 0}'`; statusColor = RED; head = last ? `Gol de ${last.team} · ${last.p ? last.p + ' ' : ''}${last.t}'` : `${m.h} ${m.gh ?? 0} - ${m.ga ?? 0} ${m.a}`; sub = venue }
  else if (done) { tag = 'FINAL'; status = 'FINAL'; statusColor = '#c3cbc6'; head = `${m.h} ${m.gh ?? 0} - ${m.ga ?? 0} ${m.a}`; sub = [m.venue, fechaLarga(m.ko)].filter(Boolean).join(' · ') }
  else { tag = esHoy(m.ko) ? 'HOY' : fechaLarga(m.ko).split(',')[0].toUpperCase(); status = horaCorta(m.ko); statusColor = TEAL; head = `${m.h} vs ${m.a}`; sub = venue }
  // encabezado: logo y etiqueta
  if (logo) { const h = 54, w = logo.width * h / logo.height; c.drawImage(logo, 80, 74, Math.min(w, 420), h * Math.min(1, 420 / w)) }
  else txt(c, site.name || 'Worbita.com', 80, 120, { size: 44, weight: 800 })
  const tw = textWidth((c.font = `700 24px ${FONT}`, c), tag, 3) + 56 + (tag === 'EN VIVO' ? 28 : 0), tx = 1000 - tw
  c.save(); roundRect(c, tx, 80, tw, 58, 29); c.lineWidth = 2; c.strokeStyle = tag === 'EN VIVO' ? 'rgba(255,77,87,.67)' : 'rgba(255,255,255,.22)'; if (tag === 'EN VIVO') { c.fillStyle = 'rgba(255,77,87,.13)'; c.fill() } c.stroke(); c.restore()
  if (tag === 'EN VIVO') { c.beginPath(); c.arc(tx + 38, 109, 6, 0, Math.PI * 2); c.fillStyle = '#ff4d57'; c.fill() }
  txt(c, tag, tx + (tag === 'EN VIVO' ? 64 : 28), 117, { size: 24, weight: 700, sp: 3 })
  // liga, escudos, marcador
  txt(c, String(m.league || '').toUpperCase(), 540, 358, { size: 26, weight: 700, color: 'rgba(216,224,218,.85)', align: 'center', sp: 7, max: 900 })
  crest(c, ihome, m.h, 225); crest(c, iaway, m.a, 855)
  txt(c, m.h, 225, 765, { size: 36, weight: 700, align: 'center', max: 290 }); txt(c, m.a, 855, 765, { size: 36, weight: 700, align: 'center', max: 290 })
  if (live || done) { txt(c, String(m.gh ?? 0), 450, 632, { size: 150, weight: 800, align: 'center' }); txt(c, String(m.ga ?? 0), 630, 632, { size: 150, weight: 800, align: 'center' }); c.fillStyle = 'rgba(185,196,189,.9)'; roundRect(c, 516, 575, 48, 9, 4.5); c.fill() }
  else txt(c, 'VS', 540, 620, { size: 110, weight: 800, color: '#b9c4bd', align: 'center' })
  txt(c, status, 540, 698, { size: 30, weight: 800, color: statusColor, align: 'center', sp: 1 })
  // información
  c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(80, 905, 920, 1)
  txt(c, head, 540, 1000, { size: 46, weight: 800, align: 'center', max: 920 })
  txt(c, sub, 540, 1052, { size: 28, weight: 500, color: '#b9c4bd', align: 'center', max: 920 })
  // pie
  txt(c, 'Míralo en vivo', 80, 1265, { size: 28, weight: 600, color: '#aeb9b2' })
  txt(c, location.host.replace(/^www\./, ''), 1000, 1265, { size: 32, weight: 800, align: 'right' })
  return await new Promise((ok, bad) => cv.toBlob(b => b ? ok(b) : bad(new Error('No se pudo crear la imagen.')), 'image/jpeg', 0.93))
}

// comparte la imagen con el menú del teléfono (Instagram, WhatsApp, etc.); si el navegador no lo permite, la descarga
export async function shareMatchCard(args, { url, text }) {
  const blob = await matchCardBlob(args), file = new File([blob], 'partido-worbita.jpg', { type: 'image/jpeg' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: `${text}\n${url}` }); return 'shared' } catch (e) { if (e && e.name === 'AbortError') return 'cancel' }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'partido-worbita.jpg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  return 'download'
}

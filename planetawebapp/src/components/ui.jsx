import { useEffect, useRef, useState } from 'react'
import { SCENES, PHOTOS, avatarUrl } from '../data'
import { TYPE } from '../util'
export function Avatar({ name = '', hue = 160, size = 36, ring, src: own }) {
  const [err, setErr] = useState(false)
  const ini = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const src = own || avatarUrl(name)
  return <div className={'avatar' + (ring ? ' ring' : '')} style={{ width: size, height: size, fontSize: size * .36, background: `linear-gradient(135deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 40% 26%))` }}>
    {src && !err ? <img src={src} alt="" onError={() => setErr(true)} loading="lazy" /> : ini}</div>
}
// small: lists, pins, stories (uses the thumbnail). play: show the video (autoplays muted while visible)
const LIVE_ST = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'], DONE_ST = ['FT', 'AET', 'PEN', 'AWD', 'WO']
// afiche del partido: los dos escudos, marcador u hora, liga y estadio
function MatchCard({ m, h, radius, children }) {
  const live = LIVE_ST.includes(m.st), done = DONE_ST.includes(m.st), ok = u => /^https:\/\//.test(u || '')
  const when = new Date(m.ko).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return <div className="media match-card" style={{ height: h, borderRadius: radius, backgroundImage: `linear-gradient(180deg,#05080dcc,#05080d99 40%,#05080de6),url('${(PHOTOS.estadio || '').replace('w=1200', 'w=800')}')` }}>
    <div className="mc-league">{m.league}</div>
    <div className="mc-row">
      <div className="mc-team">{ok(m.hl) && <img src={m.hl} alt="" />}<b>{m.h}</b></div>
      <div className="mc-mid">{live || done ? <span className="mc-score">{m.gh ?? 0} - {m.ga ?? 0}</span> : <span className="mc-vs">VS</span>}
        <small className={live ? 'mc-live' : ''}>{live ? (m.st === 'HT' ? 'Entretiempo' : 'EN VIVO · ' + (m.el || 0) + "'") : done ? 'Final' : when}</small></div>
      <div className="mc-team">{ok(m.al) && <img src={m.al} alt="" />}<b>{m.a}</b></div>
    </div>
    {m.venue && <div className="mc-venue">{m.venue}</div>}
    {children}
  </div>
}
export function Media({ post, h = 220, radius = 14, children, small, play, controls }) {
  const [err, setErr] = useState(false)
  if (post.match && !small) return <MatchCard m={post.match} h={h} radius={radius}>{children}</MatchCard>
  let still = (small && post.thumb) || post.image || post.thumb || (!err && PHOTOS[post.scene])
  if (small && still && still.includes('images.unsplash.com')) still = still.replace('w=1200', 'w=240')
  const box = { height: h, borderRadius: radius, background: SCENES[post.scene] || SCENES.ciudad }
  if (post.video && play) return <div className="media" style={box}><AutoVideo src={post.video} poster={post.thumb} controls={controls} />{children}</div>
  return <div className="media" style={box}>
    {still && <img src={still} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} />}
    {post.video && <span className="vid-badge">▶</span>}{children}</div>
}
function AutoVideo({ src, poster, controls }) {
  const ref = useRef(null)
  useEffect(() => { const v = ref.current; if (!v || controls) return; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause() }, { threshold: 0.6 }); io.observe(v); return () => io.disconnect() }, [controls])
  return <video ref={ref} src={src} poster={poster || undefined} muted={!controls} loop={!controls} playsInline preload="metadata" controls={controls} autoPlay={controls} />
}
export function TypeTag({ type, glass }) {
  return <span className={`tag tag-${type}${glass ? ' glass' : ''}`}>{type === 'directo' && <i className="dot" />}{TYPE[type]}</span>
}

// Text with a "Traducir" link (uses the server translation; target = the viewer's language)
export function Translatable({ text, className }) {
  const [tr, setTr] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  if (!text) return null
  const go = async e => { e.stopPropagation(); if (tr) { setTr(null); return } setBusy(true); setErr('')
    try { const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, to: (navigator.language || 'es').slice(0, 2) }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setTr(d.text) } catch (x) { setErr(x.message || 'No se pudo traducir.') } finally { setBusy(false) } }
  return <span className={className}>{tr || text}<button type="button" className="tr-btn" onClick={go}>{busy ? 'Traduciendo…' : tr ? 'Ver original' : 'Traducir'}</button>{err && <span className="tr-err">{err}</span>}</span>
}

import { useEffect, useRef, useState } from 'react'
import { SCENES, PHOTOS, avatarUrl } from '../data'
import { TYPE } from '../util'
export function Avatar({ name, hue = 160, size = 36, ring }) {
  const [err, setErr] = useState(false)
  const ini = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const src = avatarUrl(name)
  return <div className={'avatar' + (ring ? ' ring' : '')} style={{ width: size, height: size, fontSize: size * .36, background: `linear-gradient(135deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 40% 26%))` }}>
    {src && !err ? <img src={src} alt="" onError={() => setErr(true)} loading="lazy" /> : ini}</div>
}
// small: lists, pins, stories (uses the thumbnail). play: show the video (autoplays muted while visible)
export function Media({ post, h = 220, radius = 14, children, small, play, controls }) {
  const [err, setErr] = useState(false)
  const still = (small && post.thumb) || post.image || post.thumb || (!err && PHOTOS[post.scene])
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

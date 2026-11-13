import { useState } from 'react'
import { SCENES, PHOTOS, avatarUrl } from '../data'
import { TYPE } from '../util'
export function Avatar({ name, hue = 160, size = 36, ring }) {
  const [err, setErr] = useState(false)
  const ini = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const src = avatarUrl(name)
  return <div className={'avatar' + (ring ? ' ring' : '')} style={{ width: size, height: size, fontSize: size * .36, background: `linear-gradient(135deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 40% 26%))` }}>
    {src && !err ? <img src={src} alt="" onError={() => setErr(true)} loading="lazy" /> : ini}</div>
}
export function Media({ post, h = 220, radius = 14, children }) {
  const [err, setErr] = useState(false)
  const src = post.image || (!err && PHOTOS[post.scene])
  return <div className="media" style={{ height: h, borderRadius: radius, background: SCENES[post.scene] || SCENES.ciudad }}>
    {src && <img src={src} alt="" loading="lazy" onError={() => setErr(true)} />}{children}</div>
}
export function TypeTag({ type, glass }) {
  return <span className={`tag tag-${type}${glass ? ' glass' : ''}`}>{type === 'directo' && <i className="dot" />}{TYPE[type]}</span>
}

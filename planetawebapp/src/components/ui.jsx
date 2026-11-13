import { SCENES } from '../data'
import { TYPE } from '../util'
export function Avatar({ name, hue = 160, size = 36 }) {
  const ini = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * .36, background: `hsl(${hue} 28% 32%)` }}>{ini}</div>
}
export function Media({ post, h = 220, radius = 14 }) {
  const style = { height: h, borderRadius: radius }
  if (post.image) return <div className="media" style={style}><img src={post.image} alt="" /></div>
  return <div className="media" style={{ ...style, background: SCENES[post.scene] || SCENES.ciudad }} />
}
export function TypeTag({ type }) {
  return <span className={`tag tag-${type}`}>{type === 'directo' && <i className="dot" />}{TYPE[type]}</span>
}

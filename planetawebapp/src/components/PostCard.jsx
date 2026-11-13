import { Heart, MessageCircle, Bookmark, MapPin, Share2, BadgeCheck, Star } from 'lucide-react'
import { Avatar, Media, TypeTag } from './ui'
import { ago, fmt } from '../util'
import { catLabel } from '../data'
const FACES = ['Laura Gil', 'Mateo Ruiz', 'Sofía León', 'Pedro Sanz']
export default function PostCard({ post, onOpen, liked, saved, onLike, onSave }) {
  return (
    <article className={'post' + (post.featured ? ' featured' : '')} onClick={() => onOpen(post)}>
      <Media post={post} h={300} radius={22} play>
        <div className="media-top"><span className="row" style={{ gap: 6 }}>{post.featured && <span className="tag feat"><Star size={10} fill="currentColor" /> Destacado</span>}<TypeTag type={post.type} glass /></span><span className="chip-glass">{catLabel(post.cat)}{post.capacity ? ` · ${post.joined ?? 0}/${post.capacity} cupos` : ''}</span></div>
        <div className="media-bottom">
          <h3>{post.title}</h3>
          <div className="media-meta"><MapPin size={13} /> {post.city} · {ago(post.at)}</div>
        </div>
      </Media>
      <div className="post-row">
        <Avatar name={post.author} hue={post.hue} size={40} src={post.avatar} />
        <div className="grow"><div className="name">{post.author}{post.author_verified && <BadgeCheck size={14} className="verified" />}</div><div className="meta">@{post.handle}</div></div>
        {post.joined != null ? <div className="stack" title={post.joined + ' se unen'}>{FACES.slice(0, 3).map(f => <Avatar key={f} name={f} size={28} />)}<span className="stack-n">+{post.joined}</span></div> : null}
      </div>
      {post.text && <p className="post-text">{post.text}</p>}
      <footer className="post-actions" onClick={e => e.stopPropagation()}>
        <button className={'act' + (liked ? ' on' : '')} onClick={() => onLike(post.id)}><Heart size={18} fill={liked ? 'currentColor' : 'none'} /><span>{fmt(post.likes)}</span></button>
        <button className="act" onClick={() => onOpen(post)}><MessageCircle size={18} /><span>{post.comment_count}</span></button>
        <button className="act" onClick={async () => { const url = location.origin + '/p/' + post.id; try { if (navigator.share) await navigator.share({ title: post.title, url }); else { await navigator.clipboard.writeText(url) } } catch {} }} aria-label="Compartir"><Share2 size={18} /></button>
        <button className={'act end' + (saved ? ' on' : '')} onClick={() => onSave(post.id)}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button>
      </footer>
    </article>
  )
}

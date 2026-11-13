import { Heart, MessageCircle, Bookmark, MapPin, Users } from 'lucide-react'
import { Avatar, Media, TypeTag } from './ui'
import { ago, fmt } from '../util'
import { catLabel } from '../data'
export default function PostCard({ post, onOpen, liked, saved, onLike, onSave }) {
  return (
    <article className="post" onClick={() => onOpen(post)}>
      <header className="post-head">
        <Avatar name={post.author} hue={post.hue} />
        <div className="grow"><div className="name">{post.author}</div>
          <div className="meta"><MapPin size={12} /> {post.city} · {ago(post.at)}</div></div>
        <TypeTag type={post.type} />
      </header>
      <Media post={post} />
      <div className="post-body">
        <div className="cat">{catLabel(post.cat)}</div>
        <h3>{post.title}</h3>
        <p>{post.text}</p>
      </div>
      <footer className="post-actions" onClick={e => e.stopPropagation()}>
        <button className={liked ? 'on' : ''} onClick={() => onLike(post.id)}><Heart size={18} fill={liked ? 'currentColor' : 'none'} />{fmt(post.likes + (liked ? 1 : 0))}</button>
        <button onClick={() => onOpen(post)}><MessageCircle size={18} />{post.comments.length}</button>
        {post.joined != null && <span className="joined"><Users size={16} />{post.joined} se unen</span>}
        <button className={'end ' + (saved ? 'on' : '')} onClick={() => onSave(post.id)}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button>
      </footer>
    </article>
  )
}

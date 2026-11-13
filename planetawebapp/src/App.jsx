import { useEffect, useMemo, useState } from 'react'
import { Globe, Newspaper, Plus, Compass, Users, Search, Bell, X, MapPin, ImagePlus, Send, ChevronLeft, MoreHorizontal, Radio, Heart, MessageCircle, Bookmark } from 'lucide-react'
import { ME, CATEGORIES, CITIES, SEED_POSTS, CONVERSATIONS, cityInfo, catLabel } from './data'
import { ago, km, fmt } from './util'
import { Avatar, Media, TypeTag } from './components/ui'
import PostCard from './components/PostCard'
import WorldMap from './components/WorldMap'

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export default function App() {
  const [tab, setTab] = useState('ahora')
  const [mine, setMine] = useState(() => load('planeta.mine', []))
  const [likes, setLikes] = useState(() => load('planeta.likes', {}))
  const [saved, setSaved] = useState(() => load('planeta.saved', {}))
  const [extraComments, setExtra] = useState(() => load('planeta.comments', {}))
  const [open, setOpen] = useState(null)
  useEffect(() => save('planeta.mine', mine), [mine]); useEffect(() => save('planeta.likes', likes), [likes])
  useEffect(() => save('planeta.saved', saved), [saved]); useEffect(() => save('planeta.comments', extraComments), [extraComments])

  const posts = useMemo(() => [...mine, ...SEED_POSTS].map(p => ({ ...p, comments: [...p.comments, ...(extraComments[p.id] || [])] })).sort((a, b) => b.at - a.at), [mine, extraComments])
  const cardProps = { onOpen: p => setOpen(p.id), onLike: id => setLikes(l => ({ ...l, [id]: !l[id] })), onSave: id => setSaved(s => ({ ...s, [id]: !s[id] })) }
  const card = p => <PostCard key={p.id} post={p} liked={!!likes[p.id]} saved={!!saved[p.id]} {...cardProps} />
  const openPost = posts.find(p => p.id === open)

  return (
    <div className="app">
      <Sidebar tab={tab} setTab={setTab} />
      <main className="screen">
        {tab === 'planeta' && <PlanetaScreen posts={posts} card={card} />}
        {tab === 'ahora' && <AhoraScreen posts={posts} card={card} />}
        {tab === 'publicar' && <PublicarScreen onCancel={() => setTab('ahora')} onPublish={p => { setMine(m => [p, ...m]); setTab('ahora') }} />}
        {tab === 'cerca' && <CercaScreen posts={posts} card={card} />}
        {tab === 'comunidad' && <ComunidadScreen posts={posts} mine={mine} saved={saved} card={card} />}
      </main>
      <Aside posts={posts} onOpen={id => setOpen(id)} goMap={() => setTab('planeta')} />
      {tab !== 'publicar' && <nav className="tabbar">
        {[['planeta', Globe, 'Planeta'], ['ahora', Newspaper, 'Ahora'], ['publicar', Plus, 'Publicar'], ['cerca', Compass, 'Cerca'], ['comunidad', Users, 'Comunidad']].map(([id, Icon, label]) =>
          <button key={id} className={(tab === id ? 'on ' : '') + (id === 'publicar' ? 'pub' : '')} onClick={() => setTab(id)}><Icon size={id === 'publicar' ? 22 : 20} strokeWidth={1.75} /><span>{label}</span></button>)}
      </nav>}
      {openPost && <PostDetail post={openPost} liked={!!likes[openPost.id]} onLike={() => cardProps.onLike(openPost.id)} saved={!!saved[openPost.id]} onSave={() => cardProps.onSave(openPost.id)}
        onClose={() => setOpen(null)} onComment={t => setExtra(c => ({ ...c, [openPost.id]: [...(c[openPost.id] || []), { a: ME.name, t }] }))} />}
    </div>
  )
}

function Header({ title, sub, right }) {
  return <header className="top"><div><div className="brand"><span className="logo" />PLANETA</div>{title && <h1>{title}</h1>}{sub && <p className="sub">{sub}</p>}</div><div className="top-r">{right ?? <><button className="icon"><Search size={19} /></button><button className="icon"><Bell size={19} /></button></>}</div></header>
}
function Chips({ items, value, onChange }) {
  return <div className="chips">{items.map(([id, label, Icon]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{Icon && <Icon size={14} />}{label}</button>)}</div>
}

function AhoraScreen({ posts, card }) {
  const [scope, setScope] = useState('mundo'); const [cat, setCat] = useState('todo')
  const list = posts.filter(p => {
    const g = cityInfo(p.city)
    if (scope === 'cerca' && km(ME, g) > 400) return false
    if (scope === 'pais' && g.country !== ME.country) return false
    if (scope === 'directo' && p.type !== 'directo') return false
    return cat === 'todo' || p.cat === cat
  })
  return <>
    <Header title="El mundo está pasando." sub="Descúbrelo ahora." />
    <Chips value={scope} onChange={setScope} items={[['cerca', 'Cerca de mí'], ['pais', 'Mi país'], ['mundo', 'Mundo'], ['directo', 'En directo', Radio]]} />
    <Chips value={cat} onChange={setCat} items={[['todo', 'Todo'], ...CATEGORIES.map(c => [c.id, c.label])]} />
    <div className="feed">{list.length ? list.map(card) : <Empty text="Aún no hay publicaciones aquí. Sé el primero en compartir algo." />}</div>
  </>
}

function PlanetaScreen({ posts, card }) {
  const [sel, setSel] = useState(null); const [focus, setFocus] = useState(null)
  const points = useMemo(() => posts.map(p => ({ ...cityInfo(p.city), post: p })), [posts])
  const here = posts.filter(p => p.city === sel)
  const regions = [['Mundo', -45, 12, 2], ['Colombia', -74, 5, 5], ['Latinoamérica', -70, -12, 3], ['Europa', 5, 45, 4], ['Asia', 115, 30, 3]]
  const counts = Object.entries(posts.reduce((a, p) => { const c = cityInfo(p.city).country; a[c] = (a[c] || 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1])
  return <>
    <Header title="Explora el planeta" sub={`${posts.length} publicaciones en ${new Set(posts.map(p => p.city)).size} ciudades`} />
    <div className="chips">{regions.map(([n, lon, lat, k]) => <button key={n} onClick={() => { setFocus({ lon, lat, z: k, n: Math.random() }); setSel(null) }}>{n}</button>)}</div>
    <WorldMap points={points} selected={sel} onSelect={setSel} focus={focus} />
    {sel ? <><div className="section"><h2>{sel}</h2><button className="link" onClick={() => setSel(null)}>Cerrar</button></div><div className="feed">{here.map(card)}</div></>
      : <><div className="section"><h2>Países activos</h2></div><div className="list">{counts.map(([c, n]) => <div key={c} className="list-row"><MapPin size={16} /><span className="grow">{c}</span><span className="muted">{n} {n === 1 ? 'publicación' : 'publicaciones'}</span></div>)}</div></>}
  </>
}

function CercaScreen({ posts, card }) {
  const [radius, setRadius] = useState(400)
  const near = posts.map(p => ({ p, d: km(ME, cityInfo(p.city)) })).filter(x => x.d <= radius).sort((a, b) => a.d - b.d)
  const planes = near.filter(x => x.p.cat === 'planes' || x.p.cat === 'eventos')
  return <>
    <Header title="Explorar cerca" sub={`Alrededor de ${ME.city}, ${ME.country}`} />
    <Chips value={radius} onChange={setRadius} items={[[20, '20 km'], [400, '400 km'], [1500, '1.500 km'], [5000, '5.000 km']]} />
    {planes.length > 0 && <><div className="section"><h2>Planes y eventos</h2></div>
      <div className="hscroll">{planes.map(({ p, d }) => <div key={p.id} className="mini" onClick={() => card(p).props.onOpen(p)}><Media post={p} h={110} radius={12} /><div className="mini-t">{p.title}</div><div className="meta">{p.city} · {d < 30 ? 'en tu ciudad' : Math.round(d) + ' km'}</div></div>)}</div></>}
    <div className="section"><h2>Todo lo cercano</h2></div>
    <div className="feed">{near.length ? near.map(x => card(x.p)) : <Empty text="No hay publicaciones en este radio. Amplíalo para descubrir más." />}</div>
  </>
}

function ComunidadScreen({ posts, mine, saved, card }) {
  const [view, setView] = useState('conversaciones')
  const savedPosts = posts.filter(p => saved[p.id])
  return <>
    <Header title="Comunidad" sub="Conversa y conecta con personas de todo el mundo." />
    <div className="profile"><Avatar name="Tú Planeta" hue={ME.hue} size={56} /><div className="grow"><div className="name lg">Tu perfil</div><div className="meta"><MapPin size={12} /> {ME.city}, {ME.country}</div></div>
      <div className="stats"><div><b>{mine.length}</b><span>Publicaciones</span></div><div><b>{savedPosts.length}</b><span>Guardadas</span></div></div></div>
    <Chips value={view} onChange={setView} items={[['conversaciones', 'Conversaciones'], ['mias', 'Mis publicaciones'], ['guardadas', 'Guardadas']]} />
    {view === 'conversaciones' && <div className="list">{CONVERSATIONS.map(c => <div key={c.id} className="list-row conv"><Avatar name={c.title} hue={c.hue} size={44} /><div className="grow"><div className="name">{c.title}</div><div className="meta clip">{c.last}</div></div><span className="muted">{fmt(c.members)}</span></div>)}</div>}
    {view === 'mias' && <div className="feed">{mine.length ? mine.map(card) : <Empty text="Todavía no has publicado. Comparte lo que está pasando a tu alrededor." />}</div>}
    {view === 'guardadas' && <div className="feed">{savedPosts.length ? savedPosts.map(card) : <Empty text="Guarda publicaciones para verlas aquí." />}</div>}
  </>
}

function PublicarScreen({ onCancel, onPublish }) {
  const [cat, setCat] = useState('lugares'); const [title, setTitle] = useState(''); const [text, setText] = useState('')
  const [city, setCity] = useState(ME.city); const [image, setImage] = useState(null); const [live, setLive] = useState(false)
  const pick = e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setImage(r.result); r.readAsDataURL(f) }
  const ok = title.trim().length > 2
  const submit = () => ok && onPublish({ id: 'm' + Date.now(), author: ME.name, handle: ME.handle, hue: ME.hue, city, type: live ? 'directo' : 'usuario', cat, scene: 'ciudad', image, title: title.trim(), text: text.trim(), at: Date.now(), likes: 0, comments: [] })
  return <div className="publish">
    <header className="pub-head"><button className="icon" onClick={onCancel}><X size={20} /></button><span>Nueva publicación</span><button className="btn sm" disabled={!ok} onClick={submit}>Publicar</button></header>
    <h1 className="pub-title">¿Qué está pasando<br />a tu alrededor?</h1>
    <label className="upload">{image ? <img src={image} alt="" /> : <><ImagePlus size={26} strokeWidth={1.5} /><span>Añadir foto o video</span></>}<input type="file" accept="image/*,video/*" onChange={pick} hidden /></label>
    <input className="field" placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} maxLength={90} />
    <textarea className="field" rows={4} placeholder="Cuenta lo que ves, descubres o vives…" value={text} onChange={e => setText(e.target.value)} />
    <div className="lbl">Categoría</div>
    <div className="chips wrap">{CATEGORIES.map(c => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
    <div className="lbl">Ubicación</div>
    <div className="select"><MapPin size={16} /><select value={city} onChange={e => setCity(e.target.value)}>{CITIES.map(c => <option key={c.city}>{c.city}</option>)}</select></div>
    <label className="toggle"><span><Radio size={16} /> Está pasando en directo</span><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /><i /></label>
    <p className="note">Tu publicación se mostrará con la fecha y hora reales en que la compartes.</p>
    <button className="btn block" disabled={!ok} onClick={submit}><Send size={17} /> Publicar en Planeta</button>
  </div>
}

function PostDetail({ post, onClose, onComment, liked, onLike, saved, onSave }) {
  const [t, setT] = useState('')
  return <div className="sheet-bg" onClick={onClose}><div className="sheet" onClick={e => e.stopPropagation()}>
    <header className="pub-head"><button className="icon" onClick={onClose}><ChevronLeft size={20} /></button><span>{catLabel(post.cat)}</span><button className="icon"><MoreHorizontal size={20} /></button></header>
    <Media post={post} h={260} radius={16} />
    <div className="row-between"><TypeTag type={post.type} /><span className="meta">{ago(post.at)}</span></div>
    <h2 className="detail-t">{post.title}</h2><p className="detail-p">{post.text}</p>
    <div className="author"><Avatar name={post.author} hue={post.hue} /><div className="grow"><div className="name">{post.author}</div><div className="meta"><MapPin size={12} /> {post.city}, {cityInfo(post.city).country}</div></div></div>
    <div className="post-actions"><button className={liked ? 'on' : ''} onClick={onLike}><Heart size={18} fill={liked ? 'currentColor' : 'none'} />{fmt(post.likes + (liked ? 1 : 0))}</button><button><MessageCircle size={18} />{post.comments.length}</button>
      {post.joined != null && <button className="btn sm">Me uno</button>}<button className={'end ' + (saved ? 'on' : '')} onClick={onSave}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button></div>
    <div className="lbl">Comentarios</div>
    {post.comments.length === 0 && <p className="muted small">Sé el primero en comentar.</p>}
    {post.comments.map((c, i) => <div key={i} className="comment"><Avatar name={c.a} size={28} hue={(c.a.length * 47) % 360} /><div><b>{c.a}</b><p>{c.t}</p></div></div>)}
    <form className="comment-box" onSubmit={e => { e.preventDefault(); if (t.trim()) { onComment(t.trim()); setT('') } }}><input placeholder="Escribe un comentario…" value={t} onChange={e => setT(e.target.value)} /><button className="icon accent"><Send size={17} /></button></form>
  </div></div>
}
const NAV = [['planeta', Globe, 'Planeta'], ['ahora', Newspaper, 'Ahora'], ['cerca', Compass, 'Explorar cerca'], ['comunidad', Users, 'Comunidad']]
function Sidebar({ tab, setTab }) {
  return <aside className="side">
    <div className="brand big"><span className="logo" />PLANETA</div>
    <p className="side-tag">El mundo está pasando.<br />Descúbrelo ahora.</p>
    <nav className="side-nav">{NAV.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon size={20} strokeWidth={1.75} />{label}</button>)}</nav>
    <button className="btn block" onClick={() => setTab('publicar')}><Plus size={18} /> Publicar</button>
    <div className="side-me"><Avatar name="Tú Planeta" hue={ME.hue} size={36} /><div><div className="name">Tu perfil</div><div className="meta">{ME.city}, {ME.country}</div></div></div>
  </aside>
}
function Aside({ posts, onOpen, goMap }) {
  const live = posts.filter(p => p.type === 'directo').slice(0, 4)
  const top = Object.entries(posts.reduce((a, p) => (a[p.city] = (a[p.city] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  return <aside className="aside">
    <div className="panel"><div className="panel-h"><Radio size={16} /> En directo ahora</div>
      {live.map(p => <button key={p.id} className="panel-row" onClick={() => onOpen(p.id)}><Media post={p} h={48} radius={10} /><div className="grow"><div className="panel-t">{p.title}</div><div className="meta">{p.city} · {ago(p.at)}</div></div></button>)}</div>
    <div className="panel"><div className="panel-h"><MapPin size={16} /> Ciudades activas</div>
      {top.map(([c, n]) => <button key={c} className="panel-row simple" onClick={goMap}><span className="grow">{c}</span><span className="muted">{n}</span></button>)}</div>
    <div className="panel"><div className="panel-h"><Users size={16} /> Conversaciones</div>
      {CONVERSATIONS.slice(0, 3).map(c => <div key={c.id} className="panel-row simple"><span className="grow">{c.title}</span><span className="muted">{fmt(c.members)}</span></div>)}</div>
    <p className="foot">PLANETA · 2026</p>
  </aside>
}
function Empty({ text }) { return <div className="empty">{text}</div> }

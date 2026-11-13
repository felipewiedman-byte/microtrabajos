import { useEffect, useMemo, useState } from 'react'
import { Globe, Newspaper, Plus, Compass, Users, Search, Bell, X, MapPin, ImagePlus, Send, ChevronLeft, Radio, Heart, MessageCircle, Bookmark, Trash2, Flag } from 'lucide-react'
import { ME, CATEGORIES, CITIES, CONVERSATIONS, cityInfo, catLabel } from './data'
import { api, shrinkImage } from './api'
import { ago, km, fmt } from './util'
import { Avatar, Media, TypeTag } from './components/ui'
import PostCard from './components/PostCard'
import WorldMap from './components/WorldMap'


export default function App() {
  const [tab, setTab] = useState('ahora')
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [auth, setAuth] = useState(null) // 'login' | 'register' | null
  const [toast, setToast] = useState('')
  const flash = t => { setToast(t); clearTimeout(flash.t); flash.t = setTimeout(() => setToast(''), 2600) }

  const load = () => api.posts().then(d => { setPosts(d.posts); setError('') }).catch(e => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { api.me().then(d => setUser(d.user)).catch(() => {}); load() }, [])

  const requireUser = () => { if (!user) { setAuth('login'); return false } return true }
  const replace = p => setPosts(ps => ps.map(x => x.id === p.id ? { ...x, ...p } : x))
  const toggle = async (id, what) => { if (!requireUser()) return; try { const d = await api.toggle(id, what); replace(d.post); return d.post } catch (e) { flash(e.message) } }
  const cardProps = { onOpen: p => setOpen(p.id), onLike: id => toggle(id, 'like'), onSave: id => toggle(id, 'save') }
  const card = p => <PostCard key={p.id} post={p} liked={p.liked} saved={p.saved} {...cardProps} />
  const goPublish = () => { if (requireUser()) setTab('publicar') }

  return (
    <div className="app">
      <Sidebar tab={tab} setTab={setTab} goPublish={goPublish} user={user} onAuth={() => setAuth('login')} />
      <main className="screen">
        {error && <div className="banner">{error} <button className="link" onClick={load}>Reintentar</button></div>}
        {tab === 'planeta' && <PlanetaScreen posts={posts} card={card} />}
        {tab === 'ahora' && <AhoraScreen posts={posts} card={card} loading={loading} user={user} />}
        {tab === 'publicar' && <PublicarScreen user={user} onCancel={() => setTab('ahora')} onPublished={p => { setPosts(ps => [p, ...ps]); setTab('ahora'); flash('Publicado en Planeta') }} />}
        {tab === 'cerca' && <CercaScreen posts={posts} card={card} user={user} />}
        {tab === 'comunidad' && <ComunidadScreen posts={posts} user={user} card={card} onAuth={setAuth} onLogout={async () => { await api.logout(); setUser(null); load(); flash('Sesión cerrada') }} />}
      </main>
      <Aside posts={posts} onOpen={id => setOpen(id)} goMap={() => setTab('planeta')} />
      {tab !== 'publicar' && <nav className="tabbar">
        {[['planeta', Globe, 'Planeta'], ['ahora', Newspaper, 'Ahora'], ['publicar', Plus, 'Publicar'], ['cerca', Compass, 'Cerca'], ['comunidad', Users, 'Comunidad']].map(([id, Icon, label]) =>
          <button key={id} aria-label={label} className={(tab === id ? 'on ' : '') + (id === 'publicar' ? 'pub' : '')} onClick={() => id === 'publicar' ? goPublish() : setTab(id)}><Icon size={id === 'publicar' ? 22 : 20} strokeWidth={1.75} /><span>{label}</span></button>)}
      </nav>}
      {open && <PostDetail id={open} user={user} onClose={() => setOpen(null)} onToggle={toggle} requireUser={requireUser} flash={flash}
        onDeleted={id => { setPosts(ps => ps.filter(p => p.id !== id)); setOpen(null); flash('Publicación eliminada') }} onChanged={replace} />}
      {auth && <AuthModal mode={auth} setMode={setAuth} onClose={() => setAuth(null)} onDone={u => { setUser(u); setAuth(null); load(); flash('Hola, ' + u.name.split(' ')[0]) }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function Header({ title, sub, right }) {
  return <header className="top"><div><div className="brand"><span className="logo" />PLANETA</div>{title && <h1>{title}</h1>}{sub && <p className="sub">{sub}</p>}</div><div className="top-r">{right ?? <><button className="icon"><Search size={19} /></button><button className="icon"><Bell size={19} /></button></>}</div></header>
}
function Chips({ items, value, onChange }) {
  return <div className="chips">{items.map(([id, label, Icon]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{Icon && <Icon size={14} />}{label}</button>)}</div>
}

function AhoraScreen({ posts, card, loading, user }) {
  const home = cityInfo(user?.city || ME.city)
  const [scope, setScope] = useState('mundo'); const [cat, setCat] = useState('todo')
  const list = posts.filter(p => {
    const g = cityInfo(p.city)
    if (scope === 'cerca' && km(home, g) > 400) return false
    if (scope === 'pais' && g.country !== home.country) return false
    if (scope === 'directo' && p.type !== 'directo') return false
    return cat === 'todo' || p.cat === cat
  })
  return <>
    <Header title="El mundo está pasando." sub="Descúbrelo ahora." />
    <Stories posts={posts} />
    <Chips value={scope} onChange={setScope} items={[['cerca', 'Cerca de mí'], ['pais', 'Mi país'], ['mundo', 'Mundo'], ['directo', 'En directo', Radio]]} />
    <Chips value={cat} onChange={setCat} items={[['todo', 'Todo'], ...CATEGORIES.map(c => [c.id, c.label])]} />
    <div className="feed">{loading ? <Empty text="Cargando publicaciones…" /> : list.length ? list.map(card) : <Empty text="Aún no hay publicaciones aquí. Sé el primero en compartir algo." />}</div>
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

function CercaScreen({ posts, card, user }) {
  const [radius, setRadius] = useState(400)
  const home = cityInfo(user?.city || ME.city)
  const near = posts.map(p => ({ p, d: km(home, cityInfo(p.city)) })).filter(x => x.d <= radius).sort((a, b) => a.d - b.d)
  const planes = near.filter(x => x.p.cat === 'planes' || x.p.cat === 'eventos')
  return <>
    <Header title="Explorar cerca" sub={`Alrededor de ${home.city}, ${home.country}`} />
    <Chips value={radius} onChange={setRadius} items={[[20, '20 km'], [400, '400 km'], [1500, '1.500 km'], [5000, '5.000 km']]} />
    {planes.length > 0 && <><div className="section"><h2>Planes y eventos</h2></div>
      <div className="hscroll">{planes.map(({ p, d }) => <div key={p.id} className="mini" onClick={() => card(p).props.onOpen(p)}><Media post={p} h={110} radius={12} /><div className="mini-t">{p.title}</div><div className="meta">{p.city} · {d < 30 ? 'en tu ciudad' : Math.round(d) + ' km'}</div></div>)}</div></>}
    <div className="section"><h2>Todo lo cercano</h2></div>
    <div className="feed">{near.length ? near.map(x => card(x.p)) : <Empty text="No hay publicaciones en este radio. Amplíalo para descubrir más." />}</div>
  </>
}

function ComunidadScreen({ posts, user, card, onAuth, onLogout }) {
  const [view, setView] = useState('conversaciones')
  const mine = posts.filter(p => p.mine), savedPosts = posts.filter(p => p.saved)
  return <>
    <Header title="Comunidad" sub="Conversa y conecta con personas de todo el mundo." />
    {user ? <div className="profile"><Avatar name={user.name} hue={user.hue} size={56} /><div className="grow"><div className="name lg">{user.name}</div><div className="meta">@{user.handle} · {user.city}</div></div>
      <div className="stats"><div><b>{mine.length}</b><span>Publicaciones</span></div><div><b>{savedPosts.length}</b><span>Guardadas</span></div></div></div>
      : <div className="profile cta"><div className="grow"><div className="name lg">Únete a PLANETA</div><div className="meta">Crea tu cuenta para publicar, comentar y guardar.</div></div><button className="btn sm" onClick={() => onAuth('register')}>Crear cuenta</button><button className="btn ghost sm" onClick={() => onAuth('login')}>Entrar</button></div>}
    <Chips value={view} onChange={setView} items={[['conversaciones', 'Conversaciones'], ['mias', 'Mis publicaciones'], ['guardadas', 'Guardadas']]} />
    {view === 'conversaciones' && <div className="list">{CONVERSATIONS.map(c => <div key={c.id} className="list-row conv"><Avatar name={c.title} hue={c.hue} size={44} /><div className="grow"><div className="name">{c.title}</div><div className="meta clip">{c.last}</div></div><span className="muted">{fmt(c.members)}</span></div>)}</div>}
    {view === 'mias' && <div className="feed">{mine.length ? mine.map(card) : <Empty text={user ? 'Todavía no has publicado. Comparte lo que está pasando a tu alrededor.' : 'Inicia sesión para ver tus publicaciones.'} />}</div>}
    {view === 'guardadas' && <div className="feed">{savedPosts.length ? savedPosts.map(card) : <Empty text="Guarda publicaciones para verlas aquí." />}</div>}
    {user && <button className="btn ghost block" onClick={onLogout}>Cerrar sesión</button>}
  </>
}

function PublicarScreen({ user, onCancel, onPublished }) {
  const [cat, setCat] = useState('lugares'); const [title, setTitle] = useState(''); const [text, setText] = useState('')
  const [city, setCity] = useState(user?.city || ME.city); const [image, setImage] = useState(null); const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const pick = async e => { const f = e.target.files?.[0]; if (!f) return; try { setImage(await shrinkImage(f)) } catch (x) { setErr(x.message) } }
  const ok = title.trim().length > 2 && !busy
  const submit = async () => { if (!ok) return; setBusy(true); setErr(''); try { const d = await api.create({ title, text, cat, city, image, live }); onPublished(d.post) } catch (x) { setErr(x.message) } finally { setBusy(false) } }
  return <div className="publish">
    <header className="pub-head"><button className="icon" onClick={onCancel} aria-label="Cancelar"><X size={20} /></button><span>Nueva publicación</span><button className="btn sm" disabled={!ok} onClick={submit}>{busy ? 'Publicando…' : 'Publicar'}</button></header>
    <h1 className="pub-title">¿Qué está pasando<br />a tu alrededor?</h1>
    <label className="upload">{image ? <img src={image} alt="" /> : <><ImagePlus size={26} strokeWidth={1.5} /><span>Añadir foto</span></>}<input id="pub-photo" type="file" accept="image/*" onChange={pick} hidden /></label>
    <input id="pub-title" className="field" placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
    <textarea id="pub-text" className="field" rows={4} placeholder="Cuenta lo que ves, descubres o vives…" value={text} onChange={e => setText(e.target.value)} maxLength={2000} />
    <div className="lbl">Categoría</div>
    <div className="chips wrap">{CATEGORIES.map(c => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
    <div className="lbl">Ubicación</div>
    <div className="select"><MapPin size={16} /><select id="pub-city" value={city} onChange={e => setCity(e.target.value)}>{CITIES.map(c => <option key={c.city}>{c.city}</option>)}</select></div>
    <label className="toggle"><span><Radio size={16} /> Está pasando en directo</span><input id="pub-live" type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /><i /></label>
    {err && <div className="banner">{err}</div>}
    <p className="note">Tu publicación se mostrará con la fecha y hora reales en que la compartes.</p>
    <button className="btn block" disabled={!ok} onClick={submit}><Send size={17} /> {busy ? 'Publicando…' : 'Publicar en Planeta'}</button>
  </div>
}

function AuthModal({ mode, setMode, onClose, onDone }) {
  const reg = mode === 'register'
  const [f, setF] = useState({ name: '', handle: '', password: '', city: ME.city }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const submit = async e => { e.preventDefault(); setBusy(true); setErr(''); try { const d = reg ? await api.register(f) : await api.login(f); onDone(d.user) } catch (x) { setErr(x.message) } finally { setBusy(false) } }
  return <div className="sheet-bg" onClick={onClose}><form className="auth" onClick={e => e.stopPropagation()} onSubmit={submit}>
    <div className="brand big"><span className="logo" />PLANETA</div>
    <h2>{reg ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2>
    <p className="muted">{reg ? 'Descubre y comparte lo que pasa en el mundo.' : 'Entra para publicar, comentar y guardar.'}</p>
    {reg && <input id="auth-name" className="field" placeholder="Tu nombre" value={f.name} onChange={set('name')} autoComplete="name" />}
    <input id="auth-handle" className="field" placeholder="Usuario (ej. maria.lopez)" value={f.handle} onChange={set('handle')} autoComplete="username" autoCapitalize="none" />
    <input id="auth-pass" className="field" type="password" placeholder="Contraseña" value={f.password} onChange={set('password')} autoComplete={reg ? 'new-password' : 'current-password'} />
    {reg && <div className="select" style={{ marginTop: 10 }}><MapPin size={16} /><select id="auth-city" value={f.city} onChange={set('city')}>{CITIES.map(c => <option key={c.city}>{c.city}</option>)}</select></div>}
    {err && <div className="banner">{err}</div>}
    <button className="btn block" disabled={busy}>{busy ? 'Un momento…' : reg ? 'Crear cuenta' : 'Entrar'}</button>
    <button type="button" className="link center" onClick={() => setMode(reg ? 'login' : 'register')}>{reg ? '¿Ya tienes cuenta? Entra' : '¿No tienes cuenta? Créala'}</button>
  </form></div>
}

function PostDetail({ id, user, onClose, onToggle, requireUser, flash, onDeleted, onChanged }) {
  const [post, setPost] = useState(null); const [t, setT] = useState(''); const [err, setErr] = useState('')
  const reload = () => api.post(id).then(d => { setPost(d.post); onChanged(d.post) }).catch(e => setErr(e.message))
  useEffect(() => { reload() }, [id])
  const tog = async what => { const p = await onToggle(id, what); if (p) setPost(x => ({ ...x, ...p })) }
  const send = async e => { e.preventDefault(); if (!requireUser() || !t.trim()) return; try { await api.comment(id, t.trim()); setT(''); reload() } catch (x) { flash(x.message) } }
  const del = async () => { try { await api.remove(id); onDeleted(id) } catch (x) { flash(x.message) } }
  const report = async () => { if (!requireUser()) return; try { await api.report(id, 'Contenido inapropiado'); flash('Gracias. Revisaremos esta publicación.') } catch (x) { flash(x.message) } }
  return <div className="sheet-bg" onClick={onClose}><div className="sheet" onClick={e => e.stopPropagation()}>
    <header className="pub-head"><button className="icon" onClick={onClose} aria-label="Volver"><ChevronLeft size={20} /></button><span>{post ? catLabel(post.cat) : ''}</span>
      {post?.mine ? <button className="icon" onClick={del} aria-label="Eliminar" title="Eliminar"><Trash2 size={18} /></button> : <button className="icon" onClick={report} aria-label="Reportar" title="Reportar"><Flag size={18} /></button>}</header>
    {!post ? <Empty text={err || 'Cargando…'} /> : <>
      <Media post={post} h={300} radius={20} />
      <div className="row-between"><TypeTag type={post.type} /><span className="meta">{ago(post.at)}</span></div>
      <h2 className="detail-t">{post.title}</h2>{post.text && <p className="detail-p">{post.text}</p>}
      <div className="author"><Avatar name={post.author} hue={post.hue} size={42} /><div className="grow"><div className="name">{post.author}</div><div className="meta"><MapPin size={12} /> {post.city}, {cityInfo(post.city)?.country}</div></div></div>
      <div className="post-actions"><button className={'act' + (post.liked ? ' on' : '')} onClick={() => tog('like')}><Heart size={18} fill={post.liked ? 'currentColor' : 'none'} /><span>{fmt(post.likes)}</span></button>
        <span className="act"><MessageCircle size={18} /><span>{post.comments.length}</span></span>
        {post.cat === 'planes' && <button className={'btn sm' + (post.joined_me ? ' ghost' : '')} onClick={() => tog('join')}>{post.joined_me ? 'Te uniste ✓' : 'Me uno'} · {post.joined}</button>}
        <button className={'act end' + (post.saved ? ' on' : '')} onClick={() => tog('save')}><Bookmark size={18} fill={post.saved ? 'currentColor' : 'none'} /></button></div>
      <div className="lbl">Comentarios</div>
      {post.comments.length === 0 && <p className="muted small">Sé el primero en comentar.</p>}
      {post.comments.map(c => <div key={c.id} className="comment"><Avatar name={c.author} size={30} hue={c.hue} /><div><b>{c.author}</b> <span className="meta" style={{ display: 'inline' }}>{ago(c.at)}</span><p>{c.text}</p></div></div>)}
      <form className="comment-box" onSubmit={send}><input id="comment-input" placeholder={user ? 'Escribe un comentario…' : 'Inicia sesión para comentar'} value={t} onChange={e => setT(e.target.value)} maxLength={1000} /><button className="icon accent" aria-label="Enviar"><Send size={17} /></button></form>
    </>}
  </div></div>
}
const NAV = [['planeta', Globe, 'Planeta'], ['ahora', Newspaper, 'Ahora'], ['cerca', Compass, 'Explorar cerca'], ['comunidad', Users, 'Comunidad']]
function Sidebar({ tab, setTab, goPublish, user, onAuth }) {
  return <aside className="side">
    <div className="brand big"><span className="logo" />PLANETA</div>
    <p className="side-tag">El mundo está pasando.<br />Descúbrelo ahora.</p>
    <nav className="side-nav">{NAV.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon size={20} strokeWidth={1.75} />{label}</button>)}</nav>
    <button className="btn block" onClick={goPublish}><Plus size={18} /> Publicar</button>
    {user ? <button className="side-me" onClick={() => setTab('comunidad')}><Avatar name={user.name} hue={user.hue} size={38} /><div><div className="name">{user.name}</div><div className="meta">@{user.handle}</div></div></button>
      : <button className="side-me" onClick={onAuth}><div><div className="name">Entrar o crear cuenta</div><div className="meta">Para publicar y comentar</div></div></button>}
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
function Stories({ posts }) {
  const seen = new Set(), items = []
  for (const p of posts) if (!seen.has(p.city)) { seen.add(p.city); items.push(p) }
  return <div className="stories">{items.slice(0, 10).map(p => <div key={p.city} className="story"><div className={'story-ring' + (p.type === 'directo' ? ' live' : '')}><Media post={p} h={62} radius={999} /></div><span>{p.city}</span></div>)}</div>
}
function Empty({ text }) { return <div className="empty">{text}</div> }

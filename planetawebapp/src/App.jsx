import { useEffect, useMemo, useRef, useState } from 'react'
import { Globe, Newspaper, Plus, Compass, Users, Search, X, MapPin, ImagePlus, Send, ChevronLeft, Radio, Heart, MessageCircle, Bookmark, Trash2, Flag, Clock, Play, Pause, MessagesSquare, ChevronRight, ChevronUp, ChevronDown, Minus } from 'lucide-react'
import { ME, CATEGORIES, CITIES, cityInfo, catLabel, localTime } from './data'
import { api, shrinkImage } from './api'
import { ago, km, fmt } from './util'
import { Avatar, Media, TypeTag } from './components/ui'
import PostCard from './components/PostCard'
import WorldMap from './components/WorldMap'


export default function App() {
  const [tab, setTab] = useState('planeta')
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [auth, setAuth] = useState(null) // 'login' | 'register' | null
  const [toast, setToast] = useState('')
  const [chatWith, setChatWith] = useState(null)
  const [unread, setUnread] = useState(0)
  const [story, setStory] = useState(null) // city name
  const [pinReq, setPinReq] = useState(0)
  const [chatCities, setChatCities] = useState([])
  useEffect(() => { if (!user) { setUnread(0); setChats([]); setDocks([]); return } const f = () => api.chats().then(d => { setChats(d.chats); setUnread(d.unread) }).catch(() => {}); f(); const t = setInterval(f, 6000); return () => clearInterval(t) }, [user])
  const [docks, setDocks] = useState([]) // [{ id, min }]
  const [chats, setChats] = useState([])
  const isDesk = () => window.matchMedia('(min-width: 1024px)').matches
  const refreshChats = () => user && api.chats().then(d => { setChats(d.chats); setUnread(d.unread) }).catch(() => {})
  const openChat = id => {
    if (!requireUser()) return
    setOpen(null)
    if (isDesk()) setDocks(ds => ds.some(d => d.id === id) ? ds.map(d => d.id === id ? { ...d, min: false } : d) : [...ds, { id, min: false }].slice(-3))
    else { setChatWith(id); setTab('mensajes') }
  }
  const flash = t => { setToast(t); clearTimeout(flash.t); flash.t = setTimeout(() => setToast(''), 2600) }

  const load = () => api.posts().then(d => { setPosts(d.posts); setError('') }).catch(e => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { api.me().then(d => setUser(d.user)).catch(() => {}); load() }, [])

  const requireUser = () => { if (!user) { setAuth('login'); return false } return true }
  const replace = p => setPosts(ps => ps.map(x => x.id === p.id ? { ...x, ...p } : x))
  const toggle = async (id, what) => { if (!requireUser()) return; try { const d = await api.toggle(id, what); replace(d.post); return d.post } catch (e) { flash(e.message) } }
  const cardProps = { onOpen: p => setOpen(p.id), onLike: id => toggle(id, 'like'), onSave: id => toggle(id, 'save') }
  const card = p => <PostCard key={p.id} post={p} liked={p.liked} saved={p.saved} {...cardProps} />
  const goPublish = () => { if (requireUser()) { setTab('planeta'); setPinReq(n => n + 1) } }

  return (
    <div className={'app' + (tab === 'planeta' || tab === 'huella' ? ' wide' : '') + (user ? ' logged' : '')}>
      <Sidebar tab={tab} setTab={id => id === 'mensajes' && user && isDesk() ? window.dispatchEvent(new Event('planeta:chats')) : setTab(id)} goPublish={goPublish} user={user} unread={unread} onAuth={() => setAuth('login')} />
      <main className="screen">
        {error && <div className="banner">{error} <button className="link" onClick={load}>Reintentar</button></div>}
        {(tab === 'planeta' || tab === 'huella') && <PlanetaScreen posts={posts} user={user} mode={tab === 'huella' ? 'huella' : 'explorar'} onOpen={id => setOpen(id)} onChat={openChat} onStory={setStory} pinReq={pinReq} requireUser={requireUser} onPublished={p => { setPosts(ps => [p, ...ps]); flash('Publicado en el planeta') }} chatCities={chatCities} flash={flash} />}
        {tab === 'ahora' && <AhoraScreen posts={posts} card={card} loading={loading} user={user} onStory={setStory} />}
        {tab === 'mensajes' && <MensajesScreen user={user} chatWith={chatWith} setChatWith={setChatWith} onAuth={setAuth} onRead={() => api.chats().then(d => setUnread(d.unread)).catch(() => {})} />}
        {tab === 'publicar' && <PublicarScreen user={user} onCancel={() => setTab('ahora')} onPublished={p => { setPosts(ps => [p, ...ps]); setTab('ahora'); flash('Publicado en Planeta') }} />}
        {tab === 'cerca' && <CercaScreen posts={posts} card={card} user={user} />}
        {tab === 'comunidad' && <ComunidadScreen posts={posts} user={user} card={card} onAuth={setAuth} onOpen={id => setOpen(id)} onChat={openChat} onLogout={async () => { await api.logout(); setUser(null); load(); flash('Sesión cerrada') }} />}
      </main>
      {tab !== 'planeta' && tab !== 'huella' && <Aside posts={posts} onOpen={id => setOpen(id)} goMap={() => setTab('planeta')} />}
      {tab !== 'publicar' && <nav className="tabbar">
        {[['ahora', Newspaper, 'Ahora'], ['planeta', Globe, 'Planeta'], ['publicar', Plus, 'Publicar'], ['mensajes', MessagesSquare, 'Mensajes'], ['comunidad', Users, 'Comunidad']].map(([id, Icon, label]) =>
          <button key={id} aria-label={label} className={(tab === id ? 'on ' : '') + (id === 'publicar' ? 'pub' : '')} onClick={() => id === 'publicar' ? goPublish() : setTab(id)}><span className="ico"><Icon size={id === 'publicar' ? 22 : 20} strokeWidth={1.75} />{id === 'mensajes' && unread > 0 && <i className="badge">{unread}</i>}</span><span>{label}</span></button>)}
      </nav>}
      {story && <StoryViewer city={story} posts={posts} onClose={() => setStory(null)} onOpen={id => { setStory(null); setOpen(id) }} />}
      {open && <PostDetail id={open} user={user} onChat={openChat} onClose={() => setOpen(null)} onToggle={toggle} requireUser={requireUser} flash={flash}
        onDeleted={id => { setPosts(ps => ps.filter(p => p.id !== id)); setOpen(null); flash('Publicación eliminada') }} onChanged={replace} />}
      {auth && <AuthModal mode={auth} setMode={setAuth} onClose={() => setAuth(null)} onDone={u => { setUser(u); setAuth(null); load(); flash('Hola, ' + u.name.split(' ')[0]) }} />}
      {user && <ChatDock chats={chats} docks={docks} setDocks={setDocks} openChat={openChat} unread={unread} onChange={refreshChats} me={user} onCities={setChatCities} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function Header({ title, sub, search, setSearch }) {
  const [openS, setOpenS] = useState(false)
  return <header className="top"><div className="grow"><div className="brand"><span className="logo" />PLANETA</div>{title && <h1>{title}</h1>}{sub && <p className="sub">{sub}</p>}</div>
    {setSearch && <div className="top-r">{openS || search ? <div className="search"><Search size={15} /><input id="search" autoFocus placeholder="Buscar lugar, ciudad o tema" value={search} onChange={e => setSearch(e.target.value)} /><button aria-label="Cerrar búsqueda" onClick={() => { setSearch(''); setOpenS(false) }}><X size={15} /></button></div>
      : <button className="icon" aria-label="Buscar" onClick={() => setOpenS(true)}><Search size={19} /></button>}</div>}</header>
}
function Chips({ items, value, onChange }) {
  return <div className="chips">{items.map(([id, label, Icon]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{Icon && <Icon size={14} />}{label}</button>)}</div>
}

function AhoraScreen({ posts, card, loading, user, onStory }) {
  const home = cityInfo(user?.city || ME.city)
  const [scope, setScope] = useState('mundo'); const [cat, setCat] = useState('todo'); const city = null; const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const list = posts.filter(p => {
    const g = cityInfo(p.city)
    if (city && p.city !== city) return false
    if (q && !(p.title + ' ' + p.text + ' ' + p.city + ' ' + p.author + ' ' + catLabel(p.cat)).toLowerCase().includes(q)) return false
    if (scope === 'cerca' && km(home, g) > 400) return false
    if (scope === 'pais' && g.country !== home.country) return false
    if (scope === 'directo' && p.type !== 'directo') return false
    return cat === 'todo' || p.cat === cat
  })
  return <>
    <Header title="El mundo está pasando." sub="Descúbrelo ahora." search={search} setSearch={setSearch} />
    <Stories posts={posts} onStory={onStory} />
    <Chips value={scope} onChange={setScope} items={[['cerca', 'Cerca de mí'], ['pais', 'Mi país'], ['mundo', 'Mundo'], ['directo', 'En directo', Radio]]} />
    <Chips value={cat} onChange={setCat} items={[['todo', 'Todo'], ...CATEGORIES.map(c => [c.id, c.label])]} />
    <div className="feed">{loading ? <Empty text="Cargando publicaciones…" /> : list.length ? list.map(card) : <Empty text="Aún no hay publicaciones aquí. Sé el primero en compartir algo." />}</div>
  </>
}

const inView = (g, b) => { if (!b) return true; const lon = ((g.lon - b.w) % 360 + 360) % 360; return g.lat >= b.s && g.lat <= b.n && (b.e - b.w >= 360 || lon <= b.e - b.w) }
const nearest = (lat, lon) => CITIES.map(c => [c, (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2]).sort((a, b) => a[1] - b[1])[0][0]
const where = p => p.lat != null && p.lon != null ? { lat: p.lat, lon: p.lon } : cityInfo(p.city)

function PlanetaScreen({ posts, user, mode, onOpen, onChat, onStory, pinReq, requireUser, onPublished, chatCities, flash }) {
  const [sel, setSel] = useState(null); const [focus, setFocus] = useState(null); const [q, setQ] = useState(''); const [active, setActive] = useState(null)
  const [bounds, setBounds] = useState(null); const [cat, setCat] = useState('todo'); const [hours, setHours] = useState(24); const [playing, setPlaying] = useState(false); const [sheet, setSheet] = useState(false)
  const [pinMode, setPinMode] = useState(false); const [drop, setDrop] = useState(null)
  const home = cityInfo(user?.city || ME.city)
  const now = Date.now(), qq = q.trim().toLowerCase()
  const huella = mode === 'huella'
  const mine = useMemo(() => posts.filter(p => p.mine).sort((a, b) => a.at - b.at), [posts])
  const base = huella ? mine : posts.filter(p => (cat === 'todo' || p.cat === cat) && (hours >= 24 || p.at >= now - hours * 3600e3) && (!qq || (p.title + ' ' + p.city + ' ' + cityInfo(p.city).country + ' ' + catLabel(p.cat) + ' ' + p.author).toLowerCase().includes(qq)))
  const points = useMemo(() => base.map(p => ({ ...cityInfo(p.city), post: p })), [posts, cat, hours, qq, huella])
  const visible = base.filter(p => inView(cityInfo(p.city), bounds))
  const vCities = [...new Set(visible.map(p => p.city))], vCountries = [...new Set(visible.map(p => cityInfo(p.city).country))]
  const place = vCities.length === 1 ? vCities[0] + ', ' + cityInfo(vCities[0]).country : vCountries.length === 1 ? vCountries[0] : vCountries.length ? vCountries.length + ' países a la vista' : 'Nada a la vista'
  const regions = [['Mundo', -40, 18, 2.5], ['Colombia', -74, 5, 5.5], ['Latinoamérica', -68, -12, 3.2], ['Europa', 5, 46, 4], ['Asia', 115, 30, 3.2]]
  const fly = (lat, lon, z) => setFocus({ lon, lat, z, n: Math.random() })
  const openCity = (c, postId) => { setSel(c); setActive(postId ?? null); setDrop(null); setPinMode(false); const g = cityInfo(c); fly(g.lat, g.lon, 9) }
  const onPin = c => openCity(c, base.find(p => p.city === c)?.id)
  useEffect(() => { if (pinReq) { setPinMode(true); setSel(null); setDrop(null) } }, [pinReq])
  useEffect(() => { if (!playing) return; if (hours >= 24) { setPlaying(false); return } const t = setTimeout(() => setHours(h => Math.min(24, h + 1)), 350); return () => clearTimeout(t) }, [playing, hours])
  useEffect(() => { if (huella) { setSel(null); setFocus({ lon: -30, lat: 20, z: 2.5, n: Math.random() }) } }, [huella])
  const place2 = ll => { if (!requireUser()) return; setDrop({ lat: ll.lat, lon: ll.lng }); setPinMode(false); setSel(null) }
  const ticks = posts.map(p => (now - p.at) / 3600e3).filter(h => h <= 24)
  const cats = [['todo', 'Todo'], ['eventos', 'Eventos'], ['planes', 'Planes'], ['lugares', 'Lugares'], ['noticias', 'Noticias'], ['deportes', 'Deportes']]
  const live = visible.filter(p => p.type === 'directo').length
  const footprint = huella ? mine.map(where) : null
  const chatLines = (chatCities || []).map(c => cityInfo(c)).filter(Boolean)

  return <div className={'planet' + (sel ? ' city-open' : '')}>
    <WorldMap points={points} selected={sel} onSelect={onPin} focus={focus} home={home} onBounds={setBounds} pinMode={pinMode} onPlace={place2} drop={drop} footprint={footprint} chatLines={chatLines} />
    {!huella && <><div className="pl-search glass pl-search-top"><Search size={15} /><input id="planet-search" placeholder="Buscar en el planeta: ciudad, tema o persona" value={q} onChange={e => setQ(e.target.value)} />{q && <button onClick={() => setQ('')} aria-label="Borrar"><X size={14} /></button>}</div>
    <div className="pl-regions pl-regions-top">{regions.map(([n, lon, lat, z]) => <button key={n} className="glass" onClick={() => { setSel(null); fly(lat, lon, z) }}>{n}</button>)}</div></>}

    {huella ? <aside className="pl-panel glass huella">
      <div className="pl-ph">
        <div className="row" style={{ gap: 12 }}><Avatar name={user?.name || 'Tú'} hue={user?.hue} size={52} /><div><div className="pl-place" style={{ margin: 0 }}>{user?.name}</div><div className="meta">{user?.city} · @{user?.handle}</div></div></div>
        <div className="fp-stats"><div><b>{new Set(mine.map(p => cityInfo(p.city).country)).size}</b><span>países</span></div><div><b>{new Set(mine.map(p => p.city)).size}</b><span>ciudades</span></div><div><b>{mine.length}</b><span>publicaciones</span></div></div>
        <div className="cap-s" style={{ marginTop: 12 }}>Tu huella</div>
        <p className="meta" style={{ display: 'block', lineHeight: 1.5, margin: '4px 0 12px' }}>La línea dorada une, en orden, los lugares donde has publicado. Tu perfil es tu mapa.</p>
      </div>
      <div className="pl-list">{mine.length ? mine.map((p, i) => <button key={p.id} className="pl-item" onClick={() => { const g = where(p); fly(g.lat, g.lon, 10) }}>
        <span className="fp-n">{i + 1}</span><span className="pl-thumb"><Media post={p} h={50} radius={6} /></span>
        <span className="pl-it"><span className="pl-it-t">{p.title}</span><span className="meta"><MapPin size={11} /> {p.city} · {ago(p.at)}</span></span></button>)
        : <div className="empty" style={{ margin: 12 }}>Aún no tienes huella. Pulsa + y suelta tu primera publicación en el mapa.</div>}</div>
    </aside>
    : <aside className={'pl-panel glass' + (sheet ? ' open' : '')}>
      <button className="pl-grab" onClick={() => setSheet(o => !o)} aria-label={sheet ? 'Bajar panel' : 'Subir panel'}><i /></button>
      <div className="pl-ph">
        <div className="cap-s">En esta vista {live > 0 && <span className="tag tag-directo"><i className="dot" />{live} en directo</span>}</div>
        <div className="pl-place">{place}</div>
        <div className="meta">{visible.length} {visible.length === 1 ? 'publicación' : 'publicaciones'} · el feed cambia cuando mueves el mapa</div>
        <div className="chips pl-cats">{cats.map(([id, l]) => <button key={id} className={cat === id ? 'on' : ''} onClick={() => setCat(id)}>{l}</button>)}</div>
      </div>
      <div className="pl-list">{visible.length ? visible.map(p => <button key={p.id} className={'pl-item' + (active === p.id ? ' on' : '')} onClick={() => { openCity(p.city, p.id); setSheet(false) }}>
        <span className="pl-thumb"><Media post={p} h={58} radius={6} /></span>
        <span className="pl-it"><TypeTag type={p.type} /><span className="pl-it-t">{p.title}</span><span className="meta"><MapPin size={11} /> {p.city} · {ago(p.at)}</span></span>
      </button>) : <div className="empty" style={{ margin: 12 }}>No hay publicaciones en esta zona{hours < 24 ? ' en este intervalo de tiempo' : ''}. Aleja el mapa o cambia los filtros.</div>}</div>
    </aside>}

    {sel && <CityPanel city={sel} posts={posts.filter(p => p.city === sel)} active={active} user={user} onClose={() => { setSel(null); setActive(null) }} onOpen={onOpen} onChat={onChat} onStory={onStory} requireUser={requireUser} flash={flash} onStreets={() => { const g = cityInfo(sel); fly(g.lat, g.lon, 14) }} />}

    {pinMode && <div className="pin-hint glass"><MapPin size={15} /> <b>Haz clic en el mapa</b> donde está ocurriendo <button className="link" onClick={() => setPinMode(false)}>Cancelar</button></div>}
    {drop && <PinComposer drop={drop} onCancel={() => setDrop(null)} onDone={p => { setDrop(null); onPublished(p); openCity(p.city, p.id) }} />}

    {!huella && <div className="pl-time glass">
      <span className="pl-time-l"><Clock size={15} /> <span>Línea de tiempo</span></span>
      <div className="pl-track">
        <div className="pl-rail" /><div className="pl-fill" style={{ width: (hours / 24 * 100) + '%' }} />
        {ticks.map((h, i) => <i key={i} className={'pl-tick' + (h <= hours ? ' in' : '')} style={{ left: ((24 - h) / 24 * 100) + '%' }} />)}
        <input id="pl-hours" type="range" min="1" max="24" step="1" value={hours} onChange={e => { setPlaying(false); setHours(+e.target.value) }} aria-label="Horas hacia atrás" style={{ direction: 'rtl' }} />
      </div>
      <span className="pl-time-v">{hours >= 24 ? 'Últimas 24 h' : 'Última' + (hours === 1 ? ' hora' : 's ' + hours + ' h')}</span>
      <button className="btn ghost sm" onClick={() => { if (playing) setPlaying(false); else { setHours(1); setPlaying(true) } }}>{playing ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Reproducir el día</>}</button>
    </div>}
    {!pinMode && !drop && <div className="pin-tip glass">Clic derecho en el mapa para publicar ahí</div>}
  </div>
}

function CityPanel({ city, posts, active, user, onClose, onOpen, onChat, onStory, requireUser, flash, onStreets }) {
  const [tab, setTab] = useState('ahora'); const [room, setRoom] = useState(null)
  const g = cityInfo(city), cover = posts.find(p => p.id === active) || posts[0]
  const ordered = active ? [...posts.filter(p => p.id === active), ...posts.filter(p => p.id !== active)] : posts
  const people = [...new Map(posts.map(p => [p.author, p])).values()]
  const planes = posts.filter(p => p.cat === 'planes' || p.cat === 'eventos')
  useEffect(() => { setTab('ahora') }, [city])
  useEffect(() => { let t; const f = () => api.room(city).then(setRoom).catch(() => {}); f(); t = setInterval(f, 5000); return () => clearInterval(t) }, [city])
  return <aside className="city glass">
    <div className="city-head">{cover && <Media post={cover} h={128} radius={0} />}<div className="city-shade" />
      <button className="pl-f-x" onClick={onClose} aria-label="Cerrar ciudad"><X size={15} /></button>
      <div className="city-t"><div className="cap-s" style={{ color: '#fff' }}>Ciudad</div><div className="city-n">{city}</div><div className="city-m">{g.country} · {localTime(city)} · {posts.length} {posts.length === 1 ? 'publicación' : 'publicaciones'}{room?.people ? ' · ' + room.people + ' en la sala hoy' : ''}</div></div></div>
    <div className="chips city-tabs">{[['ahora', 'Ahora'], ['historias', 'Historias'], ['sala', 'Sala'], ['personas', 'Personas'], ['planes', 'Planes']].map(([id, l]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}{id === 'sala' && room?.messages?.length ? <i className="sala-dot" /> : null}</button>)}</div>
    <div className="city-body">
      {tab === 'ahora' && <>{ordered.map(p => <button key={p.id} className={'pl-item' + (p.id === active ? ' on' : '')} onClick={() => onOpen(p.id)}><span className="pl-thumb"><Media post={p} h={58} radius={6} /></span><span className="pl-it"><TypeTag type={p.type} /><span className="pl-it-t">{p.title}</span><span className="meta">{p.author} · {ago(p.at)}</span></span></button>)}
        <div className="city-actions"><button className="btn ghost sm" onClick={onStreets}><MapPin size={14} /> Ver calles</button></div></>}
      {tab === 'historias' && <div className="city-stories">{posts.map(p => <button key={p.id} className="story" onClick={() => onStory(city)}><div className={'story-ring' + (p.type === 'directo' ? ' live' : '')}><Media post={p} h={62} radius={999} /></div><span>{p.author.split(' ')[0]}</span></button>)}
        <button className="btn sm" style={{ gridColumn: '1/-1' }} onClick={() => onStory(city)}><Play size={13} /> Ver historias de {city}</button></div>}
      {tab === 'sala' && <RoomChat city={city} room={room} setRoom={setRoom} user={user} requireUser={requireUser} flash={flash} />}
      {tab === 'personas' && (people.length ? people.map(p => <div key={p.author} className="list-row"><Avatar name={p.author} hue={p.hue} size={32} /><div className="grow"><div className="name">{p.author}</div><div className="meta">@{p.handle}</div></div>{!p.mine && !p.author_example && <button className="btn ghost sm" onClick={() => onChat(p.author_id)}><MessagesSquare size={14} /> Mensaje</button>}</div>) : <div className="empty">Nadie ha publicado aquí todavía.</div>)}
      {tab === 'planes' && (planes.length ? planes.map(p => <button key={p.id} className="pl-item" onClick={() => onOpen(p.id)}><span className="pl-thumb"><Media post={p} h={58} radius={6} /></span><span className="pl-it"><span className="pl-it-t">{p.title}</span><span className="meta">{catLabel(p.cat)}{p.joined != null ? ' · ' + p.joined + ' se unen' : ''}</span></span></button>) : <div className="empty">No hay planes en {city} ahora. Suelta uno en el mapa.</div>)}
    </div>
  </aside>
}

function RoomChat({ city, room, setRoom, user, requireUser, flash }) {
  const [t, setT] = useState(''); const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [room?.messages?.length])
  const send = async e => { e.preventDefault(); if (!requireUser() || !t.trim()) return; try { setRoom(await api.roomSend(city, t.trim())); setT('') } catch (x) { flash(x.message) } }
  return <div className="room">
    <div className="room-h"><span className="tag tag-directo"><i className="dot" />Sala en vivo</span><b className="grow">Lo que pasa hoy en {city}</b></div>
    <div className="room-msgs">{!room ? <p className="muted small">Cargando…</p> : room.messages.length ? room.messages.map(m => <div key={m.id} className={'room-m' + (m.mine ? ' mine' : '')}>{!m.mine && <Avatar name={m.author} hue={m.hue} size={26} />}<div className="msg"><p>{!m.mine && <b>{m.author.split(' ')[0]} · </b>}{m.text}</p><span>{ago(m.at)}</span></div></div>) : <p className="muted small" style={{ padding: '12px 0' }}>La sala de {city} está en silencio. Escribe el primer mensaje.</p>}<div ref={end} /></div>
    <form className="comment-box" onSubmit={send}><input id="room-input" placeholder={user ? 'Escribe a la sala de ' + city + '…' : 'Inicia sesión para escribir'} value={t} onChange={e => setT(e.target.value)} maxLength={1000} autoComplete="off" /><button className="icon accent" aria-label="Enviar"><Send size={16} /></button></form>
  </div>
}

function PinComposer({ drop, onCancel, onDone }) {
  const city = nearest(drop.lat, drop.lon)
  const [cat, setCat] = useState('eventos'); const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [image, setImage] = useState(null); const [live, setLive] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const pick = async e => { const f = e.target.files?.[0]; if (!f) return; try { setImage(await shrinkImage(f)) } catch (x) { setErr(x.message) } }
  const ok = title.trim().length > 2 && !busy
  const submit = async e => { e.preventDefault(); if (!ok) return; setBusy(true); setErr(''); try { const d = await api.create({ title, text, cat, image, live, lat: drop.lat, lon: drop.lon }); onDone(d.post) } catch (x) { setErr(x.message) } finally { setBusy(false) } }
  return <form className="composer glass" onSubmit={submit}>
    <div className="row"><div className="cap-s grow">Publicar aquí</div><button type="button" className="pl-f-x static" onClick={onCancel} aria-label="Cancelar"><X size={15} /></button></div>
    <div className="meta"><MapPin size={12} /> Cerca de {city.city}, {city.country} · {drop.lat.toFixed(3)}, {drop.lon.toFixed(3)}</div>
    <label className="upload small-up">{image ? <img src={image} alt="" /> : <><ImagePlus size={22} strokeWidth={1.5} /><span>Foto</span></>}<input id="pin-photo" type="file" accept="image/*" onChange={pick} hidden /></label>
    <input id="pin-title" className="field" placeholder="¿Qué está pasando aquí?" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} autoFocus />
    <textarea id="pin-text" className="field" rows={2} placeholder="Cuéntalo en pocas palabras (opcional)" value={text} onChange={e => setText(e.target.value)} maxLength={2000} />
    <div className="chips wrap">{[['eventos', 'Evento'], ['lugares', 'Lugar'], ['planes', 'Plan'], ['noticias', 'Noticia'], ['deportes', 'Deporte'], ['cotidiano', 'Vida cotidiana']].map(([id, l]) => <button type="button" key={id} className={cat === id ? 'on' : ''} onClick={() => setCat(id)}>{l}</button>)}</div>
    <label className="toggle"><span><Radio size={15} /> En directo</span><input id="pin-live" type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /><i /></label>
    {err && <div className="banner">{err}</div>}
    <button className="btn block" disabled={!ok}>{busy ? 'Publicando…' : 'Soltar en el planeta'}</button>
  </form>
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

function ComunidadScreen({ posts, user, card, onAuth, onLogout, onOpen, onChat }) {
  const [view, setView] = useState('personas')
  const [people, setPeople] = useState(null), [activity, setActivity] = useState(null)
  useEffect(() => { api.people().then(d => setPeople(d.people)).catch(() => setPeople([])); api.activity().then(d => setActivity(d.activity)).catch(() => setActivity([])) }, [posts.length])
  const mine = posts.filter(p => p.mine), savedPosts = posts.filter(p => p.saved)
  return <>
    <Header title="Comunidad" sub="Personas que comparten lo que pasa en el mundo." />
    {user ? <div className="profile"><Avatar name={user.name} hue={user.hue} size={44} /><div className="grow"><div className="name lg">{user.name}</div><div className="meta">@{user.handle} · {user.city}</div></div>
      <div className="stats"><div><b>{mine.length}</b><span>Publicaciones</span></div><div><b>{savedPosts.length}</b><span>Guardadas</span></div></div></div>
      : <div className="profile cta"><div className="grow"><div className="name lg">Únete a PLANETA</div><div className="meta">Crea tu cuenta para publicar, comentar y guardar.</div></div><button className="btn sm" onClick={() => onAuth('register')}>Crear cuenta</button><button className="btn ghost sm" onClick={() => onAuth('login')}>Entrar</button></div>}
    <Chips value={view} onChange={setView} items={[['personas', 'Personas'], ['actividad', 'Actividad'], ['mias', 'Mis publicaciones'], ['guardadas', 'Guardadas']]} />
    {view === 'personas' && (people === null ? <Empty text="Cargando…" /> : people.length ? <div className="list">{people.map(u => <div key={u.id} className="list-row"><Avatar name={u.name} hue={u.hue} size={32} /><div className="grow"><div className="name">{u.name}</div><div className="meta">@{u.handle} · {u.city}</div></div><span className="muted">{u.posts} {u.posts === 1 ? 'publicación' : 'publicaciones'}</span>{user?.id !== u.id && <button className="btn ghost sm" onClick={() => onChat(u.id)}><MessagesSquare size={15} /> Mensaje</button>}</div>)}</div> : <Empty text="Aún no hay personas registradas. Crea la primera cuenta." />)}
    {view === 'actividad' && (activity === null ? <Empty text="Cargando…" /> : activity.length ? <div className="list">{activity.map(a => <button key={a.id} className="list-row" onClick={() => onOpen(a.post_id)}><Avatar name={a.author} hue={a.hue} size={32} /><div className="grow"><div className="name">{a.author} <span className="meta" style={{ display: 'inline' }}>comentó en {a.title}</span></div><div className="meta clip">“{a.text}” · {ago(a.at)}</div></div></button>)}</div> : <Empty text="Todavía no hay comentarios. Abre una publicación y escribe el primero." />)}
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

function PostDetail({ id, user, onChat, onClose, onToggle, requireUser, flash, onDeleted, onChanged }) {
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
      <div className="author"><Avatar name={post.author} hue={post.hue} size={42} /><div className="grow"><div className="name">{post.author}</div><div className="meta"><MapPin size={12} /> {post.city}, {cityInfo(post.city)?.country}</div></div>{!post.mine && !post.author_example && <button className="btn ghost sm" onClick={() => onChat(post.author_id)}><MessagesSquare size={15} /> Mensaje</button>}</div>
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
const NAV = [['planeta', Globe, 'Planeta'], ['ahora', Newspaper, 'Ahora'], ['cerca', Compass, 'Explorar cerca'], ['mensajes', MessagesSquare, 'Mensajes'], ['comunidad', Users, 'Comunidad']]
function Sidebar({ tab, setTab, goPublish, user, unread, onAuth }) {
  return <aside className="side rail">
    <button className="rail-logo" onClick={() => setTab('planeta')} aria-label="PLANETA" title="PLANETA"><span className="logo" /></button>
    <nav className="side-nav">{NAV.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-label={label} data-tip={label}><Icon size={20} strokeWidth={1.75} />{id === 'mensajes' && unread > 0 && <i className="badge">{unread}</i>}</button>)}
      <button className="rail-pub" onClick={goPublish} aria-label="Publicar" data-tip="Publicar"><Plus size={20} /></button></nav>
    {user ? <button className={'rail-me' + (tab === 'huella' ? ' on' : '')} onClick={() => setTab('huella')} aria-label={'Tu huella: ' + user.name} data-tip="Tu huella"><Avatar name={user.name} hue={user.hue} size={34} /></button>
      : <button className="rail-me" onClick={onAuth} aria-label="Entrar o crear cuenta" data-tip="Entrar o crear cuenta"><span className="rail-in"><Users size={18} /></span></button>}
  </aside>
}
function AsideActivity({ posts, onOpen }) {
  const [act, setAct] = useState([]), [st, setSt] = useState(null)
  useEffect(() => { api.activity().then(d => setAct(d.activity.slice(0, 4))).catch(() => {}); api.stats().then(setSt).catch(() => {}) }, [posts])
  return <>
    <div className="panel"><div className="panel-h"><MessageCircle size={16} /> Comentarios recientes</div>
      {act.length ? act.map(a => <button key={a.id} className="panel-row" onClick={() => onOpen(a.post_id)}><Avatar name={a.author} hue={a.hue} size={26} /><div className="grow"><div className="panel-t">{a.author}: “{a.text}”</div><div className="meta clip">{a.title}</div></div></button>) : <p className="muted small" style={{ padding: 6 }}>Aún no hay comentarios.</p>}</div>
    {st && <div className="panel stats-panel"><div><b>{st.users}</b><span>Personas</span></div><div><b>{st.posts}</b><span>Publicaciones</span></div><div><b>{st.comments}</b><span>Comentarios</span></div></div>}
  </>
}
function Aside({ posts, onOpen, goMap }) {
  const live = posts.filter(p => p.type === 'directo').slice(0, 3)
  const top = Object.entries(posts.reduce((a, p) => (a[p.city] = (a[p.city] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 4)
  return <aside className="aside">
    <div className="panel"><div className="panel-h"><Radio size={16} /> En directo ahora</div>
      {live.map(p => <button key={p.id} className="panel-row" onClick={() => onOpen(p.id)}><Media post={p} h={48} radius={10} /><div className="grow"><div className="panel-t">{p.title}</div><div className="meta">{p.city} · {ago(p.at)}</div></div><ChevronRight size={14} className="dim" /></button>)}</div>
    <div className="panel"><div className="panel-h"><MapPin size={16} /> Ciudades activas</div>
      {top.map(([c, n]) => <button key={c} className="panel-row simple" onClick={goMap}><MapPin size={14} className="dim" /><span className="grow">{c}</span><span className="count">{n}</span><ChevronRight size={14} className="dim" /></button>)}</div>
    <AsideActivity posts={posts} onOpen={onOpen} />
    <p className="foot">PLANETA · 2026</p>
  </aside>
}
function Stories({ posts, onStory }) {
  const seen = new Set(), items = []
  for (const p of posts) if (!seen.has(p.city)) { seen.add(p.city); items.push(p) }
  return <div className="stories">{items.slice(0, 14).map(p => <button key={p.city} className="story" onClick={() => onStory(p.city)} title={'Ver historias de ' + p.city}><div className={'story-ring' + (p.type === 'directo' ? ' live' : '')}><Media post={p} h={62} radius={999} /></div><span>{p.city}</span></button>)}</div>
}

function StoryViewer({ city, posts, onClose, onOpen }) {
  const cities = [...new Set(posts.map(p => p.city))]
  const [c, setC] = useState(city), [i, setI] = useState(0), [paused, setPaused] = useState(false)
  const items = posts.filter(p => p.city === c)
  const cur = items[i]
  const next = () => { if (i < items.length - 1) setI(i + 1); else { const k = cities.indexOf(c); if (k < cities.length - 1) { setC(cities[k + 1]); setI(0) } else onClose() } }
  const prev = () => { if (i > 0) setI(i - 1); else { const k = cities.indexOf(c); if (k > 0) { setC(cities[k - 1]); setI(0) } } }
  useEffect(() => { if (paused) return; const t = setTimeout(next, 5000); return () => clearTimeout(t) }, [c, i, paused])
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) })
  if (!cur) return null
  return <div className="sv-bg" onClick={onClose}><div className="sv" onClick={e => e.stopPropagation()} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)}>
    <Media post={cur} h="100%" radius={0} />
    <div className="sv-shade" />
    <div className="sv-bars">{items.map((_, k) => <i key={k}><b className={k < i ? 'done' : k === i ? (paused ? 'run paused' : 'run') : ''} key={c + i} /></i>)}</div>
    <div className="sv-head"><Avatar name={cur.author} hue={cur.hue} size={30} /><div className="grow"><div className="name">{c}</div><div className="meta">{cur.author} · {ago(cur.at)}</div></div><button className="sv-x" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>
    <button className="sv-tap l" onClick={prev} aria-label="Anterior" /><button className="sv-tap r" onClick={next} aria-label="Siguiente" />
    <div className="sv-foot"><TypeTag type={cur.type} glass /><div className="cat">{catLabel(cur.cat)}</div><h3>{cur.title}</h3>{cur.text && <p>{cur.text}</p>}<button className="btn sm" onClick={() => onOpen(cur.id)}>Ver publicación</button></div>
  </div></div>
}

function ChatDock({ chats, docks, setDocks, openChat, unread, onChange, me, onCities }) {
  const [listOpen, setListOpen] = useState(false)
  const [names, setNames] = useState({})
  useEffect(() => { const f = () => setListOpen(o => !o); addEventListener('planeta:chats', f); return () => removeEventListener('planeta:chats', f) }, [])
  useEffect(() => { docks.forEach(d => { if (!names[d.id]) { const c = chats.find(x => x.id === d.id); if (c) setNames(n => ({ ...n, [d.id]: c })); else api.chat(d.id).then(r => setNames(n => ({ ...n, [d.id]: r.user }))).catch(() => {}) } }) }, [docks, chats])
  useEffect(() => { onCities?.(docks.map(d => names[d.id]?.city).filter(Boolean)) }, [docks, names])
  const close = id => setDocks(ds => ds.filter(d => d.id !== id))
  const toggle = id => setDocks(ds => ds.map(d => d.id === id ? { ...d, min: !d.min } : d))
  return <div className="dock">
    {docks.map(d => { const u = names[d.id], c = chats.find(x => x.id === d.id)
      return <div key={d.id} className={'dock-win' + (d.min ? ' min' : '')}>
        <div className="dock-head" onClick={() => toggle(d.id)}>
          {u ? <Avatar name={u.name} hue={u.hue} size={26} /> : <span style={{ width: 26 }} />}
          <div className="grow"><div className="name clip">{u?.name || '…'}</div>{u?.city ? <div className="meta clip">{u.city}{me?.city && me.city !== u.city ? ' · ' + Math.round(km(cityInfo(me.city), cityInfo(u.city))).toLocaleString('es-CO') + ' km' : ''} · {localTime(u.city)} allá</div> : u?.handle && <div className="meta">@{u.handle}</div>}</div>
          {c?.unread > 0 && d.min && <i className="badge">{c.unread}</i>}
          <button aria-label={d.min ? 'Abrir' : 'Minimizar'} onClick={e => { e.stopPropagation(); toggle(d.id) }}><Minus size={15} /></button>
          <button aria-label="Cerrar chat" onClick={e => { e.stopPropagation(); close(d.id) }}><X size={15} /></button>
        </div>
        {!d.min && <Thread id={d.id} compact onBack={() => close(d.id)} onChange={onChange} />}
      </div> })}
    <div className={'dock-list' + (listOpen ? ' open' : '')}>
      <button className="dock-bar" onClick={() => setListOpen(o => !o)}><MessagesSquare size={16} /><span className="grow">Chats</span>{unread > 0 && <i className="badge">{unread}</i>}{listOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      {listOpen && <div className="dock-items">{chats.length ? chats.map(c => <button key={c.id} className="list-row" onClick={() => openChat(c.id)}><Avatar name={c.name} hue={c.hue} size={30} /><div className="grow"><div className="name">{c.name}</div><div className="meta clip">{c.last_mine ? 'Tú: ' : ''}{c.last_text}</div></div>{c.unread > 0 && <i className="badge">{c.unread}</i>}</button>)
        : <p className="muted small" style={{ padding: 14 }}>Sin conversaciones. Pulsa «Mensaje» en una publicación o en Personas.</p>}</div>}
    </div>
  </div>
}

function MensajesScreen({ user, chatWith, setChatWith, onAuth, onRead }) {
  const [chats, setChats] = useState(null)
  const loadChats = () => api.chats().then(d => setChats(d.chats)).catch(() => setChats([]))
  useEffect(() => { if (user) { loadChats(); const t = setInterval(loadChats, 8000); return () => clearInterval(t) } }, [user])
  if (!user) return <><Header title="Mensajes" sub="Conversaciones privadas con otras personas." /><div className="profile cta"><div className="grow"><div className="name lg">Inicia sesión para chatear</div><div className="meta">Escribe a quien publica algo que te interesa.</div></div><button className="btn sm" onClick={() => onAuth('register')}>Crear cuenta</button><button className="btn ghost sm" onClick={() => onAuth('login')}>Entrar</button></div></>
  return <><Header title="Mensajes" sub="Conversaciones privadas con otras personas." />
    <div className={'chat-wrap' + (chatWith ? ' has-thread' : '')}>
      <div className="chat-list">{chats === null ? <Empty text="Cargando…" /> : chats.length ? chats.map(c => <button key={c.id} className={'list-row' + (chatWith === c.id ? ' on' : '')} onClick={() => setChatWith(c.id)}><Avatar name={c.name} hue={c.hue} size={34} /><div className="grow"><div className="name">{c.name}</div><div className="meta clip">{c.last_mine ? 'Tú: ' : ''}{c.last_text}</div></div><div className="chat-side"><span className="meta">{ago(c.last_at)}</span>{c.unread > 0 && <i className="badge">{c.unread}</i>}</div></button>)
        : <Empty text="Aún no tienes conversaciones. Abre una publicación o la lista de Personas y pulsa Mensaje." />}</div>
      {chatWith ? <Thread id={chatWith} onBack={() => setChatWith(null)} onChange={() => { loadChats(); onRead() }} /> : <div className="chat-thread empty-thread"><MessagesSquare size={28} strokeWidth={1.5} /><span>Elige una conversación</span></div>}
    </div></>
}

function Thread({ id, onBack, onChange, compact }) {
  const [data, setData] = useState(null), [t, setT] = useState(''), [err, setErr] = useState('')
  const end = useRef(null)
  const load = () => api.chat(id).then(d => { setData(prev => { if (!prev || prev.messages.length !== d.messages.length) setTimeout(() => end.current?.scrollIntoView({ block: 'end' }), 0); return d }) }).catch(e => setErr(e.message))
  useEffect(() => { setData(null); load().then(onChange); const k = setInterval(load, 4000); return () => clearInterval(k) }, [id])
  const send = async e => { e.preventDefault(); if (!t.trim()) return; try { const d = await api.sendMsg(id, t.trim()); setT(''); setData(d); onChange(); setTimeout(() => end.current?.scrollIntoView({ block: 'end' }), 0) } catch (x) { setErr(x.message) } }
  if (!data) return <div className="chat-thread"><Empty text={err || 'Cargando…'} /></div>
  return <div className="chat-thread">
    {!compact && <div className="th-head"><button className="icon th-back" onClick={onBack} aria-label="Volver"><ChevronLeft size={18} /></button><Avatar name={data.user.name} hue={data.user.hue} size={30} /><div><div className="name">{data.user.name}</div><div className="meta">@{data.user.handle} · {data.user.city}</div></div></div>}
    <div className="th-msgs">{data.messages.length === 0 && <p className="muted small" style={{ textAlign: 'center', padding: 20 }}>Saluda a {data.user.name.split(' ')[0]}.</p>}
      {data.messages.map(m => <div key={m.id} className={'msg' + (m.mine ? ' mine' : '')}><p>{m.text}</p><span>{ago(m.at)}</span></div>)}<div ref={end} /></div>
    {err && <div className="banner">{err}</div>}
    <form className="comment-box" onSubmit={send}><input id={compact ? 'dock-input-' + id : 'msg-input'} autoFocus={compact} placeholder="Escribe un mensaje…" value={t} onChange={e => setT(e.target.value)} maxLength={2000} autoComplete="off" /><button className="icon accent" aria-label="Enviar"><Send size={16} /></button></form>
  </div>
}
function Empty({ text }) { return <div className="empty">{text}</div> }

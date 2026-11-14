import { useEffect, useMemo, useRef, useState } from 'react'
import { Globe, Newspaper, Plus, Compass, Users, Search, X, MapPin, ImagePlus, Send, ChevronLeft, Radio, Heart, MessageCircle, Bookmark, Trash2, Flag, ShieldCheck, Globe2, BadgeCheck, Share2, Link2, Star, Bell, Pencil, Clock, Play, MessagesSquare, CloudSun, Video, ChevronRight, ChevronDown, Minus } from 'lucide-react'
import { ME, CATEGORIES, CITIES, cityInfo, homeOf, registerPlaces, catLabel, localTime } from './data'
import { SiteCtx, DEFAULT_SITE, useSite, t, applyTheme, openSell } from './site'
import RadioBar, { RadioLogo } from './components/RadioBar'
import { useRadio, play as playRadio } from './radio'
import Brand from './components/Brand'
import { lazy, Suspense } from 'react'
const Admin = lazy(() => import('./components/Admin'))
const Map25D = lazy(() => import('./components/Map25D'))
import Sell from './components/Sell'
import { WalkPanel, LiveWalksStrip, StartWalk } from './components/Walks'
import { useWalks } from './walks'
import { useLive } from './live'
import { CamPanel } from './components/Cams'
import MatchEvents from './components/MatchEvents'
import GoalAlert from './components/GoalAlert'
import CityPulse from './components/CityPulse'
import FestInfo from './components/FestInfo'
import { PlacePicker, ProfileEdit, NotificationsButton, usePlaceSearch, BIZ } from './components/Extras'
import { api, shrinkImage, prepareImage, prepareVideo, uploadMedia } from './api'
import { ago, km, fmt } from './util'
import { Avatar, Media, TypeTag, Translatable } from './components/ui'
import PostCard from './components/PostCard'
import WorldMap from './components/WorldMap'
import Globe3D from './components/Globe'


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
  const [mobile, setMobile] = useState(() => !window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => { const q = window.matchMedia('(min-width: 1024px)'); const f = () => setMobile(!q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f) }, [])
  const inMap = !mobile || tab === 'planeta' || tab === 'huella'
  const [chatCities, setChatCities] = useState([])
  useEffect(() => { if (!user) { setUnread(0); setChats([]); setDocks([]); return } const f = () => api.chats().then(d => { setChats(d.chats); setUnread(d.unread) }).catch(() => {}); f(); addEventListener('planeta:dm', f); const t = setInterval(f, 60000); return () => { clearInterval(t); removeEventListener('planeta:dm', f) } }, [user])
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

  const [site, setSite] = useState(DEFAULT_SITE)
  const [adminOpen, setAdminOpen] = useState(() => location.hash === '#admin')
  const loadSite = () => fetch('/api/settings').then(r => r.json()).then(st => { applyLists(st); setSite(st); applyTheme(st) }).catch(() => {})
  useEffect(() => { loadSite(); addEventListener('planeta:settings', loadSite); return () => removeEventListener('planeta:settings', loadSite) }, [])
  useEffect(() => { const f = () => setAdminOpen(location.hash === '#admin'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const isStaff = user && (user.role === 'admin' || user.role === 'mod')
  const [profileOpen, setProfileOpen] = useState(false)
  const [sell, setSell] = useState(null)
  useEffect(() => { const f = e => setSell(e.detail); addEventListener('planeta:sell', f); return () => removeEventListener('planeta:sell', f) }, [])
  // regreso desde la pasarela de pago: confirmar y activar
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get('ref'); if (location.pathname !== '/pago' || !ref) return
    history.replaceState(null, '', '/')
    let tries = 0
    const check = () => fetch('/api/pay/verify?ref=' + encodeURIComponent(ref)).then(r => r.json()).then(d => {
      if (d.status === 'paid') { flash(d.item === 'radio' ? 'Pago aprobado. Tu emisora ya está sonando.' : 'Pago aprobado. Tu negocio ya está destacado.'); api.me().then(x => setUser(x.user)).catch(() => {}); load() }
      else if (++tries < 4) setTimeout(check, 4000)
      else flash('Tu pago aún no aparece aprobado. Si pagaste, se activará solo en unos minutos.')
    }).catch(() => flash('No pudimos confirmar el pago. Si pagaste, se activará solo en unos minutos.'))
    check()
  }, [])
  useEffect(() => { const m = /^\/p\/(\d+)$/.exec(location.pathname); if (m) setOpen(+m[1]) }, [])
  useEffect(() => { if (open) { if (location.pathname !== '/p/' + open) history.replaceState(null, '', '/p/' + open) } else if (location.pathname.startsWith('/p/')) history.replaceState(null, '', '/') }, [open])
  const [follows, setFollows] = useState([])
  useEffect(() => { if (user) api.follows().then(d => setFollows(d.follows)).catch(() => {}); else setFollows([]) }, [user?.id])
  const toggleFollow = async (kind, value) => { if (!requireUser()) return; try { const d = await api.follow(kind, value); setFollows(d.follows); flash(d.follows.some(f => f.kind === kind && f.value === value) ? 'Te avisaremos de lo nuevo en ' + (kind === 'cat' ? catLabel(value) : value) : 'Dejaste de seguir ' + (kind === 'cat' ? catLabel(value) : value)) } catch (e) { flash(e.message) } }
  const isFollowing = (kind, value) => follows.some(f => f.kind === kind && f.value === value)
  useEffect(() => { if (user) registerPlaces([user]) }, [user])
  const [more, setMore] = useState(false)
  const [videoMax, setVideoMax] = useState(60)
  const load = () => api.posts().then(d => { registerPlaces(d.posts); setPosts(d.posts); setMore(d.more); setError('') }).catch(e => setError(e.message)).finally(() => setLoading(false))
  const loadMore = () => { const last = posts[posts.length - 1]; if (last) api.posts(last.at).then(d => { registerPlaces(d.posts); setPosts(ps => [...ps, ...d.posts.filter(n => !ps.some(o => o.id === n.id))]); setMore(d.more) }).catch(e => flash(e.message)) }
  useEffect(() => { api.me().then(d => { setUser(d.user); if (d.videoMaxSeconds) setVideoMax(d.videoMaxSeconds) }).catch(() => {}); load() }, [])
  // live events from the server: new posts, messages, room and comments (no constant polling)
  useEffect(() => {
    let es, t
    const connect = () => { es = new EventSource('/api/events'); es.onmessage = e => { let ev; try { ev = JSON.parse(e.data) } catch { return }
      if (ev.type === 'post') { clearTimeout(t); t = setTimeout(load, 400) }
      window.dispatchEvent(new CustomEvent('planeta:' + ev.type, { detail: ev })) } }
    connect(); return () => { es?.close(); clearTimeout(t) }
  }, [user?.id])

  const requireUser = () => { if (!user) { setAuth('login'); return false } return true }
  const replace = p => setPosts(ps => ps.map(x => x.id === p.id ? { ...x, ...p } : x))
  const toggle = async (id, what) => { if (!requireUser()) return; try { const d = await api.toggle(id, what); replace(d.post); return d.post } catch (e) { flash(e.message) } }
  const cardProps = { onOpen: p => setOpen(p.id), onLike: id => toggle(id, 'like'), onSave: id => toggle(id, 'save') }
  const card = p => <PostCard key={p.id} post={p} liked={p.liked} saved={p.saved} {...cardProps} />
  const goPublish = () => { if (requireUser()) { setTab('planeta'); setPinReq(n => n + 1) } }

  return (<SiteCtx.Provider value={site}>
    <div className={'app' + (inMap ? ' wide' : '') + (user ? ' logged' : '')}>
      <Sidebar notif={<NotificationsButton user={user} tipRight onOpenPost={id => setOpen(id)} onOpenChat={openChat} />} isStaff={isStaff} onAdmin={() => { location.hash = 'admin' }} tab={tab} setTab={id => { window.dispatchEvent(new Event('planeta:closecity')); if (id === 'planeta') window.dispatchEvent(new Event('planeta:world')); setTab(id) }} goPublish={goPublish} user={user} unread={unread} onAuth={() => setAuth('login')} />
      <main className="screen">
        {error && <div className="banner">{error} <button className="link" onClick={load}>Reintentar</button></div>}
        {inMap && <PlanetaScreen follow={{ follows, toggleFollow, isFollowing }} onEditProfile={() => setProfileOpen(true)} posts={posts} user={user} card={card} hasMore={more} onMore={loadMore} videoMax={videoMax} mode={tab === 'huella' ? 'huella' : tab === 'ahora' ? 'muro' : ['cerca', 'mensajes', 'comunidad'].includes(tab) ? 'panel' : 'explorar'}
          side={tab === 'cerca' ? <CercaScreen posts={posts} card={card} user={user} /> : tab === 'mensajes' ? <MensajesScreen user={user} chatWith={chatWith} setChatWith={setChatWith} onAuth={setAuth} onRead={() => api.chats().then(d => setUnread(d.unread)).catch(() => {})} /> : tab === 'comunidad' ? <ComunidadScreen follow={{ follows, toggleFollow, isFollowing }} onEditProfile={() => setProfileOpen(true)} posts={posts} user={user} card={card} onAuth={setAuth} onOpen={id => setOpen(id)} onChat={openChat} onLogout={async () => { await api.logout(); setUser(null); load(); flash('Sesión cerrada') }} /> : null} onOpen={id => setOpen(id)} onChat={openChat} onStory={setStory} pinReq={pinReq} requireUser={requireUser} onPublished={p => { registerPlaces([p]); setPosts(ps => [p, ...ps]); flash(t(site, 'published')) }} chatCities={chatCities} flash={flash} />}
        
        {tab === 'ahora' && mobile && <AhoraScreen posts={posts} card={card} loading={loading} user={user} onStory={setStory} hasMore={more} onMore={loadMore} />}
        {mobile && tab === 'mensajes' && <MensajesScreen user={user} chatWith={chatWith} setChatWith={setChatWith} onAuth={setAuth} onRead={() => api.chats().then(d => setUnread(d.unread)).catch(() => {})} />}
        {tab === 'publicar' && <PublicarScreen user={user} onCancel={() => setTab('ahora')} onPublished={p => { setPosts(ps => [p, ...ps]); setTab('ahora'); flash(t(site, 'published')) }} />}
        {mobile && tab === 'cerca' && <CercaScreen posts={posts} card={card} user={user} />}
        {mobile && tab === 'comunidad' && <ComunidadScreen follow={{ follows, toggleFollow, isFollowing }} onEditProfile={() => setProfileOpen(true)} posts={posts} user={user} card={card} onAuth={setAuth} onOpen={id => setOpen(id)} onChat={openChat} onLogout={async () => { await api.logout(); setUser(null); load(); flash('Sesión cerrada') }} />}
      </main>
      {!inMap && <Aside posts={posts} onOpen={id => setOpen(id)} goMap={() => setTab('planeta')} />}
      {tab !== 'publicar' && <nav className="tabbar">
        {[['ahora', Newspaper, 'Ahora'], ['planeta', Globe, 'Mapa'], ['publicar', Plus, 'Publicar'], ['mensajes', MessagesSquare, 'Mensajes'], ['comunidad', Users, 'Comunidad']].map(([id, Icon, label]) =>
          <button key={id} aria-label={label} className={(tab === id ? 'on ' : '') + (id === 'publicar' ? 'pub' : '')} onClick={() => { if (id === 'publicar') return goPublish(); if (id === 'planeta') { window.dispatchEvent(new Event('planeta:closecity')); window.dispatchEvent(new Event('planeta:world')) } setTab(id) }}><span className="ico"><Icon size={id === 'publicar' ? 22 : 20} strokeWidth={1.75} />{id === 'mensajes' && unread > 0 && <i className="badge">{unread}</i>}</span><span>{label}</span></button>)}
      </nav>}
      {story && <StoryViewer city={story} posts={posts} onClose={() => setStory(null)} onOpen={id => { setStory(null); setOpen(id) }} />}
      {open && <PostDetail id={open} user={user} onChat={openChat} onClose={() => setOpen(null)} onToggle={toggle} requireUser={requireUser} flash={flash}
        onDeleted={id => { setPosts(ps => ps.filter(p => p.id !== id)); setOpen(null); flash('Publicación eliminada') }} onChanged={replace} />}
      {auth && <AuthModal mode={auth} setMode={setAuth} onClose={() => setAuth(null)} onDone={u => { setUser(u); setAuth(null); load(); flash('Hola, ' + u.name.split(' ')[0]) }} />}
      {(!user || mobile) && <RadioBar />}
      {user && <ChatDock chats={chats} docks={docks} setDocks={setDocks} openChat={openChat} unread={unread} onChange={refreshChats} me={user} onCities={setChatCities} />}
      {profileOpen && user && <ProfileEdit user={user} onClose={() => setProfileOpen(false)} onSaved={u => { setUser(u); registerPlaces([u]); setProfileOpen(false); load(); flash('Perfil actualizado') }} />}
      {mobile && <NotificationsButton user={user} className="notif-mobile" onOpenPost={id => setOpen(id)} onOpenChat={openChat} />}
      {adminOpen && isStaff && <Suspense fallback={<div className="toast">Cargando panel…</div>}><Admin user={user} flash={flash} onSettings={st => { applyLists(st); setSite(st); applyTheme(st) }} onClose={() => { history.replaceState(null, '', location.pathname); setAdminOpen(false) }} /></Suspense>}
      {sell && <Sell kind={sell} onKind={setSell} user={user} flash={flash} onClose={() => setSell(null)} onAuth={m => { setSell(null); setAuth(m) }} onProfile={() => { setSell(null); setProfileOpen(true) }} />}
      <GoalAlert onOpen={id => id && setOpen(id)} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  </SiteCtx.Provider>)
}

function Header({ title, sub, search, setSearch }) {
  const [openS, setOpenS] = useState(false)
  return <header className="top"><div className="grow"><Brand />{title && <h1>{title}</h1>}{sub && <p className="sub">{sub}</p>}</div>
    {setSearch && <div className="top-r">{openS || search ? <div className="search"><Search size={15} /><input id="search" autoFocus placeholder="Buscar lugar, ciudad o tema" value={search} onChange={e => setSearch(e.target.value)} /><button aria-label="Cerrar búsqueda" onClick={() => { setSearch(''); setOpenS(false) }}><X size={15} /></button></div>
      : <button className="icon" aria-label="Buscar" onClick={() => setOpenS(true)}><Search size={19} /></button>}</div>}</header>
}
function Chips({ items, value, onChange }) {
  return <div className="chips">{items.map(([id, label, Icon]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{Icon && <Icon size={14} />}{label}</button>)}</div>
}

function AhoraScreen({ posts, card, loading, user, onStory, hasMore, onMore }) {
  const site = useSite()
  const home = homeOf(user)
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
    <Header title={site.tagline} sub={site.tagline2} search={search} setSearch={setSearch} />
    <Stories posts={posts} onStory={onStory} />
    <Chips value={scope} onChange={setScope} items={[['cerca', 'Cerca de mí'], ['pais', 'Mi país'], ['mundo', 'Mundo'], ['directo', 'En directo', Radio]]} />
    <Chips value={cat} onChange={setCat} items={[['todo', 'Todo'], ...CATEGORIES.map(c => [c.id, c.label])]} />
    <div className="feed">{loading ? <Empty text="Cargando publicaciones…" /> : list.length ? list.map(card) : <Empty text="Aún no hay publicaciones aquí. Sé el primero en compartir algo." />}
      {hasMore && <button className="btn ghost block" onClick={onMore}>Cargar más publicaciones</button>}</div>
  </>
}

const inView = (g, b) => { if (!b) return true; const lon = ((g.lon - b.w) % 360 + 360) % 360; return g.lat >= b.s && g.lat <= b.n && (b.e - b.w >= 360 || lon <= b.e - b.w) }
const nearest = (lat, lon) => CITIES.map(c => [c, (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2]).sort((a, b) => a[1] - b[1])[0][0]
const where = p => p.lat != null && p.lon != null ? { lat: p.lat, lon: p.lon } : cityInfo(p.city)

function PlanetaScreen({ follow, onEditProfile, posts, user, card, side, mode, hasMore, onMore, videoMax, onOpen, onChat, onStory, pinReq, requireUser, onPublished, chatCities, flash }) {
  const [sel, setSel] = useState(null); const [focus, setFocus] = useState(null); const [q, setQ] = useState(''); const [active, setActive] = useState(null)
  const [bounds, setBounds] = useState(null); const [cat, setCat] = useState('todo'); const [sheet, setSheet] = useState(false)
  const [pinMode, setPinMode] = useState(false); const [drop, setDrop] = useState(null)
  const [places, setPlaces] = useState(null), [bizSel, setBizSel] = useState(null)
  // paseos en vivo
  const liveS = useLive(), [camSel, setCamSel] = useState(null), [dailyView, setDailyView] = useState(false), [challenge, setChallenge] = useState(false)
  const cam = camSel && liveS.cams.find(c => c.id === camSel)
  const openCam = id => { setSel(null); setBizSel(null); setWalkSel(null); setWalkRoute(null); setCamSel(id); leaveGlobe() }
  const joinDaily = () => { if (!requireUser()) return; setChallenge(true); setDrop(null); setSel(null); setPinMode(true) }
  // vista de calle en perspectiva (se apaga con el botón "plano" y se recuerda en esta sesión)
  const [street, setStreet] = useState(null), radioS = useRadio()
  const flatRef = useRef((() => { try { return sessionStorage.getItem('flat') === '1' } catch { return false } })())
  const goStreet = (c, z, force) => { if (force) { flatRef.current = false; try { sessionStorage.removeItem('flat') } catch {} } if (flatRef.current || mode === 'huella') return; setStreet({ ...c, zoom: z }) }
  const leaveStreet = v => { setStreet(null); fly(v.lat, v.lon, Math.min(v.zoom, 11.5)) }
  const walksS = useWalks(), [walkSel, setWalkSel] = useState(null), [walkRoute, setWalkRoute] = useState(null), [followWalk, setFollowWalk] = useState(true), [startWalk, setStartWalk] = useState(false)
  const [myWalk, setMyWalk] = useState(null), myWalkRef = useRef(null); myWalkRef.current = myWalk
  const openWalk = id => { setSel(null); setBizSel(null); setWalkSel(id); setFollowWalk(true); leaveGlobe() }
  const beginWalk = (w, real) => {
    setStartWalk(false); openWalk(w.id); fly(w.lat, w.lon, 17)
    if (!real) return
    let last = 0, lock = null
    try { navigator.wakeLock?.request('screen').then(l => { lock = l }).catch(() => {}) } catch {}
    const watch = navigator.geolocation.watchPosition(p => {
      const pos = [p.coords.latitude, p.coords.longitude]; if (p.coords.accuracy > 35) return; setMyWalk(m => m && { ...m, pos })
      if (Date.now() - last < 3000) return; last = Date.now()
      fetch(`/api/walks/${w.id}/pos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: pos[0], lon: pos[1], acc: p.coords.accuracy }) }).catch(() => {})
    }, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 })
    setMyWalk({ id: w.id, pos: [w.lat, w.lon], stop: () => { navigator.geolocation.clearWatch(watch); try { lock?.release() } catch {} } })
  }
  const endWalk = async id => { const m = myWalkRef.current; if (m && m.id === id) { m.stop(); setMyWalk(null) }
    const r = await fetch(`/api/walks/${id}/end`, { method: 'POST' }).catch(() => null); flash(r?.ok ? 'Paseo terminado' : 'No se pudo terminar el paseo. Inténtalo de nuevo.') }
  useEffect(() => () => myWalkRef.current?.stop(), [])
  useEffect(() => { if (!bounds || mode === 'huella') return; if (bounds.z < 11) { setPlaces(null); return } const t = setTimeout(() => fetch(`/api/places?s=${bounds.s}&n=${bounds.n}&w=${bounds.w}&e=${bounds.e}&z=${bounds.z}`).then(r => r.json()).then(setPlaces).catch(() => {}), 300); return () => clearTimeout(t) }, [bounds, mode])
  const [globeAt, setGlobeAt] = useState(null)
  const [globe, setGlobe] = useState(() => { if (location.pathname.startsWith('/p/')) return false; try { return sessionStorage.getItem('globeSeen') !== '1' } catch { return true } })
  const leaveGlobe = () => { setGlobe(false); try { sessionStorage.setItem('globeSeen', '1') } catch {} }
  const home = homeOf(user)
  const qq = q.trim().toLowerCase()
  const site = useSite()
  const huella = mode === 'huella', wall = mode === 'muro'
  const placeHits = usePlaceSearch(huella ? '' : q)
  const [scope, setScope] = useState('vista')
  const mine = useMemo(() => posts.filter(p => p.mine).sort((a, b) => a.at - b.at), [posts])
  const base = huella ? mine : posts.filter(p => (!dailyView || (liveS.daily && p.challenge === liveS.daily.key)) && (cat === 'todo' || p.cat === cat) && (!qq || (p.title + ' ' + p.city + ' ' + cityInfo(p.city).country + ' ' + catLabel(p.cat) + ' ' + p.author).toLowerCase().includes(qq)))
  const points = useMemo(() => base.map(p => ({ ...cityInfo(p.city), post: p })), [posts, cat, qq, huella, dailyView, liveS.daily?.key])
  const isLive = p => p.type === 'directo' || ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(p.match?.st)
  // lo que está EN VIVO va siempre primero (el más reciente arriba); luego el resto en su orden
  // lo EN VIVO de todo el mundo siempre arriba (el más reciente primero); debajo, lo que está en la zona del mapa
  const liveAll = base.filter(isLive).sort((a, b) => b.at - a.at)
  const visible = [...liveAll, ...(wall && scope === 'mundo' ? base : base.filter(p => inView(cityInfo(p.city), bounds))).filter(p => !isLive(p))]
  const vCities = [...new Set(visible.map(p => p.city))], vCountries = [...new Set(visible.map(p => cityInfo(p.city).country))]
  const place = vCities.length === 1 ? vCities[0] + ', ' + cityInfo(vCities[0]).country : vCountries.length === 1 ? vCountries[0] : vCountries.length ? vCountries.length + ' países a la vista' : 'Nada a la vista'
  const regions = (site.regions || []).map(([n, lat, lon, z]) => [n, lon, lat, z])
  const [regOpen, setRegOpen] = useState(false)
  useEffect(() => { const f = () => { setSel(null); setBizSel(null); setWalkSel(null); setWalkRoute(null); setDailyView(false); setCamSel(null) }; addEventListener('planeta:closecity', f); return () => removeEventListener('planeta:closecity', f) }, [])
  useEffect(() => { if (!regOpen) return; const f = e => { if (!e.target.closest('.reg-menu')) setRegOpen(false) }; document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f) }, [regOpen])
  const fly = (lat, lon, z) => setFocus({ lon, lat, z, n: Math.random() })
  const openCity = (c, postId) => { setSel(c); setActive(postId ?? null); setDrop(null); setPinMode(false); const g = cityInfo(c); fly(g.lat, g.lon, 9) }
  const onPin = c => openCity(c, base.find(p => p.city === c)?.id)
  useEffect(() => { if (pinReq) { leaveGlobe(); setPinMode(true); setSel(null); setDrop(null) } }, [pinReq])
  // radio con mapa: sintoniza la emisora más cercana al centro del mapa
  const rs = useRadio()
  useEffect(() => {
    const f = () => {
      if (!bounds) return flash?.('Mueve el mapa primero.')
      const c = { lat: (bounds.s + bounds.n) / 2, lon: (bounds.w + bounds.e) / 2 }
      const near = rs.stations.map(s => { const q = s.lat != null && s.lon != null ? s : cityInfo(s.city); return [s, q.lat || q.lon ? km(c, q) : Infinity] }).filter(x => isFinite(x[1])).sort((a, b) => a[1] - b[1])[0]
      if (!near) return flash?.('Aún no hay emisoras con ubicación.')
      playRadio(near[0]); flash?.('Sintonizando ' + near[0].name + (near[1] > 1 ? ' · a ' + Math.round(near[1]) + ' km del centro del mapa' : ''))
    }
    addEventListener('planeta:tune', f); return () => removeEventListener('planeta:tune', f)
  }, [bounds, rs.stations, flash])
  useEffect(() => { setDailyView(false) }, [mode])
  // volver al mapa del mundo completo (botón Mapa o logo)
  useEffect(() => { const f = () => { setSel(null); setBizSel(null); setWalkSel(null); setWalkRoute(null); setCamSel(null); setStreet(null); setQ(''); setFocus({ lon: -40, lat: 18, z: 2.5, n: Math.random() }) }; addEventListener('planeta:world', f); return () => removeEventListener('planeta:world', f) }, [])
  useEffect(() => { if (huella) { setSel(null); setFocus({ lon: -30, lat: 20, z: 2.5, n: Math.random() }) } }, [huella])
  const place2 = ll => { if (!requireUser()) return; setDrop({ lat: ll.lat, lon: ll.lng }); setPinMode(false); setSel(null) }
  const cats = [['todo', 'Todo'], ['eventos', 'Eventos'], ['planes', 'Planes'], ['lugares', 'Lugares'], ['noticias', 'Noticias'], ['deportes', 'Deportes']]
  const live = visible.filter(p => p.type === 'directo').length
  const footprint = huella ? mine.map(where) : null
  const chatLines = (chatCities || []).map(c => cityInfo(c)).filter(Boolean)

  return <div className={'planet' + (sel ? ' city-open' : '')}>
    <WorldMap points={points} selected={sel} onSelect={onPin} focus={focus} home={home} onBounds={setBounds} pinMode={pinMode} onPlace={place2} drop={drop} footprint={footprint} chatLines={chatLines} places={mode === 'huella' ? null : places} onPlacePick={id => { setSel(null); setWalkSel(null); setBizSel(id) }} onGlobe={!globe && mode === 'explorar' ? () => { setSel(null); setGlobeAt(bounds ? { lat: (bounds.s + bounds.n) / 2, lon: (bounds.w + bounds.e) / 2 } : null); setGlobe(true) } : null} onStreet={goStreet} cams={liveS.cams} onCamPick={openCam} camSel={camSel} walks={walksS.list} walkRoute={walkRoute} onWalkPick={openWalk} followWalk={followWalk && !!walkSel} onZoomOutMax={(lat, lon) => { if (mode === 'explorar' && !pinMode && !drop) { setSel(null); setGlobeAt({ lat, lon }); setGlobe(true) } }} />
    {globe && mode === 'explorar' && <GlobeHome posts={posts} points={points} home={globeAt ? { ...home, lat: globeAt.lat, lon: globeAt.lon } : home} site={site} onEnter={(lat, lon, z) => { leaveGlobe(); fly(lat, lon, z) }} onPick={c => setTimeout(() => openCity(c, posts.find(p => p.city === c)?.id), 50)} onExplore={() => { leaveGlobe(); fly(home.lat, home.lon, 3) }} onNear={() => { leaveGlobe(); fly(home.lat, home.lon, 10) }} onOpen={onOpen} />}
    {!huella && <><div className="pl-search glass pl-search-top"><Search size={15} /><input id="planet-search" placeholder="Buscar en el planeta: ciudad, tema o persona" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />{q && <button onClick={() => setQ('')} aria-label="Borrar"><X size={14} /></button>}
      {placeHits.places.length > 0 && <div className="place-list map-places"><div className="place-h">Ir a un lugar</div>{placeHits.places.map((pl, i) => <button key={i} className="place-item" onClick={() => { setQ(''); fly(pl.lat, pl.lon, 11) }}><MapPin size={13} /><span><b>{pl.city}</b><small>{pl.name}</small></span></button>)}</div>}</div>
    <div className="reg-menu"><button className="glass reg-btn" onClick={() => setRegOpen(o => !o)} aria-expanded={regOpen}><Globe2 size={14} /> Regiones <ChevronDown size={13} /></button>
      {regOpen && <div className="reg-list glass">{regions.map(([n, lon, lat, z]) => <button key={n} onClick={() => { setRegOpen(false); setSel(null); fly(lat, lon, z) }}>{n}</button>)}</div>}</div>
    {!globe && <div className="map-brand"><Brand /></div>}</>}

    {mode === 'panel' ? <aside className="pl-panel glass panelx">{side}</aside>
    : huella ? <aside className="pl-panel glass huella">
      <div className="pl-ph">
        <div className="row" style={{ gap: 12 }}><Avatar name={user?.name || 'Tú'} hue={user?.hue} size={52} src={user?.avatar} /><div className="grow"><div className="pl-place" style={{ margin: 0 }}>{user?.name}</div><div className="meta">{user?.city} · @{user?.handle}</div>{user?.bio && <div className="meta" style={{ display: 'block' }}>{user.bio}</div>}</div><button className="btn ghost sm" onClick={onEditProfile}><Pencil size={13} /> Editar</button></div>
        <div className="fp-stats"><div><b>{new Set(mine.map(p => cityInfo(p.city).country)).size}</b><span>países</span></div><div><b>{new Set(mine.map(p => p.city)).size}</b><span>ciudades</span></div><div><b>{mine.length}</b><span>publicaciones</span></div></div>
        <div className="cap-s" style={{ marginTop: 12 }}>Tu huella</div>
        <p className="meta" style={{ display: 'block', lineHeight: 1.5, margin: '4px 0 12px' }}>La línea dorada une, en orden, los lugares donde has publicado. Tu perfil es tu mapa.</p>
      </div>
      <div className="pl-list">{mine.length ? mine.map((p, i) => <button key={p.id} className="pl-item" onClick={() => { const g = where(p); fly(g.lat, g.lon, 10) }}>
        <span className="fp-n">{i + 1}</span><span className="pl-thumb"><Media small post={p} h={50} radius={6} /></span>
        <span className="pl-it"><span className="pl-it-t">{p.title}</span><span className="meta"><MapPin size={11} /> {p.city} · {ago(p.at)}</span></span></button>)
        : <div className="empty" style={{ margin: 12 }}>Aún no tienes huella. Pulsa + y suelta tu primera publicación en el mapa.</div>}</div>
    </aside>
    : wall ? <aside className="pl-panel glass wall open">
      <div className="wall-bar">
        <select id="wall-scope" value={scope} onChange={e => setScope(e.target.value)} aria-label="Dónde">
          <option value="vista">{t(site, 'inThisView') + ' · ' + place}</option><option value="mundo">Todo el mundo</option></select>
        <select id="wall-cat" value={cat} onChange={e => setCat(e.target.value)} aria-label="Qué">{cats.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        {live > 0 && <span className="wall-live" title={live + ' en directo'}><i className="dot" />{live}</span>}
      </div>
      <Stories posts={posts} onStory={onStory} />
      <div className="pl-list wall-list">{visible.length ? visible.map(p => <div key={p.id} className="wall-item" onMouseEnter={() => setActive(p.id)}>{card(p)}<button className="wall-loc" onClick={() => { const g = where(p); setSel(p.city); fly(g.lat, g.lon, 9) }}><MapPin size={12} /> Ver {p.city} en el mapa</button></div>)
        : <div className="empty" style={{ margin: 12 }}>No hay publicaciones en esta zona. Aleja el mapa o elige «Todo el mundo».</div>}
        {hasMore && <button className="btn ghost block" onClick={onMore}>Cargar más publicaciones</button>}</div>
    </aside>
    : <aside className={'pl-panel glass' + (sheet ? ' open' : '')}>
      <button className="pl-grab" onClick={() => setSheet(o => !o)} aria-label={sheet ? 'Bajar panel' : 'Subir panel'}><i /></button>
      <div className="wall-bar">
        <span className="wall-where grow" onClick={() => setSheet(o => !o)}><b>{place}</b><span className="meta">{visible.length} {visible.length === 1 ? 'publicación' : 'publicaciones'}</span></span>
        <select id="ex-cat" value={cat} onChange={e => setCat(e.target.value)} aria-label="Qué">{cats.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        {live > 0 && <span className="wall-live" title={live + ' en directo'}><i className="dot" />{live}</span>}
      </div>
      <LiveWalksStrip walks={walksS.list} onOpen={openWalk} onStart={() => { if (!requireUser()) return; if (myWalk) return openWalk(myWalk.id); setStartWalk(true) }}>
        {liveS.daily?.on && <button className={'wk-feat' + (dailyView ? ' on' : '')} onClick={() => setDailyView(v => !v)}><CloudSun size={13} /> Cielo de hoy <i>{liveS.daily.count}</i>{dailyView && <X size={12} />}</button>}
        {liveS.cams.length > 0 && <button className="wk-feat" onClick={() => openCam(liveS.cams[Math.floor(Math.random() * liveS.cams.length)].id)}><Video size={13} /> Ventanas <i>{liveS.cams.length}</i></button>}
      </LiveWalksStrip>
      {dailyView && liveS.daily && <div className="daily-bar"><b><CloudSun size={14} /> {liveS.daily.title}</b><p>{liveS.daily.text} · {liveS.daily.count} {liveS.daily.count === 1 ? 'foto' : 'fotos'} hoy</p><div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={joinDaily}>Participar con mi foto</button><button className="btn ghost sm" onClick={() => setDailyView(false)}>Ver todas las publicaciones</button></div></div>}
      <div className="pl-list">{visible.length ? visible.map(p => <button key={p.id} className={'pl-item' + (active === p.id ? ' on' : '')} onClick={() => { openCity(p.city, p.id); setSheet(false) }}>
        <span className="pl-thumb"><Media small post={p} h={58} radius={6} /></span>
        <span className="pl-it"><TypeTag type={p.type} /><span className="pl-it-t">{p.title}</span><span className="meta"><MapPin size={11} /> {p.city} · {ago(p.at)}</span></span>
      </button>) : <div className="empty" style={{ margin: 12 }}>{dailyView ? 'Todavía nadie ha subido su foto del reto en esta zona. ¡Sé el primero!' : <>No hay publicaciones en esta zona. Aleja el mapa o cambia los filtros.</>}</div>}</div>
    </aside>}

    {street && <Suspense fallback={null}><Map25D center={street} zoom={street.zoom} points={points} places={places} cams={liveS.cams} stations={radioS.stations} walks={walksS.list} onSelect={onPin} onPlacePick={id => { setSel(null); setWalkSel(null); setBizSel(id) }} onCamPick={openCam} onWalkPick={openWalk} onBounds={setBounds} onExit={leaveStreet} onFlat={() => { flatRef.current = true; try { sessionStorage.setItem('flat', '1') } catch {} }} /></Suspense>}
    {cam && !sel && <CamPanel cam={cam} cams={liveS.cams} onClose={() => setCamSel(null)} onPick={openCam} onFly={c => fly(c.lat, c.lon, 12)} />}
    {walkSel && !sel && !bizSel && <WalkPanel id={walkSel} user={user} onClose={() => { setWalkSel(null); setWalkRoute(null) }} onRoute={setWalkRoute} follow={followWalk} setFollow={setFollowWalk} requireUser={requireUser} flash={flash} mine={myWalk && myWalk.id === walkSel ? myWalk : null} onEnd={() => endWalk(walkSel)} />}
    {startWalk && <StartWalk user={user} isAdmin={user?.role === 'admin'} onClose={() => setStartWalk(false)} onStarted={beginWalk} />}
    {bizSel && !sel && <BizPanel id={bizSel} user={user} onClose={() => setBizSel(null)} onOpen={onOpen} onChat={onChat} />}
    {sel && <CityPanel follow={follow} city={sel} posts={posts.filter(p => p.city === sel)} active={active} user={user} onClose={() => { setSel(null); setActive(null) }} onOpen={onOpen} onChat={onChat} onStory={onStory} requireUser={requireUser} flash={flash} onStreets={() => { const g = cityInfo(sel); fly(g.lat, g.lon, 14) }} />}

    {pinMode && <div className="pin-hint glass"><MapPin size={15} style={{ flex: 'none' }} /> <span className="grow"><b>{t(site, 'pinHint')}</b></span> <button className="link" onClick={() => { setPinMode(false); setChallenge(false) }}>Cancelar</button></div>}
    {drop && <PinComposer user={user} videoMax={videoMax} drop={drop} challenge={challenge ? liveS.daily : null} onCancel={() => { setDrop(null); setChallenge(false) }} onDone={p => { setDrop(null); onPublished(p); if (challenge) { setChallenge(false); setDailyView(true) } openCity(p.city, p.id) }} />}

    {!pinMode && !drop && <div className="pin-tip glass">{t(site, 'pinTip')}</div>}
  </div>
}

function ShareBar({ post, flash }) {
  const url = location.origin + '/p/' + post.id, text = post.title + ' · ' + post.city
  const native = async () => { try { await navigator.share({ title: text, text: post.text || text, url }) } catch {} }
  const copy = async () => { try { await navigator.clipboard.writeText(url); flash('Enlace copiado') } catch { flash(url) } }
  return <div className="share-bar"><span className="lbl" style={{ margin: 0 }}>Compartir</span>
    <a className="btn ghost sm wa" href={'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
    {navigator.share && <button className="btn ghost sm" onClick={native}><Share2 size={14} /> Instagram y más</button>}
    <button className="btn ghost sm" onClick={copy}><Link2 size={14} /> Copiar enlace</button></div>
}

// listas editables desde el panel (categorías y tipos de negocio): se actualizan en su sitio
function applyLists(st) {
  if (Array.isArray(st?.categories) && st.categories.length) CATEGORIES.splice(0, CATEGORIES.length, ...st.categories.map(([id, label]) => ({ id, label })))
  // eslint-disable-next-line no-misleading-character-class
  const noEmoji = x => String(x).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{FE0F}]/gu, '').trim()
  if (Array.isArray(st?.bizTypes) && st.bizTypes.length) BIZ.splice(0, BIZ.length, ...st.bizTypes.map(([k, l]) => [k, noEmoji(l)]))
}
const bizLabel = t => BIZ.find(b => b[0] === t)?.[1]
const validTo = v => { const d = new Date(); if (v === 'hoy') { d.setHours(23, 59, 0, 0); return +d } if (v === 'manana') { d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0); return +d } if (v === 'finde') { d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); d.setHours(23, 59, 0, 0); return +d } if (v === 'semana') return Date.now() + 7 * 864e5; return null }
function BizPanel({ id, onClose, onOpen, onChat }) {
  const [d, setD] = useState(null), [err, setErr] = useState('')
  useEffect(() => { setD(null); fetch('/api/places/' + id).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j) }).catch(e => setErr(e.message)) }, [id])
  if (!d) return <aside className="city glass"><div className="empty" style={{ margin: 14 }}>{err || 'Cargando…'}</div></aside>
  const pl = d.place, wa = pl.whatsapp && pl.whatsapp.replace(/[^\d]/g, '')
  return <aside className="city glass biz-panel">
    <button className="pl-back" onClick={onClose}><ChevronLeft size={14} /> Volver a la lista</button>
    {pl.cover && <div className="biz-cover" style={{ backgroundImage: `url(${pl.cover})` }} />}
    <div className={'biz-head' + (pl.cover ? ' has-cover' : '')}><button className="pl-f-x" onClick={onClose} aria-label="Cerrar"><X size={15} /></button>
      {pl.featured && <span className="tag feat" style={{ position: 'absolute', left: 14, top: 12 }}><Star size={10} fill="currentColor" /> Destacado</span>}
      <Avatar name={pl.name} hue={pl.hue} size={60} src={pl.avatar} />
      <div className="city-n">{pl.name}{pl.verified && <BadgeCheck size={16} className="verified" />}</div>
      <div className="city-m">{bizLabel(pl.type) || 'Negocio'}{pl.address ? ' · ' + pl.address : ''}</div>
      {pl.hours && <div className="city-m"><Clock size={11} /> {pl.hours}</div>}
    </div>
    <div className="biz-actions">
      <a className="btn sm" href={`https://www.google.com/maps/dir/?api=1&destination=${pl.lat},${pl.lon}`} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Cómo llegar</a>
      {wa && <a className="btn ghost sm wa" href={'https://wa.me/' + wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
      {!pl.mine && <button className="btn ghost sm" onClick={() => onChat(pl.id)}><MessagesSquare size={14} /> Mensaje</button>}
    </div>
    <div className="city-body">
      <div className="lbl" style={{ margin: '10px 14px 6px' }}>Lo que publica</div>
      {d.posts.length ? d.posts.map(p => <button key={p.id} className="pl-item" onClick={() => onOpen(p.id)}><span className="pl-thumb"><Media small post={p} h={58} radius={6} /></span><span className="pl-it">{p.expires_at && <span className="tag exp">⏱ {leftTxt(p.expires_at)}</span>}<span className="pl-it-t">{p.title}</span><span className="meta">{ago(p.at)}</span></span></button>)
        : <div className="empty" style={{ margin: 12 }}>{pl.mine ? 'Publica tu primera oferta o evento con el botón +.' : 'Este negocio aún no ha publicado.'}</div>}
    </div>
  </aside>
}
export const leftTxt = t => { const m = Math.round((t - Date.now()) / 60000); return m <= 0 ? 'Vencida' : m < 60 ? `Quedan ${m} min` : m < 1440 ? `Quedan ${Math.round(m / 60)} h` : `Hasta el ${new Date(t).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}` }

function GlobeHome({ posts, points, home, site, onEnter, onPick, onExplore, onNear, onOpen }) {
  const today = posts.filter(p => p.at > Date.now() - 864e5).length, live = posts.filter(p => p.type === 'directo')
  const countries = new Set(posts.map(p => p.country || cityInfo(p.city).country).filter(Boolean)).size
  const top = Object.entries(posts.reduce((a, p) => { const c = p.country || cityInfo(p.city).country; if (c) a[c] = (a[c] || 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4)
  return <div className="globe-home">
    <Globe3D points={points} home={home} onEnter={onEnter} onPick={onPick} />
    <div className="gh-hero">
      <Brand big />
      <h1>{site.tagline}</h1><p>{site.tagline2}</p>
      <div className="gh-stats glass"><div><span className="live-dot" /><b>{today}</b><small>publicaciones hoy</small></div><div><b className="red">{live.length}</b><small>en directo</small></div><div><b>{countries}</b><small>países</small></div></div>
      <div className="gh-btns"><button className="btn" onClick={onExplore}><Globe2 size={16} /> Explorar el planeta</button><button className="btn ghost" onClick={onNear}>Ver lo que pasa cerca</button><button className="btn ghost gh-plans" onClick={() => openSell('planes')}><Star size={14} /> Planes y precios</button></div>
    </div>
    <aside className="gh-side">
      {live.length > 0 && <><div className="gh-cap"><span className="live-dot" />{t(site, 'liveNow')}</div>
        <div className="gh-pills">{live.slice(0, 4).map(p => <button key={p.id} className="gh-pill" onClick={() => onOpen(p.id)}><span className="gh-ph"><Media small post={p} h={28} radius={14} /></span><span className="grow"><b>{p.title}</b><small>{p.city}</small></span></button>)}</div></>}
      {top.length > 0 && <><div className="gh-cap">Países más activos</div>
        <div className="gh-chips">{top.map(([c, n]) => <span key={c} className="gh-chip">{c} <b>{n}</b></span>)}</div></>}
    </aside>
    {posts.length > 0 && <div className="gh-ticker glass"><span className="live">AHORA</span><div className="gh-mask"><div className="gh-track" style={{ animationDuration: Math.max(30, Math.min(posts.length, 10) * 7) + 's' }}>{[0, 1].map(k => posts.slice(0, 10).map(p => <button key={k + '-' + p.id} onClick={() => onOpen(p.id)} tabIndex={k ? -1 : 0}><b>{p.city}</b> · {p.title}</button>))}</div></div></div>}
    <div className="gh-hint">Arrastra para girar · acerca o toca un lugar para entrar al mapa</div>
  </div>
}

function CityPanel({ follow, city, posts, active, user, onClose, onOpen, onChat, onStory, requireUser, flash, onStreets }) {
  const [tab, setTab] = useState('ahora'); const [room, setRoom] = useState(null)
  const g = cityInfo(city), cover = posts.find(p => p.id === active && p.match) ? null : [posts.find(p => p.id === active), ...posts].find(p => p && !p.match) || null, picked = posts.find(p => p.id === active && p.match), headMatch = picked || (!cover ? posts.find(p => p.match) : null)
  const ordered = active ? [...posts.filter(p => p.id === active), ...posts.filter(p => p.id !== active)] : posts
  const people = [...new Map(posts.map(p => [p.author, p])).values()]
  const radio = useRadio(), cityStations = radio.stations.filter(st => st.city && st.city.toLowerCase() === String(city).toLowerCase())
  const planes = posts.filter(p => p.cat === 'planes' || p.cat === 'eventos')
  useEffect(() => { setTab('ahora') }, [city])
  useEffect(() => { const f = () => api.room(city).then(setRoom).catch(() => {}); f(); const g = e => { if (e.detail.city === city) f() }; addEventListener('planeta:room', g); const t = setInterval(f, 30000); return () => { clearInterval(t); removeEventListener('planeta:room', g) } }, [city])
  return <aside className="city glass">
    <div className={'city-head' + (headMatch ? ' has-match' : '')}>{cover ? <Media post={cover} h={128} radius={0} /> : headMatch && <div className="city-head-match" onClick={() => onOpen(headMatch.id)}><Media post={headMatch} h={210} radius={0} /></div>}<div className="city-shade" />
      <button className="pl-f-x" onClick={onClose} aria-label="Cerrar ciudad"><X size={15} /></button>
      <button className={'city-follow' + (follow?.isFollowing('city', city) ? ' on' : '')} onClick={() => follow?.toggleFollow('city', city)}><Bell size={13} /> {follow?.isFollowing('city', city) ? 'Siguiendo' : 'Seguir ciudad'}</button>
      <div className="city-t"><div className="cap-s" style={{ color: '#fff' }}>Ciudad</div><div className="city-n">{city}</div><div className="city-m">{g.country} · {localTime(city)} · {posts.length} {posts.length === 1 ? 'publicación' : 'publicaciones'}{room?.people ? ' · ' + room.people + ' en la sala hoy' : ''}</div></div></div>
    <CityPulse city={city} onOpen={onOpen} />
    {cityStations.length > 0 && <div className="city-radio">{cityStations.map(st => <button key={st.id} onClick={() => playRadio(st)}><RadioLogo st={st} size={22} /> {radio.cur?.id === st.id && radio.playing ? 'Sonando: ' : 'Escuchar '}{st.name}</button>)}</div>}
    <div className="chips city-tabs">{[['ahora', 'Ahora'], ['historias', 'Historias'], ['sala', 'Sala'], ['personas', 'Personas'], ['planes', 'Planes']].map(([id, l]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}{id === 'sala' && room?.messages?.length ? <i className="sala-dot" /> : null}</button>)}</div>
    <div className="city-body">
      {tab === 'ahora' && <>{ordered.filter(p => !p.match && !picked).map(p => <button key={p.id} className={'pl-item' + (p.id === active ? ' on' : '')} onClick={() => onOpen(p.id)}><span className="pl-thumb"><Media small post={p} h={58} radius={6} /></span><span className="pl-it"><TypeTag type={p.type} /><span className="pl-it-t">{p.title}</span><span className="meta">{p.author} · {ago(p.at)}</span></span></button>)}
        <div className="city-actions"><button className="btn ghost sm" onClick={onStreets}><MapPin size={14} /> Ver calles</button></div>
        {ordered.filter(p => p.match && (!picked || p.id === picked.id)).slice(0, 2).map(p => <div key={'mc' + p.id} className="city-match" onClick={() => onOpen(p.id)}>{p.id !== headMatch?.id && <Media post={p} h={190} radius={12} />}{p.match.st !== 'NS' && p.match.st !== 'TBD' && <MatchEvents m={p.match} />}</div>)}
        {ordered.filter(p => p.info?.about).slice(0, 3).map(p => <FestInfo key={'fi' + p.id} post={p} />)}</>}
      {tab === 'historias' && <div className="city-stories">{posts.map(p => <button key={p.id} className="story" onClick={() => onStory(city)}><div className={'story-ring' + (p.type === 'directo' ? ' live' : '')}><Media small post={p} h={62} radius={999} /></div><span>{p.author.split(' ')[0]}</span></button>)}
        <button className="btn sm" style={{ gridColumn: '1/-1' }} onClick={() => onStory(city)}><Play size={13} /> Ver historias de {city}</button></div>}
      {tab === 'sala' && <RoomChat city={city} room={room} setRoom={setRoom} user={user} requireUser={requireUser} flash={flash} />}
      {tab === 'personas' && (people.length ? people.map(p => <div key={p.author} className="list-row"><Avatar name={p.author} hue={p.hue} size={32} src={p.avatar} /><div className="grow"><div className="name">{p.author}</div><div className="meta">@{p.handle}</div></div>{!p.mine && !p.author_example && <button className="btn ghost sm" onClick={() => onChat(p.author_id)}><MessagesSquare size={14} /> Mensaje</button>}</div>) : <div className="empty">Nadie ha publicado aquí todavía.</div>)}
      {tab === 'planes' && (planes.length ? planes.map(p => <button key={p.id} className="pl-item" onClick={() => onOpen(p.id)}><span className="pl-thumb"><Media small post={p} h={58} radius={6} /></span><span className="pl-it"><span className="pl-it-t">{p.title}</span><span className="meta">{catLabel(p.cat)}{p.joined != null ? ' · ' + p.joined + ' se unen' : ''}</span></span></button>) : <div className="empty">No hay planes en {city} ahora. Suelta uno en el mapa.</div>)}
    </div>
  </aside>
}

function RoomChat({ city, room, setRoom, user, requireUser, flash }) {
  const site = useSite()
  const [msg, setMsg] = useState(''); const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [room?.messages?.length])
  const send = async e => { e.preventDefault(); if (!requireUser() || !msg.trim()) return; try { setRoom(await api.roomSend(city, msg.trim())); setMsg('') } catch (x) { flash(x.message) } }
  return <div className="room">
    <div className="room-h"><span className="tag tag-directo"><i className="dot" />Sala en vivo</span><b className="grow">{t(site, 'roomTitle', { city })}</b></div>
    <div className="room-msgs">{!room ? <p className="muted small">Cargando…</p> : room.messages.length ? room.messages.map(m => <div key={m.id} className={'room-m' + (m.mine ? ' mine' : '')}>{!m.mine && <Avatar name={m.author} hue={m.hue} size={26} src={m.avatar} />}<div className="msg"><p>{!m.mine && <b>{m.author.split(' ')[0]} · </b>}{m.mine ? m.text : <Translatable text={m.text} />}</p><span>{ago(m.at)}</span></div></div>) : <p className="muted small" style={{ padding: '12px 0' }}>{t(site, 'emptyRoom', { city })}</p>}<div ref={end} /></div>
    <form className="comment-box" onSubmit={send}><input id="room-input" placeholder={user ? 'Escribe a la sala de ' + city + '…' : 'Inicia sesión para escribir'} value={msg} onChange={e => setMsg(e.target.value)} maxLength={1000} autoComplete="off" /><button className="icon accent" aria-label="Enviar"><Send size={16} /></button></form>
  </div>
}

function PinComposer({ drop, onCancel, onDone, videoMax = 60, user, challenge }) {
  const site = useSite()
  const city = nearest(drop.lat, drop.lon)
  const [cat, setCat] = useState('eventos'); const [capacity, setCapacity] = useState(''); const [valid, setValid] = useState(''); const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [media, setMedia] = useState(null); const [live, setLive] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [prog, setProg] = useState(0)
  const pick = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setErr(''); try { setMedia(f.type.startsWith('video/') ? await prepareVideo(f, videoMax) : await prepareImage(f)) } catch (x) { setMedia(null); setErr(x.message) } }
  useEffect(() => { if (challenge) { setTitle(t => t || 'Mi cielo hoy'); if (CATEGORIES.some(c => c.id === 'cotidiano')) setCat('cotidiano') } }, [challenge?.key])
  const ok = title.trim().length > 2 && !busy && (!challenge || media?.kind === 'image')
  const submit = async e => { e.preventDefault(); if (!ok) return; setBusy(true); setErr(''); setProg(0); try { const m = await uploadMedia(media, setProg); const d = await api.create({ title, text, cat, live, capacity: cat === 'planes' ? capacity : null, validUntil: validTo(valid), lat: drop.lat, lon: drop.lon, challenge: challenge?.key, ...m }); onDone(d.post) } catch (x) { setErr(x.message) } finally { setBusy(false) } }
  return <form className="composer glass" onSubmit={submit}>
    <div className="row"><div className="cap-s grow">Publicar aquí</div><button type="button" className="pl-f-x static" onClick={onCancel} aria-label="Cancelar"><X size={15} /></button></div>
    {challenge && <div className="daily-pin">Reto del día: <b>{challenge.title}</b>. Sube una foto.</div>}
    <div className="meta"><MapPin size={12} /> Cerca de {city.city}, {city.country} · {drop.lat.toFixed(3)}, {drop.lon.toFixed(3)}</div>
    <label className="upload small-up">{media ? (media.kind === 'video' ? <video src={media.preview} muted autoPlay loop playsInline /> : <img src={media.preview} alt="" />) : <><ImagePlus size={22} strokeWidth={1.5} /><span>Foto o video (máx. {videoMax} s)</span></>}<input id="pin-photo" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={pick} hidden /></label>
    {media?.kind === 'video' && <div className="meta">Video de {Math.round(media.duration)} s · {(media.full.size / 1e6).toFixed(1)} MB</div>}
    <input id="pin-title" className="field" placeholder={t(site, 'whatsHappening')} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} autoFocus />
    <textarea id="pin-text" className="field" rows={2} placeholder="Cuéntalo en pocas palabras (opcional)" value={text} onChange={e => setText(e.target.value)} maxLength={2000} />
    <div className="chips wrap">{[['eventos', 'Evento'], ['lugares', 'Lugar'], ['planes', 'Plan'], ['noticias', 'Noticia'], ['deportes', 'Deporte'], ['cotidiano', 'Vida cotidiana']].map(([id, l]) => <button type="button" key={id} className={cat === id ? 'on' : ''} onClick={() => setCat(id)}>{l}</button>)}</div>
    {user?.biz && <label className="adm-field"><span>¿Hasta cuándo es válido? (desaparece solo al vencer)</span><select id="pin-valid" className="field" value={valid} onChange={e => setValid(e.target.value)}><option value="">Sin vencimiento</option><option value="hoy">Hoy hasta las 11:59 p. m.</option><option value="manana">Hasta mañana</option><option value="finde">Hasta el domingo</option><option value="semana">Una semana</option></select></label>}
    {cat === 'planes' && <label className="adm-field"><span>¿Cuántas personas pueden unirse? (opcional)</span><input id="pin-cap" className="field" type="number" min="2" max="500" placeholder="Sin límite" value={capacity} onChange={e => setCapacity(e.target.value)} /></label>}
    <label className="toggle"><span><Radio size={15} /> En directo</span><input id="pin-live" type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /><i /></label>
    {err && <div className="banner">{err}</div>}
    {busy && media && <div className="prog"><i style={{ width: Math.round(prog * 100) + '%' }} /></div>}
    <button className="btn block" disabled={!ok}>{busy ? (media && prog < 1 ? 'Subiendo ' + Math.round(prog * 100) + ' %…' : 'Publicando…') : t(site, 'dropButton')}</button>
  </form>
}

function CercaScreen({ posts, card, user }) {
  const site = useSite()
  const [radius, setRadius] = useState(400)
  const home = homeOf(user)
  const near = posts.map(p => ({ p, d: km(home, cityInfo(p.city)) })).filter(x => x.d <= radius).sort((a, b) => a.d - b.d)
  const planes = near.filter(x => x.p.cat === 'planes' || x.p.cat === 'eventos')
  return <>
    <Header title={t(site, 'nearTitle')} sub={`Alrededor de ${home.city}, ${home.country}`} />
    <Chips value={radius} onChange={setRadius} items={[[20, '20 km'], [400, '400 km'], [1500, '1.500 km'], [5000, '5.000 km']]} />
    {planes.length > 0 && <><div className="section"><h2>Planes y eventos</h2></div>
      <div className="hscroll">{planes.map(({ p, d }) => <div key={p.id} className="mini" onClick={() => card(p).props.onOpen(p)}><Media small post={p} h={110} radius={12} /><div className="mini-t">{p.title}</div><div className="meta">{p.city} · {d < 30 ? 'en tu ciudad' : Math.round(d) + ' km'}</div></div>)}</div></>}
    <div className="section"><h2>Todo lo cercano</h2></div>
    <div className="feed">{near.length ? near.map(x => card(x.p)) : <Empty text="No hay publicaciones en este radio. Amplíalo para descubrir más." />}</div>
  </>
}

function ComunidadScreen({ follow, posts, user, card, onAuth, onLogout, onOpen, onChat, onEditProfile }) {
  const site = useSite()
  const [view, setView] = useState('personas')
  const [people, setPeople] = useState(null), [activity, setActivity] = useState(null)
  useEffect(() => { api.people().then(d => setPeople(d.people)).catch(() => setPeople([])); api.activity().then(d => setActivity(d.activity)).catch(() => setActivity([])) }, [posts.length])
  const mine = posts.filter(p => p.mine), savedPosts = posts.filter(p => p.saved)
  return <>
    <Header title={t(site, 'communityTitle')} sub={t(site, 'communitySub')} />
    {user ? <div className="profile"><Avatar name={user.name} hue={user.hue} size={44} src={user.avatar} /><div className="grow"><div className="name lg">{user.name}</div><div className="meta">@{user.handle} · {user.city}</div>{user.bio && <div className="meta" style={{ display: 'block', marginTop: 2 }}>{user.bio}</div>}<button className="link" style={{ marginTop: 4 }} onClick={onEditProfile}><Pencil size={12} /> Editar perfil</button></div>
      <div className="stats"><div><b>{mine.length}</b><span>Publicaciones</span></div><div><b>{savedPosts.length}</b><span>Guardadas</span></div></div></div>
      : <div className="profile cta"><div className="grow"><div className="name lg">{t(site, 'joinTitle')}</div><div className="meta">{t(site, 'joinSub')}</div></div><button className="btn sm" onClick={() => onAuth('register')}>Crear cuenta</button><button className="btn ghost sm" onClick={() => onAuth('login')}>Entrar</button></div>}
    <Chips value={view} onChange={setView} items={[['personas', 'Personas'], ['actividad', 'Actividad'], ['sigues', 'Lo que sigues'], ['mias', 'Mis publicaciones'], ['guardadas', 'Guardadas']]} />
    {view === 'sigues' && <div className="follow-box"><p className="meta" style={{ display: 'block', marginBottom: 8 }}>Te avisamos cuando alguien publique en estos temas o ciudades.</p>
      <div className="lbl">Temas</div><div className="chips wrap">{CATEGORIES.map(c => <button key={c.id} className={follow.isFollowing('cat', c.id) ? 'on' : ''} onClick={() => follow.toggleFollow('cat', c.id)}>{follow.isFollowing('cat', c.id) ? '✓ ' : '+ '}{c.label}</button>)}</div>
      <div className="lbl">Ciudades</div>{follow.follows.filter(f => f.kind === 'city').length ? <div className="chips wrap">{follow.follows.filter(f => f.kind === 'city').map(f => <button key={f.value} className="on" onClick={() => follow.toggleFollow('city', f.value)}>✓ {f.value}</button>)}</div> : <p className="muted small">Abre una ciudad en el mapa y pulsa «Seguir ciudad».</p>}</div>}
    {view === 'personas' && (people === null ? <Empty text="Cargando…" /> : people.length ? <div className="list">{people.map(u => <div key={u.id} className="list-row"><Avatar name={u.name} hue={u.hue} size={32} src={u.avatar} /><div className="grow"><div className="name">{u.name}</div><div className="meta">@{u.handle} · {u.city}{u.bio ? ' · ' + u.bio : ''}</div></div><span className="muted">{u.posts} {u.posts === 1 ? 'publicación' : 'publicaciones'}</span>{user?.id !== u.id && <button className="btn ghost sm" onClick={() => onChat(u.id)}><MessagesSquare size={15} /> Mensaje</button>}</div>)}</div> : <Empty text="Aún no hay personas registradas. Crea la primera cuenta." />)}
    {view === 'actividad' && (activity === null ? <Empty text="Cargando…" /> : activity.length ? <div className="list">{activity.map(a => <button key={a.id} className="list-row" onClick={() => onOpen(a.post_id)}><Avatar name={a.author} hue={a.hue} size={32} src={a.avatar} /><div className="grow"><div className="name">{a.author} <span className="meta" style={{ display: 'inline' }}>comentó en {a.title}</span></div><div className="meta clip">“{a.text}” · {ago(a.at)}</div></div></button>)}</div> : <Empty text="Todavía no hay comentarios. Abre una publicación y escribe el primero." />)}
    {view === 'mias' && <div className="feed">{mine.length ? mine.map(card) : <Empty text={user ? 'Todavía no has publicado. Comparte lo que está pasando a tu alrededor.' : 'Inicia sesión para ver tus publicaciones.'} />}</div>}
    {view === 'guardadas' && <div className="feed">{savedPosts.length ? savedPosts.map(card) : <Empty text="Guarda publicaciones para verlas aquí." />}</div>}
    {user && <button className="btn ghost block" onClick={onLogout}>Cerrar sesión</button>}
  </>
}

function PublicarScreen({ user, onCancel, onPublished }) {
  const site = useSite()
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
    <button className="btn block" disabled={!ok} onClick={submit}><Send size={17} /> {busy ? 'Publicando…' : t(site, 'publishButton')}</button>
  </div>
}

function AuthModal({ mode, setMode, onClose, onDone }) {
  const site = useSite()
  const reg = mode === 'register'
  const [f, setF] = useState({ name: '', handle: '', password: '', city: '' }); const [place, setPlace] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const submit = async e => { e.preventDefault(); setBusy(true); setErr(''); try { const d = reg ? await api.register({ ...f, email: f.handle, city: place?.city || 'Bogotá', country: place?.country, lat: place?.lat, lon: place?.lon }) : await api.login(f); onDone(d.user) } catch (x) { setErr(x.message) } finally { setBusy(false) } }
  return <div className="sheet-bg" onClick={onClose}><form className="auth" onClick={e => e.stopPropagation()} onSubmit={submit}>
    <Brand big />
    <h2>{reg ? t(site, 'createAccount') : t(site, 'welcomeBack')}</h2>
    <p className="muted">{reg ? t(site, 'authSub') : t(site, 'joinSub')}</p>
    {reg && <input id="auth-name" className="field" placeholder="Tu nombre" value={f.name} onChange={set('name')} autoComplete="name" />}
    <input id="auth-handle" className="field" type={reg ? 'email' : 'text'} placeholder={reg ? 'Tu correo' : 'Correo o usuario'} value={f.handle} onChange={set('handle')} autoComplete={reg ? 'email' : 'username'} autoCapitalize="none" />
    <input id="auth-pass" className="field" type="password" placeholder="Contraseña" value={f.password} onChange={set('password')} autoComplete={reg ? 'new-password' : 'current-password'} />
    {reg && <div className="adm-field" style={{ marginTop: 10 }}><span>¿Dónde estás?</span><PlacePicker value={place} onChange={setPlace} id="auth-city" /></div>}
    {err && <div className="banner">{err}</div>}
    <button className="btn block" disabled={busy}>{busy ? 'Un momento…' : reg ? 'Crear cuenta' : 'Entrar'}</button>
    {reg && <p className="meta" style={{ display: 'block', textAlign: 'center', fontSize: 11.5 }}>Al crear tu cuenta aceptas los <a href="/terminos" target="_blank" rel="noopener">Términos</a> y la <a href="/privacidad" target="_blank" rel="noopener">Privacidad</a>.</p>}
    <button type="button" className="link center" onClick={() => setMode(reg ? 'login' : 'register')}>{reg ? '¿Ya tienes cuenta? Entra' : '¿No tienes cuenta? Créala'}</button>
  </form></div>
}

function PostDetail({ id, user, onChat, onClose, onToggle, requireUser, flash, onDeleted, onChanged }) {
  const [post, setPost] = useState(null); const [t, setT] = useState(''); const [err, setErr] = useState('')
  const reload = () => api.post(id).then(d => { setPost(d.post); onChanged(d.post) }).catch(e => setErr(e.message))
  useEffect(() => { reload(); const f = e => { if (e.detail.id === id) reload() }; addEventListener('planeta:comment', f); return () => removeEventListener('planeta:comment', f) }, [id])
  const tog = async what => { const p = await onToggle(id, what); if (p) setPost(x => ({ ...x, ...p })) }
  const send = async e => { e.preventDefault(); if (!requireUser() || !t.trim()) return; try { await api.comment(id, t.trim()); setT(''); reload() } catch (x) { flash(x.message) } }
  const del = async () => { try { await api.remove(id); onDeleted(id) } catch (x) { flash(x.message) } }
  const report = async () => { if (!requireUser()) return; try { await api.report(id, 'Contenido inapropiado'); flash('Gracias. Revisaremos esta publicación.') } catch (x) { flash(x.message) } }
  return <div className="sheet-bg" onClick={onClose}><div className="sheet" onClick={e => e.stopPropagation()}>
    <header className="pub-head"><button className="icon" onClick={onClose} aria-label="Volver"><ChevronLeft size={20} /></button><span>{post ? catLabel(post.cat) : ''}</span>
      {post?.mine ? <button className="icon" onClick={del} aria-label="Eliminar" title="Eliminar"><Trash2 size={18} /></button> : <button className="icon" onClick={report} aria-label="Reportar" title="Reportar"><Flag size={18} /></button>}</header>
    {!post ? <Empty text={err || 'Cargando…'} /> : <>
      <Media post={post} h={300} radius={20} play controls />
      <div className="row-between"><TypeTag type={post.type} /><span className="meta">{ago(post.at)}</span></div>
      <h2 className="detail-t">{post.title}</h2>{post.text && <p className="detail-p"><Translatable text={post.text} /></p>}
      <div className="author"><Avatar name={post.author} hue={post.hue} size={42} src={post.avatar} /><div className="grow"><div className="name">{post.author}{post.author_verified && <BadgeCheck size={14} className="verified" />}</div><div className="meta"><MapPin size={12} /> {post.city}{(post.country || cityInfo(post.city).country) ? ', ' + (post.country || cityInfo(post.city).country) : ''}</div></div>{!post.mine && !post.author_example && <button className="btn ghost sm" onClick={() => onChat(post.author_id)}><MessagesSquare size={15} /> Mensaje</button>}</div>
      <div className="post-actions"><button className={'act' + (post.liked ? ' on' : '')} onClick={() => tog('like')}><Heart size={18} fill={post.liked ? 'currentColor' : 'none'} /><span>{fmt(post.likes)}</span></button>
        <span className="act"><MessageCircle size={18} /><span>{post.comments.length}</span></span>
        {post.cat === 'planes' && (() => { const full = post.capacity && post.joined >= post.capacity && !post.joined_me; return <button className={'btn sm' + (post.joined_me || full ? ' ghost' : '')} disabled={full} onClick={() => tog('join')}>{full ? 'Cupo lleno' : post.joined_me ? 'Te uniste ✓' : 'Me uno'} · {post.joined}{post.capacity ? '/' + post.capacity : ''}</button> })()}
        <button className={'act end' + (post.saved ? ' on' : '')} onClick={() => tog('save')}><Bookmark size={18} fill={post.saved ? 'currentColor' : 'none'} /></button></div>
      {post.cat === 'planes' && post.attendees?.length > 0 && <><div className="lbl">Van {post.attendees.length}{post.capacity ? ' de ' + post.capacity : ''}</div><div className="attendees">{post.attendees.map(a => <span key={a.id} title={a.name}><Avatar name={a.name} hue={a.hue} size={30} src={a.avatar} /></span>)}</div></>}
      <ShareBar post={post} flash={flash} />
      <div className="lbl">Comentarios</div>
      {post.comments.length === 0 && <p className="muted small">Sé el primero en comentar.</p>}
      {post.comments.map(c => <div key={c.id} className="comment"><Avatar name={c.author} size={30} hue={c.hue} src={c.avatar} /><div><b>{c.author}</b> <span className="meta" style={{ display: 'inline' }}>{ago(c.at)}</span><p><Translatable text={c.text} /></p></div></div>)}
      <form className="comment-box" onSubmit={send}><input id="comment-input" placeholder={user ? 'Escribe un comentario…' : 'Inicia sesión para comentar'} value={t} onChange={e => setT(e.target.value)} maxLength={1000} /><button className="icon accent" aria-label="Enviar"><Send size={17} /></button></form>
    </>}
  </div></div>
}
const NAV = [['planeta', Globe, 'Mapa'], ['ahora', Newspaper, 'Ahora'], ['cerca', Compass, 'Explorar cerca'], ['mensajes', MessagesSquare, 'Mensajes'], ['comunidad', Users, 'Comunidad']]
function Sidebar({ tab, setTab, goPublish, user, unread, onAuth, isStaff, onAdmin, notif }) {
  const site = useSite()
  return <aside className="side rail">
    <button className="rail-logo" onClick={() => setTab('planeta')} aria-label="Ver todo el mapa" title="Ver todo el mapa">{site.favicon ? <img src={site.favicon} alt="" /> : <span className="logo" />}</button>
    <nav className="side-nav">{NAV.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-label={label} data-tip={label}><Icon size={20} strokeWidth={1.75} />{id === 'mensajes' && unread > 0 && <i className="badge">{unread}</i>}</button>)}
      <button className="rail-pub" onClick={goPublish} aria-label="Publicar" data-tip="Publicar"><Plus size={20} /></button>
      <button className="rail-plans" onClick={() => openSell('planes')} aria-label="Planes y precios" data-tip="Planes y precios"><Star size={20} strokeWidth={1.75} /></button>
      {isStaff && <button onClick={onAdmin} aria-label="Panel de administración" data-tip="Panel de administración"><ShieldCheck size={20} strokeWidth={1.75} /></button>}</nav>
    {notif}
    {user ? <button className={'rail-me' + (tab === 'huella' ? ' on' : '')} onClick={() => setTab('huella')} aria-label={'Tu huella: ' + user.name} data-tip="Tu huella"><Avatar name={user.name} hue={user.hue} size={34} src={user.avatar} /></button>
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
  const site = useSite()
  const live = posts.filter(p => p.type === 'directo').slice(0, 3)
  const top = Object.entries(posts.reduce((a, p) => (a[p.city] = (a[p.city] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 4)
  return <aside className="aside">
    <div className="panel"><div className="panel-h"><Radio size={16} /> {t(site, 'liveNow')}</div>
      {live.map(p => <button key={p.id} className="panel-row" onClick={() => onOpen(p.id)}><Media small post={p} h={48} radius={10} /><div className="grow"><div className="panel-t">{p.title}</div><div className="meta">{p.city} · {ago(p.at)}</div></div><ChevronRight size={14} className="dim" /></button>)}</div>
    <div className="panel"><div className="panel-h"><MapPin size={16} /> Ciudades activas</div>
      {top.map(([c, n]) => <button key={c} className="panel-row simple" onClick={goMap}><MapPin size={14} className="dim" /><span className="grow">{c}</span><span className="count">{n}</span><ChevronRight size={14} className="dim" /></button>)}</div>
    <AsideActivity posts={posts} onOpen={onOpen} />
    <p className="foot">{t(site, 'footer')}</p>
  </aside>
}
function Stories({ posts, onStory }) {
  const seen = new Set(), items = []
  for (const p of posts) if (!seen.has(p.city)) { seen.add(p.city); items.push(p) }
  return <div className="stories">{items.slice(0, 14).map(p => <button key={p.city} className="story" onClick={() => onStory(p.city)} title={'Ver historias de ' + p.city}><div className={'story-ring' + (p.type === 'directo' ? ' live' : '')}><Media small post={p} h={62} radius={999} /></div><span>{p.city}</span></button>)}</div>
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
    <Media post={cur} h="100%" radius={0} play />
    <div className="sv-shade" />
    <div className="sv-bars">{items.map((_, k) => <i key={k}><b className={k < i ? 'done' : k === i ? (paused ? 'run paused' : 'run') : ''} key={c + i} /></i>)}</div>
    <div className="sv-head"><Avatar name={cur.author} hue={cur.hue} size={30} src={cur.avatar} /><div className="grow"><div className="name">{c}</div><div className="meta">{cur.author} · {ago(cur.at)}</div></div><button className="sv-x" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>
    <button className="sv-tap l" onClick={prev} aria-label="Anterior" /><button className="sv-tap r" onClick={next} aria-label="Siguiente" />
    <div className="sv-foot"><TypeTag type={cur.type} glass /><div className="cat">{catLabel(cur.cat)}</div><h3>{cur.title}</h3>{cur.text && <p>{cur.text}</p>}<button className="btn sm" onClick={() => onOpen(cur.id)}>Ver publicación</button></div>
  </div></div>
}

function ChatDock({ chats, docks, setDocks, onChange, me, onCities }) {
  const [names, setNames] = useState({})
  useEffect(() => { docks.forEach(d => { if (!names[d.id]) { const c = chats.find(x => x.id === d.id); if (c) setNames(n => ({ ...n, [d.id]: c })); else api.chat(d.id).then(r => { registerPlaces([r.user]); setNames(n => ({ ...n, [d.id]: r.user })) }).catch(() => {}) } }) }, [docks, chats])
  useEffect(() => { onCities?.(docks.map(d => names[d.id]?.city).filter(Boolean)) }, [docks, names])
  const close = id => setDocks(ds => ds.filter(d => d.id !== id))
  const toggle = id => setDocks(ds => ds.map(d => d.id === id ? { ...d, min: !d.min } : d))
  return <div className="dock">
    {window.matchMedia('(min-width: 1024px)').matches && <RadioBar docked />}
    {docks.map(d => { const u = names[d.id], c = chats.find(x => x.id === d.id)
      return <div key={d.id} className={'dock-win' + (d.min ? ' min' : '')}>
        <div className="dock-head" onClick={() => toggle(d.id)}>
          {u ? <Avatar name={u.name} hue={u.hue} size={26} src={u.avatar} /> : <span style={{ width: 26 }} />}
          <div className="grow"><div className="name clip">{u?.name || '…'}</div>{u?.city ? <div className="meta clip">{u.city}{me?.city && me.city !== u.city ? ' · ' + Math.round(km(homeOf(me), cityInfo(u.city))).toLocaleString('es-CO') + ' km' : ''} · {localTime(u.city)} allá</div> : u?.handle && <div className="meta">@{u.handle}</div>}</div>
          {c?.unread > 0 && d.min && <i className="badge">{c.unread}</i>}
          <button aria-label={d.min ? 'Abrir' : 'Minimizar'} onClick={e => { e.stopPropagation(); toggle(d.id) }}><Minus size={15} /></button>
          <button aria-label="Cerrar chat" onClick={e => { e.stopPropagation(); close(d.id) }}><X size={15} /></button>
        </div>
        {!d.min && <Thread id={d.id} compact onBack={() => close(d.id)} onChange={onChange} />}
      </div> })}
  </div>
}

function MensajesScreen({ user, chatWith, setChatWith, onAuth, onRead }) {
  const site = useSite()
  const [chats, setChats] = useState(null)
  const loadChats = () => api.chats().then(d => setChats(d.chats)).catch(() => setChats([]))
  useEffect(() => { if (user) { loadChats(); addEventListener('planeta:dm', loadChats); const t = setInterval(loadChats, 60000); return () => { clearInterval(t); removeEventListener('planeta:dm', loadChats) } } }, [user])
  if (!user) return <><Header title={t(site, 'messagesTitle')} sub="Conversaciones privadas con otras personas." /><div className="profile cta"><div className="grow"><div className="name lg">Inicia sesión para chatear</div><div className="meta">Escribe a quien publica algo que te interesa.</div></div><button className="btn sm" onClick={() => onAuth('register')}>Crear cuenta</button><button className="btn ghost sm" onClick={() => onAuth('login')}>Entrar</button></div></>
  return <><Header title={t(site, 'messagesTitle')} sub="Conversaciones privadas con otras personas." />
    <div className={'chat-wrap' + (chatWith ? ' has-thread' : '')}>
      <div className="chat-list">{chats === null ? <Empty text="Cargando…" /> : chats.length ? chats.map(c => <button key={c.id} className={'list-row' + (chatWith === c.id ? ' on' : '')} onClick={() => setChatWith(c.id)}><Avatar name={c.name} hue={c.hue} size={34} src={c.avatar} /><div className="grow"><div className="name">{c.name}</div><div className="meta clip">{c.last_mine ? 'Tú: ' : ''}{c.last_text}</div></div><div className="chat-side"><span className="meta">{ago(c.last_at)}</span>{c.unread > 0 && <i className="badge">{c.unread}</i>}</div></button>)
        : <Empty text="Aún no tienes conversaciones. Abre una publicación o la lista de Personas y pulsa Mensaje." />}</div>
      {chatWith ? <Thread id={chatWith} onBack={() => setChatWith(null)} onChange={() => { loadChats(); onRead() }} /> : <div className="chat-thread empty-thread"><MessagesSquare size={28} strokeWidth={1.5} /><span>Elige una conversación</span></div>}
    </div></>
}

function Thread({ id, onBack, onChange, compact }) {
  const [data, setData] = useState(null), [t, setT] = useState(''), [err, setErr] = useState('')
  const end = useRef(null)
  const load = () => api.chat(id).then(d => { setData(prev => { if (!prev || prev.messages.length !== d.messages.length) setTimeout(() => end.current?.scrollIntoView({ block: 'end' }), 0); return d }) }).catch(e => setErr(e.message))
  useEffect(() => { setData(null); load().then(onChange); const f = e => { if (e.detail.from === id || e.detail.to === id) load().then(onChange) }; addEventListener('planeta:dm', f); const k = setInterval(load, 30000); return () => { clearInterval(k); removeEventListener('planeta:dm', f) } }, [id])
  const send = async e => { e.preventDefault(); if (!t.trim()) return; try { const d = await api.sendMsg(id, t.trim()); setT(''); setData(d); onChange(); setTimeout(() => end.current?.scrollIntoView({ block: 'end' }), 0) } catch (x) { setErr(x.message) } }
  if (!data) return <div className="chat-thread"><Empty text={err || 'Cargando…'} /></div>
  return <div className="chat-thread">
    {!compact && <div className="th-head"><button className="icon th-back" onClick={onBack} aria-label="Volver"><ChevronLeft size={18} /></button><Avatar name={data.user.name} hue={data.user.hue} size={30} src={data.user.avatar} /><div><div className="name">{data.user.name}</div><div className="meta">@{data.user.handle} · {data.user.city}</div></div></div>}
    <div className="th-msgs">{data.messages.length === 0 && <p className="muted small" style={{ textAlign: 'center', padding: 20 }}>Saluda a {data.user.name.split(' ')[0]}.</p>}
      {data.messages.map(m => <div key={m.id} className={'msg' + (m.mine ? ' mine' : '')}><p>{m.mine ? m.text : <Translatable text={m.text} />}</p><span>{ago(m.at)}</span></div>)}<div ref={end} /></div>
    {err && <div className="banner">{err}</div>}
    <form className="comment-box" onSubmit={send}><input id={compact ? 'dock-input-' + id : 'msg-input'} autoFocus={compact} placeholder="Escribe un mensaje…" value={t} onChange={e => setT(e.target.value)} maxLength={2000} autoComplete="off" /><button className="icon accent" aria-label="Enviar"><Send size={16} /></button></form>
  </div>
}
function Empty({ text }) { return <div className="empty">{text}</div> }

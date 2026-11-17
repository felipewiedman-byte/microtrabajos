import { useEffect, useMemo, useRef, useState } from 'react'
import { IconClock, IconCheck } from './components/Flat'
import { ChevronUp, Megaphone, Maximize2, Globe, Newspaper, Plus, Compass, Users, Search, X, MapPin, ImagePlus, Send, ChevronLeft, Radio, Heart, MessageCircle, Bookmark, Trash2, Flag, ShieldCheck, Globe2, BadgeCheck, Star, Bell, Pencil, Clock, Play, MessagesSquare, CloudSun, Video, ChevronRight, ChevronDown, Minus, KeyRound, LogOut } from 'lucide-react'
import { ME, CATEGORIES, CITIES, cityInfo, homeOf, registerPlaces, catLabel, localTime } from './data'
import { SiteCtx, DEFAULT_SITE, useSite, t, applyTheme, openSell } from './site'
import { shareMatchCard, matchCardBlob, prepararTarjetaEnlace } from './shareCard'
import { siteSvg } from './sitesIcons'
import { useHere, usePeople } from './presence'
import RadioBar, { RadioMenu } from './components/RadioBar'
import { useRadio, play as playRadio } from './radio'
import Brand from './components/Brand'
import FlatIcon from './components/FlatIcon'
import BizList from './components/BizList'
import SitesList from './components/SitesList'
import TvList from './components/TvList'
import EventsList from './components/EventsList'
import { loadWorldEvents, openWorldEvent } from './components/evlayer'
import { lazy, Suspense } from 'react'
const Admin = lazy(() => import('./components/Admin'))
// ¿el equipo puede dibujar el 3D? (WebGL); si no, todo queda en el mapa plano sin errores
const GL_OK = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } })()
const loadMap25D = () => import('./components/Map25D'), Map25D = lazy(loadMap25D)
const DeskEditor = lazy(() => import('./components/DeskEditor'))
// vista previa del editor de ventanas del computador (solo dentro del panel de administración)
const DESK_EDIT = (() => { try { const q = new URLSearchParams(location.search); return q.has('preview') && q.has('desk') } catch { return false } })()
import Sell from './components/Sell'
import { WalkPanel, LiveWalksStrip, StartWalk } from './components/Walks'
import { useWalks } from './walks'
import { useLive } from './live'
import { CamPanel } from './components/Cams'
import MatchEvents from './components/MatchEvents'
import GoalAlert from './components/GoalAlert'
import CityPulse from './components/CityPulse'
import MobileMenu from './components/MobileMenu'
import { TABS_DEFAULT, DMENU_DEFAULT, mergeList, applyLayout } from './layout'
import FestInfo from './components/FestInfo'
import { PlacePicker, ProfileEdit, AccountEdit, NotificationsButton, usePlaceSearch, BIZ } from './components/Extras'
import { api, shrinkImage, prepareImage, prepareVideo, uploadMedia } from './api'
import { ago, km, fmt, safeUrl } from './util'
import { Avatar, Media, TypeTag, Translatable } from './components/ui'
import PostCard from './components/PostCard'
// mapa plano principal vectorial (rápido, sin cuadros de imagen); el de Leaflet queda de respaldo sin aceleración gráfica
const WorldMapGL = lazy(() => import('./components/WorldMapGL'))
const WorldMapLeaf = lazy(() => import('./components/WorldMap'))   // mapa de respaldo (sin WebGL): solo se baja si hace falta
const LeafMap = props => <Suspense fallback={<div className="map"><div className="leaf" /></div>}><WorldMapLeaf {...props} /></Suspense>
const GLMap = props => <Suspense fallback={<div className="map"><div className="leaf" /></div>}><WorldMapGL {...props} /></Suspense>
import Globe3D from './components/Globe'


export default function App() {
  const [tab, setTab] = useState(DESK_EDIT ? 'ahora' : 'planeta')
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  useEffect(() => { if (open != null) dispatchEvent(new CustomEvent('planeta:gopost', { detail: open })) }, [open])
  // 'login' | 'register' | 'forgot' | 'reset' | null — el enlace del correo (#reset=…) abre directo la pantalla de contraseña nueva
  const [auth, setAuth] = useState(() => /^#reset=[a-f0-9]{64}$/.test(location.hash) ? 'reset' : null)
  useEffect(() => { const f = () => { if (/^#reset=[a-f0-9]{64}$/.test(location.hash)) setAuth('reset') }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const [toast, setToast] = useState('')
  const [chatWith, setChatWith] = useState(null)
  const [unread, setUnread] = useState(0)
  const [story, setStory] = useState(null) // city name
  const [pinReq, setPinReq] = useState(0)
  const [mobile, setMobile] = useState(() => !window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => { const f = () => { if (!mobile) setOpen(null) }; addEventListener('planeta:closecity', f); return () => removeEventListener('planeta:closecity', f) }, [mobile])
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
  // cada guardado del panel trae su número de versión: la dirección cambia (salta la caché de Cloudflare) pero todos los visitantes comparten la misma, así el servidor responde una sola vez
  const loadSite = e => fetch('/api/settings' + (e?.detail?.v ? '?v=' + e.detail.v : '')).then(r => r.json()).then(st => { applyLists(st); setSite(st); applyTheme(st) }).catch(() => {})
  useEffect(() => { loadSite(); addEventListener('planeta:settings', loadSite); return () => removeEventListener('planeta:settings', loadSite) }, [])
  useEffect(() => { const f = () => setAdminOpen(location.hash === '#admin'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const isStaff = user && (user.role === 'admin' || user.role === 'mod')
  const [profileOpen, setProfileOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false)
  const logout = async () => { await api.logout(); setUser(null); load(); flash('Sesión cerrada') }
  const [sell, setSell] = useState(null)
  const [menu, setMenu] = useState(false)
  // computador: estado de las ventanas laterales (0 = abierta, 1 = minimizada, 2 = cerrada). No se guarda: al recargar todo vuelve a abrirse
  const here = useHere(user, site.hereOn === true)
  const [eventsOpen, setEventsOpen] = useState(false)   // ventana «Eventos» del computador (eventos del mundo)
  const [tvOpen, setTvOpen] = useState(false)   // ventana «Canales» (televisión en vivo) del computador
  const [sitesOpen, setSitesOpen] = useState(false)   // ventana «Lugares» del computador (cerrar = se desmonta del todo)
  const [bizOpen, setBizOpen] = useState(false)   // ventana «Negocios» del computador (cerrar = se desmonta del todo)
  const [dkHide, setDkHide] = useState({ m: 0, p: 0 })
  const setDk = (k, v) => setDkHide(h => ({ ...h, [k]: v }))
  // X de la ventana derecha: cierra lo ÚLTIMO que se abrió (publicación, ciudad, cámara…) y vuelve a la anterior; cuando ya no queda nada, se cierra la ventana por completo
  const closeRight = () => { if (closeTopRef.current()) return; setDk('p', 2) }
  // al elegir otra sección o abrir una publicación, la ventana derecha vuelve a abrirse
  useEffect(() => { setDkHide(h => +h.p > 0 ? { ...h, p: 0 } : h) }, [tab, open])
  // el CSS del computador usa estos atributos (baratos) en vez de selectores :has() que el navegador reevalúa en cada cambio
  useEffect(() => { const r = document.documentElement; r.toggleAttribute('data-sheet', open != null); r.toggleAttribute('data-listopen', !(+dkHide.p > 0)); return () => { r.removeAttribute('data-sheet'); r.removeAttribute('data-listopen') } }, [open, dkHide.p])
  useEffect(() => { const f = e => { if (e.target.closest?.('.map-brand, .rail-logo')) setDkHide(h => +h.m > 0 ? { ...h, m: 0 } : h) }; addEventListener('click', f); return () => removeEventListener('click', f) }, [])
  // diseño del panel (Diseño): medidas y desplegables como variables CSS; la vista previa del editor se actualiza por mensaje
  useEffect(() => { applyLayout(site.layout) }, [site.layout])
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('preview')) return
    const f = e => { if (e.origin !== location.origin || !e.data) return; if (e.data.type === 'planeta:layout') setSite(s => ({ ...s, layout: e.data.layout })); if (e.data.type === 'planeta:menu') setMenu(!!e.data.open) }
    addEventListener('message', f); return () => removeEventListener('message', f)
  }, [])
  // «Canales» y «Eventos» en el celular: páginas completas que abre el menú (en el computador son ventanas del menú de la izquierda)
  const [mPage, setMPage] = useState(null)   // 'tv' | 'ev' | 'biz' | 'sites'
  const mTv = mPage === 'tv', mEv = mPage === 'ev', mBiz = mPage === 'biz', mSites = mPage === 'sites'
  useEffect(() => { const on = k => () => setMPage(k), L = [['planeta:tv-open', on('tv')], ['planeta:events-open', on('ev')], ['planeta:biz-open', on('biz')], ['planeta:sites-open', on('sites')]]; for (const [n, f] of L) addEventListener(n, f); return () => { for (const [n, f] of L) removeEventListener(n, f) } }, [])
  const toMap = (evName, detail) => { setMPage(null); goTab('planeta'); setTimeout(() => window.dispatchEvent(new CustomEvent(evName, { detail })), 450) }
  const pickEventMobile = async ev => { try { const id = await openWorldEvent(ev); setMPage(null); setOpen(id) } catch { flash('No se pudo abrir el evento. Inténtalo de nuevo.') } }
  const [radioPage, setRadioPage] = useState(false)
  useEffect(() => { const f = e => setRadioPage(!!e.detail); addEventListener('planeta:radio-state', f); return () => removeEventListener('planeta:radio-state', f) }, [])
  // «atrás» y Escape cierran lo que está abierto (ventanas primero, luego paneles) en vez de sacarte de la web
  const closeTop = () => {
    if (mPage) { setMPage(null); return true } if (menu) { setMenu(false); return true } if (radioPage) { dispatchEvent(new Event('planeta:radio-close')); return true } if (open != null) { setOpen(null); return true } if (story) { setStory(null); return true } if (auth) { setAuth(null); return true }
    if (sell) { setSell(null); return true } if (profileOpen) { setProfileOpen(false); return true }
    const ev = new CustomEvent('planeta:back-panels', { detail: { handled: false } }); dispatchEvent(ev); return ev.detail.handled
  }
  const closeTopRef = useRef(closeTop); closeTopRef.current = closeTop
  const hashRef = useRef(location.hash)
  useEffect(() => {
    try { history.pushState({ pl: 1 }, '') } catch { /* sin historial */ }
    const sync = () => { hashRef.current = location.hash }
    // OJO: cambiar el # (por ejemplo #admin) también dispara «popstate»; eso NO es «atrás» y no debe sacar de la web
    const onPop = () => {
      if (location.hash !== hashRef.current) { sync(); return }
      if (closeTopRef.current()) { try { history.pushState({ pl: 1 }, '') } catch { /* sin historial */ } } else history.back()
    }
    const onKey = e => { if (e.key === 'Escape') closeTopRef.current() }
    addEventListener('popstate', onPop); addEventListener('hashchange', sync); addEventListener('planeta:hashsync', sync); addEventListener('keydown', onKey)
    return () => { removeEventListener('popstate', onPop); removeEventListener('hashchange', sync); removeEventListener('planeta:hashsync', sync); removeEventListener('keydown', onKey) }
  }, [])
  useEffect(() => { const f = e => setSell(e.detail); addEventListener('planeta:sell', f); return () => removeEventListener('planeta:sell', f) }, [])
  // regreso desde la pasarela de pago: confirmar y activar
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get('ref'); if (location.pathname !== '/pago' || !ref) return
    history.replaceState(null, '', '/')
    let tries = 0
    const check = () => fetch('/api/pay/verify?ref=' + encodeURIComponent(ref)).then(r => r.json()).then(d => {
      if (d.status === 'paid') { flash(d.item === 'radio' ? 'Pago aprobado. Tu emisora ya está sonando.' : d.item === 'evento' ? 'Pago aprobado. Tu evento ya está promocionado.' : 'Pago aprobado. Tu negocio ya está destacado.'); api.me().then(x => setUser(x.user)).catch(() => {}); load() }
      else if (++tries < 4) setTimeout(check, 4000)
      else flash('Tu pago aún no aparece aprobado. Si pagaste, se activará solo en unos minutos.')
    }).catch(() => flash('No pudimos confirmar el pago. Si pagaste, se activará solo en unos minutos.'))
    check()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  useEffect(() => { const m = /^\/p\/(\d+)$/.exec(location.pathname); if (m) setOpen(+m[1]) }, [])
  useEffect(() => { if (open) { if (location.pathname !== '/p/' + open) history.replaceState(null, '', '/p/' + open) } else if (location.pathname.startsWith('/p/')) history.replaceState(null, '', '/') }, [open])
  const [follows, setFollows] = useState([])
  useEffect(() => { if (user) api.follows().then(d => setFollows(d.follows)).catch(() => {}); else setFollows([]) }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
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
  useEffect(() => { const f = e => { const p = e.detail; if (p?.id) setPosts(ps => ps.some(x => x.id === p.id) ? ps : [p, ...ps]) }; addEventListener('planeta:addpost', f); return () => removeEventListener('planeta:addpost', f) }, [])
  // los eventos del mundo tienen su propia ventana: no se mezclan con el mapa, las listas ni las historias
  const feed = useMemo(() => posts.filter(p => p.handle !== 'eventos'), [posts])
  const replace = p => setPosts(ps => ps.map(x => x.id === p.id ? { ...x, ...p } : x))
  const toggle = async (id, what) => { if (!requireUser()) return; try { const d = await api.toggle(id, what); replace(d.post); return d.post } catch (e) { flash(e.message) } }
  const cardProps = { onOpen: p => setOpen(p.id), onLike: id => toggle(id, 'like'), onSave: id => toggle(id, 'save') }
  const card = p => <PostCard key={p.id} post={p} liked={p.liked} saved={p.saved} {...cardProps} />
  useEffect(() => { dispatchEvent(new Event('planeta:radio-close')) }, [tab])
  const goPublish = () => { if (requireUser()) { setTab('planeta'); setPinReq(n => n + 1) } }
  const goTab = id => { window.dispatchEvent(new Event('planeta:closecity')); if (id === 'planeta') window.dispatchEvent(new Event('planeta:world')); window.dispatchEvent(new Event('planeta:leaveglobe')); setTab(id) }

  return (<SiteCtx.Provider value={site}>
    <div className={'app' + (inMap ? ' wide' : '') + (user ? ' logged' : '') + (+dkHide.m ? ' dk-m' + +dkHide.m : '') + (+dkHide.p ? ' dk-p' + +dkHide.p : '')}>
      {(mobile || !(+dkHide.m > 0)) && <Sidebar bizOpen={bizOpen} onBiz={() => { setSitesOpen(false); setTvOpen(false); setEventsOpen(false); setBizOpen(o => !o) }} sitesOpen={sitesOpen} onSites={() => { setBizOpen(false); setTvOpen(false); setEventsOpen(false); window.dispatchEvent(new Event('planeta:closecity')); setSitesOpen(o => !o) }} tvOpen={tvOpen} onTv={() => { setBizOpen(false); setSitesOpen(false); setEventsOpen(false); window.dispatchEvent(new Event('planeta:closecity')); setTvOpen(o => !o)} } eventsOpen={eventsOpen} onEvents={() => { setBizOpen(false); setSitesOpen(false); setTvOpen(false); window.dispatchEvent(new Event('planeta:closecity')); setEventsOpen(o => !o) }} onCloseWins={() => { setBizOpen(false); setSitesOpen(false); setTvOpen(false); setEventsOpen(false) }} mobile={mobile} notif={<NotificationsButton user={user} tipRight onOpenPost={id => setOpen(id)} onOpenChat={openChat} />} isStaff={isStaff} onAdmin={() => { location.hash = 'admin' }} tab={tab} setTab={id => { window.dispatchEvent(new Event('planeta:closecity')); if (id === 'planeta') window.dispatchEvent(new Event('planeta:world')); window.dispatchEvent(new Event('planeta:leaveglobe')); setTab(id) }} goPublish={goPublish} user={user} unread={unread} onAuth={() => setAuth('login')} posts={posts} onOpen={id => setOpen(id)} />}
      {!mobile && bizOpen && <BizList onClose={() => setBizOpen(false)} onPick={b => { window.dispatchEvent(new CustomEvent('planeta:biz', { detail: b })) }} />}
      {['m', 'p'].map(k => { const st = +dkHide[k] || 0, label = k === 'm' ? 'Menú' : 'Lista'
        if (st === 2) return null
        return <div key={k} className={'dk-strip dk-strip-' + k + (st === 1 ? ' dk-min' : '')}><span>{label.toUpperCase()}</span>
          <button onClick={() => setDk(k, st === 1 ? 0 : 1)} aria-label={(st === 1 ? 'Restaurar ' : 'Minimizar ') + label.toLowerCase()} title={st === 1 ? 'Restaurar' : 'Minimizar'}>{st === 1 ? <Maximize2 size={13} /> : <Minus size={14} />}</button>
          <button onClick={() => k === 'p' ? closeRight() : setDk('m', 2)} aria-label={'Cerrar ' + label.toLowerCase()} title="Cerrar"><X size={14} /></button></div> })}
      <main className="screen">
        {error && <div className="banner">{error} <button className="link" onClick={load}>Reintentar</button></div>}
        {inMap && <PlanetaScreen eventsOpen={eventsOpen} onEventsClose={() => setEventsOpen(false)} tvOpen={tvOpen} onTvClose={() => setTvOpen(false)} sitesOpen={sitesOpen} onSitesClose={() => setSitesOpen(false)} onLogout={logout} onAccount={() => setAccountOpen(true)} dkClosed={!mobile && +dkHide.p > 0} mobile={mobile} paused={mobile && (open != null || !!story || !!auth || !!sell || profileOpen || radioPage)} follow={{ follows, toggleFollow, isFollowing }} onEditProfile={() => setProfileOpen(true)} posts={posts} user={user} card={card} hasMore={more} onMore={loadMore} videoMax={videoMax} mode={tab === 'huella' ? 'huella' : tab === 'ahora' ? 'muro' : ['cerca', 'mensajes', 'comunidad'].includes(tab) ? 'panel' : 'explorar'}
          side={tab === 'cerca' ? <CercaScreen posts={feed} card={card} user={user} /> : tab === 'mensajes' ? <MensajesScreen user={user} chatWith={chatWith} setChatWith={setChatWith} onAuth={setAuth} onRead={() => api.chats().then(d => setUnread(d.unread)).catch(() => {})} /> : tab === 'comunidad' ? <ComunidadScreen here={here} onUser={setUser} follow={{ follows, toggleFollow, isFollowing }} onEditProfile={() => setProfileOpen(true)} posts={posts} user={user} card={card} onAuth={setAuth} onOpen={id => setOpen(id)} onChat={openChat} onLogout={async () => { await api.logout(); setUser(null); load(); flash('Sesión cerrada') }} /> : null} onOpen={id => setOpen(id)} onChat={openChat} onStory={setStory} pinReq={pinReq} requireUser={requireUser} onPublished={p => { registerPlaces([p]); setPosts(ps => [p, ...ps]); flash(t(site, 'published')) }} chatCities={chatCities} flash={flash} />}
        
        {tab === 'ahora' && mobile && <AhoraScreen posts={feed} card={card} loading={loading} user={user} onStory={setStory} hasMore={more} onMore={loadMore} />}
        {mobile && tab === 'mensajes' && <MensajesScreen user={user} chatWith={chatWith} setChatWith={setChatWith} onAuth={setAuth} onRead={() => api.chats().then(d => setUnread(d.unread)).catch(() => {})} />}
        {tab === 'publicar' && <PublicarScreen user={user} onCancel={() => setTab('ahora')} onPublished={p => { setPosts(ps => [p, ...ps]); setTab('ahora'); flash(t(site, 'published')) }} />}
        {mobile && tab === 'cerca' && <CercaScreen posts={feed} card={card} user={user} />}
        {mobile && tab === 'comunidad' && <ComunidadScreen here={here} onUser={setUser} follow={{ follows, toggleFollow, isFollowing }} onEditProfile={() => setProfileOpen(true)} posts={posts} user={user} card={card} onAuth={setAuth} onOpen={id => setOpen(id)} onChat={openChat} onLogout={async () => { await api.logout(); setUser(null); load(); flash('Sesión cerrada') }} />}
      </main>
      {!inMap && <Aside posts={feed} onOpen={id => setOpen(id)} goMap={() => setTab('planeta')} />}
      {tab !== 'publicar' && <nav className="tabbar">
        {mergeList(TABS_DEFAULT, site.layout?.tabs).filter(t => t.show).map(t => [t.id, { ahora: Newspaper, planeta: Globe, publicar: Plus, mensajes: MessagesSquare, comunidad: Users }[t.id], t.label]).map(([id, Icon, label]) =>
          <button key={id} aria-label={label} className={(tab === id ? 'on ' : '') + (id === 'publicar' ? 'pub' : '')} onClick={() => { if (id === 'publicar') return goPublish(); if (id === 'planeta') { window.dispatchEvent(new Event('planeta:closecity')); window.dispatchEvent(new Event('planeta:world')); window.dispatchEvent(new Event('planeta:leaveglobe')) } setTab(id) }}><span className="ico"><Icon size={id === 'publicar' ? 22 : 20} strokeWidth={1.75} />{id === 'mensajes' && unread > 0 && <i className="badge">{unread}</i>}</span><span>{label}</span></button>)}
      </nav>}
      {DESK_EDIT && <Suspense fallback={null}><DeskEditor desk={site.layout?.desk} onChange={d => { try { parent.postMessage({ type: 'planeta:desk', desk: d }, location.origin) } catch { /* sin ventana madre */ } }} /></Suspense>}
      <ShareCardHost flash={flash} />
      {story && <StoryViewer city={story} posts={feed} onClose={() => setStory(null)} onOpen={id => { setStory(null); setOpen(id) }} />}
      {open && <PostDetail id={open} user={user} onChat={openChat} onClose={() => setOpen(null)} onToggle={toggle} requireUser={requireUser} flash={flash}
        onDeleted={id => { setPosts(ps => ps.filter(p => p.id !== id)); setOpen(null); flash('Publicación eliminada') }} onChanged={replace} />}
      {auth && <AuthModal mode={auth} setMode={setAuth} onClose={() => setAuth(null)} onDone={u => { setUser(u); setAuth(null); load(); flash('Hola, ' + u.name.split(' ')[0]) }} />}
      {(!user || mobile) && <RadioBar />}
      {user && <ChatDock chats={chats} docks={docks} setDocks={setDocks} openChat={openChat} unread={unread} onChange={refreshChats} me={user} onCities={setChatCities} />}
      {accountOpen && user && <AccountEdit user={user} onClose={() => setAccountOpen(false)} onDone={() => { setAccountOpen(false); flash('Cuenta actualizada') }} />}
      {profileOpen && user && <ProfileEdit user={user} onClose={() => setProfileOpen(false)} onSaved={u => { setUser(u); registerPlaces([u]); setProfileOpen(false); load(); flash('Perfil actualizado') }} />}
      {mobile && mTv && <div className="mob-page"><TvList mobile onClose={() => setMPage(null)} /></div>}
      {mobile && mEv && <div className="mob-page"><EventsList mobile onPick={pickEventMobile} onClose={() => setMPage(null)} /></div>}
      {mobile && mBiz && <div className="mob-page"><BizList mobile onClose={() => setMPage(null)} onPick={b => toMap('planeta:biz', b)} /></div>}
      {mobile && mSites && <div className="mob-page"><SitesList mobile onClose={() => setMPage(null)} onPick={st => toMap('planeta:site', st.id)} /></div>}
      {mobile && <MobileMenu onLogout={logout} onAccount={() => setAccountOpen(true)} onProfile={() => setProfileOpen(true)} open={menu} setOpen={setMenu} tab={tab} go={goTab} user={user} unread={unread} isStaff={isStaff} onPublish={goPublish} onAuth={setAuth} onAdmin={() => { location.hash = 'admin' }} />}
      {mobile && <NotificationsButton user={user} className="notif-mobile" onOpenPost={id => setOpen(id)} onOpenChat={openChat} />}
      {adminOpen && isStaff && <Suspense fallback={<div className="toast">Cargando panel…</div>}><Admin user={user} flash={flash} onSettings={st => { applyLists(st); setSite(st); applyTheme(st) }} onClose={() => { history.replaceState(null, '', location.pathname); window.dispatchEvent(new Event('planeta:hashsync')); setAdminOpen(false) }} /></Suspense>}
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
  const many = items.length > 4
  return <>
    {many && <select className="dd" value={value} onChange={e => onChange(e.target.value)}>{items.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}
    <div className={'chips' + (many ? ' chips-many' : '')}>{items.map(([id, label, Icon]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{Icon && <Icon size={14} />}{label}</button>)}</div>
  </>
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
    <select className="cat-select" value={cat} onChange={e => setCat(e.target.value)} aria-label="Tema">{[['todo', 'Todos los temas'], ...CATEGORIES.map(c => [c.id, c.label])].map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
    <div className="feed-cats"><Chips value={cat} onChange={setCat} items={[['todo', 'Todo'], ...CATEGORIES.map(c => [c.id, c.label])]} /></div>
    <div className="feed">{loading ? <Empty text="Cargando publicaciones…" /> : list.length ? list.map(card) : <Empty text="Aún no hay publicaciones aquí. Sé el primero en compartir algo." />}
      {hasMore && <button className="btn ghost block" onClick={onMore}>Cargar más publicaciones</button>}</div>
  </>
}

const inView = (g, b) => { if (!b) return true; const lon = ((g.lon - b.w) % 360 + 360) % 360; return g.lat >= b.s && g.lat <= b.n && (b.e - b.w >= 360 || lon <= b.e - b.w) }
const nearest = (lat, lon) => CITIES.map(c => [c, (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2]).sort((a, b) => a[1] - b[1])[0][0]
const where = p => p.lat != null && p.lon != null ? { lat: p.lat, lon: p.lon } : cityInfo(p.city)

// el mundo redondo sale al abrir o recargar la web (una vez por carga), NO cada vez que se cambia de pestaña
let globeVisto = false
function PlanetaScreen({ eventsOpen, onEventsClose, tvOpen, onTvClose, sitesOpen, onSitesClose, onLogout, onAccount, dkClosed, mobile, paused, follow, onEditProfile, posts, user, card, side, mode, hasMore, onMore, videoMax, onOpen, onChat, onStory, pinReq, requireUser, onPublished, chatCities, flash }) {
  const [sel, setSel] = useState(null); const [focus, setFocus] = useState(null); const [q, setQ] = useState(''); const [active, setActive] = useState(null)
  const viewRef = useRef(null); const [bounds, setBounds] = useState(null); const [cat, setCat] = useState('todo'); const [listSt, setListSt] = useState('mini'), sheet = listSt !== 'mini', setSheet = v => setListSt(s => (typeof v === 'function' ? v(s !== 'mini') : v) ? 'half' : 'mini')   // celular: la lista de abajo tiene 3 posiciones (mini = solo la barra, mitad, toda)
  const [pinMode, setPinMode] = useState(false); const [drop, setDrop] = useState(null)
  const [places, setPlaces] = useState(null), [bizSel, setBizSel] = useState(null)
  const [sitesAll, setSitesAll] = useState(null), [siteSel, setSiteSel] = useState(null), siteOn = useSite().sitesOn !== false, vecOn = useSite().vectorStreets !== false
  const MainMap = GL_OK && vecOn ? GLMap : LeafMap
  // paseos en vivo
  const liveS = useLive(), [camSel, setCamSel] = useState(null), [dailyView, setDailyView] = useState(false), [challenge, setChallenge] = useState(false)
  const cam = camSel && liveS.cams.find(c => c.id === camSel)
  // un solo panel a la vez: al abrir algo nuevo se CIERRA lo anterior (antes quedaba escondido detrás y reaparecía al cerrar el nuevo)
  const closePanels = keep => { if (!mobile && keep !== true) onOpen(null); setSel(null); setActive(null); setBizSel(null); setSiteSel(null); setWalkSel(null); setWalkRoute(null); setCamSel(null); setStartWalk(false) }
  // tocar cualquier pin (negocio, cámara, publicación) siempre lleva el mapa a ese lugar, no solo abre la ventana
  const pickBiz = id => { const pl = (places?.places || []).find(x => x.id === id); closePanels(); setBizSel(id); if (pl) goPlace(+pl.lat, +pl.lon, Math.max(15, Math.round(bounds?.z || 0))) }
  useEffect(() => { if (!siteOn || sitesAll) return; let on = true; fetch('/api/sites').then(r => r.json()).then(d => { if (on) setSitesAll(d.sites || []) }).catch(() => {}); return () => { on = false } }, [siteOn, sitesAll])
  // lugares visibles según el zoom: desde lejos solo los más famosos; al acercarse, más
  const sitesView = useMemo(() => { if (!siteOn || !sitesAll || !bounds || mode === 'huella') return null; const z = bounds.z, r = z < 3.5 ? 1 : z < 6 ? 2 : 3; return sitesAll.filter(s => s.rank <= r && s.lat >= bounds.s - 1 && s.lat <= bounds.n + 1 && (bounds.e - bounds.w >= 340 || (s.lon >= bounds.w - 1 && s.lon <= bounds.e + 1) || s.lon + 360 >= bounds.w - 1 && s.lon + 360 <= bounds.e + 1 || s.lon - 360 >= bounds.w - 1 && s.lon - 360 <= bounds.e + 1)) }, [siteOn, sitesAll, bounds, mode])
  const pickSite = id => { const s = (sitesAll || []).find(x => x.id === id); closePanels(); setSiteSel(id); if (s) { if (mobile || flatRef.current || modeRef.current === 'huella') fly(s.lat, s.lon, Math.max(11, Math.round(bounds?.z || 0))); else setStreet({ lat: s.lat, lon: s.lon, zoom: 15.5 }) } } // en 3D, un sitio turístico se abre algo más lejos para ver el lugar completo
  const openCam = id => { const c = (liveS.cams || []).find(x => x.id === id); closePanels(); setCamSel(id); leaveGlobe(); if (c) goPlace(+c.lat, +c.lon, Math.max(16, Math.round(bounds?.z || 0))) }
  const joinDaily = () => { if (!requireUser()) return; setChallenge(true); setDrop(null); setSel(null); setPinMode(true) }
  // vista de calle en perspectiva (se apaga con el botón "plano" y se recuerda en esta sesión)
  const [street, setStreet] = useState(null), radioStations = useRadio(s => s.stations)
  const modeRef = useRef(mode); modeRef.current = mode
  const flatRef = useRef(!GL_OK || (() => { try { return localStorage.getItem('flat') === '1' } catch { return false } })())
  const goStreet = (c, z, force) => { if (!GL_OK) return; if (force) { flatRef.current = false; try { localStorage.removeItem('flat') } catch {} } if (flatRef.current || mode === 'huella') return; setStreet({ ...c, zoom: z }) }
  // al acercarse a nivel ciudad se descarga por adelantado la vista 3D (así al pulsar 3D ya está lista)
  const near = !!bounds && bounds.z >= 11; useEffect(() => { if (near && GL_OK) loadMap25D() }, [near])
  // en computador la vista 3D se descarga en segundo plano poco después de abrir la web, para que al tocar un pin ya esté lista
  useEffect(() => { if (mobile || !GL_OK) return; const id = setTimeout(() => (window.requestIdleCallback || (f => f()))(loadMap25D), 3500); return () => clearTimeout(id) }, [mobile])
  // tocar un pin o lugar: el mapa viaja allí y se abre en vista 3D de calles (si la persona pulsó «2D», se respeta y queda plano)
  const goPlace = (lat, lon, z) => { if (mobile || flatRef.current || modeRef.current === 'huella') fly(lat, lon, z); else setStreet({ lat, lon, zoom: 16 }) }   // en 3D no se mueve el mapa plano escondido (ahorra bajar cuadros dos veces); al salir del 3D el mapa plano se acomoda solo
  const leaveStreet = v => { setStreet(null); fly(v.lat, v.lon, Math.min(v.zoom, 11.5)) }
  const walksS = useWalks(), [walkSel, setWalkSel] = useState(null), [walkRoute, setWalkRoute] = useState(null), [followWalk, setFollowWalk] = useState(true), [startWalk, setStartWalk] = useState(false)
  const [myWalk, setMyWalk] = useState(null), myWalkRef = useRef(null); myWalkRef.current = myWalk
  const openWalk = id => { closePanels(); setWalkSel(id); setFollowWalk(true); leaveGlobe() }
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
  useEffect(() => { if (!bounds || mode === 'huella') return; const t = setTimeout(() => fetch(`/api/places?s=${bounds.s}&n=${bounds.n}&w=${bounds.w}&e=${bounds.e}&z=${bounds.z}`).then(r => r.json()).then(setPlaces).catch(() => {}), 300); return () => clearTimeout(t) }, [bounds, mode])
  const [globeAt, setGlobeAt] = useState(null)

  // el globo es la pantalla principal: sale SIEMPRE al abrir o recargar la web (salvo en un enlace directo a una publicación)
  const [globe, setGlobe] = useState(() => { const ver = !globeVisto && !location.pathname.startsWith('/p/'); globeVisto = true; return ver })
  const leaveGlobe = () => setGlobe(false)
  // el botón «Mapa» siempre lleva al mapa con la lista (el globo solo se ve al entrar o al alejar el mapa al máximo)
  useEffect(() => { const f = () => leaveGlobe(); addEventListener('planeta:leaveglobe', f); return () => removeEventListener('planeta:leaveglobe', f) }, [])
  const home = homeOf(user)
  const qq = q.trim().toLowerCase()
  const site = useSite()
  const huella = mode === 'huella', wall = mode === 'muro'
  const placeHits = usePlaceSearch(huella ? '' : q)
  const [scope, setScope] = useState('vista')
  const minorZ = useSite().sportsMinorZoom ?? 6, zNow = bounds ? bounds.z : 0   // partidos menores: solo al acercar el mapa (ajustable en el panel)
  const feedP = useMemo(() => posts.filter(p => p.handle !== 'eventos' && !(p.match?.mn && zNow < minorZ)), [posts, zNow, minorZ])   // sin los eventos (tienen su ventana)
  const mine = useMemo(() => posts.filter(p => p.mine).sort((a, b) => a.at - b.at), [posts])
  const base = huella ? mine : feedP.filter(p => (!dailyView || (liveS.daily && p.challenge === liveS.daily.key)) && (cat === 'todo' || p.cat === cat) && (!qq || (p.title + ' ' + p.city + ' ' + cityInfo(p.city).country + ' ' + catLabel(p.cat) + ' ' + p.author).toLowerCase().includes(qq)))
  // pines del mapa: las publicaciones de usuarios salen del mapa a las 24 horas (la publicación NO se borra: sigue en las listas y el muro). Partidos, noticias verificadas y «Tu huella» no se tocan.
  // eventos del mundo (Wikidata): solo en computador; se bajan una vez y el servidor los guarda en memoria 10 min
  const wdOn = useSite().wdEventsOn !== false
  const [wdEvents, setWdEvents] = useState(null), [wdSel, setWdSel] = useState(null)
  // abrir un evento: el servidor lo convierte en publicación (foto, descripción, compartir, comentarios) y se abre como cualquier otra
  const openWd = async ev => { try { setWdSel(ev.id); const id = await openWorldEvent(ev); onEventsClose(); onOpen(null); setTimeout(() => onOpen(id), 30) } catch { setWdSel(null) } }
  useEffect(() => { if (wdOn) loadWorldEvents().then(setWdEvents) }, [wdOn])
  const [reloj, setReloj] = useState(0); useEffect(() => { const t = setInterval(() => setReloj(r => r + 1), 5 * 60e3); return () => clearInterval(t) }, [])
  const points = useMemo(() => { const ya = Date.now(); return base.filter(p => huella || p.type !== 'usuario' || p.featured || ya - p.at < 864e5).map(p => ({ ...cityInfo(p.city), post: p })) }, [posts, cat, qq, huella, dailyView, liveS.daily?.key, reloj]) // eslint-disable-line react-hooks/exhaustive-deps
  const isLive = p => p.type === 'directo' || ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(p.match?.st)
  // lo que está EN VIVO va siempre primero (el más reciente arriba); luego el resto en su orden
  // lo EN VIVO de todo el mundo siempre arriba (el más reciente primero); debajo, lo que está en la zona del mapa
  const liveAll = base.filter(isLive).sort((a, b) => b.at - a.at)
  const visible = [...liveAll, ...(wall && scope === 'mundo' ? base : base.filter(p => inView(cityInfo(p.city), bounds))).filter(p => !isLive(p))]
  const vCities = [...new Set(visible.map(p => p.city))], vCountries = [...new Set(visible.map(p => cityInfo(p.city).country))]
  const place = vCities.length === 1 ? vCities[0] + ', ' + cityInfo(vCities[0]).country : vCountries.length === 1 ? vCountries[0] : vCountries.length ? vCountries.length + ' países a la vista' : 'Nada a la vista'
  const regions = (site.regions || []).map(([n, lat, lon, z]) => [n, lon, lat, z])
  const [regOpen, setRegOpen] = useState(false)
  useEffect(() => { if (sitesOpen && (sel || cam || bizSel)) onSitesClose() }, [sel, cam, bizSel]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = () => { setSel(null); setBizSel(null); setSiteSel(null); setWalkSel(null); setWalkRoute(null); setDailyView(false); setCamSel(null) }; addEventListener('planeta:closecity', f); return () => removeEventListener('planeta:closecity', f) }, [])
  useEffect(() => { if (!regOpen) return; const f = e => { if (!e.target.closest('.reg-menu')) setRegOpen(false) }; document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f) }, [regOpen])
  const fly = (lat, lon, z) => setFocus({ lon, lat, z, n: Math.random() })
  // al abrir una publicación (historia, lista, aviso…) el mapa también va a su lugar
  const postsRef = useRef(posts); postsRef.current = posts
  useEffect(() => { const f = e => { const p = postsRef.current.find(x => x.id === e.detail); if (!p) return; const g = where(p); closePanels(true); leaveGlobe(); if (!mobile) { setSel(p.city); setActive(p.id) } if (mobile || flatRef.current || modeRef.current === 'huella') fly(g.lat, g.lon, p.lat != null ? 15 : 10); else setStreet({ lat: g.lat, lon: g.lon, zoom: 16 }) }; addEventListener('planeta:gopost', f); return () => removeEventListener('planeta:gopost', f) }, [mobile]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const openCity = (c, postId) => { closePanels(); if (!mobile) onOpen(null); setSel(c); setActive(postId ?? null); setDrop(null); setPinMode(false); const pp = postId != null && base.find(p => p.id === postId), g = pp && pp.lat != null ? where(pp) : cityInfo(c); if (mobile || flatRef.current || mode === 'huella') fly(g.lat, g.lon, 9); else setStreet({ lat: g.lat, lon: g.lon, zoom: 16 }) }   // una sola llamada: el pin abre directo la vista 3D de la ciudad (si la persona pulsó «2D», se queda plano)
  const onPin = c => openCity(c, base.find(p => p.city === c)?.id)
  useEffect(() => { if (pinReq) { leaveGlobe(); setPinMode(true); closePanels(); setDrop(null) } }, [pinReq]) // eslint-disable-line react-hooks/exhaustive-deps
  // atrás del navegador / Escape: cierra lo que está arriba, de lo más reciente a lo más antiguo
  useEffect(() => {
    const f = e => {
      if (e.detail.handled) return
      if (drop) { setDrop(null); setChallenge(false) } else if (pinMode) { setPinMode(false); setChallenge(false) } else if (startWalk) setStartWalk(false)
      else if (sel || bizSel || walkSel || camSel) closePanels()
      else if (dailyView) setDailyView(false)
      else if (street) setStreet(null)
      else return
      e.detail.handled = true
    }
    addEventListener('planeta:back-panels', f); return () => removeEventListener('planeta:back-panels', f)
  })
  // radio con mapa: sintoniza la emisora más cercana al centro del mapa
  const rStations = useRadio(s => s.stations)
  useEffect(() => {
    const f = () => {
      if (!bounds) return flash?.('Mueve el mapa primero.')
      const c = { lat: (bounds.s + bounds.n) / 2, lon: (bounds.w + bounds.e) / 2 }
      const near = rStations.map(s => { const q = s.lat != null && s.lon != null ? s : cityInfo(s.city); return [s, q.lat || q.lon ? km(c, q) : Infinity] }).filter(x => isFinite(x[1])).sort((a, b) => a[1] - b[1])[0]
      if (!near) return flash?.('Aún no hay emisoras con ubicación.')
      playRadio(near[0]); flash?.('Sintonizando ' + near[0].name + (near[1] > 1 ? ' · a ' + Math.round(near[1]) + ' km del centro del mapa' : ''))
    }
    addEventListener('planeta:tune', f); return () => removeEventListener('planeta:tune', f)
  }, [bounds, rStations, flash])
  useEffect(() => { setDailyView(false) }, [mode])
  // volver al mapa del mundo completo (botón Mapa o logo)
  useEffect(() => { const f = () => { setSel(null); setBizSel(null); setSiteSel(null); setWalkSel(null); setWalkRoute(null); setCamSel(null); setStreet(null); setQ(''); setFocus({ lon: -40, lat: 18, z: 2.5, n: Math.random() }) }; addEventListener('planeta:world', f); return () => removeEventListener('planeta:world', f) }, [])
  useEffect(() => { if (huella) { setSel(null); setFocus({ lon: -30, lat: 20, z: 2.5, n: Math.random() }) } }, [huella])
  const place2 = ll => { if (!requireUser()) return; closePanels(); setDrop({ lat: ll.lat, lon: ll.lng }); setPinMode(false) }
  const cats = [['todo', 'Todo'], ['eventos', 'Eventos'], ['planes', 'Planes'], ['lugares', 'Lugares'], ['noticias', 'Noticias'], ['deportes', 'Deportes']]
  const live = visible.filter(p => p.type === 'directo').length
  const footprint = huella ? mine.map(where) : null
  const chatLines = (chatCities || []).map(c => cityInfo(c)).filter(Boolean)

  // CELULAR: cada cosa (ciudad, cámara, paseo, negocio) es SU PROPIA PÁGINA. El mapa se destruye mientras tanto
  // (sin mapa, sin descargas, sin batería gastada) y vuelve exactamente donde estaba. En computador siguen las ventanas flotantes.
  const panels = <>
    {cam && !sel && <CamPanel cam={cam} cams={liveS.cams} onClose={() => setCamSel(null)} onPick={openCam} onFly={c => goPlace(+c.lat, +c.lon, 12)} />}
    {walkSel && !sel && !bizSel && <WalkPanel id={walkSel} user={user} onClose={() => { setWalkSel(null); setWalkRoute(null) }} onRoute={setWalkRoute} follow={followWalk} setFollow={setFollowWalk} requireUser={requireUser} flash={flash} mine={myWalk && myWalk.id === walkSel ? myWalk : null} onEnd={() => endWalk(walkSel)} />}
    {startWalk && <StartWalk user={user} isAdmin={user?.role === 'admin'} onClose={() => setStartWalk(false)} onStarted={beginWalk} />}
    {siteSel && !sel && !bizSel && <SitePanel id={siteSel} onClose={() => setSiteSel(null)} />}
    {eventsOpen && !mobile && !siteSel && !sel && !bizSel && !cam && <EventsList events={wdEvents} sel={wdSel} onPick={openWd} onClose={() => { setWdSel(null); onEventsClose() }} />}
    {tvOpen && !mobile && !siteSel && !sel && !bizSel && !cam && <TvList onClose={onTvClose} />}
    {sitesOpen && !mobile && !siteSel && !sel && !bizSel && !cam && <SitesList sites={sitesAll} onPick={s => pickSite(s.id)} onClose={onSitesClose} />}
    {bizSel && !sel && <BizPanel id={bizSel} user={user} onClose={() => setBizSel(null)} onOpen={onOpen} onChat={onChat} />}
    {sel && <CityPanel follow={follow} city={sel} posts={posts.filter(p => p.city === sel)} active={active} user={user} onClose={() => { setSel(null); setActive(null) }} onOpen={onOpen} onChat={onChat} onStory={onStory} requireUser={requireUser} flash={flash} onStreets={() => { const g = cityInfo(sel); if (mobile) { viewRef.current = { lat: g.lat, lon: g.lon, z: 14 }; setSel(null); setActive(null) } fly(g.lat, g.lon, 14) }} />}
  </>
  useEffect(() => { const r = document.documentElement; r.toggleAttribute('data-dk', !(globe && mode === 'explorar')); r.toggleAttribute('data-city', !!(sel || camSel || walkSel || bizSel || startWalk || drop)); r.toggleAttribute('data-drop', !!drop); return () => { r.removeAttribute('data-dk'); r.removeAttribute('data-city'); r.removeAttribute('data-drop') } }, [globe, mode, sel, camSel, walkSel, bizSel, startWalk, drop])
  const hereOn = useSite().hereOn === true
  const people = usePeople(bounds, hereOn && !(globe && mode === 'explorar') && !(mobile && (paused || sel || camSel || walkSel || bizSel || startWalk)))
  // desde la ventana «Negocios»: ir al lugar y abrir la ficha del negocio
  useEffect(() => { const f = e => { if (e.detail) pickSite(e.detail) }; addEventListener('planeta:site', f); return () => removeEventListener('planeta:site', f) }, [sitesAll]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: usa la lista de lugares ya cargada
  useEffect(() => { const f = e => { const b = e.detail; if (!b || !Number.isFinite(+b.lat)) return; closePanels(); setBizSel(b.id); goPlace(+b.lat, +b.lon, 16); leaveGlobe() }; addEventListener('planeta:biz', f); return () => removeEventListener('planeta:biz', f) }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  // celular: al abrir una ciudad, un negocio o una cámara el MAPA se queda a la vista (la ficha sube desde abajo como tarjeta y el mapa se centra en el lugar); solo los paseos en vivo y las ventanas de pantalla completa ocultan el mapa
  // celular: la tarjeta de abajo tiene 3 posiciones que elige la persona con los botones: mini (solo el título, el mapa casi completo), mitad y toda la pantalla
  const sheetOn = !!mobile && !!(sel || camSel || bizSel || siteSel)
  const [sheetSt, setSheetSt] = useState('half')
  useEffect(() => { setSheetSt('half') }, [sel, camSel, bizSel, siteSel])
  useEffect(() => { const r = document.documentElement; if (sheetOn) r.dataset.sheetSt = sheetSt; else delete r.dataset.sheetSt; return () => { delete r.dataset.sheetSt } }, [sheetOn, sheetSt])
  const hideMap = !!mobile && (!!paused || !!(walkSel || startWalk))
  if (hideMap) return <div className="planet page">{paused ? null : panels}</div>
  return <div className={'planet' + (sel ? ' city-open' : '')}>
    {sheetOn && <div className={'sheet-ctl st-' + sheetSt}>{sheetSt !== 'mini' && <button type="button" onClick={() => setSheetSt(s => s === 'full' ? 'half' : 'mini')} aria-label="Bajar la tarjeta" title="Bajar"><ChevronDown size={20} /></button>}{sheetSt !== 'full' && <button type="button" onClick={() => setSheetSt(s => s === 'mini' ? 'half' : 'full')} aria-label="Subir la tarjeta" title="Subir"><ChevronUp size={20} /></button>}</div>}
    <MainMap wdEvents={wdOn ? wdEvents : null} wdSel={wdSel} onWdPick={id => { const ev = (wdEvents || []).find(x => x.id === id); if (ev) openWd(ev) }} sheet={!!mobile && !!(sel || camSel || bizSel || siteSel)} people={people} onPerson={p => { if (p.id !== user?.id) onChat(p.id) }} initial={viewRef.current} points={points} selected={sel} onSelect={onPin} focus={focus} home={home} onBounds={b => { setBounds(b); viewRef.current = { lat: (b.s + b.n) / 2, lon: (b.w + b.e) / 2, z: b.z } }} pinMode={pinMode} onPlace={place2} drop={drop} footprint={footprint} chatLines={chatLines} places={mode === 'huella' ? null : places} onPlacePick={pickBiz} sites={sitesView} siteSel={siteSel} onSitePick={pickSite} onGlobe={!globe && mode === 'explorar' ? () => { setSel(null); setGlobeAt(bounds ? { lat: (bounds.s + bounds.n) / 2, lon: (bounds.w + bounds.e) / 2 } : null); setGlobe(true) } : null} onStreet={GL_OK ? goStreet : undefined} cams={liveS.cams} onCamPick={openCam} camSel={camSel} walks={walksS.list} walkRoute={walkRoute} onWalkPick={openWalk} followWalk={followWalk && !!walkSel} onZoomOutMax={(lat, lon) => { if (mode === 'explorar' && !pinMode && !drop) { setSel(null); setGlobeAt({ lat, lon }); setGlobe(true) } }} />
    {globe && mode === 'explorar' && <GlobeHome posts={feedP} points={points} home={globeAt ? { ...home, lat: globeAt.lat, lon: globeAt.lon } : home} site={site} onEnter={(lat, lon, z) => { leaveGlobe(); fly(lat, lon, z) }} onPick={c => setTimeout(() => openCity(c, posts.find(p => p.city === c)?.id), 50)} onExplore={() => { leaveGlobe(); fly(home.lat, home.lon, 3) }} onNear={() => { leaveGlobe(); fly(home.lat, home.lon, 10) }} onOpen={onOpen} />}
    {!huella && <div className="pl-bar"><div className="pl-search glass pl-search-top"><Search size={15} /><input id="planet-search" placeholder="¿Qué deseas descubrir hoy?" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />{q && <button onClick={() => setQ('')} aria-label="Borrar"><X size={14} /></button>}
      {placeHits.places.length > 0 && <div className="place-list map-places"><div className="place-h">Ir a un lugar</div>{placeHits.places.map((pl, i) => <button key={i} className="place-item" onClick={() => { setQ(''); goPlace(+pl.lat, +pl.lon, 11) }}><MapPin size={13} /><span><b>{pl.city}</b><small>{pl.name}</small></span></button>)}</div>}</div>
    <div className="reg-menu"><button className="glass reg-btn" onClick={() => setRegOpen(o => !o)} aria-expanded={regOpen}><Globe2 size={14} /> Regiones <ChevronDown size={13} /></button>
      {regOpen && <div className="reg-list glass">{regions.map(([n, lon, lat, z]) => <button key={n} onClick={() => { setRegOpen(false); setSel(null); fly(lat, lon, z) }}>{n}</button>)}</div>}</div>
    {!globe && <div className="map-brand"><Brand /></div>}
    {!mobile && <div className="dk-stories"><Stories posts={feedP} onStory={onStory} /></div>}</div>}

    {dkClosed && !mobile ? null : mode === 'panel' ? <aside className="pl-panel glass panelx">{side}</aside>
    : huella ? <aside className="pl-panel glass huella">
      <div className="pl-ph">
        <div className="row" style={{ gap: 12 }}><Avatar name={user?.name || 'Tú'} hue={user?.hue} size={52} src={user?.avatar} /><div className="grow"><div className="pl-place" style={{ margin: 0 }}>{user?.name}</div><div className="meta">{user?.city} · @{user?.handle}</div>{user?.bio && <div className="meta" style={{ display: 'block' }}>{user.bio}</div>}</div><button className="btn ghost sm" onClick={onEditProfile}><Pencil size={13} /> Editar</button></div>
        <div className="fp-stats"><div><b>{new Set(mine.map(p => cityInfo(p.city).country)).size}</b><span>países</span></div><div><b>{new Set(mine.map(p => p.city)).size}</b><span>ciudades</span></div><div><b>{mine.length}</b><span>publicaciones</span></div></div>
        <div className="cap-s" style={{ marginTop: 12 }}>Tu huella</div>
        <p className="meta" style={{ display: 'block', lineHeight: 1.5, margin: '4px 0 12px' }}>La línea dorada une, en orden, los lugares donde has publicado. Tu perfil es tu mapa.</p>
        {user && <div className="acc-row"><button className="btn ghost sm" onClick={onAccount}><KeyRound size={14} /> Mi cuenta</button><button className="btn ghost sm" onClick={onLogout}><LogOut size={14} /> Cerrar sesión</button></div>}
      </div>
      <div className="pl-list">{mine.length ? mine.map((p, i) => <button key={p.id} className="pl-item" onClick={() => { const g = where(p); goPlace(g.lat, g.lon, 10) }}>
        <span className="fp-n">{i + 1}</span><span className="pl-thumb"><Media small post={p} h={50} radius={6} /></span>
        <span className="pl-it"><span className="pl-it-t">{p.title}</span><span className="meta"><MapPin size={11} /> {p.city}{p.country && !String(p.city).includes(p.country) ? ', ' + p.country : ''} · {ago(p.at)}</span></span></button>)
        : <div className="empty" style={{ margin: 12 }}>Aún no tienes huella. Pulsa + y suelta tu primera publicación en el mapa.</div>}</div>
    </aside>
    : wall ? <aside className="pl-panel glass wall open">
      <div className="wall-bar">
        <select id="wall-scope" value={scope} onChange={e => setScope(e.target.value)} aria-label="Dónde">
          <option value="vista">{t(site, 'inThisView') + ' · ' + place}</option><option value="mundo">Todo el mundo</option></select>
        <select id="wall-cat" value={cat} onChange={e => setCat(e.target.value)} aria-label="Qué">{cats.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        {live > 0 && <span className="wall-live" title={live + ' en directo'}><i className="dot" />{live}</span>}
      </div>
      {mobile && <Stories posts={feedP} onStory={onStory} />}
      <div className="pl-list wall-list">{visible.length ? visible.map(p => <div key={p.id} className="wall-item" onMouseEnter={() => setActive(p.id)}>{card(p)}<button className="wall-loc" onClick={() => { const g = where(p); setSel(p.city); goPlace(g.lat, g.lon, 9) }}><MapPin size={12} /> Ver {p.city} en el mapa</button></div>)
        : <div className="empty" style={{ margin: 12 }}>No hay publicaciones en esta zona. Aleja el mapa o elige «Todo el mundo».</div>}
        {hasMore && <button className="btn ghost block" onClick={onMore}>Cargar más publicaciones</button>}</div>
    </aside>
    : <aside className={'pl-panel glass' + (sheet ? ' open' : '')} data-st={listSt}>
      <div className="pl-grabrow"><button className="pl-grab" onClick={() => setSheet(o => !o)} aria-label={sheet ? 'Bajar panel' : 'Subir panel'}><i /></button>
        <div className="pl-st">{listSt !== 'mini' && <button type="button" onClick={() => setListSt(s => s === 'full' ? 'half' : 'mini')} aria-label="Bajar la lista" title="Bajar"><ChevronDown size={20} /></button>}{listSt !== 'full' && <button type="button" onClick={() => setListSt(s => s === 'mini' ? 'half' : 'full')} aria-label="Subir la lista" title="Subir"><ChevronUp size={20} /></button>}</div></div>
      <div className="wall-bar">
        <span className="wall-where grow" onClick={() => setSheet(o => !o)}><b>{place}</b><span className="meta">{visible.length} {visible.length === 1 ? 'publicación' : 'publicaciones'}</span></span>
        <select id="ex-cat" value={cat} onChange={e => setCat(e.target.value)} aria-label="Qué">{cats.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        {live > 0 && <span className="wall-live" title={live + ' en directo'}><i className="dot" />{live}</span>}
      </div>
      <LiveWalksStrip walks={walksS.list} onOpen={openWalk} onStart={() => { if (!requireUser()) return; if (myWalk) return openWalk(myWalk.id); closePanels(); setStartWalk(true) }}>
        {liveS.daily?.on && <button className={'wk-feat' + (dailyView ? ' on' : '')} onClick={() => setDailyView(v => !v)}><CloudSun size={13} /> Cielo de hoy <i>{liveS.daily.count}</i>{dailyView && <X size={12} />}</button>}
        {liveS.cams.length > 0 && <button className="wk-feat" onClick={() => openCam(liveS.cams[Math.floor(Math.random() * liveS.cams.length)].id)}><Video size={13} /> Ventanas <i>{liveS.cams.length}</i></button>}
      </LiveWalksStrip>
      {dailyView && liveS.daily && <div className="daily-bar"><b><CloudSun size={14} /> {liveS.daily.title}</b><p>{liveS.daily.text} · {liveS.daily.count} {liveS.daily.count === 1 ? 'foto' : 'fotos'} hoy</p><div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={joinDaily}>Participar con mi foto</button><button className="btn ghost sm" onClick={() => setDailyView(false)}>Ver todas las publicaciones</button></div></div>}
      <div className="pl-list">{visible.length ? visible.map(p => <button key={p.id} className={'pl-item' + (active === p.id ? ' on' : '')} onClick={() => { openCity(p.city, p.id); setSheet(false) }}>
        <span className="pl-thumb"><Media small post={p} h={58} radius={6} /></span>
        <span className="pl-it"><TypeTag type={p.type} /><span className="pl-it-t">{p.title}</span><span className="meta"><MapPin size={11} /> {p.city}{p.country && !String(p.city).includes(p.country) ? ', ' + p.country : ''} · {ago(p.at)}</span></span>
      </button>) : <div className="empty" style={{ margin: 12 }}>{dailyView ? 'Todavía nadie ha subido su foto del reto en esta zona. ¡Sé el primero!' : <>No hay publicaciones en esta zona. Aleja el mapa o cambia los filtros.</>}</div>}</div>
    </aside>}

    {street && <Suspense fallback={<div className="map25" style={{ display: 'grid', placeItems: 'center', color: '#8a94a0', fontSize: 13 }}>Cargando vista 3D…</div>}><Map25D vector={vecOn} sat={!!siteSel} site={siteSel ? (sitesAll || []).find(x => x.id === siteSel) : null} center={street} zoom={street.zoom} points={points} places={places} cams={liveS.cams} stations={radioStations} walks={walksS.list} onSelect={onPin} onPlacePick={pickBiz} onCamPick={openCam} onWalkPick={openWalk} onBounds={setBounds} onExit={leaveStreet} onFlat={() => { flatRef.current = true; try { localStorage.setItem('flat', '1') } catch {} }} /></Suspense>}
    {panels}

    {pinMode && <div className="pin-hint glass"><MapPin size={15} style={{ flex: 'none' }} /> <span className="grow"><b>{t(site, 'pinHint')}</b></span> <button className="link" onClick={() => { setPinMode(false); setChallenge(false) }}>Cancelar</button></div>}
    {drop && <PinComposer user={user} videoMax={videoMax} drop={drop} challenge={challenge ? liveS.daily : null} onCancel={() => { setDrop(null); setChallenge(false) }} onDone={p => { setDrop(null); onPublished(p); if (challenge) { setChallenge(false); setDailyView(true) } openCity(p.city, p.id) }} />}

    {!pinMode && !drop && <div className="pin-tip glass">{t(site, 'pinTip')}</div>}
  </div>
}

function ShareBar({ post, flash }) {
  const url = location.origin + '/p/' + post.id, text = post.title + ' · ' + post.city
  const card = () => dispatchEvent(new CustomEvent('planeta:sharecard', { detail: post }))
  const native = async () => { try { await navigator.share({ title: text, text: post.text || text, url }) } catch {} }
  const copy = async () => { try { await navigator.clipboard.writeText(url); flash('Enlace copiado') } catch { flash(url) } }
  const enc = encodeURIComponent, u = enc(url), tx = enc(text)
  const L = [['whatsapp', 'WhatsApp', 'https://wa.me/?text=' + enc(text + ' ' + url)], ['facebook', 'Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + u], ['x', 'X', 'https://twitter.com/intent/tweet?text=' + tx + '&url=' + u], ['telegram', 'Telegram', 'https://t.me/share/url?url=' + u + '&text=' + tx]]
  return <div className="share-bar share-ic"><span className="lbl" style={{ margin: 0 }}>Compartir</span>
    {L.map(([ic, name, href]) => <a key={ic} className="sh-i" href={href} target="_blank" rel="noopener noreferrer" aria-label={'Compartir en ' + name} title={name}><FlatIcon name={ic} size={18} /><span className="sh-t">{name}</span></a>)}
    {navigator.share && <button className="sh-i" onClick={native} aria-label="Instagram y más" title="Instagram y más"><FlatIcon name="instagram" size={18} /><span className="sh-t">Instagram y más</span></button>}
    <button className="sh-i" onClick={copy} aria-label="Copiar enlace" title="Copiar enlace"><FlatIcon name="link" size={18} /><span className="sh-t">Copiar enlace</span></button>
    {post.match && <button className="sh-i sh-card" onClick={card} aria-label="Tarjeta para redes" title="Tarjeta para redes"><FlatIcon name="tarjeta" size={18} /><span className="sh-t">Tarjeta para redes</span></button>}
  </div>
}


// Tarjeta del partido para compartir (la imagen con tu marca). La abre cualquier botón de compartir de un partido.
// Computador: vista previa para descargar o copiar. Celular: menú de compartir con la imagen adjunta.
function ShareCardHost({ flash }) {
  const site = useSite(), [pv, setPv] = useState(null), busy = useRef(false)
  useEffect(() => {
    const f = async e => {
      const post = e.detail; if (!post?.match || busy.current) return
      busy.current = true
      const url = location.origin + '/p/' + post.id, text = post.title + ' · ' + post.city
      const args = { m: post.match, city: post.city, link: location.host.replace(/^www\./, '') + '/p/' + post.id, site: { name: site.name, logoDark: safeUrl(site.logoDark), logoLight: safeUrl(site.logoLight) } }
      try {
        if (typeof matchMedia === 'function' && matchMedia('(min-width: 1024px) and (pointer: fine)').matches) { const blob = await matchCardBlob(args); setPv({ blob, url: URL.createObjectURL(blob) }) }   // en computador el menú de Windows no sirve para WhatsApp/Facebook: se muestra la tarjeta para descargarla o copiarla
        else { const r = await shareMatchCard(args, { url, text }); if (r === 'download') flash('Tarjeta descargada: súbela a tus redes') }
      } catch (x) { flash(x.message || 'No se pudo crear la tarjeta.') } finally { busy.current = false }
    }
    addEventListener('planeta:sharecard', f); return () => removeEventListener('planeta:sharecard', f)
  }, [site, flash])
  const closePv = () => { if (pv) URL.revokeObjectURL(pv.url); setPv(null) }
  const dl = () => { const a = document.createElement('a'); a.href = pv.url; a.download = 'partido-worbita.jpg'; document.body.appendChild(a); a.click(); a.remove() }
  const copyImg = async () => { try { const bmp = await createImageBitmap(pv.blob), cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0); const png = await new Promise(ok => cv.toBlob(ok, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); flash('Imagen copiada: pégala con Ctrl+V en WhatsApp o Facebook') } catch { flash('Tu navegador no deja copiar la imagen: usa Descargar') } }
  if (!pv) return null
  return <div className="sheet-bg" style={{ zIndex: 1300, background: '#000c', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={closePv}><div className="share-pv" onClick={e => e.stopPropagation()}><img src={pv.url} alt="Tarjeta del partido" /><div className="share-pv-b"><button className="btn" onClick={dl}>Descargar</button><button className="btn ghost" onClick={copyImg}>Copiar imagen</button><button className="btn ghost" onClick={closePv}>Cerrar</button></div><p className="meta">Sube la imagen a tu publicación de WhatsApp o Facebook.</p></div></div>
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
// Ficha de un lugar del mundo: foto y resumen de Wikipedia (se piden al abrirla y quedan guardados en el servidor)
function SitePanel({ id, onClose }) {
  const [d, setD] = useState(null), [err, setErr] = useState('')
  useEffect(() => { setD(null); setErr(''); fetch('/api/sites/' + id).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j) }).catch(e => setErr(e.message)) }, [id])
  if (!d) return <aside className="city glass"><div className="empty" style={{ margin: 14 }}>{err || 'Cargando…'}</div></aside>
  return <aside className="city glass biz-panel site-panel">
    <button className="pl-back" onClick={onClose}><ChevronLeft size={14} /> Volver</button>
    {d.image ? <div className="biz-cover" style={{ backgroundImage: `url(${d.image})` }} role="img" aria-label={d.name} /> : <div className={'site-cover-ph c-' + d.cat} dangerouslySetInnerHTML={{ __html: siteSvg(d.cat, 56) }} />}
    <div className="biz-head site-head"><button className="pl-f-x" onClick={onClose} aria-label="Cerrar"><X size={15} /></button>
      <span className={'site-tag c-' + d.cat}><i dangerouslySetInnerHTML={{ __html: siteSvg(d.cat, 14) }} />{d.catLabel}</span>
      <div className="city-n">{d.name}</div>
      <div className="city-m">{d.country}</div>
      {d.about && <p className="biz-about">{d.about}</p>}
      {d.url && <div className="city-m site-src">Fuente: <a href={d.url} target="_blank" rel="noopener noreferrer">Wikipedia</a></div>}
    </div>
    <div className="biz-actions"><a className="btn sm" href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lon}`} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Cómo llegar</a></div>
  </aside>
}

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
      {pl.about && <p className="biz-about">{pl.about}</p>}
      {pl.hours && <div className="city-m"><Clock size={11} /> {pl.hours}</div>}
    </div>
    <div className="biz-actions">
      <a className="btn sm" href={`https://www.google.com/maps/dir/?api=1&destination=${pl.lat},${pl.lon}`} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Cómo llegar</a>
      {wa && <a className="btn ghost sm wa" href={'https://wa.me/' + wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
      {pl.website && /^https?:\/\//i.test(pl.website) && <a className="btn ghost sm" href={pl.website} target="_blank" rel="noopener noreferrer"><Globe2 size={14} /> Sitio web</a>}
      {!pl.mine && <button className="btn ghost sm" onClick={() => onChat(pl.id)}><MessagesSquare size={14} /> Mensaje</button>}
    </div>
    <div className="city-body">
      <div className="lbl" style={{ margin: '10px 14px 6px' }}>Lo que publica</div>
      {d.posts.length ? d.posts.map(p => <button key={p.id} className="pl-item" onClick={() => onOpen(p.id)}><span className="pl-thumb"><Media small post={p} h={58} radius={6} /></span><span className="pl-it">{p.expires_at && <span className="tag exp"><IconClock /> {leftTxt(p.expires_at)}</span>}<span className="pl-it-t">{p.title}</span><span className="meta">{ago(p.at)}</span></span></button>)
        : <div className="empty" style={{ margin: 12 }}>{pl.mine ? 'Publica tu primera oferta o evento con el botón +.' : 'Este negocio aún no ha publicado.'}</div>}
    </div>
  </aside>
}
const leftTxt = t => { const m = Math.round((t - Date.now()) / 60000); return m <= 0 ? 'Vencida' : m < 60 ? `Quedan ${m} min` : m < 1440 ? `Quedan ${Math.round(m / 60)} h` : `Hasta el ${new Date(t).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}` }

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
  const allStations = useRadio(s => s.stations), nowPlaying = useRadio(s => s.playing ? s.cur?.id : null), cityStations = allStations.filter(st => st.city && st.city.toLowerCase() === String(city).toLowerCase())
  const planes = posts.filter(p => p.cat === 'planes' || p.cat === 'eventos')
  useEffect(() => { setTab('ahora') }, [city])
  useEffect(() => { const f = () => api.room(city).then(setRoom).catch(() => {}); f(); const g = e => { if (e.detail.city === city) f() }; addEventListener('planeta:room', g); const t = setInterval(f, 30000); return () => { clearInterval(t); removeEventListener('planeta:room', g) } }, [city])
  return <aside className="city glass">
    <div className={'city-head' + (headMatch ? ' has-match' : '')}>{cover ? <Media post={cover} h={128} radius={0} /> : headMatch && <div className="city-head-match" onClick={() => onOpen(headMatch.id)}><Media post={headMatch} h={210} radius={0} /></div>}<div className="city-shade" />
      <button className="pl-f-x" onClick={onClose} aria-label="Cerrar ciudad"><X size={15} /></button>
      <button className={'city-follow' + (follow?.isFollowing('city', city) ? ' on' : '')} onClick={() => follow?.toggleFollow('city', city)}><Bell size={13} /> {follow?.isFollowing('city', city) ? 'Siguiendo' : 'Seguir ciudad'}</button>
      <div className="city-t"><div className="cap-s" style={{ color: '#fff' }}>Ciudad</div><div className="city-n">{city}</div><div className="city-m">{g.country} · {localTime(city)} · {posts.length} {posts.length === 1 ? 'publicación' : 'publicaciones'}{room?.people ? ' · ' + room.people + ' en la sala hoy' : ''}</div></div></div>
    <CityPulse city={city} onOpen={onOpen} />
    {cityStations.length > 0 && <div className="city-radio"><RadioMenu value={nowPlaying} label="Escuchar radio" onChange={id => { const st = cityStations.find(x => x.id === id); if (st) playRadio(st) }} groups={[{ items: cityStations.map(st => ({ v: st.id, t: st.name, st })) }]} /></div>}
    <select className="dd city-dd" value={tab} onChange={e => setTab(e.target.value)} aria-label="Sección">{[['ahora', 'Ahora'], ['historias', 'Historias'], ['sala', 'Sala'], ['personas', 'Personas'], ['planes', 'Planes']].map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
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
  useEffect(() => { if (challenge) { setTitle(t => t || 'Mi cielo hoy'); if (CATEGORIES.some(c => c.id === 'cotidiano')) setCat('cotidiano') } }, [challenge?.key]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
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

// cuentas creadas antes de pedir la edad: la escriben una sola vez (queda guardada en el servidor y no se cambia)
function BirthBox({ onUser }) {
  const [v, setV] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); setErr(''); try { const r = await fetch('/api/me/birth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birth: v }) }), d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'No se pudo guardar.'); onUser?.(d.user) } catch (x) { setErr(x.message) } finally { setBusy(false) } }
  return <div className="here-box"><div className="here-row"><span><b>Mostrarme en el mapa</b><small>Para activarlo escribe tu fecha de nacimiento (solo se muestra a mayores de 18). Se guarda una sola vez.</small></span></div>
    <div className="here-row"><input className="field" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={v} onChange={e => setV(e.target.value)} aria-label="Fecha de nacimiento" /><button className="btn sm" disabled={!v || busy} onClick={save}>Guardar</button></div>
    {err && <p className="meta" style={{ display: 'block', color: '#ff8a8d' }}>{err}</p>}</div>
}
function ComunidadScreen({ here, onUser, follow, posts, user, card, onAuth, onLogout, onOpen, onChat, onEditProfile }) {
  const site = useSite()
  const [view, setView] = useState('personas')
  const [people, setPeople] = useState(null), [activity, setActivity] = useState(null)
  useEffect(() => { api.people().then(d => setPeople(d.people)).catch(() => setPeople([])); api.activity().then(d => setActivity(d.activity)).catch(() => setActivity([])) }, [posts.length])
  const mine = posts.filter(p => p.mine), savedPosts = posts.filter(p => p.saved)
  return <>
    <Header title={t(site, 'communityTitle')} sub={t(site, 'communitySub')} />
    {user ? <><div className="profile"><Avatar name={user.name} hue={user.hue} size={44} src={user.avatar} /><div className="grow"><div className="name lg">{user.name}</div><div className="meta">@{user.handle} · {user.city}</div>{user.bio && <div className="meta" style={{ display: 'block', marginTop: 2 }}>{user.bio}</div>}<button className="link" style={{ marginTop: 4 }} onClick={onEditProfile}><Pencil size={12} /> Editar perfil</button></div>
      <div className="stats"><div><b>{mine.length}</b><span>Publicaciones</span></div><div><b>{savedPosts.length}</b><span>Guardadas</span></div></div></div>
    {user && here && here.allowed && user.adult === null && <BirthBox onUser={onUser} />}
    {user && here && user.adult === false && <div className="here-box"><p className="meta" style={{ display: 'block' }}>Mostrarte en el mapa está disponible solo para mayores de 18 años.</p></div>}
    {user && here && here.allowed && user.adult === true && <div className="here-box"><label className="here-row"><span><b>Mostrarme en el mapa</b><small>{here.on ? 'Te ven donde estás mientras tengas la web abierta.' : 'Apagado. Nadie ve dónde estás.'}</small></span><input type="checkbox" role="switch" checked={here.on} onChange={e => here.toggle(e.target.checked)} aria-label="Mostrarme en el mapa" /></label>
      {here.on && <div className="here-row"><span><b>Precisión</b><small>{here.exact ? 'Se ve el punto exacto.' : 'Aproximada: a unos 1 km, no se ve tu calle.'}</small></span><select value={here.exact ? 'x' : 'a'} onChange={e => here.chooseExact(e.target.value === 'x')} aria-label="Precisión"><option value="a">Aproximada</option><option value="x">Exacta</option></select></div>}
      {here.msg && <p className="meta" style={{ display: 'block', color: '#ff8a8d' }}>{here.msg}</p>}</div>}</>
      : <div className="profile cta"><div className="grow"><div className="name lg">{t(site, 'joinTitle')}</div><div className="meta">{t(site, 'joinSub')}</div></div><button className="btn sm" onClick={() => onAuth('register')}>Crear cuenta</button><button className="btn ghost sm" onClick={() => onAuth('login')}>Entrar</button></div>}
    <Chips value={view} onChange={setView} items={[['personas', 'Personas'], ['actividad', 'Actividad'], ['sigues', 'Lo que sigues'], ['mias', 'Mis publicaciones'], ['guardadas', 'Guardadas']]} />
    {view === 'sigues' && <div className="follow-box"><p className="meta" style={{ display: 'block', marginBottom: 8 }}>Te avisamos cuando alguien publique en estos temas o ciudades.</p>
      <div className="lbl">Temas</div><RadioMenu value="" label={'Temas que sigues (' + CATEGORIES.filter(c => follow.isFollowing('cat', c.id)).length + ')'} onChange={v => follow.toggleFollow('cat', v)} groups={[{ items: CATEGORIES.map(c => ({ v: c.id, t: c.label + (follow.isFollowing('cat', c.id) ? ' · siguiendo (toca para dejar)' : '') })) }]} />
      <div className="lbl">Ciudades</div>{follow.follows.filter(f => f.kind === 'city').length ? <RadioMenu value="" label={'Ciudades que sigues (' + follow.follows.filter(f => f.kind === 'city').length + ')'} onChange={v => follow.toggleFollow('city', v)} groups={[{ items: follow.follows.filter(f => f.kind === 'city').map(f => ({ v: f.value, t: f.value + ' · dejar de seguir' })) }]} /> : <p className="muted small">Abre una ciudad en el mapa y pulsa «Seguir ciudad».</p>}</div>}
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
  if (mode === 'forgot' || mode === 'reset') return <PasswordModal mode={mode} setMode={setMode} onClose={() => { if (location.hash.startsWith('#reset=')) history.replaceState(null, '', location.pathname); onClose() }} onDone={onDone} />
  return <AuthForm mode={mode} setMode={setMode} onClose={onClose} onDone={onDone} />
}
// «¿Olvidaste tu contraseña?»: pedir el enlace por correo, y luego crear la contraseña nueva con ese enlace
function PasswordModal({ mode, setMode, onClose, onDone }) {
  const [email, setEmail] = useState(''), [p1, setP1] = useState(''), [p2, setP2] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState(false)
  const token = (location.hash.match(/^#reset=([a-f0-9]{64})$/) || [])[1]
  const ask = async e => { e.preventDefault(); setErr(''); setBusy(true); try { await api.forgot({ email }); setSent(true) } catch (x) { setErr(x.message) } setBusy(false) }
  const reset = async e => { e.preventDefault(); setErr('')
    if (p1.length < 8) return setErr('La contraseña debe tener al menos 8 caracteres.')
    if (p1 !== p2) return setErr('Las dos contraseñas no coinciden.')
    setBusy(true); try { const d = await api.resetPass({ token, password: p1 }); history.replaceState(null, '', location.pathname); onDone(d.user) } catch (x) { setErr(x.message) } setBusy(false) }
  return <div className="sheet-bg" onClick={onClose}><form className="auth" onClick={e => e.stopPropagation()} onSubmit={mode === 'reset' ? reset : ask}>
    <Brand big />
    {mode === 'reset' ? <>
      <h2>Crea tu contraseña nueva</h2>
      {!token ? <div className="banner">Este enlace no es válido. Pide uno nuevo.</div> : <>
        <input className="field" type="password" placeholder="Contraseña nueva (mínimo 8)" value={p1} onChange={e => setP1(e.target.value)} autoComplete="new-password" aria-label="Contraseña nueva" />
        <input className="field" type="password" placeholder="Repite la contraseña" value={p2} onChange={e => setP2(e.target.value)} autoComplete="new-password" aria-label="Repite la contraseña" style={{ marginTop: 8 }} />
        {err && <div className="banner">{err}</div>}
        <button className="btn block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</button></>}
      <button type="button" className="link center" onClick={() => { history.replaceState(null, '', location.pathname); setMode('forgot') }}>Pedir un enlace nuevo</button>
    </> : <>
      <h2>¿Olvidaste tu contraseña?</h2>
      {sent ? <p className="muted">Si ese correo tiene una cuenta, te llegó un enlace para crear una contraseña nueva (vale 1 hora). Revisa también la carpeta de spam.</p> : <>
        <p className="muted">Escribe tu correo y te enviamos un enlace para crear una nueva.</p>
        <input className="field" type="email" placeholder="Tu correo" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" aria-label="Tu correo" />
        {err && <div className="banner">{err}</div>}
        <button className="btn block" disabled={busy}>{busy ? 'Enviando…' : 'Enviarme el enlace'}</button></>}
      <button type="button" className="link center" onClick={() => setMode('login')}>Volver a entrar</button>
    </>}
  </form></div>
}
function AuthForm({ mode, setMode, onClose, onDone }) {
  const site = useSite()
  const reg = mode === 'register'
  const [f, setF] = useState({ name: '', handle: '', password: '', city: '', birth: '' }); const [place, setPlace] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  // Entrar con Google (botón oficial de Google): si la cuenta ya existe entra; si es nueva se pide la fecha de nacimiento (regla de edad)
  const gid = site.googleClientId, gref = useRef(null), [gc, setGc] = useState(null)
  useEffect(() => {
    if (!gid) return; let dead = false
    const init = () => { if (dead || !window.google?.accounts?.id || !gref.current) return; window.google.accounts.id.initialize({ client_id: gid, callback: async r => { setBusy(true); setErr(''); try { const d = await api.google({ credential: r.credential }); if (d.needBirth) setGc(r.credential); else onDone(d.user) } catch (x) { setErr(x.message) } setBusy(false) } }); gref.current.innerHTML = ''; window.google.accounts.id.renderButton(gref.current, { theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', width: 338, locale: 'es' }) }
    if (window.google?.accounts?.id) init(); else { let s = document.getElementById('gsi'); if (!s) { s = document.createElement('script'); s.id = 'gsi'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; document.head.appendChild(s) } s.addEventListener('load', init); return () => { dead = true; s.removeEventListener('load', init) } }
    return () => { dead = true }
  }, [gid]) // eslint-disable-line react-hooks/exhaustive-deps
  const gGo = async () => { setBusy(true); setErr(''); try { const d = await api.google({ credential: gc, birth: f.birth }); onDone(d.user) } catch (x) { setErr(x.message) } setBusy(false) }
  const submit = async e => { e.preventDefault(); setBusy(true); setErr(''); try { const d = reg ? await api.register({ ...f, email: f.handle, city: place?.city || 'Bogotá', country: place?.country, lat: place?.lat, lon: place?.lon }) : await api.login(f); onDone(d.user) } catch (x) { setErr(x.message) } finally { setBusy(false) } }
  return <div className="sheet-bg" onClick={onClose}><form className="auth" onClick={e => e.stopPropagation()} onSubmit={submit}>
    <Brand big />
    <h2>{reg ? t(site, 'createAccount') : t(site, 'welcomeBack')}</h2>
    <p className="muted">{reg ? t(site, 'authSub') : t(site, 'joinSub')}</p>
    {reg && <input id="auth-name" className="field" placeholder="Tu nombre" value={f.name} onChange={set('name')} autoComplete="name" />}
    <input id="auth-handle" className="field" type={reg ? 'email' : 'text'} placeholder={reg ? 'Tu correo' : 'Correo o usuario'} value={f.handle} onChange={set('handle')} autoComplete={reg ? 'email' : 'username'} autoCapitalize="none" />
    <input id="auth-pass" className="field" type="password" placeholder="Contraseña" value={f.password} onChange={set('password')} autoComplete={reg ? 'new-password' : 'current-password'} />
    {reg && <label className="adm-field" style={{ marginTop: 10 }}><span>Fecha de nacimiento</span><input id="auth-birth" className="field" type="date" required min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={f.birth} onChange={set('birth')} autoComplete="bday" /></label>}
    {reg && <div className="adm-field" style={{ marginTop: 10 }}><span>¿Dónde estás?</span><PlacePicker value={place} onChange={setPlace} id="auth-city" /></div>}
    {err && <div className="banner">{err}</div>}
    <button className="btn block" disabled={busy}>{busy ? 'Un momento…' : reg ? 'Crear cuenta' : 'Entrar'}</button>
    {gid && !gc && <div ref={gref} className="g-btn" style={{ display: 'flex', justifyContent: 'center', marginTop: 10, minHeight: 44 }} />}
    {gc && <div className="adm-field" style={{ marginTop: 10 }}><span>Para terminar, tu fecha de nacimiento</span><input className="field" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={f.birth} onChange={set('birth')} /><button type="button" className="btn block" style={{ marginTop: 8 }} disabled={busy || !f.birth} onClick={gGo}>{busy ? 'Un momento…' : 'Continuar con Google'}</button></div>}
    {reg && <p className="meta" style={{ display: 'block', textAlign: 'center', fontSize: 11.5 }}>Al crear tu cuenta aceptas los <a href="/terminos" target="_blank" rel="noopener">Términos</a> y la <a href="/privacidad" target="_blank" rel="noopener">Privacidad</a>.</p>}
    {!reg && <button type="button" className="link center" onClick={() => setMode('forgot')}>¿Olvidaste tu contraseña?</button>}
    <button type="button" className="link center" onClick={() => setMode(reg ? 'login' : 'register')}>{reg ? '¿Ya tienes cuenta? Entra' : '¿No tienes cuenta? Créala'}</button>
  </form></div>
}

function PostDetail({ id, user, onChat, onClose, onToggle, requireUser, flash, onDeleted, onChanged }) {
  const [post, setPost] = useState(null); const [t, setT] = useState(''); const [err, setErr] = useState('')
  const reload = () => api.post(id).then(d => { setPost(d.post); onChanged(d.post) }).catch(e => setErr(e.message))
  useEffect(() => { reload(); const f = e => { if (e.detail.id === id) reload() }; addEventListener('planeta:comment', f); return () => removeEventListener('planeta:comment', f) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const siteD = useSite()
  useEffect(() => { if (post?.match) prepararTarjetaEnlace(post, { name: siteD.name, logoDark: safeUrl(siteD.logoDark), logoLight: safeUrl(siteD.logoLight) }) }, [post?.id, post?.match?.st, post?.match?.gh, post?.match?.ga]) // eslint-disable-line react-hooks/exhaustive-deps
  const tog = async what => { const p = await onToggle(id, what); if (p) setPost(x => ({ ...x, ...p })) }
  const send = async e => { e.preventDefault(); if (!requireUser() || !t.trim()) return; try { await api.comment(id, t.trim()); setT(''); reload() } catch (x) { flash(x.message) } }
  const del = async () => { try { await api.remove(id); onDeleted(id) } catch (x) { flash(x.message) } }
  // ampliar: la misma ventana de la publicación pasa a una ventana emergente centrada y más grande (computador); tocar la foto o el botón la amplía / la achica
  const [big, setBig] = useState(false)
  useEffect(() => { if (!big) return; const k = e => { if (e.key === 'Escape') { e.stopPropagation(); setBig(false) } }; addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true) }, [big])
  const report = async () => { if (!requireUser()) return; try { await api.report(id, 'Contenido inapropiado'); flash('Gracias. Revisaremos esta publicación.') } catch (x) { flash(x.message) } }
  return <div className={'sheet-bg post-bg' + (big ? ' big' : '')} onClick={() => big ? setBig(false) : onClose()}><div className="sheet" onClick={e => e.stopPropagation()}>
    <header className="pub-head"><button className="icon" onClick={onClose} aria-label="Volver"><ChevronLeft size={20} /></button><span>{post ? catLabel(post.cat) : ''}</span>
      <button className="icon big-btn" onClick={() => setBig(b => !b)} aria-label={big ? 'Achicar la publicación' : 'Ampliar la publicación'} title={big ? 'Achicar' : 'Ampliar'}><Maximize2 size={17} /></button>
      {post?.mine ? <button className="icon" onClick={del} aria-label="Eliminar" title="Eliminar"><Trash2 size={18} /></button> : <button className="icon" onClick={report} aria-label="Reportar" title="Reportar"><Flag size={18} /></button>}</header>
    {!post ? <Empty text={err || 'Cargando…'} /> : <>
      <div className="zoomable" onClick={e => { if (matchMedia('(min-width:1024px)').matches && !e.target.closest('video,button,a,input')) setBig(b => !b) }}><Media post={post} h={300} radius={20} play controls /></div>
      <div className="row-between"><TypeTag type={post.type} /><span className="meta">{ago(post.at)}</span></div>
      <h2 className="detail-t">{post.title}</h2>{post.text && <p className="detail-p"><Translatable text={post.cat === 'eventos' ? post.text.replace(/\n*Sitio web: https:\/\/\S+/, '') : post.text} /></p>}
      {post.cat === 'eventos' && post.lat != null && <div className="biz-actions"><a className="btn sm" href={`https://www.google.com/maps/dir/?api=1&destination=${post.lat},${post.lon}`} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Cómo llegar</a>{(() => { const u = /Sitio web: (https:\/\/\S+)/.exec(post.text || '')?.[1]; return u ? <a className="btn sm ghost" href={u} target="_blank" rel="noopener noreferrer nofollow">Sitio web del evento</a> : null })()}</div>}
      <div className="author"><Avatar name={post.author} hue={post.hue} size={42} src={post.avatar} /><div className="grow"><div className="name">{post.author}{post.author_verified && <BadgeCheck size={14} className="verified" />}</div><div className="meta"><MapPin size={12} /> {post.city}{(post.country || cityInfo(post.city).country) ? ', ' + (post.country || cityInfo(post.city).country) : ''}</div></div>{!post.mine && !post.author_example && <button className="btn ghost sm au-msg" onClick={() => onChat(post.author_id)} aria-label="Enviar mensaje" title="Enviar mensaje"><FlatIcon name="mensaje" size={17} /><span className="sh-t">Mensaje</span></button>}</div>
      <div className="post-actions"><button className={'act' + (post.liked ? ' on' : '')} onClick={() => tog('like')}><Heart size={18} fill={post.liked ? 'currentColor' : 'none'} /><span>{fmt(post.likes)}</span></button>
        <span className="act"><MessageCircle size={18} /><span>{post.comments.length}</span></span>
        {post.cat === 'planes' && (() => { const full = post.capacity && post.joined >= post.capacity && !post.joined_me; return <button className={'btn sm' + (post.joined_me || full ? ' ghost' : '')} disabled={full} onClick={() => tog('join')}>{full ? 'Cupo lleno' : post.joined_me ? <>Te uniste <IconCheck /></> : 'Me uno'} · {post.joined}{post.capacity ? '/' + post.capacity : ''}</button> })()}
        <button className={'act end' + (post.saved ? ' on' : '')} onClick={() => tog('save')}><Bookmark size={18} fill={post.saved ? 'currentColor' : 'none'} /></button></div>
      {post.cat === 'planes' && post.attendees?.length > 0 && <><div className="lbl">Van {post.attendees.length}{post.capacity ? ' de ' + post.capacity : ''}</div><div className="attendees">{post.attendees.map(a => <span key={a.id} title={a.name}><Avatar name={a.name} hue={a.hue} size={30} src={a.avatar} /></span>)}</div></>}
      {post.mine && post.cat === 'eventos' && <button className="btn sm block" onClick={() => openSell('evento')} style={{ margin: '6px 0' }}><Megaphone size={14} /> {+post.promo_until > Date.now() ? 'Evento promocionado hasta el ' + new Date(post.promo_until).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }) + ' · extender' : 'Promocionar este evento'}</button>}
      <ShareBar post={post} flash={flash} />
      <div className="lbl">Comentarios</div>
      {post.comments.length === 0 && <p className="muted small">Sé el primero en comentar.</p>}
      {post.comments.map(c => <div key={c.id} className="comment"><Avatar name={c.author} size={30} hue={c.hue} src={c.avatar} /><div><b>{c.author}</b> <span className="meta" style={{ display: 'inline' }}>{ago(c.at)}</span><p><Translatable text={c.text} /></p></div></div>)}
      <form className="comment-box" onSubmit={send}><input id="comment-input" placeholder={user ? 'Escribe un comentario…' : 'Inicia sesión para comentar'} value={t} onChange={e => setT(e.target.value)} maxLength={1000} /><button className="icon accent" aria-label="Enviar"><Send size={17} /></button></form>
    </>}
  </div></div>
}

const NAV = [['planeta', Globe, 'Mapa'], ['ahora', Newspaper, 'Ahora'], ['cerca', Compass, 'Explorar cerca'], ['mensajes', MessagesSquare, 'Mensajes'], ['comunidad', Users, 'Comunidad']]
function Sidebar({ bizOpen, onBiz, sitesOpen, onSites, tvOpen, onTv, eventsOpen, onEvents, onCloseWins, mobile, tab, setTab, goPublish, user, unread, onAuth, isStaff, onAdmin, notif, posts, onOpen }) {
  const site = useSite()
  // ventana del computador: menú ordenable y con nombres editables desde el panel (Diseño)
  const dm = mergeList(DMENU_DEFAULT, site.layout?.dmenu).filter(m => m.show && (m.id !== 'admin' || isStaff) && (m.id !== 'lugares' || site.sitesOn !== false) && (m.id !== 'eventos' || site.wdEventsOn !== false) && (m.id !== 'canales' || site.tvOn !== false))
  const act0 = { planeta: () => setTab('planeta'), ahora: () => setTab('ahora'), cerca: () => setTab('cerca'), mensajes: () => setTab('mensajes'), comunidad: () => setTab('comunidad'), huella: () => user ? setTab('huella') : onAuth(), negocios: onBiz, lugares: onSites, canales: onTv, eventos: onEvents, planes: () => openSell('planes'), admin: onAdmin }
  // cualquier otro botón del menú cierra las ventanas «Negocios» y «Lugares» (ellas se abren y cierran entre sí)
  const act = Object.fromEntries(Object.entries(act0).map(([k, f]) => [k, k === 'negocios' || k === 'lugares' || k === 'canales' || k === 'eventos' ? () => { if (tab === 'huella') setTab('planeta'); f() } : () => { onCloseWins?.(); f() }]))   // desde «Tu huella» las ventanas vuelven al mapa normal (antes quedaba el mapa vacío)
  const stats = useMemo(() => { const day = Date.now() - 864e5, list = posts || []; return { hoy: list.filter(p => p.at > day).length, vivo: list.filter(p => p.type === 'directo').length, paises: new Set(list.map(p => p.country).filter(Boolean)).size, live: list.filter(p => p.type === 'directo').slice(0, 3) } }, [posts])
  return <aside className="side rail">
    <button className="rail-logo" onClick={() => { onCloseWins?.(); setTab('planeta') }} aria-label="Ver todo el mapa" title="Ver todo el mapa">{site.favicon ? <img src={safeUrl(site.favicon)} alt="" /> : <span className="logo" />}</button>
    {!mobile && <div className="dk-me dk-only">{user ? <button className="dk-who" onClick={() => setTab('huella')} aria-label={'Tu huella: ' + user.name}><Avatar name={user.name} hue={user.hue} size={44} src={user.avatar} /><span><b>{user.name}</b><small>@{user.handle}</small></span></button>
      : <button className="dk-who" onClick={onAuth}><span className="rail-in"><Users size={20} /></span><span><b>Entrar o crear cuenta</b><small>Publica y conversa</small></span></button>}</div>}
    {!mobile && <div className="dk-stats dk-only"><div><b>{stats.hoy}</b><span>hoy</span></div><div><b className="r">{stats.vivo}</b><span>en directo</span></div><div><b>{stats.paises}</b><span>países</span></div></div>}
    {!mobile && <nav className="dk-menu dk-only" aria-label="Menú">{dm.map(m => <button key={m.id} className={'dk-it' + ((m.id === 'negocios' ? bizOpen : m.id === 'lugares' ? sitesOpen : m.id === 'canales' ? tvOpen : m.id === 'eventos' ? eventsOpen : tab === m.id) ? ' on' : '')} onClick={act[m.id]}><FlatIcon name={m.id} size={17} /><span>{m.label}</span>{m.id === 'mensajes' && unread > 0 && <i className="dk-badge">{unread}</i>}</button>)}</nav>}
    {!mobile && stats.live.length > 0 && <div className="dk-live dk-only"><div className="dk-lh"><i />EN DIRECTO AHORA</div>{stats.live.map(p => <button key={p.id} onClick={() => onOpen(p.id)}><Media small post={p} h={34} radius={999} /><span><b className="dk-lt">{p.title}</b><small>{p.city}</small></span></button>)}</div>}
    <nav className="side-nav">{NAV.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-label={label} data-tip={label}><Icon size={20} strokeWidth={1.75} />{id === 'mensajes' && unread > 0 && <i className="badge">{unread}</i>}</button>)}
      <button className="rail-pub" onClick={goPublish} aria-label="Publicar" data-tip="Publicar"><Plus size={20} /></button>
      <button className="rail-plans" onClick={() => openSell('planes')} aria-label="Planes y precios" data-tip="Planes y precios"><Star size={20} strokeWidth={1.75} /></button>
      {isStaff && <button onClick={onAdmin} aria-label="Panel de administración" data-tip="Panel de administración"><ShieldCheck size={20} strokeWidth={1.75} /></button>}</nav>
    <div className="rail-notif">{notif}</div>
    {user ? <button className={'rail-me' + (tab === 'huella' ? ' on' : '')} onClick={() => setTab('huella')} aria-label={'Tu huella: ' + user.name} data-tip="Tu huella"><Avatar name={user.name} hue={user.hue} size={34} src={user.avatar} /></button>
      : <button className="rail-me" onClick={onAuth} aria-label="Entrar o crear cuenta" data-tip="Entrar o crear cuenta"><span className="rail-in"><Users size={18} /></span></button>}
    {!mobile && <button className="dk-pub dk-only" onClick={goPublish}><FlatIcon name="publicar" size={15} /> Publicar</button>}
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
  // las historias son de lugares con vida: sin sismos (no tienen foto)
  for (const p of posts) if (!seen.has(p.city) && p.handle !== 'alertas') { seen.add(p.city); items.push(p) }
  return <div className="stories">{items.slice(0, 14).map(p => <button key={p.city} className="story" onClick={() => onStory(p.city)} title={'Ver historias de ' + p.city}><div className={'story-ring' + (p.type === 'directo' ? ' live' : '')}><Media small post={p} h={62} radius={999} /></div><span>{p.city}</span></button>)}</div>
}

function StoryViewer({ city, posts, onClose, onOpen }) {
  const cities = [...new Set(posts.map(p => p.city))]
  const [c, setC] = useState(city), [i, setI] = useState(0), [paused, setPaused] = useState(false)
  const items = posts.filter(p => p.city === c)
  const cur = items[i]
  const next = () => { if (i < items.length - 1) setI(i + 1); else { const k = cities.indexOf(c); if (k < cities.length - 1) { setC(cities[k + 1]); setI(0) } else onClose() } }
  const prev = () => { if (i > 0) setI(i - 1); else { const k = cities.indexOf(c); if (k > 0) { setC(cities[k - 1]); setI(0) } } }
  useEffect(() => { if (paused) return; const t = setTimeout(next, 5000); return () => clearTimeout(t) }, [c, i, paused]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
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
  useEffect(() => { docks.forEach(d => { if (!names[d.id]) { const c = chats.find(x => x.id === d.id); if (c) setNames(n => ({ ...n, [d.id]: c })); else api.chat(d.id).then(r => { registerPlaces([r.user]); setNames(n => ({ ...n, [d.id]: r.user })) }).catch(() => {}) } }) }, [docks, chats]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  useEffect(() => { onCities?.(docks.map(d => names[d.id]?.city).filter(Boolean)) }, [docks, names]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
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
  useEffect(() => { setData(null); load().then(onChange); const f = e => { if (e.detail.from === id || e.detail.to === id) load().then(onChange) }; addEventListener('planeta:dm', f); const k = setInterval(load, 30000); return () => { clearInterval(k); removeEventListener('planeta:dm', f) } }, [id]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
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

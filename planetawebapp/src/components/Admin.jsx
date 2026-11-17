import { useEffect, useRef, useState } from 'react'
import { normalizeLayout, DESK_WINDOWS, SKIN_NUMS } from '../layout'
import { IconCheck } from './Flat'
import { Store, Activity, X, LayoutDashboard, Palette, Type, Image as ImageIcon, FileText, Users, Flag, MessagesSquare, Settings, KeyRound, Trash2, Check, Search, Upload, ShieldCheck, Ban, RotateCcw, Radio, Play, List as ListIcon, SearchCheck, Plus, UserCog, ArrowUp, ArrowDown, Video, Trophy, PartyPopper, Film, Tv, Box } from 'lucide-react'
import { uploadFile } from '../api'
import { useSite, t, TEXT_STYLE, applyTheme, PALETTE, effectiveColors } from '../site'
import { PlacePicker, BIZ } from './Extras'
import { play as playRadio, stop as stopRadio, loadStations } from '../radio'

async function req(method, url, body) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch {}
  if (!r.ok) throw new Error(d.error || 'Error del servidor.')
  return d
}
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d` }

const TEXT_LABELS = {
  joinTitle: 'Invitación a registrarse (título)', joinSub: 'Invitación a registrarse (texto)', welcomeBack: 'Título al iniciar sesión', createAccount: 'Título al crear cuenta', authSub: 'Texto bajo el título de registro',
  dropButton: 'Botón de publicar en el mapa', publishButton: 'Botón de publicar (formulario)', published: 'Aviso al publicar', pinHint: 'Aviso del modo publicar', pinTip: 'Consejo sobre el mapa',
  whatsHappening: 'Pregunta del formulario', inThisView: 'Título del panel del mapa', wall: 'Nombre del muro', liveNow: 'Título "En directo"', nearTitle: 'Título de Explorar cerca', messagesTitle: 'Título de Mensajes',
  communityTitle: 'Título de Comunidad', communitySub: 'Subtítulo de Comunidad', roomTitle: 'Título de la sala de ciudad', emptyRoom: 'Sala vacía', footer: 'Pie de página',
}

export default function Admin({ user, onClose, onSettings, flash }) {
  const site = useSite(), isAdmin = user.role === 'admin'
  const tabs = [['resumen', 'Resumen', LayoutDashboard], ...(isAdmin ? [['marca', 'Nombre y logos', ImageIcon], ['apariencia', 'Colores', Palette], ['textos', 'Textos', Type]] : []),
    ['publicaciones', 'Publicaciones', FileText], ...(isAdmin ? [['usuarios', 'Usuarios', Users], ['negocios', 'Negocios', Store]] : []), ['reportes', 'Reportes', Flag], ['salas', 'Salas de ciudad', MessagesSquare],
    ['cuenta', 'Mi cuenta', UserCog], ...(isAdmin ? [['emisoras', 'Emisoras', Radio], ['deportes', 'Partidos automáticos', Trophy], ['tv', 'Canales de TV', Tv], ['mapa3d', 'Mapa 3D (luz, alturas, estadios, relieve)', Box], ['extras', 'Más contenido (sismos, eventos)', Film], ['fiestas', 'Fiestas y festivos', PartyPopper], ['ventanas', 'Ventanas y reto', Video], ['tipografia', 'Tamaños y colores de texto', Type], ['contenido', 'Contenido', ListIcon], ['seo', 'SEO y redes', SearchCheck], ['diseno', 'Diseño: celular y computador', ListIcon], ['rendimiento', 'Rendimiento y errores', Activity], ['config', 'Configuración', Settings], ['integraciones', 'Pagos y Google', KeyRound]] : [])]
  const [tab, setTab] = useState('resumen')
  const [draft, setDraft] = useState(site)
  useEffect(() => { setDraft(site) }, [site])
  const save = async patch => { try { const st = await req('PUT', '/api/admin/settings', patch); onSettings(st); flash('Cambios guardados') } catch (e) { flash(e.message) } }

  return <div className="admin">
    <aside className="adm-nav">
      <div className="adm-title"><ShieldCheck size={18} /> Panel de {site.name}</div>
      <select className="adm-dd" value={tab} onChange={e => setTab(e.target.value)} aria-label="Sección del panel">{tabs.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      {tabs.map(([id, label, Icon]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon size={16} />{label}</button>)}
      <button className="adm-exit" onClick={onClose}><X size={16} /> Salir del panel</button>
    </aside>
    <main className="adm-main">
      {tab === 'resumen' && <Overview />}
      {tab === 'marca' && <BrandTab draft={draft} setDraft={setDraft} save={save} flash={flash} />}
      {tab === 'apariencia' && <ColorsTab draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'textos' && <TextsTab draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'publicaciones' && <PostsTab flash={flash} isAdmin={isAdmin} />}
      {tab === 'usuarios' && <UsersTab flash={flash} me={user} />}
      {tab === 'negocios' && <BizTab flash={flash} />}
      {tab === 'reportes' && <ReportsTab flash={flash} />}
      {tab === 'salas' && <RoomsTab flash={flash} />}
      {tab === 'emisoras' && <StationsTab flash={flash} />}
      {tab === 'deportes' && <SportsTab flash={flash} draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'mapa3d' && <Map3DTab flash={flash} draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'tv' && <TvTab flash={flash} draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'extras' && <ExtrasTab flash={flash} draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'fiestas' && <FestTab flash={flash} draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'ventanas' && <CamsTab flash={flash} draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'tipografia' && <TypeTab draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'contenido' && <ContentTab draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'seo' && <SeoTab draft={draft} setDraft={setDraft} save={save} flash={flash} />}
      {tab === 'cuenta' && <AccountTab flash={flash} />}
      {tab === 'diseno' && <DesignTab save={save} flash={flash} />}
      {tab === 'rendimiento' && <PerfTab flash={flash} isAdmin={isAdmin} />}
      {tab === 'config' && <ConfigTab draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'integraciones' && <IntegrationsTab flash={flash} />}
    </main>
  </div>
}

// Diseño del celular: arrastra para ordenar, muestra u oculta, renombra y elige medidas; la vista previa cambia en vivo.
// Al guardar, la web aplica esas elecciones con su propia lógica responsiva (funciona en cualquier pantalla).
function DesignTab({ save, flash }) {
  const site = useSite()
  const [lay, setLay] = useState(() => normalizeLayout(site.layout)), [dirty, setDirty] = useState(false), [drag, setDrag] = useState(null), [menuOpen, setMenuOpen] = useState(false), [busy, setBusy] = useState(false)
  const frame = useRef(null), deskFrame = useRef(null), deskBox = useRef(null), [scale, setScale] = useState(0.5), [deskOn, setDeskOn] = useState(false)
  const send = m => { for (const r of [frame, deskFrame]) { try { r.current?.contentWindow?.postMessage(m, location.origin) } catch { /* el marco aún no carga */ } } }
  useEffect(() => { send({ type: 'planeta:layout', layout: lay }) }, [lay])
  // la vista previa del computador mide 1366×768 y se reduce para caber en el panel
  useEffect(() => { const f = () => { const w = deskBox.current?.clientWidth; if (w) setScale(Math.min(1, w / 1366)) }; f(); addEventListener('resize', f); return () => removeEventListener('resize', f) }, [])
  // la vista previa del computador (otra copia completa de la web) solo se carga cuando llegas a verla: así el panel no gasta memoria de más
  useEffect(() => { const el = deskBox.current; if (!el || deskOn) return; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setDeskOn(true); io.disconnect() } }, { rootMargin: '200px' }); io.observe(el); return () => io.disconnect() }, [deskOn])
  // las ventanas que arrastras dentro de la vista previa llegan aquí
  useEffect(() => { const f = e => { if (e.origin !== location.origin || e.data?.type !== 'planeta:desk') return; setLay(l => ({ ...l, desk: e.data.desk || {} })); setDirty(true) }; addEventListener('message', f); return () => removeEventListener('message', f) }, [])
  const edit = f => { setLay(l => f(l)); setDirty(true) }
  const move = (k, i, j) => edit(l => { const a = [...l[k]]; if (j < 0 || j >= a.length || i === j) return l; const [x] = a.splice(i, 1); a.splice(j, 0, x); return { ...l, [k]: a } })
  const patch = (k, i, p) => edit(l => ({ ...l, [k]: l[k].map((x, n) => n === i ? { ...x, ...p } : x) }))
  const ui = (key, v) => edit(l => ({ ...l, ui: { ...l.ui, [key]: v } }))
  const dd = (key, v) => edit(l => ({ ...l, dd: { ...l.dd, [key]: v } }))
  const guardar = async () => { setBusy(true); try { if (lay.tabs.filter(t => t.show).length < 2) { flash('Deja al menos 2 pestañas visibles abajo.'); return } await save({ layout: lay }); setDirty(false) } finally { setBusy(false) } }
  const restablecer = async () => { if (!confirm('¿Volver al diseño original? Se pierden tus cambios de orden, nombres y medidas.')) return; setBusy(true); try { await save({ layout: {} }); setLay(normalizeLayout({})); setDirty(false) } finally { setBusy(false) } }
  const lista = (k, title, hint) => <div className="dz-list"><h3 className="adm-h3">{title}</h3><p className="meta" style={{ display: 'block', marginBottom: 8 }}>{hint}</p>
    {lay[k].map((x, i) => <div key={x.id} className={'dz-row' + (drag && drag.k === k && drag.i === i ? ' drag' : '')} draggable onDragStart={() => setDrag({ k, i })} onDragOver={e => e.preventDefault()} onDrop={() => { if (drag && drag.k === k) move(k, drag.i, i); setDrag(null) }} onDragEnd={() => setDrag(null)}>
      <span className="dz-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
      <input className="field dz-name" value={x.label} readOnly={k === 'home'} maxLength={24} onChange={e => patch(k, i, { label: e.target.value })} aria-label={'Nombre: ' + x.id} />
      <label className="dz-show"><input type="checkbox" checked={x.show} onChange={e => patch(k, i, { show: e.target.checked })} /> Mostrar</label>
      <button className="dz-mv up" onClick={() => move(k, i, i - 1)} disabled={i === 0} aria-label="Subir" /><button className="dz-mv down" onClick={() => move(k, i, i + 1)} disabled={i === lay[k].length - 1} aria-label="Bajar" />
    </div>)}</div>
  const skinN = (k, v) => edit(l => { const n = { ...l.skin.n }; if (v === null) delete n[k]; else n[k] = v; return { ...l, skin: { ...l.skin, n } } })
  const sel = (label, key, opts) => <label className="adm-field"><span>{label}</span><select className="field" value={lay.ui[key]} onChange={e => ui(key, e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  const desk = (
    <Section title="Diseño del computador" sub="Arrastra cada ventana a donde quieras y cambia su tamaño con la esquina. Los colores, los textos y su tamaño se cambian en «Aspecto». Nada cambia en tu web hasta que pulses Guardar diseño."
      actions={<div className="row"><button className="btn ghost" onClick={() => { edit(l => ({ ...l, desk: {} })) }}>Volver las ventanas a su lugar</button><button className="btn ghost" onClick={() => edit(l => ({ ...l, skin: { n: {}, c: {} } }))}>Volver márgenes y colores a los de fábrica</button><button className="btn" onClick={guardar} disabled={busy || !dirty}>{dirty ? 'Guardar diseño' : 'Guardado'}</button></div>}>
      <div className="dz-deskbox" ref={deskBox} style={{ height: 768 * scale }}>
        {deskOn && <iframe ref={deskFrame} className="dz-desk" src="/?preview=1&desk=1" title="Vista previa del computador" style={{ width: 1366, height: 768, transform: `scale(${scale})` }} onLoad={() => send({ type: 'planeta:layout', layout: lay })} />}
      </div>
      <p className="meta" style={{ display: 'block', margin: '8px 0 12px' }}>Los marcos verdes son las ventanas: arrastra el marco para moverla y la esquina de abajo a la derecha para cambiar su tamaño.</p>
      <div className="dz-grid">
        <label className="adm-field"><span>Ancho de la ventana de la derecha: <b>{lay.ui.panelW || 'según tu pantalla'}{lay.ui.panelW ? ' px' : ''}</b></span><input type="range" min="260" max="520" step="10" value={lay.ui.panelW || 340} onChange={e => ui('panelW', +e.target.value)} /></label>
      </div>
      <div className="dz-dwins">{DESK_WINDOWS.map(([id, label]) => <div key={id} className="dz-row"><span className="grow">{label}</span><button className="btn ghost sm" disabled={!lay.desk?.[id]} onClick={() => edit(l => { const d = { ...(l.desk || {}) }; delete d[id]; return { ...l, desk: d } })}>{lay.desk?.[id] ? 'Volver a su lugar' : 'En su lugar'}</button></div>)}</div>
      <h3 className="adm-h3">Apariencia del computador: márgenes, esquinas, líneas y transparencia</h3>
      <p className="meta" style={{ display: 'block', marginBottom: 8 }}>Mueve cada barra y mira el cambio arriba, en la vista previa. «Por defecto» deja el valor original.</p>
      <div className="dz-grid">{SKIN_NUMS.map(([k, label, lo, hi, unit, def]) => { const v = lay.skin.n[k]; return <div key={k} className="adm-field"><span>{label}: <b>{v === undefined ? 'por defecto' + (def ? ' (' + def + unit + ')' : '') : v + unit}</b></span>
        <div className="row" style={{ gap: 8 }}><input type="range" min={lo} max={hi} step="1" value={v ?? (def || lo)} onChange={e => skinN(k, +e.target.value)} style={{ flex: 1 }} /><button className="btn ghost sm" disabled={v === undefined} onClick={() => skinN(k, null)}>Por defecto</button></div></div> })}</div>
      <h3 className="adm-h3">Colores</h3>
      <p className="meta" style={{ display: 'block' }}>Los colores de las ventanas ahora se cambian en <b>Colores</b> (una sola paleta para toda la web).</p>
      {lista('dmenu', 'Menú de la ventana izquierda', 'Orden, nombres y qué opciones se muestran.')}
    </Section>
  )
  return <><Section title="Diseño del celular (menú, pestañas y medidas)" sub="Arrastra para ordenar, cambia nombres, oculta lo que no quieras y elige medidas. A la derecha ves el resultado en vivo; nada cambia en tu web hasta que pulses Guardar."
    actions={<div className="row"><button className="btn ghost" onClick={restablecer} disabled={busy}>Volver al diseño original</button><button className="btn" onClick={guardar} disabled={busy || !dirty}>{dirty ? 'Guardar diseño' : 'Guardado'}</button></div>}>
    <div className="dz">
      <div className="dz-left">
        {lista('menu', 'Menú de hamburguesa', 'Arrastra cada fila (o usa las flechas) para cambiar el orden.')}
        {lista('home', 'Secciones de la pantalla de inicio', 'Ordena y muestra u oculta los bloques del mundo redondo.')}
        {lista('tabs', 'Pestañas de abajo', 'Se muestran como máximo 5. Deja al menos 2 visibles.')}
        <h3 className="adm-h3">Medidas</h3>
        <div className="dz-grid">
          {sel('Tamaño del texto', 'fs', [['small', 'Pequeño'], ['normal', 'Normal'], ['large', 'Grande']])}
          {sel('Tamaño de los botones', 'btn', [['compact', 'Compactos'], ['normal', 'Normales'], ['large', 'Grandes']])}
          {sel('Espacio entre tarjetas', 'gap', [['compact', 'Poco'], ['normal', 'Normal'], ['wide', 'Mucho']])}
          {sel('Esquinas', 'radius', [['square', 'Cuadradas'], ['normal', 'Normales'], ['round', 'Muy redondas']])}
        </div>
        <label className="adm-field"><span>Ancho de la lista del mapa en computador: <b>{lay.ui.listW} px</b></span><input type="range" min="200" max="400" step="10" value={lay.ui.listW} onChange={e => ui('listW', +e.target.value)} /></label>
        <h3 className="adm-h3">Un solo desplegable en vez de varios botones (celular)</h3>
        <div className="dz-dd">{[['temas', 'Temas en «Ahora»'], ['ciudad', 'Secciones de la ciudad'], ['comunidad', 'Secciones de Comunidad'], ['panel', 'Menú de este panel']].map(([k, l]) => <label key={k} className="dz-show"><input type="checkbox" checked={lay.dd[k]} onChange={e => dd(k, e.target.checked)} /> {l}</label>)}</div>
      </div>
      <div className="dz-right">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b>Vista previa (celular)</b><button className="btn ghost sm" onClick={() => { send({ type: 'planeta:menu', open: !menuOpen }); setMenuOpen(o => !o) }}>{menuOpen ? 'Cerrar el menú' : 'Ver el menú abierto'}</button></div>
        <div className="dz-phone"><iframe ref={frame} src="/?preview=1" title="Vista previa del celular" onLoad={() => send({ type: 'planeta:layout', layout: lay })} /></div>
      </div>
    </div>
  </Section>{desk}</>
}


// Negocios: aparecen en el mapa solo si están activos (pagaron o los activas tú). Aquí los agregas, los activas y revisas cuentas con nombre de empresa.
const BIZ_EMPTY = { id: 0, name: '', type: 'otro', about: '', address: '', hours: '', whatsapp: '', website: '', place: null, avatar: '', cover: '', days: 30 }
function BizTab({ flash }) {
  const [d, setD] = useState(null), [form, setForm] = useState(null), [busy, setBusy] = useState('')
  const load = () => req('GET', '/api/admin/biz').then(setD).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const act = async (id, b) => { try { await req('POST', '/api/admin/users/' + id, b); load() } catch (e) { flash(e.message) } }
  const pick = k => async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(k); try { const url = await uploadFile(f, 'brand'); setForm(fm => ({ ...fm, [k]: url })) } catch (x) { flash(x.message) } finally { setBusy('') } }
  const save = async () => { setBusy('save'); try { const p = form.place; await req('POST', '/api/admin/biz' + (form.id ? '/' + form.id : ''), { name: form.name, type: form.type, about: form.about, address: form.address, hours: form.hours, whatsapp: form.whatsapp, website: form.website, avatar: form.avatar, cover: form.cover, lat: p?.lat, lon: p?.lon, city: p?.city, country: p?.country, ...(form.id ? {} : { days: +form.days }) }); flash(form.id ? 'Negocio guardado' : 'Negocio agregado'); setForm(null); load() } catch (e) { flash(e.message) } finally { setBusy('') } }
  const edit = b => setForm({ ...BIZ_EMPTY, id: b.id, name: b.biz_name || b.name, type: b.biz_type || 'otro', address: b.biz_address || '', hours: b.biz_hours || '', whatsapp: b.biz_whatsapp || '', website: b.biz_website || '', about: b.bio || '', cover: b.biz_cover || '', avatar: b.avatar || '', place: b.biz_lat != null ? { city: b.city, country: b.country, lat: b.biz_lat, lon: b.biz_lon, name: b.biz_address || b.city } : null })
  const status = b => { const t = Date.now(); return !b.biz_until || b.biz_until <= t ? ['Pendiente: no aparece en el mapa', 'tag-directo'] : b.biz_until >= d.forever - 1e9 ? ['Activo sin vencimiento', 'tag'] : ['Activo hasta ' + new Date(b.biz_until).toLocaleDateString('es-CO'), 'tag'] }
  if (!d) return <Section title="Negocios" sub="Cargando…" />
  return <Section title="Negocios" sub="Un negocio aparece en el mapa solo si está activo: porque pagó el plan o porque lo activaste tú aquí. Los que no están activos no se ven en el mapa ni en las búsquedas."
    actions={<button className="btn" onClick={() => setForm({ ...BIZ_EMPTY })}>Agregar negocio</button>}>
    {form && <div className="biz-box" style={{ marginBottom: 16 }}>
      <h3 className="adm-h3">{form.id ? 'Editar negocio' : 'Agregar negocio'}</h3>
      <label className="adm-field"><span>Nombre del negocio</span><input className="field" value={form.name} maxLength={80} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className="adm-field"><span>Tipo</span><select className="field" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{BIZ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="adm-field"><span>Descripción</span><textarea className="field" rows={3} maxLength={300} value={form.about} onChange={e => setForm({ ...form, about: e.target.value })} placeholder="Qué ofrece, qué lo hace especial…" /></label>
      <div className="adm-field"><span>Ubicación (busca la dirección o el lugar exacto)</span><PlacePicker value={form.place} onChange={p => setForm(fm => ({ ...fm, place: p }))} id="bz-place" placeholder="Calle 57 # 9-30, Bogotá" /></div>
      <label className="adm-field"><span>Dirección que se muestra</span><input className="field" value={form.address} maxLength={160} onChange={e => setForm({ ...form, address: e.target.value })} /></label>
      <label className="adm-field"><span>Horario</span><input className="field" value={form.hours} maxLength={120} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="Lun a sáb, 8 a. m. – 8 p. m." /></label>
      <label className="adm-field"><span>WhatsApp</span><input className="field" value={form.whatsapp} maxLength={20} inputMode="tel" onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="+57 300 123 4567" /></label>
      <label className="adm-field"><span>Sitio web (opcional; se abre en una pestaña nueva)</span><input className="field" value={form.website} maxLength={200} inputMode="url" onChange={e => setForm({ ...form, website: e.target.value })} placeholder="www.minegocio.com" /></label>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <label className="adm-field"><span>Foto de perfil (logo)</span><input type="file" accept="image/*" onChange={pick('avatar')} />{busy === 'avatar' ? <small className="meta">Subiendo…</small> : form.avatar && <img src={form.avatar} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', marginTop: 6 }} />}</label>
        <label className="adm-field"><span>Foto del local (portada)</span><input type="file" accept="image/*" onChange={pick('cover')} />{busy === 'cover' ? <small className="meta">Subiendo…</small> : form.cover && <img src={form.cover} alt="" style={{ width: 120, height: 56, borderRadius: 6, objectFit: 'cover', marginTop: 6 }} />}</label>
      </div>
      {!form.id && <label className="adm-field"><span>Activo en el mapa</span><select className="field" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })}><option value={30}>30 días</option><option value={90}>90 días</option><option value={365}>1 año</option><option value={-1}>Sin vencimiento</option><option value={0}>Todavía no (queda pendiente)</option></select></label>}
      <div className="row" style={{ gap: 8 }}><button className="btn" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Guardando…' : 'Guardar'}</button><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button></div>
    </div>}
    <h3 className="adm-h3">Negocios ({d.list.length})</h3>
    <div className="adm-list">{d.list.length ? d.list.map(b => { const [txt, cls] = status(b); return <div key={b.id} className="adm-row">
      <div className="grow"><b>{b.biz_name || b.name}</b><span className={'tag ' + cls} style={{ marginLeft: 6 }}>{txt}</span>{b.suspended ? <span className="tag tag-directo" style={{ marginLeft: 6 }}>Suspendida</span> : null}<div className="meta">@{b.handle} · {b.city || '—'}{b.biz_address ? ' · ' + b.biz_address : ''}</div></div>
      <button className="btn sm" onClick={() => act(b.id, { bizDays: 30 })}>+30 días</button>
      <button className="btn ghost sm" onClick={() => act(b.id, { bizDays: -1 })}>Sin vencimiento</button>
      {b.biz_until > Date.now() && <button className="btn ghost sm" onClick={() => act(b.id, { bizDays: 0 })}>Desactivar</button>}
      <button className="btn ghost sm" onClick={() => edit(b)}>Editar</button>
    </div> }) : <p className="muted">Todavía no hay negocios.</p>}</div>
    <h3 className="adm-h3" style={{ marginTop: 20 }}>Cuentas con nombre de empresa por revisar ({d.review.length})</h3>
    <p className="meta" style={{ display: 'block', marginBottom: 8 }}>Se detectan por palabras como «SAS», «Ltda», «Restaurante», «Hotel» o «Oficial». Las marcadas como negocio no pueden publicar hasta que paguen o las actives. Las que son personas quedan libres.</p>
    <div className="adm-list">{d.review.length ? d.review.map(u => <div key={u.id} className="adm-row">
      <div className="grow"><b>{u.name}</b>{u.biz_flag === 1 && <span className="tag tag-directo" style={{ marginLeft: 6 }}>No puede publicar</span>}<div className="meta">@{u.handle} · {u.city}</div></div>
      <button className="btn ghost sm" onClick={() => act(u.id, { bizReview: 'person' })}>Es una persona</button>
      {u.biz_flag !== 1 && <button className="btn sm" onClick={() => act(u.id, { bizReview: 'business' })}>Es un negocio: bloquear publicar</button>}
    </div>) : <p className="muted">No hay cuentas por revisar.</p>}</div>
  </Section>
}

// Rendimiento: memoria, CPU, base de datos, errores y el botón «Optimizar» (no borra publicaciones ni datos de usuarios)
function PerfTab({ flash, isAdmin }) {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false), [res, setRes] = useState(null)
  const load = () => req('GET', '/api/admin/health').then(setD).catch(() => {})
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load() }, 5000); return () => clearInterval(t) }, [])
  if (!d) return <p className="muted">Cargando…</p>
  const mb = b => (b / 1048576).toFixed(b > 1e8 ? 0 : 1) + ' MB'
  const lvl = (v, a, r) => v >= r ? 'bad' : v >= a ? 'warn' : 'ok'
  const dur = s => s >= 86400 ? Math.floor(s / 86400) + ' d ' + Math.floor(s % 86400 / 3600) + ' h' : s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min' : Math.floor(s / 60) + ' min'
  const hist = d.history || [], maxRss = Math.max(1, ...hist.map(h => h.rss))
  const cards = [
    ['Memoria del servidor', mb(d.mem.rss), lvl(d.mem.rss / 1048576, 350, 700), 'del equipo: ' + mb(d.sys.total)],
    ['CPU del servidor', d.cpu + ' %', lvl(d.cpu, 50, 85), 'carga: ' + d.sys.load.map(x => x.toFixed(2)).join(' · ')],
    ['Encendido hace', dur(d.uptime), 'ok', 'Node ' + d.node],
    ['Base de datos', mb(d.db.bytes), lvl(d.db.bytes / 1048576, 500, 2000), d.db.posts + ' publicaciones · ' + d.db.users + ' usuarios'],
    ['Fotos y videos', d.files.storage === 'Cloudflare R2' ? 'En R2' : mb(d.files.uploads.bytes), 'ok', d.files.storage === 'Cloudflare R2' ? 'sin gastar disco' : d.files.uploads.files + ' archivos'],
    ['Mapas guardados', mb(d.files.tiles.bytes), lvl(d.files.tiles.bytes / 1048576, 1500, 4000), d.files.tiles.files + ' imágenes'],
    ['Conectados ahora', d.live.connected, 'ok', d.db.sessions + ' sesiones · ' + d.db.push + ' dispositivos con avisos'],
    ['Memoria en cachés', mb(d.live.caches.estaticosBytes), 'ok', d.live.caches.ciudad + ' ciudades · ' + d.live.caches.lugares + ' búsquedas'],
  ]
  const optimizar = async () => { setBusy(true); try { setRes(await req('POST', '/api/admin/optimize')); load() } catch (e) { flash(e.message) } finally { setBusy(false) } }
  const borrar = async () => { try { await req('DELETE', '/api/admin/health/errors'); load() } catch (e) { flash(e.message) } }
  return <Section title="Rendimiento y errores" sub="Se actualiza solo cada 5 segundos." actions={isAdmin && <button className="btn" onClick={optimizar} disabled={busy}>{busy ? 'Optimizando…' : 'Optimizar ahora'}</button>}>
    <div className="adm-cards">{cards.map(([l, v, lv, sub]) => <div key={l} className={'adm-card perf-' + lv}><b>{v}</b><span>{l}</span><small className="meta">{sub}</small></div>)}</div>
    {hist.length > 1 && <><h3 className="adm-h3">Últimos 5 minutos</h3>
      <div className="perf-spark"><div><small>Memoria</small><p>{hist.map((h, i) => <i key={i} style={{ height: Math.max(3, Math.round(h.rss / maxRss * 40)) }} />)}</p></div>
        <div><small>CPU</small><p>{hist.map((h, i) => <i key={i} className="cpu" style={{ height: Math.max(3, Math.round(Math.min(100, h.cpu) * 0.4)) }} />)}</p></div></div></>}
    {res && <div className="perf-res"><b>Listo:</b><ul>{res.did.map(x => <li key={x}>{x}</li>)}</ul><p className="meta">Base de datos: {mb(res.before.db)} → {mb(res.after.db)} · Memoria: {mb(res.before.rss)} → {mb(res.after.rss)}</p><p className="meta">No se borró ninguna publicación ni dato de usuarios.</p></div>}
    <h3 className="adm-h3">Errores recientes {d.errors.length > 0 && isAdmin && <button className="link" onClick={borrar}>Borrar lista</button>}</h3>
    {d.errors.length ? <div className="adm-list">{d.errors.map((e, i) => <div key={i} className="adm-row perf-err"><span className="meta">{new Date(e.t).toLocaleTimeString('es-CO')}</span><b>{e.src}</b><span className="grow">{e.msg}{e.extra ? <small className="meta"> · {e.extra}</small> : null}</span></div>)}</div> : <p className="meta">Sin errores. Aquí aparecen los del servidor y los de los navegadores de tus usuarios.</p>}
  </Section>
}

function Section({ title, sub, children, actions }) {
  return <section className="adm-sec"><div className="adm-sec-h"><div><h2>{title}</h2>{sub && <p className="meta" style={{ display: 'block' }}>{sub}</p>}</div>{actions}</div>{children}</section>
}
function Field({ label, children, hint }) { return <label className="adm-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label> }

function Overview() {
  const [d, setD] = useState(null)
  useEffect(() => { req('GET', '/api/admin/overview').then(setD).catch(() => {}) }, [])
  if (!d) return <p className="muted">Cargando…</p>
  const cards = [['Negocios', d.businesses], ['Negocios destacados', d.featuredBiz], ['Emisoras activas', d.stationsActive], ['Usuarios registrados', d.users], ['Publicaciones', d.posts], ['Publicaciones hoy', d.postsToday], ['Comentarios', d.comments], ['Mensajes', d.messages], ['Reportes pendientes', d.reports], ['Conectados ahora', d.online]]
  return <Section title="Resumen" sub={'Fotos y videos guardados en: ' + d.storage}>
    <div className="adm-cards">{cards.map(([l, n]) => <div key={l} className="adm-card"><b>{n}</b><span>{l}</span></div>)}</div>
    <h3 className="adm-h3">Ventas de este mes</h3>
    <div className="adm-cards">{d.sales?.length ? d.sales.map(v => <div key={v.currency} className="adm-card"><b>{new Intl.NumberFormat('es-CO').format(v.total)} {v.currency}</b><span>{v.n} pagos</span></div>) : <div className="adm-card"><b>0</b><span>Aún no hay pagos este mes</span></div>}</div>
    {d.recentPayments?.length > 0 && <div className="adm-list">{d.recentPayments.map(v => <div key={v.ref} className="adm-row"><span className="grow"><b>{v.item === 'radio' ? 'Emisora' : 'Negocio'}</b> · {v.name}</span><span className="meta">{new Intl.NumberFormat('es-CO').format(v.amount)} {v.currency} · {v.provider} · {new Date(v.paid_at).toLocaleDateString('es-CO')}</span></div>)}</div>}
    {d.stationsExpiring?.length > 0 && <><h3 className="adm-h3">Emisoras que vencen en 7 días </h3><div className="adm-list">{d.stationsExpiring.map(st => <div key={st.id} className="adm-row"><span className="grow"><b>{st.name}</b></span><span className="meta">vence el {new Date(st.paid_until).toLocaleDateString('es-CO')}</span></div>)}</div></>}
    {d.expiringSoon?.length > 0 && <><h3 className="adm-h3">Destacados que vencen en 7 días </h3><div className="adm-list">{d.expiringSoon.map(u => <div key={u.id} className="adm-row"><span className="grow"><b>{u.biz_name || u.name}</b></span><span className="meta">vence el {new Date(u.featured_until).toLocaleDateString('es-CO')}</span></div>)}</div></>}
    <h3 className="adm-h3">Ciudades con más publicaciones</h3>
    <div className="adm-list">{d.topCities.map(c => <div key={c.city} className="adm-row"><span className="grow">{c.city}</span><b>{c.n}</b></div>)}</div>
    {d.examples > 0 && <p className="meta" style={{ display: 'block', marginTop: 12 }}>Hay {d.examples} publicaciones de ejemplo. Puedes borrarlas en Publicaciones.</p>}
  </Section>
}

function ImagePick({ label, value, onChange, hint, dark, flash }) {
  const [busy, setBusy] = useState(false)
  const pick = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); try { onChange(await uploadFile(f, 'brand')) } catch (x) { flash(x.message) } finally { setBusy(false) } }
  return <div className="adm-img">
    <div className="adm-img-h"><b>{label}</b>{hint && <small>{hint}</small>}</div>
    <div className={'adm-img-box' + (dark ? ' dark' : ' light')}>{value ? <img src={value} alt="" /> : <span className="muted small">Sin imagen</span>}</div>
    <div className="row"><label className="btn ghost sm"><Upload size={14} /> {busy ? 'Subiendo…' : 'Subir imagen'}<input type="file" accept="image/png,image/webp,image/jpeg,image/x-icon" hidden onChange={pick} /></label>{value && <button className="btn ghost sm" onClick={() => onChange('')}><Trash2 size={14} /> Quitar</button>}</div>
  </div>
}

function BrandTab({ draft, setDraft, save, flash }) {
  const set = k => e => setDraft({ ...draft, [k]: e.target.value })
  return <Section title="Nombre y logos" sub="El nombre cambia en todos los textos de la web, la pestaña del navegador y la app instalada."
    actions={<button className="btn" onClick={() => save({ name: draft.name.trim() || 'PLANETA', tagline: draft.tagline, tagline2: draft.tagline2, description: draft.description, logoDark: draft.logoDark, logoLight: draft.logoLight, favicon: draft.favicon })}>Guardar cambios</button>}>
    <div className="adm-grid">
      <Field label="Nombre de la web"><input id="adm-name" className="field" value={draft.name} onChange={set('name')} maxLength={40} /></Field>
      <Field label="Lema (línea 1)"><input className="field" value={draft.tagline} onChange={set('tagline')} maxLength={80} /></Field>
      <Field label="Lema (línea 2)"><input className="field" value={draft.tagline2} onChange={set('tagline2')} maxLength={80} /></Field>
      <Field label="Descripción para Google y redes sociales"><textarea className="field" rows={3} value={draft.description} onChange={set('description')} maxLength={300} /></Field>
    </div>
    <div className="adm-preview"><span className="meta">Vista previa:</span> <b>{draft.name || 'PLANETA'}</b> — {draft.tagline} {draft.tagline2} · «{t(draft, 'publishButton')}» · «{t(draft, 'joinTitle')}»</div>
    <div className="adm-imgs">
      <ImagePick label="Logo blanco" hint="Para fondo oscuro (el que usa la web)" dark value={draft.logoDark} onChange={v => setDraft({ ...draft, logoDark: v })} flash={flash} />
      <ImagePick label="Logo a color" hint="Para fondos claros" value={draft.logoLight} onChange={v => setDraft({ ...draft, logoLight: v })} flash={flash} />
      <ImagePick label="Ícono de la pestaña" hint="Favicon e ícono de la app. PNG cuadrado, 512 × 512" dark value={draft.favicon} onChange={v => setDraft({ ...draft, favicon: v })} flash={flash} />
    </div>
  </Section>
}

function ColorsTab({ draft, setDraft, save }) {
  // una sola paleta para toda la web; cada color dice dónde se ve
  const c = effectiveColors(draft)
  // se ve en vivo en toda la web mientras eliges (Guardar lo aplica a todos los visitantes)
  const setC = k => e => { const n = { ...draft, colors: { ...c, [k]: e.target.value } }; setDraft(n); applyTheme(n) }
  const groups = [...new Set(PALETTE.map(x => x[1]))]
  return <Section title="Colores" sub="Una sola paleta para toda la web. Los cambios se ven en vivo en esta pantalla; pulsa Guardar para aplicarlos a todos."
    actions={<div className="row"><button className="btn ghost" onClick={() => { const n = { ...draft, colors: Object.fromEntries(PALETTE.map(([k, , , , , def]) => [k, def])) }; setDraft(n); applyTheme(n) }}><RotateCcw size={15} /> Colores originales</button><button className="btn" onClick={() => save({ colors: c })}>Guardar colores</button></div>}>
    {groups.map(g => <div key={g}><h3 className="adm-h3">{g}</h3>
      <div className="adm-colors">{PALETTE.filter(x => x[1] === g).map(([k, , label, where]) => <label key={k} className="adm-color"><input type="color" value={c[k]} onChange={setC(k)} /><span><b>{label}</b><small className="adm-where">{where}</small><small>{c[k]}</small></span></label>)}</div></div>)}
  </Section>
}

function TextsTab({ draft, setDraft, save }) {
  const tx = draft.texts || {}
  return <Section title="Textos de la web" sub="Escribe {name} donde quieras que aparezca el nombre de la web, y {city} para la ciudad."
    actions={<button className="btn" onClick={() => save({ texts: tx })}>Guardar textos</button>}>
    <div className="adm-grid">{Object.entries(TEXT_LABELS).map(([k, l]) => <Field key={k} label={l} hint={'Se ve así: ' + t(draft, k, { city: 'Bogotá' })}><input className="field" value={tx[k] ?? ''} onChange={e => setDraft({ ...draft, texts: { ...tx, [k]: e.target.value } })} maxLength={140} /></Field>)}</div>
  </Section>
}

function PostsTab({ flash, isAdmin }) {
  const [q, setQ] = useState(''), [list, setList] = useState(null), [confirm, setConfirm] = useState(null)
  const load = () => req('GET', '/api/admin/posts?q=' + encodeURIComponent(q)).then(d => setList(d.posts)).catch(e => flash(e.message))
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const del = async id => { await req('DELETE', '/api/admin/posts/' + id); setConfirm(null); flash('Publicación borrada'); load() }
  const type = async (id, v) => { await req('POST', `/api/admin/posts/${id}/type`, { type: v }); load() }
  const examples = async () => { try { const d = await req('DELETE', '/api/admin/examples'); flash(d.deleted + ' publicaciones de ejemplo borradas'); load() } catch (e) { flash(e.message) } setConfirm(null) }
  return <Section title="Publicaciones" sub="Busca, cambia el tipo o borra cualquier publicación."
    actions={isAdmin && (confirm === 'ex' ? <div className="row"><span className="meta">¿Borrar todas las de ejemplo?</span><button className="btn sm danger" onClick={examples}>Sí, borrar</button><button className="btn ghost sm" onClick={() => setConfirm(null)}>No</button></div> : <button className="btn ghost sm" onClick={() => setConfirm('ex')}><Trash2 size={14} /> Borrar las de ejemplo</button>)}>
    <div className="adm-search"><Search size={15} /><input placeholder="Buscar por título, autor o ciudad" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="adm-list">{!list ? <p className="muted">Cargando…</p> : list.map(p => <div key={p.id} className="adm-row">
      <div className="adm-thumb" style={{ backgroundImage: (p.thumb || p.image) ? `url('${p.thumb || p.image}')` : undefined }} />
      <div className="grow"><b>{p.title}</b><div className="meta">{p.author} · {p.city} · {ago(p.at)}{p.is_example ? ' · ejemplo' : ''}{p.video ? ' · video' : ''}{p.reports ? ` · ${p.reports} reportes` : ''}</div></div>
      <button className={'btn sm' + (p.featured ? '' : ' ghost')} onClick={async () => { await req('POST', `/api/admin/posts/${p.id}/feature`, { featured: !p.featured }); load() }}>{p.featured ? 'Destacada' : 'Destacar'}</button>
      <select value={p.type} onChange={e => type(p.id, e.target.value)}><option value="usuario">Publicación de usuario</option><option value="verificada">Noticia verificada</option><option value="directo">En directo</option></select>
      {confirm === p.id ? <><button className="btn sm danger" onClick={() => del(p.id)}>Borrar</button><button className="btn ghost sm" onClick={() => setConfirm(null)}>No</button></> : <button className="icon" onClick={() => setConfirm(p.id)} aria-label="Borrar"><Trash2 size={15} /></button>}
    </div>)}</div>
  </Section>
}

function UsersTab({ flash, me }) {
  const [q, setQ] = useState(''), [list, setList] = useState(null), [confirm, setConfirm] = useState(null)
  const load = () => req('GET', '/api/admin/users?q=' + encodeURIComponent(q)).then(d => setList(d.users)).catch(e => flash(e.message))
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const upd = async (id, b) => { try { await req('POST', '/api/admin/users/' + id, b); load() } catch (e) { flash(e.message) } }
  const del = async id => { try { await req('DELETE', '/api/admin/users/' + id); setConfirm(null); flash('Cuenta borrada'); load() } catch (e) { flash(e.message) } }
  return <Section title="Usuarios" sub="Moderador: puede revisar publicaciones, reportes y salas. Administrador: todo el panel.">
    <div className="adm-search"><Search size={15} /><input placeholder="Buscar por nombre o usuario" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="adm-list">{!list ? <p className="muted">Cargando…</p> : list.map(u => <div key={u.id} className="adm-row">
      <div className="grow"><b>{u.name}</b>{u.biz ? <span className="tag" style={{ marginLeft: 6, background: '#ffffff14' }}>{u.biz_name}</span> : null}{u.suspended ? <span className="tag tag-directo" style={{ marginLeft: 6 }}>Suspendida</span> : null}<div className="meta">@{u.handle} · {u.city} · {u.posts} publicaciones · desde {new Date(u.created_at).toLocaleDateString('es-CO')}</div></div>
      {u.id === me.id ? <span className="meta">Tú</span> : <>
        {u.biz ? <>{u.featured_until > Date.now() ? <span className="meta">Destacado hasta {new Date(u.featured_until).toLocaleDateString('es-CO')}</span> : null}<button className="btn sm" onClick={() => upd(u.id, { featureDays: 30 })}>+1 mes</button>{u.featured_until > Date.now() && <button className="btn ghost sm" onClick={() => upd(u.id, { featureDays: 0 })}>Quitar</button>}</> : null}
        <button className={'btn sm' + (u.verified ? '' : ' ghost')} onClick={() => upd(u.id, { verified: !u.verified })}>{u.verified ? <><IconCheck /> Verificada</> : 'Verificar'}</button>
        <select value={u.role} onChange={e => upd(u.id, { role: e.target.value })}><option value="user">Usuario</option><option value="mod">Moderador</option><option value="admin">Administrador</option></select>
        <button className="btn ghost sm" onClick={() => upd(u.id, { suspended: !u.suspended })}>{u.suspended ? <><Check size={14} /> Reactivar</> : <><Ban size={14} /> Suspender</>}</button>
        {confirm === u.id ? <><button className="btn sm danger" onClick={() => del(u.id)}>Borrar cuenta</button><button className="btn ghost sm" onClick={() => setConfirm(null)}>No</button></> : <button className="icon" onClick={() => setConfirm(u.id)} aria-label="Borrar cuenta"><Trash2 size={15} /></button>}
      </>}
    </div>)}</div>
  </Section>
}

function ReportsTab({ flash }) {
  const [list, setList] = useState(null)
  const load = () => req('GET', '/api/admin/reports').then(d => setList(d.reports)).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const resolve = async id => { await req('POST', '/api/admin/reports/' + id); load() }
  const del = async (rid, pid) => { await req('DELETE', '/api/admin/posts/' + pid); await req('POST', '/api/admin/reports/' + rid); flash('Publicación borrada'); load() }
  return <Section title="Reportes" sub="Publicaciones que la gente marcó como inapropiadas.">
    <div className="adm-list">{!list ? <p className="muted">Cargando…</p> : list.length ? list.map(r => <div key={r.id} className="adm-row">
      <div className="grow"><b>{r.title}</b><div className="meta">De {r.author} · {r.city} · reportado por {r.reporter} {ago(r.at)} · «{r.reason}»</div></div>
      <button className="btn ghost sm" onClick={() => resolve(r.id)}><Check size={14} /> Está bien</button><button className="btn sm danger" onClick={() => del(r.id, r.post_id)}><Trash2 size={14} /> Borrar publicación</button>
    </div>) : <p className="muted">No hay reportes pendientes.</p>}</div>
  </Section>
}

function RoomsTab({ flash }) {
  const [list, setList] = useState(null)
  const load = () => req('GET', '/api/admin/rooms').then(d => setList(d.messages)).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  return <Section title="Salas de ciudad" sub="Últimos mensajes de todas las salas.">
    <div className="adm-list">{!list ? <p className="muted">Cargando…</p> : list.length ? list.map(m => <div key={m.id} className="adm-row">
      <div className="grow"><b>{m.author}</b> <span className="meta">en {m.city} · {ago(m.at)}</span><div>{m.text}</div></div>
      <button className="icon" onClick={async () => { await req('DELETE', '/api/admin/rooms/' + m.id); load() }} aria-label="Borrar mensaje"><Trash2 size={15} /></button>
    </div>) : <p className="muted">Aún no hay mensajes en las salas.</p>}</div>
  </Section>
}

function ConfigTab({ draft, setDraft, save }) {
  const n = k => e => setDraft({ ...draft, [k]: +e.target.value })
  return <Section title="Configuración" actions={<button className="btn" onClick={() => save({ postTTLHours: draft.postTTLHours, bizAmount: draft.bizAmount, radioAmount: draft.radioAmount, eventAmount: draft.eventAmount, eventUSD: draft.eventUSD, currency: draft.currency, bizUSD: draft.bizUSD, radioUSD: draft.radioUSD, videoMaxSeconds: draft.videoMaxSeconds, imageMaxMB: draft.imageMaxMB, postsPerHour: draft.postsPerHour, bannedWords: draft.bannedWords ?? '', sitesOn: draft.sitesOn !== false, vectorStreets: draft.vectorStreets !== false, hereOn: draft.hereOn === true, cspEnforce: !!draft.cspEnforce, maintenance: draft.maintenance, maintenanceText: draft.maintenanceText })}>Guardar</button>}>
    <div className="adm-grid">
      <Field label="Borrar publicaciones con video después de (horas)" hint="Las publicaciones con video se borran solas pasado este tiempo (los videos pesan mucho). Las de foto o texto se quedan. 0 = no borrar nunca."><input className="field" type="number" min="0" max="720" value={draft.postTTLHours ?? 24} onChange={e => setDraft({ ...draft, postTTLHours: +e.target.value })} /></Field>
      <Field label="Precio mensual para destacar un negocio" hint="Solo el número. Ejemplo: 29900"><input className="field" type="number" min="0" value={draft.bizAmount ?? ''} onChange={e => setDraft({ ...draft, bizAmount: +e.target.value })} /></Field>
      <Field label="Precio para promocionar un evento" hint="Por cada evento y por los días del plan (se cambian en Diseño → Planes). Solo el número. Ejemplo: 19900"><input className="field" type="number" min="0" value={draft.eventAmount ?? ''} onChange={e => setDraft({ ...draft, eventAmount: +e.target.value })} /></Field>
      <Field label="Moneda (Mercado Pago y Stripe)" hint="COP, MXN, USD…"><input className="field" value={draft.currency || ''} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} /></Field>
      <Field label="Precios en dólares para PayPal (PayPal no cobra en pesos)" hint="Negocio y evento, en USD"><div className="row"><input className="field" type="number" min="0" step="0.5" value={draft.bizUSD ?? ''} onChange={e => setDraft({ ...draft, bizUSD: +e.target.value })} aria-label="Negocio en USD" /><input className="field" type="number" min="0" step="0.5" value={draft.eventUSD ?? ''} onChange={e => setDraft({ ...draft, eventUSD: +e.target.value })} aria-label="Evento en USD" /></div></Field>
      <Field label="Duración máxima de los videos (segundos)" hint="Si en el archivo .env del servidor hay VIDEO_MAX_SECONDS, ese valor manda."><input type="number" min="5" max="300" className="field" value={draft.videoMaxSeconds} onChange={n('videoMaxSeconds')} /></Field>
      <Field label="Personas en el mapa" hint="Encendido: cada persona mayor de 18 años puede elegir mostrarse en el mapa. Apagado (recomendado mientras haya pocos usuarios): nadie aparece y la web no consulta nada de esto."><label className="toggle"><span>Permitir «Mostrarme en el mapa»</span><input type="checkbox" checked={draft.hereOn === true} onChange={e => setDraft({ ...draft, hereOn: e.target.checked })} /><i /></label></Field>
      <Field label="Calles de la vista 3D" hint="Encendido: calles, agua, parques y nombres llegan junto con los edificios desde un solo servicio rápido (sin esperar cuadros nuevos). Apagado: vuelve al sistema anterior, con imágenes de calles que descarga tu servidor. Si con esto encendido algo se ve mal, apágalo."><label className="toggle"><span>Calles vectoriales (más rápido)</span><input type="checkbox" checked={draft.vectorStreets !== false} onChange={e => setDraft({ ...draft, vectorStreets: e.target.checked })} /></label></Field>
      <Field label="Lugares del mundo en el mapa" hint="Playas, lugares sagrados, ruinas, sitios turísticos y naturaleza (unos 250). Se ven en el mapa plano; la foto y el resumen vienen de Wikipedia."><label className="toggle"><span>Mostrar lugares en el mapa</span><input type="checkbox" checked={draft.sitesOn !== false} onChange={e => setDraft({ ...draft, sitesOn: e.target.checked })} /></label></Field>
      <Field label="Política de seguridad (CSP)" hint="Apagada, solo avisa. Encendida, el navegador bloquea cualquier cosa que no venga de tu web ni de los servicios permitidos (mapas, fotos, YouTube, Cloudflare). Si al encenderla algo deja de verse o de funcionar, apágala aquí mismo."><label className="toggle"><span>Bloquear contenido no permitido</span><input type="checkbox" checked={!!draft.cspEnforce} onChange={e => setDraft({ ...draft, cspEnforce: e.target.checked })} /></label></Field>
      <Field label="Tamaño máximo de las fotos (MB)"><input type="number" min="1" max="20" className="field" value={draft.imageMaxMB} onChange={n('imageMaxMB')} /></Field>
      <Field label="Palabras no permitidas" hint="Una por línea. Cualquier publicación, comentario o mensaje que las contenga se rechaza (sin importar tildes ni mayúsculas). Los administradores quedan exentos."><textarea className="field" rows="4" value={draft.bannedWords || ''} onChange={e => setDraft({ ...draft, bannedWords: e.target.value })} placeholder={'una palabra\notra palabra'} /></Field>
      <Field label="Publicaciones máximas por persona cada hora" hint="Frena el spam. No aplica a administradores."><input type="number" min="1" max="500" className="field" value={draft.postsPerHour} onChange={n('postsPerHour')} /></Field>
    </div>
    <label className="toggle" style={{ maxWidth: 520 }}><span>Modo mantenimiento: nadie puede publicar ni escribir, excepto administradores</span><input type="checkbox" checked={!!draft.maintenance} onChange={e => setDraft({ ...draft, maintenance: e.target.checked })} /><i /></label>
    <Field label="Mensaje de mantenimiento"><input className="field" value={draft.maintenanceText} onChange={e => setDraft({ ...draft, maintenanceText: e.target.value })} maxLength={160} /></Field>
  </Section>
}

function IntegrationsTab({ flash }) {
  const [data, setData] = useState(null), [vals, setVals] = useState({}), [msg, setMsg] = useState({})
  const load = () => req('GET', '/api/admin/integrations').then(d => { setData(d); setVals(Object.fromEntries(Object.entries(d).map(([p, v]) => [p, Object.fromEntries(Object.entries(v.fields).map(([f, x]) => [f, x.secret ? '' : x.value]))]))) }).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  if (!data) return <p className="muted">Cargando…</p>
  const saveP = async p => { try { const values = Object.fromEntries(Object.entries(vals[p] || {}).filter(([f, v]) => !(data[p].fields[f].secret && v === ''))); const d = await req('PUT', '/api/admin/integrations', { provider: p, values }); setData(d); flash('Llaves guardadas'); load() } catch (e) { flash(e.message) } }
  const test = async p => { setMsg({ ...msg, [p]: 'Probando…' }); const d = await req('POST', `/api/admin/integrations/${p}/test`).catch(e => ({ message: e.message })); setMsg(m => ({ ...m, [p]: d.message })) }
  return <Section title="Pagos y Google" sub="Las llaves secretas se guardan cifradas en el servidor y nunca se muestran completas ni llegan al navegador de los visitantes.">
    {Object.entries(data).map(([p, v]) => <div key={p} className="adm-integ">
      <h3 className="adm-h3">{v.label}</h3>
      <div className="adm-grid">{Object.entries(v.fields).map(([f, x]) => <Field key={f} label={x.label + (x.secret ? ' (secreta)' : '')} hint={x.secret ? (x.set ? 'Guardada (' + x.value + '). Escribe una nueva solo si quieres reemplazarla.' : 'Aún no guardada.') : ''}>
        <input className="field" type={x.secret ? 'password' : 'text'} autoComplete="off" value={vals[p]?.[f] ?? ''} placeholder={x.secret && x.set ? x.value : ''} onChange={e => setVals({ ...vals, [p]: { ...vals[p], [f]: e.target.value } })} /></Field>)}</div>
      <div className="row"><button className="btn sm" onClick={() => saveP(p)}>Guardar</button><button className="btn ghost sm" onClick={() => test(p)}>Probar conexión</button>{msg[p] && <span className="meta">{msg[p]}</span>}</div>
    </div>)}
  </Section>
}

const EMPTY_ST = { name: '', genre: '', stream: '', website: '', whatsapp: '', logo: '', place: null }
// Buscador del directorio abierto de emisoras: escribes un nombre o un país y con un clic se llenan nombre, enlace de audio, género y sitio web.
function RadioFinder({ onPick, flash }) {
  const [q, setQ] = useState(''), [cc, setCc] = useState(''), [rows, setRows] = useState(null), [busy, setBusy] = useState(false)
  const go = async e => { e?.preventDefault(); setBusy(true); try { const d = await req('GET', `/api/admin/radio-search?q=${encodeURIComponent(q)}&cc=${encodeURIComponent(cc)}`); setRows(d.results) } catch (x) { flash(x.message); setRows(null) } finally { setBusy(false) } }
  return <div className="adm-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ fontWeight: 700, fontSize: 14 }}>Buscar emisoras con enlace de transmisión</div>
    <span className="meta">Directorio abierto radio-browser.info: miles de emisoras del mundo. Escribe parte del nombre y, si quieres, el país con 2 letras (CO, MX, AR, ES…). Elige una y se llenan sus datos.</span>
    <div className="row" style={{ gap: 8 }}>
      <input className="field" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(e) }} placeholder="Caracol, RCN, Blu, La FM…" maxLength={60} />
      <input className="field" style={{ width: 70 }} value={cc} onChange={e => setCc(e.target.value.toUpperCase().slice(0, 2))} placeholder="CO" maxLength={2} aria-label="País" />
      <button type="button" className="btn" disabled={busy} onClick={go}>{busy ? 'Buscando…' : 'Buscar'}</button>
    </div>
    {rows && (rows.length ? rows.map((r, i) => <div key={i} className="adm-row"><span className="grow"><span style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</span><span className="meta"> {r.country}{r.genre ? ' · ' + r.genre : ''}{r.bitrate ? ' · ' + r.bitrate + ' kbps' : ''}</span></span><button type="button" className="btn ghost sm" onClick={() => onPick(r)}>Usar</button></div>) : <div className="meta">No encontré emisoras con enlace seguro (https). Prueba con otro nombre.</div>)}
  </div>
}

function StationsTab({ flash }) {
  const [list, setList] = useState([]), [form, setForm] = useState(null), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null)
  const load = () => req('GET', '/api/admin/stations').then(d => setList(d.stations)).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const done = () => { load(); loadStations() }
  const save = async e => { e.preventDefault(); setBusy(true)
    try { const pl = form.place || {}; const body = { name: form.name, genre: form.genre, stream: form.stream, website: form.website, whatsapp: form.whatsapp, logo: form.logo, city: pl.city, country: pl.country, lat: pl.lat, lon: pl.lon }
      await req(form.id ? 'PUT' : 'POST', '/api/admin/stations' + (form.id ? '/' + form.id : ''), body); flash(form.id ? 'Emisora actualizada' : 'Emisora creada. Actívala con "+1 mes" cuando pague.'); setForm(null); done() } catch (x) { flash(x.message) } finally { setBusy(false) } }
  const pay = async (id, off, forever) => { try { await req('POST', `/api/admin/stations/${id}/pay`, off ? { off: true } : forever ? { forever: true } : {}); flash(off ? 'Emisora desactivada' : forever ? 'Activa para siempre' : 'Activada 1 mes más'); done() } catch (x) { flash(x.message) } }
  const del = async id => { try { await req('DELETE', '/api/admin/stations/' + id); flash('Emisora borrada'); setConfirm(null); done() } catch (x) { flash(x.message) } }
  const pickLogo = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); try { const url = await uploadFile(f, 'brand'); setForm(fm => ({ ...fm, logo: url })) } catch (x) { flash(x.message) } finally { setBusy(false) } }
  const edit = s => setForm({ id: s.id, name: s.name, genre: s.genre, stream: s.stream, website: s.website || '', whatsapp: s.whatsapp || '', logo: s.logo || '', place: s.city ? { city: s.city, country: s.country, lat: s.lat, lon: s.lon } : null })
  const pack = async () => { setBusy(true); try { const r = await req('POST', '/api/admin/stations/pack', { pack: 'co' }); flash(r.added ? `Listo: ${r.added} emisoras agregadas${r.rules ? ' y ' + r.rules + ' reglas de partidos sugeridas' : ''}.` : 'Esas emisoras ya estaban cargadas.'); done() } catch (x) { flash(x.message) } finally { setBusy(false) } }
  const PAISES = ['AR', 'BR', 'CO', 'MX', 'ES', 'GB', 'DE', 'IT', 'FR', 'PT', 'NL', 'BE', 'US', 'CL', 'UY', 'PE', 'EC', 'PY', 'BO', 'VE', 'CR', 'PA', 'HN', 'GT', 'SV', 'DO', 'CU', 'TR', 'GR', 'RU', 'UA', 'PL', 'SE', 'NO', 'DK', 'CH', 'AT', 'CZ', 'HR', 'RS', 'RO', 'HU', 'SA', 'AE', 'EG', 'MA', 'DZ', 'TN', 'NG', 'GH', 'SN', 'CM', 'CI', 'ZA', 'JP', 'KR', 'CN', 'IN', 'AU', 'CA']
  const [prog, setProg] = useState(null)
  const paises = async (lista, mode = 'deportes') => { setBusy(true); let added = 0, fail = 0; try { for (let i = 0; i < lista.length; i++) { setProg(`${lista[i]} (${i + 1} de ${lista.length})…`); try { const r = await req('POST', '/api/admin/stations/country', { cc: lista[i], mode }); added += r.added } catch { fail++ } } flash(`Listo: ${added} emisoras nuevas${fail ? ' · ' + fail + ' países sin respuesta' : ''}.`); done() } finally { setBusy(false); setProg(null) } }
  const logosWeb = async () => { setBusy(true); let ok = 0, n = 0; try { for (let k = 0; k < 60; k++) { const r = await req('POST', '/api/admin/stations/logos-web'); n += r.probadas; ok += r.con_logo; setProg(`Buscando logos en las webs… ${n} revisadas, ${ok} con logo (faltan ${r.faltan})`); if (!r.probadas || !r.faltan) break } flash(`Listo: ${ok} logos nuevos de ${n} emisoras revisadas`) } catch (e) { flash(e.message || 'No se pudo completar') } setBusy(false); setProg(null); done() }
  const [cc1, setCc1] = useState('')
  const active = list.filter(s => s.paid_until > Date.now()).length
  return <Section title="Emisoras" sub={`Las emisoras se registran y pagan solas desde la radio de la web. Aquí puedes revisarlas, editarlas o regalar meses. ${active} activas de ${list.length}.`}
    actions={!form && <button className="btn" onClick={() => setForm({ ...EMPTY_ST })}><Radio size={14} /> Nueva emisora</button>}>
    {!form && <div className="adm-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>Emisoras del mundo, automático</span>
      <span className="meta">Busca en el directorio abierto emisoras de cada país y las agrega a tu radio con su logo guardado en Cloudflare (activas para siempre, sin repetidas). Las que ya estaban sin logo lo reciben, sin duplicarse. «Cargar TODO» hace las dos cargas seguidas. «Deportivas»: las que tienen «deportes», «sports», «fútbol»… en el nombre (hasta 5 por país). «Populares»: las más escuchadas de cualquier tipo, para dar variedad (hasta 6 por país). Luego, cuando un partido está en vivo, la web ofrece «Escuchar» con una emisora deportiva del país del estadio. Las reglas de arriba, si las hay, mandan sobre esto.</span>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy} onClick={async () => { await paises(PAISES); await paises(PAISES, 'populares'); await logosWeb() }}>{prog || 'Cargar TODO: deportivas y populares de 60 países, con logo'}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={logosWeb}>{prog || 'Buscar logos que faltan (desde la web de cada emisora)'}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => paises(PAISES)}>{prog || 'Cargar emisoras deportivas de 60 países'}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => paises(PAISES, 'populares')}>{prog ? '…' : 'Cargar las más populares de 60 países'}</button>
        <input className="field" style={{ width: 80 }} value={cc1} onChange={e => setCc1(e.target.value.toUpperCase().slice(0, 2))} placeholder="País" maxLength={2} aria-label="País de 2 letras" />
        <button type="button" className="btn ghost" disabled={busy || cc1.length !== 2} onClick={() => paises([cc1])}>Deportivas de este país</button>
        <button type="button" className="btn ghost" disabled={busy || cc1.length !== 2} onClick={() => paises([cc1], 'populares')}>Populares de este país</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); try { const r = await req('POST', '/api/admin/stations/forever'); flash(`${r.changed} emisoras quedaron activas para siempre.`); done() } catch (x) { flash(x.message) } finally { setBusy(false) } }}>Dejar todas las activas para siempre</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); try { const r = await req('DELETE', '/api/admin/stations/auto'); flash(`Quité ${r.removed} emisoras cargadas automáticamente.`); done() } catch (x) { flash(x.message) } finally { setBusy(false) } }}>Quitar las cargadas automáticamente</button>
      </div>
    </div>}
    {!form && <div className="adm-card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}><span className="grow"><span style={{ fontWeight: 700, fontSize: 14 }}>Emisoras de Colombia ya listas</span><br /><span className="meta">Caracol Radio, Caracol Barranquilla, Blu Radio, Blu Medellín, W Radio y La Radio Deportes, con enlace de audio verificado. Quedan activas para siempre y se sugieren reglas para la Selección Colombia y la liga colombiana. Puedes quitarlas o cambiarlas cuando quieras.</span></span><button type="button" className="btn" disabled={busy} onClick={pack}>{busy ? 'Un momento…' : 'Cargar emisoras de Colombia'}</button></div>}
    {form && !form.id && <RadioFinder flash={flash} onPick={r => setForm(fm => ({ ...fm, name: r.name, genre: r.genre || fm.genre, stream: r.stream, website: r.website || fm.website }))} />}
    {form && <form className="adm-card" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
      <Field label="Nombre de la emisora"><input className="field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Radio Caribe 98.5" required /></Field>
      <Field label="Enlace de transmisión (stream)" hint="Lo da la emisora. Debe empezar con https://  Ejemplo: https://stream.zeno.fm/abc123"><input className="field" value={form.stream} onChange={e => setForm({ ...form, stream: e.target.value })} placeholder="https://…" required /></Field>
      <Field label="Género" hint="Noticias, Salsa, Rock, Deportes, Vallenato…"><input className="field" value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })} maxLength={40} /></Field>
      <div className="adm-field"><span>Ciudad (para su pin en el mapa)</span><PlacePicker value={form.place} onChange={pl => setForm(fm => ({ ...fm, place: pl }))} id="st-place" /></div>
      <Field label="Página web (opcional)"><input className="field" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://…" /></Field>
      <div className="adm-field"><span>Logo</span><div className="row">{form.logo && <img src={form.logo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />}<label className="btn ghost sm"><Upload size={14} /> {form.logo ? 'Cambiar' : 'Subir logo'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickLogo} /></label></div></div>
      <div className="row"><button className="btn" disabled={busy}>{busy ? 'Un momento…' : 'Guardar'}</button>{form.stream.startsWith('https://') && <button type="button" className="btn ghost" onClick={() => playRadio({ id: 'prueba', name: form.name || 'Prueba', stream: form.stream, logo: form.logo })}><Play size={14} /> Probar sonido</button>}<button type="button" className="btn ghost" onClick={() => { stopRadio(); setForm(null) }}>Cancelar</button></div>
    </form>}
    {list.length ? list.map(s => { const on = s.paid_until > Date.now(); return <div key={s.id} className="adm-row">
      {s.logo ? <img src={s.logo} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} /> : <Radio size={20} />}
      <div className="grow"><b>{s.name}</b><div className="meta">{[s.genre, s.city].filter(Boolean).join(' · ')} · {on ? <span style={{ color: '#3ddc97' }}>{s.paid_until > 7e12 ? 'Activa para siempre' : 'Activa hasta ' + new Date(s.paid_until).toLocaleDateString('es-CO')}</span> : <span style={{ color: '#ff8a8d' }}>Sin pagar · no aparece</span>}</div></div>
      {s.paid_until <= 7e12 && <button className="btn ghost sm" onClick={() => pay(s.id, false, true)}>Para siempre</button>}
      {s.paid_until <= 7e12 && <button className="btn sm" onClick={() => pay(s.id)}>+1 mes gratis</button>}
      {on && <button className="btn ghost sm" onClick={() => pay(s.id, true)}>Desactivar</button>}
      <button className="btn ghost sm" onClick={() => edit(s)}>Editar</button>
      {confirm === s.id ? <><button className="btn sm danger" onClick={() => del(s.id)}>Sí, borrar</button><button className="btn ghost sm" onClick={() => setConfirm(null)}>No</button></> : <button className="btn ghost sm" onClick={() => setConfirm(s.id)} aria-label="Borrar"><Trash2 size={14} /></button>}
    </div> }) : !form && <p className="meta">Aún no hay emisoras. Crea una con "Nueva emisora"; aparecerá en la web cuando le actives el mes pagado.</p>}
  </Section>
}

// ---------- listas editables ----------
function ListEditor({ rows, onChange, cols, add }) {
  const set = (i, j, v) => onChange(rows.map((r, k) => k === i ? r.map((x, m) => m === j ? v : x) : r))
  const move = (i, d) => { const a = [...rows], j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return <div className="adm-listed">
    {rows.map((r, i) => <div key={i} className="adm-listed-row">
      {cols.map((c, j) => <input key={j} className="field" style={{ flex: c.flex || 1 }} type={c.type || 'text'} step="any" placeholder={c.ph} value={r[j] ?? ''} onChange={e => set(i, j, e.target.value)} aria-label={c.ph} />)}
      <button className="btn ghost sm" onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp size={13} /></button>
      <button className="btn ghost sm" onClick={() => move(i, 1)} aria-label="Bajar"><ArrowDown size={13} /></button>
      <button className="btn ghost sm" onClick={() => onChange(rows.filter((_, k) => k !== i))} aria-label="Quitar"><Trash2 size={13} /></button>
    </div>)}
    <button className="btn ghost sm" onClick={() => onChange([...rows, add()])}><Plus size={13} /> Agregar</button>
  </div>
}
function PlanEditor({ label, value, onChange }) {
  const v = value || { name: '', days: 30, perks: [] }
  return <div className="adm-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <h3 className="adm-h3" style={{ margin: 0 }}>{label}</h3>
    <Field label="Nombre del plan"><input className="field" value={v.name} onChange={e => onChange({ ...v, name: e.target.value })} maxLength={40} /></Field>
    <Field label="Días que dura cada pago"><input className="field" type="number" min="1" max="366" value={v.days} onChange={e => onChange({ ...v, days: e.target.value })} /></Field>
    <span className="meta">Beneficios que se muestran al comprar</span>
    <ListEditor rows={(v.perks || []).map(x => [x])} onChange={rows => onChange({ ...v, perks: rows.map(r => r[0]) })} cols={[{ ph: 'Beneficio' }]} add={() => ['']} />
  </div>
}
function ContentTab({ draft, setDraft, save }) {
  const set = k => v => setDraft({ ...draft, [k]: v })
  return <Section title="Contenido" sub="Categorías, tipos de negocio, regiones del mapa, planes y páginas legales."
    actions={<button className="btn" onClick={() => save({ categories: draft.categories, bizTypes: draft.bizTypes, regions: (draft.regions || []).map(r => [r[0], +r[1], +r[2], +r[3]]), planRadio: { ...draft.planRadio, days: +draft.planRadio?.days }, planBiz: { ...draft.planBiz, days: +draft.planBiz?.days }, planEvento: { ...draft.planEvento, days: +draft.planEvento?.days }, legalTerms: draft.legalTerms, legalPrivacy: draft.legalPrivacy })}>Guardar todo</button>}>
    <h3 className="adm-h3">Categorías de publicaciones</h3>
    <p className="meta" style={{ display: 'block' }}>El código es interno. Si cambias el código de una categoría que ya existe, sus publicaciones viejas quedan sin categoría: cambia solo el nombre visible.</p>
    <ListEditor rows={draft.categories || []} onChange={set('categories')} cols={[{ ph: 'código (eventos)', flex: .6 }, { ph: 'Nombre visible' }]} add={() => ['', '']} />
    <h3 className="adm-h3">Tipos de negocio</h3>
    <ListEditor rows={draft.bizTypes || []} onChange={set('bizTypes')} cols={[{ ph: 'código (cafe)', flex: .6 }, { ph: 'Nombre con emoji (Café)' }]} add={() => ['', '']} />
    <h3 className="adm-h3">Regiones del menú del mapa</h3>
    <p className="meta" style={{ display: 'block' }}>Latitud y longitud del centro (las ves en Google Maps con clic derecho) y el acercamiento: 2 = mundo, 5 = país, 11 = ciudad.</p>
    <ListEditor rows={draft.regions || []} onChange={set('regions')} cols={[{ ph: 'Nombre', flex: 1.4 }, { ph: 'Latitud', type: 'number' }, { ph: 'Longitud', type: 'number' }, { ph: 'Acercamiento', type: 'number', flex: .7 }]} add={() => ['', '', '', 5]} />
    <h3 className="adm-h3">Planes que se venden</h3>
    <div className="adm-grid"><PlanEditor label="Eventos" value={draft.planEvento} onChange={set('planEvento')} /><PlanEditor label="Negocios" value={draft.planBiz} onChange={set('planBiz')} /></div>
    <p className="meta" style={{ display: 'block' }}>Los precios están en Configuración.</p>
    <h3 className="adm-h3">Términos de uso</h3>
    <p className="meta" style={{ display: 'block' }}>Vacío = se usa el texto de ejemplo. Escribe ## al inicio de una línea para un subtítulo, deja una línea en blanco entre párrafos y usa {'{name}'} para el nombre de la web.</p>
    <textarea className="field" rows={10} value={draft.legalTerms || ''} onChange={e => setDraft({ ...draft, legalTerms: e.target.value })} />
    <h3 className="adm-h3">Política de privacidad</h3>
    <textarea className="field" rows={10} value={draft.legalPrivacy || ''} onChange={e => setDraft({ ...draft, legalPrivacy: e.target.value })} />
    <div className="row"><a className="btn ghost sm" href="/terminos" target="_blank" rel="noopener">Ver Términos</a><a className="btn ghost sm" href="/privacidad" target="_blank" rel="noopener">Ver Privacidad</a></div>
  </Section>
}
function SeoTab({ draft, setDraft, save, flash }) {
  const set = k => e => setDraft({ ...draft, [k]: e.target.value })
  const title = draft.seoTitle || (draft.name + ' · ' + draft.tagline), desc = draft.description || '', img = draft.ogImage || draft.logoDark
  return <Section title="SEO y redes sociales" sub="Cómo aparece tu web en Google y cuando alguien comparte el enlace en WhatsApp, Facebook, X o Instagram."
    actions={<button className="btn" onClick={() => save({ seoTitle: draft.seoTitle, description: draft.description, seoKeywords: draft.seoKeywords, ogImage: draft.ogImage, googleVerify: draft.googleVerify, indexable: draft.indexable !== false })}>Guardar SEO</button>}>
    <Field label="Título en Google y en la pestaña del navegador" hint={`Máximo 60 letras. Vacío = "${draft.name} · ${draft.tagline}". Llevas ${(draft.seoTitle || '').length}.`}><input className="field" value={draft.seoTitle || ''} onChange={set('seoTitle')} maxLength={70} placeholder={draft.name + ' · ' + draft.tagline} /></Field>
    <Field label="Descripción" hint={`Sale debajo del título en Google y al compartir. Ideal 120 a 160 letras. Llevas ${desc.length}.`}><textarea className="field" rows={3} value={desc} onChange={set('description')} maxLength={300} /></Field>
    <Field label="Palabras clave" hint="Separadas por comas."><input className="field" value={draft.seoKeywords || ''} onChange={set('seoKeywords')} maxLength={300} /></Field>
    <ImagePick label="Imagen al compartir el enlace" hint="1200 × 630 px, JPG o PNG. Se ve en WhatsApp, Facebook, X y LinkedIn. Sin imagen se usa tu logo." value={draft.ogImage} onChange={v => setDraft({ ...draft, ogImage: v })} dark flash={flash} />
    {draft.ogImage && <button className="link" onClick={() => setDraft({ ...draft, ogImage: '' })}>Quitar imagen</button>}
    <h3 className="adm-h3">Vista previa al compartir</h3>
    <div className="og-prev">{img ? <img src={img} alt="" /> : <div className="og-noimg">Sin imagen</div>}<div className="og-txt"><small>{location.host}</small><b>{title}</b><span>{desc.slice(0, 140)}</span></div></div>
    <h3 className="adm-h3">Vista previa en Google</h3>
    <div className="g-prev"><small>{location.origin}</small><b>{title}</b><span>{desc.slice(0, 160)}</span></div>
    <Field label="Código de verificación de Google Search Console" hint='Pega solo el código del meta "google-site-verification" (lo que va dentro de content="…").'><input className="field" value={draft.googleVerify || ''} onChange={set('googleVerify')} /></Field>
    <label className="toggle"><span>Permitir que Google muestre la web en sus resultados</span><input type="checkbox" checked={draft.indexable !== false} onChange={e => setDraft({ ...draft, indexable: e.target.checked })} /><i /></label>
    <p className="meta" style={{ display: 'block' }}>Automático: <a href="/sitemap.xml" target="_blank" rel="noopener">sitemap.xml</a> con todas las publicaciones (envíalo en Search Console) y <a href="/robots.txt" target="_blank" rel="noopener">robots.txt</a>. Cada publicación compartida muestra su propia foto, título y texto.</p>
  </Section>
}
function AccountTab({ flash }) {
  const [current, setCurrent] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false)
  const go = async e => { e.preventDefault(); setBusy(true); try { await req('PUT', '/api/me/account', { current, email, password }); flash('Cuenta actualizada'); setCurrent(''); setPassword('') } catch (x) { flash(x.message) } finally { setBusy(false) } }
  return <Section title="Mi cuenta" sub="Cambia tu correo de acceso o tu contraseña. Tu nombre y foto se cambian en Editar perfil.">
    <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <Field label="Nuevo correo (opcional)"><input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></Field>
      <Field label="Nueva contraseña (opcional)" hint="Mínimo 8 caracteres."><input className="field" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></Field>
      <Field label="Tu contraseña actual (obligatoria)"><input className="field" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required /></Field>
      <button className="btn" disabled={busy || (!email && !password)}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </form>
  </Section>
}

// ---------- ventanas al mundo y reto del día ----------
function CamsTab({ flash, draft, setDraft, save }) {
  const [list, setList] = useState([]), [f, setF] = useState(null), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null)
  const load = () => req('GET', '/api/admin/cams').then(d => setList(d.cams)).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const submit = async e => { e.preventDefault(); setBusy(true)
    try { const pl = f.place || {}; await req(f.id ? 'PUT' : 'POST', '/api/admin/cams' + (f.id ? '/' + f.id : ''), { url: f.url, title: f.title, city: pl.city, country: pl.country, lat: pl.lat, lon: pl.lon, active: f.active !== false }); flash('Ventana guardada'); setF(null); load() } catch (x) { flash(x.message) } finally { setBusy(false) } }
  const del = async id => { try { await req('DELETE', '/api/admin/cams/' + id); setConfirm(null); load() } catch (x) { flash(x.message) } }
  const urlOf = c => c.kind === 'channel' ? 'https://www.youtube.com/channel/' + c.yt : 'https://www.youtube.com/watch?v=' + c.yt
  return <Section title="Ventanas al mundo y reto del día" sub="Cámaras en vivo de YouTube puestas en el mapa, y el reto diario de fotos.">
    <h3 className="adm-h3">Reto del día</h3>
    <label className="toggle"><span>Mostrar el reto del día</span><input type="checkbox" checked={draft.dailyOn !== false} onChange={e => setDraft({ ...draft, dailyOn: e.target.checked })} /><i /></label>
    <Field label="Título del reto"><input className="field" value={draft.dailyTitle || ''} onChange={e => setDraft({ ...draft, dailyTitle: e.target.value })} maxLength={80} /></Field>
    <Field label="Texto del reto"><input className="field" value={draft.dailyText || ''} onChange={e => setDraft({ ...draft, dailyText: e.target.value })} maxLength={200} /></Field>
    <Field label="Zona horaria del día" hint="El reto cambia a la medianoche de esta zona. Ejemplo: America/Bogota, America/Mexico_City, Europe/Madrid."><input className="field" value={draft.dailyTZ || ''} onChange={e => setDraft({ ...draft, dailyTZ: e.target.value })} /></Field>
    <button className="btn" onClick={() => save({ dailyOn: draft.dailyOn !== false, dailyTitle: draft.dailyTitle, dailyText: draft.dailyText, dailyTZ: draft.dailyTZ })}>Guardar reto</button>
    <h3 className="adm-h3" style={{ marginTop: 22 }}>Ventanas al mundo</h3>
    <p className="meta" style={{ display: 'block' }}>Busca en YouTube "live cam" + la ciudad (por ejemplo "Cartagena live cam"), abre una transmisión <b>EN VIVO</b> y copia su enlace. Si pegas el enlace de un <b>canal</b> (youtube.com/channel/UC…), se mostrará siempre su transmisión en vivo actual, aunque la reinicien.</p>
    {!f && <button className="btn" onClick={() => setF({ url: '', title: '', place: null })}><Plus size={14} /> Agregar ventana</button>}
    {f && <form className="adm-card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '10px 0' }}>
      <Field label="Enlace de YouTube"><input className="field" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=… o https://www.youtube.com/channel/UC…" required /></Field>
      <Field label="Nombre de la ventana"><input className="field" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={80} placeholder="Playa de Bocagrande" required /></Field>
      <div className="adm-field"><span>Lugar en el mapa (busca el sitio exacto)</span><PlacePicker value={f.place} onChange={pl => setF(x => ({ ...x, place: pl }))} id="cam-place" placeholder="Bocagrande, Cartagena" /></div>
      <label className="toggle"><span>Visible en la web</span><input type="checkbox" checked={f.active !== false} onChange={e => setF({ ...f, active: e.target.checked })} /><i /></label>
      <div className="row"><button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" className="btn ghost" onClick={() => setF(null)}>Cancelar</button></div>
    </form>}
    <div className="adm-list">{list.map(c => <div key={c.id} className="adm-row">
      <img src={`https://i.ytimg.com/vi/${c.kind === 'video' ? c.yt : ''}/mqdefault.jpg`} alt="" style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 4, background: '#1a2230', flex: 'none', visibility: c.kind === 'video' ? 'visible' : 'hidden' }} />
      <div className="grow"><b>{c.title}</b><div className="meta">{[c.city, c.country].filter(Boolean).join(', ')} · {c.kind === 'channel' ? 'canal' : 'video'}{c.active ? '' : ' · oculta'}</div></div>
      <a className="btn ghost sm" href={urlOf(c)} target="_blank" rel="noopener noreferrer">Probar</a>
      <button className="btn ghost sm" onClick={() => setF({ id: c.id, url: urlOf(c), title: c.title, active: !!c.active, place: { city: c.city, country: c.country, lat: c.lat, lon: c.lon } })}>Editar</button>
      {confirm === c.id ? <><button className="btn sm danger" onClick={() => del(c.id)}>Sí, borrar</button><button className="btn ghost sm" onClick={() => setConfirm(null)}>No</button></> : <button className="btn ghost sm" onClick={() => setConfirm(c.id)} aria-label="Borrar"><Trash2 size={14} /></button>}
    </div>)}</div>
    {!list.length && !f && <p className="meta" style={{ display: 'block' }}>Aún no hay ventanas. Agrega la primera.</p>}
  </Section>
}

function TypeTab({ draft, setDraft, save }) {
  const sz = draft.sizes || {}, tc = draft.textColors || {}, wt = draft.weights || {}
  const setW = (k, v) => { const w = { ...wt }; if (v) w[k] = +v; else delete w[k]; const n = { ...draft, weights: w }; setDraft(n); applyTheme(n) }
  const set = (k, v, col) => { const n = col ? { ...draft, textColors: { ...tc, [k]: v } } : { ...draft, sizes: { ...sz, [k]: v } }; if (!col && v === '') delete n.sizes[k]; setDraft(n); applyTheme(n) }
  return <Section title="Tamaños y colores de texto" sub="Ajusta el tamaño (en píxeles) y el color de cada texto. Se ve en vivo; pulsa Guardar para aplicarlo a todos. Vacío = tamaño original."
    actions={<div className="row"><button className="btn ghost" onClick={() => { const n = { ...draft, sizes: {}, textColors: {}, weights: {} }; setDraft(n); applyTheme(n) }}>Restablecer</button><button className="btn" onClick={() => save({ sizes: draft.sizes || {}, textColors: draft.textColors || {}, weights: draft.weights || {} })}>Guardar</button></div>}>
    <div className="adm-list">{Object.entries(TEXT_STYLE).map(([k, d]) => <div key={k} className="adm-row">
      <span className="grow"><b>{d.label}</b><div className="meta">Original: {d.def}px</div></span>
      <input className="field" type="number" min="8" max="80" placeholder={d.def} value={sz[k] ?? ''} onChange={e => set(k, e.target.value === '' ? '' : +e.target.value)} style={{ width: 80 }} aria-label={'Tamaño ' + d.label} />
      <select className="field" value={wt[k] || ''} onChange={e => setW(k, e.target.value)} style={{ width: 130 }} aria-label={'Grosor ' + d.label}><option value="">Grosor original</option><option value="300">Fina</option><option value="400">Normal</option><option value="500">Media</option><option value="600">Semi negrilla</option><option value="700">Negrilla</option><option value="800">Extra negrilla</option></select>
      <input type="color" value={tc[k] || '#ffffff'} onChange={e => set(k, e.target.value, true)} aria-label={'Color ' + d.label} />
      {tc[k] && <button className="link" onClick={() => { const n = { ...tc }; delete n[k]; const x = { ...draft, textColors: n }; setDraft(x); applyTheme(x) }}>Quitar color</button>}
    </div>)}</div>
  </Section>
}

// Radio en los partidos: a cada liga o equipo se le asigna una emisora; el botón «Escuchar» aparece solo cuando ese partido está en vivo.
function RadioRules({ draft, setDraft }) {
  const [sts, setSts] = useState([])
  useEffect(() => { fetch('/api/stations').then(r => r.json()).then(d => setSts(d.stations || [])).catch(() => {}) }, [])
  const rules = draft.radioRules || [], put = list => setDraft({ ...draft, radioRules: list })
  const edit = (i, p) => put(rules.map((r, k) => k === i ? { ...r, ...p } : r))
  return <Field label="Radio en los partidos en vivo" hint="Elige qué emisora narra cada liga o equipo. En la web el botón «Escuchar» sale solo mientras el partido está en vivo. El nombre se compara sin tildes ni mayúsculas: para una liga basta una parte («Nations»); para un equipo, el nombre como sale en el partido. Si hay regla de equipo y de liga, gana la del equipo. Usa solo emisoras que transmitan ese partido de verdad.">
    {rules.map((r, i) => <div key={i} className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
      <select className="field" style={{ width: 110 }} value={r.t} onChange={e => edit(i, { t: e.target.value })}><option value="liga">Liga</option><option value="equipo">Equipo</option></select>
      <input className="field" style={{ flex: '1 1 160px' }} value={r.q} maxLength={60} placeholder={r.t === 'equipo' ? 'Atlético Nacional' : 'Liga BetPlay'} onChange={e => edit(i, { q: e.target.value })} />
      <select className="field" style={{ flex: '1 1 160px' }} value={r.s || ''} onChange={e => edit(i, { s: +e.target.value })}><option value="">Elige emisora…</option>{sts.map(s => <option key={s.id} value={s.id}>{s.name}{s.city ? ' · ' + s.city : ''}</option>)}</select>
      <button type="button" className="btn ghost sm" onClick={() => put(rules.filter((_, k) => k !== i))}>Quitar</button>
    </div>)}
    <button type="button" className="btn ghost sm" onClick={() => put([...rules, { t: 'liga', q: '', s: 0 }])}>+ Agregar regla</button>
    <label className="toggle" style={{ marginTop: 10 }}><span>Si no hay regla, usar una emisora deportiva del país del estadio</span><input type="checkbox" checked={draft.radioAuto !== false} onChange={e => setDraft({ ...draft, radioAuto: e.target.checked })} /><i /></label>
    {!sts.length && <div className="meta" style={{ marginTop: 6 }}>Aún no hay emisoras activas. Agrégalas en la sección Emisoras.</div>}
  </Field>
}

function SportsTab({ flash, draft, setDraft, save }) {
  const [st, setSt] = useState(null), [busy, setBusy] = useState(false)
  const load = () => req('GET', '/api/admin/sports').then(setSt).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const sync = async () => { setBusy(true); try { const r = await req('POST', '/api/admin/sports/sync'); flash(r.msg); load() } catch (e) { flash(e.message) } finally { setBusy(false) } }
  const teams = (draft.sportsTeams || []).join('\n'), teams2 = (draft.sportsTeams2 || []).join('\n')
  const fmt = t => t ? new Date(t).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
  return <Section title="Partidos automáticos" sub="La web trae sola los partidos de los equipos importantes y los publica en el estadio: hora, EN VIVO con marcador y resultado final. Se quitan del mapa al día siguiente."
    actions={<button className="btn" onClick={() => save({ sportsOn: !!draft.sportsOn, sportsProvider: draft.sportsProvider || 'apifootball', sportsTeams: teams.split('\n'), sportsTeams2: teams2.split('\n'), radioRules: draft.radioRules || [], radioAuto: draft.radioAuto !== false, sportsLeagues: draft.sportsLeagues || [], sportsLeagues2: draft.sportsLeagues2 || [], sportsDailyMax: draft.sportsDailyMax, sportsLiveMin: draft.sportsLiveMin, sportsDetailMin: draft.sportsDetailMin })}>Guardar</button>}>
    {st && !st.hasKey && <div className="banner">Falta la llave: pégala en <b>Pagos y Google → {draft.sportsProvider === 'sportapi' ? 'SportAPI' : 'API-Football'}</b>.</div>}
    <Field label="De dónde salen los partidos" hint="API-Football: 100 consultas al día gratis (la que ya usas). SportAPI: más consultas gratis al día; los nombres de los equipos pueden escribirse distinto (prueba y ajusta la lista). Cambiar de fuente no borra nada; pon también el máximo de consultas de esa fuente."><select className="field" value={draft.sportsProvider || 'apifootball'} onChange={e => setDraft({ ...draft, sportsProvider: e.target.value })} style={{ maxWidth: 280 }}><option value="apifootball">API-Football</option><option value="sportapi">SportAPI</option></select></Field>
    <label className="toggle"><span>Publicar partidos automáticamente</span><input type="checkbox" checked={!!draft.sportsOn} onChange={e => setDraft({ ...draft, sportsOn: e.target.checked })} /><i /></label>
    <LeaguesBox draft={draft} setDraft={setDraft} flash={flash} />
    <RadioRules draft={draft} setDraft={setDraft} />
    <Field label="Equipos importantes (uno por línea)" hint="Solo se publican los partidos donde juega alguno de estos equipos o selecciones. Escríbelos como los nombra API-Football (en inglés para selecciones: Brazil, Spain, Germany…)."><textarea className="field" rows={12} value={teams} onChange={e => setDraft({ ...draft, sportsTeams: e.target.value.split('\n') })} /></Field>
    <Field label="Equipos secundarios (uno por línea) — solo marcador y goles" hint="Para tener más equipos sin gastar el cupo: sus partidos muestran marcador, minuto y goles con el goleador, pero NO revisan tarjetas ni el resto de jugadas. Gastan unas 3 veces menos consultas que los importantes."><textarea className="field" rows={8} value={teams2} onChange={e => setDraft({ ...draft, sportsTeams2: e.target.value.split('\n') })} /></Field>
    <Field label="Actualizar marcadores cada (minutos)" hint="Mientras se juega un partido tuyo, cada actualización gasta 1 consulta, sin importar cuántos partidos haya a la vez. Los goles, tarjetas y jugadas vienen en esa misma consulta: no gastan más. 10 minutos = 6 por hora. 5 minutos = más rápido pero gasta el doble. Reiniciar el servidor ya no gasta consultas."><input className="field" type="number" min="1" max="60" value={draft.sportsLiveMin ?? 10} onChange={e => setDraft({ ...draft, sportsLiveMin: +e.target.value })} style={{ maxWidth: 160 }} /></Field>
    <Field label="Tarjetas y jugadas: revisar cada (minutos) — solo SportAPI" hint="Los goles se anuncian al instante. Las tarjetas y demás jugadas se revisan cada tanto por cada partido en vivo. 5 minutos es un buen equilibrio; con 10 gasta la mitad."><input className="field" type="number" min="2" max="60" value={draft.sportsDetailMin ?? 5} onChange={e => setDraft({ ...draft, sportsDetailMin: +e.target.value })} style={{ maxWidth: 160 }} /></Field>
    <Field label="Máximo de consultas al día" hint="Pon un poco menos que el límite de tu plan para tener margen. API-Football gratis: 100 al día (déjalo en 90). SportAPI gratis: el límite aparece en su panel (déjalo unas 100 por debajo)."><input className="field" type="number" min="10" value={draft.sportsDailyMax ?? 90} onChange={e => setDraft({ ...draft, sportsDailyMax: +e.target.value })} style={{ maxWidth: 160 }} /></Field>
    <h3 className="adm-h3">Estado</h3>
    {st ? <><p className="meta" style={{ display: 'block' }}>Consultas usadas hoy: <b>{st.usedToday} de {st.max}</b> · Última búsqueda de partidos: {fmt(st.lastSync)} · Última actualización de marcadores: {fmt(st.lastLive)}{st.plan && <><br /><b>Plan del mes:</b> llevas {st.plan.used}{st.plan.limit ? ' de ' + st.plan.limit : ''} consultas{st.plan.remaining != null ? ` · quedan ${st.plan.remaining} (unas ${st.plan.perDay} por día hasta fin de mes)` : ''}{st.plan.projected != null && st.plan.limit ? <> · a este ritmo terminarías el mes en ~{st.plan.projected} {st.plan.projected <= st.plan.limit ? <b style={{ color: '#5ad19a' }}>(alcanza)</b> : <b style={{ color: '#ff8a8d' }}>(NO alcanza: se activará el ahorro)</b>}</> : ''}</>}{st.pace && st.provider === 'sportapi' && <><br />Ritmo: {st.pace.listX > 1 || st.pace.detailX !== 1 ? <b style={{ color: '#ffb86b' }}>ahorrando cupo ({st.pace.detailX === 0 ? 'solo goles y marcadores' : 'más espaciado'})</b> : 'normal'}{st.month ? ` · cupo del mes: quedan ${st.month.remaining} de ${st.month.limit}` : ''}</>}{st.lastError && <><br /><span style={{ color: '#ff8a8d' }}>Último error: {st.lastError}</span></>}</p>
      <button className="btn ghost" disabled={busy} onClick={sync}>{busy ? 'Buscando…' : 'Buscar partidos ahora'}</button>
      <div className="adm-list" style={{ marginTop: 10 }}>{st.fixtures.length ? st.fixtures.map(f => <div key={f.id} className="adm-row"><span className="grow"><b>{f.home} {f.goals?.home ?? ''}{f.goals?.home != null ? ' - ' : ' vs '}{f.goals?.away ?? ''} {f.away}</b><div className="meta">{f.league} · {f.venue || 'estadio'} · {fmt(f.kickoff)}</div></span><span className="tag">{f.status}</span></div>) : <p className="meta" style={{ display: 'block', padding: 12 }}>Aún no hay partidos publicados.</p>}</div></> : <p className="meta">Cargando…</p>}
    <VenuesBox flash={flash} />
  </Section>
}

// Ligas: la lista la trae SportAPI (no se escribe ningún nombre). Principal = marcador, goles y tarjetas. Secundaria = marcador y goles (gasta menos cupo).
function LeaguesBox({ draft, setDraft, flash }) {
  const [list, setList] = useState(null), [q, setQ] = useState(''), [busy, setBusy] = useState(false)
  const load = (refresh) => { setBusy(true); req('GET', '/api/admin/sports/leagues' + (refresh ? '?refresh=1' : '')).then(r => setList(r.leagues)).catch(e => flash(e.message)).finally(() => setBusy(false)) }
  const main = new Set((draft.sportsLeagues || []).map(Number)), sec = new Set((draft.sportsLeagues2 || []).map(Number))
  const tier = id => main.has(id) ? '1' : sec.has(id) ? '2' : '0'
  const set = (id, t) => { const a = (draft.sportsLeagues || []).map(Number).filter(x => x !== id), b = (draft.sportsLeagues2 || []).map(Number).filter(x => x !== id); if (t === '1') a.push(id); if (t === '2') b.push(id); setDraft({ ...draft, sportsLeagues: a, sportsLeagues2: b }) }
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // atajo: marca ligas conocidas por su nombre; lo que se marcó se ve en la lista y se puede cambiar
  const recomendadas = () => {
    if (!list) return
    // nombres EXACTOS de las ligas que se quieren (con la liga y el país de SportAPI); todo lo demás queda sin marcar
    const M = [/^colombia colombian primera a$/, /conmebol libertadores$/, /^europe uefa champions league$/, /^england premier league$/, /^spain spanish la liga$/, /^world fifa world cup$/, /^south america fifa world cup qualifying - south america$/, /^europe uefa nations league$/]
    const S2 = [/^italy italian serie a$/, /^germany german bundesliga$/, /^france french ligue 1$/, /^usa us major league soccer$/, /^mexico liga mx$/, /conmebol sudamericana$/, /^brazil brazilian serie a$/, /^n\/c america concacaf nations league$/, /^europe fifa world cup qualifying - european$/, /^n\/c america fifa world cup qualifying - north\/central america$/]
    const a = new Set(main), b = new Set(sec)
    for (const l of list) { const t = norm(l.country + ' ' + l.name); if (/women|femen|youth|\bu\d\d\b|reserve/.test(t)) continue; if (M.some(r => r.test(t))) { a.add(l.id); b.delete(l.id) } else if (S2.some(r => r.test(t)) && !a.has(l.id)) b.add(l.id) }
    setDraft({ ...draft, sportsLeagues: [...a], sportsLeagues2: [...b] }); flash('Ligas recomendadas marcadas. Revisa la lista y pulsa Guardar.')
  }
  const selected = (list || []).filter(l => main.has(l.id) || sec.has(l.id)), nq = norm(q)
  const found = nq.length >= 2 ? (list || []).filter(l => !(main.has(l.id) || sec.has(l.id)) && norm(l.country + ' ' + l.name).includes(nq)).slice(0, 40) : []
  const row = l => <div key={l.id} className="adm-row" style={{ gap: 8 }}><span className="grow"><b>{l.name}</b><div className="meta">{l.country}</div></span><select className="field" style={{ width: 150 }} value={tier(l.id)} onChange={e => set(l.id, e.target.value)}><option value="0">No publicar</option><option value="1">Principal</option><option value="2">Secundaria</option></select></div>
  return <>
    <h3 className="adm-h3">Ligas (recomendado: sin escribir nombres de equipos)</h3>
    <p className="meta" style={{ display: 'block' }}>Elige las ligas y la web publica TODOS sus partidos. <b>Principal</b>: marcador, goles y tarjetas. <b>Secundaria</b>: marcador y goles (gasta menos cupo). La lista de equipos de abajo es opcional y se suma a las ligas.</p>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
      <button className="btn ghost sm" disabled={busy} onClick={() => load(false)}>{list ? 'Ligas cargadas (' + list.length + ')' : 'Cargar ligas de SportAPI'}</button>
      {list && <button className="btn ghost sm" disabled={busy} onClick={() => load(true)}>Actualizar la lista</button>}
      {list && <button className="btn sm" onClick={recomendadas}>Marcar ligas recomendadas</button>}
    </div>
    {list && <><input className="field" placeholder="Buscar liga o país (ej.: Colombia, Premier, Libertadores)" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      <div className="adm-list">{selected.length ? selected.map(row) : <div className="meta" style={{ display: 'block' }}>Aún no hay ligas marcadas.</div>}</div>
      {found.length > 0 && <><p className="meta" style={{ display: 'block', marginTop: 8 }}>Resultados de la búsqueda:</p><div className="adm-list">{found.map(row)}</div></>}</>}
  </>
}

// Ubicación de los estadios: cada pin debe caer en el estadio real. Si alguno quedó mal, se corrige aquí pegando las coordenadas de Google Maps.
function VenuesBox({ flash }) {
  const [vs, setVs] = useState(null), [txt, setTxt] = useState({}), [busy, setBusy] = useState('')
  const load = () => req('GET', '/api/admin/sports/venues').then(r => setVs(r.venues)).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const how = h => ({ wikidata: 'Wikidata (oficial)', mapa: 'Mapa', ciudad: 'Ciudad: aproximada', manual: 'Corregido a mano' }[h] || 'Antigua')
  const save = async v => { const t = String(txt[v.key] ?? `${v.lat}, ${v.lon}`).split(/[,;\s]+/).filter(Boolean); setBusy(v.key); try { const r = await req('PUT', '/api/admin/sports/venues', { key: v.key, lat: t[0], lon: t[1] }); flash(`Guardado${r.moved ? ' · ' + r.moved + ' partido(s) movido(s)' : ''}`); setTxt(x => { const n = { ...x }; delete n[v.key]; return n }); load() } catch (e) { flash(e.message) } finally { setBusy('') } }
  const again = async v => { setBusy(v.key); try { const r = await req('POST', '/api/admin/sports/venues/research', { key: v.key }); flash('Buscado de nuevo: ' + how(r.how)); setTxt(x => { const n = { ...x }; delete n[v.key]; return n }); load() } catch (e) { flash(e.message) } finally { setBusy('') } }
  return <>
    <h3 className="adm-h3">Ubicación de los estadios</h3>
    <p className="meta" style={{ display: 'block' }}>Cada partido se pone en su estadio. Los de «Ciudad: aproximada» no se encontraron y salen primero: abre el estadio en Google Maps, clic derecho sobre él, copia las coordenadas, pégalas y pulsa Guardar.</p>
    <div className="adm-list">{vs && vs.length ? vs.map(v => <div key={v.key} className="adm-row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <span className="grow"><b>{v.name || v.city || 'Estadio'}</b><div className="meta">{[v.city, v.country].filter(Boolean).join(', ')} · <span style={v.how === 'ciudad' || !v.how ? { color: '#ffb86b' } : undefined}>{how(v.how)}</span> · {v.matches} partido(s)</div></span>
      <input className="field" style={{ width: 190 }} value={txt[v.key] ?? `${v.lat}, ${v.lon}`} onChange={e => setTxt({ ...txt, [v.key]: e.target.value })} aria-label="Coordenadas" />
      <a className="btn ghost sm" href={`https://www.google.com/maps?q=${v.lat},${v.lon}`} target="_blank" rel="noreferrer">Ver en el mapa</a>
      <button className="btn sm" disabled={busy === v.key} onClick={() => save(v)}>Guardar</button>
      <button className="btn ghost sm" disabled={busy === v.key} onClick={() => again(v)}>Buscar de nuevo</button>
    </div>) : <div className="meta" style={{ display: 'block' }}>{vs ? 'Todavía no hay estadios: aparecen al buscar partidos.' : 'Cargando…'}</div>}</div>
  </>
}

// vista 3D del mapa: luz, alturas de los edificios, estadios y relieve. Todo empieza APAGADO (el mapa queda como estaba); se enciende de a uno y se ve al instante.
function Map3DTab({ flash, draft, setDraft, save }) {
  const [st, setSt] = useState(null)
  const load = () => req('GET', '/api/admin/stadiums').then(setSt).catch(() => {})
  useEffect(() => { load() }, [])  
  useEffect(() => { if (!st?.running) return; const t = setInterval(load, 4000); return () => clearInterval(t) }, [st?.running])  
  const sync = async () => { try { setSt(await req('POST', '/api/admin/stadiums/sync')); flash('Buscando los contornos de los estadios…') } catch (e) { flash(e.message) } }
  const tg = (k, label, hint) => <label className="toggle" style={{ display: 'block' }}><span style={{ display: 'flex', justifyContent: 'space-between' }}><b>{label}</b><input type="checkbox" checked={draft[k] === true} onChange={e => setDraft({ ...draft, [k]: e.target.checked })} /></span><small className="meta" style={{ display: 'block' }}>{hint}</small></label>
  const rg = (k, label, lo, hi, def, unit) => <Field label={label + ': ' + (draft[k] ?? def) + unit}><input type="range" min={lo} max={hi} step="5" value={draft[k] ?? def} onChange={e => setDraft({ ...draft, [k]: +e.target.value })} /></Field>
  return <Section title="Mapa 3D" sub="Cómo se ve la vista 3D (edificios, estadios y relieve). Todo está apagado al empezar: el mapa se ve igual que siempre. Enciende una opción, pulsa Guardar y mira el mapa; si no te gusta, apágala. Para ver los cambios, recarga la web (Ctrl+F5)."
    actions={<button className="btn" onClick={() => save({ map3dLight: draft.map3dLight === true, map3dLightK: draft.map3dLightK ?? 60, map3dVariety: draft.map3dVariety === true, map3dHeightK: draft.map3dHeightK ?? 100, map3dStadiums: draft.map3dStadiums === true, map3dTerrain: draft.map3dTerrain === true })}>Guardar</button>}>
    {tg('map3dLight', 'Luz y sombreado', 'Una luz con dirección: cada cara del edificio tiene un tono distinto y los edificios se ven con volumen.')}
    {draft.map3dLight === true && rg('map3dLightK', 'Intensidad de la luz', 30, 100, 60, ' %')}
    {tg('map3dVariety', 'Alturas con variedad', 'Los edificios sin dato de altura reciben una altura distinta (entre 7 y 24 m) en vez de 9 m para todos. No son alturas reales, pero se ven más naturales.')}
    {rg('map3dHeightK', 'Altura de los edificios (100 % = como está)', 50, 300, 100, ' %')}
    {tg('map3dStadiums', 'Estadios con su forma y altura', 'Cada estadio con partidos se dibuja como un tazón con su altura real o estimada (30 a 60 m), en vez de un anillo bajo.')}
    {draft.map3dStadiums === true && <div className="row" style={{ alignItems: 'center', gap: 10, margin: '4px 0 10px' }}><button type="button" className="btn ghost sm" disabled={!!st?.running} onClick={sync}>{st?.running ? 'Buscando…' : 'Buscar estadios ahora'}</button>
      <span className="meta">{st ? st.found + ' estadios con contorno · ' + st.pending + ' por buscar' + (st.lastError ? ' · aviso: ' + st.lastError : '') : ''}</span></div>}
    {tg('map3dTerrain', 'Relieve (montañas y colinas)', 'Solo en computador y en la vista 3D. Descarga datos extra (cerca de 1 MB por zona nueva) y usa más gráficos. Se nota en ciudades con cerros; en ciudades planas casi no cambia.')}
  </Section>
}

// canales de televisión en vivo (YouTube): se pega un enlace y la web detecta sola el canal, su nombre, su logo y si se puede mostrar
function TvTab({ flash, draft, setDraft, save }) {
  const [list, setList] = useState(null), [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null)
  const load = () => req('GET', '/api/admin/tv').then(setList).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const add = async e => { e.preventDefault(); if (!url.trim()) return; setBusy(true); setRes(null); try { const r = await req('POST', '/api/admin/tv', { url: url.trim() }); setRes(r); setUrl(''); load(); flash('Canal agregado') } catch (x) { flash(x.message); setRes({ error: x.message }) } finally { setBusy(false) } }
  const set = (id, patch) => setList(l => l.map(c => c.id === id ? { ...c, ...patch } : c))
  const saveRow = async c => { try { await req('PUT', '/api/admin/tv/' + c.id, { name: c.name, country: c.country, active: c.active, ord: c.ord }); flash('Guardado'); load() } catch (x) { flash(x.message) } }
  const del = async c => { try { await req('DELETE', '/api/admin/tv/' + c.id); load() } catch (x) { flash(x.message) } }
  const recheck = async c => { try { const r = await req('POST', '/api/admin/tv/' + c.id + '/recheck'); set(c.id, { live: r.live, checked: r.checked }); flash(r.live === true ? c.name + ': en vivo' : r.live === false ? c.name + ': no disponible para mostrarse aquí' : c.name + ': no se pudo confirmar (se prueba igual al abrirlo)' + (r.error ? ' (' + r.error + ')' : '')) } catch (x) { flash(x.message) } }
  const move = async (c, d) => { const i = list.findIndex(x => x.id === c.id), o = list[i + d]; if (!o) return; try { await req('PUT', '/api/admin/tv/' + c.id, { ord: o.ord }); await req('PUT', '/api/admin/tv/' + o.id, { ord: c.ord }); load() } catch (x) { flash(x.message) } }
  return <Section title="Canales de TV" sub="Canales de televisión y transmisiones en vivo de YouTube, Twitch y Kick. Pega el enlace (de YouTube: un video en vivo, la página del canal o su @usuario; de Twitch: twitch.tv/nombre; de Kick: kick.com/nombre) y la web detecta sola la plataforma, el canal, su nombre y su logo. De YouTube guarda el CANAL, así siempre muestra lo que esté en vivo."
    actions={<button className="btn" onClick={() => save({ tvOn: draft.tvOn !== false })}>Guardar</button>}>
    <label className="toggle"><span>Mostrar «Canales» en el menú</span><input type="checkbox" checked={draft.tvOn !== false} onChange={e => setDraft({ ...draft, tvOn: e.target.checked })} /><i /></label>
    <form className="row" onSubmit={add} style={{ margin: '12px 0' }}><input className="field grow" value={url} onChange={e => setUrl(e.target.value)} placeholder="youtube.com/@canal  ·  twitch.tv/nombre  ·  kick.com/nombre" aria-label="Enlace de YouTube" /><button className="btn" disabled={busy || !url.trim()}>{busy ? 'Detectando…' : 'Agregar'}</button></form>
    {res && !res.error && <div className="banner" style={{ background: 'color-mix(in srgb,#5ccfb4 18%,transparent)', color: 'inherit', display: 'block' }}>Agregado: <b>{res.name}</b>{res.country ? ' · ' + res.country : ' · escribe su país en la lista'}{res.channel ? ' · canal detectado' : ''}{res.warn?.length > 0 && <><br />{res.warn.join(' ')}</>}</div>}
    {res?.error && <div className="banner">{res.error}</div>}
    <h3 className="adm-h3">Lista ({list ? list.length : '…'})</h3>
    {list && !list.length && <p className="meta" style={{ display: 'block' }}>Aún no hay canales. Pega el primer enlace arriba.</p>}
    {(list || []).map((c, i) => <div key={c.id} className="row" style={{ alignItems: 'center', gap: 8, margin: '6px 0', flexWrap: 'wrap' }}>
      <span className="meta" style={{ minWidth: 54, fontWeight: 700 }}>{c.platform === 'twitch' ? 'Twitch' : c.platform === 'kick' ? 'Kick' : 'YouTube'}</span>{c.logo ? <img src={c.logo} alt="" width="34" height="34" style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <span className="meta">sin logo</span>}
      <input className="field" style={{ flex: '2 1 160px' }} value={c.name} onChange={e => set(c.id, { name: e.target.value })} aria-label="Nombre" />
      <input className="field" style={{ flex: '1 1 110px' }} value={c.country} onChange={e => set(c.id, { country: e.target.value })} placeholder="País" aria-label="País" />
      <label className="toggle" style={{ margin: 0 }}><span>Activo</span><input type="checkbox" checked={c.active} onChange={e => set(c.id, { active: e.target.checked })} /><i /></label>
      <button className="btn ghost sm" disabled={i === 0} onClick={() => move(c, -1)} aria-label="Subir"><ArrowUp size={14} /></button>
      <button className="btn ghost sm" disabled={i === list.length - 1} onClick={() => move(c, 1)} aria-label="Bajar"><ArrowDown size={14} /></button>
      <span className="meta" style={{ minWidth: 92 }}>{c.live === true ? 'En vivo' : c.live === false ? 'No disponible' : 'Sin confirmar'}</span><button className="btn ghost sm" onClick={() => recheck(c)}>Revisar</button>
      <button className="btn sm" onClick={() => saveRow(c)}>Guardar</button><button className="btn ghost sm danger" onClick={() => del(c)} aria-label="Borrar"><Trash2 size={14} /></button></div>)}
  </Section>
}

// más contenido automático: terremotos (USGS) y eventos del mundo (Wikidata)
function ExtrasTab({ flash, draft, setDraft, save }) {
  const [st, setSt] = useState(null), [busy, setBusy] = useState(false)
  const [wd, setWd] = useState(null)
  const load = () => { req('GET', '/api/admin/extras').then(setSt).catch(e => flash(e.message)); req('GET', '/api/admin/world-events').then(setWd).catch(() => {}) }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  useEffect(() => { if (!wd?.running) return; const t = setInterval(() => req('GET', '/api/admin/world-events').then(setWd).catch(() => {}), 3000); return () => clearInterval(t) }, [wd?.running])
  const wdSync = async () => { try { setWd(await req('POST', '/api/admin/world-events/sync')); flash('Buscando eventos del mundo…') } catch (e) { flash(e.message) } }
  const sync = async () => { setBusy(true); try { setSt(await req('POST', '/api/admin/extras/sync')); flash('Listo') } catch (e) { flash(e.message) } finally { setBusy(false) } }
  const fmt = t => t ? new Date(t).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
  const row = (k, n, label) => <p className="meta" style={{ display: 'block' }}><b>{label}:</b> {n || 0} en el mapa · última vez {fmt(st?.[k]?.at)}{st?.[k]?.err && <span style={{ color: '#ff8a8d' }}> · error: {st[k].err}</span>}</p>
  return <Section title="Más contenido" sub="Terremotos en vivo y eventos del mundo, publicados solos en el mapa con su foto. El servidor consulta pocas veces al día y se borran solos al pasar."
    actions={<div className="row"><button className="btn ghost" disabled={busy} onClick={sync}>{busy ? 'Buscando…' : 'Buscar ahora'}</button><button className="btn" onClick={() => save({ wdEventsOn: draft.wdEventsOn !== false, quakesOn: draft.quakesOn !== false, quakeHours: draft.quakeHours || 6 })}>Guardar</button></div>}>
    <label className="toggle"><span>Eventos del mundo (festivales, conciertos, exposiciones, congresos y deportes · Wikidata, sin llave)</span><input type="checkbox" checked={draft.wdEventsOn !== false} onChange={e => setDraft({ ...draft, wdEventsOn: e.target.checked })} /><i /></label>
    <label className="toggle"><span>Terremotos en vivo (magnitud 4,5 o más, sin llave)</span><input type="checkbox" checked={draft.quakesOn !== false} onChange={e => setDraft({ ...draft, quakesOn: e.target.checked })} /><i /></label>
    <div className="row" style={{ alignItems: 'center', margin: '6px 0 12px' }}><button className="btn ghost" disabled={!!wd?.running} onClick={wdSync}>{wd?.running ? 'Buscando eventos…' : 'Buscar eventos del mundo ahora'}</button></div>
    <Field label="Horas que un terremoto queda en el mapa" hint="Pasado ese tiempo el pin desaparece (1 a 24). Los terremotos nuevos aparecen solos cuando ocurren."><input type="number" min="1" max="24" className="field" value={draft.quakeHours ?? 6} onChange={e => setDraft({ ...draft, quakeHours: +e.target.value })} /></Field>
    <h3 className="adm-h3">Estado</h3>
    {st ? <>{row('quakes', st.counts?.quake, 'Terremotos')}{wd && <p className="meta" style={{ display: 'block' }}><b>Eventos del mundo:</b> {wd.total} guardados{wd.running ? ' · buscando…' : ' · última vez ' + fmt(wd.lastSync)}{Object.entries(wd.counts || {}).map(([k, n]) => ' · ' + k + ' ' + n)}{wd.lastError && <span style={{ color: '#ff8a8d' }}> · error: {wd.lastError}</span>}</p>}</> : <p className="meta">Cargando…</p>}
  </Section>
}

function FestTab({ flash, draft, setDraft, save }) {
  const [st, setSt] = useState(null), [busy, setBusy] = useState(false)
  const load = () => req('GET', '/api/admin/festivals').then(setSt).catch(e => flash(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intencional: se ejecuta solo al montar o con los valores indicados
  const sync = async () => { setBusy(true); try { const r = await req('POST', '/api/admin/festivals/sync'); flash(r.msg); load() } catch (e) { flash(e.message) } finally { setBusy(false) } }
  const fmt = t => t ? new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
  return <Section title="Fiestas y festivos" sub="Carnavales, ferias, festivales y fiestas populares de todo el mundo se publican solos 2 días antes y desaparecen al terminar. Los festivos nacionales de cada país se publican el mismo día."
    actions={<button className="btn" onClick={() => save({ festivalsOn: draft.festivalsOn !== false, holidaysOn: draft.holidaysOn !== false, festivalsCustom: draft.festivalsCustom || [] })}>Guardar</button>}>
    <label className="toggle"><span>Publicar fiestas, ferias y carnavales</span><input type="checkbox" checked={draft.festivalsOn !== false} onChange={e => setDraft({ ...draft, festivalsOn: e.target.checked })} /><i /></label>
    <label className="toggle"><span>Publicar festivos nacionales de cada país</span><input type="checkbox" checked={draft.holidaysOn !== false} onChange={e => setDraft({ ...draft, holidaysOn: e.target.checked })} /><i /></label>
    <h3 className="adm-h3">Tus fiestas (se suman a las {st?.builtIn || ''} que ya vienen incluidas)</h3>
    <p className="meta" style={{ display: 'block' }}>Fecha de inicio como MM-DD (por ejemplo 08-15 = 15 de agosto), cuántos días dura, y latitud/longitud del lugar (clic derecho en Google Maps).</p>
    <ListEditor rows={draft.festivalsCustom || []} onChange={v => setDraft({ ...draft, festivalsCustom: v })} cols={[{ ph: 'Nombre', flex: 1.4 }, { ph: 'Ciudad' }, { ph: 'Latitud', type: 'number', flex: .7 }, { ph: 'Longitud', type: 'number', flex: .7 }, { ph: 'MM-DD', flex: .5 }, { ph: 'Días', type: 'number', flex: .4 }, { ph: 'Descripción', flex: 1.6 }]} add={() => ['', '', '', '', '', 1, '']} />
    <h3 className="adm-h3">Estado</h3>
    {st ? <><p className="meta" style={{ display: 'block' }}>Última revisión: {st.lastSync ? new Date(st.lastSync).toLocaleString('es-CO') : '—'}{st.lastError && <><br /><span style={{ color: '#ff8a8d' }}>{st.lastError}</span></>}</p>
      <button className="btn ghost" disabled={busy} onClick={sync}>{busy ? 'Revisando…' : 'Revisar ahora'}</button>
      <h3 className="adm-h3">Publicadas ahora</h3>
      <div className="adm-list">{st.posted.length ? st.posted.map((p, i) => <div key={i} className="adm-row"><span className="grow"><b>{p.title}</b><div className="meta">{p.city}</div></span></div>) : <p className="meta" style={{ display: 'block', padding: 12 }}>Ninguna en este momento.</p>}</div>
      <h3 className="adm-h3">Próximas</h3>
      <div className="adm-list">{st.upcoming.map((p, i) => <div key={i} className="adm-row"><span className="grow"><b>{p.name}</b><div className="meta">{p.city}</div></span><span className="meta">{fmt(p.start)}</span></div>)}</div></> : <p className="meta">Cargando…</p>}
  </Section>
}

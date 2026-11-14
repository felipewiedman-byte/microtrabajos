import { useEffect, useState } from 'react'
import { X, LayoutDashboard, Palette, Type, Image as ImageIcon, FileText, Users, Flag, MessagesSquare, Settings, KeyRound, Trash2, Check, Search, Upload, ShieldCheck, Ban, RotateCcw, Radio, Play, List as ListIcon, SearchCheck, Plus, UserCog, ArrowUp, ArrowDown, Video } from 'lucide-react'
import { uploadFile } from '../api'
import { useSite, t, TEXT_STYLE, applyTheme } from '../site'
import { PlacePicker } from './Extras'
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
const COLOR_LABELS = { accent: 'Color principal (botones y acentos)', bg: 'Fondo', surface: 'Tarjetas y paneles', text: 'Texto', muted: 'Texto secundario', live: 'En directo', verified: 'Noticia verificada' }

export default function Admin({ user, onClose, onSettings, flash }) {
  const site = useSite(), isAdmin = user.role === 'admin'
  const tabs = [['resumen', 'Resumen', LayoutDashboard], ...(isAdmin ? [['marca', 'Nombre y logos', ImageIcon], ['apariencia', 'Colores', Palette], ['textos', 'Textos', Type]] : []),
    ['publicaciones', 'Publicaciones', FileText], ...(isAdmin ? [['usuarios', 'Usuarios', Users]] : []), ['reportes', 'Reportes', Flag], ['salas', 'Salas de ciudad', MessagesSquare],
    ['cuenta', 'Mi cuenta', UserCog], ...(isAdmin ? [['emisoras', 'Emisoras', Radio], ['ventanas', 'Ventanas y reto', Video], ['tipografia', 'Tamaños y colores de texto', Type], ['contenido', 'Contenido', ListIcon], ['seo', 'SEO y redes', SearchCheck], ['config', 'Configuración', Settings], ['integraciones', 'Pagos y Google', KeyRound]] : [])]
  const [tab, setTab] = useState('resumen')
  const [draft, setDraft] = useState(site)
  useEffect(() => { setDraft(site) }, [site])
  const save = async patch => { try { const st = await req('PUT', '/api/admin/settings', patch); onSettings(st); flash('Cambios guardados') } catch (e) { flash(e.message) } }

  return <div className="admin">
    <aside className="adm-nav">
      <div className="adm-title"><ShieldCheck size={18} /> Panel de {site.name}</div>
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
      {tab === 'reportes' && <ReportsTab flash={flash} />}
      {tab === 'salas' && <RoomsTab flash={flash} />}
      {tab === 'emisoras' && <StationsTab flash={flash} />}
      {tab === 'ventanas' && <CamsTab flash={flash} draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'tipografia' && <TypeTab draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'contenido' && <ContentTab draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'seo' && <SeoTab draft={draft} setDraft={setDraft} save={save} flash={flash} />}
      {tab === 'cuenta' && <AccountTab flash={flash} />}
      {tab === 'config' && <ConfigTab draft={draft} setDraft={setDraft} save={save} />}
      {tab === 'integraciones' && <IntegrationsTab flash={flash} />}
    </main>
  </div>
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
  const c = draft.colors || {}
  const setC = k => e => setDraft({ ...draft, colors: { ...c, [k]: e.target.value } })
  return <Section title="Colores" sub="Los cambios se ven en vivo en esta pantalla. Guarda para aplicarlos a todos."
    actions={<div className="row"><button className="btn ghost" onClick={() => setDraft({ ...draft, colors: { accent: '#5cc8b0', bg: '#0b0e12', surface: '#13171d', text: '#eef1f4', muted: '#8a94a0', live: '#e5484d', verified: '#6aa9ff' } })}><RotateCcw size={14} /> Colores originales</button><button className="btn" onClick={() => save({ colors: c })}>Guardar colores</button></div>}>
    <div className="adm-colors">{Object.entries(COLOR_LABELS).map(([k, l]) => <label key={k} className="adm-color"><input type="color" value={c[k] || '#000000'} onChange={setC(k)} /><span><b>{l}</b><small>{c[k]}</small></span></label>)}</div>
    <div className="adm-swatch" style={{ background: c.bg, color: c.text, borderColor: c.surface }}>
      <div style={{ background: c.surface, padding: 14, borderRadius: 6 }}><b>{draft.name}</b><p style={{ color: c.muted, margin: '4px 0 10px' }}>{draft.tagline}</p>
        <span style={{ background: c.accent, color: '#06120f', padding: '6px 12px', borderRadius: 6, fontWeight: 700 }}>Botón principal</span>{' '}
        <span style={{ background: c.live, color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 11 }}>● En directo</span>{' '}
        <span style={{ color: c.verified, fontSize: 12 }}>Noticia verificada</span></div></div>
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
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q])
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
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q])
  const upd = async (id, b) => { try { await req('POST', '/api/admin/users/' + id, b); load() } catch (e) { flash(e.message) } }
  const del = async id => { try { await req('DELETE', '/api/admin/users/' + id); setConfirm(null); flash('Cuenta borrada'); load() } catch (e) { flash(e.message) } }
  return <Section title="Usuarios" sub="Moderador: puede revisar publicaciones, reportes y salas. Administrador: todo el panel.">
    <div className="adm-search"><Search size={15} /><input placeholder="Buscar por nombre o usuario" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="adm-list">{!list ? <p className="muted">Cargando…</p> : list.map(u => <div key={u.id} className="adm-row">
      <div className="grow"><b>{u.name}</b>{u.biz ? <span className="tag" style={{ marginLeft: 6, background: '#ffffff14' }}>{u.biz_name}</span> : null}{u.suspended ? <span className="tag tag-directo" style={{ marginLeft: 6 }}>Suspendida</span> : null}<div className="meta">@{u.handle} · {u.city} · {u.posts} publicaciones · desde {new Date(u.created_at).toLocaleDateString('es-CO')}</div></div>
      {u.id === me.id ? <span className="meta">Tú</span> : <>
        {u.biz ? <>{u.featured_until > Date.now() ? <span className="meta">Destacado hasta {new Date(u.featured_until).toLocaleDateString('es-CO')}</span> : null}<button className="btn sm" onClick={() => upd(u.id, { featureDays: 30 })}>+1 mes</button>{u.featured_until > Date.now() && <button className="btn ghost sm" onClick={() => upd(u.id, { featureDays: 0 })}>Quitar</button>}</> : null}
        <button className={'btn sm' + (u.verified ? '' : ' ghost')} onClick={() => upd(u.id, { verified: !u.verified })}>{u.verified ? '✓ Verificada' : 'Verificar'}</button>
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
  useEffect(() => { load() }, [])
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
  useEffect(() => { load() }, [])
  return <Section title="Salas de ciudad" sub="Últimos mensajes de todas las salas.">
    <div className="adm-list">{!list ? <p className="muted">Cargando…</p> : list.length ? list.map(m => <div key={m.id} className="adm-row">
      <div className="grow"><b>{m.author}</b> <span className="meta">en {m.city} · {ago(m.at)}</span><div>{m.text}</div></div>
      <button className="icon" onClick={async () => { await req('DELETE', '/api/admin/rooms/' + m.id); load() }} aria-label="Borrar mensaje"><Trash2 size={15} /></button>
    </div>) : <p className="muted">Aún no hay mensajes en las salas.</p>}</div>
  </Section>
}

function ConfigTab({ draft, setDraft, save }) {
  const n = k => e => setDraft({ ...draft, [k]: +e.target.value })
  return <Section title="Configuración" actions={<button className="btn" onClick={() => save({ postTTLHours: draft.postTTLHours, bizAmount: draft.bizAmount, radioAmount: draft.radioAmount, currency: draft.currency, bizUSD: draft.bizUSD, radioUSD: draft.radioUSD, videoMaxSeconds: draft.videoMaxSeconds, imageMaxMB: draft.imageMaxMB, postsPerHour: draft.postsPerHour, maintenance: draft.maintenance, maintenanceText: draft.maintenanceText })}>Guardar</button>}>
    <div className="adm-grid">
      <Field label="Borrar publicaciones después de (horas)" hint="La web es en vivo: lo publicado se borra solo pasado este tiempo. Las ofertas y eventos con fecha de fin se borran 24 h después de esa fecha. 0 = no borrar nunca."><input className="field" type="number" min="0" max="720" value={draft.postTTLHours ?? 24} onChange={e => setDraft({ ...draft, postTTLHours: +e.target.value })} /></Field>
      <Field label="Precio mensual para destacar un negocio" hint="Solo el número. Ejemplo: 29900"><input className="field" type="number" min="0" value={draft.bizAmount ?? ''} onChange={e => setDraft({ ...draft, bizAmount: +e.target.value })} /></Field>
      <Field label="Precio mensual para emisoras" hint="Solo el número. Ejemplo: 49900"><input className="field" type="number" min="0" value={draft.radioAmount ?? ''} onChange={e => setDraft({ ...draft, radioAmount: +e.target.value })} /></Field>
      <Field label="Moneda (Mercado Pago y Stripe)" hint="COP, MXN, USD…"><input className="field" value={draft.currency || ''} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} /></Field>
      <Field label="Precios en dólares para PayPal (PayPal no cobra en pesos)" hint="Negocio y emisora, en USD"><div className="row"><input className="field" type="number" min="0" step="0.5" value={draft.bizUSD ?? ''} onChange={e => setDraft({ ...draft, bizUSD: +e.target.value })} aria-label="Negocio en USD" /><input className="field" type="number" min="0" step="0.5" value={draft.radioUSD ?? ''} onChange={e => setDraft({ ...draft, radioUSD: +e.target.value })} aria-label="Emisora en USD" /></div></Field>
      <Field label="Duración máxima de los videos (segundos)" hint="Si en el archivo .env del servidor hay VIDEO_MAX_SECONDS, ese valor manda."><input type="number" min="5" max="300" className="field" value={draft.videoMaxSeconds} onChange={n('videoMaxSeconds')} /></Field>
      <Field label="Tamaño máximo de las fotos (MB)"><input type="number" min="1" max="20" className="field" value={draft.imageMaxMB} onChange={n('imageMaxMB')} /></Field>
      <Field label="Publicaciones máximas por persona cada hora" hint="Frena el spam. No aplica a administradores."><input type="number" min="1" max="500" className="field" value={draft.postsPerHour} onChange={n('postsPerHour')} /></Field>
    </div>
    <label className="toggle" style={{ maxWidth: 520 }}><span>Modo mantenimiento: nadie puede publicar ni escribir, excepto administradores</span><input type="checkbox" checked={!!draft.maintenance} onChange={e => setDraft({ ...draft, maintenance: e.target.checked })} /><i /></label>
    <Field label="Mensaje de mantenimiento"><input className="field" value={draft.maintenanceText} onChange={e => setDraft({ ...draft, maintenanceText: e.target.value })} maxLength={160} /></Field>
  </Section>
}

function IntegrationsTab({ flash }) {
  const [data, setData] = useState(null), [vals, setVals] = useState({}), [msg, setMsg] = useState({})
  const load = () => req('GET', '/api/admin/integrations').then(d => { setData(d); setVals(Object.fromEntries(Object.entries(d).map(([p, v]) => [p, Object.fromEntries(Object.entries(v.fields).map(([f, x]) => [f, x.secret ? '' : x.value]))]))) }).catch(e => flash(e.message))
  useEffect(() => { load() }, [])
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
function StationsTab({ flash }) {
  const site = useSite(), [list, setList] = useState([]), [form, setForm] = useState(null), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(null)
  const load = () => req('GET', '/api/admin/stations').then(d => setList(d.stations)).catch(e => flash(e.message))
  useEffect(() => { load() }, [])
  const done = () => { load(); loadStations() }
  const save = async e => { e.preventDefault(); setBusy(true)
    try { const pl = form.place || {}; const body = { name: form.name, genre: form.genre, stream: form.stream, website: form.website, whatsapp: form.whatsapp, logo: form.logo, city: pl.city, country: pl.country, lat: pl.lat, lon: pl.lon }
      await req(form.id ? 'PUT' : 'POST', '/api/admin/stations' + (form.id ? '/' + form.id : ''), body); flash(form.id ? 'Emisora actualizada' : 'Emisora creada. Actívala con "+1 mes" cuando pague.'); setForm(null); done() } catch (x) { flash(x.message) } finally { setBusy(false) } }
  const pay = async (id, off) => { try { await req('POST', `/api/admin/stations/${id}/pay`, off ? { off: true } : {}); flash(off ? 'Emisora desactivada' : 'Activada 1 mes más'); done() } catch (x) { flash(x.message) } }
  const del = async id => { try { await req('DELETE', '/api/admin/stations/' + id); flash('Emisora borrada'); setConfirm(null); done() } catch (x) { flash(x.message) } }
  const pickLogo = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); try { const url = await uploadFile(f, 'brand'); setForm(fm => ({ ...fm, logo: url })) } catch (x) { flash(x.message) } finally { setBusy(false) } }
  const edit = s => setForm({ id: s.id, name: s.name, genre: s.genre, stream: s.stream, website: s.website || '', whatsapp: s.whatsapp || '', logo: s.logo || '', place: s.city ? { city: s.city, country: s.country, lat: s.lat, lon: s.lon } : null })
  const active = list.filter(s => s.paid_until > Date.now()).length
  return <Section title="Emisoras" sub={`Las emisoras se registran y pagan solas desde la radio de la web. Aquí puedes revisarlas, editarlas o regalar meses. ${active} activas de ${list.length}.`}
    actions={!form && <button className="btn" onClick={() => setForm({ ...EMPTY_ST })}><Radio size={14} /> Nueva emisora</button>}>
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
      <div className="grow"><b>{s.name}</b><div className="meta">{[s.genre, s.city].filter(Boolean).join(' · ')} · {on ? <span style={{ color: '#3ddc97' }}>Activa hasta {new Date(s.paid_until).toLocaleDateString('es-CO')}</span> : <span style={{ color: '#ff8a8d' }}>Sin pagar · no aparece</span>}</div></div>
      <button className="btn sm" onClick={() => pay(s.id)}>+1 mes gratis</button>
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
    actions={<button className="btn" onClick={() => save({ categories: draft.categories, bizTypes: draft.bizTypes, regions: (draft.regions || []).map(r => [r[0], +r[1], +r[2], +r[3]]), planRadio: { ...draft.planRadio, days: +draft.planRadio?.days }, planBiz: { ...draft.planBiz, days: +draft.planBiz?.days }, legalTerms: draft.legalTerms, legalPrivacy: draft.legalPrivacy })}>Guardar todo</button>}>
    <h3 className="adm-h3">Categorías de publicaciones</h3>
    <p className="meta" style={{ display: 'block' }}>El código es interno. Si cambias el código de una categoría que ya existe, sus publicaciones viejas quedan sin categoría: cambia solo el nombre visible.</p>
    <ListEditor rows={draft.categories || []} onChange={set('categories')} cols={[{ ph: 'código (eventos)', flex: .6 }, { ph: 'Nombre visible' }]} add={() => ['', '']} />
    <h3 className="adm-h3">Tipos de negocio</h3>
    <ListEditor rows={draft.bizTypes || []} onChange={set('bizTypes')} cols={[{ ph: 'código (cafe)', flex: .6 }, { ph: 'Nombre con emoji (Café)' }]} add={() => ['', '']} />
    <h3 className="adm-h3">Regiones del menú del mapa</h3>
    <p className="meta" style={{ display: 'block' }}>Latitud y longitud del centro (las ves en Google Maps con clic derecho) y el acercamiento: 2 = mundo, 5 = país, 11 = ciudad.</p>
    <ListEditor rows={draft.regions || []} onChange={set('regions')} cols={[{ ph: 'Nombre', flex: 1.4 }, { ph: 'Latitud', type: 'number' }, { ph: 'Longitud', type: 'number' }, { ph: 'Acercamiento', type: 'number', flex: .7 }]} add={() => ['', '', '', 5]} />
    <h3 className="adm-h3">Planes que se venden</h3>
    <div className="adm-grid"><PlanEditor label="Emisoras" value={draft.planRadio} onChange={set('planRadio')} /><PlanEditor label="Negocios" value={draft.planBiz} onChange={set('planBiz')} /></div>
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
  useEffect(() => { load() }, [])
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

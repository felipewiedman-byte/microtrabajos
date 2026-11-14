import { useEffect, useState } from 'react'
import { X, LayoutDashboard, Palette, Type, Image as ImageIcon, FileText, Users, Flag, MessagesSquare, Settings, KeyRound, Trash2, Check, Search, Upload, ShieldCheck, Ban, RotateCcw } from 'lucide-react'
import { uploadFile } from '../api'
import { useSite, t } from '../site'

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
    ...(isAdmin ? [['config', 'Configuración', Settings], ['integraciones', 'Pagos y Google', KeyRound]] : [])]
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
  const cards = [['Negocios', d.businesses], ['Negocios destacados', d.featuredBiz], ['Usuarios registrados', d.users], ['Publicaciones', d.posts], ['Publicaciones hoy', d.postsToday], ['Comentarios', d.comments], ['Mensajes', d.messages], ['Reportes pendientes', d.reports], ['Conectados ahora', d.online]]
  return <Section title="Resumen" sub={'Fotos y videos guardados en: ' + d.storage}>
    <div className="adm-cards">{cards.map(([l, n]) => <div key={l} className="adm-card"><b>{n}</b><span>{l}</span></div>)}</div>
    {d.expiringSoon?.length > 0 && <><h3 className="adm-h3">Destacados que vencen en 7 días (cóbrales la renovación)</h3><div className="adm-list">{d.expiringSoon.map(u => <div key={u.id} className="adm-row"><span className="grow"><b>{u.biz_name || u.name}</b></span><span className="meta">vence el {new Date(u.featured_until).toLocaleDateString('es-CO')}</span></div>)}</div></>}
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
      <button className={'btn sm' + (p.featured ? '' : ' ghost')} onClick={async () => { await req('POST', `/api/admin/posts/${p.id}/feature`, { featured: !p.featured }); load() }}>{p.featured ? '★ Destacada' : '☆ Destacar'}</button>
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
      <div className="grow"><b>{u.name}</b>{u.biz ? <span className="tag" style={{ marginLeft: 6, background: '#ffffff14' }}>🏪 {u.biz_name}</span> : null}{u.suspended ? <span className="tag tag-directo" style={{ marginLeft: 6 }}>Suspendida</span> : null}<div className="meta">@{u.handle} · {u.city} · {u.posts} publicaciones · desde {new Date(u.created_at).toLocaleDateString('es-CO')}</div></div>
      {u.id === me.id ? <span className="meta">Tú</span> : <>
        {u.biz ? <>{u.featured_until > Date.now() ? <span className="meta">⭐ Destacado hasta {new Date(u.featured_until).toLocaleDateString('es-CO')}</span> : null}<button className="btn sm" onClick={() => upd(u.id, { featureDays: 30 })}>⭐ +1 mes</button>{u.featured_until > Date.now() && <button className="btn ghost sm" onClick={() => upd(u.id, { featureDays: 0 })}>Quitar</button>}</> : null}
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
  return <Section title="Configuración" actions={<button className="btn" onClick={() => save({ bizPrice: draft.bizPrice, bizContact: draft.bizContact, videoMaxSeconds: draft.videoMaxSeconds, imageMaxMB: draft.imageMaxMB, postsPerHour: draft.postsPerHour, maintenance: draft.maintenance, maintenanceText: draft.maintenanceText })}>Guardar</button>}>
    <div className="adm-grid">
      <Field label="Precio de destacar un negocio (se muestra a los negocios)" hint="Ejemplo: 29.900 COP al mes"><input className="field" value={draft.bizPrice || ''} onChange={e => setDraft({ ...draft, bizPrice: e.target.value })} maxLength={60} /></Field>
      <Field label="WhatsApp donde los negocios te escriben para pagar" hint="Con indicativo, ejemplo +57 300 123 4567"><input className="field" value={draft.bizContact || ''} onChange={e => setDraft({ ...draft, bizContact: e.target.value })} maxLength={20} /></Field>
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

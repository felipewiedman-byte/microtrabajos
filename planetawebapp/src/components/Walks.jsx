import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Send, Camera, Square, Eye, Footprints, LocateFixed } from 'lucide-react'
import { Avatar } from './ui'
import { km } from '../walks'
import { prepareImage, uploadFile } from '../api'

async function req(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch {}
  if (!r.ok) throw new Error(d.error || 'Error del servidor.'); return d
}
const viewerKey = (() => { try { let k = sessionStorage.getItem('wk'); if (!k) { k = Math.random().toString(36).slice(2); sessionStorage.setItem('wk', k) } return k } catch { return Math.random().toString(36).slice(2) } })()
const mins = t => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min' }

// Panel de un paseo (en el panel izquierdo). onRoute entrega la ruta y las fotos al mapa.
export function WalkPanel({ id, user, onClose, onRoute, follow, setFollow, requireUser, flash, mine, onEnd }) {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState('')
  const box = useRef(null), routeRef = useRef([]), mediaRef = useRef([])
  useEffect(() => {
    let alive = true; setD(null)
    req('GET', '/api/walks/' + id).then(x => { if (!alive) return; routeRef.current = x.points; mediaRef.current = x.media; setD(x); onRoute({ points: x.points, media: x.media }) }).catch(e => setErr(e.message))
    const pos = e => { const v = e.detail; if (v.walk !== id) return; routeRef.current = [...routeRef.current, [v.lat, v.lon]]; onRoute({ points: routeRef.current, media: mediaRef.current, head: [v.lat, v.lon] }); setD(o => o && { ...o, walk: { ...o.walk, lat: v.lat, lon: v.lon, dist: v.dist, viewers: v.viewers } }) }
    const msg = e => { if (e.detail.walk === id) setD(o => o && { ...o, msgs: [...o.msgs.slice(-80), e.detail.msg] }) }
    const med = e => { if (e.detail.walk !== id) return; mediaRef.current = [...mediaRef.current, e.detail.media]; onRoute({ points: routeRef.current, media: mediaRef.current }); setD(o => o && { ...o, media: mediaRef.current }) }
    const end = e => { if (e.detail.walk === id) setD(o => o && { ...o, walk: { ...o.walk, live: false } }) }
    addEventListener('planeta:walkpos', pos); addEventListener('planeta:walkmsg', msg); addEventListener('planeta:walkmedia', med); addEventListener('planeta:walkend', end)
    const ping = () => req('POST', `/api/walks/${id}/watch`, { k: viewerKey }).catch(() => {}); ping(); const t = setInterval(ping, 30e3)
    return () => { alive = false; clearInterval(t); removeEventListener('planeta:walkpos', pos); removeEventListener('planeta:walkmsg', msg); removeEventListener('planeta:walkmedia', med); removeEventListener('planeta:walkend', end); onRoute(null) }
  }, [id])
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [d?.msgs?.length])
  if (!d) return <aside className="city glass"><button className="pl-back" onClick={onClose}><ChevronLeft size={14} /> Volver</button><div className="empty" style={{ margin: 14 }}>{err || 'Cargando paseo…'}</div></aside>
  const w = d.walk, own = user && w.userId === user.id
  const send = async e => { e.preventDefault(); if (!requireUser()) return; const t = text.trim(); if (!t) return; setText(''); try { await req('POST', `/api/walks/${id}/msg`, { text: t }) } catch (x) { flash(x.message) } }
  const addPhoto = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f || !mine?.pos) return; setBusy('foto')
    try { const im = await prepareImage(f); URL.revokeObjectURL(im.preview); const [image, thumb] = await Promise.all([uploadFile(im.full, 'image'), uploadFile(im.thumb, 'thumb')]); await req('POST', `/api/walks/${id}/media`, { image, thumb, lat: mine.pos[0], lon: mine.pos[1] }); flash('Foto agregada al paseo') } catch (x) { flash(x.message) } finally { setBusy('') } }
  return <aside className="city glass walk-panel">
    <button className="pl-back" onClick={onClose}><ChevronLeft size={14} /> Volver a la lista</button>
    <div className="wk-head">
      <Avatar name={w.name} hue={w.hue} size={44} src={w.avatar} />
      <div className="grow"><div>{w.live ? <span className="live-badge">EN VIVO</span> : <span className="tag">Terminado</span>} <b>{w.title}</b></div>
        <div className="meta">{w.name} · {w.city} · {km(w.dist)} · {mins(w.startedAt)}</div>
        {w.live && <div className="meta"><Eye size={11} /> {w.viewers || 1} acompañando</div>}</div>
    </div>
    <div className="wk-actions">
      {w.live && <button className={'btn sm' + (follow ? '' : ' ghost')} onClick={() => setFollow(!follow)}><LocateFixed size={13} /> {follow ? 'Siguiéndolo' : 'Seguir en el mapa'}</button>}
      {own && w.live && <>{mine && <label className="btn ghost sm"><Camera size={13} /> {busy ? "Subiendo…" : "Foto aquí"}<input type="file" accept="image/*" capture="environment" hidden onChange={addPhoto} /></label>}
        <button className="btn ghost sm danger" onClick={onEnd}><Square size={12} /> Terminar</button></>}
    </div>
    {d.media.length > 0 && <div className="wk-media">{d.media.slice().reverse().map(m => <img key={m.id} src={m.thumb || m.image} alt={m.caption || ''} loading="lazy" />)}</div>}
    <div className="wk-msgs" ref={box}>{d.msgs.length ? d.msgs.map(m => <div key={m.id} className="wk-msg"><Avatar name={m.name} hue={m.hue} size={22} src={m.avatar} /><p><b>{m.name.split(' ')[0]}</b> {m.text}</p></div>)
      : <div className="empty" style={{ margin: 10 }}>{w.live ? 'Escríbele: pídele que entre a un lugar, pregúntale qué ve…' : 'Nadie escribió en este paseo.'}</div>}</div>
    {w.live && <form className="comment-box wk-send" onSubmit={send}><input value={text} onChange={e => setText(e.target.value)} placeholder={user ? 'Escribe al caminante…' : 'Entra para escribir'} maxLength={300} onFocus={() => !user && requireUser()} /><button className="btn sm" aria-label="Enviar"><Send size={14} /></button></form>}
  </aside>
}

// Lista de paseos en vivo, arriba del panel del mapa
export function LiveWalksStrip({ walks, onOpen, onStart }) {
  return <div className="wk-strip">
    <button className="wk-go" onClick={onStart}><Footprints size={14} /> Pasear en vivo</button>
    {walks.map(w => <button key={w.id} className="wk-chip" onClick={() => onOpen(w.id)}><Avatar name={w.name} hue={w.hue} size={22} src={w.avatar} /><span><b>{w.city}</b><small>{w.name.split(' ')[0]} · {km(w.dist)}</small></span><i className="dot" /></button>)}
  </div>
}

// Empezar a pasear: GPS del celular (requiere HTTPS). El administrador puede lanzar un paseo de prueba.
export function StartWalk({ user, onClose, onStarted, isAdmin }) {
  const [title, setTitle] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const secure = window.isSecureContext && 'geolocation' in navigator
  const go = () => { setErr(''); setBusy(true)
    navigator.geolocation.getCurrentPosition(async p => { try { const d = await req('POST', '/api/walks', { title, lat: p.coords.latitude, lon: p.coords.longitude }); onStarted(d.walk, true) } catch (x) { setErr(x.message) } finally { setBusy(false) } },
      e => { setBusy(false); setErr(e.code === 1 ? 'Debes permitir la ubicación para pasear en vivo.' : 'No pudimos obtener tu ubicación. Sal a un lugar abierto e inténtalo de nuevo.') }, { enableHighAccuracy: true, timeout: 15000 }) }
  const demo = async () => { setBusy(true); try { const d = await req('POST', '/api/admin/walks/demo'); onStarted(d.walk, false) } catch (x) { setErr(x.message) } finally { setBusy(false) } }
  return <div className="sheet-bg" onClick={onClose}><div className="auth" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
    <h2 style={{ marginTop: 0 }}>🚶 Pasear en vivo</h2>
    <p className="meta" style={{ display: 'block' }}>Tu punto se mueve en el mapa mientras caminas. La gente te acompaña, te escribe y ve las fotos que vas soltando en cada lugar. Tu ubicación solo se comparte mientras el paseo está activo.</p>
    {secure ? <>
      <label className="adm-field"><span>Título (opcional)</span><input className="field" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Paseo por el centro" /></label>
      <button className="btn block" disabled={busy} onClick={go}>{busy ? 'Buscando tu ubicación…' : 'Empezar a pasear'}</button>
    </> : <div className="banner">Para usar el GPS del celular la web necesita una dirección segura (HTTPS), como worbita.com. Se activa en cuanto conectes el dominio.</div>}
    {isAdmin && <button className="btn ghost block" style={{ marginTop: 8 }} disabled={busy} onClick={demo}>Lanzar paseo de prueba (Cartagena)</button>}
    {err && <div className="banner">{err}</div>}
    <button className="btn ghost block" style={{ marginTop: 8 }} onClick={onClose}>Cancelar</button>
  </div></div>
}

import { useEffect, useRef, useState } from 'react'
import { MapPin, Crosshair, X, Camera, Bell, Heart, MessageCircle, Users, Mail, Radio } from 'lucide-react'
import { Avatar } from './ui'
import { uploadFile, prepareImage } from '../api'
import { useSite, priceTxt, openSell } from '../site'

const ago = t => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d` }

// Search any place in the world (OpenStreetMap through our server)
export function usePlaceSearch(q) {
  const [places, setPlaces] = useState([]), [busy, setBusy] = useState(false)
  useEffect(() => {
    const term = q.trim(); if (term.length < 3) { setPlaces([]); return }
    setBusy(true); const t = setTimeout(() => fetch('/api/geo/search?q=' + encodeURIComponent(term)).then(r => r.json()).then(d => setPlaces(d.places || [])).catch(() => setPlaces([])).finally(() => setBusy(false)), 450)
    return () => clearTimeout(t)
  }, [q])
  return { places, busy }
}

// Read the device location. Browsers only allow it on HTTPS (or localhost).
export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) return reject(new Error('Tu navegador solo permite usar la ubicación en sitios con HTTPS. Por ahora elige tu ciudad en el buscador.'))
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = +pos.coords.latitude.toFixed(5), lon = +pos.coords.longitude.toFixed(5)
      try { const d = await (await fetch(`/api/geo/reverse?lat=${lat}&lon=${lon}`)).json(); resolve({ lat, lon, city: d.place?.city || 'Mi ubicación', country: d.place?.country || '' }) } catch { resolve({ lat, lon, city: 'Mi ubicación', country: '' }) }
    }, e => reject(new Error(e.code === 1 ? 'No diste permiso para usar tu ubicación.' : 'No se pudo obtener tu ubicación.')), { enableHighAccuracy: true, timeout: 12000 })
  })
}

export function PlacePicker({ value, onChange, placeholder = 'Busca tu ciudad o barrio', id = 'place' }) {
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), [err, setErr] = useState(''), [locating, setLocating] = useState(false)
  const { places, busy } = usePlaceSearch(q)
  const useMine = async () => { setErr(''); setLocating(true); try { onChange(await locateMe()) } catch (e) { setErr(e.message) } finally { setLocating(false) } }
  return <div className="place-picker">
    {value?.city && <div className="place-chosen"><MapPin size={14} /><span className="grow">{value.city}{value.country ? ', ' + value.country : ''}</span><button type="button" className="link" onClick={() => { onChange(null); setOpen(true) }}>Cambiar</button></div>}
    {(!value?.city || open) && <div className="place-search"><input id={id} className="field" placeholder={placeholder} value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} autoComplete="off" />
      {busy && <div className="place-list"><div className="place-item muted">Buscando…</div></div>}
      {!busy && open && places.length > 0 && <div className="place-list">{places.map((p, i) => <button type="button" key={i} className="place-item" onClick={() => { onChange(p); setQ(''); setOpen(false) }}><MapPin size={13} /><span><b>{p.city}</b><small>{p.name}</small></span></button>)}</div>}
    </div>}
    <button type="button" className="btn ghost sm" onClick={useMine} disabled={locating}><Crosshair size={14} /> {locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}</button>
    {err && <div className="meta place-err">{err}</div>}
  </div>
}

// Square-crop a photo to 400x400 JPEG for the profile picture
function squareAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => { const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 400; c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 400, 400); URL.revokeObjectURL(url); c.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo procesar la foto.')), 'image/jpeg', 0.88) }
    img.onerror = () => reject(new Error('No se pudo leer la imagen.')); img.src = url
  })
}

export const BIZ = [['cafe', '☕ Café'], ['restaurante', '🍽 Restaurante'], ['bar', '🍸 Bar'], ['tienda', '🛍 Tienda'], ['belleza', '💈 Belleza'], ['servicio', '🛠 Servicio'], ['hotel', '🛏 Hotel'], ['cultura', '🎭 Cultura'], ['deporte', '⚽ Deporte'], ['otro', '🏪 Otro']]
export function ProfileEdit({ user, onClose, onSaved }) {
  const site = useSite()
  const [name, setName] = useState(user.name), [bio, setBio] = useState(user.bio || ''), [avatar, setAvatar] = useState(user.avatar || '')
  const [place, setPlace] = useState({ city: user.city, country: user.country, lat: user.lat, lon: user.lon })
  const [biz, setBiz] = useState(!!user.biz), [bizName, setBizName] = useState(user.bizName || ''), [bizType, setBizType] = useState(user.bizType || 'cafe')
  const [bizHours, setBizHours] = useState(user.bizHours || ''), [bizWhatsapp, setBizWhatsapp] = useState(user.bizWhatsapp || '')
  const [bizPlace, setBizPlace] = useState(user.bizLat != null ? { city: user.bizAddress || 'Ubicación guardada', lat: user.bizLat, lon: user.bizLon } : null)
  const [bizCover, setBizCover] = useState(user.bizCover || '')
  const [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const pickCover = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setErr(''); setBusy('portada'); try { const im = await prepareImage(f); URL.revokeObjectURL(im.preview); setBizCover(await uploadFile(im.full, 'image')) } catch (x) { setErr(x.message) } finally { setBusy('') } }
  const pick = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setErr(''); setBusy('foto'); try { setAvatar(await uploadFile(await squareAvatar(f), 'avatar')) } catch (x) { setErr(x.message) } finally { setBusy('') } }
  const save = async e => { e.preventDefault(); setErr(''); setBusy('guardar')
    try { const r = await fetch('/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, bio, avatar, city: place?.city, country: place?.country, lat: place?.lat, lon: place?.lon, biz, bizName, bizType, bizHours, bizWhatsapp, bizCover, bizLat: bizPlace?.lat, bizLon: bizPlace?.lon, bizAddress: bizPlace?.name || bizPlace?.city }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); onSaved(d.user) } catch (x) { setErr(x.message) } finally { setBusy('') } }
  return <div className="sheet-bg" onClick={onClose}><form className="auth profile-edit" onClick={e => e.stopPropagation()} onSubmit={save}>
    <div className="row"><h2 className="grow" style={{ marginTop: 0 }}>Editar perfil</h2><button type="button" className="icon" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
    <label className="pe-photo"><Avatar name={name} hue={user.hue} size={84} src={avatar} /><span className="pe-cam"><Camera size={15} /></span><input type="file" accept="image/*" hidden onChange={pick} /></label>
    <div className="meta" style={{ justifyContent: 'center' }}>{busy === 'foto' ? 'Subiendo foto…' : 'Toca la foto para cambiarla'}{avatar && busy !== 'foto' && <button type="button" className="link" style={{ marginLeft: 8 }} onClick={() => setAvatar('')}>Quitar</button>}</div>
    <label className="adm-field"><span>Nombre</span><input id="pe-name" className="field" value={name} onChange={e => setName(e.target.value)} maxLength={60} /></label>
    <label className="adm-field"><span>Sobre ti</span><input id="pe-bio" className="field" value={bio} onChange={e => setBio(e.target.value)} maxLength={200} placeholder="Fotógrafo, viajero, amante del café…" /></label>
    <div className="adm-field"><span>Tu ciudad (se usa para "Cerca de mí")</span><PlacePicker value={place} onChange={setPlace} id="pe-place" /></div>
    <label className="toggle"><span>🏪 Es un negocio (aparece en el mapa)</span><input id="pe-biz" type="checkbox" checked={biz} onChange={e => setBiz(e.target.checked)} /><i /></label>
    {biz && <div className="biz-box">
      <div className="adm-field"><span>Foto del local (portada) · tu foto de perfil se usa como logo</span><label className="pe-cover" style={bizCover ? { backgroundImage: `url(${bizCover})` } : null}>{busy === 'portada' ? 'Subiendo…' : bizCover ? '' : <><Camera size={16} /> Subir foto del local</>}<input type="file" accept="image/*" hidden onChange={pickCover} /></label>{bizCover && <button type="button" className="link" onClick={() => setBizCover('')}>Quitar portada</button>}</div>
      <label className="adm-field"><span>Nombre del negocio</span><input id="pe-bizname" className="field" value={bizName} onChange={e => setBizName(e.target.value)} maxLength={80} placeholder="Café Origen" /></label>
      <label className="adm-field"><span>Tipo</span><select id="pe-biztype" className="field" value={bizType} onChange={e => setBizType(e.target.value)}>{BIZ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div className="adm-field"><span>Dirección (busca la dirección o el lugar exacto)</span><PlacePicker value={bizPlace} onChange={setBizPlace} id="pe-bizplace" placeholder="Calle 57 # 9-30, Bogotá" /></div>
      <label className="adm-field"><span>Horario</span><input id="pe-bizhours" className="field" value={bizHours} onChange={e => setBizHours(e.target.value)} maxLength={120} placeholder="Lun a sáb, 8 a. m. – 8 p. m." /></label>
      <label className="adm-field"><span>WhatsApp del negocio</span><input id="pe-bizwa" className="field" value={bizWhatsapp} onChange={e => setBizWhatsapp(e.target.value)} maxLength={20} placeholder="+57 300 123 4567" inputMode="tel" /></label>
      <div className="biz-pro">⭐ <b>Destaca tu negocio</b>: pin dorado y primero en el mapa por {priceTxt(site, 'biz')}. <button type="button" className="link" style={{ color: '#ffb45a', fontWeight: 700 }} onClick={() => { onClose(); openSell('biz') }}>Destacar ahora</button></div>
    </div>}
    {err && <div className="banner">{err}</div>}
    <button className="btn block" disabled={!!busy || name.trim().length < 2}>{busy === 'guardar' ? 'Guardando…' : 'Guardar perfil'}</button>
  </form></div>
}

const NI = { comment: [MessageCircle, 'comentó tu publicación'], like: [Heart, 'le gustó tu publicación'], join: [Users, 'se unió a tu plan'], message: [Mail, 'te envió un mensaje'], bizexp: [Bell, ''], follow: [Radio, 'publicó en algo que sigues:'] }
export function NotificationsButton({ user, onOpenPost, onOpenChat, className, tipRight }) {
  const [list, setList] = useState([]), [unread, setUnread] = useState(0), [open, setOpen] = useState(false)
  const ref = useRef(null)
  const load = () => fetch('/api/notifications').then(r => r.ok ? r.json() : null).then(d => { if (d) { setList(d.notifications); setUnread(d.unread) } }).catch(() => {})
  useEffect(() => { if (!user) return; load(); addEventListener('planeta:notif', load); return () => removeEventListener('planeta:notif', load) }, [user?.id])
  useEffect(() => { if (!open) return; const f = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }; setTimeout(() => addEventListener('click', f)); return () => removeEventListener('click', f) }, [open])
  if (!user) return null
  const toggle = () => { setOpen(o => !o); if (!open && unread) { fetch('/api/notifications/read', { method: 'POST' }); setUnread(0) } }
  return <div className={'notif-wrap ' + (className || '')} ref={ref}>
    <button className="notif-btn" onClick={toggle} aria-label="Notificaciones" data-tip={tipRight ? 'Notificaciones' : undefined}><Bell size={20} strokeWidth={1.75} />{unread > 0 && <i className="badge">{unread > 9 ? '9+' : unread}</i>}</button>
    {open && <div className="notif-pop glass">
      <div className="notif-h">Notificaciones</div>
      {list.length ? list.map(n => { const [Icon, txt] = NI[n.type] || [Bell, '']; return <button key={n.id} className={'notif-item' + (n.read ? '' : ' new')} onClick={() => { setOpen(false); n.type === 'message' ? onOpenChat(n.actor_id) : n.post_id && onOpenPost(n.post_id) }}>
        <span className="notif-av"><Avatar name={n.actor || '?'} hue={n.hue} size={34} src={n.avatar} /><span className={'notif-ic ' + n.type}><Icon size={10} /></span></span>
        <span className="grow"><span><b>{n.actor}</b> {txt}{n.title ? <> «{n.title}»</> : null}</span>{n.text && <span className="meta clip">“{n.text}”</span>}<span className="meta">{ago(n.at)}</span></span>
      </button> }) : <p className="muted small" style={{ padding: 16 }}>Aún no tienes notificaciones. Cuando alguien comente, le guste o se una a tus planes, aparecerá aquí.</p>}
    </div>}
  </div>
}

import { useEffect, useState } from 'react'
import { X, Radio, Play, Square, Star, Upload, Check } from 'lucide-react'
import { uploadFile, prepareImage } from '../api'
import { useSite, priceTxt } from '../site'
import { PlacePicker } from './Extras'
import { play as playRadio, stop as stopRadio, useRadio } from '../radio'

const PROV = { mercadopago: 'Mercado Pago', paypal: 'PayPal', stripe: 'Tarjeta (Stripe)' }
async function req(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch {}
  if (!r.ok) throw new Error(d.error || 'Error del servidor.'); return d
}
const until = t => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })

function PayButtons({ opts, item, targetId, label }) {
  const [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const go = async prov => { setErr(''); setBusy(prov); try { const d = await req('POST', '/api/pay', { item, targetId, provider: prov }); if (!d.url) throw new Error('La pasarela no devolvió el enlace de pago.'); location.href = d.url } catch (e) { setErr(e.message); setBusy('') } }
  if (!opts.providers.length) return <div className="banner">Los pagos en línea aún no están activos. Vuelve pronto.</div>
  const n = new Intl.NumberFormat('es-CO'), price = item === 'radio' ? opts.radio : opts.biz
  return <div className="sell-pay">
    <div className="meta" style={{ display: 'block' }}>{label}</div>
    {opts.providers.map(p => <button key={p} type="button" className={'btn block' + (p === opts.providers[0] ? '' : ' ghost')} disabled={!!busy} onClick={() => go(p)}>
      {busy === p ? 'Abriendo el pago…' : `Pagar con ${PROV[p]} · ${p === 'paypal' ? price.usd + ' USD' : n.format(price.amount) + ' ' + opts.currency}`}</button>)}
    {err && <div className="banner">{err}</div>}
    <small className="meta" style={{ display: 'block' }}>Pago seguro en la página de la pasarela. Al aprobarse se activa solo, por 30 días.</small>
  </div>
}

const EMPTY = { name: '', stream: '', genre: '', website: '', logo: '', place: null }
function RadioSell({ opts, flash }) {
  const radio = useRadio(), site = useSite()
  const [mine, setMine] = useState(null), [form, setForm] = useState(null), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const load = () => req('GET', '/api/my/stations').then(d => { setMine(d.stations); if (!d.stations.length) setForm({ ...EMPTY }) }).catch(e => setErr(e.message))
  useEffect(() => { load(); return () => stopRadio() }, [])
  const pickLogo = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy('logo'); try { const im = await prepareImage(f); URL.revokeObjectURL(im.preview); const url = await uploadFile(im.thumb, 'image'); setForm(fm => ({ ...fm, logo: url })) } catch (x) { setErr(x.message) } finally { setBusy('') } }
  const save = async e => { e.preventDefault(); setErr(''); setBusy('save'); stopRadio()
    try { const pl = form.place || {}; await req(form.id ? 'PUT' : 'POST', '/api/my/stations' + (form.id ? '/' + form.id : ''), { name: form.name, stream: form.stream, genre: form.genre, website: form.website, logo: form.logo, city: pl.city, country: pl.country, lat: pl.lat, lon: pl.lon }); setForm(null); await load(); flash('Emisora guardada. Ahora paga el mes para que suene.') } catch (x) { setErr(x.message) } finally { setBusy('') } }
  const testing = radio.cur?.id === 'prueba'
  if (!mine) return <div className="empty">{err || 'Cargando…'}</div>
  return <>
    {form ? <form className="sell-form" onSubmit={save}>
      <label className="adm-field"><span>Nombre de la emisora</span><input className="field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Radio Caribe 98.5" required /></label>
      <label className="adm-field"><span>Enlace de transmisión (stream)</span><input className="field" value={form.stream} onChange={e => setForm({ ...form, stream: e.target.value.trim() })} placeholder="https://servidor.com:8000/radio.mp3" required /><small>Es el enlace directo del audio en vivo (Icecast o Shoutcast), no tu página web. Pruébalo antes de guardar.</small></label>
      {/^https?:\/\/\S{4,}/.test(form.stream) && <button type="button" className="btn ghost sm" onClick={() => testing ? stopRadio() : playRadio({ id: 'prueba', name: form.name || 'Prueba', stream: form.stream })}>{testing ? <><Square size={13} /> Detener prueba</> : <><Play size={13} /> Probar sonido</>}</button>}
      {testing && <small className="meta" style={{ display: 'block' }}>{radio.error || (radio.playing ? '✅ Suena bien.' : 'Conectando…')}</small>}
      <label className="adm-field"><span>Género</span><input className="field" value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })} maxLength={40} placeholder="Salsa, Noticias, Rock, Crossover…" /></label>
      <div className="adm-field"><span>Ciudad (tu pin en el mapa)</span><PlacePicker value={form.place} onChange={pl => setForm(fm => ({ ...fm, place: pl }))} id="sell-place" /></div>
      <label className="adm-field"><span>Página web (opcional)</span><input className="field" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="www.miemisora.com" /></label>
      <div className="adm-field"><span>Logo</span><div className="row">{form.logo && <img src={form.logo} alt="" className="sell-logo" />}<label className="btn ghost sm"><Upload size={13} /> {busy === 'logo' ? 'Subiendo…' : form.logo ? 'Cambiar' : 'Subir logo'}<input type="file" accept="image/*" hidden onChange={pickLogo} /></label></div></div>
      {err && <div className="banner">{err}</div>}
      <div className="row"><button className="btn" disabled={!!busy}>{busy === 'save' ? 'Guardando…' : 'Guardar y continuar al pago'}</button>{mine.length > 0 && <button type="button" className="btn ghost" onClick={() => { stopRadio(); setForm(null) }}>Cancelar</button>}</div>
    </form> : <>
      {mine.map(s => { const on = s.paid_until > Date.now(); return <div key={s.id} className="sell-item">
        <div className="row">{s.logo ? <img src={s.logo} alt="" className="sell-logo" /> : <span className="sell-logo ph"><Radio size={16} /></span>}
          <div className="grow"><b>{s.name}</b><div className="meta">{on ? <span style={{ color: '#3ddc97' }}><Check size={11} /> Sonando hasta el {until(s.paid_until)}</span> : 'Pendiente de pago · aún no aparece'}</div></div>
          <button className="link" onClick={() => setForm({ id: s.id, name: s.name, stream: s.stream, genre: s.genre, website: s.website || '', logo: s.logo || '', place: s.city ? { city: s.city, country: s.country, lat: s.lat, lon: s.lon } : null })}>Editar</button></div>
        <PayButtons opts={opts} item="radio" targetId={s.id} label={on ? 'Renovar un mes más:' : `Activa tu emisora por ${priceTxt(site, 'radio')}:`} />
      </div> })}
      {mine.length < 5 && <button className="btn ghost sm" onClick={() => setForm({ ...EMPTY })}><Radio size={13} /> Agregar otra emisora</button>}
    </>}
  </>
}

function BizSell({ opts, user, onProfile }) {
  const site = useSite(), on = user?.featuredUntil > Date.now()
  if (!user?.biz) return <div className="sell-item"><p className="meta" style={{ display: 'block' }}>Primero convierte tu cuenta en negocio: en <b>Editar perfil</b> activa <b>"Es un negocio"</b> y pon su dirección.</p><button className="btn" onClick={onProfile}>Editar perfil</button></div>
  return <div className="sell-item">
    <div className="row"><Star size={18} color="#ffb45a" /><div className="grow"><b>{user.bizName || user.name}</b><div className="meta">{on ? <span style={{ color: '#ffb45a' }}>Destacado hasta el {until(user.featuredUntil)}</span> : 'Sin destacar'}</div></div></div>
    <ul className="sell-list"><li>Pin dorado, visible antes que los demás</li><li>Tus publicaciones salen primero en el muro</li><li>30 días; renuevas cuando quieras</li></ul>
    <PayButtons opts={opts} item="biz" label={on ? 'Renovar un mes más:' : `Destaca tu negocio por ${priceTxt(site, 'biz')}:`} />
  </div>
}

export default function Sell({ kind, user, onClose, onAuth, onProfile, flash, onKind }) {
  const site = useSite(), [opts, setOpts] = useState(null)
  useEffect(() => { req('GET', '/api/pay/options').then(setOpts).catch(() => setOpts({ providers: [], radio: {}, biz: {} })) }, [])
  const radio = kind === 'radio'
  if (kind === 'planes') return <div className="sheet-bg" onClick={onClose}><div className="auth sell" onClick={e => e.stopPropagation()}>
    <div className="row"><h2 className="grow" style={{ margin: 0 }}>Planes</h2><button className="icon" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
    <p className="meta" style={{ display: 'block', margin: '4px 0 12px' }}>Pagas en línea con {opts?.providers?.length ? opts.providers.map(p => PROV[p]).join(', ') : 'Mercado Pago o PayPal'} y se activa al instante, por 30 días.</p>
    <div className="plan"><div className="row"><Radio size={18} color="#b48cff" /><b className="grow">Emisora</b><span className="plan-p">{priceTxt(site, 'radio')}</span></div>
      <ul className="sell-list"><li>Tu emisora suena en toda la web mientras la gente navega</li><li>Pin con tu logo en tu ciudad y en la ficha de la ciudad</li><li>Aparece en la lista de Radio, por género</li></ul>
      <button className="btn block" onClick={() => onKind('radio')}>Poner mi emisora</button></div>
    <div className="plan"><div className="row"><Star size={18} color="#ffb45a" /><b className="grow">Negocio destacado</b><span className="plan-p">{priceTxt(site, 'biz')}</span></div>
      <ul className="sell-list"><li>Pin dorado en el mapa, visible antes que los demás</li><li>Tus ofertas y publicaciones salen primero</li><li>Ficha con fotos, horario, WhatsApp y "Cómo llegar"</li></ul>
      <button className="btn block" onClick={() => onKind('biz')}>Destacar mi negocio</button></div>
  </div></div>
  return <div className="sheet-bg" onClick={onClose}><div className="auth sell" onClick={e => e.stopPropagation()}>
    <div className="row"><h2 className="grow" style={{ margin: 0 }}>{radio ? '📻 Tu emisora en ' + site.name : '⭐ Destaca tu negocio'}</h2><button className="icon" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
    <p className="meta" style={{ display: 'block', margin: '4px 0 12px' }}>{radio ? `Suena para todos los que navegan el mapa, con tu logo y tu pin en tu ciudad. ${priceTxt(site, 'radio')}.` : `Más visitas a tu negocio en el mapa. ${priceTxt(site, 'biz')}.`}</p>
    {!user ? <div className="sell-item"><p className="meta" style={{ display: 'block' }}>Crea tu cuenta gratis o entra para continuar.</p><div className="row"><button className="btn" onClick={() => onAuth('register')}>Crear cuenta</button><button className="btn ghost" onClick={() => onAuth('login')}>Entrar</button></div></div>
      : !opts ? <div className="empty">Cargando…</div> : radio ? <RadioSell opts={opts} flash={flash} /> : <BizSell opts={opts} user={user} onProfile={onProfile} />}
  </div></div>
}

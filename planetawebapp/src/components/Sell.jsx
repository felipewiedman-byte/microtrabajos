import { useEffect, useState } from 'react'
import { X, Star, Megaphone } from 'lucide-react'
import { useSite, priceTxt } from '../site'

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
  const n = new Intl.NumberFormat('es-CO'), price = item === 'radio' ? opts.radio : item === 'evento' ? (opts.evento || {}) : opts.biz
  return <div className="sell-pay">
    <div className="meta" style={{ display: 'block' }}>{label}</div>
    {opts.providers.map(p => <button key={p} type="button" className={'btn block' + (p === opts.providers[0] ? '' : ' ghost')} disabled={!!busy} onClick={() => go(p)}>
      {busy === p ? 'Abriendo el pago…' : `Pagar con ${PROV[p]} · ${p === 'paypal' ? price.usd + ' USD' : n.format(price.amount) + ' ' + opts.currency}`}</button>)}
    {err && <div className="banner">{err}</div>}
    <small className="meta" style={{ display: 'block' }}>Pago seguro en la página de la pasarela. Al aprobarse se activa solo.</small>
  </div>
}

function BizSell({ opts, user, onProfile }) {
  const site = useSite(), on = user?.featuredUntil > Date.now()
  if (!user?.biz) return <div className="sell-item"><p className="meta" style={{ display: 'block' }}>Primero convierte tu cuenta en negocio: en <b>Editar perfil</b> activa <b>"Es un negocio"</b> y pon su dirección.</p><button className="btn" onClick={onProfile}>Editar perfil</button></div>
  return <div className="sell-item">
    <div className="row"><Star size={18} color="#ffb45a" /><div className="grow"><b>{user.bizName || user.name}</b><div className="meta">{on ? <span style={{ color: '#ffb45a' }}>Destacado hasta el {until(user.featuredUntil)}</span> : 'Sin destacar'}</div></div></div>
    <ul className="sell-list">{(site.planBiz?.perks || []).map((x, i) => <li key={i}>{x}</li>)}<li>{site.planBiz?.days || 30} días; renuevas cuando quieras</li></ul>
    <PayButtons opts={opts} item="biz" label={on ? 'Renovar un mes más:' : `Destaca tu negocio por ${priceTxt(site, 'biz')}:`} />
  </div>
}

// Promocionar un evento (concierto, fiesta…): se paga por cada evento publicado en la categoría Eventos; mientras dura, su pin no se quita a las 24 horas y sale resaltado
function EventSell({ opts, onClose }) {
  const site = useSite(), [list, setList] = useState(null), [err, setErr] = useState('')
  useEffect(() => { req('GET', '/api/posts?filter=mine&limit=100').then(d => setList((d.posts || []).filter(p => p.cat === 'eventos'))).catch(e => setErr(e.message)) }, [])
  if (!list) return <div className="empty">{err || 'Cargando…'}</div>
  if (!list.length) return <div className="sell-item"><p className="meta" style={{ display: 'block' }}>Primero publica tu evento: elige la categoría <b>Eventos</b> al publicar. Después vuelve aquí para promocionarlo.</p><button className="btn block" onClick={onClose}>Entendido</button></div>
  return <div className="sell-list-wrap">
    <ul className="sell-list">{(site.planEvento?.perks || []).map((x, i) => <li key={i}>{x}</li>)}<li>{site.planEvento?.days || 7} días por evento</li></ul>
    {list.map(p => { const on = +p.promo_until > Date.now(); return <div key={p.id} className="sell-item"><b>{p.title}</b>{on && <div className="meta" style={{ display: 'block' }}>Promocionado hasta el {until(p.promo_until)}</div>}
      <PayButtons opts={opts} item="evento" targetId={p.id} label={on ? 'Extender la promoción:' : `Promociona este evento por ${priceTxt(site, 'evento')}:`} /></div> })}
  </div>
}

export default function Sell({ kind, user, onClose, onAuth, onProfile, onKind }) {
  const site = useSite(), [opts, setOpts] = useState(null)
  useEffect(() => { req('GET', '/api/pay/options').then(setOpts).catch(() => setOpts({ providers: [], radio: {}, biz: {} })) }, [])
  const evento = kind === 'evento' || kind === 'radio'
  if (kind === 'planes') return <div className="sheet-bg" onClick={onClose}><div className="auth sell" onClick={e => e.stopPropagation()}>
    <div className="row"><h2 className="grow" style={{ margin: 0 }}>Planes</h2><button className="icon" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
    <p className="meta" style={{ display: 'block', margin: '4px 0 12px' }}>Pagas en línea con {opts?.providers?.length ? opts.providers.map(p => PROV[p]).join(', ') : 'Mercado Pago o PayPal'} y se activa al instante.</p>
    <div className="plan"><div className="row"><Megaphone size={18} color="#b48cff" /><b className="grow">{site.planEvento?.name || 'Promociona tu evento'}</b><span className="plan-p">{priceTxt(site, 'evento')}</span></div>
      <ul className="sell-list">{(site.planEvento?.perks || []).map((x, i) => <li key={i}>{x}</li>)}<li>{site.planEvento?.days || 7} días por evento</li></ul>
      <button className="btn block" onClick={() => onKind('evento')}>Promocionar mi evento</button></div>
    <div className="plan"><div className="row"><Star size={18} color="#ffb45a" /><b className="grow">{site.planBiz?.name || 'Negocio destacado'}</b><span className="plan-p">{priceTxt(site, 'biz')}</span></div>
      <ul className="sell-list">{(site.planBiz?.perks || []).map((x, i) => <li key={i}>{x}</li>)}<li>{site.planBiz?.days || 30} días</li></ul>
      <button className="btn block" onClick={() => onKind('biz')}>Destacar mi negocio</button></div>
  </div></div>
  return <div className="sheet-bg" onClick={onClose}><div className="auth sell" onClick={e => e.stopPropagation()}>
    <div className="row"><h2 className="grow" style={{ margin: 0 }}>{evento ? 'Promociona tu evento' : 'Destaca tu negocio'}</h2><button className="icon" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
    <p className="meta" style={{ display: 'block', margin: '4px 0 12px' }}>{evento ? `Tu evento se ve todos los días que pagas, resaltado en el mapa y primero en la lista. ${priceTxt(site, 'evento')}.` : `Más visitas a tu negocio en el mapa. ${priceTxt(site, 'biz')}.`}</p>
    {!user ? <div className="sell-item"><p className="meta" style={{ display: 'block' }}>Crea tu cuenta gratis o entra para continuar.</p><div className="row"><button className="btn" onClick={() => onAuth('register')}>Crear cuenta</button><button className="btn ghost" onClick={() => onAuth('login')}>Entrar</button></div></div>
      : !opts ? <div className="empty">Cargando…</div> : evento ? <EventSell opts={opts} onClose={onClose} /> : <BizSell opts={opts} user={user} onProfile={onProfile} />}
  </div></div>
}

import { ChevronLeft, MapPin, ExternalLink } from 'lucide-react'
import { camSrc } from '../live'

export function CamPanel({ cam, cams, onClose, onPick, onFly }) {
  const others = cams.filter(c => c.id !== cam.id).slice(0, 12)
  const yt = cam.kind === 'channel' ? `https://www.youtube.com/channel/${cam.yt}/live` : `https://www.youtube.com/watch?v=${cam.yt}`
  return <aside className="city glass cam-panel">
    <button className="pl-back" onClick={onClose}><ChevronLeft size={14} /> Volver a la lista</button>
    <div className="cam-frame"><iframe key={cam.id} src={camSrc(cam)} title={cam.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
    <div className="cam-info"><div><span className="live-badge">EN VIVO</span> <b>{cam.title}</b></div><div className="meta"><MapPin size={11} /> {[cam.city, cam.country].filter(Boolean).join(', ')}</div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}><button className="btn ghost sm" onClick={() => onFly(cam)}><MapPin size={13} /> Ver en el mapa</button><a className="btn ghost sm" href={yt} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Abrir en YouTube</a></div>
      <p className="meta" style={{ display: 'block', marginTop: 8 }}>Si no se ve, la cámara puede estar apagada en este momento. Prueba otra.</p></div>
    {others.length > 0 && <><div className="lbl" style={{ margin: '6px 14px' }}>Otras ventanas al mundo</div>
      <div className="cam-list">{others.map(c => <button key={c.id} className="cam-item" onClick={() => onPick(c.id)}><span className="cam-dot" /><span className="grow"><b>{c.title}</b><small>{[c.city, c.country].filter(Boolean).join(', ')}</small></span></button>)}</div></>}
  </aside>
}

import { useEffect, useRef, useState } from 'react'
import { X, Star, BadgeCheck } from 'lucide-react'
import { Avatar } from './ui'
import FlatIcon from './FlatIcon'
import { BIZ } from './Extras'

// Ventana «Negocios» (computador): lista de negocios activos con buscador por nombre, ciudad, país o dirección.
// Al tocar uno, el mapa va a su lugar y se abre su ficha en la ventana de la derecha. Se pide al servidor de 40 en 40 y solo mientras está abierta.
const label = t => (BIZ.find(b => b[0] === t) || [])[1] || 'Negocio'

export default function BizList({ onClose, onPick, mobile }) {
  const [q, setQ] = useState(''), [rows, setRows] = useState(null), [total, setTotal] = useState(0), [busy, setBusy] = useState(false), seq = useRef(0)
  const load = async (query, off) => {
    const my = ++seq.current; setBusy(true)
    try {
      const r = await fetch('/api/biz?q=' + encodeURIComponent(query) + '&o=' + off), d = await r.json()
      if (my !== seq.current || !r.ok) return
      setRows(old => off ? [...(old || []), ...d.list] : d.list); setTotal(d.total)
    } catch { /* sin red: se queda lo que había */ } finally { if (my === seq.current) setBusy(false) }
  }
  useEffect(() => { const t = setTimeout(() => load(q.trim(), 0), q ? 250 : 0); return () => clearTimeout(t) }, [q])
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  return <div className={'bl-win' + (mobile ? ' mob-biz' : '')}>
    <div className="bl-strip"><span>{mobile ? 'Negocios' : 'NEGOCIOS'}</span><button onClick={onClose} aria-label="Cerrar negocios" title="Cerrar"><X size={14} /></button></div>
    <div className="bl-body">
      <label className="bl-search"><FlatIcon name="buscar" size={16} /><input autoFocus={!mobile} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o ciudad" maxLength={60} aria-label="Buscar negocios" /></label>
      <div className="bl-count">{rows === null ? 'Cargando…' : total === 0 ? 'No hay negocios con esa búsqueda.' : total + (total === 1 ? ' negocio' : ' negocios')}</div>
      <div className="bl-list">{(rows || []).map(b => <button key={b.id} className="bl-row" onClick={() => onPick(b)}>
        <Avatar name={b.name} hue={b.hue} size={42} src={b.avatar} />
        <span className="bl-t"><b>{b.name}{b.verified && <BadgeCheck size={13} className="verified" />}{b.featured && <Star size={11} fill="currentColor" className="bl-star" />}</b>
          <small>{label(b.type)}{b.city ? ' · ' + b.city : ''}{b.country ? ', ' + b.country : ''}</small>
          {b.address && <small className="bl-ad">{b.address}</small>}</span></button>)}
        {rows && rows.length < total && <button className="bl-more" disabled={busy} onClick={() => load(q.trim(), rows.length)}>{busy ? 'Cargando…' : 'Ver más'}</button>}</div>
    </div>
  </div>
}

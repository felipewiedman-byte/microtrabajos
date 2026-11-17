import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import FlatIcon from './FlatIcon'
import { RadioMenu } from './RadioBar'
import { SITE_CATS, siteSvg } from '../sitesIcons'

// Ventana «Lugares» (computador): todos los sitios turísticos en cápsulas, con buscador y un solo desplegable de tipo.
// Al tocar una cápsula el mapa va a ese lugar y se abre su ficha. La lista ya la tiene la app (no pide nada más al servidor).
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export default function SitesList({ sites: sitesProp, onPick, onClose, mobile }) {
  const [own, setOwn] = useState(null)
  useEffect(() => { if (sitesProp !== undefined) return; let on = true; fetch('/api/sites').then(r => r.json()).then(d => { if (on) setOwn(d.sites || []) }).catch(() => { if (on) setOwn([]) }); return () => { on = false } }, [sitesProp])
  const sites = sitesProp === undefined ? own : sitesProp
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [n, setN] = useState(60)
  const list = useMemo(() => {
    const t = norm(q)
    return (sites || []).filter(s => (!cat || s.cat === cat) && (!t || norm(s.name + ' ' + (s.country || '')).includes(t)))
      .sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9) || String(a.name).localeCompare(String(b.name)))
  }, [sites, q, cat])
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  return <aside className={mobile ? 'sites-list mob-win' : 'city glass sites-list'}>
    <div className="sl-top"><b>Lugares</b><button className="pl-f-x" onClick={onClose} aria-label="Cerrar lugares" title="Cerrar"><X size={15} /></button></div>
    <label className="bl-search"><FlatIcon name="buscar" size={16} /><input autoFocus={!mobile} value={q} onChange={e => { setQ(e.target.value); setN(60) }} placeholder="Buscar lugar o país" maxLength={60} aria-label="Buscar lugares" /></label>
    <div className="sl-sel"><RadioMenu value={cat} onChange={v => { setCat(v); setN(60) }} groups={[{ items: [{ v: '', t: 'Todos los tipos' }, ...Object.entries(SITE_CATS).map(([v, t]) => ({ v, t }))] }]} /></div>
    <div className="bl-count">{sites === null ? 'Cargando…' : list.length === 0 ? 'No hay lugares con esa búsqueda.' : list.length + (list.length === 1 ? ' lugar' : ' lugares')}</div>
    <div className="sl-caps">{list.slice(0, n).map(s => <button key={s.id} className={'sl-cap c-' + s.cat} onClick={() => onPick(s)}>
      <i dangerouslySetInnerHTML={{ __html: siteSvg(s.cat, 16) }} /><span><b>{s.name}</b><small>{SITE_CATS[s.cat] || 'Lugar'}{s.country ? ' · ' + s.country : ''}</small></span></button>)}
      {list.length > n && <button className="bl-more" onClick={() => setN(v => v + 60)}>Ver más</button>}</div>
  </aside>
}

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import FlatIcon from './FlatIcon'
import { RadioMenu } from './RadioBar'
import { EV_KINDS } from './evlayer'

// Ventana «Eventos» (computador): festivales, conciertos, exposiciones, congresos y competencias de todo el mundo
// (datos abiertos de Wikidata que el servidor baja solo). Buscador y UN solo desplegable (cuándo o tipo).
// Al tocar uno el mapa va a ese lugar; también se abre al tocar su punto en el mapa.
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const safe = u => /^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : null
const fd = ms => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' })
const when = e => { const a = fd(e.starts); return e.ends && fd(e.ends) !== a ? a + ' – ' + fd(e.ends) : a }
const DAY = 864e5
export default function EventsList({ events, sel, onPick, onClose }) {
  const [q, setQ] = useState(''), [f, setF] = useState('todo'), [n, setN] = useState(60)
  const list = useMemo(() => {
    const t = norm(q), now = Date.now(), end = f === 'hoy' ? now + DAY : f === 'semana' ? now + 7 * DAY : f === 'mes' ? now + 30 * DAY : Infinity
    return (events || []).filter(e => (e.ends || e.starts) >= now - DAY && e.starts <= end && (!EV_KINDS[f] || e.kind === f) && (!t || norm(e.title + ' ' + e.city + ' ' + e.country).includes(t)))
  }, [events, q, f])
  const cur = sel && (events || []).find(e => e.id === sel)
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  const where = e => [e.city, e.country].filter(Boolean).join(', ')
  return <aside className="city glass sites-list ev-list">
    <div className="sl-top"><b>Eventos</b><button className="pl-f-x" onClick={onClose} aria-label="Cerrar eventos" title="Cerrar"><X size={15} /></button></div>
    <label className="bl-search"><FlatIcon name="buscar" size={16} /><input autoFocus value={q} onChange={e => { setQ(e.target.value); setN(60) }} placeholder="Buscar evento, ciudad o país" maxLength={60} aria-label="Buscar eventos" /></label>
    <div className="sl-sel"><RadioMenu value={f} onChange={v => { setF(v); setN(60) }} groups={[
      { t: 'Cuándo', items: [{ v: 'todo', t: 'Próximos 60 días' }, { v: 'hoy', t: 'Hoy' }, { v: 'semana', t: 'Esta semana' }, { v: 'mes', t: 'Este mes' }] },
      { t: 'Tipo', items: Object.entries(EV_KINDS).map(([v, k]) => ({ v, t: k[0] })) }]} /></div>
    {cur && <div className="ev-det" style={{ '--sc': EV_KINDS[cur.kind]?.[1] }}>
      {safe(cur.img) && <img src={cur.img} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <b>{cur.title}</b><small>{EV_KINDS[cur.kind]?.[0] || 'Evento'} · {when(cur)}{where(cur) ? ' · ' + where(cur) : ''}</small>
      {safe(cur.url) && <a href={cur.url} target="_blank" rel="noopener noreferrer nofollow">Sitio web del evento</a>}</div>}
    <div className="bl-count">{events === null ? 'Cargando…' : !events.length ? 'Aún no hay eventos. El servidor los descarga solo (Panel → Configuración → Eventos del mundo).' : list.length === 0 ? 'No hay eventos con ese filtro.' : list.length + (list.length === 1 ? ' evento' : ' eventos')}</div>
    <div className="sl-caps">{list.slice(0, n).map(e => <button key={e.id} className={'sl-cap' + (e.id === sel ? ' on' : '')} style={{ '--sc': EV_KINDS[e.kind]?.[1] }} onClick={() => onPick(e)}>
      <i><FlatIcon name="eventos" size={16} /></i><span><b>{e.title}</b><small>{when(e)}{where(e) ? ' · ' + where(e) : ''}</small></span></button>)}
      {list.length > n && <button className="bl-more" onClick={() => setN(v => v + 60)}>Ver más</button>}</div>
  </aside>
}

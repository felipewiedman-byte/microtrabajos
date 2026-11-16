import { useEffect, useMemo, useState } from 'react'
import { X, Film } from 'lucide-react'
import FlatIcon from './FlatIcon'
import { RadioMenu } from './RadioBar'

// Ventana «Cartelera» (computador): las películas en cartelera que publica la web sola (TMDB), con póster,
// buscador y un desplegable por país. Al tocar una, el mapa va a ella y se abre su ficha. No pide nada más al servidor.
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const okImg = u => /^(https:\/\/|\/uploads\/)[^"'<>\s]+$/.test(u || '')
export default function CineList({ posts, onPick, onClose }) {
  const [q, setQ] = useState(''), [pais, setPais] = useState('')
  const films = useMemo(() => (posts || []).filter(p => p.handle === 'cine'), [posts])
  const paises = useMemo(() => [...new Set(films.map(p => p.country).filter(Boolean))].sort(), [films])
  const list = useMemo(() => { const t = norm(q); return films.filter(p => (!pais || p.country === pais) && (!t || norm(p.title + ' ' + p.country).includes(t))) }, [films, q, pais])
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  return <aside className="city glass sites-list cine-list">
    <div className="sl-top"><b>Cartelera</b><button className="pl-f-x" onClick={onClose} aria-label="Cerrar cartelera" title="Cerrar"><X size={15} /></button></div>
    <label className="bl-search"><FlatIcon name="buscar" size={16} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar película" maxLength={60} aria-label="Buscar película" /></label>
    {paises.length > 1 && <div className="sl-sel"><RadioMenu value={pais} onChange={setPais} groups={[{ items: [{ v: '', t: 'Todos los países' }, ...paises.map(v => ({ v, t: v }))] }]} /></div>}
    <div className="bl-count">{!films.length ? 'Aún no hay cartelera. Se activa con la llave de TMDB (Panel → Pagos y Google).' : list.length ? list.length + (list.length === 1 ? ' película' : ' películas') : 'No hay películas con esa búsqueda.'}</div>
    <div className="cine-grid">{list.map(p => { const img = p.thumb || p.image; return <button key={p.id} className="cine-it" onClick={() => onPick(p)}>
      {okImg(img) ? <img src={img} alt="" loading="lazy" /> : <span className="cine-ph"><Film size={22} /></span>}
      <b>{String(p.title).replace(/^En cartelera:\s*/, '')}</b><small>{p.city}{p.country ? ' · ' + p.country : ''}</small></button> })}</div>
  </aside>
}

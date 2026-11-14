import { useEffect, useState } from 'react'
import { Radio, Play, Pause, X, ChevronUp, ChevronDown, Volume2, Loader2 } from 'lucide-react'
import { useRadio, play, toggle, stop, setVolume, loadStations } from '../radio'
import { useSite, priceTxt, openSell } from '../site'

export const RadioLogo = ({ st, size = 30 }) => st.logo ? <img className="rd-logo" src={st.logo} alt="" style={{ width: size, height: size }} /> : <span className="rd-logo ph" style={{ width: size, height: size }}><Radio size={size * .5} /></span>

export default function RadioBar({ docked }) {
  const r = useRadio(), site = useSite(), [open, setOpen] = useState(false), [genre, setGenre] = useState('')
  useEffect(() => { loadStations(); const f = () => loadStations(); addEventListener('planeta:stations', f); return () => removeEventListener('planeta:stations', f) }, [])
  useEffect(() => { if (!open) return; const f = e => { if (!e.target.closest('.radio')) setOpen(false) }; const k = e => e.key === 'Escape' && setOpen(false); document.addEventListener('pointerdown', f); addEventListener('keydown', k); return () => { document.removeEventListener('pointerdown', f); removeEventListener('keydown', k) } }, [open])
  if (!r.stations.length && !r.cur) return <div className={'radio' + (docked ? ' docked' : '')}><div className="rd-bar"><button className="rd-now grow" onClick={() => openSell('radio')}><span className="rd-logo ph" style={{ width: 26, height: 26 }}><Radio size={14} /></span><span className="grow"><b>Radio</b><small>¿Tienes una emisora? Suena aquí</small></span></button></div></div>
  const genres = [...new Set(r.stations.map(s => s.genre).filter(Boolean))]
  const list = genre ? r.stations.filter(s => s.genre === genre) : r.stations
  return <div className={'radio' + (docked ? ' docked' : '') + (open ? ' open' : '')}>
    {open && <div className="rd-list">
      <div className="rd-h"><b>Emisoras</b><small>{r.stations.length} sonando en {site.name}</small></div>
      {genres.length > 1 && <div className="rd-genres"><button className={!genre ? 'on' : ''} onClick={() => setGenre('')}>Todas</button>{genres.map(g => <button key={g} className={genre === g ? 'on' : ''} onClick={() => setGenre(g)}>{g}</button>)}</div>}
      <div className="rd-items">{list.map(s => <button key={s.id} className={'rd-item' + (r.cur?.id === s.id ? ' on' : '')} onClick={() => { play(s); setOpen(false) }}>
        <RadioLogo st={s} size={34} /><span className="grow"><b>{s.name}</b><small>{[s.genre, s.city].filter(Boolean).join(' · ')}</small></span>
        {r.cur?.id === s.id && r.playing ? <span className="rd-eq"><i /><i /><i /></span> : <Play size={14} />}
      </button>)}</div>
      <div className="rd-promo">📻 ¿Tienes una emisora? Suena aquí por {priceTxt(site, 'radio')}. <button onClick={() => { setOpen(false); openSell('radio') }}>Ponla aquí</button></div>
    </div>}
    <div className="rd-bar">
      {r.cur ? <>
        <button className="rd-play" onClick={toggle} aria-label={r.playing ? 'Pausar' : 'Escuchar'}>{r.loading ? <Loader2 size={15} className="spin" /> : r.playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <button className="rd-now grow" onClick={() => setOpen(o => !o)}><RadioLogo st={r.cur} size={26} /><span className="grow"><b>{r.cur.name}</b><small className={r.error ? 'err' : ''}>{r.error || (r.playing ? '● En vivo' : r.loading ? 'Conectando…' : 'En pausa')}</small></span></button>
        <label className="rd-vol" title="Volumen"><Volume2 size={14} /><input type="range" min="0" max="1" step="0.05" value={r.volume} onChange={e => setVolume(+e.target.value)} aria-label="Volumen" /></label>
        <button className="rd-x" onClick={() => setOpen(o => !o)} aria-label={open ? 'Minimizar' : 'Ver emisoras'} title={open ? 'Minimizar' : 'Ver emisoras'}>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
        <button className="rd-x" onClick={() => { stop(); setOpen(false) }} aria-label="Cerrar radio"><X size={14} /></button>
      </> : <button className="rd-now grow" onClick={() => setOpen(o => !o)}><span className="rd-logo ph" style={{ width: 26, height: 26 }}><Radio size={14} /></span><span className="grow"><b>Radio</b><small>{r.stations.length} emisoras en vivo</small></span>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>}
    </div>
  </div>
}

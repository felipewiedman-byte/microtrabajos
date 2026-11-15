import { useEffect, useRef, useState } from 'react'
import FlatIcon from './FlatIcon'
import { Radio, Play, Pause, X, ChevronUp, ChevronDown, Volume2, Loader2, SkipBack, SkipForward, Heart, Shuffle } from 'lucide-react'
import { useRadio, play, toggle, stop, setVolume, loadStations, next, prev, toggleFav } from '../radio'
import { useSite, openSell } from '../site'

export function RadioLogo({ st, size = 30 }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [st.logo])
  return st.logo && !bad ? <img className="rd-logo" src={st.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} style={{ width: size, height: size }} /> : <span className="rd-logo ph" style={{ width: size, height: size }}><Radio size={size * .5} /></span>
}

const PAISES = ['AR', 'BR', 'CO', 'MX', 'ES', 'GB', 'DE', 'IT', 'FR', 'PT', 'NL', 'BE', 'US', 'CL', 'UY', 'PE', 'EC', 'PY', 'BO', 'VE', 'CR', 'PA', 'DO', 'CU', 'TR', 'GR', 'RU', 'PL', 'SE', 'NO', 'DK', 'CH', 'AT', 'CZ', 'HR', 'RO', 'HU', 'SA', 'AE', 'EG', 'MA', 'NG', 'GH', 'SN', 'ZA', 'JP', 'KR', 'IN', 'AU', 'CA', 'ID', 'PH', 'TH', 'VN']
const nombreP = (() => { try { return new Intl.DisplayNames(['es'], { type: 'region' }) } catch { return null } })()
const MAXW = 600   // tope de emisoras del mundo por visita: la lista nunca se hace pesada
const DESK = typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches   // íconos planos en computador
export default function RadioBar({ docked }) {
  const r = useRadio(), site = useSite(), [open, setOpen] = useState(false), [src, setSrc] = useState('mias'), [shown, setShown] = useState(60), [world, setWorld] = useState({ key: '', items: [], next: 0, done: false, loading: false, err: '' }), endRef = useRef(null)
  useEffect(() => { const f = () => setOpen(true), g = () => setOpen(false); addEventListener('planeta:radio-open', f); addEventListener('planeta:radio-close', g); return () => { removeEventListener('planeta:radio-open', f); removeEventListener('planeta:radio-close', g) } }, [])
  // avisa a la app si la lista de emisoras está abierta (en celular es una página entera y el mapa se pausa)
  useEffect(() => { dispatchEvent(new CustomEvent('planeta:radio-state', { detail: open })) }, [open])
  useEffect(() => { loadStations(); const f = () => loadStations(); addEventListener('planeta:stations', f); return () => removeEventListener('planeta:stations', f) }, [])
  useEffect(() => { if (!open) return; const f = e => { if (!e.target.closest('.radio')) setOpen(false) }; const k = e => e.key === 'Escape' && setOpen(false); document.addEventListener('pointerdown', f); addEventListener('keydown', k); return () => { document.removeEventListener('pointerdown', f); removeEventListener('keydown', k) } }, [open])
  // Lista del mundo por páginas: pide 40 al directorio, y al llegar al final del scroll pide las siguientes. Nada se guarda.
  const ccOf = src.startsWith('cc:') ? src.slice(3) : '', tagOf = src.startsWith('t:') ? src.slice(2) : ''
  const pedir = async (key, cc, tag, off) => {
    setWorld(w => w.key !== key ? w : { ...w, loading: true, err: '' })
    try {
      const d = await fetch(`/api/radio/list?cc=${cc}&tag=${tag}&offset=${off}`).then(x => x.ok ? x.json() : Promise.reject(new Error('x')))
      setWorld(w => { if (w.key !== key) return w; const ids = new Set(w.items.map(s => s.id)), items = [...w.items, ...d.stations.filter(s => !ids.has(s.id))]; return { ...w, items, next: d.next, done: d.done || d.next >= MAXW, loading: false } })
    } catch { setWorld(w => w.key !== key ? w : { ...w, loading: false, err: 'No se pudo cargar.' }) }
  }
  useEffect(() => { if (!open || src === 'mias') return; setWorld({ key: src, items: [], next: 0, done: false, loading: false, err: '' }); pedir(src, ccOf, tagOf, 0) }, [open, src])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = endRef.current; if (!open || !el) return
    const io = new IntersectionObserver(es => { if (!es[0].isIntersecting) return; if (src === 'mias') setShown(n => n + 60); else if (world.key === src && !world.loading && !world.done && !world.err) pedir(src, ccOf, tagOf, world.next) }, { root: el.closest('.rd-list'), rootMargin: '300px' })
    io.observe(el); return () => io.disconnect()
  })  
  if (!r.stations.length && !r.cur) return <div className={'radio' + (docked ? ' docked' : '')}><div className="rd-bar"><button className="rd-now grow" onClick={() => openSell('radio')}><span className="rd-logo ph" style={{ width: 26, height: 26 }}><Radio size={14} /></span><span className="grow"><b>Radio</b><small>¿Tienes una emisora? Suena aquí</small></span></button></div></div>
  const base = src === 'mias' ? r.stations : world.key === src ? world.items : []
  const list = src === 'mias' ? base.slice(0, shown) : base
  return <div className={'radio' + (docked ? ' docked' : '') + (open ? ' open' : '')}>
    {open && <div className="rd-list">
      <div className="rd-h"><b>Emisoras</b><small>{r.stations.length} destacadas en {site.name} · y miles más del mundo</small></div>
      <button className="rd-tune" onClick={() => { dispatchEvent(new CustomEvent('planeta:tune')); setOpen(false) }}>Sintonizar la zona del mapa</button>
      <div className="rd-sel">
        <select value={src} onChange={e => { setSrc(e.target.value); setShown(60) }} aria-label="Qué emisoras mostrar">
          <option value="mias">Destacadas ({r.stations.length})</option>
          <optgroup label="Del mundo">
            <option value="mundo">Todo el mundo</option>
            <option value="t:sports">Deportes</option>
            <option value="t:news">Noticias</option>
            <option value="t:music">Música</option>
            <option value="t:religion">Religiosas</option>
          </optgroup>
          <optgroup label="Por país">{PAISES.map(c => <option key={c} value={'cc:' + c}>{nombreP?.of(c) || c}</option>)}</optgroup>
        </select>
      </div>
      {r.fav.length > 0 && src === 'mias' && <div className="rd-fav"><small>Mis favoritas</small>{r.fav.map(s => <button key={'f' + s.id} className={'rd-item' + (r.cur?.id === s.id ? ' on' : '')} onClick={() => { play(s); setOpen(false) }}><RadioLogo st={s} size={34} /><span className="grow"><b>{s.name}</b><small>{[s.genre, s.country].filter(Boolean).join(' · ')}</small></span>{r.cur?.id === s.id && r.playing ? <span className="rd-eq"><i /><i /><i /></span> : <Heart size={14} fill="currentColor" />}</button>)}</div>}
      <div className="rd-items">{list.map(s => <button key={s.id} className={'rd-item' + (r.cur?.id === s.id ? ' on' : '')} onClick={() => { play(s); setOpen(false) }}>
        <RadioLogo st={s} size={34} /><span className="grow"><b>{s.name}</b><small>{[s.genre, src === 'mias' ? s.city : s.country].filter(Boolean).join(' · ')}</small></span>
        {r.cur?.id === s.id && r.playing ? <span className="rd-eq"><i /><i /><i /></span> : <Play size={14} />}
      </button>)}</div>
      <div className="rd-end" ref={endRef}>{src !== 'mias' && (world.loading ? 'Cargando…' : world.err ? <button className="rd-retry" onClick={() => pedir(src, ccOf, tagOf, world.next)}>{world.err} Reintentar</button> : world.done ? (list.length ? 'Fin de la lista' : 'No hay emisoras aquí.') : '')}</div>
    </div>}
    <div className="rd-bar">
      {r.cur ? <>
        <button className="rd-x" onClick={prev} aria-label="Emisora anterior" title="Anterior"><SkipBack size={14} /></button>
        <button className="rd-play" onClick={toggle} aria-label={r.playing ? 'Pausar' : 'Escuchar'}>{r.loading ? <Loader2 size={15} className="spin" /> : r.playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <button className="rd-x" onClick={next} aria-label="Otra emisora" title="Otra emisora del mundo"><SkipForward size={14} /></button>
        <button className="rd-now grow" onClick={() => setOpen(o => !o)}><RadioLogo st={r.cur} size={26} /><span className="grow"><b>{r.cur.name}</b><small className={r.error ? 'err' : ''}>{r.error || (r.playing ? '● En vivo' : r.loading ? 'Conectando…' : 'En pausa')}</small></span></button>
        <button className={'rd-x rd-heart' + (r.fav.some(x => x.id === r.cur.id) ? ' on' : '')} onClick={() => toggleFav(r.cur)} aria-label="Guardar en mis favoritas" title="Guardar en mis favoritas"><Heart size={14} fill={r.fav.some(x => x.id === r.cur.id) ? 'currentColor' : 'none'} /></button>
        <label className="rd-vol" title="Volumen"><Volume2 size={14} /><input type="range" min="0" max="1" step="0.05" value={r.volume} onChange={e => setVolume(+e.target.value)} aria-label="Volumen" /></label>
        <button className="rd-x" onClick={() => setOpen(o => !o)} aria-label={open ? 'Minimizar' : 'Ver emisoras'} title={open ? 'Minimizar' : 'Ver emisoras'}>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
        <button className="rd-x" onClick={() => { stop(); setOpen(false) }} aria-label="Cerrar radio"><X size={14} /></button>
      </> : <><button className="rd-now grow" onClick={() => setOpen(o => !o)}><span className="rd-logo ph" style={{ width: 26, height: 26 }}>{DESK ? <FlatIcon name="radio" size={15} /> : <Radio size={14} />}</span><span className="grow"><b>Radio</b><small>{r.stations.length} emisoras en vivo</small></span>{DESK ? <FlatIcon name={open ? 'abajo' : 'arriba'} size={15} /> : open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button><button className="rd-dial" onClick={next} aria-label="Girar el dial" title="Poner una emisora del mundo"><Shuffle size={14} /><span>Girar el dial</span></button></>}
    </div>
  </div>
}

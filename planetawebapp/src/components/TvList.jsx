import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, Maximize2, Minimize2, Expand, ExternalLink } from 'lucide-react'
import FlatIcon from './FlatIcon'
import { RadioMenu } from './RadioBar'

// Ventana «Canales» (computador): canales de televisión que transmiten en vivo por YouTube. La lista llega del servidor (se administra en el panel);
// el video lo sirve el reproductor oficial de YouTube y solo se carga cuando se toca un canal (la lista no baja ningún video).
// Se puede ver en la ventana, ampliar a una ventana grande centrada o en pantalla completa.
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const okImg = u => /^(https:\/\/|\/uploads\/)[^"'<>\s]+$/.test(u || '')
const HUES = ['#e5484d', '#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#a855f7']
const hue = s => HUES[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]
const initials = n => String(n).replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'TV'
const SLUG = /^[A-Za-z0-9_-]{2,25}$/
const embed = c => c.platform === 'twitch' && SLUG.test(c.slug || '') ? `https://player.twitch.tv/?channel=${c.slug}&parent=${location.hostname}&autoplay=true&muted=false`
  : c.platform === 'kick' && SLUG.test(c.slug || '') ? `https://player.kick.com/${c.slug}?autoplay=true`
  : c.live && /^[\w-]{11}$/.test(c.video || '') ? `https://www.youtube-nocookie.com/embed/${c.video}?autoplay=1&playsinline=1&rel=0`
  : /^UC[\w-]{22}$/.test(c.channel || '') ? `https://www.youtube-nocookie.com/embed/live_stream?channel=${c.channel}&autoplay=1&playsinline=1&rel=0`
  : /^[\w-]{11}$/.test(c.video || '') ? `https://www.youtube-nocookie.com/embed/${c.video}?autoplay=1&playsinline=1&rel=0` : ''
const ytLink = c => c.platform === 'twitch' ? `https://www.twitch.tv/${c.slug}` : c.platform === 'kick' ? `https://kick.com/${c.slug}` : /^UC[\w-]{22}$/.test(c.channel || '') ? `https://www.youtube.com/channel/${c.channel}/live` : `https://www.youtube.com/watch?v=${c.video}`
const PLAT = { youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' }
let cache = null
const load = () => (cache = cache || fetch('/api/tv').then(r => r.ok ? r.json() : []).then(a => Array.isArray(a) ? a : []).catch(() => { cache = null; return [] }))
const Estado = ({ c }) => c.live === true ? <span className="tv-live">EN VIVO</span> : c.live === false ? <span className="tv-off">Sin transmisión</span> : null
const Logo = ({ c, size = 34 }) => okImg(c.logo) ? <img className="tv-i" src={c.logo} alt="" loading="lazy" width={size} height={size} /> : <span className="tv-i" style={{ background: hue(c.name), width: size, height: size }}>{initials(c.name)}</span>

export default function TvList({ onClose, mobile }) {
  const [list, setList] = useState(null), [q, setQ] = useState(''), [pais, setPais] = useState(''), [sel, setSel] = useState(null), [big, setBig] = useState(false), [force, setForce] = useState(false)
  const box = useRef(null)
  useEffect(() => { load().then(setList) }, [])
  const paises = useMemo(() => [...new Set((list || []).map(c => c.country).filter(Boolean))].sort(), [list])
  const rank = c => c.live === true ? 0 : c.live === false ? 2 : 1
  const shown = useMemo(() => { const t = norm(q); return (list || []).filter(c => (!pais || c.country === pais) && (!t || norm(c.name + ' ' + c.country).includes(t))).sort((a, b) => rank(a) - rank(b)) }, [list, q, pais])   
  const cur = sel != null ? (list || []).find(c => c.id === sel) : null
  useEffect(() => {
    const k = e => { if (e.key !== 'Escape') return; if (big) { e.stopPropagation(); setBig(false) } else onClose() }
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true)
  }, [big, onClose])
  const full = () => { try { const el = box.current; if (el?.requestFullscreen) el.requestFullscreen() } catch { /* el navegador no lo permite */ } }
  const player = c => c.live === false && !force ? <div className="tv-player tv-offline" ref={box}><b>Este canal no está transmitiendo ahora</b><span>{PLAT[c.platform] || 'YouTube'} no muestra una transmisión en vivo de este canal en este momento.</span><button className="tv-btn" onClick={() => setForce(true)}>Probar de todos modos</button></div> : <div className="tv-player" ref={box}>{embed(c) && <iframe src={embed(c)} title={c.name} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}</div>
  const actions = c => <div className="tv-b">
    {!mobile && <button className="tv-btn" onClick={() => setBig(b => !b)} title={big ? 'Achicar' : 'Ventana grande'}>{big ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span>{big ? 'Achicar' : 'Ampliar'}</span></button>}
    {canFull && <button className="tv-btn" onClick={full} title="Pantalla completa"><Expand size={15} /><span>Pantalla completa</span></button>}
    <a className="tv-btn" href={ytLink(c)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /><span>{PLAT[c.platform] || 'YouTube'}</span></a></div>
  const canFull = typeof document !== 'undefined' && !!document.fullscreenEnabled
  return <aside className={mobile ? 'sites-list tv-list mob-win' : 'city glass sites-list tv-list'}>
    <div className="sl-top">{cur ? <button className="pl-f-x tv-back" onClick={() => { setSel(null); setBig(false); setForce(false) }} aria-label="Volver a los canales" title="Volver"><ChevronLeft size={16} /></button> : null}<b>{cur ? cur.name : 'Canales'}</b><button className="pl-f-x" onClick={onClose} aria-label="Cerrar canales" title="Cerrar"><X size={15} /></button></div>
    {cur ? <>
      {big ? <div className="tv-ph"><span>Se ve en la ventana grande</span></div> : player(cur)}
      <div className="tv-h">{cur.name}</div><div className="tv-m">{cur.country ? cur.country + ' · ' : ''}{cur.platform === 'twitch' || cur.platform === 'kick' ? 'Transmisión en vivo por ' + PLAT[cur.platform] : 'Televisión en vivo por YouTube'}</div>
      {actions(cur)}
      <div className="bl-count" style={{ marginTop: 12 }}>Otros canales</div>
      <div className="sl-caps">{(list || []).filter(c => c.id !== cur.id).slice(0, 12).map(c => <button key={c.id} className="sl-cap" style={{ '--sc': hue(c.name) }} onClick={() => { setSel(c.id); setForce(false) }}><Logo c={c} /><span><b>{c.name}</b><small>{c.country}</small></span><Estado c={c} /></button>)}</div>
      {big && createPortal(<div className="tv-bg" onClick={() => setBig(false)}><div className="tv-pop" onClick={e => e.stopPropagation()}>
        <div className="tv-pop-top"><b>{cur.name}</b><button className="pl-f-x" onClick={() => setBig(false)} aria-label="Cerrar la ventana grande"><X size={16} /></button></div>
        {player(cur)}<div className="tv-pop-b">{actions(cur)}</div></div></div>, document.body)}
    </> : <>
      <label className="bl-search"><FlatIcon name="buscar" size={16} /><input autoFocus={!mobile} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar canal o país" maxLength={60} aria-label="Buscar canales" /></label>
      {paises.length > 1 && <div className="sl-sel"><RadioMenu value={pais} onChange={setPais} groups={[{ items: [{ v: '', t: 'Todos los países' }, ...paises.map(v => ({ v, t: v }))] }]} /></div>}
      <div className="bl-count">{list === null ? 'Cargando…' : !list.length ? 'Aún no hay canales. Se agregan desde el panel (Canales de TV).' : shown.length ? shown.length + (shown.length === 1 ? ' canal' : ' canales') : 'No hay canales con esa búsqueda.'}</div>
      <div className="sl-caps">{shown.map(c => <button key={c.id} className="sl-cap" style={{ '--sc': hue(c.name) }} onClick={() => { setSel(c.id); setForce(false) }}><Logo c={c} /><span><b>{c.name}</b><small>{c.country}</small></span><Estado c={c} /></button>)}</div>
    </>}
  </aside>
}

import { useEffect, useRef, useState } from 'react'
import { SCENES, PHOTOS, avatarUrl } from '../data'
import { TYPE } from '../util'
import FlatIcon from './FlatIcon'
import { useSite } from '../site'
import { useRadio, play as playRadio, stop as stopRadio, loadStations } from '../radio'
export function Avatar({ name = '', hue = 160, size = 36, ring, src: own }) {
  const [err, setErr] = useState(false)
  const ini = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const src = own || avatarUrl(name)
  return <div className={'avatar' + (ring ? ' ring' : '')} style={{ width: size, height: size, fontSize: size * .36, background: `linear-gradient(135deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 40% 26%))` }}>
    {src && !err ? <img src={src} alt="" onError={() => setErr(true)} loading="lazy" /> : ini}</div>
}
// small: lists, pins, stories (uses the thumbnail). play: show the video (autoplays muted while visible)
const LIVE_ST = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'], DONE_ST = ['FT', 'AET', 'PEN', 'AWD', 'WO']
// «Escuchar»: solo si el partido está EN VIVO y el administrador le asignó una emisora a la liga o al equipo (Panel → Partidos automáticos → Radio)
const plain = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
// Emisora para un partido en vivo: 1) regla del administrador (equipo, o liga); 2) si no hay regla y está activado el modo automático,
// una emisora deportiva o de noticias registrada en el país del estadio (la más escuchada, que es la primera de la lista).
const SPORTY = /deport|sport|futbol|football|soccer|noticia|news/i
function useMatchStation(m, country) {
  const site = useSite(), stations = useRadio(s => s.stations), rules = site.radioRules || [], live = LIVE_ST.includes(m.st), auto = site.radioAuto !== false && !!country
  useEffect(() => { if (live && (rules.length || auto) && !stations.length) loadStations() }, [live, rules.length, auto, stations.length])
  if (!live) return null
  const pick = t => rules.find(x => x.t === t && x.q && (t === 'equipo' ? [m.h, m.a].some(n => plain(n) === plain(x.q)) : plain(m.league).includes(plain(x.q))))
  const rule = pick('equipo') || pick('liga'), byRule = rule && stations.find(s => s.id === rule.s)
  if (byRule) return byRule
  if (!auto) return null
  const here = stations.filter(s => plain(s.country) === plain(country) && SPORTY.test(s.genre || ''))
  return here.find(s => /deport|sport|futbol|football|soccer/i.test(s.genre || '')) || here[0] || null
}
function MatchRadio({ st }) {
  const key = useRadio(s => (s.cur ? String(s.cur.id) : '') + '\u0001' + (s.playing || s.loading ? 1 : 0)), on = key === st.id + '\u0001' + 1
  return <button type="button" className={'mc-radio' + (on ? ' on' : '')} onClick={e => { e.stopPropagation(); on ? stopRadio() : playRadio(st) }} aria-label={on ? 'Dejar de escuchar ' + st.name : 'Escuchar en ' + st.name} title={st.name}>
    <FlatIcon name={on ? 'pausa' : 'radio'} size={14} /><span>{on ? 'Escuchando' : 'Escuchar'}</span>
  </button>
}
// afiche del partido: los dos escudos, marcador u hora, liga y estadio
function MatchCard({ m, h, radius, country, children }) {
  const station = useMatchStation(m, country), live = LIVE_ST.includes(m.st), done = DONE_ST.includes(m.st), ok = u => /^(https:\/\/|\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$)/.test(u || '')
  const when = new Date(m.ko).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return <div className={'media match-card' + (station ? ' has-radio' : '')} style={{ height: h, borderRadius: radius, backgroundImage: `linear-gradient(180deg,#05080dcc,#05080d99 40%,#05080de6),url('${(PHOTOS.estadio || '').replace('w=1200', 'w=800')}')` }}>
    <div className="mc-league">{m.league}</div>
    <div className="mc-row">
      <div className="mc-team">{ok(m.hl) && <img src={m.hl} alt="" />}<b>{m.h}</b></div>
      <div className="mc-mid">{live || done ? <span className="mc-score">{m.gh ?? 0} - {m.ga ?? 0}</span> : <span className="mc-vs">VS</span>}
        <small className={live ? 'mc-live' : ''}>{live ? (m.st === 'HT' ? 'Entretiempo' : 'EN VIVO · ' + (m.el || 0) + "'") : done ? 'Final' : when}</small></div>
      <div className="mc-team">{ok(m.al) && <img src={m.al} alt="" />}<b>{m.a}</b></div>
    </div>
    {m.venue && <div className="mc-venue">{m.venue}</div>}
    {station && <MatchRadio st={station} />}
    {children}
  </div>
}
export function Media({ post, h = 220, radius = 14, children, small, play, controls }) {
  const [err, setErr] = useState(false)
  if (post.match && !small) return <MatchCard m={post.match} country={post.country} h={h} radius={radius}>{children}</MatchCard>
  // sismo: tarjeta dibujada (magnitud grande, color según la fuerza), sin descargar fotos
  const qm = post.handle === 'alertas' && /magnitud\s+([\d.]+)/i.exec(post.title || '')
  if (qm) { const m = +qm[1], c = m >= 7 ? '#ff3b30' : m >= 6 ? '#ff6b2c' : m >= 5 ? '#ff9f1a' : '#ffc23d', place = String(post.title).split('·').slice(1).join('·').trim()
    return <div className={'media quake-card' + (small ? ' sm' : '')} style={{ height: h, borderRadius: radius, '--qc': c }}>
      {!small && <span className="qc-lbl">Sismo</span>}<b className="qc-mag">{m.toFixed(1)}</b>
      {!small && <><span className="qc-place">{place || post.city}</span><span className="qc-meta">{String(post.text || '').split('·').slice(0, 2).join('·')}</span></>}{children}</div> }
  // evento sin foto: tarjeta dibujada con el tipo, el nombre y la fecha (nunca una foto que no es del evento)
  if (post.handle === 'eventos' && !post.image && !post.thumb) { const head = String(post.text || '').split('\n')[0].split(' · '), kind = head[0] || 'Evento', when = (head[1] || '').replace(/^(Del |El )/, '')
    return <div className={'media ev-card' + (small ? ' sm' : '')} style={{ height: h, borderRadius: radius }}>
      <svg width={small ? 16 : 30} height={small ? 16 : 30} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" /></svg>
      {!small && <><span className="ec-k">{kind}</span><b className="ec-t">{post.title}</b><span className="ec-d">{when}{post.city ? ' · ' + post.city : ''}</span></>}{children}</div> }
  let still = (small && post.thumb) || post.image || post.thumb || (!err && post.handle !== 'eventos' && PHOTOS[post.scene])
  if (small && still && still.includes('images.unsplash.com')) still = still.replace('w=1200', 'w=240')
  const box = { height: h, borderRadius: radius, background: SCENES[post.scene] || SCENES.ciudad }
  if (post.video && play) return <div className="media" style={box}><AutoVideo src={post.video} poster={post.thumb} controls={controls} />{children}</div>
  return <div className="media" style={box}>
    {still && <img src={still} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} />}
    {post.video && <span className="vid-badge">▶</span>}{children}</div>
}
function AutoVideo({ src, poster, controls }) {
  const ref = useRef(null)
  useEffect(() => { const v = ref.current; if (!v || controls) return; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause() }, { threshold: 0.6 }); io.observe(v); return () => io.disconnect() }, [controls])
  return <video ref={ref} src={src} poster={poster || undefined} muted={!controls} loop={!controls} playsInline preload="metadata" controls={controls} autoPlay={controls} />
}
export function TypeTag({ type, glass }) {
  return <span className={`tag tag-${type}${glass ? ' glass' : ''}`}>{type === 'directo' && <i className="dot" />}{TYPE[type]}</span>
}

// Text with a "Traducir" link (uses the server translation; target = the viewer's language)
export function Translatable({ text, className }) {
  const [tr, setTr] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  if (!text) return null
  const go = async e => { e.stopPropagation(); if (tr) { setTr(null); return } setBusy(true); setErr('')
    try { const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, to: (navigator.language || 'es').slice(0, 2) }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setTr(d.text) } catch (x) { setErr(x.message || 'No se pudo traducir.') } finally { setBusy(false) } }
  return <span className={className}>{tr || text}<button type="button" className="tr-btn" onClick={go}>{busy ? 'Traduciendo…' : tr ? 'Ver original' : 'Traducir'}</button>{err && <span className="tr-err">{err}</span>}</span>
}

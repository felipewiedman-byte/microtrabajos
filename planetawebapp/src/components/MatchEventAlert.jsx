import { useEffect, useRef, useState } from 'react'
import { useSite } from '../site'
import { SCRIPT, whistle, crowd, speak, soundOn, unlock, locked } from '../matchAudio'
// Avisos de partido en vivo (inicio, tarjetas, entretiempo, final) con pitido de árbitro y voz. El gol tiene su propio aviso (GoalAlert).
export default function MatchEventAlert() {
  const site = useSite(), cfg = useRef(site); cfg.current = site
  const [n, setN] = useState(null), [lock, setLock] = useState(false), q = useRef([]), busy = useRef(false), timer = useRef(0), runRef = useRef(() => {})
  useEffect(() => {
    const un = () => { unlock(); setLock(false); runRef.current() }; addEventListener('pointerdown', un, { once: true }); addEventListener('keydown', un, { once: true })
    const run = async () => {
      if (busy.current) return; busy.current = true
      while (q.current.length) {
        const e = q.current.shift(), s = SCRIPT[e.kind]?.(e); if (!s) continue
        setN({ ...e, ...s }); clearTimeout(timer.current); timer.current = setTimeout(() => setN(null), 7000)
        if (soundOn()) { const ms = whistle(s.w); if (s.crowd && cfg.current.matchCrowd !== false) crowd(2.5); await new Promise(r => setTimeout(r, ms + 150)); await speak(s.say) }
        else await new Promise(r => setTimeout(r, 2500))
      }
      busy.current = false
    }
    runRef.current = run
    const f = ev => {
      const e = ev.detail, c = cfg.current
      if (!e || c.matchSound === false) return
      if ((c.matchSoundScope || 'all') !== 'all' && e.imp === 0) return   // solo partidos importantes (ajustable en el panel)
      if (q.current.length >= 5) q.current.shift()   // si se acumulan, se descarta lo más viejo
      q.current.push(e); if (soundOn() && locked()) setLock(true); run()
    }
    const g = () => { if (soundOn() && locked() && cfg.current.matchSound !== false) setLock(true) }   // un gol llegó y el navegador aún no deja sonar
    addEventListener('planeta:goal', g); addEventListener('planeta:matchev', f)
    return () => { removeEventListener('planeta:goal', g); removeEventListener('planeta:matchev', f); removeEventListener('pointerdown', un); removeEventListener('keydown', un); clearTimeout(timer.current) }
  }, [])
  const lockBtn = lock && <button type="button" className="ev-lock" onClick={() => { unlock(); setLock(false); runRef.current() }}>Toca para activar el sonido de los partidos</button>
  if (!n) return lockBtn || null
  return <>{lockBtn}<div className={'ev-alert ev-' + n.tone} role="status"><i className="ev-chip" /><span className="grow"><b>{n.title}{n.min && (n.kind === 'yellow' || n.kind === 'red') ? " · " + n.min + "'" : ''}</b>
    <small>{n.player ? n.player + ' (' + n.team + ') · ' : ''}{n.h} {n.gh} - {n.ga} {n.a}</small></span></div></>
}

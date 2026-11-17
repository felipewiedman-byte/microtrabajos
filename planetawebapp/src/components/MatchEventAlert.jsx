import { useEffect, useRef, useState } from 'react'
import { useSite } from '../site'
import { SCRIPT, whistle, crowd, speak, soundOn, unlock } from '../matchAudio'
// Avisos de partido en vivo (inicio, tarjetas, entretiempo, final) con pitido de árbitro y voz. El gol tiene su propio aviso (GoalAlert).
export default function MatchEventAlert() {
  const site = useSite(), cfg = useRef(site); cfg.current = site
  const [n, setN] = useState(null), q = useRef([]), busy = useRef(false), timer = useRef(0)
  useEffect(() => {
    const un = () => unlock(); addEventListener('pointerdown', un, { once: true }); addEventListener('keydown', un, { once: true })
    const run = async () => {
      if (busy.current) return; busy.current = true
      while (q.current.length) {
        const e = q.current.shift(), s = SCRIPT[e.kind]?.(e); if (!s) continue
        setN({ ...e, ...s }); clearTimeout(timer.current); timer.current = setTimeout(() => setN(null), 7000)
        if (soundOn()) { const ms = whistle(s.w); if (s.crowd) crowd(2.5); await new Promise(r => setTimeout(r, ms + 150)); await speak(s.say) }
        else await new Promise(r => setTimeout(r, 2500))
      }
      busy.current = false
    }
    const f = ev => {
      const e = ev.detail, c = cfg.current
      if (!e || c.matchSound === false) return
      if ((c.matchSoundScope || 'important') !== 'all' && e.imp === 0) return   // solo partidos importantes (ajustable en el panel)
      if (q.current.length >= 5) q.current.shift()   // si se acumulan, se descarta lo más viejo
      q.current.push(e); run()
    }
    addEventListener('planeta:matchev', f)
    return () => { removeEventListener('planeta:matchev', f); removeEventListener('pointerdown', un); removeEventListener('keydown', un); clearTimeout(timer.current) }
  }, [])
  if (!n) return null
  return <div className={'ev-alert ev-' + n.tone} role="status"><i className="ev-chip" /><span className="grow"><b>{n.title}{n.min && (n.kind === 'yellow' || n.kind === 'red') ? " · " + n.min + "'" : ''}</b>
    <small>{n.player ? n.player + ' (' + n.team + ') · ' : ''}{n.h} {n.gh} - {n.ga} {n.a}</small></span></div>
}

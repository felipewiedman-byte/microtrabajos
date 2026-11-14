import { useMemo } from 'react'
import { Play, Pause } from 'lucide-react'

// Máquina del tiempo: arrastra para ver el mapa de las últimas 1 a 24 horas; ▶ reproduce el día.
// Las barras muestran cuánta actividad hubo en cada hora (derecha = más antiguo).
export default function TimeMachine({ posts, hours, setHours, playing, setPlaying }) {
  const bars = useMemo(() => { const b = Array(24).fill(0), t = Date.now(); for (const p of posts) { const i = Math.floor((t - p.at) / 3600e3); if (i >= 0 && i < 24) b[i]++ } return b }, [posts])
  const max = Math.max(1, ...bars)
  const go = () => { if (playing) return setPlaying(false); if (hours >= 24) setHours(1); setPlaying(true) }
  return <div className="tm glass" role="group" aria-label="Máquina del tiempo">
    <button className="tm-play" onClick={go} aria-label={playing ? 'Pausar' : 'Reproducir el día'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
    <div className="tm-mid">
      <div className="tm-bars" aria-hidden="true">{bars.map((n, i) => <i key={i} className={i < hours ? 'on' : ''} style={{ height: 3 + Math.round(n / max * 17) }} />)}</div>
      <input type="range" min="1" max="24" value={hours} onChange={e => { setPlaying(false); setHours(+e.target.value) }} aria-label="Horas hacia atrás" />
    </div>
    <div className="tm-l"><b>{hours >= 24 ? 'Todo' : 'Últimas ' + hours + ' h'}</b><small>{playing ? 'reproduciendo…' : 'máquina del tiempo'}</small></div>
  </div>
}

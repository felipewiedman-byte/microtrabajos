import { useRef } from 'react'

// palanca táctil (adelante/atrás y giro) y aviso con los controles
export default function WalkHud({ joy, onExit }) {
  const knob = useRef(null), ref = useRef(null), act = useRef(false)
  const set = e => { const r = ref.current.getBoundingClientRect(), R = r.width / 2
    let x = e.clientX - r.left - R, y = e.clientY - r.top - R; const d = Math.hypot(x, y); if (d > R) { x = x / d * R; y = y / d * R }
    joy.current = { x: x / R, y: -y / R }; knob.current.style.transform = `translate(${x}px,${y}px)` }
  const end = () => { act.current = false; joy.current = { x: 0, y: 0 }; if (knob.current) knob.current.style.transform = '' }
  return <div className="walk-hud">
    <div className="walk-tip"><span>Caminando por el mapa 3D</span><small className="walk-keys">W A S D o flechas · Shift corre · arrastra para mirar</small><button onClick={onExit}>Salir</button></div>
    <div className="walk-pad" ref={ref} onPointerDown={e => { act.current = true; e.currentTarget.setPointerCapture(e.pointerId); set(e) }} onPointerMove={e => act.current && set(e)} onPointerUp={end} onPointerCancel={end}><i ref={knob} /></div>
  </div>
}

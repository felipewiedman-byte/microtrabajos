import { useEffect, useRef, useState } from 'react'
import { DESK_WINDOWS, applyDesk } from '../layout'

// Editor visual del computador. Solo existe dentro de la vista previa del panel (?preview=1&desk=1): cada ventana
// recibe un marco que se arrastra y cambia de tamaño. Las posiciones se guardan en % de la pantalla y se mandan al panel.
const SEL = { menu: '.side.rail', panel: '.pl-panel, .city, .composer, .sheet-bg>.sheet', search: '.pl-bar', ctl: '.map-ctrl', radio: '.radio' }
const visible = el => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden' }
const find = id => [...document.querySelectorAll(SEL[id])].find(visible)

export default function DeskEditor({ desk, onChange }) {
  const [boxes, setBoxes] = useState([]), cur = useRef(desk || {}), drag = useRef(null)
  const measure = () => setBoxes(DESK_WINDOWS.map(([id, label]) => { const el = find(id); if (!el) return null; const r = el.getBoundingClientRect(); return { id, label, x: r.left, y: r.top, w: r.width, h: r.height } }).filter(Boolean))
  useEffect(() => { cur.current = desk || {}; measure() }, [desk])
  useEffect(() => { measure(); const t = setInterval(measure, 900); addEventListener('resize', measure); return () => { clearInterval(t); removeEventListener('resize', measure) } }, [])
  const down = (e, id, mode) => {
    e.preventDefault(); e.stopPropagation()
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, b: boxes.find(x => x.id === id), init: { ...(cur.current[id] || {}) } }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* sin captura */ }
  }
  const move = e => {
    const d = drag.current; if (!d) return
    const W = innerWidth, H = innerHeight, dx = (e.clientX - d.sx) / W * 100, dy = (e.clientY - d.sy) / H * 100
    const bx = d.b.x / W * 100, by = d.b.y / H * 100, bw = d.b.w / W * 100, bh = d.b.h / H * 100, top = DESK_WINDOWS.find(w => w[0] === d.id)[2] === 'top'
    const o = d.mode === 'move' ? (top ? { l: bx + dx, t: by + dy } : { l: bx + dx, b: 100 - (by + bh) - dy })
      : (top ? { w: bw + dx, h: bh + dy } : { w: bw + dx, h: bh + dy, b: 100 - (by + bh) - dy })
    const clean = {}; for (const [k, v] of Object.entries(o)) clean[k] = Math.round(Math.max(k === 'w' ? 4 : k === 'h' ? 3 : 0, Math.min(100, v)) * 100) / 100
    // al mover se conserva el tamaño actual, para que la ventana no cambie de forma al soltarla
    if (d.mode === 'move') { clean.w = Math.round(bw * 100) / 100; clean.h = Math.round(bh * 100) / 100 }
    cur.current = { ...cur.current, [d.id]: { ...d.init, ...clean } }
    applyDesk(cur.current); requestAnimationFrame(measure)
  }
  const up = () => { if (!drag.current) return; drag.current = null; measure(); onChange(cur.current) }
  return <div className="dk-edit" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    {boxes.map(b => <div key={b.id} className="dk-box" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} onPointerDown={e => down(e, b.id, 'move')}>
      <span className="dk-tag">{b.label}</span><i className="dk-grip" onPointerDown={e => down(e, b.id, 'size')} />
    </div>)}
  </div>
}

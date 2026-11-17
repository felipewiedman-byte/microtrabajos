// Modo «Recorrer»: la cámara baja a la altura de una persona y camina por el mapa 3D dibujado (no usa fotos).
// Computador: W A S D o flechas (↑↓ caminar, ←→ girar), Shift corre, arrastrar con el ratón para mirar. Celular: palanca en pantalla y arrastrar para mirar.
import { useEffect, useRef } from 'react'

const M_LAT = 111320
export function useWalk(mapRef, on) {
  const joy = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const m = mapRef.current; if (!on || !m) return
    const saved = { z: m.getZoom(), p: m.getPitch(), mp: m.getMaxPitch(), mz: m.getMaxZoom() }
    const hs = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'dragRotate', 'keyboard']
    const was = hs.map(h => m[h]?.isEnabled?.())
    hs.forEach(h => m[h]?.disable?.())
    m.setMaxZoom(24); m.setMaxPitch(85)
    m.easeTo({ zoom: 22, pitch: 84, duration: 900 })
    const keys = new Set()
    const kd = e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const k = e.key.toLowerCase(); if ('wasdqe'.includes(k) && k.length === 1 || k.startsWith('arrow') || k === 'shift') { keys.add(k); e.preventDefault() } }
    const ku = e => keys.delete(e.key.toLowerCase())
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', () => keys.clear())
    // mirar: arrastrar con el ratón o con un dedo
    const box = m.getCanvasContainer(); let drag = null
    const pd = e => { if (e.target.closest?.('.walk-hud')) return; drag = { x: e.clientX, y: e.clientY } }
    const pm = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }
      m.jumpTo({ bearing: m.getBearing() - dx * 0.3, pitch: Math.max(60, Math.min(85, m.getPitch() - dy * 0.2)) }) }
    const pu = () => { drag = null }
    box.addEventListener('pointerdown', pd); addEventListener('pointermove', pm); addEventListener('pointerup', pu); addEventListener('pointercancel', pu)
    let raf = 0, last = performance.now()
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - joy.current.y
      const sd = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
      const tn = (keys.has('e') || keys.has('arrowright') ? 1 : 0) - (keys.has('q') || keys.has('arrowleft') ? 1 : 0) + joy.current.x
      if (f || sd || tn) {
        const b = m.getBearing() + tn * 70 * dt, c = m.getCenter(), v = (keys.has('shift') ? 14 : 5) * dt
        const r = b * Math.PI / 180, dN = (Math.cos(r) * f - Math.sin(r) * sd) * v, dE = (Math.sin(r) * f + Math.cos(r) * sd) * v
        m.jumpTo({ bearing: b, center: [c.lng + dE / (M_LAT * Math.max(0.2, Math.cos(c.lat * Math.PI / 180))), c.lat + dN / M_LAT] })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku)
      box.removeEventListener('pointerdown', pd); removeEventListener('pointermove', pm); removeEventListener('pointerup', pu); removeEventListener('pointercancel', pu)
      try { hs.forEach((h, i) => was[i] && m[h]?.enable?.()); m.setMaxPitch(saved.mp); m.setMaxZoom(saved.mz); m.easeTo({ zoom: Math.min(saved.z, 19), pitch: Math.min(saved.p, saved.mp), duration: 600 }) } catch { /* mapa cerrado */ }
    }
  }, [mapRef, on])
  return joy
}

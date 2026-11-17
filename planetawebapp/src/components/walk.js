// Modo «A PIE»: la persona camina por el mapa 3D dibujado (no usa fotos). Cámara en primera persona a 1.7 m que gira sobre sí misma,
// y los edificios son sólidos: no se atraviesan, se bordean. Computador: W A S D / flechas, Shift corre, arrastrar para mirar. Celular: palanca y arrastrar.
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { toPolys, step, M_LAT } from './walkgeo'

const EYE = 1.7   // altura de los ojos, en metros
export function useWalk(mapRef, on) {
  const joy = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const m = mapRef.current; if (!on || !m) return
    const saved = { mp: m.getMaxPitch(), mz: m.getMaxZoom(), mnp: m.getMinPitch?.() ?? 0, z: m.getZoom() }
    const hs = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'dragRotate', 'keyboard']
    const was = hs.map(h => m[h]?.isEnabled?.())
    hs.forEach(h => m[h]?.disable?.())
    m.setMaxZoom(24)
    const c0 = m.getCenter(), me = { lon: c0.lng, lat: c0.lat, b: m.getBearing(), p: 88 }   // p: 90 = mirando al horizonte
    const place = () => { try { const cam = m.getFreeCameraOptions(); cam.position = maplibregl.MercatorCoordinate.fromLngLat([me.lon, me.lat], EYE); cam.setPitchBearing(me.p, me.b); m.setFreeCameraOptions(cam) } catch { /* mapa cerrado */ } }
    place()
    // edificios cercanos (los mismos que se dibujan) para no atravesarlos; se renuevan al caminar
    let polys = [], at = { lon: 1e9, lat: 1e9, t: 0 }
    const refresh = force => { const d = Math.hypot((me.lon - at.lon) * M_LAT * Math.cos(me.lat * Math.PI / 180), (me.lat - at.lat) * M_LAT), t = performance.now()
      if (!force && d < 25 && t - at.t < 4000) return; at = { lon: me.lon, lat: me.lat, t }
      try { const all = toPolys(m.querySourceFeatures('omt', { sourceLayer: 'building' })), k = 0.0016; polys = all.filter(p => p.c > me.lon - k && p.a < me.lon + k && p.d > me.lat - k && p.b < me.lat + k) } catch { /* sin edificios cargados */ } }
    refresh(true)
    const keys = new Set()
    const kd = e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const k = e.key.toLowerCase(); if ('wasdqe'.includes(k) && k.length === 1 || k.startsWith('arrow') || k === 'shift') { keys.add(k); e.preventDefault() } }
    const ku = e => keys.delete(e.key.toLowerCase()), bl = () => keys.clear()
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', bl)
    // mirar: arrastrar con el ratón o con un dedo (gira sobre sí mismo y sube/baja la mirada)
    const box = m.getCanvasContainer(); let drag = null
    const pd = e => { if (e.target.closest?.('.walk-hud')) return; drag = { x: e.clientX, y: e.clientY } }
    const pm = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }
      me.b = (me.b + dx * 0.25) % 360; me.p = Math.max(65, Math.min(115, me.p - dy * 0.2)); place() }
    const pu = () => { drag = null }
    box.addEventListener('pointerdown', pd); addEventListener('pointermove', pm); addEventListener('pointerup', pu); addEventListener('pointercancel', pu)
    let raf = 0, last = performance.now()
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - joy.current.y   // palanca: arriba = adelante
      const sd = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
      const tn = (keys.has('e') || keys.has('arrowright') ? 1 : 0) - (keys.has('q') || keys.has('arrowleft') ? 1 : 0) + joy.current.x
      if (f || sd || tn) {
        me.b = (me.b + tn * 80 * dt) % 360
        if (f || sd) {
          const v = (keys.has('shift') ? 12 : 4) * dt, r = me.b * Math.PI / 180
          const dN = (Math.cos(r) * -f * -1 - Math.sin(r) * sd) * v, dE = (Math.sin(r) * f + Math.cos(r) * sd) * v
          ;[me.lon, me.lat] = step(polys, me.lon, me.lat, dN, dE); refresh(false)
        }
        place()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', bl)
      box.removeEventListener('pointerdown', pd); removeEventListener('pointermove', pm); removeEventListener('pointerup', pu); removeEventListener('pointercancel', pu)
      try { hs.forEach((h, i) => was[i] && m[h]?.enable?.()); m.setMaxZoom(saved.mz); m.setMaxPitch(saved.mp); m.jumpTo({ center: [me.lon, me.lat], zoom: Math.min(saved.z, 18), pitch: 55, bearing: me.b }) } catch { /* mapa cerrado */ }
    }
  }, [mapRef, on])
  return joy
}

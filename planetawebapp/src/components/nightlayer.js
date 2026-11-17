import { useEffect } from 'react'
// Sombra de la noche sobre el mapa plano: se calcula con la hora real (posición del sol) y se mueve sola cada minuto.
// No descarga nada: unos pocos puntos en el propio navegador. Se detiene si la pestaña está oculta.
const R = Math.PI / 180
export function nightPolygon(d = new Date()) {
  const day = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5
  const decl = -23.44 * Math.cos(R * 360 / 365 * (day + 10))                       // declinación del sol (grados)
  const B = R * 360 / 365 * (day - 81), eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B) // ecuación del tiempo (min)
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
  const lonSun = -15 * (h - 12 + eot / 60)                                         // longitud donde el sol está en lo más alto
  const dd = Math.abs(decl) < 0.05 ? 0.05 : decl, pts = []
  for (let lon = -180; lon <= 180; lon += 2) pts.push([lon, Math.max(-85, Math.min(85, Math.atan(-Math.cos((lon - lonSun) * R) / Math.tan(dd * R)) / R))])
  const pole = dd > 0 ? -85 : 85
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...pts, [180, pole], [-180, pole], pts[0]]] } }
}
export function useNightLayer(mapRef, ready, active) {
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const off = () => { try { if (m.getLayer('noche-sombra')) m.removeLayer('noche-sombra'); if (m.getSource('noche-sombra')) m.removeSource('noche-sombra') } catch { /* mapa cerrado */ } }
    if (!active) { off(); return }
    const put = () => {
      if (!m.getStyle()) return
      const data = nightPolygon()
      const src = m.getSource('noche-sombra')
      if (src) { src.setData(data); return }
      m.addSource('noche-sombra', { type: 'geojson', data })
      const before = m.getStyle().layers.find(l => l.type === 'symbol')?.id
      m.addLayer({ id: 'noche-sombra', type: 'fill', source: 'noche-sombra', paint: { 'fill-color': '#02060f', 'fill-opacity': 0.34, 'fill-antialias': false } }, before)
    }
    const run = () => { if (m.isStyleLoaded()) put(); else m.once('idle', run) }   // si el mapa aún está cargando, se espera a que termine
    run()
    const t = setInterval(() => { if (!document.hidden) put() }, 60e3)
    const v = () => { if (!document.hidden) put() }; document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); off() }
  }, [mapRef, ready, active])
}

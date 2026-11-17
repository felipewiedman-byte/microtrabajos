import { useEffect, useState } from 'react'
// Capa de lluvia en vivo (RainViewer, gratis y sin llave): radar de las últimas horas, se actualiza cada 10 min.
// Solo se descarga si la persona la enciende. El estado (encendida/apagada) se comparte entre el mapa plano y el 3D.
let meta = null, metaAt = 0, on = (() => { try { return localStorage.getItem('rain') === '1' } catch { return false } })()
const subs = new Set()
export function useRainOn() {
  const [v, setV] = useState(on)
  useEffect(() => { subs.add(setV); return () => subs.delete(setV) }, [])
  return [v, x => { on = x; try { localStorage.setItem('rain', x ? '1' : '0') } catch { /* sin almacenamiento */ } subs.forEach(f => f(x)) }]
}
async function latest() {
  if (meta && Date.now() - metaAt < 10 * 60e3) return meta
  const d = await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r => r.json())
  const f = d.radar?.past?.at(-1); if (!f) throw new Error('sin radar')
  meta = { url: d.host + f.path + '/512/{z}/{x}/{y}/2/1_1.png' }; metaAt = Date.now(); return meta
}
// pone o quita la capa en un mapa de MapLibre (debajo de los nombres y pines)
export function useRainLayer(mapRef, ready, active) {
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    let dead = false
    const off = () => { try { if (m.getLayer('lluvia')) m.removeLayer('lluvia'); if (m.getSource('lluvia')) m.removeSource('lluvia') } catch { /* mapa cerrado */ } }
    if (!active) { off(); return }
    const put = () => latest().then(x => {
      if (dead || !m.getStyle()) return; off()
      m.addSource('lluvia', { type: 'raster', tiles: [x.url], tileSize: 512, maxzoom: 6, attribution: 'Lluvia © RainViewer' })
      const before = m.getStyle().layers.find(l => l.type === 'symbol')?.id
      m.addLayer({ id: 'lluvia', type: 'raster', source: 'lluvia', maxzoom: 8.5, paint: { 'raster-opacity': 0.6, 'raster-fade-duration': 0 } }, before)   // solo de lejos (mundo, país, región): al acercarse a una ciudad no se piden más mapas de lluvia
    }).catch(() => { /* sin conexión al radar: el mapa sigue igual */ })
    const run = () => { if (dead) return; if (m.isStyleLoaded()) put(); else m.once('idle', run) }   // si el mapa aún está cargando, se espera a que termine
    run()
    const t = setInterval(() => { if (!document.hidden) put() }, 10 * 60e3)   // con la pestaña oculta no se consulta nada
    return () => { dead = true; clearInterval(t) }
  }, [mapRef, ready, active])
}

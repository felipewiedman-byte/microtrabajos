import { useEffect, useRef } from 'react'
// Eventos del mundo (Wikidata, vía /api/world-events): lista en memoria + capa de puntos del mapa.
// Los puntos van en una sola capa del propio mapa (no son marcadores HTML), así 1.500 eventos pesan casi nada
// y quedan debajo de los pines de las publicaciones.
export const EV_KINDS = { festival: ['Festivales', '#ec4899'], concierto: ['Conciertos', '#a855f7'], exposicion: ['Exposiciones', '#f59e0b'], congreso: ['Congresos', '#3b82f6'], deporte: ['Deportes', '#22c55e'] }
let cache = null
export function loadWorldEvents() {
  cache = cache || fetch('/api/world-events').then(r => r.ok ? r.json() : []).then(a => Array.isArray(a) ? a : []).catch(() => { cache = null; return [] })
  return cache
}
const SRC = 'wd-eventos'
export function useEventsLayer(mapRef, ready, events, selId, onPick) {
  const cb = useRef(onPick); cb.current = onPick
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return
    const off = () => { try { for (const l of [SRC + '-sel', SRC]) if (m.getLayer(l)) m.removeLayer(l); if (m.getSource(SRC)) m.removeSource(SRC) } catch { /* mapa cerrado */ } }
    if (!events || !events.length) { off(); return }
    const data = { type: 'FeatureCollection', features: events.map(e => ({ type: 'Feature', id: undefined, properties: { id: e.id, k: e.kind }, geometry: { type: 'Point', coordinates: [e.lon, e.lat] } })) }
    const put = () => {
      if (!m.getStyle()) return
      const s = m.getSource(SRC); if (s) { s.setData(data); return }
      m.addSource(SRC, { type: 'geojson', data })
      const col = ['match', ['get', 'k'], ...Object.entries(EV_KINDS).flatMap(([k, v]) => [k, v[1]]), '#ec4899']
      m.addLayer({ id: SRC, type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 6, 5, 12, 7], 'circle-color': col, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-opacity': 0.92 } })
      m.addLayer({ id: SRC + '-sel', type: 'circle', source: SRC, filter: ['==', ['get', 'id'], ''], paint: { 'circle-radius': 11, 'circle-color': col, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } })
    }
    const run = () => { if (m.isStyleLoaded()) put(); else m.once('idle', run) }
    run()
    const click = e => { const f = e.features?.[0]; if (f) cb.current?.(f.properties.id) }
    const enter = () => { m.getCanvas().style.cursor = 'pointer' }, leave = () => { m.getCanvas().style.cursor = '' }
    const bind = () => { if (m.getLayer(SRC)) { m.on('click', SRC, click); m.on('mouseenter', SRC, enter); m.on('mouseleave', SRC, leave) } else m.once('idle', bind) }
    bind()
    return () => { try { m.off('click', SRC, click); m.off('mouseenter', SRC, enter); m.off('mouseleave', SRC, leave) } catch { /* mapa cerrado */ } off() }
  }, [mapRef, ready, events])
  useEffect(() => { const m = mapRef.current; if (!m || !ready) return; const f = () => { try { if (m.getLayer(SRC + '-sel')) m.setFilter(SRC + '-sel', ['==', ['get', 'id'], selId || '']) } catch { /* sin capa */ } }; if (m.isStyleLoaded()) f(); else m.once('idle', f) }, [mapRef, ready, selId, events])
}

import { useEffect } from 'react'
import { UP, buildingHeight } from './mapStyle'
// Ajustes de la vista 3D que se manejan desde el panel («Mapa 3D»): luz, alturas, estadios y relieve.
// Con todo apagado el mapa queda exactamente como el original. Cambian en vivo cuando se guardan en el panel.
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
let stadiumsP = null
const loadStadiums = () => (stadiumsP = stadiumsP || fetch('/api/stadiums').then(r => r.ok ? r.json() : null).catch(() => { stadiumsP = null; return null }))
const LIGHT_OFF = { anchor: 'viewport', color: '#ffffff', intensity: 0.5, position: [1.15, 210, 30] }
export function useMap3D(mapRef, vector, c) {
  const { light, lightK, variety, heightK, stadiums, terrain } = c
  useEffect(() => {
    const m = mapRef.current; if (!m || !vector) return
    let dead = false
    const apply = () => {
      if (dead) return
      const k = Math.min(3, Math.max(0.5, (+heightK || 100) / 100))
      try {
        m.setLight(light ? { anchor: 'viewport', color: '#ffffff', intensity: Math.min(0.95, Math.max(0.2, (+lightK || 60) / 100 * 0.9)), position: [1.6, 215, 38] } : LIGHT_OFF)
        if (m.getLayer('edificios')) { m.setPaintProperty('edificios', 'fill-extrusion-height', buildingHeight(k, !!variety)); m.setPaintProperty('edificios', 'fill-extrusion-vertical-gradient', true) }
      } catch { /* versión sin esta opción */ }
      try {   // estadios con su forma y altura
        if (stadiums) {
          loadStadiums().then(fc => {
            if (dead || !fc || !fc.features?.length) return
            const h = ['interpolate', ['linear'], ['zoom'], UP, 0, UP + 1.2, ['*', k, ['get', 'h']]]
            if (m.getSource('estadios3d')) m.getSource('estadios3d').setData(fc)
            else m.addSource('estadios3d', { type: 'geojson', data: fc })
            if (m.getLayer('estadios3d')) m.setPaintProperty('estadios3d', 'fill-extrusion-height', h)
            else { const before = m.getStyle().layers.find(l => l.type === 'symbol')?.id; m.addLayer({ id: 'estadios3d', type: 'fill-extrusion', source: 'estadios3d', minzoom: UP, paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-opacity': 0.96, 'fill-extrusion-height': h, 'fill-extrusion-base': 0 } }, before) }
          })
        } else { if (m.getLayer('estadios3d')) m.removeLayer('estadios3d'); if (m.getSource('estadios3d')) m.removeSource('estadios3d') }
      } catch { /* sin estadios */ }
      try {   // relieve: solo en computador (en el celular pesa)
        const desk = typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches
        if (terrain && desk) {
          if (!m.getSource('dem3d')) m.addSource('dem3d', { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Relieve: Mapzen / AWS Terrain Tiles' })
          m.setTerrain({ source: 'dem3d', exaggeration: 1.15 })
        } else { if (m.getTerrain && m.getTerrain()) m.setTerrain(null); if (m.getSource('dem3d')) m.removeSource('dem3d') }
      } catch { /* sin relieve */ }
    }
    if (m.isStyleLoaded()) apply(); else m.once('idle', apply)
    return () => { dead = true }
  }, [mapRef, vector, light, lightK, variety, heightK, stadiums, terrain])    
}

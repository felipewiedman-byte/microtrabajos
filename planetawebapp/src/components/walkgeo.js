// Geometría pura del modo «A PIE» (sin mapa): colisión contra los edificios dibujados.
// Un polígono = [anillo exterior, huecos…] en [lon, lat]; un punto dentro de un hueco (la cancha de un estadio) SÍ se puede pisar.
export const M_LAT = 111320
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c } return c }
export const inPoly = (x, y, rings) => { if (!inRing(x, y, rings[0])) return false; for (let k = 1; k < rings.length; k++) if (inRing(x, y, rings[k])) return false; return true }
// polígonos con su caja, para descartar rápido
export function toPolys(features) {
  const out = [], seen = new Set()
  const add = rings => { const o = rings[0]; if (!o || o.length < 4) return; let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of o) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y }
    const k = o.length + ':' + o[0][0].toFixed(6) + ',' + o[0][1].toFixed(6); if (seen.has(k)) return; seen.add(k); out.push({ rings, a, b, c, d }) }
  for (const f of features || []) { const g = f.geometry; if (!g) continue; if (g.type === 'Polygon') add(g.coordinates); else if (g.type === 'MultiPolygon') for (const p of g.coordinates) add(p) }
  return out
}
export const blocked = (polys, x, y) => { for (const p of polys) if (x >= p.a && x <= p.c && y >= p.b && y <= p.d && inPoly(x, y, p.rings)) return true; return false }
// mueve a la persona dNorte/dEste metros; si choca con una pared, se desliza por ella (prueba cada eje por separado)
export function step(polys, lon, lat, dN, dE) {
  const k = M_LAT * Math.max(0.2, Math.cos(lat * Math.PI / 180)), R = 0.45   // radio del cuerpo en metros
  const ok = (la, lo, nx, ny) => !blocked(polys, lo, la) && !blocked(polys, lo + nx * R / k, la + ny * R / M_LAT)
  const len = Math.hypot(dN, dE) || 1, nx = dE / len, ny = dN / len
  let la = lat + dN / M_LAT, lo = lon + dE / k
  if (ok(la, lo, nx, ny)) return [lo, la]
  la = lat + dN / M_LAT; lo = lon; if (dN && ok(la, lo, 0, Math.sign(dN))) return [lo, la]
  la = lat; lo = lon + dE / k; if (dE && ok(la, lo, Math.sign(dE), 0)) return [lo, la]
  return [lon, lat]
}

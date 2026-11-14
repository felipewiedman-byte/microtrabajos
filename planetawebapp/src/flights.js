// Vuelos SIMULADOS (demostración): rutas reales entre aeropuertos, posiciones calculadas por la hora.
// No usan internet ni el servidor. Para vuelos reales se conectaría un servicio de datos de aviación.
const AP = { BOG: [4.70, -74.15], MDE: [6.17, -75.43], CTG: [10.44, -75.51], CLO: [3.54, -76.38], MIA: [25.79, -80.29], JFK: [40.64, -73.78], MEX: [19.44, -99.07], LIM: [-12.02, -77.11], GRU: [-23.43, -46.47], EZE: [-34.82, -58.54], SCL: [-33.39, -70.79], PTY: [9.07, -79.38], MAD: [40.49, -3.57], CDG: [49.01, 2.55], LHR: [51.47, -0.45], FRA: [50.04, 8.56], IST: [41.28, 28.75], DXB: [25.25, 55.36], DOH: [25.27, 51.61], DEL: [28.56, 77.10], SIN: [1.36, 103.99], HKG: [22.31, 113.91], NRT: [35.77, 140.39], ICN: [37.46, 126.44], SYD: [-33.94, 151.18], LAX: [33.94, -118.41], SFO: [37.62, -122.38], ORD: [41.97, -87.91], YYZ: [43.68, -79.63], JNB: [-26.14, 28.24], CAI: [30.12, 31.41], LOS: [6.58, 3.32], CPT: [-33.97, 18.60], AMS: [52.31, 4.76], FCO: [41.80, 12.25], BCN: [41.30, 2.08], LIS: [38.77, -9.13], PEK: [40.08, 116.58], BKK: [13.69, 100.75], CUN: [21.04, -86.88], UIO: [-0.13, -78.36], SJO: [9.99, -84.21] }
const ROUTES = 'BOG-MIA BOG-MAD BOG-MEX BOG-PTY BOG-JFK BOG-LIM BOG-CTG BOG-MDE BOG-CLO MDE-MIA CTG-MIA CTG-PTY PTY-MIA PTY-SJO MEX-CUN MEX-LAX JFK-LHR JFK-CDG JFK-MAD MIA-GRU MIA-EZE GRU-LIS GRU-EZE SCL-LIM LIM-UIO MAD-LIS MAD-CDG LHR-DXB LHR-JFK CDG-DXB FRA-SIN DXB-SIN DOH-SYD IST-DEL DEL-SIN SIN-HKG HKG-NRT ICN-LAX NRT-SFO SFO-JFK LAX-ORD ORD-YYZ YYZ-LHR JNB-DXB CAI-IST LOS-LHR CPT-JNB AMS-JFK FCO-JFK BCN-MIA PEK-FRA BKK-SIN HKG-SYD BOG-UIO MAD-BOG MEX-MAD'.split(' ').map(r => r.split('-'))
const R = Math.PI / 180
const toV = ([la, lo]) => [Math.cos(la * R) * Math.cos(lo * R), Math.cos(la * R) * Math.sin(lo * R), Math.sin(la * R)]
const dist = (a, b) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
function slerp(a, b, d, f) { const s = Math.sin(d), k1 = Math.sin((1 - f) * d) / s, k2 = Math.sin(f * d) / s; const v = [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2]; return [Math.atan2(v[2], Math.hypot(v[0], v[1])) / R, Math.atan2(v[1], v[0]) / R] }
const PLANES = []
ROUTES.forEach(([a, b], i) => { if (!AP[a] || !AP[b]) return; const va = toV(AP[a]), vb = toV(AP[b]), d = dist(va, vb), hours = d * 6371 / 850 + .5
  for (let k = 0; k < 1; k++) { const fwd = k === 0; PLANES.push({ id: i * 2 + k, from: fwd ? a : b, to: fwd ? b : a, va: fwd ? va : vb, vb: fwd ? vb : va, d, ms: hours * 3600e3, off: ((i * 7919 + k * 3571) % 1000) / 1000 }) } })
// posición de cada avión ahora: [{ id, lat, lon, heading, from, to }]
export function flightsNow(t = Date.now()) {
  return PLANES.map(p => { const f = ((t / p.ms) + p.off) % 1, a = slerp(p.va, p.vb, p.d, f), b = slerp(p.va, p.vb, p.d, Math.min(1, f + .002))
    const y = Math.sin((b[1] - a[1]) * R) * Math.cos(b[0] * R), x = Math.cos(a[0] * R) * Math.sin(b[0] * R) - Math.sin(a[0] * R) * Math.cos(b[0] * R) * Math.cos((b[1] - a[1]) * R)
    return { id: p.id, lat: a[0], lon: a[1], heading: (Math.atan2(y, x) / R + 360) % 360, from: p.from, to: p.to } })
}

// Sol y luna: posición real, fase y eclipses, calculados con la hora (sin descargar nada).
// Sol: fórmula de baja precisión. Luna: serie de Meeus (cap. 47) recortada a los términos principales (error de décimas de grado, suficiente para dibujar y para detectar eclipses).
const R = Math.PI / 180, norm = a => ((a % 360) + 360) % 360, wrap = a => { a = norm(a); return a > 180 ? a - 360 : a }
// [D, M, M', F, coef. longitud (1e-6 °), coef. distancia]
const LON = [[0,0,1,0,6288774],[2,0,-1,0,1274027],[2,0,0,0,658314],[0,0,2,0,213618],[0,1,0,0,-185116],[0,0,0,2,-114332],[2,0,-2,0,58793],[2,-1,-1,0,57066],[2,0,1,0,53322],[2,-1,0,0,45758],[0,1,-1,0,-40923],[1,0,0,0,-34720],[0,1,1,0,-30383],[2,0,0,-2,15327],[0,0,1,2,-12528],[0,0,1,-2,10980],[4,0,-1,0,10675],[0,0,3,0,10034],[4,0,-2,0,8548],[2,1,-1,0,-7888],[2,1,0,0,-6766],[1,0,-1,0,-5163],[1,1,0,0,4987],[2,-1,1,0,4036],[2,0,2,0,3994],[4,0,0,0,3861],[2,0,-3,0,3665],[0,1,-2,0,-2689],[2,0,-1,2,-2602],[2,-1,-2,0,2390],[1,0,1,0,-2348],[2,-2,0,0,2236],[0,1,2,0,-2120],[0,2,0,0,-2069],[2,-2,-1,0,2048]]
const LAT = [[0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],[2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],[2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],[2,0,1,1,4200],[2,1,0,-1,-3359]]
export function sunMoon(date) {
  const jd = date / 864e5 + 2440587.5, T = (jd - 2451545) / 36525, d = jd - 2451545
  const Lp = norm(218.3164477 + 481267.88123421 * T), D = norm(297.8501921 + 445267.1114034 * T), M = norm(357.5291092 + 35999.0502909 * T), Mp = norm(134.9633964 + 477198.8675055 * T), F = norm(93.272095 + 483202.0175233 * T)
  const E = 1 - 0.002516 * T - 0.0000074 * T * T, A1 = norm(119.75 + 131.849 * T), A2 = norm(53.09 + 479264.29 * T), A3 = norm(313.45 + 481266.484 * T)
  let sl = 0, sb = 0
  for (const [d1, m, mp, f, c] of LON) sl += c * Math.pow(E, Math.abs(m)) * Math.sin((d1 * D + m * M + mp * Mp + f * F) * R)
  for (const [d1, m, mp, f, c] of LAT) sb += c * Math.pow(E, Math.abs(m)) * Math.sin((d1 * D + m * M + mp * Mp + f * F) * R)
  sl += 3958 * Math.sin(A1 * R) + 1962 * Math.sin((Lp - F) * R) + 318 * Math.sin(A2 * R)
  sb += -2235 * Math.sin(Lp * R) + 382 * Math.sin(A3 * R) + 175 * Math.sin((A1 - F) * R) + 175 * Math.sin((A1 + F) * R) + 127 * Math.sin((Lp - Mp) * R) - 115 * Math.sin((Lp + Mp) * R)
  const ml = norm(Lp + sl / 1e6), mb = sb / 1e6
  // sol (longitud eclíptica verdadera)
  const g = norm(357.528 + 0.9856003 * d), sol = norm(280.460 + 0.9856474 * d + 1.915 * Math.sin(g * R) + 0.020 * Math.sin(2 * g * R))
  const eps = (23.4393 - 3.563e-7 * d) * R, gmst = norm(280.46061837 + 360.98564736629 * d)
  const eq = (lon, lat) => { const l = lon * R, b = lat * R; return { ra: Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l)) / R, dec: Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l)) / R } }
  const s = eq(sol, 0), m = eq(ml, mb), elong = norm(ml - sol)
  // distancia angular entre la luna y el punto opuesto al sol (eclipse de luna) o el sol (eclipse de sol), en grados
  const sep = (lon2, lat2) => { const a = (ml - lon2) * R, b1 = mb * R, b2 = lat2 * R; return Math.acos(Math.max(-1, Math.min(1, Math.sin(b1) * Math.sin(b2) + Math.cos(b1) * Math.cos(b2) * Math.cos(a)))) / R }
  return { sol: { lon: wrap(s.ra - gmst), lat: s.dec }, luna: { lon: wrap(m.ra - gmst), lat: m.dec }, elong, ilum: (1 - Math.cos(elong * R)) / 2, sepSol: sep(sol, 0), sepSombra: sep(sol + 180, 0) }
}
// estado de eclipse (umbral de la sombra de la Tierra ≈ 0,68° y de la penumbra ≈ 1,25°; radio de la luna ≈ 0,26°)
export function eclipse(sm) {
  if (sm.sepSombra < 0.68 - 0.26) return { tipo: 'luna', total: true, f: 1 }
  if (sm.sepSombra < 1.05) return { tipo: 'luna', total: false, f: Math.max(0.15, Math.min(0.95, (1.05 - sm.sepSombra) / 0.63)) }
  if (sm.sepSol < 1.55) return { tipo: 'sol', total: false, f: Math.max(0.1, 1 - sm.sepSol / 1.55), off: sm.sepSol / 1.55 }
  return null
}
// nombre de la fase (para el texto que aparece al pasar el mouse)
export function faseNombre(elong) {
  const e = elong
  if (e < 11 || e >= 349) return 'Luna nueva'
  if (e < 79) return 'Luna creciente'
  if (e < 101) return 'Cuarto creciente'
  if (e < 169) return 'Gibosa creciente'
  if (e < 191) return 'Luna llena'
  if (e < 259) return 'Gibosa menguante'
  if (e < 281) return 'Cuarto menguante'
  return 'Luna menguante'
}

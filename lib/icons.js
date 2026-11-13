// Iconos de línea (estilo Lucide, trazos propios) en SVG en línea: sin peticiones ni librerías.
const P = (d) => `<path d="${d}"/>`;
const C = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const R = (x, y, w, h, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const ICONS = {
  plus: P('M5 12h14M12 5v14'), minus: P('M5 12h14'), check: P('M20 6 9 17l-5-5'), x: P('M18 6 6 18M6 6l12 12'),
  search: C(11, 11, 7) + P('m21 21-4.3-4.3'), bag: P('M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0'),
  share: P('M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13'), copy: R(9, 9, 13, 13) + P('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'),
  store: P('m3 9 1-5h16l1 5M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 21V12M19 21V12M2 21h20'),
  box: P('M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8'), tag: P('M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01'),
  chart: P('M12 20V10M18 20V4M6 20v-4'), users: P('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75') + C(9, 7, 4),
  sliders: P('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'), clock: C(12, 12, 10) + P('M12 6v6l4 2'),
  pin: P('M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z') + C(12, 10, 3), truck: R(1, 3, 15, 13) + P('M16 8h4l3 3v5h-7V8z') + C(5.5, 18.5, 2.5) + C(18.5, 18.5, 2.5),
  trash: P('M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'),
  edit: P('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'), eye: P('M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z') + C(12, 12, 3),
  calendar: R(3, 4, 18, 18) + P('M16 2v4M8 2v4M3 10h18'), info: C(12, 12, 10) + P('M12 16v-4M12 8h.01'), download: P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3'), printer: P('M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2') + R(6, 14, 12, 8, 1), arrow: P('M5 12h14M12 5l7 7-7 7'),
  image: R(3, 3, 18, 18) + C(8.5, 8.5, 1.5) + P('m21 15-5-5L5 21'), logout: P('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'),
  home: P('m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10'), receipt: P('M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-3-2-2 2zM8 8h8M8 12h8'),
  card: R(1, 4, 22, 16) + P('M1 10h22'), chat: P('M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z'),
  messenger: P('M12 3a9 9 0 0 0-9 9c0 2.4 1 4.6 2.6 6.2V21l3-1.6c1.1.4 2.2.6 3.4.6a9 9 0 0 0 0-18zM7.5 14l3.5-3.5 2 2 3.5-2.5-3.5 4z'),
  instagram: R(2, 2, 20, 20, 5) + C(12, 12, 4) + P('M17.5 6.5h.01'), menu: P('M3 12h18M3 6h18M3 18h18'), link: P('M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'),
  percent: P('M19 5 5 19') + C(6.5, 6.5, 2.5) + C(17.5, 17.5, 2.5), qr: R(3, 3, 7, 7) + R(14, 3, 7, 7) + R(3, 14, 7, 7) + P('M14 14h3v3M21 14v.01M14 21h.01M21 21v-4'),
  zap: P('M13 2 3 14h9l-1 8 10-12h-9z'), shield: P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z') + P('m9 12 2 2 4-4'), star: P('m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'),
  smile: C(12, 12, 10) + P('M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01'), globe: C(12, 12, 10) + P('M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z'), back: P('M19 12H5M12 19l-7-7 7-7'),
  phone: P('M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'),
  user: P('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2') + C(12, 7, 4), lock: R(3, 11, 18, 11) + P('M7 11V7a5 5 0 0 1 10 0v4'),
};
function icon(name, size = 20, cls = '') {
  const body = ICONS[name] || '';
  return `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
module.exports = { icon, ICONS };

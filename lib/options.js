// Opciones por producto (talla, color, tamaño, adicionales) y zonas de domicilio.
// El negocio las escribe en texto simple; aquí se interpretan y se valida lo que elige el cliente.
const U = require('./util');

const MAX_GROUPS = 6, MAX_CHOICES = 30;
const priceOf = (s) => { const m = /\+\s*([\d.,]+)\s*$/.exec(s); return m ? { n: s.slice(0, m.index).trim(), p: U.toCents(m[1]) } : { n: s.trim(), p: 0 }; };

// "Adicionales (varios, opcional): Queso +2000, Tocineta +3000" → { name, multi, required, choices: [{ n, p }] }
function parse(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const i = raw.indexOf(':');
    if (i < 1) continue;
    let name = raw.slice(0, i).trim();
    const flags = (/\(([^)]*)\)\s*$/.exec(name) || [])[1] || '';
    name = name.replace(/\([^)]*\)\s*$/, '').trim().slice(0, 40);
    const choices = raw.slice(i + 1).split(',').map((c) => priceOf(c.slice(0, 60))).filter((c) => c.n).slice(0, MAX_CHOICES);
    if (!name || !choices.length) continue;
    out.push({ name, multi: /vari|multi/i.test(flags), required: !/opcional/i.test(flags), choices });
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}
// Vuelve a escribir las opciones en el formato del panel (limpias).
const format = (groups) => groups.map((g) => {
  const fl = [g.multi && 'varios', !g.required && 'opcional'].filter(Boolean);
  return `${g.name}${fl.length ? ` (${fl.join(', ')})` : ''}: ${g.choices.map((c) => c.n + (c.p ? ' +' + (c.p % 100 ? (c.p / 100).toFixed(2) : c.p / 100) : '')).join(', ')}`;
}).join('\n');

// Valida la elección del cliente: sel = [[índices del grupo 0], [índices del grupo 1], ...]. Devuelve el extra y el texto.
function resolve(groups, sel) {
  if (!groups.length) return { extra: 0, label: '', key: '' };
  const pick = Array.isArray(sel) ? sel : [];
  let extra = 0;
  const parts = [], key = [];
  groups.forEach((g, gi) => {
    const want = [...new Set((Array.isArray(pick[gi]) ? pick[gi] : []).map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x < g.choices.length))];
    if (!g.multi && want.length > 1) throw U.fail(400, `En "${g.name}" elige solo una opción.`);
    if (g.required && !want.length) throw U.fail(400, `Elige ${g.name.toLowerCase()}.`);
    if (!want.length) { key.push(''); return; }
    want.sort((a, b) => a - b);
    extra += want.reduce((a, ci) => a + g.choices[ci].p, 0);
    parts.push(`${g.name}: ${want.map((ci) => g.choices[ci].n).join(', ')}`);
    key.push(want.join('.'));
  });
  return { extra, label: parts.join(' · '), key: key.join('|') };
}

// Zonas de domicilio: "El Poblado | 5000" por línea.
function zones(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.split('|')).filter((p) => p.length >= 2 && p[0].trim())
    .slice(0, 40).map((p) => ({ n: p[0].trim().slice(0, 50), p: U.toCents(p[1]) }));
}
const formatZones = (list) => list.map((z) => `${z.n} | ${z.p % 100 ? (z.p / 100).toFixed(2) : z.p / 100}`).join('\n');

// Fotos adicionales guardadas como JSON.
const gallery = (p) => { try { const a = JSON.parse(p.images || '[]'); return Array.isArray(a) ? a.filter((x) => /^[a-f0-9]{28}\.(jpg|png|webp)$/.test(x)).slice(0, 5) : []; } catch { return []; } };

module.exports = { parse, format, resolve, zones, formatZones, gallery, MAX_GROUPS };

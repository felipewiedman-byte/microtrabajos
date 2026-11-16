// Compatibilidad con celulares y navegadores viejos (se aplica al compilar; en navegadores modernos no cambia nada):
//  1) color-mix(...)  → antes de cada declaración se agrega el mismo color ya calculado (si el navegador no entiende color-mix, usa ese; si lo entiende, usa el original).
//  2) listas de selectores con :has(...) → los selectores sin :has se copian a su propia regla, porque un navegador viejo descarta TODA la regla si UNO de los selectores no entiende.
const VARS = { '--win1': '#10203b', '--box-bg': '#7fa6ff', '--dk-alpha': '80%', '--win2': '#0a1428' }
const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); if (h.length === 4) h = h.split('').map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1] }
const split = s => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = '' } else cur += ch } if (cur.trim()) out.push(cur.trim()); return out }
function color(v) {
  v = v.trim()
  if (v === 'transparent') return [0, 0, 0, 0]
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return hex(v)
  let m = /^var\((--[\w-]+)\s*,\s*(.+)\)$/s.exec(v); if (m) return color(m[2])
  m = /^var\((--[\w-]+)\)$/.exec(v); if (m) return VARS[m[1]] ? color(VARS[m[1]]) : null
  m = /^rgba?\((.+)\)$/.exec(v); if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return p.length >= 3 ? [p[0], p[1], p[2], p[3] ?? 1] : null }
  m = /^color-mix\((.+)\)$/s.exec(v); if (m) return mix(split(m[1]))
  return null
}
function mix(args) {
  if (!/^in\s+srgb$/i.test(args[0])) return null
  const parse = s => { s = s.trim().replace(/\s+var\((--[\w-]+)\)$/, (_, n) => VARS[n] ? ' ' + VARS[n] : ' var(' + n + ')'); const m = /^(.*?)(?:\s+([\d.]+)%)?$/s.exec(s); return { c: color(m[1]), p: m[2] != null ? +m[2] / 100 : null } }
  let a = parse(args[1]), b = parse(args[2]); if (!a.c || !b.c) return null
  if (a.p == null && b.p == null) { a.p = .5; b.p = .5 } else if (a.p == null) a.p = 1 - b.p; else if (b.p == null) b.p = 1 - a.p
  const t = a.p + b.p; a.p /= t; b.p /= t
  const al = a.c[3] * a.p + b.c[3] * b.p; if (al === 0) return [0, 0, 0, 0]
  const ch = i => Math.round((a.c[i] * a.c[3] * a.p + b.c[i] * b.c[3] * b.p) / al)
  return [ch(0), ch(1), ch(2), al * t]
}
const css = c => `rgba(${c[0]},${c[1]},${c[2]},${+c[3].toFixed(3)})`
// reemplaza cada color-mix(...) (con paréntesis balanceados) por su color calculado; null si no se puede calcular alguno
function replaceAll(value) {
  let out = '', i = 0
  while (true) {
    const k = value.indexOf('color-mix(', i); if (k < 0) { out += value.slice(i); return out }
    let d = 0, j = k + 9; for (; j < value.length; j++) { if (value[j] === '(') d++; if (value[j] === ')') { d--; if (d === 0) break } }
    const c = color(value.slice(k, j + 1)); if (!c) return null
    out += value.slice(i, k) + css(c); i = j + 1
  }
}
module.exports = () => ({
  postcssPlugin: 'compat-viejos',
  Declaration(decl) {
    if (decl.__fb || !decl.value.includes('color-mix(') || decl.prop.startsWith('--')) return
    const fb = replaceAll(decl.value); if (!fb || fb === decl.value) return
    const prev = decl.prev(); if (prev && prev.type === 'decl' && prev.prop === decl.prop && prev.value === fb) return
    const c = decl.clone({ value: fb }); c.__fb = true; decl.before(c)
  },
  Rule(rule) {
    // variables con color-mix: un navegador viejo las acepta pero luego no puede usarlas (queda transparente). Se deja el color calculado y la versión moderna dentro de @supports.
    if (!rule.__cm) {
      const cm = (rule.nodes || []).filter(n => n.type === 'decl' && n.prop.startsWith('--') && n.value.includes('color-mix('))
      if (cm.length) {
        rule.__cm = true
        const mod = rule.clone({ nodes: [] }); mod.__cm = true; mod.__sp = true
        let any = false
        for (const d of cm) { const fb = replaceAll(d.value); if (!fb) continue; mod.append(d.clone()); d.value = fb; any = true }
        if (any) { const sup = require('postcss').atRule({ name: 'supports', params: '(color:color-mix(in srgb,red 50%,blue))' }); sup.append(mod); rule.parent.insertAfter(rule, sup) }
      }
    }
    if (rule.__sp || !rule.selector.includes(':has(')) return
    const sels = split(rule.selector), sin = sels.filter(s => !s.includes(':has(')); if (!sin.length || sin.length === sels.length) return
    const c = rule.clone({ selector: sin.join(',') }); c.__sp = true; rule.__sp = true; rule.before(c)
  },
})
module.exports.postcss = true

// Lectura de CSV (lo que exporta Excel o Google Sheets): comas o punto y coma, comillas, saltos de línea dentro de comillas y BOM.
function parse(text, max = 2000) {
  const s = String(text || '').replace(/^﻿/, '');
  const first = s.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') && !first.includes(',') ? '\t' : ',');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; if (rows.length > max) break; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some((x) => x.trim())) rows.push(row); }
  return rows;
}
// Evita que una celda se interprete como fórmula al abrirla en Excel.
const safe = (v) => { const t = String(v ?? '').replace(/"/g, '""'); return `"${/^[=+\-@\t\r]/.test(t) ? "'" + t : t}"`; };
const write = (rows) => '﻿' + rows.map((r) => r.map(safe).join(',')).join('\r\n') + '\r\n';
module.exports = { parse, write };

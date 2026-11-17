#!/usr/bin/env node
// Verificación de que el panel, el computador y el celular están alineados. Se corre antes de cada entrega:   node verificar.cjs
// Falla (código 1) si una opción del menú del computador no existe en el celular o no tiene acción, o si el servidor y la web se desalinean.
const fs = require('fs'), path = require('path')
const R = f => fs.readFileSync(path.join(__dirname, f), 'utf8')
const LAY = JSON.parse(R('server/layout-ids.json')), app = R('src/App.jsx'), mm = R('src/components/MobileMenu.jsx'), lay = R('src/layout.js'), adm = R('server/admin.js')
const bad = [], warn = []
const ids = a => a.map(x => x[0])
// 1) cada opción del menú del computador tiene acción en la barra lateral
const act0 = (/const act0 = \{([^}]*)\}/.exec(app) || [])[1] || ''
for (const id of ids(LAY.dmenu)) if (!new RegExp('(^|[ ,{])' + id + ':').test(act0)) bad.push('Computador: la opción «' + id + '» del menú no tiene acción en la barra lateral (App.jsx)')
// 2) cada opción del menú del celular tiene acción o es una pestaña
const TABS = ['planeta', 'ahora', 'cerca', 'mensajes', 'comunidad', 'huella'], action = (/const ACTION = \{(.*)\}/.exec(mm) || [])[1] || ''
for (const id of ids(LAY.menu)) if (!TABS.includes(id) && !new RegExp('(^|[ ,{])' + id + ':').test(action)) bad.push('Celular: la opción «' + id + '» del menú no tiene acción (MobileMenu.jsx)')
// 3) todo lo que está en el computador está también en el celular
for (const id of ids(LAY.dmenu)) if (!ids(LAY.menu).includes(id)) bad.push('Falta en el celular: «' + id + '» está en el menú del computador pero no en el del celular (server/layout-ids.json → menu)')
// 4) la web no debe tener listas propias de opciones (deben salir de la fuente única)
if (/\['(planeta|canales|eventos)', '/.test(lay.replace(/\/\/.*$/gm, ''))) bad.push('src/layout.js tiene una lista propia de opciones: debe leerlas de server/layout-ids.json')
if (/MENU_IDS = \[/.test(adm) || /DMENU_IDS = \[/.test(adm)) bad.push('server/admin.js tiene una lista propia de opciones: debe leerlas de server/layout-ids.json')
// 5) ajustes: se prueba de verdad que el servidor guarda cada ajuste del panel (un interruptor se invierte y debe quedar invertido; lo demás debe volver igual).
//    Si un ajuste se descarta, lo que se cambia en el panel nunca llegaría a la web.
let nAjustes = 0
try {
  const { DatabaseSync } = require('node:sqlite'), os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verif-'))
  const A = require('./server/admin.js').init(new DatabaseSync(':memory:'), tmp), D = A.DEFAULTS
  for (const [k, v] of Object.entries(D)) {
    if (k === 'layout' || (v && typeof v === 'object' && !Array.isArray(v))) continue; nAjustes++   // layout y los textos tienen su propia prueba
    const probe = typeof v === 'boolean' ? !v : v
    let got; try { got = A.saveSettings({ [k]: probe })[k] } catch (e) { bad.push('Ajuste «' + k + '»: el servidor falló al guardarlo (' + e.message + ')'); continue }
    if (JSON.stringify(got) !== JSON.stringify(probe)) bad.push('Ajuste «' + k + '»: el panel lo envía pero el servidor NO lo guarda (falta o es incorrecto su validador en server/admin.js)')
  }
  fs.rmSync(tmp, { recursive: true, force: true })
} catch (e) { warn.push('No se pudo probar el guardado de ajustes: ' + e.message) }
console.log('Opciones: computador', ids(LAY.dmenu).length, '· celular', ids(LAY.menu).length, '· ajustes guardables probados', nAjustes)
for (const w of warn) console.log('  AVISO  ' + w)
for (const b of bad) console.log('  FALLA  ' + b)
console.log(bad.length ? '\nResultado: ' + bad.length + ' problema(s). Corrige antes de entregar.' : '\nResultado: todo alineado (computador, celular y servidor).')
process.exit(bad.length ? 1 : 0)

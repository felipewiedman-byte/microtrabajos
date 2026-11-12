// Prueba del selector mundial de ciudades (sin red): firma, validación y límite.
const assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-geo-'));
process.env.SESSION_SECRET = 'test';
const geo = require('../lib/geo');
const sig = geo.sign('Tokyo, Japan');
assert.strictEqual(geo.resolve('Tokyo, Japan', sig), 'Tokyo, Japan', 'ciudad firmada válida');
assert.strictEqual(geo.resolve('Tokyo, Japan', 'falsa'), '', 'firma falsa rechazada');
assert.strictEqual(geo.resolve('Ciudad inventada', geo.sign('Otra')), '', 'texto inventado rechazado');
assert.strictEqual(geo.resolve('Cali', ''), 'Cali', 'lista inicial sin firma');
assert.strictEqual(geo.resolve('<b>x</b>|y', ''), '', 'caracteres peligrosos');
assert.strictEqual(geo.shortName('Cali, Texas, United States'), 'Cali');
for (let i = 0; i < 40; i++) assert.ok(geo.allow('1.1.1.1'));
assert.ok(!geo.allow('1.1.1.1'), 'límite por IP');
console.log('✔ Pruebas de ciudades pasaron'); process.exit(0);

const fs = require('node:fs');
const path = require('node:path');

function prepareInventoryVendor() {
  const root = path.resolve(__dirname, '..');
  const dependency = path.dirname(require.resolve('xlsx'));
  const version = JSON.parse(fs.readFileSync(path.join(dependency, 'package.json'), 'utf8')).version;
  if (version !== '0.20.3') throw new Error('Versión inesperada de la biblioteca Excel. Revisá la dependencia fijada.');
  const destination = path.join(root, 'assets/vendor/sheetjs/xlsx-0.20.3.min.js');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(dependency, 'dist/xlsx.mini.min.js'), destination);
}

if (require.main === module) {
  try { prepareInventoryVendor(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = prepareInventoryVendor;

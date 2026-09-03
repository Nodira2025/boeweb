const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'dist');

const PUBLIC_ROOT_FILES = [
  'academy.js',
  'admin-config.html',
  'admin-config.js',
  'admin-operations-console.js',
  'app-config.css',
  'app-config.js',
  'articles.json',
  'business-verticals.js',
  'coffee.html',
  'coffee.js',
  'drbo.js',
  'hero-slider.js',
  'index.css',
  'index.html',
  'index.js',
  'mapa-local.js',
  'memberPortal.js',
  'mercadopago-checkout.js',
  'migration-ai.js',
  'migration-center.js',
  'migration-rollback.js',
  'operational-api.js',
  'operational-health-alerts.js',
  'pacientes.html',
  'pacientes.js',
  'perfil.html',
  'pos-cart-engine.js',
  'pos-desk-utils.js',
  'pos-inventory-sync.js',
  'products.json',
  'public-catalog-unification.js',
  'public-order-api.js',
  'release-engine.js',
  'reprocam.css',
  'reprocam.html',
  'reprocam.js',
  'saas-auth.js',
  'storefront.css',
  'tablet.html',
  'tablet.js',
  'tenant-onboarding.js',
  'tenant-theme.js',
  'theme.js',
  'tv.html',
  'tv.js',
  'vendedor-caja.css',
  'vendedor-login.css',
  'vendedor-portal.css',
  'vendedor-stock.css',
  'vendedor.html',
  'vendedor.js'
];

function copyPublicFile(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const destinationPath = path.join(outputDir, relativePath);
  if (!fs.existsSync(sourcePath)) throw new Error(`Falta el archivo público ${relativePath}.`);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function buildStaticSite() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  PUBLIC_ROOT_FILES.forEach(copyPublicFile);
  fs.cpSync(path.join(rootDir, 'assets'), path.join(outputDir, 'assets'), { recursive: true });
  console.log(`Sitio público preparado en ${outputDir}.`);
}

try {
  buildStaticSite();
} catch (error) {
  console.error(`No se pudo preparar el sitio público: ${error.message}`);
  process.exitCode = 1;
}

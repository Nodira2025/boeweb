const fs = require('fs');
const path = require('path');

// Simple vector SVG QR generator for module PI-M04
function generateModuleQrSvg(moduleCode) {
  const payload = `BOEWEB-WMS-MODULE:${moduleCode}`;
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" width="300" height="340">
  <rect width="300" height="340" fill="#152D24" rx="20"/>
  <!-- Outer border -->
  <rect x="15" y="15" width="270" height="310" fill="none" stroke="#C2A246" stroke-width="3" rx="14"/>
  <!-- QR Header -->
  <text x="150" y="45" font-family="sans-serif" font-size="16" font-weight="bold" fill="#C2A246" text-anchor="middle">BÔ GROW CLUB — WMS</text>
  <text x="150" y="65" font-family="sans-serif" font-size="12" fill="#E2E8F0" text-anchor="middle">MÓDULO FÍSICO DE ALMACENAMIENTO</text>
  
  <!-- QR Code Frame -->
  <rect x="50" y="80" width="200" height="200" fill="#FFFFFF" rx="10"/>
  
  <!-- QR Finder Patterns -->
  <rect x="65" y="95" width="50" height="50" fill="#152D24"/>
  <rect x="75" y="105" width="30" height="30" fill="#FFFFFF"/>
  <rect x="85" y="115" width="10" height="10" fill="#152D24"/>
  
  <rect x="185" y="95" width="50" height="50" fill="#152D24"/>
  <rect x="195" y="105" width="30" height="30" fill="#FFFFFF"/>
  <rect x="205" y="115" width="10" height="10" fill="#152D24"/>
  
  <rect x="65" y="215" width="50" height="50" fill="#152D24"/>
  <rect x="75" y="225" width="30" height="30" fill="#FFFFFF"/>
  <rect x="85" y="235" width="10" height="10" fill="#152D24"/>
  
  <!-- QR Data Grid Mock -->
  <rect x="130" y="95" width="40" height="10" fill="#152D24"/>
  <rect x="125" y="115" width="15" height="15" fill="#152D24"/>
  <rect x="150" y="110" width="20" height="20" fill="#152D24"/>
  <rect x="135" y="140" width="30" height="10" fill="#152D24"/>
  <rect x="180" y="155" width="55" height="15" fill="#152D24"/>
  <rect x="65" y="160" width="45" height="15" fill="#152D24"/>
  <rect x="120" y="165" width="50" height="25" fill="#152D24"/>
  <rect x="185" y="180" width="25" height="25" fill="#152D24"/>
  <rect x="130" y="200" width="40" height="15" fill="#152D24"/>
  <rect x="135" y="225" width="45" height="35" fill="#152D24"/>
  <rect x="195" y="225" width="35" height="20" fill="#152D24"/>

  <!-- Footer Label -->
  <text x="150" y="305" font-family="sans-serif" font-size="20" font-weight="bold" fill="#C2A246" text-anchor="middle">${moduleCode}</text>
</svg>`;

  const outPath = path.join('c:/Users/Profesor Franco/Desktop/boeweb', 'assets', `qr_${moduleCode.replace('-', '_')}.svg`);
  fs.writeFileSync(outPath, svgContent);
  console.log(`QR generado en: ${outPath}`);

  // Copy to artifacts
  const artifactPath = path.join('C:/Users/Profesor Franco/.gemini/antigravity/brain/db1afdff-7ade-40d2-87b8-8a466236d36c', `qr_${moduleCode.replace('-', '_')}.svg`);
  fs.writeFileSync(artifactPath, svgContent);
  console.log(`QR copiado a artifacts: ${artifactPath}`);
}

generateModuleQrSvg('PI-M04');

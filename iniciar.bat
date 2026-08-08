@echo off
chcp 65001 >nul
setlocal
title BÔ Grow Club - Servidor local

cd /d "%~dp0"
set "PORT=4173"
set "TEST_MODE=0"
if /i "%~1"=="--prueba" set "TEST_MODE=1"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo No se encontro Node.js en este equipo.
  echo Instala Node.js y vuelve a ejecutar iniciar.bat.
  echo.
  pause
  exit /b 1
)

echo.
echo ==============================================
echo       BÔ GROW CLUB - SERVIDOR LOCAL
echo ==============================================
echo.
echo Sitio disponible en: http://127.0.0.1:%PORT%/
echo El navegador se abrira automaticamente.
echo Para detener el sitio presiona Ctrl+C.
echo.

if "%TEST_MODE%"=="0" start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process 'http://127.0.0.1:%PORT%/'" >nul 2>&1

node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd(),port=Number(process.env.PORT||4173),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};http.createServer((req,res)=>{try{const urlPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname),relative=urlPath==='/'?'index.html':urlPath.replace(/^\/+/,''),file=path.resolve(root,relative);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Acceso denegado');return;}fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);res.end('No encontrado');return;}res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});}catch(error){res.writeHead(500);res.end('Error del servidor local');}}).on('error',error=>{console.error('\nNo se pudo iniciar el servidor: '+error.message);process.exit(1);}).listen(port,'127.0.0.1',()=>console.log('Servidor iniciado correctamente.'));"

echo.
echo El servidor se detuvo.
if "%TEST_MODE%"=="1" exit /b %errorlevel%
pause

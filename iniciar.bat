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

node local-server.js

echo.
echo El servidor se detuvo.
if "%TEST_MODE%"=="1" exit /b %errorlevel%
pause

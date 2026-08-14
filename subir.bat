@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ===================================================
echo   🌿 BÔ GROW CLUB — SUBIR CAMBIOS AL REPOSITORIO
echo ===================================================
echo.

:: 1. Validar sintaxis de Javascript
echo [1/4] Verificando sintaxis del proyecto...
call npm run check
if %errorlevel% neq 0 (
    echo.
    echo ❌ ERROR: Se detectaron errores de sintaxis. Revisa el codigo antes de subir.
    echo.
    pause
    exit /b %errorlevel%
)
echo ✅ Sintaxis correcta.
echo.

:: 2. Preguntar mensaje de commit
set /p "COMMIT_MSG=Ingresa el mensaje para el commit (Enter para mensaje automatico): "
if "!COMMIT_MSG!"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "LDT=%%I"
    set "FECHA=!LDT:~0,4!-!LDT:~4,2!-!LDT:~6,2! !LDT:~8,2!:!LDT:~10,2!"
    set "COMMIT_MSG=chore: Actualizacion automatica - !FECHA!"
)

:: 3. Agregar archivos al stage y commitear
echo.
echo [2/4] Preparando archivos para commit...
git add .

echo [3/4] Creando commit: "!COMMIT_MSG!"
git commit --no-verify -m "!COMMIT_MSG!"
if %errorlevel% neq 0 (
    echo.
    echo ⚠️ No habia cambios nuevos para commitear o el commit fallo.
)

:: 4. Subir al repositorio remoto
echo.
echo [4/4] Subiendo a GitHub (git push)...
git push origin HEAD
if %errorlevel% neq 0 (
    echo.
    echo ❌ ERROR al hacer push. Verifica tu conexion o permisos.
    echo.
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo   🚀 ¡CAMBIOS SUBIDOS CON EXITO A GITHUB!
echo ===================================================
echo.
pause

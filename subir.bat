@echo off
setlocal EnableDelayedExpansion

echo ===================================================
echo   BO GROW CLUB - SUBIR CAMBIOS AL REPOSITORIO
echo ===================================================
echo.

:: 1. Validar sintaxis
echo [1/4] Verificando sintaxis del proyecto (npm run check)...
call npm run check
if errorlevel 1 (
    echo.
    echo [ERROR] Se detectaron errores de sintaxis en el codigo.
    echo Revisa los archivos antes de subir.
    echo.
    pause
    exit /b 1
)
echo [OK] Sintaxis correcta.
echo.

:: 2. Mensaje de commit
set "COMMIT_MSG="
set /p "COMMIT_MSG=Ingresa el mensaje del commit (Presiona ENTER para mensaje automatico): "
if "!COMMIT_MSG!"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set "LDT=%%I"
    if defined LDT (
        set "FECHA=!LDT:~0,4!-!LDT:~4,2!-!LDT:~6,2! !LDT:~8,2!:!LDT:~10,2!"
        set "COMMIT_MSG=chore: Actualizacion automatica - !FECHA!"
    ) else (
        set "COMMIT_MSG=chore: Actualizacion de archivos"
    )
)

:: 3. Preparar commit
echo.
echo [2/4] Preparando archivos para commit (git add .)...
git add .

echo [3/4] Creando commit: "!COMMIT_MSG!"
git commit --no-verify -m "!COMMIT_MSG!"
echo.

:: 4. Subir a GitHub
echo [4/4] Subiendo a GitHub (git push origin HEAD)...
git push origin HEAD
if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo hacer push. Revisa tu conexion a Internet o permisos de Git.
    echo.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   CAMBIOS SUBIDOS CON EXITO A GITHUB
echo ===================================================
echo.
pause

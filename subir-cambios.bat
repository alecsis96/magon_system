@echo off
setlocal

cd /d "%~dp0"

echo.
echo Estado actual del repo:
git status --short
if errorlevel 1 goto :error

echo.
set /p FILES=Archivos a agregar ^(. para todo o rutas especificas^): 
if "%FILES%"=="" set "FILES=."

set /p MESSAGE=Mensaje del commit: 
if "%MESSAGE%"=="" (
  echo.
  echo Debes escribir un mensaje de commit.
  pause
  exit /b 1
)

echo.
echo Agregando archivos...
git add %FILES%
if errorlevel 1 goto :error

echo.
echo Creando commit...
git commit -m "%MESSAGE%"
if errorlevel 1 goto :error

echo.
echo Subiendo a origin/main...
git push origin main
if errorlevel 1 goto :error

echo.
echo Cambios subidos correctamente.
echo Nota: si agregaste archivos .sql, tambien debes ejecutarlos manualmente en Supabase SQL Editor.
pause
exit /b 0

:error
echo.
echo Ocurrio un error. Revisa el mensaje anterior.
pause
exit /b 1

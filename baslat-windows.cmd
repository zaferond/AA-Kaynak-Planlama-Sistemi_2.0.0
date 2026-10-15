@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto error
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js 24 bulunamadi. Kurun ve bu pencereyi yeniden acin.
 pause
 exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24){console.error('Node.js 24 veya daha yenisi gerekir.');process.exit(1)}"
if errorlevel 1 goto error
where npm.cmd >nul 2>&1
if errorlevel 1 (
 echo npm bulunamadi. Node.js kurulumunu kontrol edip bu pencereyi yeniden acin.
 goto error
)
node backend/setup.mjs
if errorlevel 1 goto error
node backend/ensure-dependencies.mjs
if errorlevel 1 goto error
call npm.cmd run build
if errorlevel 1 goto error
call npm.cmd start
if errorlevel 1 goto error
exit /b 0
:error
echo Baslatma tamamlanamadi. Yukaridaki hata mesajini kontrol edin.
pause
exit /b 1

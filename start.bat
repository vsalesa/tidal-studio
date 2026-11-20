@echo off
rem Doble clic para abrir Tidal Studio
cd /d "%~dp0"
set PATH=C:\ghcup\bin;%APPDATA%\cabal\bin;%PATH%
where python >nul 2>nul && (python server\app.py %*) || (py -3 server\app.py %*)
pause

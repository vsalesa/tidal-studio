# Instalador de Tidal Studio para Windows 10/11.
# Instala con winget: Python 3, Git y SuperCollider; después Haskell (ghcup), TidalCycles y SuperDirt.
# Puedes volver a ejecutarlo: se salta lo que ya está instalado.
param([string]$Lang = "")
$ErrorActionPreference = "Continue"
# Idioma de los mensajes / message language: Spanish if Windows is in Spanish, otherwise English
if (-not $Lang) { $Lang = (Get-Culture).TwoLetterISOLanguageName }
$ES = $Lang -like "es*"
function T($es, $en) { if ($ES) { $es } else { $en } }
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($t) { Write-Host "`n==> $t" -ForegroundColor Green }
function Warn($t) { Write-Host "!  $t" -ForegroundColor Yellow }
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
  foreach ($p in @("C:\ghcup\bin", "$env:APPDATA\cabal\bin", "$env:LOCALAPPDATA\Programs\Python\Python312", "$env:LOCALAPPDATA\Programs\Python\Python313")) {
    if ((Test-Path $p) -and -not ($env:Path -like "*$p*")) { $env:Path = "$p;$env:Path" }
  }
}
function Find-Sclang {
  $c = Get-ChildItem "C:\Program Files\SuperCollider*\sclang.exe","C:\Program Files (x86)\SuperCollider*\sclang.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if ($c) { return $c.FullName } else { return $null }
}

$arch = $env:PROCESSOR_ARCHITECTURE
Write-Host (T "Instalador de Tidal Studio" "Tidal Studio installer") -ForegroundColor Cyan
Write-Host "   $(T "Sistema detectado" "Detected system"): Windows $([Environment]::OSVersion.Version) ($arch)"
Write-Host "   $(T "Se instalaran" "Will install"): Python 3, Git, SuperCollider + SuperDirt, Haskell (ghcup) $(T "y" "and") TidalCycles."
Write-Host "   $(T "Tardara entre 15 y 40 minutos. Windows puede pedirte permiso varias veces." "It takes 15 to 40 minutes. Windows may ask for permission several times.")"
$ans = Read-Host "   $(T "Continuar? [S/n]" "Continue? [Y/n]")"
if ($ans -match '^[nN]') { exit 0 }

if (-not (Have winget)) {
  Warn (T "No encuentro 'winget'. Instala 'App Installer' desde Microsoft Store y vuelve a ejecutar install.bat" "Can't find 'winget'. Install 'App Installer' from the Microsoft Store and run install.bat again")
  Start-Process "ms-windows-store://pdp/?productid=9NBLGGH4NNS1"
  exit 1
}
$wg = @("--accept-source-agreements","--accept-package-agreements","--silent","-e")

Step "1/5 Python $(T "y" "and") Git"
Refresh-Path
if (-not (Have python) -or ((python --version 2>&1) -match "was not found")) { winget install --id Python.Python.3.12 @wg }
if (-not (Have git)) { winget install --id Git.Git @wg }

Step "2/5 SuperCollider"
if (-not (Find-Sclang)) { winget install --id SuperCollider.SuperCollider @wg } else { Write-Host (T "SuperCollider ya esta instalado." "SuperCollider is already installed.") }

Step "3/5 Haskell (ghcup)"
Refresh-Path
if (-not (Have ghci)) {
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
  try {
    & ([ScriptBlock]::Create((Invoke-WebRequest https://www.haskell.org/ghcup/sh/bootstrap-haskell.ps1 -UseBasicParsing))) -DisableCurl
  } catch { Write-Error $_ }
  Refresh-Path
}
if (-not (Have ghci)) {
  Warn (T "Haskell se esta terminando de instalar en otra ventana. Cuando acabe, cierra esta ventana y vuelve a ejecutar install.bat" "Haskell is finishing its install in another window. When it is done, close this window and run install.bat again")
  Read-Host (T "Pulsa Enter para salir" "Press Enter to exit")
  exit 0
}

Step "4/5 TidalCycles"
cabal update
ghc -e "import Sound.Tidal.Context" -e "return ()" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { cabal install tidal --lib } else { Write-Host (T "TidalCycles ya esta instalado." "TidalCycles is already installed.") }

Step "5/5 SuperDirt $(T "y configuracion" "and setup")"
Refresh-Path
$sclang = Find-Sclang
if ($sclang) {
  & $sclang "$Dir\supercollider\install_superdirt.scd"
} else {
  Warn "$(T "No encuentro sclang.exe. Abre SuperCollider y ejecuta" "Can't find sclang.exe. Open SuperCollider and run"): Quarks.install(""SuperDirt"")"
}
if (-not (Test-Path "$Dir\config.json")) { Copy-Item "$Dir\config.example.json" "$Dir\config.json" }
$env:TIDAL_STUDIO_LANG = $(if ($ES) { "es" } else { "en" })
python "$Dir\server\app.py" --check

Write-Host ("`n" + (T "Listo! Para abrir el estudio haz doble clic en start.bat" "Done! To open the studio double-click start.bat")) -ForegroundColor Green
Write-Host (T "Despues pulsa el engranaje en la web para conectar tu IA (OpenAI, Claude, Ollama...)." "Then press the gear in the web page to connect your AI (OpenAI, Claude, Ollama...).")
Read-Host (T "Pulsa Enter para salir" "Press Enter to exit")

# Instalador de Tidal Studio para Windows 10/11.
# Instala con winget: Python 3, Git y SuperCollider; después Haskell (ghcup), TidalCycles y SuperDirt.
# Puedes volver a ejecutarlo: se salta lo que ya está instalado.
$ErrorActionPreference = "Continue"
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
Write-Host "Instalador de Tidal Studio" -ForegroundColor Cyan
Write-Host "   Sistema detectado: Windows $([Environment]::OSVersion.Version) ($arch)"
Write-Host "   Se instalaran: Python 3, Git, SuperCollider + SuperDirt, Haskell (ghcup) y TidalCycles."
Write-Host "   Tardara entre 15 y 40 minutos. Windows puede pedirte permiso varias veces."
$ans = Read-Host "   Continuar? [S/n]"
if ($ans -match '^[nN]') { exit 0 }

if (-not (Have winget)) {
  Warn "No encuentro 'winget'. Instala 'App Installer' desde Microsoft Store y vuelve a ejecutar install.bat"
  Start-Process "ms-windows-store://pdp/?productid=9NBLGGH4NNS1"
  exit 1
}
$wg = @("--accept-source-agreements","--accept-package-agreements","--silent","-e")

Step "1/5 Python y Git"
Refresh-Path
if (-not (Have python) -or ((python --version 2>&1) -match "was not found")) { winget install --id Python.Python.3.12 @wg }
if (-not (Have git)) { winget install --id Git.Git @wg }

Step "2/5 SuperCollider"
if (-not (Find-Sclang)) { winget install --id SuperCollider.SuperCollider @wg } else { Write-Host "SuperCollider ya esta instalado." }

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
  Warn "Haskell se esta terminando de instalar en otra ventana. Cuando acabe, cierra esta ventana y vuelve a ejecutar install.bat"
  Read-Host "Pulsa Enter para salir"
  exit 0
}

Step "4/5 TidalCycles"
cabal update
ghc -e "import Sound.Tidal.Context" -e "return ()" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { cabal install tidal --lib } else { Write-Host "TidalCycles ya esta instalado." }

Step "5/5 SuperDirt y configuracion"
Refresh-Path
$sclang = Find-Sclang
if ($sclang) {
  & $sclang "$Dir\supercollider\install_superdirt.scd"
} else {
  Warn "No encuentro sclang.exe. Abre SuperCollider y ejecuta: Quarks.install(""SuperDirt"")"
}
if (-not (Test-Path "$Dir\config.json")) { Copy-Item "$Dir\config.example.json" "$Dir\config.json" }
python "$Dir\server\app.py" --check

Write-Host "`nListo! Para abrir el estudio haz doble clic en start.bat" -ForegroundColor Green
Write-Host "Despues pulsa el engranaje en la web para conectar tu IA (OpenAI, Claude, Ollama...)."
Read-Host "Pulsa Enter para salir"

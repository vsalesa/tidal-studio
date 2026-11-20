#!/usr/bin/env bash
# Instalador de Tidal Studio para macOS y Linux.
# Detecta el sistema e instala: Python 3, Git, SuperCollider (+SuperDirt), GHC/Cabal (vía ghcup) y TidalCycles.
# Uso:  ./install.sh          (puedes volver a ejecutarlo: se salta lo que ya está instalado)
#       ./install.sh --lang en  (mensajes en inglés / English messages; por defecto según el idioma del sistema)
set -euo pipefail

# Idioma de los mensajes: español si el sistema está en español, si no inglés
UILANG="${LC_ALL:-${LC_MESSAGES:-${LANG:-en}}}"
[ "${1:-}" = "--lang" ] && UILANG="${2:-en}"
case "$UILANG" in es*) ES=1 ;; *) ES=0 ;; esac
t() { if [ "$ES" = 1 ]; then printf '%s' "$1"; else printf '%s' "$2"; fi; }

DIR="$(cd "$(dirname "$0")" && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "\n${GREEN}==> $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $*${NC}"; }
fail()  { echo -e "${RED}✖  $*${NC}"; exit 1; }
have()  { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="mac" ;;
  Linux)  PLATFORM="linux" ;;
  MINGW*|MSYS*|CYGWIN*) fail "$(t "Estás en Windows: haz doble clic en install.bat" "You are on Windows: double-click install.bat")" ;;
  *) fail "$(t "Sistema no soportado" "Unsupported system"): $OS" ;;
esac

PKG=""
if [ "$PLATFORM" = "linux" ]; then
  . /etc/os-release 2>/dev/null || true
  ID_ALL="${ID:-} ${ID_LIKE:-}"
  if   have apt-get; then PKG="apt"
  elif have dnf;     then PKG="dnf"
  elif have pacman;  then PKG="pacman"
  elif have zypper;  then PKG="zypper"
  else fail "$(t "No reconozco el gestor de paquetes de tu Linux" "I don't recognise your Linux package manager") ($ID_ALL). $(t "Instala a mano" "Install by hand"): supercollider, sc3-plugins, git, python3, curl."
  fi
fi

echo "🎛  $(t "Instalador de Tidal Studio" "Tidal Studio installer")"
echo "   $(t "Sistema detectado" "Detected system"): $OS $( [ -n "$PKG" ] && echo "($(t gestor manager): $PKG)")  ·  $(t arquitectura architecture): $(uname -m)"
echo "   $(t "Se instalarán" "Will install"): Python 3, Git, SuperCollider + SuperDirt, Haskell (ghcup) $(t y and) TidalCycles."
echo "   $(t "Tardará entre 10 y 30 minutos según tu conexión." "It takes 10 to 30 minutes depending on your connection.")"
if [ -t 0 ]; then read -r -p "   $(t "¿Continuar? [S/n]" "Continue? [Y/n]") " ans; case "${ans:-s}" in [nN]*) exit 0;; esac; fi

SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

# ---------------------------------------------------------------- 1. Paquetes base + SuperCollider
if [ "$PLATFORM" = "mac" ]; then
  step "1/5 $(t "Herramientas de Apple y Homebrew" "Apple tools and Homebrew")"
  if ! xcode-select -p >/dev/null 2>&1; then
    xcode-select --install || true
    warn "$(t "Se ha abierto la instalación de las 'Command Line Tools'. Cuando termine, vuelve a ejecutar ./install.sh" "The 'Command Line Tools' installer has opened. When it finishes, run ./install.sh again")"
    exit 0
  fi
  if ! have brew; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
    [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
  fi
  step "2/5 Python, Git $(t y and) SuperCollider"
  have python3 || brew install python
  have git || brew install git
  if [ ! -d /Applications/SuperCollider.app ] && [ ! -d "$HOME/Applications/SuperCollider.app" ]; then
    brew install --cask supercollider
  else echo "$(t "SuperCollider ya está instalado." "SuperCollider is already installed.")"; fi
  SCLANG="/Applications/SuperCollider.app/Contents/MacOS/sclang"
  [ -x "$SCLANG" ] || SCLANG="$HOME/Applications/SuperCollider.app/Contents/MacOS/sclang"
else
  step "1/5 $(t "Paquetes del sistema" "System packages")"
  case "$PKG" in
    apt)    $SUDO apt-get update
            $SUDO apt-get install -y python3 git curl build-essential libffi-dev libgmp-dev libncurses-dev pkg-config ;;
    dnf)    $SUDO dnf install -y python3 git curl gcc gcc-c++ make gmp-devel ncurses-devel libffi-devel ;;
    pacman) $SUDO pacman -Sy --needed --noconfirm python git curl base-devel gmp ncurses libffi ;;
    zypper) $SUDO zypper install -y python3 git curl gcc gcc-c++ make gmp-devel ncurses-devel libffi-devel ;;
  esac
  step "2/5 SuperCollider"
  if ! have sclang; then
    case "$PKG" in
      apt)    $SUDO apt-get install -y supercollider sc3-plugins || $SUDO apt-get install -y supercollider ;;
      dnf)    $SUDO dnf install -y supercollider || warn "$(t "Activa RPM Fusion o instala SuperCollider desde Flathub" "Enable RPM Fusion or install SuperCollider from Flathub")" ;;
      pacman) $SUDO pacman -S --needed --noconfirm supercollider sc3-plugins ;;
      zypper) $SUDO zypper install -y supercollider ;;
    esac
  else echo "$(t "SuperCollider ya está instalado." "SuperCollider is already installed.")"; fi
  # Audio: SuperCollider en Linux usa JACK. En sistemas con PipeWire basta con el puente pipewire-jack.
  if have pw-cli || have pipewire; then
    case "$PKG" in
      apt)    $SUDO apt-get install -y pipewire-jack || true ;;
      dnf)    $SUDO dnf install -y pipewire-jack-audio-connection-kit || true ;;
      pacman) $SUDO pacman -S --needed --noconfirm pipewire-jack || true ;;
    esac
  fi
  SCLANG="$(command -v sclang || true)"
fi

# ---------------------------------------------------------------- 2. SuperDirt
step "3/5 SuperDirt ($(t "sonidos y sintetizadores de Tidal" "Tidal sounds and synths"))"
if [ -n "${SCLANG:-}" ] && [ -x "$SCLANG" ]; then
  if [ "$PLATFORM" = "linux" ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then export QT_QPA_PLATFORM=offscreen; fi
  "$SCLANG" "$DIR/supercollider/install_superdirt.scd" || warn "$(t "No se pudo instalar SuperDirt automáticamente. Abre SuperCollider y ejecuta" "Couldn't install SuperDirt automatically. Open SuperCollider and run"): Quarks.install(\"SuperDirt\")"
else
  warn "$(t "No encuentro sclang. Instala SuperCollider y vuelve a ejecutar el instalador." "Can't find sclang. Install SuperCollider and run the installer again.")"
fi

# ---------------------------------------------------------------- 3. Haskell + Tidal
step "4/5 Haskell (ghcup) $(t y and) TidalCycles"
export PATH="$HOME/.ghcup/bin:$HOME/.cabal/bin:$PATH"
if ! have ghci || ! have cabal; then
  curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | \
    BOOTSTRAP_HASKELL_NONINTERACTIVE=1 BOOTSTRAP_HASKELL_ADJUST_BASHRC=1 sh
  export PATH="$HOME/.ghcup/bin:$PATH"
fi
cabal update
if ghc -e 'import Sound.Tidal.Context' -e 'return ()' >/dev/null 2>&1; then
  echo "$(t "TidalCycles ya está instalado." "TidalCycles is already installed.")"
else
  cabal install tidal --lib
fi

# ---------------------------------------------------------------- 4. Config
step "5/5 $(t Configuración Setup)"
chmod +x "$DIR/start.sh" 2>/dev/null || true
[ -f "$DIR/config.json" ] || cp "$DIR/config.example.json" "$DIR/config.json"
LANG="$([ "$ES" = 1 ] && echo es_ES.UTF-8 || echo en_US.UTF-8)" python3 "$DIR/server/app.py" --check || true

echo -e "\n${GREEN}✔ $(t "¡Listo!" "Done!")${NC} $(t "Para abrir el estudio ejecuta" "To open the studio run"):  ${YELLOW}./start.sh${NC}"
echo "  $(t "Después pulsa ⚙️ en la web para conectar tu IA (OpenAI, Claude, Ollama…)." "Then press ⚙️ in the web page to connect your AI (OpenAI, Claude, Ollama…).")"

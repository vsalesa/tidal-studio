#!/usr/bin/env bash
# Builds the offline Windows installer (TidalStudio-<version>-Windows-x64-Setup.exe) for Tidal Studio.
# Everything goes inside: Python, SuperCollider, SuperDirt + Dirt-Samples, GHC + TidalCycles.
#
# Runs in Git Bash on a Windows runner (CI: .github/workflows/installers.yml).
# The runtime is built in its final place, C:\TidalStudio, because GHC and the Cabal package database
# store absolute paths; the installer always installs there.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RT="/c/TidalStudio"          # as bash sees it
WRT="C:/TidalStudio"         # as Windows programs see it
VERSION="${VERSION:-$(cat "$REPO/packaging/VERSION")}"
GHC_VERSION="${GHC_VERSION:-9.8.4}"
TIDAL_VERSION="${TIDAL_VERSION:-1.10.1}"
CABAL_VERSION="${CABAL_VERSION:-3.12.1.0}"
PY_SERIES="${PY_SERIES:-3.12}"
WORK="$(cygpath -u "${RUNNER_TEMP:-$REPO/.build}")/tidal-studio-build"
DIST="$REPO/dist"
log() { echo -e "\n\033[1;32m==> $*\033[0m"; }
mkdir -p "$RT" "$WORK" "$DIST"

# ------------------------------------------------------------------ Python (standalone build)
if [ ! -x "$RT/python/python.exe" ]; then
  log "Python $PY_SERIES (python-build-standalone)"
  command -v uv >/dev/null || pip install uv
  rm -rf "$WORK/uv-python"
  uv python install "$PY_SERIES" --install-dir "$(cygpath -w "$WORK/uv-python")"
  PYDIR="$(dirname "$(ls -d "$WORK"/uv-python/cpython-*/python.exe | head -1)")"
  rm -rf "$RT/python" && cp -a "$PYDIR" "$RT/python"
fi
"$RT/python/python.exe" --version
test -x "$RT/python/pythonw.exe"

# ------------------------------------------------------------------ SuperCollider
if ! ls "$RT"/SuperCollider/sclang.exe >/dev/null 2>&1; then
  log "SuperCollider"
  ASSETS="$(gh api repos/supercollider/supercollider/releases/latest --jq '.assets[].browser_download_url')"
  echo "$ASSETS"
  ZIP="$(echo "$ASSETS" | grep -iE 'x64.*\.zip$' | grep -viE 'legacy|xp' | head -1 || true)"
  EXE="$(echo "$ASSETS" | grep -iE 'x64.*\.exe$' | grep -viE 'legacy|xp' | head -1 || true)"
  rm -rf "$RT/SuperCollider" "$WORK/sc"
  mkdir -p "$WORK/sc"
  if [ -n "$ZIP" ]; then
    curl -fL --retry 3 -o "$WORK/sc.zip" "$ZIP"
    unzip -q "$WORK/sc.zip" -d "$WORK/sc"
    SCDIR="$(dirname "$(find "$WORK/sc" -name sclang.exe | head -1)")"
    cp -a "$SCDIR" "$RT/SuperCollider"
  elif [ -n "$EXE" ]; then
    curl -fL --retry 3 -o "$WORK/sc-setup.exe" "$EXE"
    # NSIS installer: /S silent, /D=<dir> must be last and unquoted
    cmd //c "$(cygpath -w "$WORK/sc-setup.exe") /S /D=C:\\TidalStudio\\SuperCollider"
    # the installer may add Start menu entries; we only keep the files
  else
    echo "No SuperCollider Windows build found"; exit 1
  fi
fi
ls "$RT/SuperCollider" | head -30
test -f "$RT/SuperCollider/sclang.exe"

# ------------------------------------------------------------------ GHC + TidalCycles
if [ ! -f "$RT/tidal.env" ] || [ ! -f "$RT/ghc/bin/ghc.exe" ]; then
  if [ ! -f "$RT/ghc/bin/ghc.exe" ]; then
    log "GHC $GHC_VERSION -> $RT/ghc (official bindist, includes its MinGW toolchain)"
    curl -fL --retry 3 -o "$WORK/ghc.tar.xz" \
      "https://downloads.haskell.org/~ghc/$GHC_VERSION/ghc-$GHC_VERSION-x86_64-unknown-mingw32.tar.xz"
    rm -rf "$WORK/ghc-x" && mkdir -p "$WORK/ghc-x"
    tar -xJf "$WORK/ghc.tar.xz" -C "$WORK/ghc-x"
    rm -rf "$RT/ghc" && mv "$WORK"/ghc-x/ghc-* "$RT/ghc"
  fi
  ls "$RT/ghc/bin"
  log "cabal $CABAL_VERSION (build tool only, not shipped)"
  if [ ! -f "$WORK/cabal/cabal.exe" ]; then
    curl -fL --retry 3 -o "$WORK/cabal.zip" \
      "https://downloads.haskell.org/~cabal/cabal-install-$CABAL_VERSION/cabal-install-$CABAL_VERSION-x86_64-windows.zip"
    mkdir -p "$WORK/cabal" && unzip -oq "$WORK/cabal.zip" -d "$WORK/cabal"
  fi
  CABAL="$WORK/cabal/cabal.exe"
  export CABAL_DIR="$(cygpath -w "$WORK/cabal-home")"
  log "TidalCycles $TIDAL_VERSION -> $RT/cabal-store"
  "$CABAL" update
  rm -f "$RT/tidal.env"
  "$CABAL" --store-dir="$WRT/cabal-store" install --lib "tidal-$TIDAL_VERSION" \
      --package-env "$WRT/tidal.env" -w "$WRT/ghc/bin/ghc.exe"
fi
cat "$RT/tidal.env"
# the studio calls ghci.exe; some bindists only ship ghci-<version>.exe
if [ ! -f "$RT/ghc/bin/ghci.exe" ]; then
  G="$(ls "$RT"/ghc/bin/ghci-*.exe 2>/dev/null | head -1 || true)"
  [ -n "$G" ] && cp "$G" "$RT/ghc/bin/ghci.exe"
fi
test -f "$RT/ghc/bin/ghci.exe"

# ------------------------------------------------------------------ SuperDirt + sounds
if [ ! -d "$RT/quarks/Dirt-Samples/bd" ]; then
  log "SuperDirt + Dirt-Samples"
  bash "$REPO/packaging/common/prepare_quarks.sh" "$RT" "$WRT"
fi

# ------------------------------------------------------------------ Tidal Studio itself
log "Tidal Studio app files"
rm -rf "$RT/app" && mkdir -p "$RT/app/samples"
for d in server web tidal supercollider skills; do cp -a "$REPO/$d" "$RT/app/$d"; done
cp "$REPO/config.example.json" "$REPO/README.md" "$REPO/README.es.md" "$REPO/CREDITS.md" "$RT/app/"
find "$RT/app" -name '__pycache__' -prune -exec rm -rf {} +
echo "$VERSION" > "$RT/VERSION"
mkdir -p "$RT/bin"
cp "$REPO/packaging/common/launcher.py" "$RT/bin/launcher.py"
python -m pip install --quiet pillow
python - "$REPO/packaging/macos/AppIcon.png" "$(cygpath -w "$RT/bin/TidalStudio.ico")" <<'EOF'
import sys
from PIL import Image
Image.open(sys.argv[1]).convert("RGBA").save(sys.argv[2], sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
EOF

log "Removing docs and profiling libraries"
rm -rf "$RT/ghc/doc" "$RT/ghc/share/doc" "$RT/ghc/share/man"
find "$RT/ghc" "$RT/cabal-store" \( -name '*.p_hi' -o -name '*_p.a' -o -name '*.p_o' -o -name '*.p_dyn_hi' \) -delete
find "$RT/ghc/lib" -type d -name 'html' -prune -exec rm -rf {} + 2>/dev/null || true
du -sh "$RT"/* | sort -h

# ------------------------------------------------------------------ installer (Inno Setup)
log "Building the installer (Inno Setup)"
ISCC="$(command -v iscc || true)"
[ -n "$ISCC" ] || ISCC="/c/Program Files (x86)/Inno Setup 6/ISCC.exe"
if [ ! -f "$ISCC" ]; then choco install innosetup -y --no-progress; ISCC="/c/Program Files (x86)/Inno Setup 6/ISCC.exe"; fi
"$ISCC" //DAppVersion="$VERSION" //DSourceDir="$(cygpath -w "$RT")" //DOutDir="$(cygpath -w "$DIST")" \
  "$(cygpath -w "$REPO/packaging/windows/TidalStudio.iss")"
ls -lh "$DIST"

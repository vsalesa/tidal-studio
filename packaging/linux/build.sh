#!/usr/bin/env bash
# Builds the Linux package (.deb, Ubuntu 22.04+ / Debian 12+, x86_64) for Tidal Studio.
# Inside: Python, GHC + TidalCycles, SuperDirt + Dirt-Samples, Tidal Studio and its launcher.
# SuperCollider itself comes from the distribution (Depends: supercollider-language/-server), because
# it is linked against the system's Qt and audio libraries.
#
# The runtime is built in its final place, /opt/tidal-studio, because GHC and the Cabal package
# database store absolute paths. Run on Ubuntu (CI: .github/workflows/installers.yml).
# Output: dist/tidal-studio_<version>_amd64.deb
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RT="/opt/tidal-studio"
VERSION="${VERSION:-$(cat "$REPO/packaging/VERSION")}"
GHC_VERSION="${GHC_VERSION:-9.8.4}"
TIDAL_VERSION="${TIDAL_VERSION:-1.10.1}"
PY_SERIES="${PY_SERIES:-3.12}"
WORK="${RUNNER_TEMP:-$REPO/.build}/tidal-studio-build"
DIST="$REPO/dist"
log() { echo -e "\n\033[1;32m==> $*\033[0m"; }

sudo mkdir -p "$RT" && sudo chown "$(id -u):$(id -g)" "$RT"
mkdir -p "$WORK" "$DIST"

# ------------------------------------------------------------------ Python (standalone build)
if [ ! -x "$RT/python/bin/python3" ]; then
  log "Python $PY_SERIES (python-build-standalone)"
  command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  rm -rf "$WORK/uv-python"
  uv python install "$PY_SERIES" --install-dir "$WORK/uv-python"
  PYDIR="$(dirname "$(dirname "$(ls -d "$WORK"/uv-python/cpython-*/bin/python3 | head -1)")")"
  rm -rf "$RT/python" && cp -a "$PYDIR" "$RT/python"
fi
"$RT/python/bin/python3" --version

# ------------------------------------------------------------------ GHC + TidalCycles
export GHCUP_INSTALL_BASE_PREFIX="$WORK/ghcup-home"
GHCUP="$WORK/ghcup"
if [ ! -f "$RT/tidal.env" ] || [ ! -x "$RT/ghc/bin/ghci" ]; then
  log "ghcup (build tool only, not shipped)"
  [ -x "$GHCUP" ] || curl -fL --retry 3 -o "$GHCUP" "https://downloads.haskell.org/~ghcup/x86_64-linux-ghcup"
  chmod +x "$GHCUP"
  "$GHCUP" install cabal recommended
  CABAL="$GHCUP_INSTALL_BASE_PREFIX/.ghcup/bin/cabal"
  if [ ! -x "$RT/ghc/bin/ghci" ]; then
    log "GHC $GHC_VERSION -> $RT/ghc"
    rm -rf "$RT/ghc"
    "$GHCUP" install ghc "$GHC_VERSION" --isolate "$RT/ghc" --force
  fi
  for t in ghc ghci ghc-pkg runghc; do
    [ -e "$RT/ghc/bin/$t" ] || ln -s "$t-$GHC_VERSION" "$RT/ghc/bin/$t"
  done
  log "TidalCycles $TIDAL_VERSION -> $RT/cabal-store"
  "$CABAL" update
  rm -f "$RT/tidal.env"
  "$CABAL" --store-dir="$RT/cabal-store" install --lib "tidal-$TIDAL_VERSION" \
      --package-env "$RT/tidal.env" -w "$RT/ghc/bin/ghc"
fi
cat "$RT/tidal.env"

# ------------------------------------------------------------------ SuperDirt + sounds
if [ ! -d "$RT/quarks/Dirt-Samples/bd" ]; then
  log "SuperDirt + Dirt-Samples"
  bash "$REPO/packaging/common/prepare_quarks.sh" "$RT"
fi

# ------------------------------------------------------------------ Tidal Studio itself
log "Tidal Studio app files"
rm -rf "$RT/app" && mkdir -p "$RT/app/samples"
for d in server web tidal supercollider skills; do [ -d "$REPO/$d" ] && cp -a "$REPO/$d" "$RT/app/$d"; done
cp "$REPO/config.example.json" "$REPO/README.md" "$REPO/README.es.md" "$REPO/CREDITS.md" "$RT/app/"
find "$RT/app" -name '__pycache__' -prune -exec rm -rf {} +
echo "$VERSION" > "$RT/VERSION"
mkdir -p "$RT/bin"
install -m 644 "$REPO/packaging/common/launcher.py" "$RT/bin/launcher.py"
install -m 755 "$REPO/packaging/linux/tidal-studio-window.py" "$RT/bin/tidal-studio-window.py"

log "Removing docs and profiling libraries"
rm -rf "$RT/ghc/share/doc" "$RT/ghc/share/man"
find "$RT/ghc" "$RT/cabal-store" \( -name '*.p_hi' -o -name '*_p.a' -o -name '*.p_o' -o -name '*.p_dyn_hi' \) -delete
find "$RT/ghc/lib" -type d -name 'html' -prune -exec rm -rf {} + 2>/dev/null || true
du -sh "$RT"/* | sort -h

# ------------------------------------------------------------------ .deb
log "Building the .deb"
PKG="$WORK/deb"
rm -rf "$PKG" && mkdir -p "$PKG/DEBIAN" "$PKG/opt" "$PKG/usr/bin" "$PKG/usr/share/applications" \
  "$PKG/usr/share/icons/hicolor/256x256/apps" "$PKG/usr/share/icons/hicolor/512x512/apps"
cp -a "$RT" "$PKG/opt/"
cat > "$PKG/usr/bin/tidal-studio" <<'EOF'
#!/bin/sh
exec /opt/tidal-studio/python/bin/python3 /opt/tidal-studio/bin/launcher.py "$@"
EOF
chmod 755 "$PKG/usr/bin/tidal-studio"
install -m 644 "$REPO/packaging/linux/tidal-studio.desktop" "$PKG/usr/share/applications/tidal-studio.desktop"
"$RT/python/bin/python3" - "$REPO/packaging/macos/AppIcon.png" "$PKG/usr/share/icons/hicolor" <<'EOF' || true
import shutil, sys
src, dest = sys.argv[1], sys.argv[2]
for s in (256, 512):
    shutil.copy(src, f"{dest}/{s}x{s}/apps/tidal-studio.png")  # same image; the desktop scales it
EOF
SIZE="$(du -sk "$PKG" | cut -f1)"
cat > "$PKG/DEBIAN/control" <<EOF
Package: tidal-studio
Version: $VERSION
Architecture: amd64
Maintainer: Tidal Studio <https://github.com/vsalesa/tidal-studio>
Installed-Size: $SIZE
Section: sound
Priority: optional
Homepage: https://vsalesa.github.io/tidal-studio/
Depends: supercollider-language, supercollider-server, libgmp10, libffi8 | libffi7, libnuma1, gcc, libc6-dev, python3, python3-gi, gir1.2-gtk-3.0, gir1.2-webkit2-4.1 | gir1.2-webkit2-4.0
Recommends: sc3-plugins-server, pipewire-jack | jackd2, chromium | chromium-browser
Description: Learn TidalCycles and make music with a friendly AI producer
 Tidal Studio is a live-coding music studio built on TidalCycles and SuperCollider, with
 Maestro, an assistant that suggests ideas and explains the code. This package includes
 TidalCycles with its own GHC, SuperDirt and the Dirt-Samples sounds.
EOF
cat > "$PKG/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t /usr/share/icons/hicolor || true
exit 0
EOF
chmod 755 "$PKG/DEBIAN/postinst"
OUT="$DIST/tidal-studio_${VERSION}_amd64.deb"
dpkg-deb --root-owner-group -Zxz --build "$PKG" "$OUT"
ls -lh "$OUT"

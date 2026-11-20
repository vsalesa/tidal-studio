#!/usr/bin/env bash
# Builds the offline macOS installer (.pkg) for Tidal Studio.
# Everything (Python, SuperCollider, SuperDirt + Dirt-Samples, GHC + TidalCycles) goes inside the
# package, so installing it downloads nothing.
#
# The runtime is built directly in its final location, /Users/Shared/TidalStudio, because GHC and
# the Cabal package database store absolute paths. /Users/Shared is writable by every user, so the
# build needs no sudo and the installed paths match the build paths exactly.
#
# Run on macOS (CI: .github/workflows/installers.yml). Needs: git, curl, gh (for release lookups).
# Output: dist/TidalStudio-<version>-macOS-<AppleSilicon|Intel>.pkg
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RT="/Users/Shared/TidalStudio"
VERSION="${VERSION:-$(cat "$REPO/packaging/VERSION")}"
GHC_VERSION="${GHC_VERSION:-9.8.4}"
TIDAL_VERSION="${TIDAL_VERSION:-1.10.1}"
PY_SERIES="${PY_SERIES:-3.12}"
WORK="${RUNNER_TEMP:-$REPO/.build}/tidal-studio-build"
DIST="$REPO/dist"

case "$(uname -m)" in
  arm64)  ARCH=aarch64; LABEL=AppleSilicon ;;
  x86_64) ARCH=x86_64;  LABEL=Intel ;;
  *) echo "unsupported arch $(uname -m)"; exit 1 ;;
esac
mkdir -p "$RT" "$WORK" "$DIST"
log() { echo -e "\n\033[1;32m==> $*\033[0m"; }

# ------------------------------------------------------------------ Python (standalone build)
if [ ! -x "$RT/python/bin/python3" ]; then
  log "Python $PY_SERIES (python-build-standalone)"
  PBS_ID="$(gh api repos/astral-sh/python-build-standalone/releases/latest --jq .id)"
  URL="$(gh api --paginate "repos/astral-sh/python-build-standalone/releases/$PBS_ID/assets?per_page=100" --jq '.[].browser_download_url' \
        | grep -m1 -E "cpython-${PY_SERIES}\.[0-9]+\+[0-9]+-${ARCH}-apple-darwin-install_only\.tar\.gz$" || true)"
  [ -n "$URL" ] || { echo "No python-build-standalone asset found for $PY_SERIES/$ARCH"; exit 1; }
  echo "$URL"
  curl -fL --retry 3 -o "$WORK/python.tar.gz" "$URL"
  rm -rf "$RT/python" && tar -xzf "$WORK/python.tar.gz" -C "$RT"     # extracts to $RT/python
fi
"$RT/python/bin/python3" --version

# ------------------------------------------------------------------ SuperCollider
if [ ! -x "$RT/SuperCollider.app/Contents/MacOS/sclang" ]; then
  log "SuperCollider"
  ASSETS="$(gh api repos/supercollider/supercollider/releases/latest --jq '.assets[].browser_download_url')"
  URL="$(echo "$ASSETS" | grep -m1 -iE 'macos.*universal.*\.dmg$' || true)"
  [ -n "$URL" ] || URL="$(echo "$ASSETS" | grep -iE 'macos.*\.dmg$' | grep -m1 -viE 'legacy' || true)"
  [ -n "$URL" ] || { echo "No SuperCollider macOS dmg found in:"; echo "$ASSETS"; exit 1; }
  echo "$URL"
  curl -fL --retry 3 -o "$WORK/sc.dmg" "$URL"
  MNT="$(mktemp -d)"
  hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$WORK/sc.dmg"
  SCAPP="$(find "$MNT" -maxdepth 2 -name 'SuperCollider.app' -print -quit)"
  rm -rf "$RT/SuperCollider.app" && ditto "$SCAPP" "$RT/SuperCollider.app"
  hdiutil detach "$MNT"
fi

# ------------------------------------------------------------------ GHC + TidalCycles
export GHCUP_INSTALL_BASE_PREFIX="$WORK/ghcup-home"
GHCUP="$WORK/ghcup"
if [ ! -f "$RT/tidal.env" ] || [ ! -x "$RT/ghc/bin/ghci" ]; then
  log "ghcup (build tool only, not shipped)"
  [ -x "$GHCUP" ] || curl -fL --retry 3 -o "$GHCUP" "https://downloads.haskell.org/~ghcup/${ARCH}-apple-darwin-ghcup"
  chmod +x "$GHCUP"
  "$GHCUP" install cabal recommended
  CABAL="$GHCUP_INSTALL_BASE_PREFIX/.ghcup/bin/cabal"

  if [ ! -x "$RT/ghc/bin/ghci" ]; then
    log "GHC $GHC_VERSION -> $RT/ghc"
    rm -rf "$RT/ghc"
    "$GHCUP" install ghc "$GHC_VERSION" --isolate "$RT/ghc" --force
  fi
  # unversioned names (ghc, ghci) are what the studio calls
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
for d in server web tidal supercollider; do ditto "$REPO/$d" "$RT/app/$d"; done
cp "$REPO/config.example.json" "$REPO/README.md" "$REPO/README.es.md" "$REPO/CREDITS.md" "$RT/app/"
find "$RT/app" -name '__pycache__' -prune -exec rm -rf {} +
echo "$VERSION" > "$RT/VERSION"
install -m 755 "$REPO/packaging/macos/TidalStudio.command" "$RT/Tidal Studio.command"

# ------------------------------------------------------------------ slim down (docs, profiling libs)
log "Removing docs and profiling libraries"
rm -rf "$RT/ghc/share/doc" "$RT/ghc/share/man"
find "$RT/ghc" "$RT/cabal-store" \( -name '*.p_hi' -o -name '*_p.a' -o -name '*.p_o' -o -name '*.p_dyn_hi' \) -delete
find "$RT/ghc/lib" -type d -name 'html' -prune -exec rm -rf {} + 2>/dev/null || true
du -sh "$RT"/* | sort -h

# ------------------------------------------------------------------ /Applications/Tidal Studio.app
log "App bundle"
APPSTAGE="$WORK/appstage"
rm -rf "$APPSTAGE" && mkdir -p "$APPSTAGE/Tidal Studio.app/Contents/MacOS" "$APPSTAGE/Tidal Studio.app/Contents/Resources"
sed "s/@VERSION@/$VERSION/g" "$REPO/packaging/macos/Info.plist" > "$APPSTAGE/Tidal Studio.app/Contents/Info.plist"
install -m 755 "$REPO/packaging/macos/launcher.sh" "$APPSTAGE/Tidal Studio.app/Contents/MacOS/TidalStudio"
if [ -f "$REPO/packaging/macos/AppIcon.png" ]; then
  ICONSET="$WORK/AppIcon.iconset"; rm -rf "$ICONSET"; mkdir -p "$ICONSET"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$REPO/packaging/macos/AppIcon.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
    sips -z $((s*2)) $((s*2)) "$REPO/packaging/macos/AppIcon.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APPSTAGE/Tidal Studio.app/Contents/Resources/AppIcon.icns"
fi

# ------------------------------------------------------------------ .pkg
log "Building the installer package"
# Bundles inside a package are "relocatable" by default: Installer would then update an existing
# SuperCollider.app elsewhere on the Mac instead of installing ours. Turn that off.
nonreloc() {  # root plist
  pkgbuild --analyze --root "$1" "$2"
  local n; n="$(/usr/libexec/PlistBuddy -c 'Print' "$2" | grep -c 'RootRelativeBundlePath' || true)"
  for ((i=0; i<n; i++)); do /usr/libexec/PlistBuddy -c "Set :$i:BundleIsRelocatable false" "$2"; done
}
nonreloc "$RT" "$WORK/runtime.plist"
nonreloc "$APPSTAGE" "$WORK/app.plist"
pkgbuild --root "$RT" --install-location "$RT" --component-plist "$WORK/runtime.plist" \
  --identifier io.github.vsalesa.tidalstudio.runtime --version "$VERSION" "$WORK/runtime.pkg"
pkgbuild --root "$APPSTAGE" --install-location /Applications --component-plist "$WORK/app.plist" \
  --identifier io.github.vsalesa.tidalstudio.app --version "$VERSION" "$WORK/app.pkg"

sed "s/@VERSION@/$VERSION/g; s/@ARCH@/$(uname -m)/g" "$REPO/packaging/macos/distribution.xml" > "$WORK/distribution.xml"
mkdir -p "$WORK/resources" && cp "$REPO/packaging/macos/welcome.html" "$WORK/resources/"
OUT="$DIST/TidalStudio-$VERSION-macOS-$LABEL.pkg"
productbuild --distribution "$WORK/distribution.xml" --package-path "$WORK" \
  --resources "$WORK/resources" "$OUT"
ls -lh "$OUT"

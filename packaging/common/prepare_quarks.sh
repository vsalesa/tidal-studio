#!/usr/bin/env bash
# Downloads SuperDirt, its dependency Vowel and the Dirt-Samples sound pack into <dest>/quarks
# and writes <dest>/sclang_conf.yaml so sclang loads them without the Quarks system.
# Used only at build time (CI); the finished installer contains everything.
# Usage: prepare_quarks.sh <dest-root> [path-as-seen-by-sclang]
set -euo pipefail
DEST="$1"
SCPATH="${2:-$1}"          # on Windows we pass C:/TidalStudio while bash sees /c/TidalStudio
SUPERDIRT_TAG="${SUPERDIRT_TAG:-v1.7.4}"

mkdir -p "$DEST/quarks"
clone() {  # repo dir [tag]
  rm -rf "$DEST/quarks/$2"
  if [ -n "${3:-}" ]; then
    git clone --depth 1 --branch "$3" "https://github.com/$1" "$DEST/quarks/$2"
  else
    git clone --depth 1 "https://github.com/$1" "$DEST/quarks/$2"
  fi
  rm -rf "$DEST/quarks/$2/.git"
}
clone musikinformatik/SuperDirt SuperDirt "$SUPERDIRT_TAG"
clone supercollider-quarks/Vowel Vowel
clone tidalcycles/Dirt-Samples Dirt-Samples   # SuperDirt finds it at ../../Dirt-Samples from its classes

cat > "$DEST/sclang_conf.yaml" <<EOF
includePaths:
  - "$SCPATH/quarks/SuperDirt"
  - "$SCPATH/quarks/Vowel"
excludePaths:
  []
postInlineWarnings: false
excludeDefaultPaths: false
EOF
echo "Quarks ready in $DEST/quarks"

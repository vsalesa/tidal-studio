#!/bin/bash
# Starts Tidal Studio from the offline install (/Users/Shared/TidalStudio).
# The installed files are read-only, so the studio runs from a copy in your user folder,
# where it keeps config.json, your samples and recordings.
RT="/Users/Shared/TidalStudio"
DATA="$HOME/Library/Application Support/Tidal Studio"
mkdir -p "$DATA/app/samples"
# refresh the program files, never touching your settings, samples or recordings
rsync -a --exclude config.json --exclude samples --exclude recordings "$RT/app/" "$DATA/app/"
chmod -R u+w "$DATA/app" 2>/dev/null

export TIDAL_GHCI="$RT/ghc/bin/ghci"
export GHC_ENVIRONMENT="$RT/tidal.env"
export TIDAL_SCLANG="$RT/SuperCollider.app/Contents/MacOS/sclang"
export TIDAL_SCLANG_CONF="$RT/sclang_conf.yaml"
export PATH="$RT/python/bin:$RT/ghc/bin:$PATH"

clear
echo "Tidal Studio $(cat "$RT/VERSION" 2>/dev/null)"
echo "Close this window (or press Ctrl+C) to stop the studio."
echo
cd "$DATA/app" && exec "$RT/python/bin/python3" server/app.py "$@"

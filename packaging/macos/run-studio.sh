#!/bin/bash
# Starts the Tidal Studio server from the offline install (/Users/Shared/TidalStudio).
# Used by /Applications/Tidal Studio.app (in the background, no Terminal) and by
# "Tidal Studio.command" (in Terminal, for troubleshooting). Extra arguments go to server/app.py.
#
# The installed files are read-only, so the studio runs from a copy in your user folder,
# where it keeps config.json, your samples and recordings.
RT="/Users/Shared/TidalStudio"
DATA="$HOME/Library/Application Support/Tidal Studio"
mkdir -p "$DATA/app/samples"
# refresh the program files, never touching your settings, samples or recordings
rsync -a --exclude config.json --exclude samples --exclude recordings --exclude my-plugins --exclude my-skills "$RT/app/" "$DATA/app/"
chmod -R u+w "$DATA/app" 2>/dev/null

export TIDAL_GHCI="$RT/ghc/bin/ghci"
export GHC_ENVIRONMENT="$RT/tidal.env"
export TIDAL_SCLANG="$RT/SuperCollider.app/Contents/MacOS/sclang"
export TIDAL_SCLANG_CONF="$RT/sclang_conf.yaml"
export PYTHONUNBUFFERED=1
# lets the studio find its version and install updates (server/appupdate.py)
export TIDAL_STUDIO_RUNTIME="$RT"
# shims/: lets GHCi run on Macs without the Xcode Command Line Tools.
# Apps opened from the Finder get a minimal PATH and no shell profile, so add the usual places
# where tools such as the `claude` command (Claude subscription provider) live.
export PATH="$RT/shims:$RT/python/bin:$RT/ghc/bin:$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.claude/local:$HOME/.npm-global/bin"

echo "Tidal Studio $(cat "$RT/VERSION" 2>/dev/null) · $(date)"
cd "$DATA/app" && exec "$RT/python/bin/python3" server/app.py "$@"

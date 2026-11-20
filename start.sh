#!/usr/bin/env bash
# Abre Tidal Studio (macOS / Linux)
cd "$(dirname "$0")"
export PATH="$HOME/.ghcup/bin:$HOME/.cabal/bin:$PATH"
exec python3 server/app.py "$@"

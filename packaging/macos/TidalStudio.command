#!/bin/bash
# Troubleshooting only: runs Tidal Studio in a Terminal window and opens it in your web browser.
# Normally you just open /Applications/Tidal Studio.app, which needs no Terminal.
clear
echo "Close this window (or press Ctrl+C) to stop the studio."
exec /bin/bash --noprofile --norc "/Users/Shared/TidalStudio/bin/run-studio.sh" "$@"

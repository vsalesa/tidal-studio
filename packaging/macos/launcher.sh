#!/bin/bash
# /Applications/Tidal Studio.app → opens the studio in a Terminal window (close it to stop the studio).
RT="/Users/Shared/TidalStudio"
if [ ! -x "$RT/Tidal Studio.command" ]; then
  osascript -e 'display alert "Tidal Studio" message "The studio files are missing in /Users/Shared/TidalStudio. Please run the installer again."'
  exit 1
fi
open -a Terminal "$RT/Tidal Studio.command"

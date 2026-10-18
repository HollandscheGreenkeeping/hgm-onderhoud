#!/bin/sh
# Rendert de mock-ups uit mockups.html naar PNG (2× scherp) in public/marketing/,
# zodat ze na de deploy op een vaste URL staan voor de nieuwsbrief.
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
UIT=../public/marketing
mkdir -p "$UIT"
render() { # naam breedte hoogte
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --force-device-scale-factor=2 --window-size="$2,$3" --virtual-time-budget=4000 \
    --screenshot="$UIT/$1.png" "file://$PWD/mockups.html?m=$1" >/dev/null 2>&1
}
render laptop 1260 820
render telefoon-kaart 470 880
render telefoon-melden 470 880
render horloge 340 380
render duo 1480 940
ls -la "$UIT"

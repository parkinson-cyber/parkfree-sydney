#!/usr/bin/env bash
# App Store screenshots, taken from the Simulator.
#
# App Store Connect takes 6.9-inch shots at 1320x2868 (iPhone 16 Pro Max) or
# 6.7-inch at 1290x2796 (iPhone 15 Pro Max). Both simulators report those sizes
# natively, so no scaling or padding is needed — what simctl captures is what
# gets uploaded. Default to 6.9", which is the slot Apple asks for first now.
#
# The status bar matters more than it sounds: by default a screenshot shows
# whatever time the Mac happens to be at, a half-empty battery and patchy
# signal, which reads as a phone in trouble rather than an app in use. Apple's
# own marketing convention is 9:41, full bars, full battery, and `simctl
# status_bar` sets exactly that.
#
#   ./scripts/store-screenshots.sh            # launch app, set up, shoot frame 1
#   ./scripts/store-screenshots.sh 3 busy     # shoot frame 3, named "busy"
#
# Frames to capture (see docs/app-store-listing.md):
#   1 map        the map over the CBD, colours visible, tab bar showing
#   2 street     a street sheet open — per-side rules, limit, Park here
#   3 busy       the busy estimate with its confidence pill and evidence
#   4 saved      saved spot + timer running
#   5 settings   legend and the real coverage numbers

set -euo pipefail

# This Mac's `xcode-select` still points at the standalone Command Line Tools,
# and switching it needs sudo. Pointing DEVELOPER_DIR at Xcode 16.2 gets the
# same result for this script without needing a password.
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d "/Applications/Xcode 2.app/Contents/Developer" ]; then
  export DEVELOPER_DIR="/Applications/Xcode 2.app/Contents/Developer"
fi

DEVICE="${DEVICE:-iPhone 16 Pro Max}"
BUNDLE="${BUNDLE:-com.parkfree.sydney}"
OUT="${OUT:-docs/store-screenshots}"
FRAME="${1:-1}"
NAME="${2:-map}"

mkdir -p "$OUT"

if ! xcrun simctl list devices booted | grep -q "$DEVICE"; then
  echo "booting $DEVICE…"
  xcrun simctl boot "$DEVICE"
  sleep 8
fi

# 9:41, full signal, full battery — the Apple marketing convention.
xcrun simctl status_bar "$DEVICE" override \
  --time "9:41" \
  --dataNetwork wifi \
  --wifiMode active \
  --wifiBars 3 \
  --cellularMode active \
  --cellularBars 4 \
  --batteryState charged \
  --batteryLevel 100 2>/dev/null || echo "(status bar override unavailable — continuing)"

if ! xcrun simctl get_app_container "$DEVICE" "$BUNDLE" >/dev/null 2>&1; then
  echo "ERROR: $BUNDLE is not installed on $DEVICE."
  echo "Build it first:  npx expo run:ios --device \"$DEVICE\" --configuration Release"
  exit 1
fi

xcrun simctl launch "$DEVICE" "$BUNDLE" >/dev/null 2>&1 || true
echo "app launched — arrange the screen for frame $FRAME ($NAME), then press Return"
read -r _

FILE="$OUT/$(printf '%02d' "$FRAME")-$NAME.png"
xcrun simctl io "$DEVICE" screenshot "$FILE"

W=$(sips -g pixelWidth "$FILE" | tail -1 | awk '{print $2}')
H=$(sips -g pixelHeight "$FILE" | tail -1 | awk '{print $2}')
echo "saved $FILE (${W}x${H})"
case "${W}x${H}" in
  1320x2868) echo "  → 6.9-inch slot (iPhone 16 Pro Max)" ;;
  1290x2796) echo "  → 6.7-inch slot (iPhone 15 Pro Max)" ;;
  *) echo "  WARNING: ${W}x${H} matches no App Store slot; expected 1320x2868 or 1290x2796." ;;
esac

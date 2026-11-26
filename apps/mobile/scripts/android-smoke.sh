#!/usr/bin/env bash
set -euo pipefail

apk="$1"
out_dir="$2"
package=app.openhoop.mobile

mkdir -p "$out_dir"
adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 1; done'
adb install -r "$apk"
adb logcat -c
adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 30
adb exec-out screencap -p > "$out_dir/android-emulator.png" || true

adb logcat -d > "$out_dir/logcat.txt" || true
adb logcat -d -b crash > "$out_dir/logcat-crash.txt" || true

if ! adb shell pidof "$package" >/dev/null; then
  echo "::error::OpenHoop is no longer running 30 seconds after launch on the emulator."
  tail -n 80 "$out_dir/logcat-crash.txt" || true
  exit 1
fi
if grep -E "FATAL EXCEPTION|ReactNativeJS: .*(Error|Exception)" "$out_dir/logcat.txt"; then
  echo "::error::OpenHoop logged a fatal or JavaScript error during launch on the emulator."
  exit 1
fi
echo "OpenHoop is still running after 30 seconds."

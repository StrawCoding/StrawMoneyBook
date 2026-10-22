#!/usr/bin/env bash
# Reproducible Android competitive-audit environment (API 34, Pixel 6).
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
AVD_NAME="${AVD_NAME:-smb_competitive}"
SYSIMG="system-images;android-34;google_apis;x86_64"

if ! avdmanager list avd 2>/dev/null | grep -q "Name: ${AVD_NAME}"; then
  echo "Creating AVD ${AVD_NAME}..."
  echo no | avdmanager create avd -n "$AVD_NAME" -k "$SYSIMG" -d pixel_6
fi

if ! adb devices | grep -q 'emulator-5554[[:space:]]*device'; then
  echo "Starting emulator (headless)..."
  nohup emulator -avd "$AVD_NAME" -no-window -no-audio -gpu swiftshader_indirect -no-boot-anim -port 5554 \
    > /tmp/emulator-smb-competitive.log 2>&1 &
  for _ in $(seq 1 90); do
    if adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | grep -q 1; then
      break
    fi
    sleep 2
  done
fi

adb -s emulator-5554 wait-for-device
echo "Emulator ready: $(adb devices | grep emulator)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APKDIR="$(cd "$SCRIPT_DIR/../apks" && pwd)"
mkdir -p "$APKDIR"

if command -v /tmp/apkeep >/dev/null 2>&1 || [[ -x /tmp/apkeep ]]; then
  APKEEP=/tmp/apkeep
else
  curl -fsSL -o /tmp/apkeep "https://github.com/EFForg/apkeep/releases/download/0.17.0/apkeep-x86_64-unknown-linux-gnu"
  chmod +x /tmp/apkeep
  APKEEP=/tmp/apkeep
fi

"$APKEEP" -a tw.com.moneybook.moneybook -d apk-pure "$APKDIR" || true
"$APKEEP" -a com.lovelyduck.daak -d huawei-app-gallery "$APKDIR" || true

cd "$APKDIR"
if [[ -f tw.com.moneybook.moneybook.xapk ]]; then
  unzip -o -j tw.com.moneybook.moneybook.xapk tw.com.moneybook.moneybook.apk config.mdpi.apk
fi

SMB_APK="${SMB_APK:-/mnt/data/Data/serviceApps/Hermes/strawmoneybook-1.4.5-huanan-h1h2-phase-a.apk}"
adb -s emulator-5554 install-multiple -r tw.com.moneybook.moneybook.apk config.mdpi.apk 2>/dev/null \
  || adb -s emulator-5554 install -r tw.com.moneybook.moneybook.apk || true
adb -s emulator-5554 install -r com.lovelyduck.daak.apk || true
adb -s emulator-5554 install -r "$SMB_APK" || true

echo "Installed packages:"
adb -s emulator-5554 shell pm list packages | grep -E 'lovelyduck|moneybook|strawcoding' || true

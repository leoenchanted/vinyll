#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_ROOT="$PROJECT_ROOT/bridge/macos/Vinyll.NeteaseCompanion"
BUILD_ROOT="$PROJECT_ROOT/release/macos-build"
APP_ROOT="$PROJECT_ROOT/release/Vinyll 网易云助手.app"
OUTPUT_ZIP="$PROJECT_ROOT/release/Vinyll.NeteaseCompanion-macOS-universal.zip"
MODULE_CACHE="$BUILD_ROOT/module-cache"

rm -rf "$BUILD_ROOT" "$APP_ROOT" "$OUTPUT_ZIP"
mkdir -p "$BUILD_ROOT" "$MODULE_CACHE" "$APP_ROOT/Contents/MacOS"

SOURCES=("$SOURCE_ROOT"/Sources/*.swift)
COMMON=(
  -O
  -framework AppKit
  -framework ServiceManagement
  -module-cache-path "$MODULE_CACHE"
)

swiftc "${COMMON[@]}" -target arm64-apple-macosx15.4 "${SOURCES[@]}" -o "$BUILD_ROOT/companion-arm64"
swiftc "${COMMON[@]}" -target x86_64-apple-macosx15.4 "${SOURCES[@]}" -o "$BUILD_ROOT/companion-x86_64"
lipo -create "$BUILD_ROOT/companion-arm64" "$BUILD_ROOT/companion-x86_64" -output "$APP_ROOT/Contents/MacOS/VinyllNeteaseCompanion"
cp "$SOURCE_ROOT/Resources/Info.plist" "$APP_ROOT/Contents/Info.plist"
codesign --force --deep --sign - "$APP_ROOT"
ditto -c -k --sequesterRsrc --keepParent "$APP_ROOT" "$OUTPUT_ZIP"

echo "$OUTPUT_ZIP"

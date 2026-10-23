#!/usr/bin/env bash
# Baut das Anthropic-SDK als einzelne ES-Modul-Datei für den Browser (kein Build-Schritt in der App).
# Nur nötig, wenn die SDK-Version aktualisiert werden soll.
set -euo pipefail
VERSION="${1:-0.132.1}"
TMP="$(mktemp -d)"
cd "$TMP"
npm init -y >/dev/null
npm i "@anthropic-ai/sdk@$VERSION" esbuild@0.25.10 >/dev/null
echo "export { default as Anthropic } from '@anthropic-ai/sdk';" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --legal-comments=eof \
  --outfile="$OLDPWD/vendor/anthropic-sdk.mjs"
echo "vendor/anthropic-sdk.mjs aus @anthropic-ai/sdk@$VERSION gebaut"

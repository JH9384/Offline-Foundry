#!/bin/bash
# The chat app under shell/ui/: Hollama (github.com/fmaclen/hollama, MIT) at one pinned commit, built as
# static files under the Pages subpath, with the Hologram brand kit's tokens, fonts and mark and the
# name Hologram. Reproducible: clone at HOLLAMA_REV, apply scripts/hollama-brand.patch (the source lines:
# name strings, asset paths, links, the static adapter and base path, the prerendered metadata route),
# run tools/kit-to-hsl.mjs (the colour variables from the kit's CSS, the fonts, the mark), place our own
# scripts/ui-seed.js and scripts/ui-host.js beside them (the seeded connection, the worker, the engine
# and the download bar), build, copy.
#
#   ./scripts/build-hollama.sh            # writes shell/ui/
#
# Needs git, node >= 22 and network for the clone and npm ci. The static adapter is installed without
# being saved, so package.json and the lock stay the upstream's.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOLLAMA_REV="78c63850fa9fdb3dc4ce447c6b0e86c3af926123"   # tag 0.35.4
BASE_PATH="/hologram-forge/ui"
WORK="${HOLLAMA_WORK:-$ROOT/vendor/hollama-build}"
rm -rf "$WORK"; mkdir -p "$WORK"
git -c advice.detachedHead=false clone -q https://github.com/fmaclen/hollama.git "$WORK"
git -C "$WORK" checkout -q "$HOLLAMA_REV"
git -C "$WORK" -c core.autocrlf=false apply --whitespace=nowarn "$ROOT/scripts/hollama-brand.patch"
node "$ROOT/tools/kit-to-hsl.mjs" "$WORK"
cp "$ROOT/scripts/ui-seed.js" "$ROOT/scripts/ui-host.js" "$WORK/static/"
(cd "$WORK" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error && npm i --no-save --ignore-scripts --no-audit --no-fund --loglevel=error @sveltejs/adapter-static@3)
(cd "$WORK" && MSYS_NO_PATHCONV=1 PUBLIC_BASE_PATH="$BASE_PATH" npm run build >/dev/null)
rm -rf "$ROOT/shell/ui"
cp -r "$WORK/build" "$ROOT/shell/ui"
cp "$WORK/LICENSE" "$ROOT/shell/ui/LICENSE-hollama.txt"
echo "shell/ui: $(find "$ROOT/shell/ui" -type f | wc -l) files from hollama $HOLLAMA_REV, base $BASE_PATH"

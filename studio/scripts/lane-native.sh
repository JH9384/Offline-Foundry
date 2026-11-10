#!/bin/bash
# The lane from a WSL native mirror of this checkout. A Windows mounted tree (DrvFs without
# metadata) refuses `lexlean verify`'s publish step with EACCES; a native copy does not. This
# mirrors the tree to $HOME/fp-lane, runs the lane there with LANE_WRITE=1, and copies the
# artifacts back: generated/, the verified attestations, and the projected site files.
#
#   ./scripts/lane-native.sh          # pin axioms, author, lane, copy back
set -uo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="$HOME/fp-lane"
export PATH="$HOME/.cache/freeinference-prism-lane/PrismPM/target/release:$HOME/.elan/bin:$PATH"
mkdir -p "$DST"
rsync -a --delete --exclude core/target --exclude .lexlean/build --exclude .lexlean/pdf --exclude node_modules "$SRC/" "$DST/"
cd "$DST"
python3 tools/pin_axioms.py 2>&1 | tail -1
python3 tools/author.py >/dev/null
LANE_WRITE=1 ./scripts/lane.sh 2>&1 | grep -E 'verified 1 module|lane:|uncaught|error\[|denied|differ' | tail -4
status=$?
rsync -a "$DST/generated/" "$SRC/generated/"
rsync -a "$DST/tools/axioms.json" "$SRC/tools/axioms.json"
rsync -a "$DST/src/Freeinference.lex.tex" "$SRC/src/Freeinference.lex.tex"
rsync -a "$DST/.lexlean/verified/" "$SRC/.lexlean/verified/" 2>/dev/null || true
rsync -a "$DST/lexlean.lock" "$SRC/lexlean.lock"
for f in site/core.wasm site/index.html site/app.webmanifest site/manifest.json site/sw.js; do [ -f "$DST/$f" ] && cp "$DST/$f" "$SRC/$f"; done
rsync -a "$DST/site/v1/" "$SRC/site/v1/" 2>/dev/null || true
echo "native lane done; artifacts copied back"

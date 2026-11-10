#!/bin/bash
# The lane from a Windows checkout: LexLean refuses to publish its attestation directory on the WSL
# mount of a Windows drive (EACCES on the rename), so the tree is mirrored to a Linux native copy,
# the lane runs there, and the artifacts it writes come back. CI runs scripts/lane.sh directly.
#   ./scripts/lane-wsl.sh            # compare mode, like CI
#   LANE_WRITE=1 ./scripts/lane-wsl.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COPY="${FORGE_LANE_COPY:-$HOME/hologram-forge-lane}"
mkdir -p "$COPY"
# A renderer build running beside the lane leaves files that vanish mid copy (rsync code 24); harmless.
rsync -a --delete --exclude .git --exclude node_modules --exclude core/target --exclude shell/app --exclude shell/assets --exclude shell/scaffold --exclude shell/warmup.json --exclude .lexlean --exclude .prism --exclude '*.timestamp-*' "$ROOT/" "$COPY/" || [ "$?" = 24 ]
cd "$COPY"
git init -q 2>/dev/null || true
git add -A >/dev/null 2>&1 && git -c user.email=lane@local -c user.name=lane commit -q -m mirror --allow-empty >/dev/null 2>&1 || true
FORGE_LANE_WORK="${FORGE_LANE_WORK:-$HOME/.cache/hologram-forge-lane}" ./scripts/lane.sh
# What the lane writes, back to the checkout (compare mode writes only shell/core.wasm and the projection).
rsync -a "$COPY/generated/" "$ROOT/generated/"
rsync -a "$COPY/tools/axioms.json" "$ROOT/tools/axioms.json"
rsync -a "$COPY/lexlean.lock" "$ROOT/lexlean.lock"
rsync -a "$COPY/src/" "$ROOT/src/"
rsync -a "$COPY/model/roots.txt" "$ROOT/model/roots.txt"
for f in core.wasm index.html holo.html app.webmanifest manifest.json provenance.json sw.js v1/openapi.json; do
  [ -f "$COPY/shell/$f" ] && mkdir -p "$(dirname "$ROOT/shell/$f")" && cp "$COPY/shell/$f" "$ROOT/shell/$f"
done
echo "lane (linux copy): done; artifacts synced to $ROOT"

"""Independent post-assembly audit for Hologram Forge releases."""
import hashlib
import json
from pathlib import Path

shell = Path(__file__).resolve().parent.parent / "shell"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")

def load(name):
    return json.loads((shell / name).read_text(encoding="utf-8"))

def fail(message):
    raise SystemExit("RELEASE GATE: DEFER — " + message)

manifest = load("manifest.json")
delivery = load("delivery.json")
provenance = load("provenance.json")

formal = manifest["closure"]
extra = delivery["delivery_sha256"]

if delivery.get("schema") != "hologram-forge/delivery/1":
    fail("unexpected delivery schema")

if digest(canonical(manifest["files"])) != formal:
    fail("formal closure mismatch")

if digest(canonical(delivery["files"])) != extra:
    fail("delivery closure mismatch")

if delivery["shell_closure"] != formal:
    fail("delivery references incorrect formal closure")

if provenance.get("browser_projection_sha256") != formal:
    fail("provenance references incorrect formal closure")

rows = manifest["files"] + delivery["files"]
seen = set()

for row in rows:
    name = row["path"]
    parts = Path(name).parts

    if (
        not name
        or name.startswith("/")
        or "\\" in name
        or "?" in name
        or "#" in name
        or any(part in (".", "..") for part in parts)
        or name in seen
    ):
        fail("unsafe or duplicate path: " + name)

    seen.add(name)

    path = shell / name

    if not path.is_file():
        fail("missing file: " + name)

    data = path.read_bytes()

    if len(data) != row["bytes"]:
        fail("incorrect file length: " + name)

    if digest(data) != row["sha256"]:
        fail("file integrity mismatch: " + name)

worker = (shell / "sw.js").read_text(encoding="utf-8")
template = (shell / "sw.template.js").read_text(encoding="utf-8")

expected_worker = (
    template
    .replace("__CLOSURE__", formal)
    .replace("__DELIVERY__", extra)
)

if worker != expected_worker:
    fail("service worker differs from release identities")

if "__CLOSURE__" in worker or "__DELIVERY__" in worker:
    fail("unresolved worker placeholder")

if 'const CACHE_NAME = "shell-" + CLOSURE + "-" + DELIVERY;' not in worker:
    fail("combined release cache identity missing")

for required in (
    "assets/index.js",
    "assets/index.css",
    "scaffold/files.json",
    "404.html",
    "core.wasm",
    "index.html",
):
    if required not in seen:
        fail("required release resource absent: " + required)

bundle = (shell / "assets/index.js").read_text(encoding="utf-8")

for forbidden in (
    "us.i.posthog.com",
    "us-assets.i.posthog.com",
    "phc_5Vxx0XT8Ug3eWROhP6mm4D6D2DgIIKT232q4AKxC2ab",
):
    if forbidden in bundle:
        fail("forbidden telemetry reference: " + forbidden)

print("=== UOR FOUNDRY RELEASE AUDIT ===")
print("Formal closure:", formal)
print("Delivery closure:", extra)
print("Verified content files:", len(rows))
print("File hashes: PASS")
print("Provenance closure linkage: PASS")
print("Worker identity: PASS")
print("Known telemetry references: ABSENT")
print("RELEASE ASSEMBLY AUDIT: PASS")
print("Production authorization: DEFER")

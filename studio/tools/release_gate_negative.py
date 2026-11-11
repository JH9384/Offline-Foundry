"""Negative regression tests for Hologram Forge release assembly."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile

studio = Path(__file__).resolve().parent.parent
source = studio / "shell"
checker = studio / "tools" / "release_gate.py"

def check(label, mutation, expected):
    with tempfile.TemporaryDirectory(prefix="uor-release-gate-") as tmp:
        workspace = Path(tmp)
        shell = workspace / "shell"
        tools = workspace / "tools"
        tools.mkdir()

        shutil.copytree(source, shell)
        shutil.copy2(checker, tools / "release_gate.py")

        if mutation is not None:
            mutation(shell)

        result = subprocess.run(
            [sys.executable, str(tools / "release_gate.py")],
            capture_output=True,
            text=True,
            check=False,
        )

        output = result.stdout + result.stderr

        if mutation is None:
            passed = (
                result.returncode == 0
                and "RELEASE ASSEMBLY AUDIT: PASS" in output
            )
        else:
            passed = (
                result.returncode != 0
                and expected in output
            )

        print(f"{label}: {'PASS' if passed else 'FAIL'}")

        if not passed:
            print(output)
            raise SystemExit(f"DEFER: {label}")

def corrupt(shell):
    path = shell / "assets/index.js"
    data = bytearray(path.read_bytes())

    if not data:
        raise RuntimeError("Renderer asset is empty")

    # Change exactly one byte while preserving the file length.
    data[0] ^= 1
    path.write_bytes(data)

def remove(shell):
    (shell / "assets/index.js").unlink()

def alter_provenance(shell):
    path = shell / "provenance.json"
    record = json.loads(path.read_text())
    record["browser_projection_sha256"] = "0" * 64
    path.write_text(json.dumps(record, indent=2) + "\n")

print("=== UOR RELEASE GATE REGRESSION ===")

check(
    "Valid release admitted",
    None,
    "RELEASE ASSEMBLY AUDIT: PASS",
)
check(
    "Modified renderer rejected",
    corrupt,
    "file integrity mismatch: assets/index.js",
)
check(
    "Missing renderer rejected",
    remove,
    "missing file: assets/index.js",
)
check(
    "Provenance mismatch rejected",
    alter_provenance,
    "provenance references incorrect formal closure",
)

print("RELEASE GATE REGRESSION: 4/4 PASS")
print("Production authorization: DEFER")

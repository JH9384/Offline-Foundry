#!/usr/bin/env python3
"""Verify and install a GitHub-produced offline shell without touching source or browser storage.

Usage (from any directory):
  python3 studio/tools/install_verified_shell.py /path/to/offline-foundry-shell.tar.gz

The paired archive SHA-256 file must be present at <archive>.sha256.
A new shell is installed only after an independent staged release-gate PASS.
All extracted members must be files or directories inside shell/.
No git operations, browser database deletion, publishing or runtime downloads.
"""
import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
SHELL = ROOT / "shell"
GATE = ROOT / "tools" / "release_gate.py"


def require(condition, message):
    if not condition:
        raise RuntimeError("BLOCKED: " + message)


def checksum(archive):
    paired = Path(str(archive) + ".sha256")
    require(archive.is_file() and paired.is_file(), "archive or paired checksum missing")
    line = paired.read_text(encoding="utf-8").strip().splitlines()
    require(len(line) == 1, "checksum must contain exactly one line")
    fields = line[0].split()
    require(len(fields) == 2 and len(fields[0]) == 64 and
            all(c in "0123456789abcdef" for c in fields[0]) and
            fields[1].lstrip("*").split("/")[-1] == archive.name,
            "checksum format or archive filename mismatch")
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    require(actual == fields[0], "archive SHA-256 does not match")
    print("Archive SHA-256: PASS")


def safe_extract(archive, destination):
    with tarfile.open(archive, "r:gz") as package:
        members = package.getmembers()
        require(bool(members), "empty archive")
        names = set()
        for member in members:
            part = PurePosixPath(member.name)
            # Reject nonportable paths, links, device nodes and duplicates.
            require(not part.is_absolute() and not any(p in ("..", ".") for p in part.parts)
                    and len(part.parts) >= 1 and part.parts[0] == "shell"
                    and (member.isfile() or member.isdir())
                    and member.name not in names,
                    "invalid shell archive member " + member.name)
            names.add(member.name)
        package.extractall(destination, filter="data")
    require((destination / "shell" / "manifest.json").is_file(),
            "extracted shell has no formal manifest")


def audit(shell_root):
    tmp_tools = shell_root / "tools"
    tmp_tools.mkdir(exist_ok=True)
    shutil.copy2(GATE, tmp_tools / "release_gate.py")
    run = subprocess.run([sys.executable, str(tmp_tools / "release_gate.py")],
                         text=True, capture_output=True)
    print(run.stdout, end="")
    if run.returncode != 0:
        print(run.stderr, end="", file=sys.stderr)
        raise RuntimeError("BLOCKED: release integrity audit failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="GitHub verified shell .tar.gz")
    parser.add_argument("--install", action="store_true",
                        help="Swap shell only after checksum + staged audit PASS")
    args = parser.parse_args()
    archive = args.archive.expanduser().resolve(strict=True)
    checksum(archive)
    backup_base = Path.home()
    with tempfile.TemporaryDirectory(prefix="offline-foundry-stage-",
                                     dir=backup_base) as work:
        stage = Path(work)
        safe_extract(archive, stage)
        audit(stage)
        print("Staged release audit: PASS")
        if not args.install:
            print("DRY RUN: no current shell changes. Re-run with --install to activate.")
            return
        require(SHELL.is_dir() and not SHELL.is_symlink(),
                "existing shell path must be a real directory")
        require((SHELL / "manifest.json").is_file(),
                "existing shell manifest missing")
        backup = Path(tempfile.mkdtemp(prefix="offline-foundry-preinstall-",
                                      dir=backup_base))
        old = backup / "previous-shell"
        print("Backing up existing shell:", old)
        # Directory moves must remain on the same volume. Using the local
        # project parent for the atomic rename avoids cross-device failures.
        # The independently copied backup remains outside the repo.
        shutil.copytree(SHELL, old, symlinks=True)
        require((old / "manifest.json").is_file(), "backup validation failed")
        incoming = ROOT / ("shell.verified-incoming-" + str(os.getpid()))
        require(not incoming.exists(), "incoming path already exists")
        shutil.copytree(stage / "shell", incoming)
        # Re-audit the copied tree before replacing the current one.
        with tempfile.TemporaryDirectory(prefix="foundry-audit-",dir=backup_base) as verify:
            candidate = Path(verify)
            shutil.copytree(incoming, candidate / "shell")
            audit(candidate)
        old_active = ROOT / ("shell.previous-" + str(os.getpid()))
        require(not old_active.exists(), "previous path already exists")
        try:
            SHELL.rename(old_active)
            try:
                incoming.rename(SHELL)
                # Audit the installed files, not just the staged copy.
                with tempfile.TemporaryDirectory(prefix="foundry-post-audit-",dir=backup_base) as verify:
                    candidate = Path(verify)
                    shutil.copytree(SHELL, candidate / "shell")
                    audit(candidate)
            except Exception:
                if SHELL.exists():
                    failed = ROOT / ("shell.failed-" + str(os.getpid()))
                    SHELL.rename(failed)
                    print("Failed shell retained at", failed, file=sys.stderr)
                old_active.rename(SHELL)
                raise
        finally:
            if incoming.exists():
                print("Uninstalled candidate retained at", incoming, file=sys.stderr)
        # Avoid deleting the previous live directory automatically.
        print("INSTALLED: PASS")
        print("Backup:", old)
        print("Previous live directory:", old_active)
        print("Production authorization: DEFER")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, tarfile.TarError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

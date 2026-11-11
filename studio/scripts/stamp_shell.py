"""Place the renderer's built output beside the shell, and stage the scaffold beside it.

The homepage is shell/index.html, projected by the core from the verified View; it references the
renderer's assets by fixed names (vendor/dyad/vite.shell.config.mts, ours). This script copies the Vite output
under shell/assets/, writes shell/404.html as a copy of the homepage so Pages answers a refresh on any
of the renderer's routes with the app (the router reads the URL), and stages the renderer's scaffold with a file list,
which the host creates apps from. Run after the Vite build: python3 scripts/stamp_shell.py
"""
import json, os, pathlib, re, shutil

root = pathlib.Path(__file__).resolve().parent.parent
dist = root / "vendor" / "dyad" / "dist" / "assets"
assets = root / "shell" / "assets"
if not dist.is_dir():
    raise SystemExit(f"{dist} is missing: run the Vite build first (see vendor/dyad/vite.shell.config.mts)")
if assets.exists():
    shutil.rmtree(assets)
shutil.copytree(dist, assets)
for stale in ("app",):
    if (root / "shell" / stale).exists():
        shutil.rmtree(root / "shell" / stale)
index = (root / "shell" / "index.html").read_text(encoding="utf-8")
(root / "shell" / "404.html").write_text(index, encoding="utf-8", newline="\n")
print(f"placed {sum(1 for p in assets.rglob('*') if p.is_file())} renderer files under shell/assets and wrote shell/404.html")

src = root / "vendor" / "dyad" / "scaffold"
dst = root / "shell" / "scaffold"
if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src / "src", dst / "src")
for name in ("package.json", "tailwind.config.ts", "index.html", "AI_RULES.md"):
    if (src / name).exists():
        shutil.copy(src / name, dst / name)
# The product is Hologram: the staged scaffold's words say so (the badge, the link); the vendored tree is untouched.
WORD = re.compile(r"\bDyad\b")
for p in dst.rglob("*"):
    if p.is_file() and p.suffix in (".tsx", ".ts", ".md", ".html", ".json"):
        text = p.read_text(encoding="utf-8")
        new = WORD.sub("Hologram", text).replace("https://www.dyad.sh/", "https://gethologram.ai/")
        if new != text:
            p.write_text(new, encoding="utf-8", newline="\n")
app = dst / "src" / "App.tsx"
app.write_text(app.read_text(encoding="utf-8").replace("<BrowserRouter>", "<BrowserRouter basename={import.meta.env.BASE_URL}>", 1), encoding="utf-8", newline="\n")
# Offline-first starter is the default runnable project. Keep the complete
# upstream scaffold sources for users who deliberately enable more packages.
# The extended entrypoint is preserved, never silently discarded.
main = dst / "src" / "main.tsx"
(dst / "src" / "main.extended.tsx").write_text(
    main.read_text(encoding="utf-8"), encoding="utf-8", newline="\n"
)
main.write_text(
    'import { createRoot } from "react-dom/client";\n'
    'import OfflineStarter from "./OfflineStarter";\n'
    'import "./offline-starter.css";\n'
    'createRoot(document.getElementById("root")!).render(<OfflineStarter />);\n',
    encoding="utf-8", newline="\n"
)
(dst / "src" / "OfflineStarter.tsx").write_text(
    '''import { useState } from "react";

export default function OfflineStarter() {
  const [note, setNote] = useState("Your project is ready to edit.");
  return (
    <main className="offline-starter">
      <div className="offline-panel">
        <span className="offline-tag">LOCAL-FIRST / OFFLINE</span>
        <h1>Offline-Foundry Starter</h1>
        <p>This project builds and previews without external package servers.</p>
        <label htmlFor="offline-note">Try changing this note, or edit src/OfflineStarter.tsx</label>
        <input id="offline-note" value={note} onChange={event => setNote(event.target.value)} />
        <p data-testid="offline-note-preview">{note}</p>
        <small>Project files are stored in this browser. Export backups before clearing site data.</small>
      </div>
    </main>
  );
}
''',
    encoding="utf-8", newline="\n"
)
(dst / "src" / "offline-starter.css").write_text(
    ''':root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: #f1f5f9; color: #17223b; }
.offline-starter { min-height: 100vh; display: grid; place-items: center; padding: 2rem; }
.offline-panel { width: min(100%, 660px); background: white; border: 1px solid #dbe3ef;
  border-radius: 18px; padding: 2.5rem; box-shadow: 0 16px 60px #17223b15; }
.offline-tag { font-size: .75rem; font-weight: 700; letter-spacing: .14em; color: #2361a7; }
h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.15; margin: 1rem 0; }
p { line-height: 1.6; }
label { display: block; margin-top: 2rem; font-weight: 600; }
input { width: 100%; margin: .75rem 0; padding: .85rem 1rem;
  border: 1px solid #9aaec7; border-radius: 8px; font: inherit; }
small { display: block; color: #52617a; margin-top: 2rem; }
''',
    encoding="utf-8", newline="\n"
)
print("Staged runnable local-first React starter; preserved original entrypoint")

files = sorted(str(p.relative_to(dst)).replace("\\", "/") for p in (dst / "src").rglob("*") if p.is_file())
(dst / "files.json").write_text(json.dumps(files), encoding="utf-8", newline="\n")
print(f"staged {len(files)} scaffold files")



# Locally packaged browser runtimes. The pinned compiler is supplied
# explicitly by the build environment; no runtime CDN is permitted.
runtime = root / "shell" / "runtime"
monaco = root / "vendor" / "dyad" / "node_modules" / "monaco-editor"
compiler = pathlib.Path(os.environ.get(
    "FORGE_ESBUILD_WASM_DIR",
    str(root / "vendor" / "dyad" / "node_modules" / "esbuild-wasm")
))

required = [
    monaco / "min" / "vs" / "loader.js",
    monaco / "min" / "vs" / "editor" / "editor.main.js",
    monaco / "LICENSE",
    compiler / "esm" / "browser.min.js",
    compiler / "esbuild.wasm",
    compiler / "LICENSE.md",
]
for file in required:
    if not file.is_file():
        raise SystemExit(f"Missing runtime dependency: {file}")

if runtime.exists():
    shutil.rmtree(runtime)

shutil.copytree(monaco / "min" / "vs", runtime / "monaco" / "vs")
shutil.copy2(monaco / "LICENSE", runtime / "monaco" / "LICENSE")

(runtime / "compiler").mkdir(parents=True)
shutil.copy2(
    compiler / "esm" / "browser.min.js",
    runtime / "compiler" / "browser.min.js"
)
shutil.copy2(
    compiler / "esbuild.wasm",
    runtime / "compiler" / "esbuild.wasm"
)
shutil.copy2(
    compiler / "LICENSE.md",
    runtime / "compiler" / "LICENSE.md"
)

# Compile a self-contained React/ReactDOM JSX runtime for offline previews.
# Generated code remains inside the delivery's hashed asset inventory.
import subprocess
subprocess.run(
    ["node", str(root / "scripts" / "bundle_offline_react.mjs")],
    cwd=root, check=True,
)
if not (runtime / "packages" / "react-bundle.js").is_file():
    raise SystemExit("Missing bundled local React preview runtime")

print("Staged local Monaco and esbuild browser runtimes")

# The renderer is now part of an independently hashed delivery closure.
import hashlib, subprocess, sys

rows = []
for folder in ("assets", "scaffold", "runtime"):
    for path in sorted((root / "shell" / folder).rglob("*")):
        if path.is_file():
            data = path.read_bytes()
            rows.append({
                "path": path.relative_to(root / "shell").as_posix(),
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest()
            })

fallback = root / "shell" / "404.html"
data = fallback.read_bytes()
rows.append({
    "path": "404.html",
    "bytes": len(data),
    "sha256": hashlib.sha256(data).hexdigest()
})
rows.sort(key=lambda r: r["path"])

canonical = json.dumps(
    rows, sort_keys=True, separators=(",", ":"), ensure_ascii=False
).encode()

digest = hashlib.sha256(canonical).hexdigest()
manifest = json.loads((root / "shell" / "manifest.json").read_text())
record = {
    "schema": "hologram-forge/delivery/1",
    "shell_closure": manifest["closure"],
    "delivery_sha256": digest,
    "files": rows,
}
(root / "shell" / "delivery.json").write_text(
    json.dumps(record, indent=2) + "\n", encoding="utf-8"
)

worker = (root / "shell" / "sw.template.js").read_text()
worker = worker.replace("__CLOSURE__", manifest["closure"])
worker = worker.replace("__DELIVERY__", digest)
(root / "shell" / "sw.js").write_text(worker, encoding="utf-8")

print(f"delivery closure: {digest}")

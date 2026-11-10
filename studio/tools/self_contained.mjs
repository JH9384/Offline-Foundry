// The self-contained gate: Forge lives in UOR-Foundation/forge, whole. No file in this repository, and no
// file the Pages build serves, names the account Forge moved from or the path it was served under there.
// Git history keeps its authors; the files and the site do not point back.
//
//   node studio/tools/self_contained.mjs [served-dir...]    every tracked file, then every file under each dir
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORBIDDEN = [/humuhumu33/i, /\/hologram-forge\//];
const bad = [];
const scan = (label, text) => { for (const re of FORBIDDEN) { const m = re.exec(text); if (m) { const line = text.slice(0, m.index).split("\n").length; bad.push(`${label}:${line}: ${m[0]}`); } } };

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean);
for (const file of tracked) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size > 64 << 20) continue;
  scan(file, fs.readFileSync(full, "latin1"));
}
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const dir of process.argv.slice(2)) for (const file of walk(dir)) scan(path.relative(root, file), fs.readFileSync(file, "latin1"));

if (bad.length) { console.error("self-contained gate refused:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`self-contained: ${tracked.length} tracked files${process.argv.length > 2 ? " and the served site" : ""} name nothing outside UOR-Foundation/forge's own`);

// The Prism journey, vendored into the shell.
//
// Every app that decides something carries a prism/spec/1 spec; the shell checks it, renders its
// LexLean model and asks Lean to prove it, with prism-code's own code, so a spec means here what it
// means to `npx prism-code` and to the prism MCP server. These files are prism-code's, byte for
// byte, at the version below:
//
//   shell/prism/spec.mjs                               src/journey/spec.mjs   (the checker)
//   shell/prism/render.mjs                             src/journey/render.mjs (the model renderer)
//   shell/prism/lex/Foundation/Bytes.lex.tex           templates/text-request/src/Foundation/Bytes.lex.tex
//   shell/prism/lex/Foundation/View/Text/V1/Model.lex.tex  templates/text-request/src/Foundation/View/Text/V1/Model.lex.tex
//
//   node tools/prism_journey.mjs            copy them from the package
//   node tools/prism_journey.mjs --check    the Journey gate: refuse any byte that differs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRISM_CODE = "0.7.2";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  ["src/journey/spec.mjs", "shell/prism/spec.mjs"],
  ["src/journey/render.mjs", "shell/prism/render.mjs"],
  ["templates/text-request/src/Foundation/Bytes.lex.tex", "shell/prism/lex/Foundation/Bytes.lex.tex"],
  ["templates/text-request/src/Foundation/View/Text/V1/Model.lex.tex", "shell/prism/lex/Foundation/View/Text/V1/Model.lex.tex"],
];

const prefix = path.join(os.tmpdir(), "hologram-forge-prism-code-" + PRISM_CODE);
const pkg = path.join(prefix, "node_modules", "prism-code");
if (!fs.existsSync(path.join(pkg, "package.json"))) {
  execFileSync("npm", ["install", "--no-save", "--no-audit", "--no-fund", "--prefix", prefix, "prism-code@" + PRISM_CODE], { stdio: "inherit", shell: process.platform === "win32" });
}
const version = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).version;
if (version !== PRISM_CODE) throw new Error(`prism-code ${version} installed, ${PRISM_CODE} pinned`);
// Text is compared with one line ending, so a Windows checkout and the Linux lane agree.
const text = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const bad = [];
for (const [from, to] of FILES) {
  const upstream = text(path.join(pkg, from));
  const target = path.join(root, to);
  if (process.argv[2] === "--check") {
    if (!fs.existsSync(target) || text(target) !== upstream) bad.push(to);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, upstream);
  }
}
if (bad.length) { console.error(`journey gate refused: ${bad.join(", ")} differ from prism-code ${PRISM_CODE}; run node tools/prism_journey.mjs`); process.exit(1); }
console.log(`journey: ${FILES.length} files are prism-code ${PRISM_CODE}'s${process.argv[2] === "--check" ? ", byte for byte" : ""}`);

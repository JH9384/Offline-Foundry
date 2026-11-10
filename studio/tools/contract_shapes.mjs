// Every channel the renderer calls, with the shape its contract declares, and what the host
// answers. The renderer types its calls but validates no answer at runtime, so a handler that returns
// an object where the contract says array crashes a screen ("is not iterable") only when a user opens
// it. This reads the vendored contracts and the host side by side and refuses on a mismatch.
//
//   node tools/contract_shapes.mjs          # the table
//   node tools/contract_shapes.mjs --check  # exit 1 on any array or object mismatch
//
// The contracts are TypeScript with zod, so they are bundled through esbuild (a dependency of the
// vendored renderer) into one module and read with zod's own introspection.
import { build } from "../vendor/dyad/node_modules/esbuild/lib/main.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typesDir = path.join(root, "vendor/dyad/src/ipc/types");
const entry = path.join(root, "vendor/dyad/node_modules/.cache-contract-shapes.mjs");
const modules = fs.readdirSync(typesDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.includes(".test."));
fs.writeFileSync(entry, modules.map((f, i) => `export * as m${i} from ${JSON.stringify(path.join(typesDir, f))};`).join("\n"));

const bundled = path.join(root, "vendor/dyad/node_modules/.cache-contract-shapes.bundle.mjs");
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundled,
  logLevel: "silent",
  alias: { "@": path.join(root, "vendor/dyad/src") },
  loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
});
const all = await import("file://" + bundled.replace(/\\/g, "/"));

// zod 4 names the kind in `_def.type`, unwrapped through the wrappers an output may use.
function shapeOf(schema, depth = 0) {
  const def = schema?._def;
  if (!def || depth > 8) return "unknown";
  const kind = def.type ?? String(def.typeName ?? "").replace(/^Zod/, "").toLowerCase();
  if (kind === "array" || kind === "object") return kind;
  if (kind === "nullable" || kind === "optional" || kind === "default" || kind === "readonly" || kind === "catch") return shapeOf(def.innerType, depth + 1);
  if (kind === "pipe") return shapeOf(def.out ?? def.in, depth + 1);
  if (kind === "union") {
    const kinds = new Set((def.options ?? []).map((o) => shapeOf(o, depth + 1)));
    kinds.delete("null");
    return kinds.size === 1 ? [...kinds][0] : "union";
  }
  if (kind === "lazy") return shapeOf(def.getter?.(), depth + 1);
  return kind || "unknown";
}

const contracts = new Map();
const schemas = new Map();
const methods = new Map();   // the client method a screen calls -> its channel
for (const ns of Object.values(all)) {
  for (const group of Object.values(ns ?? {})) {
    if (!group || typeof group !== "object") continue;
    for (const [method, contract] of Object.entries(group)) {
      if (contract && typeof contract === "object" && typeof contract.channel === "string" && contract.output?._def) {
        contracts.set(contract.channel, shapeOf(contract.output));
        schemas.set(contract.channel, contract.output);
        methods.set(method, contract.channel);
      }
    }
  }
}

// Which channels a screen READS: the generated clients are called from react-query query functions,
// which run when the screen mounts and whose result the screen renders. Those are the calls that can
// crash a screen, so those are the ones the host must answer. A channel called from a mutation runs on
// a click and its failure is a toast, so a plain refusal there is honest and safe.
const read = new Set();
const srcDir = path.join(root, "vendor/dyad/src");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const file of walk(srcDir)) {
  if (!/\.(ts|tsx)$/.test(file) || /\.test\./.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/queryFn\s*:/g)) {
    const window = text.slice(m.index, m.index + 300);
    for (const call of window.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      const channel = methods.get(call[1]);
      if (channel) read.add(channel);
    }
  }
}

// What the host answers. Only a literal answer is classified: `=> ({ ... })` is an object, `=> [...]`
// an array. A block body (`=> { ... }`) is code, never guessed at, because the runtime check in
// `shell/host.js` parses those answers against the same contracts with real data.
const host = fs.readFileSync(path.join(root, "shell/host.js"), "utf8");
const answers = new Map();
// The body is read from the text after the match, not captured by it: a capture of "the next 120
// characters" consumes them, so a handler written within 120 characters of the one before it -- most
// of the one-line handlers here -- was skipped by the scan and never checked at all.
for (const m of host.matchAll(/handlers\.set\("([^"]+)",[ \t]*/g)) {
  const channel = m[1];
  const body = host.slice(m.index + m[0].length, m.index + m[0].length + 160);
  const arrow = body.match(/^(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([\s\S]*)$/);
  const tail = (arrow ? arrow[1] : "").trimStart();
  let shape = "code";
  if (/^\[/.test(tail)) shape = "array";
  else if (/^\(\s*\{/.test(tail)) shape = "object";
  else if (/^(null|undefined)/.test(tail)) shape = "null";
  else if (/^(true|false)/.test(tail)) shape = "boolean";
  else if (/^["'`]/.test(tail)) shape = "string";
  else if (/^\d/.test(tail)) shape = "number";
  answers.set(channel, shape);
}

const rows = [...answers.keys()].sort().map((channel) => ({ channel, declared: contracts.get(channel) ?? "not in a contract", answered: answers.get(channel) }));
const clash = rows.filter((r) => (r.declared === "array" && ["object", "null", "string", "number", "boolean"].includes(r.answered)) || (r.declared === "object" && r.answered === "array"));
const width = Math.max(...rows.map((r) => r.channel.length));
for (const r of rows) {
  const mark = clash.includes(r) ? "  <-- MISMATCH" : "";
  if (!process.argv.includes("--check") || mark) console.log(`${r.channel.padEnd(width)}  declared ${String(r.declared).padEnd(16)} answered ${r.answered}${mark}`);
}
console.log(`\n${rows.length} channels answered by the host, ${contracts.size} channels under contract, ${clash.length} mismatch(es)`);

// Most of the renderer's channels belong to features this product does not have -- Supabase, Vercel, Neon,
// Coolify, GitHub, MCP, a terminal, native windows -- and the host implements none of them. A channel
// a screen reads on mount must still answer something that screen can use, or it dies the moment a
// user opens it, which is the same defect class as a wrong shape. `shell/host.js` answers an
// unimplemented channel with the empty value the channel's own contract accepts (no servers, no tests,
// no cloud projects -- all true here), so what this checks is that every channel a screen reads either
// has a handler or admits such a value. The only way to close a hole is a real handler.
const EMPTY = [undefined, [], null, {}];
const NAME = ["undefined (void)", "[] (empty list)", "null", "{} (empty object)"];
const emptyFor = (schema) => {
  for (let i = 0; i < EMPTY.length; i += 1) {
    let parsed = null;
    try { parsed = schema.safeParse(EMPTY[i]); } catch { parsed = null; }
    if (parsed && parsed.success) return i;
  }
  return -1;
};
const holes = [];
const cover = [0, 0, 0, 0];
let unanswered = 0;
for (const [channel, schema] of schemas) {
  if (answers.has(channel)) continue;
  unanswered += 1;
  const which = emptyFor(schema);
  if (which >= 0) cover[which] += 1;
  else if (read.has(channel)) holes.push(channel);
}
console.log(`\n${read.size} channels are read by a screen on mount; of the ${unanswered} contracted channels with no handler, an empty answer satisfies ${cover.reduce((a, b) => a + b, 0)}:`);
for (let i = 0; i < NAME.length; i += 1) if (cover[i]) console.log(`  ${String(cover[i]).padStart(4)}  ${NAME[i]}`);
if (holes.length) {
  console.log(`\n${holes.length} channel(s) a screen reads have no handler and no empty answer their contract accepts -- that screen crashes:`);
  for (const channel of holes.sort()) console.log("  " + channel + "  declared " + contracts.get(channel));
} else {
  console.log("\nevery channel a screen reads is answerable: a handler, or the empty value its contract accepts");
}
fs.rmSync(entry, { force: true });
fs.rmSync(bundled, { force: true });
if ((clash.length || holes.length) && process.argv.includes("--check")) process.exit(1);

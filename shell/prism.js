// Proved rules for the apps Forge builds. An app that decides something (a tier, an eligibility, a
// grade) carries a Prism spec, prism/spec/1, beside its code. This module does what prism-code does
// with it, in the tab: checks it (prism/spec.mjs, prism-code's checker), renders its LexLean model
// (prism/render.mjs, prism-code's renderer), and asks Lean to prove every guarantee on the hosted
// verifier, the same call `prism_prove` makes. It also writes the app's rule module,
// src/lib/prism.ts: the spec as data and one small interpreter, replayed against every acceptance
// vector before it is written. What Lean proves is the rules; the module is tested against them.
import { SpecError, validateSpec, unreachableRules, counterexample, describeConditions, requestLimits } from "./prism/spec.mjs";
import { names, renderModel, renderProofs, acceptanceVectors } from "./prism/render.mjs";

// prism/render.mjs names bytes in hex through Node's Buffer; this is the one use it makes of it.
if (!globalThis.Buffer) globalThis.Buffer = { from: (bytes) => ({ toString: (encoding) => { if (encoding !== "hex") throw new Error("only hex"); return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); } }) };

const enc = new TextEncoder();
const HOSTED = "https://mcp.uor.foundation/";
const PROTOCOL = "2026-07-28";
const PROFILE = "prism-app";

// ---- what the model is told
export const SPEC_RULES = `# Proved rules
When the app decides an answer from a few inputs (a price tier, an eligibility, a grade, a risk level), state its rules as a Prism spec, so Lean can prove them, and make the screen use them.
- Before the files, write one <dyad-spec> block of JSON: name (kebab-case), title, purpose (one sentence), fields (1 to 8, each {"name","kind":"number"|"choice","min","max","values","means"}), outcomes (lower-case words), rules (in order, the first that matches decides; each {"when":[{"field","op","value"}],"then","why"}), otherwise, otherwiseWhy, properties (what must never or always happen; each {"kind":"never"|"always","when","then","why"}), examples ([{"request":"<field values separated by spaces>","response"}]), limits.
- op is "is" or "is not" for a choice field, and "<", "<=", ">", ">=", "=" or "!=" for a number field, against a whole number or {"field":"<other number field>"}. Numbers are whole and not negative.
- Forge writes src/lib/prism.ts from the spec. Import { decide, FIELDS, OUTCOMES } from "@/lib/prism" and show decide({ <field>: <value>, ... }) as the answer; it returns an outcome word, or "invalid". Never re-implement the rules in the screen, and never write src/lib/prism.ts or prism/spec.json yourself.
- To change the rules, write a whole new <dyad-spec> block. When the app decides nothing (a landing page, a gallery), write no spec.
Example: <dyad-spec>{"name":"parking-fee","title":"Parking fee tier","purpose":"Decide the fee tier from hours parked and vehicle type.","fields":[{"name":"hours","kind":"number","min":0,"max":24,"means":"hours parked"},{"name":"vehicle","kind":"choice","values":["car","motorcycle","truck"],"means":"vehicle type"}],"outcomes":["free","standard","premium"],"rules":[{"when":[{"field":"hours","op":"=","value":0}],"then":"free","why":"nothing was parked"},{"when":[{"field":"vehicle","op":"is","value":"truck"}],"then":"premium","why":"a truck takes two bays"}],"otherwise":"standard","otherwiseWhy":"a car or motorcycle pays the standard rate","properties":[{"kind":"never","when":[{"field":"hours","op":"=","value":0}],"then":"premium","why":"no one pays for zero hours"}],"examples":[{"request":"0 truck","response":"free"},{"request":"3 car","response":"standard"}]}</dyad-spec>`;

const TAG = /<dyad-spec>([\s\S]*?)<\/dyad-spec>/;
export function parseSpecTag(text) {
  const m = TAG.exec(text || "");
  if (!m) return null;
  let body = m[1].trim();
  const fence = body.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  if (fence) body = fence[1];
  try { return { spec: JSON.parse(body) }; } catch (e) { return { error: "The rules are not valid JSON: " + e.message }; }
}
// The card stands in its own paragraphs, whatever the model wrote around the tag.
export const withCard = (text, card) => (text || "").replace(TAG, card ? "\n\n" + card + "\n\n" : "");
export const isApproval = (prompt) => /^\s*\/?(yes,?\s*)?approve(d)?(\s+(the\s+)?(rules|guarantees|spec))?\s*[.!]?\s*$/i.test(prompt || "");

// ---- the app's rule module: these two functions are shipped verbatim (their source text) in
// src/lib/prism.ts, and replayed against every acceptance vector before they are.
function prismAnswer(spec, request) {
  const line = String(request);
  if (new TextEncoder().encode(line).length > Math.min(512, Math.max(64, 24 * spec.fields.length + 16))) return "invalid";
  const parts = line.split(" ");
  if (parts.length !== spec.fields.length) return "invalid";
  const values = {};
  for (let i = 0; i < spec.fields.length; i++) {
    const field = spec.fields[i], part = parts[i];
    if (field.kind === "choice") {
      if (!field.values.includes(part)) return "invalid";
      values[field.name] = part;
    } else {
      if (!/^(0|[1-9][0-9]*)$/.test(part) || part.length > 18) return "invalid";
      const n = BigInt(part);
      if (field.min !== undefined && n < BigInt(field.min)) return "invalid";
      if (field.max !== undefined && n > BigInt(field.max)) return "invalid";
      values[field.name] = n;
    }
  }
  const operand = (value) => (typeof value === "object" ? values[value.field] : BigInt(value));
  const holds = (c) => {
    const left = values[c.field];
    switch (c.op) {
      case "is": return left === c.value;
      case "is not": return left !== c.value;
      case "<": return left < operand(c.value);
      case "<=": return left <= operand(c.value);
      case ">": return left > operand(c.value);
      case ">=": return left >= operand(c.value);
      case "=": return left === operand(c.value);
      case "!=": return left !== operand(c.value);
      default: return false;
    }
  };
  for (const rule of spec.rules) if (rule.when.every(holds)) return rule.then;
  return spec.otherwise;
}
function prismDecide(spec, values) {
  return prismAnswer(spec, spec.fields.map((f) => String(values && values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : "")).join(" "));
}

function moduleSource(spec, vectors) {
  return `// Generated by Hologram Forge from prism/spec.json. Do not edit: change the rules in the chat.
// Lean proves the guarantees about these rules. This module answers with the same rules; Forge
// replayed all ${vectors} acceptance vectors through it before writing it.
export const SPEC = ${JSON.stringify(spec, null, 2)};
${prismAnswer.toString()}
${prismDecide.toString()}
export const FIELDS = SPEC.fields;
export const OUTCOMES = SPEC.outcomes;
/** The answer for one set of field values: an outcome word, or "invalid". */
export function decide(values) { return prismDecide(SPEC, values); }
/** The answer for one request line, the field values separated by spaces. */
export function answer(request) { return prismAnswer(SPEC, request); }
`;
}

// ---- the check: what prism_spec runs on a drafted spec, then the module against every vector
export function checkSpec(input) {
  const issues = [];
  let spec;
  try { spec = validateSpec(input); } catch (e) { if (e instanceof SpecError) return { ok: false, issues: [e.message] }; throw e; }
  const dead = unreachableRules(validateSpec({ ...spec, properties: [], examples: [] }));
  if (dead.length) issues.push(`No request reaches ${dead.join(", ")}: an earlier rule always decides first.`);
  for (const p of spec.properties) {
    const found = counterexample(spec, p);
    if (found.request !== null) issues.push(`${p.id} does not hold: \`${found.request}\` answers ${found.outcome}${found.rule ? ` by ${found.rule}` : " by otherwise"}.`);
  }
  const vectors = acceptanceVectors(spec);
  let failed = 0;
  for (const v of vectors) {
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(v.bytes); } catch { if (v.response !== "invalid") failed++; continue; }
    if (prismAnswer(spec, text) !== v.response) failed++;
  }
  if (failed) issues.push(`The rule module disagrees with ${failed} of ${vectors.length} acceptance vectors. This is a Forge bug.`);
  return { ok: issues.length === 0, spec, issues, vectors: vectors.length, module: issues.length ? null : moduleSource(spec, vectors.length) };
}

// ---- the proof: the LexLean project prism-code sends, proved on the hosted verifier
async function shellText(path) {
  const r = await fetch(new URL(path, import.meta.url));
  if (!r.ok) throw new Error(path + " answered " + r.status);
  return (await r.text()).replace(/\r\n/g, "\n");
}
export async function projectFiles(spec, axioms = {}) {
  const n = names(spec);
  const files = [
    { path: "src/Foundation/Bytes.lex.tex", content: await shellText("./prism/lex/Foundation/Bytes.lex.tex") },
    { path: "src/Foundation/View/Text/V1/Model.lex.tex", content: await shellText("./prism/lex/Foundation/View/Text/V1/Model.lex.tex") },
    { path: `src/${n.module}.lex.tex`, content: renderModel(spec, { axioms }) },
  ];
  const proofs = renderProofs(spec, { axioms });
  if (proofs) files.push({ path: `src/${n.proofs}.lex.tex`, content: proofs });
  return files;
}

let rpcId = 0;
const meta = (tasks) => ({
  "io.modelcontextprotocol/protocolVersion": PROTOCOL,
  "io.modelcontextprotocol/clientInfo": { name: "hologram-forge", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": tasks ? { extensions: { "io.modelcontextprotocol/tasks": {} } } : {},
});
function answerOf(text) {
  try { return JSON.parse(text); } catch {}
  let found = null;
  for (const line of text.split("\n")) if (line.startsWith("data:")) { const e = JSON.parse(line.slice(5)); if ("id" in e) found = e; }
  return found;
}
async function rpc(method, name, params) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL, "mcp-method": method };
  if (name) headers["mcp-name"] = name;
  const body = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params });
  for (let attempt = 0; ; attempt++) {
    let status = 0, text = "";
    try { const r = await fetch(HOSTED, { method: "POST", headers, body }); status = r.status; text = await r.text(); }
    catch (e) { if (attempt < 2) { await new Promise((r) => setTimeout(r, 10000)); continue; } throw new Error("the verifier did not answer"); }
    if ([502, 503, 504].includes(status) && attempt < 2) { await new Promise((r) => setTimeout(r, 10000)); continue; }
    const answer = answerOf(text);
    if (!answer) throw new Error(`the verifier answered ${method} with HTTP ${status} and no message`);
    if (answer.error) throw new Error(`the verifier refused ${method}: ${answer.error.message || JSON.stringify(answer.error)}`);
    return answer.result;
  }
}
const callTool = (tool, args, tasks = false) => rpc("tools/call", tool, { name: tool, arguments: args, _meta: meta(tasks) });

/** Ask Lean to prove the spec's guarantees. Resolves { ok, record, seconds } or { ok: false, error }. */
export async function prove(spec, { onWait = () => {} } = {}) {
  const t0 = Date.now();
  const axioms = {};
  for (let round = 1; round <= 6; round++) {
    const files = await projectFiles(spec, axioms);
    const entrypoints = files.map((f) => f.path);
    const written = await callTool("lexlean_draft_write", { profile: PROFILE, files });
    const draft = written && written.structuredContent && written.structuredContent.draft;
    if (!draft || written.isError) return { ok: false, error: "the verifier did not take the draft" };
    let task = await callTool("lexlean_verify", { project: draft, files: entrypoints }, true);
    if (!task || !task.taskId) return { ok: false, error: "the verifier did not start the proof" };
    const taskId = task.taskId;
    while (task.status === "working") {
      if (Date.now() - t0 > 15 * 60 * 1000) return { ok: false, error: "the proof did not end in 15 minutes" };
      await new Promise((r) => setTimeout(r, Math.max(1000, Math.min(task.pollIntervalMs || 5000, 10000))));
      task = await rpc("tasks/get", taskId, { taskId, _meta: meta(true) });
      onWait(Math.round((Date.now() - t0) / 1000));
    }
    if (task.status !== "completed") return { ok: false, error: `the proof ended ${task.status}` };
    const state = task.result && task.result.structuredContent && task.result.structuredContent.state;
    let body = null;
    try { body = JSON.parse((task.result.content && task.result.content[0] && task.result.content[0].text) || "null"); } catch {}
    if (state === "failed") {
      const diagnostics = (body && body.diagnostics) || [];
      // An axiom set the renderer guessed wrong: Lean names the set it observed, as prism-code corrects it.
      const fixes = diagnostics.map((d) => /`([^`]+)` violates its (?:exact|none) axiom policy: observed (\[[^\]]*\])/.exec(d.message || "")).filter(Boolean);
      if (fixes.length && fixes.length === diagnostics.length) { for (const m of fixes) axioms[m[1].split(".").pop()] = m[2]; continue; }
      return { ok: false, error: (diagnostics[0] && diagnostics[0].message) || "Lean refused the proof", diagnostics };
    }
    if (state !== "verified" || !body || !body.attestation_id) return { ok: false, error: "the verifier answered without an attestation" };
    const proved = new Set(body.modules || []);
    const modules = entrypoints.map((p) => p.replace(/^src\//, "").replace(/\.lex\.tex$/, "").split("/").join("."));
    const absent = modules.filter((m) => !proved.has(m));
    if (absent.length) return { ok: false, error: "the verifier did not verify " + absent.join(", ") };
    const seconds = Math.round((Date.now() - t0) / 1000);
    return { ok: true, seconds, record: { schema: "prism/hosted-verification/1", server: HOSTED, profile: PROFILE, draft, entrypoints, verified_at: new Date().toISOString(), attestation_id: body.attestation_id, semantic_id: body.semantic_id || null, source_id: body.source_id || null, modules: [...proved], properties: spec.properties.map((p) => p.id), seconds } };
  }
  return { ok: false, error: "the axiom sets did not settle" };
}

// ---- what the chat shows
const said = (p) => `It ${p.kind === "never" ? "never" : "always"} answers ${p.then} when ${describeConditions(p.when)}.`;
const PHASE_WORD = { drafting: "not checked", checked: "checked, not yet proved", proving: "Lean is proving", proved: "proved by Lean", published: "proved by Lean, published" };
export function card(state) {
  const spec = state.spec;
  if (!spec) return `**Rules** · not checked\n\n${state.issues.map((i) => "- " + i).join("\n")}\n\nAsk me to fix the rules.`;
  const lines = [`**Rules: ${spec.title}** · ${PHASE_WORD[state.phase] || state.phase}`, "", spec.purpose, ""];
  if (spec.properties.length) {
    lines.push(state.phase === "proved" || state.phase === "published" ? "Guarantees, proved by Lean for every request:" : "Guarantees Lean will prove for every request:");
    spec.properties.forEach((p, i) => lines.push(`${i + 1}. ${said(p)}${p.why ? ` *${p.why}*` : ""}`));
    lines.push("");
  } else lines.push("No guarantees are stated, so Lean has nothing to prove about these rules.", "");
  lines.push("Rules, the first that matches decides:");
  for (const r of spec.rules) lines.push(`- When ${describeConditions(r.when)}: **${r.then}**${r.why ? ` *${r.why}*` : ""}`);
  lines.push(`- Otherwise: **${spec.otherwise}**${spec.otherwiseWhy ? ` *${spec.otherwiseWhy}*` : ""}`, "");
  lines.push(`Request: \`${spec.fields.map((f) => f.name).join(" ")}\` · answers: ${spec.outcomes.join(", ")}, or invalid`);
  if (spec.examples.length) lines.push("", `Examples: ${spec.examples.map((e) => `\`${e.request}\` → ${e.response}`).join(" · ")}`);
  if (state.issues && state.issues.length) lines.push("", "Not checked:", ...state.issues.map((i) => "- " + i), "", "Ask me to fix the rules.");
  else if (state.phase === "checked") lines.push("", `Checked: consistent, ${spec.examples.length} examples pass, ${state.vectors} acceptance vectors replayed through the app's rule module.`, "", "Reply **approve** to have Lean prove the guarantees. The rules go to the hosted verifier, unlisted.");
  return lines.join("\n");
}
export function provingMessage(spec) {
  return `Proving ${spec.properties.length} guarantee${spec.properties.length === 1 ? "" : "s"} with Lean on the hosted verifier, usually two to four minutes. The preview keeps working meanwhile.`;
}
export function proofMessage(spec, result) {
  if (result.ok) return `**Proved by Lean.** ${spec.properties.length} of ${spec.properties.length} guarantee${spec.properties.length === 1 ? "" : "s"} hold for every request, in ${result.seconds} s. Attestation \`${result.record.attestation_id.slice(0, 16)}…\`. Publishing now carries the rules and this proof.`;
  return `**Not proved.** ${result.error}. The rules are back to checked: ask me to change them, or reply **approve** to try again.`;
}
export { requestLimits };

// The live frame: one fixed page that draws any Prism app from its projection. It is served once, at
// the address of its own bytes, in the same CSP sandbox as every preview, with no network at all; the
// spec arrives by postMessage from the page that framed it. So a change to the spec never rebuilds,
// never reloads: the frame redraws the nodes whose kappa changed and leaves every other node, every
// typed value and the scroll position exactly where they were.
//
// The answer comes from the interpreter Forge ships in every app's rule module (prismAnswer and
// prismDecide, inlined before this script from shell/prism.js), never from a second copy of the rules.
/* global prismAnswer, prismDecide */
(function () {
  "use strict";
  const list = document.getElementById("app");
  const pill = document.getElementById("trust");
  const empty = document.getElementById("empty");
  const TRUST = { draft: "Draft", drafting: "Draft", checked: "Checked", proving: "Lean is proving", proved: "Proved by Lean", published: "Proved by Lean · published" };
  let app = "", logic = null, lastRoot = null;
  let nodes = new Map(); // key -> { kappa, el }
  const values = {};

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const fieldsOf = () => (logic && Array.isArray(logic.fields) ? logic.fields : []);
  const line = () => fieldsOf().map((f) => String(values[f.name])).join(" ");
  const ready = () => !!(logic && logic.otherwise && fieldsOf().length);
  const specOf = () => ({ fields: logic.fields, rules: logic.rules, otherwise: logic.otherwise });

  function defaults() {
    for (const f of fieldsOf()) {
      const v = values[f.name];
      if (f.kind === "choice") { if (!f.values.includes(v)) values[f.name] = f.values[0]; }
      else { const n = Number(v); if (v === undefined || !Number.isInteger(n) || n < f.min || (f.max !== undefined && n > f.max)) values[f.name] = String(f.min); }
    }
  }
  function set(name, value) { values[name] = String(value); refresh(); }

  // ---- drawing one node. Every element a node draws is inside its root, so replacing the root
  // replaces the node and nothing else.
  function drawInput(data) {
    const f = data.field;
    const box = el("div", "field");
    box.append(el("div", "label", data.label));
    if (f.kind === "choice" && f.values.length <= 5) {
      const group = el("div", "segments"); group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", data.label);
      for (const v of f.values) {
        const b = el("button", "segment", v); b.type = "button"; b.dataset.value = v; b.setAttribute("role", "radio");
        b.onclick = () => set(f.name, v);
        group.append(b);
      }
      box.append(group);
    } else if (f.kind === "choice") {
      const s = el("select", "select"); s.setAttribute("aria-label", data.label);
      for (const v of f.values) { const o = el("option", "", v); o.value = v; s.append(o); }
      s.onchange = () => set(f.name, s.value);
      box.append(s);
    } else {
      const row = el("div", "stepper");
      const minus = el("button", "step", "−"), plus = el("button", "step", "+");
      minus.type = plus.type = "button"; minus.setAttribute("aria-label", "less"); plus.setAttribute("aria-label", "more");
      const input = el("input", "number"); input.type = "number"; input.inputMode = "numeric"; input.step = "1"; input.min = String(f.min); if (f.max !== undefined) input.max = String(f.max);
      input.setAttribute("aria-label", data.label);
      const clamp = (n) => Math.max(f.min, f.max === undefined ? n : Math.min(f.max, n));
      input.oninput = () => { if (/^(0|[1-9][0-9]*)$/.test(input.value)) set(f.name, input.value); else { values[f.name] = input.value; refresh(); } };
      minus.onclick = () => set(f.name, clamp((parseInt(values[f.name], 10) || 0) - 1));
      plus.onclick = () => set(f.name, clamp((parseInt(values[f.name], 10) || 0) + 1));
      row.append(minus, input, plus);
      box.append(row);
    }
    box.dataset.field = f.name;
    return box;
  }
  function draw(node) {
    const d = node.data;
    let root;
    switch (node.kind) {
      case "heading": root = el("h1", "heading", d.text); break;
      case "text": root = el("p", "text", d.text); break;
      case "input": root = drawInput(d); break;
      case "answer":
        root = el("div", "answer");
        root.append(el("div", "label", d.label), el("div", "outcome", "—"), el("div", "meaning", ""), el("div", "because", ""));
        root.dataset.meanings = JSON.stringify(d.meanings || {});
        break;
      case "rule": case "otherwise": {
        root = el("div", "rule");
        root.dataset.index = String(d.index);
        const head = el("div", "rule-head");
        head.append(el("span", "rule-when", node.kind === "rule" ? "When " + d.when : "Otherwise"), el("span", "rule-then", d.then));
        root.append(head);
        if (d.why) root.append(el("div", "rule-why", d.why));
        break;
      }
      case "example": {
        root = el("button", "example"); root.type = "button";
        root.dataset.request = d.request; root.dataset.response = d.response;
        root.append(el("span", "example-request", d.request), el("span", "example-arrow", "→"), el("span", "example-response", d.response), el("span", "example-mark", ""));
        root.onclick = () => { const parts = d.request.split(" "); fieldsOf().forEach((f, i) => { if (parts[i] !== undefined) values[f.name] = parts[i]; }); refresh(); };
        break;
      }
      default: root = el("div");
    }
    root.classList.add("node", "node-" + node.kind);
    root.dataset.key = node.key;
    root.dataset.kappa = node.kappa;
    return root;
  }

  // ---- the dynamic part: the answer, the rule that decides it, which examples pass. Read from the
  // interpreter on every change; nothing here is part of any node's kappa.
  function firing(request, answer) {
    if (answer === "invalid") return -1;
    const spec = specOf();
    for (let i = 0; i < spec.rules.length; i++) if (prismAnswer({ ...spec, rules: spec.rules.slice(0, i + 1), otherwise: "\u0000" }, request) !== "\u0000") return i;
    return spec.rules.length;
  }
  function refresh() {
    const live = ready();
    const request = live ? line() : "";
    const answer = live ? prismDecide(specOf(), values) : null;
    const fires = live ? firing(request, answer) : -1;
    for (const { el: root } of nodes.values()) {
      if (root.classList.contains("node-input")) {
        const name = root.dataset.field, v = values[name];
        for (const b of root.querySelectorAll(".segment")) b.setAttribute("aria-checked", String(b.dataset.value === v));
        const s = root.querySelector("select"); if (s && s.value !== v) s.value = v;
        const n = root.querySelector("input"); if (n && n.value !== v && document.activeElement !== n) n.value = v;
      } else if (root.classList.contains("node-answer")) {
        const out = root.querySelector(".outcome"), meaning = root.querySelector(".meaning"), because = root.querySelector(".because");
        const word = answer === null ? "—" : answer;
        if (out.textContent !== word) { out.textContent = word; out.classList.remove("swap"); void out.offsetWidth; out.classList.add("swap"); }
        root.classList.toggle("invalid", answer === "invalid");
        let meanings = {}; try { meanings = JSON.parse(root.dataset.meanings || "{}"); } catch (e) {}
        meaning.textContent = (answer && meanings[answer]) || "";
        because.textContent = fires < 0 ? (answer === "invalid" ? "Not a valid request" : "") : fires < logic.rules.length ? "Rule " + (fires + 1) + " decides" : "No rule matches, so the otherwise answer";
      } else if (root.classList.contains("node-rule") || root.classList.contains("node-otherwise")) {
        root.classList.toggle("fires", Number(root.dataset.index) === fires);
      } else if (root.classList.contains("node-example")) {
        const pass = live ? prismAnswer(specOf(), root.dataset.request) === root.dataset.response : null;
        root.dataset.pass = pass === null ? "" : String(pass);
        root.querySelector(".example-mark").textContent = pass === null ? "" : pass ? "✓" : "✗";
        root.classList.toggle("active", live && root.dataset.request === request);
      }
    }
  }

  // ---- the patch: keep every node whose kappa is unchanged, replace the ones that changed, add the
  // new ones in place, drop the ones that went.
  function apply(m) {
    const t0 = performance.now();
    document.documentElement.classList.toggle("dark", m.theme === "dark");
    pill.textContent = TRUST[m.trust] || m.trust || "";
    pill.dataset.trust = m.trust || "";
    if (m.root === lastRoot) return painted(m.root, t0, 0);
    lastRoot = m.root;
    logic = m.logic;
    defaults();
    const focused = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".node") : null;
    const focusKey = focused ? focused.dataset.key : null;
    const next = new Map();
    let prev = null, changed = 0;
    for (const node of m.nodes) {
      const have = nodes.get(node.key);
      let root;
      if (have && have.kappa === node.kappa) root = have.el;
      else {
        root = draw(node); changed++;
        if (have) { have.el.replaceWith(root); root.classList.add("changed"); }
        else root.classList.add("enter");
      }
      const want = prev ? prev.nextSibling : list.firstChild;
      if (want !== root) list.insertBefore(root, want);
      next.set(node.key, { kappa: node.kappa, el: root });
      prev = root;
    }
    for (const [key, { el: root }] of nodes) if (!next.has(key)) root.remove();
    nodes = next;
    empty.hidden = nodes.size > 0;
    refresh();
    if (focusKey && nodes.has(focusKey) && !nodes.get(focusKey).el.contains(document.activeElement)) {
      const target = nodes.get(focusKey).el.querySelector("input, select, button");
      if (target) target.focus({ preventScroll: true });
    }
    painted(m.root, t0, changed);
  }
  // Two times per patch: `work`, the patch itself (message in, DOM done), and `ms`, message in to the
  // first frame after it, which a hidden or background page delays however fast the patch is.
  function painted(root, t0, changed) {
    const round = (n) => Math.round(n * 10) / 10;
    const work = round(performance.now() - t0);
    requestAnimationFrame(() => parent.postMessage({ type: "live/painted", app, root, changed, work, ms: round(performance.now() - t0) }, "*"));
  }

  function hello() {
    app = decodeURIComponent(location.hash.slice(1));
    lastRoot = null; logic = null;
    for (const { el: root } of nodes.values()) root.remove();
    nodes = new Map();
    for (const k of Object.keys(values)) delete values[k];
    empty.hidden = false;
    parent.postMessage({ type: "live/hello", app }, "*");
  }
  addEventListener("message", (e) => {
    if (e.source !== parent) return;
    const m = e.data;
    if (m && m.type === "live/projection" && m.app === app && Array.isArray(m.nodes)) apply(m);
  });
  addEventListener("hashchange", hello);
  hello();
})();

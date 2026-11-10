// The live frame on shadcn/ui: one React tree that draws any Prism app from its projection. Every node is
// a memoised component compared by its kappa, so a change to the spec re-renders the nodes whose kappa
// changed and leaves every other one, every typed value and the scroll position as they were. The
// components are the brand kit's vendored shadcn/ui, at the style live-src/style.json names; the answer
// comes from the interpreter every app's rule module ships (prismAnswer, prismDecide, inlined before this
// bundle from shell/prism.js). The frame is served in the preview sandbox with no network: the spec
// arrives by postMessage from the page that framed it.
/* global prismAnswer, prismDecide */
import { createContext, memo, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { CheckIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/ui/toggle-group";
import { cn } from "@/lib/utils";

const TRUST = { draft: "Draft", drafting: "Draft", checked: "Checked", proving: "Lean is proving", proved: "Proved by Lean", published: "Proved by Lean · published" };

// ---- the store: the projection as it stands, and what the user has typed
let state = { app: "", root: null, nodes: [], logic: null, logicKappa: null, trust: "", theme: "light", values: {} };
const listeners = new Set();
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
const snapshot = () => state;
const emit = () => listeners.forEach((l) => l());
let renders = 0;

function defaults(logic, old) {
  const values = {};
  for (const f of (logic && logic.fields) || []) {
    const v = old[f.name];
    if (f.kind === "choice") values[f.name] = f.values.includes(v) ? v : f.values[0];
    else { const n = Number(v); values[f.name] = v !== undefined && /^(0|[1-9][0-9]*)$/.test(v) && n >= f.min && (f.max === undefined || n <= f.max) ? v : String(f.min); }
  }
  return values;
}
function setValues(patch) { state = { ...state, values: { ...state.values, ...patch } }; emit(); }

// ---- the dynamic part: the answer, the rule that decides it, which examples pass
function evaluate(logic, values) {
  const ready = !!(logic && logic.otherwise && logic.fields && logic.fields.length);
  if (!ready) return { ready, answer: null, fires: -1, request: "" };
  const spec = { fields: logic.fields, rules: logic.rules, otherwise: logic.otherwise };
  const request = logic.fields.map((f) => String(values[f.name])).join(" ");
  const answer = prismDecide(spec, values);
  let fires = -1;
  if (answer !== "invalid") {
    fires = spec.rules.length;
    for (let i = 0; i < spec.rules.length; i++) if (prismAnswer({ ...spec, rules: spec.rules.slice(0, i + 1), otherwise: "\u0000" }, request) !== "\u0000") { fires = i; break; }
  }
  const passes = (req, res) => prismAnswer(spec, req) === res;
  return { ready, answer, fires, request, passes, rules: spec.rules.length };
}
const Live = createContext({ ready: false, values: {} });

// ---- one node
function Field({ data }) {
  const { values } = useContext(Live);
  const f = data.field, v = values[f.name] ?? "", id = "f-" + f.name;
  const step = (d) => { const n = (parseInt(v, 10) || 0) + d; setValues({ [f.name]: String(Math.max(f.min, f.max === undefined ? n : Math.min(f.max, n))) }); };
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{data.label}</Label>
      {f.kind === "choice" && f.values.length <= 5 ? (
        <ToggleGroup id={id} type="single" variant="outline" className="w-full" value={v} onValueChange={(x) => x && setValues({ [f.name]: x })}>
          {f.values.map((x) => <ToggleGroupItem key={x} value={x} className="flex-1">{x}</ToggleGroupItem>)}
        </ToggleGroup>
      ) : f.kind === "choice" ? (
        <Select value={v} onValueChange={(x) => setValues({ [f.name]: x })}>
          <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{f.values.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="less" onClick={() => step(-1)}><MinusIcon /></Button>
          <Input id={id} type="number" inputMode="numeric" step={1} min={f.min} max={f.max} className="text-center tabular-nums" value={v} onChange={(e) => setValues({ [f.name]: e.target.value })} />
          <Button variant="outline" size="icon" aria-label="more" onClick={() => step(1)}><PlusIcon /></Button>
        </div>
      )}
    </div>
  );
}
function Answer({ data }) {
  const { ready, answer, fires, rules } = useContext(Live);
  const meaning = answer && data.meanings ? data.meanings[answer] : "";
  const because = !ready ? "" : answer === "invalid" ? "Not a valid request" : fires < rules ? `Rule ${fires + 1} decides` : "No rule matches, so the otherwise answer";
  return (
    <Card className="mt-2 gap-3">
      <CardHeader>
        <CardDescription>{data.label}</CardDescription>
        <CardTitle key={answer} className={cn("font-display text-4xl tracking-tight animate-in fade-in-0 slide-in-from-bottom-1 duration-200", answer === "invalid" || !ready ? "text-muted-foreground" : "text-brand")}>{ready ? answer : "—"}</CardTitle>
      </CardHeader>
      {(meaning || because) && <CardContent className="grid gap-1">{meaning && <p>{meaning}</p>}{because && <p className="text-sm text-muted-foreground">{because}</p>}</CardContent>}
    </Card>
  );
}
function Rule({ kind, data }) {
  const { fires } = useContext(Live);
  const on = fires === data.index;
  return (
    <div className={cn("rounded-lg border px-4 py-3 transition-colors", on && "border-brand bg-brand/5")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{kind === "rule" ? "When " + data.when : "Otherwise"}</span>
        <Badge variant={on ? "default" : "secondary"} className={cn(on && "bg-brand text-brand-foreground")}>{data.then}</Badge>
      </div>
      {data.why && <p className="mt-1 text-sm text-muted-foreground">{data.why}</p>}
    </div>
  );
}
function Example({ data }) {
  const { ready, request, passes } = useContext(Live);
  const pass = ready ? passes(data.request, data.response) : null;
  const fill = () => { const parts = data.request.split(" "); const patch = {}; (state.logic?.fields || []).forEach((f, i) => { if (parts[i] !== undefined) patch[f.name] = parts[i]; }); setValues(patch); };
  return (
    <Button variant="outline" size="sm" onClick={fill} className={cn("self-start rounded-full font-mono", ready && request === data.request && "border-foreground", pass === false && "border-destructive")}>
      {data.request}<span className="text-muted-foreground">→</span>{data.response}
      {pass === true ? <CheckIcon className="text-brand" /> : pass === false ? <XIcon className="text-destructive" /> : null}
    </Button>
  );
}
const Node = memo(function Node({ node, gap }) {
  renders++;
  const ref = useRef(null), seen = useRef(node.kappa);
  // A node whose kappa changed (not a new one) flashes once, so the eye finds what the edit touched.
  useLayoutEffect(() => {
    if (seen.current === node.kappa || !ref.current) return;
    seen.current = node.kappa;
    ref.current.classList.remove("animate-flash"); void ref.current.offsetWidth; ref.current.classList.add("animate-flash");
  }, [node.kappa]);
  const d = node.data;
  const body = node.kind === "heading" ? <h1 className="font-display text-4xl font-semibold tracking-tight text-balance">{d.text}</h1>
    : node.kind === "text" ? <p className="leading-7 text-muted-foreground">{d.text}</p>
    : node.kind === "input" ? <Field data={d} />
    : node.kind === "answer" ? <Answer data={d} />
    : node.kind === "rule" || node.kind === "otherwise" ? <Rule kind={node.kind} data={d} />
    : node.kind === "example" ? <Example data={d} /> : null;
  return <div ref={ref} data-key={node.key} data-kappa={node.kappa} className={cn("flex flex-col rounded-lg animate-in fade-in-0 slide-in-from-bottom-1 duration-300", gap && "mt-3")}>{body}</div>;
}, (a, b) => a.node.kappa === b.node.kappa && a.gap === b.gap);

const group = (kind) => (kind === "rule" || kind === "otherwise" ? "rules" : kind);
function App() {
  const s = useSyncExternalStore(subscribe, snapshot);
  const live = useMemo(() => ({ ...evaluate(s.logic, s.values), values: s.values }), [s.logicKappa, s.values]);
  return (
    <Live.Provider value={live}>
      {s.trust && <Badge variant={s.trust === "proved" || s.trust === "published" ? "default" : "outline"} className={cn("fixed top-3 right-3 z-10", (s.trust === "proved" || s.trust === "published") && "bg-brand text-brand-foreground", s.trust === "proving" && "animate-pulse border-brand text-brand")} aria-live="polite">{TRUST[s.trust] || s.trust}</Badge>}
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-14 pb-16">
        {s.nodes.length === 0
          ? <p className="pt-[30vh] text-center text-sm text-muted-foreground">The app appears here as its rules are written.</p>
          : s.nodes.map((n, i) => <Node key={n.key} node={n} gap={i > 0 && group(n.kind) !== group(s.nodes[i - 1].kind) && (group(n.kind) === "rules" || n.kind === "example")} />)}
      </main>
    </Live.Provider>
  );
}

// ---- the patch, and what it cost
function apply(m) {
  const t0 = performance.now();
  const before = new Map(state.nodes.map((n) => [n.key, n.kappa]));
  const sameRoot = m.root === state.root;
  const changed = sameRoot ? 0 : m.nodes.filter((n) => before.get(n.key) !== n.kappa).length + state.nodes.filter((n) => !m.nodes.some((o) => o.key === n.key)).length;
  const logicChanged = m.logicKappa !== state.logicKappa;
  document.documentElement.classList.toggle("dark", m.theme === "dark");
  renders = 0;
  flushSync(() => {
    state = { ...state, root: m.root, nodes: sameRoot ? state.nodes : m.nodes, logic: logicChanged ? m.logic : state.logic, logicKappa: m.logicKappa, trust: m.trust || "", theme: m.theme, values: logicChanged ? defaults(m.logic, state.values) : state.values };
    emit();
  });
  const work = Math.round((performance.now() - t0) * 10) / 10, rendered = renders;
  requestAnimationFrame(() => parent.postMessage({ type: "live/painted", app: state.app, root: m.root, changed, rendered, work, ms: Math.round((performance.now() - t0) * 10) / 10 }, "*"));
}
function hello() {
  state = { app: decodeURIComponent(location.hash.slice(1)), root: null, nodes: [], logic: null, logicKappa: null, trust: "", theme: state.theme, values: {} };
  emit();
  parent.postMessage({ type: "live/hello", app: state.app, style: __STYLE__ }, "*");
}
addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  if (m && m.type === "live/projection" && m.app === state.app && Array.isArray(m.nodes)) apply(m);
});
addEventListener("hashchange", hello);
createRoot(document.getElementById("root")).render(<App />);
hello();

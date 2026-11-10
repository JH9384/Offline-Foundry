// The Forge kernel at run time. The kernel is a Prism application (UOR-Foundation/forge) whose rules
// Lean proves: the build phases (FK-01 to FK-04) and the capability gate (FK-05 to FK-09). Its guest
// is that LexLean model compiled to Core-Wasm; tools/kernel.mjs took it from the holo KERNEL_REV pins
// and wrote it, with every acceptance vector, under kernel/. Here the guest's SHA-256 is checked
// against its pin and every vector is replayed through it before anything is asked. A guest that
// fails either check is never asked: load rejects, and the caller refuses what it would have allowed.
//
// The guest speaks hologram:guest/core-wasm@1: memory, holo_alloc(len) and holo_run(ptr, len), which
// returns ptr << 32 | len. Its allocator never frees, so each request gets a fresh instance; only the
// compiled module is kept. A classic script, so the worker can importScripts it.
(function (scope) {
  "use strict";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  const toHex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  async function run(module, request) {
    const instance = await WebAssembly.instantiate(module, {});
    const { memory, holo_alloc, holo_run } = instance.exports;
    const at = holo_alloc(request.length);
    new Uint8Array(memory.buffer, at, request.length).set(request);
    const packed = BigInt.asUintN(64, BigInt(holo_run(at, request.length)));
    return new Uint8Array(memory.buffer, Number(packed >> 32n), Number(packed & 0xffffffffn)).slice();
  }

  // get(path) answers a Response for a path under the shell: the worker reads its own cache first.
  async function load(get) {
    const meta = await (await get("kernel/kernel.json")).json();
    if (meta.spec !== "hologram-forge/kernel/1") throw new Error("kernel: unknown description " + meta.spec);
    const bytes = await (await get(meta.guest.path)).arrayBuffer();
    if (toHex(await crypto.subtle.digest("SHA-256", bytes)) !== meta.guest.sha256) throw new Error("kernel: the guest does not match its pin");
    const module = await WebAssembly.compile(bytes);
    const names = WebAssembly.Module.exports(module).map((e) => e.name).sort().join(",");
    if (WebAssembly.Module.imports(module).length || names !== "holo_alloc,holo_run,memory") throw new Error("kernel: the guest is not a pure core-wasm guest");
    for (let i = 0; i < meta.vectors.length; i++) {
      const [request, response] = meta.vectors[i];
      if (!same(await run(module, fromBase64(request)), fromBase64(response))) throw new Error("kernel: acceptance vector " + i + " failed");
    }
    return Object.freeze({
      digest: meta.digest,
      vectors: meta.vectors.length,
      ask: async (line) => decoder.decode(await run(module, encoder.encode(line))),
    });
  }

  scope.ForgeKernel = Object.freeze({ load });
})(self);

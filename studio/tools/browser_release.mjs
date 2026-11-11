#!/usr/bin/env node
// Hologram Forge: integration tests for the actual GitHub Pages /foundry/ base.
// Run after the renderer is built with --base /foundry/ and stamp_shell.py.
// Chromium comes from the vendored renderer's locked Playwright dependency.
// v4: poll actual cache inventory through installation and verify stable readiness; robust negatives.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const studio = resolve(here, '..');
const shell = resolve(studio, 'shell');
const packageRequire = createRequire(resolve(studio, 'vendor/dyad/package.json'));
const { chromium } = packageRequire('playwright');
const prefix = '/foundry/';
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.wasm':'application/wasm',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml',
  '.woff2':'font/woff2', '.png':'image/png', '.ico':'image/x-icon',
};
const m = JSON.parse(await readFile(resolve(shell, 'manifest.json'), 'utf8'));
const d = JSON.parse(await readFile(resolve(shell, 'delivery.json'), 'utf8'));
if (d.shell_closure !== m.closure) throw new Error('formal and delivery records disagree');
const cacheName = `shell-${m.closure}-${d.delivery_sha256}`;
const expectedEntries = m.files.length + d.files.length + 3;

async function startServer(variant) {
  const requested = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method !== 'GET' || !url.pathname.startsWith(prefix)) {
        response.writeHead(404).end(); return;
      }
      const raw = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
      if (raw.split('/').includes('..') || raw.includes('\\') || raw.includes('\0')) {
        response.writeHead(400).end(); return;
      }
      const target = resolve(shell, raw);
      if (!target.startsWith(shell + sep)) {
        response.writeHead(403).end(); return;
      }
      requested.push(raw);
      if (variant === 'missing' && raw === 'assets/index.js') {
        response.writeHead(404).end(); return;
      }
      await stat(target);
      let content = await readFile(target);
      if (variant === 'tamper' && raw === 'assets/index.js') {
        content = Buffer.from(content);
        content[0] ^= 1; // exact same length, altered digest
      }
      if (variant === 'provenance' && raw === 'provenance.json') {
        const p = JSON.parse(content.toString('utf8'));
        p.browser_projection_sha256 = '0'.repeat(64);
        content = Buffer.from(JSON.stringify(p));
      }
      response.writeHead(200, {
        'content-type': mime[extname(target)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(content);
    } catch (e) {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, requested, close: () => new Promise(r => server.close(r)) };
}
const delay = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({headless: true});
let failures = 0;
async function test(label, fn) {
  try { await fn(); console.log(`PASS ${label}`); }
  catch (e) { failures++; console.error(`FAIL ${label}: ${e.stack ?? e}`); }
}
async function positive() {
  const {origin, close} = await startServer('valid');
  const context = await browser.newContext({serviceWorkers: 'allow'});
  const page = await context.newPage();
  const outgoing = [];
  const errors = [];
  context.on('request', request => {
    const u = request.url();
    if (/^https?:/.test(u) && !u.startsWith(origin + '/')) outgoing.push(u);
  });
  page.on('pageerror', e => errors.push(String(e)));
  try {
    // Starting from a manifest, not an unverified homepage, exercises installation first.
    await page.goto(`${origin}${prefix}manifest.json`, {waitUntil:'domcontentloaded'});
    await page.evaluate(() => navigator.serviceWorker.register('/foundry/sw.js', {
      scope: '/foundry/', updateViaCache: 'none',
    }));
    // Service-worker install may take a while: cache.open() happens before its
    // sequential SHA-256 checks, so the existence of a named cache (or even
    // a transient active worker) does NOT establish complete installation.
    // Poll the whole inventory until it is complete and stable. Keep all
    // comparisons inside each browser evaluation to avoid sampling an
    // unfinished install at a different point than the readiness check.
    const files = [
      ...m.files.map(f => f.path), ...d.files.map(f => f.path),
      'manifest.json','delivery.json','provenance.json',
    ];
    const until = Date.now() + 120000;
    let coverage = null;
    let stable = 0;
    let lastError = null;
    while (Date.now() < until) {
      try {
        coverage = await page.evaluate(async ({name, paths}) => {
          const reg = await navigator.serviceWorker.getRegistration('/foundry/');
          const cacheNames = await caches.keys();
          if (!cacheNames.includes(name)) return {
            active:reg?.active?.state === 'activated',
            installing:reg?.installing?.state ?? null,
            cachePresent:false, count:0, expectedCount:paths.length,
            missing:[],extra:[],unreadable:[]
          };
          const cache = await caches.open(name);
          const requests = await cache.keys();
          const actual = requests.map(r => r.url);
          const expected = paths.map(path => new URL(path, location.origin + '/foundry/').href);
          const actualSet = new Set(actual);
          const expectedSet = new Set(expected);
          const missing = expected.filter(url => !actualSet.has(url));
          const extra = actual.filter(url => !expectedSet.has(url));
          const unreadable = [];
          if (!missing.length && !extra.length && requests.length === paths.length) {
            for (const request of requests) {
              const response = await cache.match(request);
              if (!response?.ok) unreadable.push({url:request.url, status:response?.status ?? null});
            }
          }
          return {
            active:reg?.active?.state === 'activated',
            installing:reg?.installing?.state ?? null,
            cachePresent:true, count:actual.length,expectedCount:expected.length,
            missing, extra, unreadable,
            firstActual:actual.slice(0,3),firstExpected:expected.slice(0,3)
          };
        }, {name: cacheName, paths: files});
        lastError = null;
        const complete = coverage.active && coverage.count === coverage.expectedCount &&
          !coverage.missing.length && !coverage.extra.length && !coverage.unreadable.length;
        stable = complete ? stable + 1 : 0;
        if (stable >= 2) break;
      } catch (e) {
        // An activating worker may navigate the manifest page, destroying the
        // evaluation world. Reacquire it on the next poll; retain the error
        // for an actionable failure if readiness never follows.
        stable = 0;
        lastError = String(e);
      }
      await delay(350);
    }
    if (stable < 2) {
      throw new Error('Full cache install not observed within 120s: ' + JSON.stringify({
        coverage: coverage && {
          active:coverage.active, installing:coverage.installing,
          cachePresent:coverage.cachePresent,
          count:coverage.count, expectedCount:coverage.expectedCount,
          missing:coverage.missing?.slice(0,5),extra:coverage.extra?.slice(0,5),
          unreadable:coverage.unreadable?.slice(0,5),
          firstActual:coverage.firstActual,firstExpected:coverage.firstExpected
        },lastError
      }));
    }
    console.log('  Installed cache inventory:',
      `${coverage.count}/${coverage.expectedCount}`,
      'missing=0 extra=0 unreadable=0; worker=activated; stable=2');
    await page.goto(`${origin}${prefix}index.html`, {waitUntil:'load'});
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout:20000});
    await page.waitForFunction(() => !!document.querySelector('#root > *'), null, {timeout:30000});
    if (errors.length) throw new Error(`Browser runtime exceptions: ${errors.join('; ')}`);
    if (outgoing.length) throw new Error(`Unsolicited outbound requests: ${outgoing.join('; ')}`);
    // Offline refresh must deliver the app and its required assets from the worker.
    await context.setOffline(true);
    await page.reload({waitUntil:'load', timeout:30000});
    await page.waitForFunction(() => !!navigator.serviceWorker.controller && !!document.querySelector('#root > *'), null, {timeout:30000});
    // Offline probes must target actual files in this specific release manifest.
    const sampleScaffold = d.files.find(f => f.path.startsWith('scaffold/'))?.path;
    if (!sampleScaffold) throw new Error('Delivery lacks a scaffold resource');
    const offlineFiles = ['core.wasm', 'assets/index.js', 'assets/index.css', sampleScaffold];
    const inventory = new Set([...m.files, ...d.files].map(f => f.path));
    for (const file of offlineFiles) {
      if (!inventory.has(file)) throw new Error(`Offline probe not in release inventory: ${file}`);
    }
    const checks = await page.evaluate(async files => {
      const results = [];
      for (const file of files) {
        try { const r = await fetch(new URL(file, location.origin + '/foundry/')); results.push([file,r.status]); }
        catch (e) { results.push([file,String(e)]); }
      }
      return results;
    }, offlineFiles);
    if (checks.some(([,status]) => status !== 200)) throw new Error(`Offline resource failures: ${JSON.stringify(checks)}`);
    console.log(`  /foundry/ installation: ${expectedEntries}/${expectedEntries}; offline assets: ${checks.length}/${checks.length}; outbound requests: 0`);

    // Functional offline proof: load the actual bundled esbuild-WASM engine,
    // compile TypeScript twice, and execute the output inside an opaque frame.
    // This exercises the browser compiler, not just a cached WASM fetch.
    const compiled = await page.evaluate(async () => {
      const compilerURL = new URL('runtime/compiler/browser.min.js', location.href).href;
      const wasmURL = new URL('runtime/compiler/esbuild.wasm', location.href).href;
      const es = await import(compilerURL);
      try {
        await es.initialize({ wasmURL });
      } catch (e) {
        if (!/initialize.*more than once|already initialized/i.test(String(e))) throw e;
      }
      const options = {
        stdin: {
          contents: 'const label: string = "Offline-Foundry compiled offline"; document.body.textContent = label;',
          sourcefile: 'offline-smoke.ts',
          resolveDir: '/',
          loader: 'ts',
        },
        bundle: true, format: 'iife', platform: 'browser',
        write: false, logLevel: 'silent',
      };
      const first = await es.build(options);
      const second = await es.build(options);
      // With stdin and no outfile esbuild may report a virtual output path
      // such as "<stdout>" rather than one ending in .js.
      const js = first.outputFiles?.[0]?.text;
      const jsAgain = second.outputFiles?.[0]?.text;
      if (!js || !jsAgain || js !== jsAgain) {
        throw new Error('Offline TypeScript compilation absent or non-repeatable: ' +
          JSON.stringify({
            firstPaths: first.outputFiles?.map(file => file.path),
            secondPaths: second.outputFiles?.map(file => file.path),
            firstBytes: js?.length ?? 0,
            secondBytes: jsAgain?.length ?? 0,
          }));
      }

      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      const completed = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', receive);
          reject(new Error('Offline compiled preview did not respond'));
        }, 15000);
        function receive(event) {
          if (event.source !== frame.contentWindow || event.data?.kind !== 'offline-foundry-compile') return;
          clearTimeout(timeout);
          window.removeEventListener('message', receive);
          if (event.origin !== 'null') {
            reject(new Error('Compiled preview is not opaque-origin sandboxed'));
          } else resolve(event.data.text);
        }
        window.addEventListener('message', receive);
      });
      // A sandboxed iframe may execute scripts, but has an opaque origin and
      // cannot access the parent page's IndexedDB or other same-origin state.
      frame.srcdoc = '<!doctype html><body><script>' + js +
        ';parent.postMessage({kind:"offline-foundry-compile",text:document.body.textContent},"*")' +
        '</script></body>';
      document.body.append(frame);
      try {
        const text = await completed;
        if (text !== 'Offline-Foundry compiled offline') {
          throw new Error('Offline compiled output did not execute as expected: ' + text);
        }
      } finally {
        frame.remove();
      }
      return { bytes: js.length, repeatable: true, opaquePreview: true };
    });
    if (errors.length) throw new Error('Browser runtime exceptions: ' + errors.join('; '));
    if (outgoing.length) throw new Error('Unexpected outbound requests during offline compile: ' + outgoing.join('; '));
    console.log('  Offline TypeScript compilation and sandboxed preview: PASS', JSON.stringify(compiled));

    // Real browser-host workflow: create a scaffold project, edit a source
    // file, and verify that version identity changes in IndexedDB.
    const project = await page.evaluate(async () => {
      const ipc = window.electron?.ipcRenderer;
      if (!ipc) throw new Error('Browser project IPC unavailable');
      const created = await ipc.invoke('create-app', {
        name: 'Offline acceptance project', initialChatMode: 'build',
      });
      const appId = created?.app?.id;
      if (!appId) throw new Error('Offline project creation returned no app ID');
      const app = await ipc.invoke('get-app', appId);
      const filePath = app?.files?.find(path => path === 'src/main.tsx') ??
        app?.files?.find(path => /\\.(tsx|ts|jsx|js)$/.test(path));
      if (!filePath) throw new Error('Created project contains no editable source file');
      const original = await ipc.invoke('read-app-file', { appId, filePath });
      const oldHead = await ipc.invoke('app:get-current-commit-hash', { appId });
      const marker = '// OFFLINE_FOUNDRY_ACCEPTANCE_EDIT';
      const edited = original + '\\n' + marker + '\\n';
      await ipc.invoke('edit-app-file', { appId, filePath, content: edited });
      const newHead = await ipc.invoke('app:get-current-commit-hash', { appId });
      const confirmed = await ipc.invoke('read-app-file', { appId, filePath });
      if (confirmed !== edited || !oldHead || !newHead || oldHead === newHead) {
        throw new Error('Offline edit or version seal did not persist');
      }
      return { appId, filePath, edited, newHead };
    });
    await page.reload({ waitUntil:'load', timeout:30000 });
    await page.waitForFunction(() => !!window.electron?.ipcRenderer && !!window.__host, null, {timeout:30000});
    const restored = await page.evaluate(async ({appId,filePath,edited,newHead}) => {
      const ipc = window.electron.ipcRenderer;
      const app = await ipc.invoke('get-app', appId);
      const content = await ipc.invoke('read-app-file', {appId,filePath});
      const head = await ipc.invoke('app:get-current-commit-hash', {appId});
      return {ok: !!app && content === edited && head === newHead, appId, filePath};
    }, project);
    if (!restored.ok) throw new Error('Offline project did not survive browser reload');
    if (outgoing.length) throw new Error('Unexpected outbound request during offline project persistence');
    console.log('  Offline project create/edit/version/reload: PASS', JSON.stringify(restored));


  } finally { await context.close(); await close(); }
}
async function negative(variant, expectedPath) {
  const {origin, requested, close} = await startServer(variant);
  const context = await browser.newContext({serviceWorkers:'allow'});
  const page = await context.newPage();
  try {
    await page.goto(`${origin}${prefix}manifest.json`, {waitUntil:'domcontentloaded'});
    await page.evaluate(() => navigator.serviceWorker.register('/foundry/sw.js', {
      scope:'/foundry/', updateViaCache:'none',
    }));
    // Wait until the altered file was actually requested. No early success based
    // on a registration that has not started its installation yet.
    const until = Date.now() + 120000;
    while (!requested.includes(expectedPath) && Date.now() < until) await delay(200);
    if (!requested.includes(expectedPath)) throw new Error(`Test never fetched ${expectedPath}`);
    await page.waitForFunction(async name => {
      const reg = await navigator.serviceWorker.getRegistration('/foundry/');
      return !reg?.installing && !reg?.waiting && !reg?.active &&
        !(await caches.keys()).includes(name);
    }, cacheName, {timeout: 120000, polling: 300});
    // Check again after cleanup, to reject a transient empty cache as success.
    await delay(300);
    const result = await page.evaluate(async name => {
      const reg = await navigator.serviceWorker.getRegistration('/foundry/');
      return {active:!!reg?.active, cache:(await caches.keys()).includes(name)};
    }, cacheName);
    if (result.active || result.cache) throw new Error(`Invalid release accepted: ${JSON.stringify(result)}`);
  } finally { await context.close(); await close(); }
}
try {
  console.log('=== UOR FOUNDRY /foundry/ BROWSER RELEASE TEST (v4) ===');
  console.log(`formal=${m.closure} delivery=${d.delivery_sha256}`);
  await test('valid install, offline, UI bootstrap, no unsolicited network', positive);
  await test('same-length asset tamper refused', () => negative('tamper','assets/index.js'));
  await test('missing renderer refused', () => negative('missing','assets/index.js'));
  await test('incorrect provenance refused', () => negative('provenance','provenance.json'));
} finally { await browser.close(); }
if (failures) {
  console.error(`BROWSER RELEASE: DEFER (${failures} failed)`);
  process.exitCode = 1;
} else {
  console.log('BROWSER RELEASE: 4/4 PASS');
  console.log('Production authorization: DEFER (publisher authentication and full CI still required)');
}

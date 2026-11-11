#!/usr/bin/env node
// Local-only operator server for a previously assembled Offline-Foundry shell.
// This process never proxies, downloads packages, builds, or deploys.
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const shell = resolve(dirname(fileURLToPath(import.meta.url)), '../shell');
const root = await realpath(shell);
const portString = process.argv[2] ?? '4173';
const port = Number(portString);
if (!/^[0-9]+$/.test(portString) || !Number.isSafeInteger(port) ||
    port < 1024 || port > 65535) {
  throw new Error('Use a local TCP port in the range 1024–65535');
}
for (const required of ['index.html', 'sw.js', 'manifest.json',
  'delivery.json', 'runtime/packages/react-bundle.js']) {
  const item = join(root, required);
  const details = await stat(item).catch(() => null);
  if (!details?.isFile() || details.size === 0) {
    throw new Error('Assemble and verify the shell first: missing ' + required);
  }
}
const types = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.wasm':'application/wasm',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.woff':'font/woff',
  '.woff2':'font/woff2', '.ttf':'font/ttf', '.ico':'image/x-icon',
  '.txt':'text/plain; charset=utf-8', '.map':'application/json; charset=utf-8',
};
const server = createServer(async (req,res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {'allow':'GET, HEAD'}).end();
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/foundry' && !url.pathname.startsWith('/foundry/')) {
      res.writeHead(404).end('not found');
      return;
    }
    let path = decodeURIComponent(url.pathname.slice('/foundry'.length));
    if (path === '' || path === '/') path = '/index.html';
    if (path.includes('\0') || path.includes('\\')) {
      res.writeHead(400).end('invalid path');
      return;
    }
    const candidate = resolve(root, '.' + path);
    const rel = relative(root,candidate);
    if (rel === '..' || rel.startsWith('..' + sep) || rel.startsWith(sep)) {
      res.writeHead(403).end('outside shell');
      return;
    }
    let file = candidate;
    const info = await stat(candidate).catch(() => null);
    if (!info?.isFile()) {
      // The browser router uses clean URLs. Missing assets must not
      // masquerade as successful HTML, so only extensionless routes fall back.
      if (extname(candidate)) {
        res.writeHead(404).end('asset missing');
        return;
      }
      file = join(root, '404.html');
    }
    const actual = await realpath(file);
    const checked = relative(root,actual);
    if (checked === '..' || checked.startsWith('..' + sep) || checked.startsWith(sep)) {
      res.writeHead(403).end('symlink outside shell');
      return;
    }
    const body = await readFile(actual);
    const headers = {
      'content-type':types[extname(actual)] ?? 'application/octet-stream',
      'content-length':body.length,
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'service-worker-allowed':'/foundry/',
    };
    res.writeHead(200,headers).end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error('Local shell request rejected:',String(error));
    res.writeHead(500).end('local server error');
  }
});
server.listen(port,'127.0.0.1',() => {
  console.log('Offline-Foundry loopback shell: http://127.0.0.1:' + port + '/foundry/');
  console.log('Local browser origin only. Production publication remains DEFER.');
});

#!/usr/bin/env node
// Report the default scaffold's actual external imports. This gate does not
// claim packages are locally bundled; it makes remaining work measurable.
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dyad = resolve(here, '../vendor/dyad');
const require = createRequire(resolve(dyad, 'package.json'));
const { parse } = require('@babel/parser');
const root = resolve(dyad, 'scaffold/src');
const supported = new Set(['react', 'react-dom/client', 'react/jsx-runtime']);
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const packages = new Map();
let sourceFiles = 0;

const isLocal = name => name.startsWith('./') || name.startsWith('../') ||
  name.startsWith('@/') || name.startsWith('/');
function packageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}
function collect(specifier, relative) {
  if (!specifier || isLocal(specifier)) return;
  const pkg = packageName(specifier);
  if (!packages.has(pkg)) packages.set(pkg, { imports: new Set(), files: new Set() });
  const item = packages.get(pkg);
  item.imports.add(specifier);
  item.files.add(relative);
}
async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);
    if (entry.isDirectory()) { await scan(full); continue; }
    if (!entry.isFile() || !extensions.has(extname(entry.name))) continue;
    sourceFiles += 1;
    const relative = full.slice(root.length + 1).replaceAll('\\', '/');
    const source = await readFile(full, 'utf8');
    const ast = parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
    for (const node of ast.program.body) {
      if (node.type === 'ImportDeclaration' ||
          node.type === 'ExportNamedDeclaration' ||
          node.type === 'ExportAllDeclaration') {
        if (node.source?.value) collect(node.source.value, relative);
      }
    }
    // Dynamic imports are deliberate dependencies and must also be accounted for.
    for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      collect(match[1], relative);
    }
  }
}
await scan(root);
const rows = [...packages].sort((a,b) => a[0].localeCompare(b[0])).map(([name, value]) => ({
  package: name,
  specifiers: [...value.imports].sort(),
  files: [...value.files].sort(),
  locallySupported: [...value.imports].every(spec => supported.has(spec)),
}));
const missing = rows.filter(row => !row.locallySupported);
console.log(JSON.stringify({
  schema: 'offline-foundry/scaffold-dependency-inventory/1',
  sourceFiles,
  externalPackages: rows.length,
  packagesNotYetBundled: missing.length,
  locallySupportedSpecifiers: [...supported].sort(),
  packages: rows,
}, null, 2));
if (sourceFiles === 0 || rows.length === 0 || !rows.some(row => row.package === 'react')) {
  throw new Error('Default scaffold dependency inventory is unexpectedly empty');
}
console.log('SCAFFOLD INVENTORY: PASS (report only; missing packages remain DEFER)');

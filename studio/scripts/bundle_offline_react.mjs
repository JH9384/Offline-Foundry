// Bundle a minimal shared React runtime for offline browser previews.
// The actual browser bundle is generated during the verified release build.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const studio = resolve(here, '..');
const dyad = resolve(studio, 'vendor/dyad');
const packageRequire = createRequire(resolve(dyad, 'package.json'));
const esbuild = packageRequire('esbuild');
const outfile = resolve(studio, 'shell/runtime/packages/react-bundle.js');
await esbuild.build({
  stdin: {
    contents: [
      'import * as React from "react";',
      'import { createRoot, hydrateRoot } from "react-dom/client";',
      'import { jsx, jsxs, Fragment } from "react/jsx-runtime";',
      'globalThis.__offlineReact = { React, createRoot, hydrateRoot, jsx, jsxs, Fragment };',
    ].join('\n'),
    resolveDir: dyad,
    sourcefile: 'offline-react-entry.js',
    loader: 'js',
  },
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  minify: false,
  outfile,
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline',
  logLevel: 'warning',
});
console.log('Built local React and ReactDOM preview runtime:', outfile);

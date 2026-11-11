# Offline-Foundry — supported local-first workflow

Status: **verification branch only**. Production release, hosting and deployment remain **DEFER**.

## Scope

This guide describes the **supported offline starter**, not unrestricted npm compatibility or a
fully offline AI agent. The source for the extended React/third-party UI scaffold is retained
but still needs additional local packages.

The starter is staged by `studio/scripts/stamp_shell.py` into:
- `scaffold/src/main.tsx` — active React entrypoint;
- `scaffold/src/OfflineStarter.tsx` — editable example component;
- `scaffold/src/offline-starter.css` — local styles;
- `scaffold/src/main.extended.tsx` — preserved original entrypoint;
- all existing scaffold source files are retained.

## Launch on Mac Studio (verified assets only)

The static browser shell can run on loopback without publishing a website.
After building the exact verification revision using the steps in
`.github/workflows/forge-verify.yml`, run from `studio/`:

```bash
python3 tools/release_gate.py
node tools/serve_offline.mjs 4173
```

Open **http://127.0.0.1:4173/foundry/** in a browser. The server binds to
`127.0.0.1` only and serves the assembled `studio/shell` directory.
It does not install dependencies or compile missing browser assets.
Serving locally is not authorization to publish or deploy.

A fresh checkout is not a built shell. Follow the workflow's pinned compiler,
renderer and assembly steps first; never bypass the release gate.

## Operator workflow

1. **Build and verify** the repository's exact verification revision using
   `.github/workflows/forge-verify.yml`. It assembles and hashes local browser dependencies,
   runs the release integrity checks and drives Chromium. A green run verifies the specific
   commit, not all future project changes.
2. **Install the browser shell** at a trusted local `/foundry/` origin using the verified
   delivery. The service worker must complete installation and cache verification before
   disconnecting. Do not enable GitHub Pages or production hosting for this verification branch.
3. **Create a project** in the application's project-creation interface. A new project
   receives the runnable offline starter instead of a network-dependent default entrypoint.
4. **Open** `src/OfflineStarter.tsx`, make changes in Monaco and save. The browser host
   writes the file to local IndexedDB and seals a new project version.
5. **Build and preview** the project using the local browser compiler. The preview uses
   the locally bundled React, ReactDOM and JSX runtime. Test interaction in the preview.
6. **Reload** the editor, reopen the project and verify the saved file and version.
   Rebuild to obtain a preview at its new content-derived identity.
7. **Export a project backup** through the available app export mechanism before clearing
   browser data, moving machines or changing the browser origin. Browser IndexedDB and
   service-worker caches are scoped to the origin.

## Offline boundaries

- Preview imports are **fail-closed**: unsupported bare packages raise
  `Offline dependency not bundled: <specifier>` instead of loading a remote CDN.
- The supported starter only imports `react`, `react-dom/client`, and the JSX runtime.
- Rich UI scaffold imports (router, query, Radix, Sonner, and others) are **not yet verified
  for offline preview**. Do not switch `main.tsx` to `main.extended.tsx` until its dependencies
  are present in the independently hashed local delivery.
- The Tailwind CDN runtime is intentionally excluded; the supported starter uses plain CSS.
- No cloud AI inference, arbitrary npm installation, Zig builds, PrismPM release, or
  LexLean attestation is implied by the browser starter acceptance test.
- Preview network capabilities default to empty. No external endpoint is implicitly granted.
- The clean runner may access online package registries during **build/assembly**;
  the resulting verified browser workflow must run without external requests.

## Evidence and controls

`studio/tools/browser_release.mjs` exercises project create/edit/version/reload,
React JSX preview, Monaco editing and persistence, missing dependency refusal,
and the supported starter's create/interact/edit/rebuild/reopen workflow.

`studio/tools/scaffold_dependency_inventory.mjs` measures the remaining external package
surface. The inventory is a report, **not** a claim that every package is locally bundled.

Release rule: remain **DEFER** unless the exact revision's formal, release-gate,
browser, offline-network and negative tests are green, and separate production
authorization is explicitly granted.

Repository boundary: `JH9384/Offline-Foundry` only. Do not modify or merge the
original UOR-Foundation repository as part of this workflow.

# Vendored: fmaclen/hollama at 78c63850fa9f (tag 0.35.4, MIT), built into shell/ui/

The chat app on this origin is Hollama, built as static files under the Pages subpath `/hologram-forge/ui`
and shown as Hologram. Nothing of it is copied into this tree as source: `scripts/build-hollama.sh`
clones the commit, applies `scripts/hollama-brand.patch`, runs `tools/kit-to-hsl.mjs`, builds with
SvelteKit's static adapter (installed at build time, never saved to Hollama's package files) and copies
the output to `shell/ui/`, with Hollama's MIT notice beside it as `shell/ui/LICENSE-hollama.txt`. The
same inputs give the same bytes.

## The patch (`scripts/hollama-brand.patch`)

Brand, in the sense of what a visitor sees:

- `src/app.html`: the title, the icon (`favicon.svg`, the kit's white logomark) and the one font sheet
  (`fonts/hologram/hologram.css`) in place of Inter and JetBrains Mono.
- `src/lib/components/Head.svelte`, `src/lib/components/CollapsibleSidebar.svelte`: the name in the tab
  title and beside the mark; the GitHub link to Hologram Technologies.
- `src/lib/github.ts`, `src/routes/settings/Version.svelte`: the release and update links, so the
  version screen never names another product.
- `tailwind.config.js`: the font families, Geist and Geist Mono.
- `src/app.html`, `src/routes/+layout.svelte`, `src/lib/settings.ts`: dark is the default for a visitor who has not chosen (the kit's primary mode); Hollama followed the system. The toggle still works and is remembered.
- `src/lib/components/CollapsibleSidebar.svelte`: the Motd link (Hollama's message of the day, its own release notes) is removed from the sidebar; the route still exists, unlinked.

Arriving ready, because a demo that opens on a settings screen is not one:

- `src/app.html`: two script tags for files of ours, `ui-seed.js` and `ui-host.js` (see below).
- `src/routes/+page.svelte`: the entry goes to a new session rather than the session list, so the
  visitor lands in a chat. With no verified connection it still goes to the settings screen.
- `src/routes/sessions/[id]/+page.svelte`: a session with no model of its own takes the first model
  the connection offers, so the picker is filled in rather than empty.

The subpath, because Hollama writes its routes as absolute paths and SvelteKit's `paths.base` does not
reach them: `${base}` in front of every `goto`, `href` and pathname check (twelve occurrences in six
files, plus `src/lib/components/ButtonNew.ts` and the leave check in `src/routes/sessions/[id]/+page.svelte`),
with `import { base } from '$app/paths'` where it was missing.

The static build: `svelte.config.js` (the static adapter with an `index.html` fallback, `paths.base` from
`PUBLIC_BASE_PATH`), and `src/routes/api/metadata/+server.ts` marked `prerender` with its two
environment reads replaced by the literals a static site has (`isDesktop: false`, `isDocker: false`);
`src/lib/updates.ts` reads that file under the base path.

No component's logic, layout or markup changed beyond the logo slot and those prefixes. Storage keys,
ids and internal identifiers keep Hollama's names: renaming them would be behaviour.

## Generated at build, not in the patch

`tools/kit-to-hsl.mjs` writes `src/app.pcss` from the kit's warm layer
(`vendor/hologram-brand-kit/css/hologram-warm.css` at `BRAND_KIT_REV`): twelve variables per mode
converted to the HSL triplets Hollama's Tailwind config consumes, the kit's alpha borders composited
over the kit's background first. Hollama's positive, warning and the muted tints have no token in the
kit and keep Hollama's values. It also places the kit's six web fonts with their OFL file and the mark.

## Ours, beside the build: `scripts/ui-seed.js` and `scripts/ui-host.js`

The chat app loads them as two script tags and knows nothing about them. The seed is a blocking classic
script, because the app's entry runs while a module is still being fetched and would read an empty
connection list: it writes the connection once (this origin's own endpoint, no key, the model filter
`webgpu:Hologram` so the picker offers the ladder, the model that is whatever rung this device has ready). The host is a module: it registers the shell's service worker (a visitor who arrives before it is
installed is controlled after one reload, and only that first install reloads), starts the engine so
the model is loading before the visitor types, and shows the first download as a card at the top of
the page. It names no colour: the card uses the kit's variables, which the page already defines.

## Terms

Hollama: MIT, Copyright (c) Fernando Maclen; the notice travels with the build. The kit's CSS: MPL-2.0
(Hologram Technologies), read at build time, nothing of it vendored into the output but the values.
Geist and Geist Mono: SIL Open Font License, `shell/ui/fonts/hologram/OFL-Geist.txt`. The mark and the
name Hologram are Hologram Technologies' own.

## Serving

The worker on this origin (`shell/sw.template.js`) leaves pages under `ui/` out of its reload on a new
closure, prefers the homepage when one is open and otherwise lets a chat page answer the endpoint
itself, so one tab is enough, and serves every navigation under
`ui/` from `ui/index.html`, so deep links and refreshes work on Pages, which has no rewrite rule. The
build's files are in the shell closure like any other and are precached at install, so the app opens
with the network off after one visit.

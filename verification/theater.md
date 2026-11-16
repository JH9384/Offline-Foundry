# Theater

Authority: `FA-92` in `model/ids.toml`, scenario in `features/suites/theater.feature`, owned by the `Theater`
feature and surface in `app/product.json`, which calls `FoundrySpecification::theaterBoundary`.

Why: Prism apps are made to be used, and Home shows only four of them at a time. Theater lets a visitor watch and
use them one after another, the way a stream plays one video after another, without leaving the page.

How: Theater is a route of the renderer (`/theater`, declared by a patch to `src/router.ts` in
`studio/vendor/dyad/hologram.screens.mjs`) whose screen, `TheaterPage`, lives in the floor's own module,
`hologram.screens/FeaturedAppShowcase.tsx`. It plays from that module's catalogue, drawn covers and bookmarks,
so a star on Home is the same star in Theater. A visitor's app is started through the run state the build
preview uses and shown at the address that state answers, under exactly the preview's sandbox; Theater adds
no effect of its own. A featured app that is not published is never run: Build it now writes its idea into
Home's box (`homeChatInputValueAtom`) and nothing is sent.

What: the look is five statements in `studio/experience/src/FoundryExperience.lex.tex`: `theaterInSidebar`,
`theaterStage`, `theaterDetails`, `theaterUpNext` and `theaterKeys`. They are statements, checked by
`lexlean check`, not theorems: Lean proves nothing about looks. `theaterBoundary` states the behavior in the
Foundry specification at the same level as `sidebarToolAccessBoundary`.

## Evidence

- `theater_fa_92` in `crates/conformance/tests/sidebar_tool_access.rs` reads the built sources: the five
  statements exist; Theater is the navigation item right after Library and not optional; the header names it;
  the router serves it from the floor's module; the stage's sandbox is the preview's, read from
  `PreviewIframe.tsx`; and the stage, rail, golden measures, address and keys are present.
- `studio/tools/shell_ui.test.mjs` lists the five statements with the others.
- `studio/tools/foundry_trace.test.mjs` traces FA-92 to the Theater feature and the Theater surface to the
  `Watch apps` journey.

## Planted defect

Defect: delete `{ title: "Theater", to: "/theater", icon: MonitorPlay },` from `AppSidebar.tsx`.

Command: `cargo test -q --locked -p repo-conformance --test sidebar_tool_access` in the SDK image.

Diagnostic: `theater_fa_92` panicked at `sidebar_tool_access.rs:53`: the line after Library is not Theater.

Restored: the line is back and the suite passes, 2 of 2.

## Not covered here

A visitor's own app playing live on the stage was not exercised in the local preview, which serves no service
worker and so cannot load content-addressed previews. The stage uses the same run state and address as the build
preview, which its own gates cover.

## Ratchet

The screen adds non-Prism lines. Upstream's `src/pages/apps.tsx`, replaced whole at build by
`hologram.screens/AppsPage.tsx`, is reduced to its typed default export, as `src/components/app-sidebar.tsx`
already is, so non-Prism implementation shrinks overall.

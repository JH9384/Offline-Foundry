# Private workspace

Authority: `FA-91` in `model/ids.toml`, scenario in `features/suites/private-workspace.feature`.

A visitor's work in Foundry is meant to be theirs alone: sealed on their devices under their Prism ID's
boundary key, and opened only for that ID. `app/src/Workspace.lex.tex` holds the decisions and
`app/src/WorkspaceProofs.lex.tex` their theorems, and Foundry's Prism
kernel answers them: `ForgeKernel::dispatch` sends a request that starts with `workspace ` to
`Workspace::dispatchWorkspace` (through `dispatchApplication`, ahead of the protocols, so the in-tab verdict's
entry stays as `studio/tools/in_tab_verdict_author.mjs` writes it).

The kernel answers five kinds of request: open a workspace, read a record, store a record, move the workspace
kept before an ID, and remove its plain copy. Each answer is `ok` or the first refusal, by name:
`workspaceDeviceRemoved`, `workspaceSessionExpired`, `workspaceNotOwner`, `workspaceKeyStale`, `workspaceClosed`,
`recordTampered`, `recordMisplaced`, `recordUnsealed`, `workspaceQuotaExceeded`, `workspaceAlreadyMoved`,
`sealedCopyNotCommitted`. Any other shape is `malformedWorkspaceRequest`; more than 128 bytes is
`workspaceRequestTooLarge`. `workspaceWireBoundary` states the wire.

Two kinds of evidence:

- Eight theorems, each that no request meets a `breaks` condition: a workspace opens only for its owner, only
  with the current key, only with a live session, never on a removed device; a record is read only when
  authentic and in place, stored only sealed and within quota; the move happens at most once; the plain copy goes
  only after the sealed copy is committed.
- Nineteen `workspaceWords_` theorems Lean proves by evaluation, each also an acceptance vector the compiled guest
  replays (`workspaceAcceptance`, ahead of `ruleAcceptance`). They cover every answer, plus a wrong version, a
  trailing word and an unknown kind.

`private_workspace_fa_91` in `crates/conformance/tests/in_tab_kernel_verdict.rs` holds the two together and to
dispatch: the dispatch arm is present, and the number of `workspaceWords_` theorems equals the number of workspace
vectors in the kernel (at least 19). `studio/tools/application_main_integration.test.mjs` counts every acceptance
vector in the kernel, now 355.

`npx prism-code verify --lean --local` in `app/` verified all 42 modules (attestation
`dcc25ea17350c5d1d40968b11c45d07bcff7199e36e6f8ca9a1d675b595e25b0`).

Mutation, 2026-11-16:

1. The decision. Removing the owner check from `openCode` made `npx prism-code verify --lean --local` fail: Lean
   rejected `workspaceWords_anotherIdRefused` (`src/Workspace.lex.tex:216` then; the theorem is now in `src/WorkspaceProofs.lex.tex`), which expects `workspaceNotOwner`.
   Restored, byte-identical to the verified module.
2. The vectors. Dropping one workspace vector from `workspaceAcceptance` in `app/src/ForgeKernel.lex.tex` made
   `cargo test -p repo-conformance --test in_tab_kernel_verdict` fail: `private_workspace_fa_91` panicked with
   `left: 19, right: 18`. Restored, 3 passed.

What this does not establish. The decisions are proved and the kernel answers them; nothing asks yet. No Studio
code sends a `workspace ` request, seals a record with the Prism ID's boundary key, or scopes the browser store
to an ID, so no visitor's workspace is private until that host work lands. Whether a device was removed, a
session is live or sealed bytes are authentic is the host's to compute from stitch's Prism ID
(`identity/prism-id.mjs`: `sealPrivate`, `openPrivate`) and Hologram's `seal_bytes` and `open_bytes`.

Why the theorems sit in their own module. `ForgeKernel` imports `Workspace`, so a `linear_arithmetic` proof
there stages `LexLeanRuntime.Laws` into the application build, where Lean's C emitter loops (LexLean #465;
`v2/build-speed/REPORT.md`). With the theorems in `Workspace`, the SDK's Lean stage timed out on CI twice
(`PP5007`, run 43915183780). `WorkspaceProofs` is an entrypoint nothing in the application imports, as
`ForgeKernelProofs` is.

Where it was run. `prismpm --project app verify` in the SDK image `prismpm.lock` pins did not finish on this
machine: its Lean stage allows 600 seconds, and compiling the SDK's runtime from cold took longer before reaching
any project module (`PP5007: application-lean timed out`). The proofs above used `prism-code` 0.8.0 with the
local Lean toolchain; CI runs the gate in the SDK image.

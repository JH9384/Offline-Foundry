# Browser composition boundary

FA-10 implements `FoundrySpecification.compositionHostBoundary` and its typed
`KernelBoundaryError` vocabulary. `forge:compose` accepts exactly policy and
features, serializes them with `CompositionProtocol`, and delegates admission to
the pinned generated guest. No browser implementation decides semantic validity.

The loader rejects malformed metadata, unavailable resources, changed guest
bytes, an impure or incorrect ABI, and failing acceptance before exposing the
guest. Public dispatch checks and copies input, uses a fresh instance, and bounds
output before copying it. Text requests use the same dispatch. Public request
limits and acceptance allocation limits remain distinct.

Registration and a failing Rust test preceded implementation. Seven Node tests
execute the actual loader and committed Wasm, including the actual host handler
extracted from `host.js`. The old guest fails the composition case. Chromium
additionally executes the shipped classic loader in a document and a dedicated
worker, replaying the complete wire corpus in both. Oversized public requests
must produce the loader's typed refusal; the embedded allocation-boundary vector
still executes during acceptance replay. The worker test checks classic-script
compatibility; it does not establish complete service-worker journey acceptance.

The repository kernel gate binds metadata and guest bytes to `KERNEL_REV` and the
archive. Runtime SHA256 checking alone does not authenticate an arbitrary origin.
Model declaration admission does not authenticate a feature registry or its
evidence. Intent routing, domain projections, UI creation, physical budget
measurement and whole-application release qualification remain distinct
specification obligations.

Artifact qualification and mutation receipts are recorded below only after their
checks complete. This feature remains unaccepted until its actual SDK-built guest
passes the complete boundary and browser suites.

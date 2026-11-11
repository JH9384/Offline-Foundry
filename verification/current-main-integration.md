# Current main integration (FA-24)

Authority: `app/src/FoundrySpecification.lex.tex`,
`currentMainIntegrationBoundary`; lifecycle claims FK-10/FK-11 remain in
`ForgeKernel.lex.tex` and `ForgeKernelProofs.lex.tex`.

This integration preserves main's live editor, renderer, mobile layout and
verification gates alongside the conversion's composition, work, typed host,
source binding and atomic storage boundaries. Live edits and agent patches use
one captured source per batch, commit once, and carry the resulting source.
A storage refusal invalidates optimistic editor history and refreshes committed
state. Wording changes retain a proof only after matching both the candidate
and prior checked logic with the stored identity. Proof completion uses the
latest matching state as its compare-and-set predecessor. The semantic
published phase may survive rewording, but the card marks the publication stale
until a successful new publication.

The registered six-control gate initially failed because it did not exist.
After implementing the host integration, five host controls passed and the
sixth rejected the inherited 109-vector guest: the integrated guest must replay
at least 114 vectors, including reword, and retain composition and work.
The stale guest is not a qualified integration result. Build provenance,
mutation results and full immutable SDK evidence will be recorded before this
feature is marked ready.

The host tests execute extracted production functions with controlled effects;
they do not claim end-to-end provider or renderer qualification. The existing
real IndexedDB generation browser controls remain active. No factory consumer
or full application conversion claim follows from this integration.

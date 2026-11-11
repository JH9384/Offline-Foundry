# Application specification implementation status

Authority: `app/src/FoundrySpecification.lex.tex`, specifically `Obligation`,
`requirement`, `scope`, `claims`, `adaptation`, `intent`, and the typed admission
boundary. This ledger reports implementation status; it does not define product
behavior or constitute acceptance evidence.

Baseline: `9e6fccba37b07c29eab234d8032599aac5049cca`. Existing kernel, Studio,
identity and publishing mechanisms are preserved. Their existence is not treated
as evidence that the broader specification is satisfied.

| Specification obligation | Change/evidence in this work | Remaining acceptance work |
| --- | --- | --- |
| authority | FA-01 typed owner-declaration admission and seven proof controls; PR #22. FA-02 checks six Studio projections without writes; PR #23. | Inventory and bind actual semantic owners throughout both application surfaces; converge duplicate behavioral authorities. |
| features | Normative requirement recorded. | Implement versioned feature contracts, registry, all declared fields and reject malformed contracts. |
| routing | Normative requirement and bounded adaptation rule recorded. | Implement replaceable R4 proposals, held-out qualification, ambiguity and abstention handling. |
| composition | Normative requirement recorded. | Implement independent interface/dependency/conflict/permission/resource admission and separate release scopes. |
| projection | Studio declaration-to-source drift gate in PR #23. | Bind models to running host and renderer behavior; replace unsupported empty-success fallbacks with modeled capability handling and tested UI behavior. |
| proofScope | Claim boundaries and diagnostic/compiler distinctions recorded. | Bind each claim to exact source, executable, dependencies, oracle and locked-toolchain evidence. |
| effects | Normative requirement recorded. | Complete typed permission, disclosure, credential, timeout, revocation and offline behavior across each effect boundary. |
| identity | Normative requirement recorded. | Qualify typed identity profiles and independently recompute all transformation relationships. |
| packaging | Normative requirement recorded. | Validate complete production dependency closure, reproducible artifacts, independent archive extraction and mutation refusals. |
| journeys | Normative requirement recorded. | Bind creation through recovery/publication to authoritative commands; execute positive and negative browser journeys. |
| quality | Normative requirement recorded. | Fix thresholds and qualify accessibility, fidelity, usability and performance with appropriate independent evidence. |
| release | Normative requirement recorded. | Bind release receipt to exact scope/artifacts/destination; independently retrieve and replay deployment. |
| representation | Compression-derived requirement and claim distinctions recorded. | Implement exact reconstruction with separate original/representation/decoder/basis identities and explicit missing-basis refusal. |
| ownership | Normative requirement recorded. | Implement reservation, work accounting, cancellation and resumable obligations without conflating semantic work with physical resources. |
| factory | Factory requirement and upstream boundary inspected. | Qualify immutable factory-capable SDK and template; model obligation closures, oracle/policy identities and complete acceptance-preserving reuse. |

## Factory prerequisite

On 2026-11-11, UOR-Foundation/PrismPM PR #586 was open and unmerged at
`f6d6c6a447b71411431d2c9b6252e27737c26d99`. Its factory is not exposed by
Foundry's selected SDK. Its source is design evidence, not an installed SDK
interface or a qualified Foundry execution path. It is not vendored here.

The repository's `AGENTS.md` requires: “Use PrismPM only through the immutable
SDK image in `prismpm.lock`” and prohibits a “vendored, submodule, path, Git,
host-tool, or workflow-only implementation of SDK behavior.” Factory adoption
therefore requires a published immutable SDK containing the supported interface
and an exact template-policy update. That update must preserve complete `just vv`,
qualify receipt invalidation for every declared input and oracle, and distinguish
scheduling weights from acceptance authority.

Selected SDK:
`ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b47d7a370c4a26b8285f5e9c3bb15e639973c55505c3809ddbe55352fea58`.
The local pull failed with `no space left on device` in Docker storage. No local
image or reclaimable Docker cache remained. Host diagnostic verification uses a
different compiler and cannot replace locked acceptance. PR CI runs the existing
complete gate without bypasses or weakened requirements.

## Review disposition

Both feature PRs have documented author completeness reviews and mutation
evidence. Neither has independent approval or a completed product acceptance
claim. Keep them draft until their full acceptance results are assessed. No
publication, deployment, factory migration, or whole-application completion is
claimed by this ledger or by the specification's presence in the repository.

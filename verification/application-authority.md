# Application authority evidence

The specification is `app/src/FoundrySpecification.lex.tex`. Its obligation
constructors and `requirement` function define the application contract. They
are requirements, not whole-product completion claims. `FA-01` covers only
`admitAuthority` and its seven positive/negative source proof controls.

On 2026-11-11, `just new-capability FA-01` registered the claim and produced the
failing scenario test before implementation. The test failed with
`FA-01 is registered and not built`.

The source conformance test binds the exact control statements, empty axiom
policies and kernel import. A planted change made `missingProductOwner` assert
success for zero owners. `cargo test --locked -p repo-conformance --test
application_authority` rejected it with `weakened missingProductOwner`.
The source was restored and the test passed. This is a source-statement drift
check; it is not execution or proof evidence for the generated application.

An isolated diagnostic copy passed LexLean check and formatting with compiler
semantics `07859acb5a756221018b7f65e7f725d99b00a694670eecc7cd264832ba1333fb`.
That compiler differs from the repository lock, so this is not locked-SDK
acceptance. The repository lock and universal policy were not changed.

The local locked image pull failed with `no space left on device` in Docker
storage. Complete acceptance remains the unmodified `just vv` in the image
selected by `prismpm.lock`, including the actual Lean proof check. The source
register does not constitute a passing receipt for that gate.

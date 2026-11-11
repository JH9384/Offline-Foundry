# Cloud inference effects

FA-11 implements `FoundrySpecification.inferenceEffectsBoundary` and the typed
`InferenceEffectError` constructors. The generated Studio model retains request
encoding and route selection. The browser adapter now bounds the concrete cloud
transport, preserving OpenRouter and Featherless endpoint selection and the
bounded Featherless concurrency retry behavior.

Before this change, response-body reads had no deadline, cancellation during a
retry left listeners behind, malformed JSON frames were skipped, and partial
nonempty streams could become successful receipts. A single deadline now covers
fetch, body consumption and retries. Strict bounded UTF8 event parsing requires
valid deltas, usage, a stop/length finish and DONE before success. This is the
OpenAI streaming profile used by these routes, with LF or CRLF lines and blank
frame separators, not a claim of general EventSource implementation conformance.
Provider bodies and exceptions cannot become public error payloads.

Registration, scenario and a failing Rust test preceded implementation. Eight
Node tests exercise byte-split UTF8/CRLF, actual endpoint/header selection,
request bounds, credentials, HTTP failures, an abort-ignoring fetch, stalled
body reads, retry cancellation, late callbacks, malformed/incomplete/oversized
responses, consumer errors and successful retry. A VM test executes the actual
`paidGenerate` adapter from `inference.js` and checks delegation and receipt
construction. It does not contact providers or claim live-service qualification.

Cancellation ends local observation and asks fetch to abort; remote inference
already submitted may continue and incur charges. This feature does not complete
permission/disclosure governance, offline local-model qualification, or general
intent routing. Complete acceptance still requires the locked SDK and Studio
checks on the feature revision.

## Mutation and browser evidence

Removing the deadline race left an abort-ignoring transport unresolved and hit
the mutation harness's five-second process limit. Silently skipping malformed
JSON initially survived because the original negative fixture had no subsequent
valid answer. The strengthened fixture inserts malformed JSON before an otherwise
complete valid answer; that mutation now fails the full eight-test suite.
Removing the DONE requirement also fails that suite. All mutations were restored.

A real Chromium session sends synthetic requests to a local HTTP server through
the shipped adapter. Successful Unicode streaming passes; a stalled body times
out and a second request is cancelled after headers. The server observes both
connections close. CI runs this browser check with the locked renderer's
Playwright dependency. Callback promises are awaited, so asynchronous consumer
errors are typed and stream production respects consumer progress.

# Security

## Current controls

- local-first execution and browser persistence
- iframe `sandbox="allow-scripts"` without `allow-same-origin`
- `default-src 'none'`
- `connect-src 'none'`
- no frames, workers, objects, base URI, media, fonts or form actions
- blocked external script, HTML stylesheet, CSS `@import`, image, media, embedded-document, and object/embed dependencies are surfaced as structured `UNSAFE_NETWORK` evidence instead of being allowed to produce ordinary oracle PASS/FAIL results
- runtime CSP violations and navigation attempts are surfaced as deterministic unresolved evidence
- lexical loop guards injected into supported executable loops; unsupported unguarded forms are rejected before ordinary execution evidence
- host-side experiment timeout and bounded action/wait/oracle-delay budgets
- WebMCP schemas are bounded and do not expose arbitrary DOM execution or arbitrary remote-browser control
- stale revision rejection on state-changing operations

## Playwright capture boundary

`faultline.capture.v1` is an **ingestion artifact**, not permission for the hosted workbench to browse a URL.

- The Playwright adapter operates on a caller-owned `page`; navigation and authentication remain under the caller's test process.
- The adapter never uploads the page and the hosted workbench never fetches `capture.source.url`.
- HTML/CSS/JS are individually bounded to 1 MiB and the complete capture is bounded to 4 MiB.
- Unknown/noncanonical capture shapes are rejected before execution or persistence.
- External/inaccessible dependencies reported by the adapter cause deterministic `UNSUPPORTED_CAPTURE_DEPENDENCY` rejection.
- The human file picker validates before enabling verification and renders capture metadata through text content rather than HTML injection.
- `window.faultline.importCapture` and `faultline_import_capture` run the normalized candidate in the existing sandbox before canonical mutation. Only independently reproduced `FAIL` state can commit.
- A reproduced `PASS`, `UNRESOLVED`, stale revision, cancellation, validation failure or persistence failure leaves the previous canonical case/provenance recoverable.
- Capture provenance is metadata only. It is persisted/exported with the case but does not gain execution authority.

The current adapter snapshots already-authorized page DOM and readable stylesheet state. It does not reconstruct arbitrary application bundles, credentials, service workers, backend state, or hidden cross-origin dependencies. Caller-supplied deterministic JavaScript is required when the reproducer needs behavior not represented by the captured DOM/CSS alone.

## Known limits

This is not an operating-system sandbox. JavaScript that performs expensive work without a guardable loop—for example pathological recursion or a single extremely expensive native call—can still consume renderer time before the host timeout recovers. Unsupported execution syntax is converted to structured `UNRESOLVED` evidence rather than intentionally executed without containment.

The current JavaScript reducer is structural at statement granularity and is not a standards-complete parser. HTML/CSS scanners intentionally target self-contained reproducible cases rather than malformed adversarial language corpora.

A production service accepting untrusted third-party artifacts at scale should add process/VM isolation in addition to the browser sandbox. A future hosted remote-browser service, if ever introduced, would require a separate isolation/authentication/secrets design and is explicitly outside the current trust boundary.

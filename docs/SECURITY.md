# Security

## Current controls

- local-first execution and IndexedDB persistence
- iframe `sandbox="allow-scripts"` without `allow-same-origin`
- `default-src 'none'`
- `connect-src 'none'`
- no frames, workers, objects, base URI, media, fonts or form actions
- lexical loop guards injected into braced `while`, `for`, `for await`, and `do...while` loops while ignoring strings/comments; executable unbraced loops are rejected before execution
- host-side experiment timeout
- WebMCP schemas are bounded and do not expose arbitrary DOM execution
- stale revision rejection on state-changing operations

## Known limits

This is not an operating-system sandbox. JavaScript that performs expensive work without a loop (for example pathological recursion or a single extremely expensive native call) can still consume renderer time before the host timeout recovers. Unsupported loop syntax is converted to structured `UNRESOLVED` evidence rather than executed unguarded. The current JavaScript reducer is structural at statement granularity but is not a standards-complete parser. HTML/CSS scanners intentionally target self-contained reproducible cases rather than malformed adversarial language corpora.

A production service accepting untrusted third-party artifacts at scale should move execution into process/VM isolation in addition to the browser sandbox.

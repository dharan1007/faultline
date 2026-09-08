# AGENTS.md — FAULTLINE

## Product

FAULTLINE is a local-first deterministic browser-failure reducer. The production runtime executes bounded experiments against a configured oracle, supports semantic-unit probing/reduction, revision history, persistence, export and browser WebMCP integration.

## Canonical implementation

Treat `src/runtime.js`, `src/reducer-engine.js` and `src/sandbox-policy.js` as the production path. Do not infer shipped behavior from unused/legacy/experimental domain files.

## Non-negotiable invariants

- A committed reduction must preserve `FAIL` for the configured oracle.
- `UNRESOLVED` remains distinct from PASS/FAIL.
- Stale revisions cannot mutate newer canonical state.
- Probe is read-only with respect to canonical case state.
- Pinned units are protected from removal.
- Candidate code stays inside the documented sandbox/CSP boundary.
- Navigation, result-channel and export containment must not be weakened.
- WebMCP calls the canonical runtime and preserves cancellation/revision semantics.
- Minimality claims must match the exact candidate set/granularity tested by the production reducer.
- Do not invent benchmark/reduction numbers.

## Read first

1. `README.md`
2. `SECURITY.md`
3. `docs/SECURITY.md`
4. `src/reducer-engine.js`
5. `src/sandbox-policy.js`
6. `src/runtime.js`
7. `ROADMAP.md`

## Verification

```bash
npm install
npm test
npm run check
npm run build
```

For runtime/sandbox/WebMCP/browser changes:

```bash
npm run test:browser
```

## Change discipline

- Add the smallest synthetic regression case possible.
- Run negative/error paths for parser/reducer/oracle changes.
- Do not silently expand sandbox capabilities.
- Keep browser tests explicit; syntax checks do not prove browser behavior.
- Update README/security docs whenever the production trust or minimality boundary changes.
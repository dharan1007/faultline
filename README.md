# FAULTLINE

**Reduce a broken HTML/CSS/JavaScript page to a smaller standalone reproducer while preserving the failure you actually care about.**

FAULTLINE is a local-first causal debugging workbench. You load a deterministic web failure, define an oracle, probe removals, run bounded delta reduction, pin important units, inspect revision/evidence history, restore earlier states and export a standalone HTML reproducer.

[**Try FAULTLINE**](https://faultline-webmcp-tejs-projects-70bb4568.vercel.app/) · [Security](docs/SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

[![ci](https://github.com/dharan1007/faultline/actions/workflows/ci.yml/badge.svg)](https://github.com/dharan1007/faultline/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## The outcome

```text
large failing page
HTML + CSS + JS
      ↓
define deterministic failure oracle
      ↓
probe individual semantic units
      ↓
bounded ddmin reduction
      ↓
re-run the failure after every candidate change
      ↓
smaller source that still FAILS
      ↓
standalone reproducer + evidence/revision history
```

FAULTLINE does not ask an agent to click around the DOM until something looks fixed. The core unit is a **counterfactual experiment**: remove a bounded source unit, execute the case inside the sandbox, evaluate the configured oracle, and keep the change only when the failure remains.

## Why this exists

Browser failures are often buried inside much more code than is relevant to the bug. Manually deleting markup, CSS and JavaScript to build a minimal reproduction is slow and error-prone, especially when every deletion can accidentally change the failure itself.

FAULTLINE makes the preservation condition explicit.

| Debugging problem | FAULTLINE mechanism |
|---|---|
| "Does this code matter?" | Probe a unit without mutating canonical state |
| "Remove everything irrelevant" | Bounded ddmin reduction over semantic source units |
| "This piece must stay" | Pin the unit before reduction |
| "Did the failure change?" | Deterministic PASS / FAIL / UNRESOLVED oracle result |
| "Undo a bad reduction" | Revision snapshots and guarded restore |
| "Why was this kept/removed?" | Experiment/evidence ledger |
| "Give me a bug report" | Export a standalone HTML reproducer |
| "Let an agent help" | Native WebMCP tools use the same canonical runtime |

## Try the built-in case

Open the live workbench and use the built-in dialog/button case. The canonical case contains HTML, CSS, JavaScript and an oracle. You can:

1. run the baseline and confirm it returns `FAIL`,
2. inspect semantic units for HTML/CSS/JS,
3. probe a candidate removal,
4. pin a unit that must remain,
5. reduce one axis or run Autopilot across selected axes,
6. inspect the evidence/revision trail,
7. export the resulting standalone case.

No signup or hosted project workspace is required for the current product path.

## Current reduction semantics — precise claim

The production browser runtime currently imports `semanticUnits`, `removeUnits` and `ddminReduce` from `src/reducer-engine.js` and reduces **one source axis at a time**.

For a given axis, FAULTLINE:

1. extracts the current candidate semantic units,
2. protects pinned units,
3. verifies the baseline still fails,
4. repeatedly tests subsets within the configured trial budget,
5. commits the reduced source only after the final candidate still returns `FAIL`.

The resulting reduction is **1-minimal relative to the tested candidate-unit set and trial semantics**, not a proof of the globally shortest HTML/CSS/JavaScript program. The current scanners are deliberately bounded structural heuristics rather than standards-complete language parsers. This distinction matters and is part of the product contract.

A separate experimental/legacy domain implementation contains depth-aware frontier concepts, but the public production claim follows the runtime actually imported by `src/runtime.js`. Future hierarchical/AST-backed work must land in the canonical runtime and tests before it changes this claim.

## Failure oracles

The current runtime supports these oracle classes:

- `dom_property`
- `dom_exists`
- `computed_style`
- `runtime_error`

An optional click action can be part of the oracle before measurement. Results are always one of:

```text
PASS
FAIL
UNRESOLVED
```

`UNRESOLVED` is important: unsafe navigation, unsupported execution constructs, timeouts or inability to evaluate the oracle are not silently converted into PASS/FAIL.

## Browser containment boundary

Candidate code executes inside an iframe with:

```html
sandbox="allow-scripts"
```

and without `allow-same-origin`. The experiment document is protected by a restrictive CSP that disables network connections and other capability classes. FAULTLINE also detects/rejects navigation-risk cases and instruments supported loop forms with execution budgets.

This is **browser-side hostile-code containment, not a VM boundary**. Pathological recursion or expensive native operations can still consume renderer resources before the host timeout recovers. A service accepting arbitrary third-party artifacts at scale should add process/VM isolation.

Read [`docs/SECURITY.md`](docs/SECURITY.md) before treating the sandbox as a trust boundary.

## Local-first state and reproducibility

The workbench maintains canonical revisioned case state in the browser, including:

- source and oracle,
- pinned units,
- revision snapshots,
- bounded experiment/evidence history,
- IndexedDB/local persistence and recovery behavior.

State-changing operations use expected-revision checks so stale actions fail rather than overwriting a newer canonical case.

## WebMCP

FAULTLINE exposes its debugging operations through the browser's experimental `document.modelContext.registerTool()` API when available. The tool surface includes inspection, unit discovery, case loading/reset, run, cancellation, oracle/source changes, probe, reduction, pinning, revision/history operations, Autopilot and export behavior as defined by the canonical runtime.

Long-running WebMCP operations support cancellation. Agent tools call the same canonical workbench functions rather than a separate privileged debugging implementation.

WebMCP remains experimental; the human workbench remains usable without it.

## Run locally

```bash
git clone https://github.com/dharan1007/faultline.git
cd faultline
npm install
npm test
npm run check
npm run build
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/`.

The current application has no production runtime npm dependency; Playwright is a development dependency for real-browser verification.

## Verification

Fast repository contract:

```bash
npm test
npm run check
npm run build
```

Real browser/CDP gate:

```bash
npm run test:browser
```

Or against an HTTPS deployment:

```bash
FAULTLINE_E2E_URL=https://your-deployment.example npm run test:browser
```

The browser suite covers sandbox/navigation containment, WebMCP cancellation, oracle behavior, revision lineage, persistence, exports, UI contracts and other real-browser boundaries. A launch should not claim browser readiness from syntax/unit checks alone.

## Contributing

The highest-value contributions are reproducible browser failures, new oracle regression cases, source-unit/reducer improvements, sandbox tests and integrations that make it easier to turn real test failures into standalone reproducers.

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), [`good first issue`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

## Roadmap

See [`ROADMAP.md`](ROADMAP.md). The main technical direction is to improve semantic-unit quality, corpus/benchmark evidence and integration into real browser-test workflows before making stronger minimality claims.

## Related projects

- [PACT](https://github.com/dharan1007/pact) — transactional safety for consequential agent actions.
- [KATA](https://github.com/dharan1007/kata) — reusable deterministic research workflows.
- [SPOOL](https://github.com/dharan1007/spool) — deterministic local-first data migration.

## License

MIT — see [`LICENSE`](LICENSE).

If automatic browser-failure reduction would save you debugging time, star FAULTLINE to follow the project and help other web developers discover it.
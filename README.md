# FAULTLINE

**Reduce a broken HTML/CSS/JavaScript page to a smaller standalone reproducer while preserving the failure you actually care about.**

FAULTLINE is a local-first causal debugging workbench. You can load a deterministic web failure directly, or capture one beside a real Playwright test as a versioned `faultline.capture` artifact, then define/verify the oracle, probe removals, run bounded delta reduction, pin important units, inspect revision/evidence history, restore earlier states and export a standalone HTML reproducer.

[**Live workbench**](https://faultline-webmcp.vercel.app/) · [Run locally](#run-locally) · [Playwright capture](#capture-a-real-playwright-reproduction) · [Security](docs/SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

[![ci](https://github.com/dharan1007/faultline/actions/workflows/ci.yml/badge.svg)](https://github.com/dharan1007/faultline/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## The outcome

```text
real Playwright reproduction or complete FAULTLINE case
      ↓
versioned capture / canonical case load
      ↓
verify deterministic failure oracle
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

FAULTLINE makes the preservation condition explicit and now provides a concrete bridge from a real Playwright reproduction into the reducer instead of requiring users to paste four independent workbench inputs.

| Debugging problem | FAULTLINE mechanism |
|---|---|
| "Get my browser-test failure into the reducer" | Versioned Playwright capture artifact + atomic workbench import |
| "Does this code matter?" | Probe a unit without mutating canonical state |
| "Remove everything irrelevant" | Bounded ddmin reduction over semantic source units |
| "This piece must stay" | Pin the unit before reduction |
| "Did the failure change?" | Deterministic PASS / FAIL / UNRESOLVED oracle result |
| "Undo a bad reduction" | Revision snapshots and guarded restore |
| "Why was this kept/removed?" | Experiment/evidence ledger |
| "Give me a bug report" | Export a standalone HTML reproducer |
| "Let an agent help" | Native WebMCP tools use the same canonical runtime |

## Try the built-in case

Open the [public FAULTLINE workbench](https://faultline-webmcp.vercel.app/) or run it locally, then use the built-in dialog/button case. The canonical case contains HTML, CSS, JavaScript and an oracle. You can:

1. run the baseline and confirm it returns `FAIL`,
2. inspect semantic units for HTML/CSS/JS,
3. probe a candidate removal,
4. pin a unit that must remain,
5. reduce one axis or run Autopilot across selected axes,
6. inspect the evidence/revision trail,
7. export the resulting standalone case.

No signup or hosted project workspace is required for the current product path. The canonical Vercel production alias is promoted only after FAULTLINE's repository verification and exact-tree production check succeed.

## Capture a real Playwright reproduction

The production integration is deliberately local: capture runs beside your Playwright test with the same authority as that test. FAULTLINE does **not** operate a hosted arbitrary-URL crawler or a privileged remote browser service.

A capture artifact packages an exact FAULTLINE source/oracle case together with browser provenance from a real Chromium page: final URL, title, user agent, viewport, browser name and capture time. The browser provenance does not bypass FAULTLINE's safety or correctness checks. After import, the workbench still executes the case through the canonical sandbox and you must run the baseline again before reduction.

For a repository fixture or reproduction whose exact FAULTLINE case is already represented as JSON:

```bash
npm install
npx playwright install chromium
npm run capture -- \
  --url http://127.0.0.1:3000/repro \
  --case ./repro/faultline-case.json \
  --out ./artifacts/repro.faultline.json \
  --browser chromium
```

The resulting artifact has a strict versioned envelope:

```json
{
  "format": "faultline.capture",
  "version": 1,
  "capturedAt": "2026-09-09T00:00:00.000Z",
  "case": {
    "html": "<main>...</main>",
    "css": "...",
    "js": "...",
    "oracle": { "kind": "dom_exists", "selector": "#failure", "equals": true, "action": { "kind": "none" }, "delayMs": 0 }
  },
  "provenance": {
    "adapter": "faultline-playwright",
    "adapterVersion": 1,
    "url": "http://127.0.0.1:3000/repro",
    "title": "Reproduction",
    "userAgent": "...",
    "viewport": { "width": 1280, "height": 720 },
    "browser": "chromium"
  },
  "baseline": {
    "captured": true,
    "note": "Source and oracle captured from the Playwright test boundary; FAULTLINE re-verifies baseline after import."
  }
}
```

For an existing Playwright test, import the helper directly and generate the same artifact without shelling out to the CLI:

```js
import { captureFaultlineCase } from './playwright/faultline-capture.mjs';

await captureFaultlineCase({
  page,
  caseValue: {
    html,
    css,
    js,
    oracle
  },
  outputPath: './artifacts/checkout.faultline.json',
  browserName: 'chromium'
});
```

Then open **Import case or Playwright capture** in the workbench, select the artifact under **Playwright capture artifact**, and choose **Import capture atomically**. The artifact envelope is validated before any mutation, the contained case is committed through the same `expectedRevision`-guarded `window.faultline.loadCase` boundary as WebMCP, and capture provenance is shown in the UI. Wrong formats/versions, malformed metadata, invalid case axes or invalid JSON leave canonical state unchanged.

This integration intentionally does not pretend to reconstruct arbitrary bundled applications from network responses. Complex framework/module applications still need their reducible source case defined at the test/project boundary. That is a correctness constraint, not an omitted security bypass.

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

## Failure oracles and actions

The current runtime supports these oracle classes:

- `dom_property`
- `dom_attribute`
- `dom_exists`
- `computed_style`
- `runtime_error`

Pre-measurement actions include `none`, `click`, `set_value`, `set_checked`, and bounded `sequence` actions. A sequence may contain ordered click/value/checked steps plus bounded waits, with no nested sequences and a maximum declared wait budget of 2000 ms.

Results are always one of:

```text
PASS
FAIL
UNRESOLVED
```

`UNRESOLVED` is important: unsafe navigation/network behavior, unsupported execution constructs, timeouts, action-target failures or inability to evaluate the oracle are not silently converted into PASS/FAIL.

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

State-changing operations use expected-revision checks so stale actions fail rather than overwriting a newer canonical case. Playwright capture imports use this exact same mutation boundary.

## WebMCP

FAULTLINE exposes its debugging operations through the browser's experimental `document.modelContext.registerTool()` API when available. The tool surface includes inspection, unit discovery, case loading/reset, run, cancellation, oracle/source changes, probe, reduction, pinning, revision/history operations, Autopilot and export behavior as defined by the canonical runtime.

For a Playwright artifact, validate the envelope locally or with `window.faultlineCapture.validate(artifact)`, then pass `artifact.case` to the existing `faultline_load_case` tool with the current expected revision. FAULTLINE deliberately does not add a second privileged mutation path merely for capture files.

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

The current application has no production runtime npm dependency; Playwright is a development dependency for real-browser verification and local capture integration.

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

The browser suite covers sandbox/navigation/network containment, WebMCP cancellation, oracle behavior, revision lineage, persistence, exports, capture CLI/browser ingestion, UI contracts and other real-browser boundaries. A launch should not claim browser readiness from syntax/unit checks alone.

## Contributing

The highest-value contributions are reproducible browser failures, source-unit/reducer improvements, capture adapters, oracle regression cases, sandbox tests and integrations that make it easier to turn real test failures into standalone reproducers.

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), [`good first issue`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

## Roadmap

See [`ROADMAP.md`](ROADMAP.md). The next technical direction is stronger semantic-unit quality, broader browser-test recipes/corpus evidence and eventually cross-browser validation before making stronger minimality claims.

## Related projects

- [PACT](https://github.com/dharan1007/pact) — transactional safety for consequential agent actions.
- [KATA](https://github.com/dharan1007/kata) — reusable deterministic research workflows.
- [SPOOL](https://github.com/dharan1007/spool) — deterministic local-first data migration.

## License

MIT — see [`LICENSE`](LICENSE).

If automatic browser-failure reduction would save you debugging time, star FAULTLINE to follow the project and help other web developers discover it.

# FAULTLINE

**Capture a real browser failure, prove it reproduces in isolation, and reduce it to a smaller standalone HTML/CSS/JavaScript reproducer without changing the failure.**

FAULTLINE is a local-first causal debugging workbench. You can load a deterministic case directly or capture an already-authorized Playwright page into a portable `faultline.capture.v1` artifact, independently verify that the captured failure still returns `FAIL`, then probe removals, run bounded delta reduction, pin required units, inspect revision/evidence history, restore earlier states, and export a standalone reproducer with capture provenance.

[**Live Workbench**](https://faultline-webmcp.vercel.app/) · [Capture from Playwright](#capture-a-real-playwright-failure) · [Run locally](#run-locally) · [Security](docs/SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

[![ci](https://github.com/dharan1007/faultline/actions/workflows/ci.yml/badge.svg)](https://github.com/dharan1007/faultline/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## The outcome

```text
real app / dev server
        ↓
caller-owned Playwright page
        ↓
faultline.capture.v1
DOM + readable CSS + caller-supplied deterministic JS
+ oracle + environment + provenance
        ↓
FAULTLINE independently re-runs the captured case
        ↓
only a reproduced FAIL may enter canonical state
        ↓
probe / pin / bounded ddmin / Autopilot
        ↓
smaller source that still FAILS
        ↓
standalone reproducer + structured provenance + evidence history
```

You can still start from a hand-authored HTML/CSS/JavaScript case. Capture is an ingestion path into the same canonical runtime, not a separate reducer or a privileged execution mode.

FAULTLINE does not ask an agent to click around the DOM until something looks fixed. The core unit is a **counterfactual experiment**: remove a bounded source unit, execute the case inside the sandbox, evaluate the configured oracle, and keep the change only when the failure remains.

## Why this exists

Browser failures are often buried inside much more code than is relevant to the bug. Manually copying a live DOM, rebuilding enough CSS and JavaScript to reproduce it, and then deleting code one piece at a time is slow and error-prone. Every deletion can accidentally change the failure itself.

FAULTLINE makes both ingestion and preservation explicit.

| Debugging problem | FAULTLINE mechanism |
|---|---|
| "I already have a failing Playwright page" | Capture the caller-owned page into `faultline.capture.v1` |
| "Does the capture really reproduce?" | Transactional import independently executes the baseline before state can change |
| "Does this code matter?" | Probe a unit without mutating canonical state |
| "Remove everything irrelevant" | Bounded ddmin reduction over semantic source units |
| "This piece must stay" | Pin the unit before reduction |
| "Did the failure change?" | Deterministic PASS / FAIL / UNRESOLVED oracle result |
| "Undo a bad reduction" | Revision snapshots and guarded restore |
| "Where did this reproducer come from?" | Revision-bound capture provenance survives reduction, persistence, restore and structured export |
| "Give me a bug report" | Export a standalone HTML reproducer plus structured bundle |
| "Let an agent help" | Native WebMCP tools use the same canonical runtime |

## Capture a real Playwright failure

The capture adapter is deliberately local. It receives a Playwright `page` that **your test already owns**. It does not navigate to arbitrary URLs, start a hosted remote browser, upload source, or bypass FAULTLINE's execution boundary.

```js
import { captureFaultlineCase } from './integrations/playwright-capture/index.js';

await page.goto('http://127.0.0.1:3000/profile');

const capture = await captureFaultlineCase({
  page,
  js: `
    const input = document.querySelector('#name');
    const save = document.querySelector('#save');
    input.addEventListener('input', () => save.dataset.name = input.value);
    save.addEventListener('click', () => {
      save.setAttribute('aria-disabled', save.dataset.name === 'alice' ? 'true' : 'false');
    });
  `,
  oracle: {
    kind: 'dom_attribute',
    selector: '#save',
    property: 'aria-disabled',
    equals: 'true',
    action: {
      kind: 'sequence',
      steps: [
        { kind: 'set_value', selector: '#name', value: 'alice' },
        { kind: 'click', selector: '#save' }
      ]
    },
    delayMs: 0
  },
  provenance: {
    testTitle: 'save remains disabled after valid name',
    testFile: 'tests/profile.spec.mjs'
  },
  writeTo: 'save-disabled.faultline.json'
});
```

The adapter captures the current body DOM, readable stylesheet rules, page URL/title, browser/Playwright/viewport metadata, the supplied oracle and deterministic JavaScript, then validates the complete artifact against the same bounded capture contract used by the workbench.

The current v1 contract is intentionally strict:

- HTML, CSS and JavaScript are each limited to 1 MiB; the complete artifact is limited to 4 MiB.
- The hosted workbench never fetches `source.url` from the capture.
- Inaccessible or external dependencies are reported and rejected instead of silently producing a different page.
- Capture import must independently reproduce `FAIL`. A reproduced `PASS` becomes `CAPTURE_NOT_REPRODUCED`; an execution boundary or unsupported dependency becomes a deterministic rejection/`UNRESOLVED` path.
- Validation failure, stale revision, cancellation, non-reproduction and persistence failure must not replace the current canonical case.
- v1 does not reconstruct an arbitrary SPA bundle. If a captured failure depends on application JavaScript, provide the smallest deterministic JavaScript needed to reproduce the behavior or reduce that dependency before capture.

### Import the capture in the human workbench

Open the Case workspace and expand **Import Playwright capture**. Selecting a `.faultline.json` file only validates it and previews bounded metadata. It does not mutate the active case. **Verify & import** executes the candidate in FAULTLINE's isolated sandbox and commits it only if the configured oracle returns `FAIL`.

The summary and status controls use text-only rendering and an `aria-live` status region; metadata from the artifact is not injected as HTML.

### Browser API

```js
const current = window.faultline.inspect();

const result = await window.faultline.importCapture({
  expectedRevision: current.revision,
  capture
});

console.log(result.status);              // IMPORTED
console.log(result.baseline.status);     // FAIL
console.log(result.captureProvenance);   // bounded capture provenance
```

`importCapture()` supports the same AbortSignal-aware execution path used by cancellable WebMCP operations.

### WebMCP

The same operation is available as `faultline_import_capture`. It requires an `expectedRevision` and a bounded complete capture object; it does not accept a URL to fetch or a browser command to execute.

After reduction, `faultline_export` returns the standalone HTML and a structured `faultline.export.v1` bundle containing the canonical reduced case, capture provenance and bounded experiment history.

## Try the built-in case

Open the [public FAULTLINE workbench](https://faultline-webmcp.vercel.app/) or run it locally, then use the built-in dialog/button case. You can:

1. run the baseline and confirm it returns `FAIL`,
2. inspect semantic units for HTML/CSS/JS,
3. probe a candidate removal,
4. pin a unit that must remain,
5. reduce one axis or run Autopilot across selected axes,
6. inspect the evidence/revision trail,
7. export the resulting standalone case.

No signup or hosted project workspace is required for the current product path. The canonical Vercel production alias is promoted only after FAULTLINE's repository verification and exact-tree production check succeed.

## Current reduction semantics — precise claim

The production browser runtime imports `semanticUnits`, `removeUnits` and `ddminReduce` from `src/reducer-engine.js` and reduces **one source axis at a time**.

For a given axis, FAULTLINE:

1. extracts the current candidate semantic units,
2. protects pinned units,
3. verifies the baseline still fails,
4. repeatedly tests subsets within the configured trial budget,
5. commits the reduced source only after the final candidate still returns `FAIL`.

The resulting reduction is **1-minimal relative to the tested candidate-unit set and trial semantics**, not a proof of the globally shortest HTML/CSS/JavaScript program. The current scanners are deliberately bounded structural heuristics rather than standards-complete language parsers. This distinction is part of the product contract.

A separate experimental/legacy domain implementation contains depth-aware frontier concepts, but the public production claim follows the runtime actually imported by `src/runtime.js`. Future hierarchical/AST-backed work must land in the canonical runtime and tests before it changes this claim.

## Failure oracles and deterministic actions

The current runtime supports these oracle classes:

- `dom_property`
- `dom_attribute`
- `dom_exists`
- `computed_style`
- `runtime_error`

Oracle actions support `none`, `click`, `set_value`, `set_checked`, and bounded `sequence`. Sequence steps can include `click`, `set_value`, `set_checked`, and `wait`. Sequences contain at most eight steps and the total declared wait budget is at most 2000 ms. Oracle delay is also bounded to 2000 ms.

Results are always one of:

```text
PASS
FAIL
UNRESOLVED
```

`UNRESOLVED` is important: unsafe navigation/network behavior, unsupported execution constructs, timeouts, missing action targets, or inability to evaluate the oracle are not silently converted into PASS/FAIL.

## Browser containment boundary

Candidate code executes inside an iframe with:

```html
sandbox="allow-scripts"
```

and without `allow-same-origin`. The experiment document is protected by a restrictive CSP that disables network connections and other capability classes. FAULTLINE also surfaces blocked runtime CSP/network attempts and rejects known static navigation/network dependencies before ordinary PASS/FAIL evidence can be produced.

This is **browser-side hostile-code containment, not a VM boundary**. Pathological recursion or expensive native operations can still consume renderer resources before the host timeout recovers. A service accepting arbitrary third-party artifacts at scale should add process/VM isolation.

Read [`docs/SECURITY.md`](docs/SECURITY.md) before treating the sandbox as a trust boundary.

## Local-first state and reproducibility

The workbench maintains revisioned canonical state in the browser, including:

- source and oracle,
- pinned units,
- revision snapshots,
- bounded experiment/evidence history,
- revision-bound capture provenance when the case originated from a capture,
- local persistence and recovery behavior.

State-changing operations use expected-revision checks so stale actions fail rather than overwriting a newer canonical case. Manual complete-case loading intentionally clears capture provenance; restoring a capture-derived revision restores its associated provenance.

## WebMCP

FAULTLINE exposes its debugging operations through the browser's experimental `document.modelContext.registerTool()` API when available. The production surface contains 17 tools, including inspection, semantic-unit discovery, transactional capture import, case loading/reset, run, targeted cancellation, oracle/source changes, probe, reduction, pinning, revision/history operations, structured export and Autopilot.

Long-running WebMCP operations support cancellation. Agent tools call the same canonical workbench functions rather than a separate privileged debugging implementation. `faultline_import_capture` is transactional and revision-guarded just like the human and Browser API paths.

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

The hosted application has no production runtime npm dependency. Playwright is a development dependency used for real-browser verification and the local capture adapter.

## Verification

Fast repository contract:

```bash
npm test
npm run check
npm run build
```

Real browser/CDP gate, including Playwright capture adapter, transactional runtime import, accessible human import, and full capture → reduction → export acceptance:

```bash
npm run test:browser
```

The browser suite also covers sandbox/navigation/network containment, WebMCP cancellation, oracle behavior, revision lineage, persistence/recovery, exports, UI contracts and mobile/accessibility boundaries. A release should not claim browser readiness from syntax/unit checks alone.

## Contributing

The highest-value contributions are reproducible browser failures, capture fixtures, source-unit/reducer improvements, oracle regression cases, sandbox tests, and integrations that make real browser failures easier to turn into trustworthy standalone reproducers.

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), [`good first issue`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

## Roadmap

See [`ROADMAP.md`](ROADMAP.md). With Playwright capture ingestion in the production architecture, the next major technical direction is stronger semantic-unit quality, broader capture adapters/recipes, benchmark evidence and eventually cross-browser verification—without weakening deterministic failure preservation.

## Related projects

- [PACT](https://github.com/dharan1007/pact) — transactional safety for consequential agent actions.
- [KATA](https://github.com/dharan1007/kata) — reusable deterministic research workflows.
- [SPOOL](https://github.com/dharan1007/spool) — deterministic local-first data migration.

## License

MIT — see [`LICENSE`](LICENSE).

If automatic browser-failure reduction would save you debugging time, star FAULTLINE to follow the project and help other web developers discover it.

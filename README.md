# FAULTLINE

**Turn a real browser regression into a smaller standalone reproducer while preserving the failure you actually care about.**

FAULTLINE is a local-first causal debugging workbench. It can ingest a deterministic Playwright browser baseline, validate a versioned capture, replay the configured interaction/oracle inside its containment boundary, probe removals, run bounded delta reduction, pin important units, inspect revision/evidence history, restore earlier states and export a standalone HTML reproducer.

[**Live Demo**](https://faultline-webmcp.vercel.app/) · [Run locally](#run-locally) · [Playwright capture](#capture-a-real-playwright-failure) · [Security](docs/SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

[![ci](https://github.com/dharan1007/faultline/actions/workflows/ci.yml/badge.svg)](https://github.com/dharan1007/faultline/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## The outcome

```text
real Playwright page before failing interaction
      ↓
faultline.capture.v1
HTML + CSS + optional same-origin JS + oracle + provenance
      ↓
canonical guarded import
      ↓
replay deterministic failure
      ↓
probe individual semantic units
      ↓
bounded ddmin reduction
      ↓
smaller source that still FAILS
      ↓
standalone reproducer + evidence/revision history
```

FAULTLINE does not ask an agent to click around the DOM until something looks fixed. The core unit is a **counterfactual experiment**: remove a bounded source unit, execute the case inside the sandbox, evaluate the configured oracle, and keep the change only when the failure remains.

## Why this exists

Browser failures are often buried inside much more code than is relevant to the bug. Manually copying markup, styles, scripts and the exact interaction into a toy reproduction is itself a debugging task; then manually deleting code to minimize that reproduction is slow and error-prone.

FAULTLINE now addresses both boundaries: a Playwright-side capture producer creates an explicit versioned artifact from the real browser under test, and the existing reducer works only after that artifact has passed canonical validation.

| Debugging problem | FAULTLINE mechanism |
|---|---|
| "How do I get a real failing browser state into the tool?" | `faultline.capture.v1` Playwright capture + guarded import |
| "Does this code matter?" | Probe a unit without mutating canonical state |
| "Remove everything irrelevant" | Bounded ddmin reduction over semantic source units |
| "This piece must stay" | Pin the unit before reduction |
| "Did the failure change?" | Deterministic PASS / FAIL / UNRESOLVED oracle result |
| "Undo a bad reduction" | Revision snapshots and guarded restore |
| "Why was this kept/removed?" | Experiment/evidence ledger |
| "Give me a bug report" | Export a standalone HTML reproducer |
| "Let an agent help" | Native WebMCP tools use the same canonical runtime |

## Capture a real Playwright failure

The repository exports the integration from `integrations/playwright/index.mjs`.

For an existing Playwright test, capture the page **before** the interaction that exposes the regression. The capture stores the baseline source and the deterministic action/oracle FAULTLINE should replay:

```js
import { test as base, expect } from '@playwright/test';
import { createFaultlineTest } from './integrations/playwright/index.mjs';

const test = createFaultlineTest(base, {
  includeJavaScript: true
});

test('menu regression', async ({ page, faultline }) => {
  await page.goto('http://127.0.0.1:3000/menu');

  await faultline.arm({
    kind: 'dom_attribute',
    selector: '#menu',
    property: 'data-broken',
    equals: 'true',
    action: { kind: 'click', selector: '#trigger' },
    delayMs: 0
  });

  await page.locator('#trigger').click();
  await expect(page.locator('#menu')).toHaveAttribute('data-broken', 'false');
});
```

When an armed test ends unexpectedly, the fixture writes and attaches `faultline.capture.json`. You can also call `captureFaultlineBaseline(page, options)` directly when you want the artifact without the fixture lifecycle.

Open FAULTLINE and use **Import Playwright capture**, or import through Browser API/WebMCP:

```js
const current = window.faultline.inspect();
const loaded = await window.faultline.loadCapture({
  expectedRevision: current.revision,
  capture
});

const result = await window.faultline.run({
  expectedRevision: loaded.revision
});
```

The WebMCP equivalent is `faultline_load_capture`.

### Capture safety and fidelity

Capture executes in the developer's Playwright process. The hosted FAULTLINE application does **not** navigate to the captured URL and does not act as an arbitrary remote browser.

Accessible CSSOM rules are captured. Inline classic scripts can be captured; same-origin external classic JavaScript is opt-in through `includeJavaScript: true`. Cross-origin script bodies are not fetched. Module scripts, unreadable stylesheets, disabled JavaScript capture, failed resources and other unsupported dependencies are recorded in `diagnostics.omittedResources` rather than disappearing silently. Total captured executable source is bounded.

The artifact contains provenance such as URL, title, capture time, viewport, user agent and optional Playwright test metadata, but the executable canonical FAULTLINE case remains exactly `{html, css, js, oracle}`. Importing a capture therefore does not bypass the existing sandbox, CSP, oracle validation or revision controls.

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

The production browser runtime currently imports `semanticUnits`, `removeUnits` and `ddminReduce` from `src/reducer-engine.js` and reduces **one source axis at a time**.

For a given axis, FAULTLINE:

1. extracts the current candidate semantic units,
2. protects pinned units,
3. verifies the baseline still fails,
4. repeatedly tests subsets within the configured trial budget,
5. commits the reduced source only after the final candidate still returns `FAIL`.

The resulting reduction is **1-minimal relative to the tested candidate-unit set and trial semantics**, not a proof of the globally shortest HTML/CSS/JavaScript program. The current scanners are deliberately bounded structural heuristics rather than standards-complete language parsers. This distinction matters and is part of the product contract.

## Failure oracles

The runtime supports:

- `dom_property`
- `dom_attribute`
- `dom_exists`
- `computed_style`
- `runtime_error`

Before measurement, an oracle can perform `none`, `click`, `set_value`, `set_checked`, or a bounded 1–8 step `sequence` containing those interactive actions plus bounded `wait` steps. Results are always one of:

```text
PASS
FAIL
UNRESOLVED
```

`UNRESOLVED` is important: unsafe navigation/network behavior, unsupported execution constructs, timeouts, missing action targets or inability to evaluate the oracle are not silently converted into PASS/FAIL.

## Browser containment boundary

Candidate code executes inside an iframe with:

```html
sandbox="allow-scripts"
```

and without `allow-same-origin`. The experiment document is protected by a restrictive CSP that disables network connections and other capability classes. FAULTLINE also detects/rejects navigation-risk cases and instruments supported loop forms with execution budgets.

This is **browser-side hostile-code containment, not a VM boundary**. Pathological recursion or expensive native operations can still consume renderer resources before the host timeout recovers. A service accepting arbitrary third-party artifacts at scale should add process/VM isolation.

Read [`docs/SECURITY.md`](docs/SECURITY.md) before treating the sandbox as a trust boundary.

## Local-first state and reproducibility

The workbench maintains canonical revisioned case state in the browser, including source/oracle, pinned units, revision snapshots, and bounded experiment/evidence history. State-changing operations use expected-revision checks so stale actions fail rather than overwriting a newer canonical case.

## WebMCP

FAULTLINE exposes causal debugging operations through the browser's experimental `document.modelContext.registerTool()` API when available. The production UI exposes 17 tools, including `faultline_load_capture`, inspection, semantic-unit discovery, canonical case loading/reset, run/cancellation, oracle/source changes, probe/reduction, pinning, revision/history operations, Autopilot and export.

Long-running WebMCP operations support cancellation. Agent tools call the same canonical workbench functions rather than a separate privileged debugging implementation. WebMCP remains experimental; the human workbench remains usable without it. See [`docs/WEBMCP.md`](docs/WEBMCP.md) for the exact contract.

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

The web application has no production runtime npm dependency; Playwright is a development dependency for real-browser verification and the repository-side capture integration.

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

The CI and guarded production deployment also execute the dedicated real Playwright capture-ingestion acceptance before the full browser suite. A release must not claim browser/capture readiness from syntax or unit tests alone.

## Contributing

The highest-value contributions are reproducible browser failures, capture fidelity cases, source-unit/reducer improvements, oracle regression cases, sandbox tests and integrations that make real failures easier to reduce safely.

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), [`good first issue`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

## Roadmap

See [`ROADMAP.md`](ROADMAP.md). The next technical priorities are stronger semantic-unit quality, a reproducible browser-failure benchmark corpus, capture fidelity for more application architectures, and stronger isolation where the deployment model requires it.

## Related projects

- [PACT](https://github.com/dharan1007/pact) — transactional safety for consequential agent actions.
- [KATA](https://github.com/dharan1007/kata) — reusable deterministic research workflows.
- [SPOOL](https://github.com/dharan1007/spool) — deterministic local-first data migration.

## License

MIT — see [`LICENSE`](LICENSE).
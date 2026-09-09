# Playwright Failure Capture Pipeline Design

## Purpose

FAULTLINE currently starts after a user or agent has manually assembled a deterministic `{html, css, js, oracle}` case. That leaves the highest-friction production step outside the product: converting a real browser-test failure into a safe, importable FAULTLINE case. This design adds a bounded Playwright capture pipeline that produces a versioned capture artifact, imports it atomically through the same canonical runtime used by the UI and WebMCP, and preserves provenance/evidence without weakening FAULTLINE's sandbox or reduction semantics.

## Scope

This increment adds one coherent workflow:

`real Playwright page before failing interaction -> arm capture -> failing test -> faultline.capture.v1 artifact -> human/WebMCP import -> deterministic baseline run -> existing probe/reduce/autopilot/export`

It does not add arbitrary remote browser control, hosted browser execution, cross-origin resource scraping, or claims that every framework application can be reconstructed perfectly. When a resource cannot be safely or deterministically captured, the artifact records that omission explicitly.

## Capture artifact

The stable wire format is `faultline.capture.v1`:

```json
{
  "schema": "faultline.capture.v1",
  "case": {
    "html": "...",
    "css": "...",
    "js": "...",
    "oracle": { "kind": "...", "action": { "kind": "..." } }
  },
  "provenance": {
    "url": "http://127.0.0.1:3000/example",
    "title": "Example",
    "capturedAt": "2026-09-09T00:00:00.000Z",
    "viewport": { "width": 1280, "height": 720 },
    "userAgent": "...",
    "playwright": { "projectName": "chromium", "testTitle": "..." }
  },
  "diagnostics": {
    "omittedResources": [],
    "capturedScripts": [],
    "capturedStylesheets": []
  }
}
```

The canonical FAULTLINE case remains exactly four fields. Provenance and diagnostics are not executable inputs and are never injected into the sandbox. Import stores only a bounded provenance summary in the evidence ledger.

## Playwright integration

Create `integrations/playwright/index.mjs` with two public APIs:

- `captureFaultlineBaseline(page, { oracle, testInfo?, includeJavaScript? })` captures the current page before the interaction that is expected to expose the failure.
- `createFaultlineTest(baseTest, options?)` returns an extended Playwright test with a `faultline` fixture exposing `await faultline.arm(oracle, options?)`. The fixture retains the armed baseline and, when the test finishes unexpectedly, writes `faultline.capture.json` into the test output directory and attaches the same JSON to Playwright test results.

Arming before the failing interaction is critical. It preserves the baseline source while keeping the supplied deterministic action/oracle available for FAULTLINE to replay.

The capture implementation serializes the body DOM after removing executable/resource-loading elements that would duplicate separately captured source (`script`, stylesheet links, `base`, refresh metadata). It reads same-origin CSSOM rules where accessible. Inline scripts are captured; same-origin external scripts may be fetched through Playwright's authenticated request context when `includeJavaScript` is enabled. Cross-origin, unreadable, oversized, failed, or otherwise unsupported resources are never silently ignored: they are listed in `diagnostics.omittedResources`.

The default is `includeJavaScript: false` for snapshot/state failures. For action-driven or runtime-error reproductions callers can opt in. A bounded total-source size protects the workbench from accidentally ingesting multi-megabyte bundles without explicit evidence.

## Canonical import

Create `src/capture-format.js` as the shared format validator/normalizer. It rejects unknown schema versions, malformed cases, malformed provenance, non-array diagnostics, and artifacts above the defined source-size limit.

`src/runtime.js` gains `loadCapture({ expectedRevision, capture })`. Import is atomic and revision-guarded like `loadCase`: validate capture, validate its canonical case, clear incompatible pins, commit one new revision, append one `capture_import` evidence record, persist, rerender, and return the new canonical state plus a bounded capture summary. Invalid captures leave state unchanged.

Expose the same operation as `window.faultline.loadCapture` and WebMCP tool `faultline_load_capture`. The WebMCP schema must explicitly advertise `faultline.capture.v1`; the tool receives untrusted content and cannot bypass canonical validation.

## Human workflow

`src/ui.js` adds a first-class “Import Playwright capture” panel beside the existing complete-case JSON import. It supports both a JSON file picker and pasted JSON, uses the canonical `window.faultline.loadCapture` API, reports validation failures through the existing health/evidence UI, and displays the captured URL/test title after success. Keyboard labels, file-input labeling, status announcements, and mobile layout use existing accessible workbench patterns.

The Integrate panel is updated at runtime to show the Playwright path before raw browser/WebMCP calls.

## Determinism and security

Capture never causes FAULTLINE production to browse an arbitrary URL. Browser access happens in the user's Playwright process. Production only imports JSON data and then executes the canonical case inside FAULTLINE's existing sandbox/CSP boundary.

Cross-origin resource bodies are not fetched by the integration. Same-origin script capture is opt-in and bounded. Omitted resources are evidence, not hidden failure. The capture artifact is treated as untrusted content by WebMCP.

## Acceptance tests

A real Chromium integration test must start a local target site, arm a capture before a failing action, produce a `faultline.capture.v1` artifact, import it into the FAULTLINE workbench, and prove the canonical oracle returns `FAIL`. The test must also prove:

- provenance and diagnostics survive capture but are not injected into the executable case;
- stale-revision capture imports fail atomically;
- malformed/unknown-version captures do not mutate state;
- the WebMCP manifest advertises `faultline_load_capture` with the versioned schema;
- the human file/paste import path loads the same canonical case;
- the existing full deterministic and browser suites stay green.

## Deployment

Only the existing `faultline-webmcp` Vercel project may be used. Promotion remains gated by the repository's exact-tree deployment workflow. `main` is advanced only by non-force fast-forward after the isolated candidate is green, and `production` remains the recoverable verified checkpoint moved only after public artifact parity succeeds.
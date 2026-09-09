# FAULTLINE Playwright Capture v1 — Design

Date: 2026-09-09
Status: Proposed for implementation
Baseline: `c56678a444b452ab023645af1bef4ba75d6ab745`

## 1. Problem

FAULTLINE's production reducer is already strong once a complete deterministic `{html, css, js, oracle}` case exists. The missing production capability is ingestion: real developers usually start from a failing Playwright/browser test, a page state, or a CI failure, not a hand-authored standalone reproducer.

The current UI and WebMCP flow both begin after that difficult conversion work has already been done. This creates the largest remaining product gap: FAULTLINE minimizes failures but does not yet acquire them from realistic browser workflows.

This design adds a local Playwright capture adapter and a transactional capture-import path that converts an observed browser failure into the existing canonical reducer case format without weakening FAULTLINE's sandbox, revision, or determinism guarantees.

## 2. Goals

The v1 subsystem must:

1. Capture a deterministic failure from a real Playwright page running against a local app/dev server or test fixture.
2. Produce a versioned portable `faultline.capture.v1` JSON artifact.
3. Normalize that artifact into the existing canonical FAULTLINE case model.
4. Verify the normalized baseline inside FAULTLINE before committing it to canonical state.
5. Refuse unsupported/non-self-contained captures with precise structured reasons instead of fabricating PASS/FAIL.
6. Expose the same import capability to the human workbench, browser API, and WebMCP.
7. Preserve provenance from original page/test/capture through reduction and export.
8. Keep production local-first; no hosted arbitrary-browser execution service is introduced.
9. Keep the existing reducer, sandbox, revision store, cancellation semantics, and exact-tree deployment gates authoritative.

## 3. Non-goals

v1 will not:

- crawl arbitrary remote websites from Vercel;
- bypass authentication, CSP, CORS, or application access controls;
- reproduce arbitrary server/API state;
- capture service-worker state, browser extensions, cross-origin frames, downloads, WebRTC, WebSockets, or long-lived streaming dependencies;
- guarantee standards-complete CSS or JavaScript dependency extraction;
- claim that every Playwright test can be converted;
- weaken the current iframe sandbox to make an unsupported capture execute;
- silently fall back to a different oracle if the original assertion cannot be represented;
- introduce a second hosted FAULTLINE backend or Vercel project.

## 4. Chosen architecture

### 4.1 Topology

```text
real app / local fixture
        |
        v
Playwright page + failing assertion
        |
        v
capture adapter (Node, local/CI)
        |
        +-- DOM snapshot
        +-- deterministic CSS payload
        +-- bounded interaction trace
        +-- assertion/oracle descriptor
        +-- page + browser metadata
        +-- dependency diagnostics
        |
        v
faultline.capture.v1 artifact
        |
        v
FAULTLINE capture validator/normalizer
        |
        +-- schema validation
        +-- capability validation
        +-- self-contained dependency checks
        +-- action/oracle normalization
        +-- sandbox policy preflight
        |
        v
baseline execution in canonical sandbox
        |
        +-- FAIL -> atomic commit
        +-- PASS -> CAPTURE_NOT_REPRODUCED
        +-- UNRESOLVED -> structured capture rejection
        |
        v
existing canonical case + reducer
        |
        v
reduced reproducer + provenance
```

### 4.2 Why a local adapter

A browser-only URL importer cannot reliably inspect cross-origin pages, authenticated state, bundled resources, or test actions. A hosted remote-browser service would create a new arbitrary-code/network execution boundary, credentials surface, compute cost, and operational subsystem. The local Playwright adapter uses the developer's existing authorized environment and sends only the resulting bounded artifact into FAULTLINE.

The adapter therefore belongs in the repository as a Node/Playwright integration package/script, not inside the hosted Vercel runtime.

## 5. Capture artifact contract

The top-level versioned artifact is:

```json
{
  "schema": "faultline.capture.v1",
  "capturedAt": "2026-09-09T00:00:00.000Z",
  "source": {
    "url": "http://127.0.0.1:4173/profile",
    "title": "Profile",
    "html": "<main>...</main>",
    "css": "...",
    "js": "..."
  },
  "oracle": {
    "kind": "dom_attribute",
    "selector": "#save",
    "property": "aria-disabled",
    "equals": "false",
    "action": {
      "kind": "sequence",
      "steps": [
        {"kind": "set_value", "selector": "#name", "value": "alice"},
        {"kind": "click", "selector": "#save"}
      ]
    },
    "delayMs": 0
  },
  "environment": {
    "browser": "chromium",
    "playwrightVersion": "1.55.0",
    "viewport": {"width": 1280, "height": 720}
  },
  "provenance": {
    "adapter": "@faultline/playwright-capture",
    "testTitle": "profile enables save after name entry",
    "testFile": "tests/profile.spec.ts"
  },
  "diagnostics": {
    "externalDependencies": [],
    "consoleErrors": [],
    "pageErrors": []
  }
}
```

### 5.1 Required fields

Required: `schema`, `source.html`, `source.css`, `source.js`, `oracle`, and `provenance.adapter`.

`source.url`, environment metadata, test identifiers, timestamps, console/page errors, and diagnostic lists are optional metadata. They must never affect oracle truth unless explicitly represented by the oracle itself.

### 5.2 Size and count bounds

The runtime validator will reject captures above explicit limits to avoid unbounded localStorage, WebMCP payload, and browser execution costs. Initial bounds:

- HTML: 1 MiB
- CSS: 1 MiB
- JS: 1 MiB
- total capture JSON: 4 MiB at human/browser import boundary
- action sequence: existing 1–8 step limit
- total action wait: existing 2000 ms limit
- oracle delay: existing 2000 ms limit
- diagnostics entries: max 200 per class, strings truncated to bounded lengths

The Node adapter should fail earlier with the same conceptual limits when practical.

## 6. Playwright capture API

The repository will expose a small local API rather than requiring consumers to know FAULTLINE internals.

```js
import { captureFaultlineCase } from './integrations/playwright-capture/index.js';

const capture = await captureFaultlineCase({
  page,
  oracle: {
    kind: 'dom_attribute',
    selector: '#save',
    property: 'aria-disabled',
    equals: 'false',
    action: {
      kind: 'sequence',
      steps: [
        {kind: 'set_value', selector: '#name', value: 'alice'},
        {kind: 'click', selector: '#save'}
      ]
    }
  },
  provenance: {
    testTitle: 'profile enables save after name entry',
    testFile: 'tests/profile.spec.mjs'
  }
});
```

The adapter returns the artifact and can optionally write it to a path supplied by the caller. It never uploads automatically.

### 6.1 Capture strategy

For v1, the adapter captures the current same-origin DOM using `document.documentElement`/body content after the caller has navigated and prepared the page. CSS is collected from accessible same-origin stylesheets and inline style elements. Cross-origin stylesheet access failures are recorded as external dependency diagnostics and cause deterministic rejection unless the resulting snapshot is self-contained without them.

JavaScript capture is deliberately conservative. The adapter does not pretend to reconstruct an application's original bundled source from runtime state. v1 supports two deterministic modes:

1. `js` supplied explicitly by the caller for fixture/component cases; or
2. `js: ''` when the captured DOM state plus configured actions/oracle reproduce without application code.

A future bundle-resource recorder can extend this contract after separate security and determinism review. This prevents v1 from claiming arbitrary SPA capture it cannot faithfully reproduce.

## 7. Oracle and interaction mapping

v1 reuses the current canonical oracle and action contracts rather than creating a second execution language.

Supported oracle kinds:

- `dom_property`
- `dom_attribute`
- `computed_style`
- `dom_exists`
- `runtime_error`

Supported actions:

- `none`
- `click`
- `set_value`
- `set_checked`
- `sequence`
- sequence-only `wait`

The adapter must validate these through a shared or behaviorally identical validator. Unsupported Playwright operations (drag-and-drop, file chooser, keyboard chords, multi-page flows, arbitrary evaluate calls, downloads) are rejected as `UNSUPPORTED_CAPTURE_ACTION` rather than translated approximately.

## 8. Transactional import flow

Capture import is intentionally stricter than the existing raw case loader.

```text
parse capture
  -> validate capture schema
  -> validate source/oracle/action bounds
  -> normalize to canonical case
  -> run sandbox/network/navigation policy preflight
  -> execute normalized baseline without mutation
  -> require result.status === FAIL
  -> assert expectedRevision again
  -> commit canonical case + provenance atomically
  -> persist or rollback
```

If baseline is PASS, return `CAPTURE_NOT_REPRODUCED`.

If baseline is UNRESOLVED, return `CAPTURE_UNRESOLVED` with the underlying evidence reason.

If the caller's expected revision changed while baseline verification ran, return `STALE_REVISION` and make no mutation.

Persistence failure rolls back the complete canonical state exactly as other mutations do.

## 9. Canonical state and provenance

The canonical reducer case remains exactly `{html, css, js, oracle}` so reducer semantics do not become capture-specific.

Capture metadata lives beside the case as bounded provenance state:

```js
captureProvenance = {
  schema: 'faultline.capture.v1',
  capturedAt,
  sourceUrl,
  environment,
  provenance,
  diagnosticsSummary,
  importedAt,
  importedRevision
}
```

It is revision-bound, persisted with the same rollback discipline, restored with revisions where applicable, returned by `inspect()`, and attached to export metadata. Reducer execution never consults provenance when determining PASS/FAIL.

## 10. Runtime/browser API surface

Add one canonical operation:

```js
await window.faultline.importCapture({
  expectedRevision,
  capture
})
```

Result on success:

```json
{
  "status": "IMPORTED",
  "revision": "rN",
  "baseline": {"status": "FAIL", "evidence": {}},
  "capture": {"schema": "faultline.capture.v1", "sourceUrl": "..."}
}
```

The existing `loadCase` remains available for expert/manual deterministic cases.

## 11. WebMCP surface

Register `faultline_import_capture` using the canonical runtime operation. The schema must be bounded and explicit; it must not accept a URL to fetch, arbitrary browser commands, or raw executable host callbacks.

The tool requires `expectedRevision` and a complete `capture` object. Cancellation must abort baseline verification and leave canonical state untouched. The result uses normal native result serialization and must include the tested/imported revision.

No separate WebMCP implementation is allowed.

## 12. Human workbench surface

The existing Case workspace gains a production ingestion affordance, not a cosmetic redesign:

- `Import capture` file button accepting `.json` / `.faultline.json`;
- accessible hidden file input with explicit label;
- pre-import summary showing schema, source URL/test title when present, source sizes, oracle kind, and dependency diagnostics;
- explicit `Verify & import` action;
- status region announcing validation/baseline/import outcome;
- raw canonical case editing remains available after import;
- failed import leaves the currently loaded case unchanged.

Keyboard operation and mobile overflow behavior are included in browser tests.

## 13. Export contract

Keep the current standalone HTML export for immediate reproduction, and add a structured export bundle object through Browser/WebMCP API:

```json
{
  "schema": "faultline.export.v1",
  "case": {"html":"...","css":"...","js":"...","oracle":{}},
  "standaloneHtml": "<!doctype html>...",
  "captureProvenance": {},
  "reduction": {
    "revision": "rN",
    "history": []
  }
}
```

The human download may remain HTML in v1, but the capture provenance must be available through API/WebMCP export. If a JSON download is added, it must be a second explicit export choice rather than changing existing HTML behavior silently.

## 14. Error taxonomy

Capture-specific deterministic errors:

- `INVALID_CAPTURE`
- `UNSUPPORTED_CAPTURE_SCHEMA`
- `CAPTURE_TOO_LARGE`
- `UNSUPPORTED_CAPTURE_ACTION`
- `UNSUPPORTED_CAPTURE_DEPENDENCY`
- `CAPTURE_NOT_REPRODUCED`
- `CAPTURE_UNRESOLVED`
- existing `INVALID_ORACLE`
- existing stale revision error
- existing `PERSISTENCE_FAILED`
- cancellation as `AbortError`

Errors must not include unbounded captured source text.

## 15. Security and trust boundary

The capture adapter runs in the developer/CI environment with the same authority as their Playwright test. FAULTLINE production does not gain remote browsing authority.

The imported candidate still executes only inside the existing sandbox/CSP boundary. Capture import cannot bypass `navigationRisk`, runtime CSP violation evidence, host timeout, action limits, or result-channel isolation.

External dependencies discovered during capture are metadata and rejection signals; FAULTLINE must not fetch them from the hosted app.

Source URL and test metadata are treated as untrusted display strings and escaped in the UI. Capture JSON is never injected as HTML.

## 16. TDD acceptance plan

### 16.1 Primary end-to-end fixture

Create a real local fixture app served during the browser test. The page contains a form whose failing state is reproducible after a `set_value` + `click` sequence. The test captures the page through the Playwright adapter, produces `faultline.capture.v1`, imports it into the FAULTLINE workbench, proves baseline `FAIL`, runs reduction, and confirms the reduced case still returns `FAIL`.

The acceptance chain must be real:

```text
fixture HTTP server
 -> Playwright page
 -> capture adapter
 -> capture JSON
 -> browser workbench import
 -> sandbox baseline FAIL
 -> reducer/autopilot
 -> reduced FAIL
 -> export + provenance
```

### 16.2 RED requirement

Before implementation, a permanent browser regression must fail because current production lacks `faultline_import_capture` / capture ingestion. Existing test suites must remain green up to that new assertion.

### 16.3 Negative cases

Tests must prove:

1. malformed schema leaves canonical state unchanged;
2. unsupported schema version is rejected;
3. oversized payload is rejected before execution;
4. unsupported action is rejected;
5. external dependency capture returns structured rejection;
6. normalized baseline PASS returns `CAPTURE_NOT_REPRODUCED` and no mutation;
7. baseline UNRESOLVED returns `CAPTURE_UNRESOLVED` and no mutation;
8. revision changes during verification cause stale-revision failure and no mutation;
9. cancellation during verification leaves no active operation and no mutation;
10. persistence failure rolls back imported case and provenance;
11. hostile display metadata is escaped in the human UI;
12. keyboard-only import flow is operable;
13. narrow/mobile viewport does not create horizontal overflow;
14. export retains provenance after reduction;
15. ordinary manual `loadCase` behavior remains unchanged.

## 17. Repository boundaries

Expected implementation areas:

- `integrations/playwright-capture/index.js` — local adapter
- `src/capture-contract.js` — pure capture schema validation/normalization helpers
- `src/runtime.js` — canonical transactional import + provenance state + WebMCP registration
- `src/ui.js` and `index.html` — human import surface/status
- `tests/fixtures/capture-app.*` — local browser fixture
- `tests/playwright-capture-ingestion.mjs` — end-to-end capture/import/reduce/export acceptance
- focused unit tests for pure capture validation
- `package.json` — check/test wiring
- README/ROADMAP/security docs — accurate capability/trust-boundary description

`src/reducer-engine.js` and `src/sandbox-policy.js` should not change unless a failing capture acceptance proves a real requirement.

## 18. Deployment gate

Production promotion follows the existing exact-tree workflow only:

1. branch RED test proves missing capability;
2. implementation turns the new acceptance green;
3. `npm test`;
4. `npm run check`;
5. `npm run build`;
6. `npm run test:browser` with Chromium;
7. re-read `main` and ensure candidate is a strict fast-forward from the verified production base;
8. non-force update of `main` only if green;
9. guarded production workflow re-runs the complete suite from immutable SHA;
10. deploy only to existing Vercel project `faultline-webmcp` / `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM` under `team_APBZJjf6iizHCTuseqHosFnU`;
11. stage without moving public alias;
12. byte-compare deployed static artifacts with the verified source;
13. promote only after parity;
14. verify public alias and exact Git SHA;
15. advance recoverable `production` branch checkpoint only after public parity.

If any gate fails, leave production and the recoverable checkpoint unchanged.

## 19. Success criterion

The feature is complete only when a developer can take a real deterministic Playwright fixture failure and, without manually constructing FAULTLINE's HTML/CSS/JS case by hand, generate a portable capture artifact, import it through either the human UI or WebMCP, have FAULTLINE independently reproduce the same failure, reduce it, and export the smaller reproducer with provenance intact.

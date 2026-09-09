# Playwright Capture Pipeline Design

## Goal

Turn a real, locally reachable browser failure into a versioned FAULTLINE artifact that can be imported transactionally, re-verified as `FAIL`, reduced by the canonical engine, and exported with provenance. This removes the current requirement that users manually reconstruct HTML/CSS/JavaScript before FAULTLINE becomes useful.

## Scope

The first production capture mode is `snapshot`. A Playwright adapter may navigate to a page, execute a bounded sequence of `click`, `set_value`, `set_checked`, and `wait` actions, then capture the resulting DOM and readable stylesheet rules. The resulting FAULTLINE case uses the final browser state, so its oracle action is normalized to `none` and JavaScript is empty. This mode is for DOM/attribute/property/computed-style failures whose final state is self-contained.

This version does not claim to reconstruct arbitrary framework JavaScript, authenticated backend behavior, cross-origin stylesheet contents, service-worker state, or runtime-error causality. Unsupported or incomplete captures fail explicitly rather than being imported as misleading PASS/FAIL cases.

## Artifact contract

A capture is JSON with exact top-level fields:

```json
{
  "format": "faultline.capture.v1",
  "mode": "snapshot",
  "capturedAt": "2026-09-09T00:00:00.000Z",
  "provenance": {
    "url": "http://127.0.0.1:4173/",
    "title": "Example",
    "browser": "chromium",
    "viewport": { "width": 1280, "height": 720 },
    "actions": []
  },
  "unresolvedResources": [],
  "case": {
    "html": "<main>...</main>",
    "css": "main{...}",
    "js": "",
    "oracle": {
      "kind": "dom_exists",
      "selector": "main",
      "equals": true,
      "action": { "kind": "none" },
      "delayMs": 0
    }
  }
}
```

`format` and `mode` are fixed for v1. `capturedAt` must be a valid ISO timestamp. `unresolvedResources` is always present. Snapshot captures with any unresolved resource are rejected by FAULTLINE before canonical mutation. `provenance.actions` records the Playwright pre-capture actions for reproducibility and audit, but those actions are already reflected in the captured final DOM state and are not replayed inside FAULTLINE.

## Playwright adapter

`scripts/capture-playwright.mjs` is a local CLI. It accepts a JSON config file containing `url`, `oracle`, optional `actions`, optional `viewport`, and `output` path. It launches Chromium, navigates to the page, executes only the bounded action kinds already supported by FAULTLINE, captures the final body DOM with executable `<script>` elements removed, serializes readable CSS rules, records any inaccessible stylesheet URLs, normalizes the oracle action to `none`, validates that snapshot mode is compatible with the oracle, and writes `faultline.capture.v1` JSON.

The adapter rejects `runtime_error` in snapshot mode because a final DOM snapshot cannot truthfully preserve runtime-error causality. It also rejects malformed selectors/actions and waits beyond the existing FAULTLINE 2000 ms aggregate wait budget.

## Runtime ingestion

The canonical runtime gains `importCapture({ expectedRevision, capture })`. Ingestion order is strict:

1. validate outer capture schema,
2. reject unresolved resources,
3. validate the embedded FAULTLINE case/oracle,
4. assert the optimistic revision,
5. execute the candidate with the canonical sandbox,
6. require baseline status exactly `FAIL`,
7. atomically commit the case and capture provenance,
8. persist the mutation and render the new canonical state.

Any failure before step 7 leaves canonical case, pins, provenance, revisions, and persisted state unchanged. A reproducible capture advances exactly one canonical revision.

## Provenance and recovery

Capture provenance is canonical metadata independent from the four-field FAULTLINE case. It is persisted with browser state, included in runtime revision snapshots, restored with prior revisions, exposed by `inspect()`, and retained through source edits/reduction so the minimized reproducer remains linked to its origin. Loading/resetting a plain case clears provenance. Importing a new capture replaces it.

`exportCapture()` emits the current canonical case plus its retained provenance as `faultline.capture.v1`; manually created cases receive `mode: manual` only in the export metadata and are not accepted by `importCapture`, which remains snapshot-v1-specific.

## Product surfaces

The same ingestion path is exposed as:

- browser API: `window.faultline.importCapture` and `window.faultline.exportCapture`,
- WebMCP: `faultline_import_capture` and `faultline_export_capture`,
- human workbench: a dedicated Playwright capture JSON/file import surface and capture JSON export action.

The UI must explain that capture import performs a baseline reproduction check before replacing the current case.

## Failure semantics

Stable errors:

- `INVALID_CAPTURE` — malformed artifact/schema,
- `CAPTURE_UNRESOLVED_RESOURCES` — capture contains inaccessible dependencies,
- `CAPTURE_BASELINE_NOT_FAILING` — canonical execution returns PASS,
- `CAPTURE_BASELINE_UNRESOLVED` — canonical execution cannot determine PASS/FAIL,
- `CAPTURE_ORACLE_UNSUPPORTED` — adapter requested an oracle incompatible with snapshot capture.

These errors are surfaced without canonical mutation.

## Security

The capture CLI runs only in the user's local Playwright environment. The hosted Vercel application does not navigate to arbitrary URLs, hold target-site credentials, or gain network capability. Imported candidate content still passes through the existing sandbox/CSP and navigation/network policy. The capture feature therefore adds an integration path without expanding the production browser trust boundary.

## Verification

A permanent real-browser integration fixture must prove:

1. a local page requires an interaction to enter a failing DOM state,
2. the Playwright capture CLI drives that interaction and emits a valid artifact,
3. FAULTLINE imports it through WebMCP and human UI,
4. baseline `FAIL` is verified before mutation,
5. provenance survives a reduction and a revision restore,
6. invalid/unresolved/non-failing captures do not mutate state,
7. the normalized capture can be exported again,
8. the full existing unit, syntax, build, browser, security, persistence, cancellation, and deployment-parity suites remain green.

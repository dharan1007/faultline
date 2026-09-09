# Playwright Capture Ingestion Design

## Goal

Make FAULTLINE usable from a real browser-test workflow without requiring developers to manually copy HTML, CSS, JavaScript, oracle JSON, and provenance into the workbench. A local Playwright capture adapter will create a versioned capture artifact that the browser workbench can validate and atomically ingest through the existing canonical `loadCase` revision boundary.

## Problem

The production workbench currently starts after reproduction work has already been done: users must provide a complete `{html, css, js, oracle}` case themselves. This makes FAULTLINE effective as a reducer but weak as an integration product. The repository roadmap explicitly calls for a Playwright workflow that produces an importable FAULTLINE case.

A hosted arbitrary-URL crawler is not appropriate for the current architecture. The Vercel application is static/local-first, browser CORS would make source acquisition incomplete, remote browser execution would create a new privileged service boundary, and silently reconstructing framework/module applications from network responses would produce untrustworthy reproducers. The first production integration therefore runs locally beside the developer's Playwright test and packages source supplied from the test/project with observed browser provenance.

## Selected approach

Introduce a versioned `faultline.capture` artifact and a small Playwright helper/CLI. The capture adapter consumes a Playwright `page`, an exact FAULTLINE source case (`html`, `css`, `js`), and an oracle. It observes the page state needed for provenance and can execute the corresponding FAULTLINE-compatible bounded action before recording a baseline observation. It writes one JSON artifact that can be imported directly into the workbench.

The workbench validates the artifact independently before calling the existing `window.faultline.loadCase({expectedRevision, case})`. Capture metadata never bypasses canonical revision checks and never changes sandbox privileges.

## Artifact contract

Version 1 has this shape:

```json
{
  "format": "faultline.capture",
  "version": 1,
  "capturedAt": "2026-09-09T00:00:00.000Z",
  "case": {
    "html": "<main>...</main>",
    "css": "main{...}",
    "js": "...",
    "oracle": {
      "kind": "dom_exists",
      "selector": "main",
      "equals": true,
      "action": { "kind": "none" },
      "delayMs": 0
    }
  },
  "provenance": {
    "adapter": "faultline-playwright",
    "adapterVersion": 1,
    "url": "http://127.0.0.1:3000/repro",
    "title": "Repro",
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

`format` and `version` are mandatory. Unknown top-level fields are rejected so future semantics cannot be silently interpreted by older clients. `case` is mandatory and remains subject to canonical runtime validation during `loadCase`. Capture metadata is informational and bounded; it does not become executable source.

## Capture adapter

Create `src/capture-contract.js` as a browser/Node-compatible pure module responsible for validation and normalization. Create `playwright/faultline-capture.mjs` as the Playwright integration helper. The helper exports `captureFaultlineCase({page, case: caseValue, outputPath, browserName})` and returns the artifact object after writing it.

The helper must verify that `page` exposes the Playwright methods it uses, that `case` is structurally a FAULTLINE case at the capture boundary, and that `outputPath` is non-empty. It records `page.url()`, `page.title()`, `navigator.userAgent`, and `page.viewportSize()` when available. It does not crawl external resources, bundle modules, mutate the target application's source, infer unsupported oracles, or claim that browser provenance proves FAULTLINE's sandbox baseline. Canonical baseline verification still happens after import.

Create `bin/faultline-capture.mjs` as a CLI for repository users. It accepts `--url`, `--case <path>`, `--out <path>`, optional `--browser chromium`, launches Playwright, navigates to the URL, captures provenance, writes the artifact, exits non-zero with a stable error for invalid arguments/case files/navigation failure, and always closes the browser.

## Browser workbench ingestion

Extend the existing case-import surface rather than creating a parallel editor. Add an accessible file input labelled `Playwright capture artifact` and an `Import capture atomically` action. File text is parsed, passed through `validateCaptureArtifact`, and only then its `case` is committed with the current expected revision via `window.faultline.loadCase`.

Expose `window.faultlineCapture.validate()` and `window.faultlineCapture.import()` from a focused integration module. `import()` accepts `{artifact, expectedRevision}` and returns the canonical `loadCase` result plus normalized capture metadata. This gives browser automation and agents a stable API without duplicating the reducer/runtime.

The WebMCP runtime already exposes `faultline_load_case`; agents can therefore ingest the normalized `artifact.case` through the canonical tool without a second privileged mutation path. Documentation will specify this two-step contract explicitly. A future native `faultline_import_capture` tool is unnecessary until WebMCP supports artifact/file transport consistently.

## Failure semantics

Invalid JSON, wrong `format`, unsupported `version`, missing provenance, malformed viewport, extra top-level fields, missing case fields, or non-string source axes produce stable capture-validation errors and do not mutate canonical state. Runtime case validation remains authoritative for oracle/action semantics, so capture validation intentionally does not duplicate the entire oracle validator.

A failed browser capture must not leave a partial output file. The helper serializes to memory first and writes the final artifact only after provenance collection succeeds.

## Security boundary

The adapter runs locally with the same authority as the user's Playwright test. It does not introduce a hosted URL-fetching endpoint, server-side browser, credentials proxy, cross-origin scraper, or broader candidate sandbox capability. Imported source still executes only through the existing FAULTLINE iframe/CSP boundary. Capture provenance is rendered as text only and never injected as HTML.

## Accessibility and usability

The import flow must be keyboard operable, use a visible file-input label, expose validation failures in the existing live evidence/status region, and preserve the existing complete-case JSON import as a fallback. Successful import must update canonical source/oracle controls through the existing render path and show a concise provenance summary so users know what was captured.

## Tests

TDD acceptance requires three layers:

1. Pure contract tests proving valid artifact normalization and strict rejection without mutation-capable code.
2. A real Playwright CLI/integration test against a local HTTP fixture proving a capture file is produced with URL/title/user-agent/viewport provenance and exact case content.
3. A real browser/UI test loading the FAULTLINE workbench, importing the artifact through the file control, proving canonical revision advancement and exact case equality, then importing an invalid artifact and proving the revision/case remain unchanged.

The full existing `npm test`, `npm run check`, `npm run build`, and `npm run test:browser` gates remain mandatory before production deployment.

## Production and recovery

No duplicate Vercel project is permitted. Production deployment must continue through the existing guarded `deploy-production.yml` workflow and only after the exact candidate tree is green. After public byte parity succeeds, the `production` branch remains the recoverable verified source checkpoint.
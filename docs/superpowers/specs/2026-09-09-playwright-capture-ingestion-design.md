# Playwright Failure Capture Ingestion Design

## Goal

Turn a deterministic failure already observable in a real Playwright-controlled page into a portable FAULTLINE case without requiring the developer to hand-assemble HTML, CSS, JavaScript, and the oracle.

## Product boundary

FAULTLINE remains local-first and does not become a hosted arbitrary-web browser service. Capture runs in the developer's existing Playwright/Chromium process against a page the developer already controls. The browser workbench remains static on Vercel and only ingests a self-contained capture envelope.

Version 1 supports deterministic same-origin pages whose executable and stylesheet dependencies can be captured as inline text. Cross-origin or inaccessible dependencies are reported as unsupported instead of being silently omitted.

## Capture contract

A capture is a JSON object with `schema: "faultline.capture.v1"`, `source`, `oracle`, `provenance`, and `expectedStatus: "FAIL"`.

`source` contains exactly `html`, `css`, and `js` strings. `oracle` uses the existing FAULTLINE oracle contract. `provenance` contains `url`, `title`, `capturedAt`, `userAgent`, and optional `label`. Unknown top-level, source, or provenance keys are rejected so the versioned contract cannot drift silently.

## Playwright adapter

`capture/playwright.mjs` exports `captureFaultlineFailure(page, options)`.

The adapter snapshots the page before replay actions, collects the current body markup with executable/style tags removed, collects accessible stylesheet rules, and collects inline or same-origin classic script source. It rejects cross-origin/inaccessible script or stylesheet dependencies with a deterministic `CAPTURE_UNSUPPORTED_DEPENDENCY` error.

It then executes the requested bounded FAULTLINE action contract (`click`, `set_value`, `set_checked`, `wait`, or a sequence expressed as an array of those steps) against the real Playwright page and measures the configured oracle using FAULTLINE-compatible semantics. Capture succeeds only when the real page demonstrates the configured failure value. Otherwise it throws `CAPTURE_SOURCE_NOT_FAILING`.

The adapter returns a portable `faultline.capture.v1` envelope. It does not mutate FAULTLINE state and does not contact the hosted FAULTLINE deployment.

## Runtime ingestion

`src/capture.js` owns capture schema validation and normalization. It has no DOM side effects and returns a normalized `{ case, provenance, expectedStatus }` structure for the canonical runtime.

`window.faultline.importCapture({ expectedRevision, capture })` performs optimistic revision validation, normalizes the envelope, runs the normalized case through the existing sandbox runner, and requires baseline status `FAIL`. Only then does it commit the case as one canonical `capture_import` revision. Pins are cleared because they belong to the previous source frontier.

If parsing, schema validation, sandbox execution, or baseline reproduction fails, canonical case state, revision, pins, and provenance remain unchanged.

## Provenance

The canonical runtime stores the latest successful capture provenance separately from the reducible case. `inspect()` exposes it as `captureProvenance`. Revision snapshots retain it so restore recovers the provenance associated with that revision. Persistence retains the same field.

Case JSON remains backward compatible and continues to contain only HTML/CSS/JS/oracle. The standalone reproducer remains a source artifact. Capture JSON export preserves the original capture envelope/provenance when available.

## WebMCP

A new mutating tool `faultline_import_capture` accepts `expectedRevision` and a `faultline.capture.v1` envelope. It calls the same canonical `importCapture` function as the browser API and UI. No separate agent-only ingestion path is allowed.

## Human workflow

The existing case-import area is expanded with a distinct "Import Playwright capture" editor/action rather than replacing raw case import. The user can paste a `.faultline.json` capture, import it atomically, see a baseline failure confirmation, and then run reduction normally.

The Evidence/Export area gains `Export capture JSON` when capture provenance exists. Controls are keyboard reachable, labelled, and report import errors through the existing live health/summary surface.

## Safety and determinism

Capture does not weaken the runtime CSP or sandbox. Captured source is subject to exactly the same static/runtime containment policy as manually loaded cases. Import is rejected if the normalized case resolves to PASS or UNRESOLVED; FAULTLINE never converts an unresolved capture into a canonical failing case.

No authentication tokens, cookies, localStorage, sessionStorage, response bodies, or request headers are serialized by v1. Provenance records URL and browser identity only.

## Acceptance tests

A real local fixture application is served over HTTP and opened in Chromium with Playwright. The capture adapter snapshots it, replays a value change plus click, proves the configured failure on the real page, and emits a v1 envelope. The production workbench imports that envelope, confirms the same baseline `FAIL`, advances exactly one canonical revision, exposes provenance, and can run Autopilot/reduction on the imported case.

Negative browser tests prove malformed captures, stale revisions, source pages that do not demonstrate the failure, and imported captures that become `PASS`/`UNRESOLVED` are non-mutating. Existing case-import, sandbox, WebMCP, reducer, persistence, recovery, accessibility, and deployment-parity tests must remain green.

# Playwright Capture Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a transactional Playwright snapshot-capture pipeline that turns a real browser failure into an importable, provenance-preserving FAULTLINE case and exposes it through CLI, browser API, WebMCP, and human UI.

**Architecture:** A Node/Playwright adapter captures a bounded post-interaction browser snapshot into `faultline.capture.v1`. A shared capture-format module validates the artifact. The canonical runtime preflights the embedded case in the existing sandbox and commits only if it reproduces `FAIL`; provenance is persisted separately from the four-field case and travels with revision recovery. UI and WebMCP call the same runtime methods.

**Tech Stack:** ECMAScript modules, browser DOM APIs, Playwright 1.55, Node.js 22 CI, static Vercel deployment.

**Spec:** `docs/superpowers/specs/2026-09-09-playwright-capture-pipeline-design.md`

## Global Constraints

- Do not expand the hosted browser's network or sandbox capabilities.
- Keep `PASS`, `FAIL`, and `UNRESOLVED` distinct.
- Reject stale revisions before canonical mutation.
- Capture import must be transactional and baseline-verified.
- `faultline.capture.v1` snapshot mode may not claim arbitrary JavaScript/runtime-error reconstruction.
- No new production npm runtime dependency.
- Existing single `faultline-webmcp` Vercel project remains the only deployment target.

---

### Task 1: Capture contract and RED integration acceptance

**Files:**
- Create: `src/capture-format.js`
- Create: `tests/playwright-capture-pipeline.mjs`
- Modify: `package.json`
- Modify: `scripts-build.mjs`

**Interfaces:**
- Produces `validateCaptureV1(capture)` and `normalizeCaptureV1(capture)`.
- Browser acceptance expects `window.faultline.importCapture`, `window.faultline.exportCapture`, and WebMCP tools `faultline_import_capture` / `faultline_export_capture`.

- [ ] Create the browser test first. It starts a real local target page and FAULTLINE server, invokes the capture CLI, then asserts the generated artifact can be imported, remains `FAIL`, preserves provenance, and rejects non-failing/unresolved artifacts without mutation.
- [ ] Wire the test into `check` and `test:browser` before implementing runtime support.
- [ ] Run branch CI and record the expected RED failure at the first missing capture surface while all preceding existing tests remain green.
- [ ] Implement strict outer capture-format validation in `src/capture-format.js`; keep embedded case/oracle validation in the canonical runtime to avoid duplicating the full oracle contract.
- [ ] Add `src/capture-format.js` to the static production build and deployment parity set.

### Task 2: Local Playwright capture adapter

**Files:**
- Create: `scripts/capture-playwright.mjs`
- Extend: `tests/playwright-capture-pipeline.mjs`
- Modify: `package.json`

**Interfaces:**
- CLI: `node scripts/capture-playwright.mjs --config <path>`.
- Config: `{ url, output, oracle, actions?, viewport? }`.
- Artifact: `faultline.capture.v1` snapshot contract from the design.

- [ ] Add RED assertions that a real page requiring a bounded interaction produces no importable artifact with the current tree.
- [ ] Implement config parsing and exact action validation for `click`, `set_value`, `set_checked`, and `wait`, including max 8 steps and aggregate wait <= 2000 ms.
- [ ] Use Chromium to navigate, execute actions, clone the body without script elements, serialize readable CSSOM rules, record inaccessible stylesheet URLs, and emit provenance.
- [ ] Normalize the embedded snapshot oracle to `{ action:{kind:'none'} }`; reject `runtime_error` as `CAPTURE_ORACLE_UNSUPPORTED`.
- [ ] Verify the fixture artifact contains the interacted failing state, zero executable JS, deterministic provenance, and no unresolved resources.

### Task 3: Transactional runtime import and provenance

**Files:**
- Modify: `src/runtime.js`
- Extend: `tests/playwright-capture-pipeline.mjs`
- Extend relevant persistence/recovery tests only where the new canonical metadata affects them.

**Interfaces:**
- `importCapture({ expectedRevision, capture }, { signal? }) -> Promise<inspect result>`.
- `exportCapture() -> capture artifact`.
- `inspect()` adds `captureProvenance`.

- [ ] Add RED assertions that import must not mutate on PASS, UNRESOLVED, invalid schema, unresolved resources, or stale revision.
- [ ] Add `captureProvenance` to canonical persistence/revision snapshots with backward-compatible hydration.
- [ ] Implement strict preflight order: capture validate -> embedded case validate -> revision assert -> canonical `runCase` -> require `FAIL` -> one atomic commit.
- [ ] Clear provenance on plain `loadCase`/reset, preserve it across source edits/reduction/pins, and restore it with revision recovery.
- [ ] Implement `exportCapture()` and prove provenance survives reduction and restore.

### Task 4: WebMCP and human workbench integration

**Files:**
- Modify: `src/runtime.js`
- Modify: `src/ui.js`
- Modify: `index.html` only if semantic/static structure is required.
- Extend: `tests/playwright-capture-pipeline.mjs`
- Update: `README.md`
- Update: `docs/SECURITY.md`
- Update: `ROADMAP.md`

**Interfaces:**
- WebMCP: `faultline_import_capture({ expectedRevision, capture, requestId? })` and `faultline_export_capture()`.
- Human UI: file/JSON capture import and capture JSON export.

- [ ] Add capture schemas to the WebMCP manifest and route execution through canonical runtime methods.
- [ ] Add an accessible capture-import control with file selection, JSON editor, explicit baseline-verification copy, status/error surface, and no mutation on errors.
- [ ] Add capture JSON export that uses canonical `exportCapture()`.
- [ ] Update integration documentation so agents can go from local Playwright capture -> `faultline_import_capture` -> `faultline_autopilot` -> export.
- [ ] Document that hosted FAULTLINE still does not browse arbitrary URLs and that snapshot mode intentionally does not reconstruct runtime-error causality.

### Task 5: Full verification and guarded production deployment

**Files:**
- No feature files unless verification reveals a defect.

**Interfaces:**
- Existing CI and `.github/workflows/deploy-production.yml` remain the authority.

- [ ] Run `npm test`, `npm run check`, `npm run build`, and the complete `npm run test:browser` on the final branch tree through GitHub Actions.
- [ ] Re-read `main`; if it advanced, rebase/recreate the candidate rather than force-updating.
- [ ] Compare candidate to `main` and require a strict fast-forward with zero behind commits.
- [ ] Fast-forward `main` without force.
- [ ] Require the guarded production workflow to rerun the complete green gate, stage into the existing Vercel project, compare staged/source bytes including the new production module, promote only on parity, then compare the public alias and advance `production`.
- [ ] Independently verify Vercel reports `READY`, the existing project ID is unchanged, the public alias serves the capture module/UI, and `main`/`production` match the deployed SHA.

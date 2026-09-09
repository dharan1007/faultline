# Playwright Failure Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a real Playwright browser failure into a versioned FAULTLINE capture artifact that can be imported atomically through human, Browser API, and WebMCP surfaces and immediately run/reduced by the canonical engine.

**Architecture:** A shared `src/capture-format.js` owns the versioned wire contract. `integrations/playwright/index.mjs` captures a baseline in the user's Playwright process and can auto-write/attach an artifact when an armed test fails. `src/runtime.js` imports captures into the existing revisioned case store; `src/ui.js` exposes file/paste import without creating a separate execution path.

**Tech Stack:** Browser ES modules, Node.js 22+, Playwright 1.55.0, existing FAULTLINE static runtime/WebMCP APIs, GitHub Actions Chromium gate, existing Vercel exact-tree deployment workflow.

**Spec:** `docs/superpowers/specs/2026-09-09-playwright-failure-capture-design.md`

## Global Constraints

- Wire schema is exactly `faultline.capture.v1`.
- Canonical executable case remains exactly `{html, css, js, oracle}`.
- Production never browses arbitrary capture URLs; capture runs only in the user's Playwright process.
- Cross-origin resource bodies are not fetched.
- Same-origin JavaScript capture is opt-in and source-size bounded.
- Omitted resources are recorded explicitly in diagnostics.
- Capture import is optimistic-revision guarded and atomic.
- No new Vercel project may be created.
- Promotion occurs only after full deterministic, syntax, build, Chromium/UI, WebMCP, and exact-tree deployment gates pass.

---

### Task 1: Lock the capture contract with failing tests

**Files:**
- Create: `tests/capture-format.test.js`
- Create: `tests/playwright-capture-integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `window.faultline.loadCase`, `run`, revision model, Playwright dependency.
- Produces: executable acceptance contract for `normalizeCapture`, Playwright artifact generation, `window.faultline.loadCapture`, WebMCP `faultline_load_capture`, and human import.

- [ ] **Step 1: Write capture-format RED tests** asserting `faultline.capture.v1` is accepted and unknown schema, malformed diagnostics, malformed provenance, and oversized sources are rejected without coercion.
- [ ] **Step 2: Add the tests to `npm test` and `npm run check`; run branch CI and verify RED is caused by the missing `src/capture-format.js` production module.**
- [ ] **Step 3: Write the real Chromium RED test**: serve a local target page, capture an armed baseline, exercise a button that creates the failure, require a versioned artifact, load FAULTLINE, require `faultline_load_capture`, import it, and require `faultline_run` to return `FAIL`; also exercise file/paste UI import.
- [ ] **Step 4: Run branch CI again and verify the new browser acceptance fails because the Playwright capture/import surfaces do not yet exist while all prior suites remain green.**

### Task 2: Implement the versioned shared capture format

**Files:**
- Create: `src/capture-format.js`
- Test: `tests/capture-format.test.js`

**Interfaces:**
- Produces: `CAPTURE_SCHEMA`, `MAX_CAPTURE_SOURCE_BYTES`, `normalizeCapture(capture)`, `captureSummary(capture)`.

- [ ] **Step 1: Implement strict object/schema validation** with exact schema `faultline.capture.v1`, canonical case structural validation, bounded source byte count, bounded provenance strings, and array diagnostics.
- [ ] **Step 2: Return a fresh normalized object** so callers cannot mutate canonical state through retained references.
- [ ] **Step 3: Run `npm test` and `npm run check`; require the capture-format RED tests to turn green without changing the browser RED expectation.**
- [ ] **Step 4: Commit the shared contract.**

### Task 3: Implement Playwright baseline capture and failure artifact fixture

**Files:**
- Create: `integrations/playwright/index.mjs`
- Test: `tests/playwright-capture-integration.mjs`

**Interfaces:**
- Produces: `captureFaultlineBaseline(page, options)` and `createFaultlineTest(baseTest, options)`.

- [ ] **Step 1: Capture baseline DOM** by cloning the body and removing `script`, stylesheet links, `base`, and refresh meta elements from executable HTML.
- [ ] **Step 2: Capture accessible CSSOM rules** and record unreadable stylesheet URLs in diagnostics rather than silently dropping them.
- [ ] **Step 3: Capture inline JavaScript and, only when explicitly enabled, same-origin external script bodies through Playwright's authenticated request context; enforce total source-size bounds and record omitted scripts.**
- [ ] **Step 4: Add provenance** for page URL/title, capture timestamp, viewport, user agent, and optional Playwright test metadata.
- [ ] **Step 5: Implement `createFaultlineTest`** so `faultline.arm(oracle, options)` captures the pre-failure baseline and fixture teardown writes/attaches `faultline.capture.json` only when the test result is unexpected.
- [ ] **Step 6: Run the capture integration test through the artifact-generation stage and verify the artifact contents before implementing FAULTLINE import.**
- [ ] **Step 7: Commit the Playwright producer.**

### Task 4: Add atomic canonical capture import and WebMCP tool

**Files:**
- Modify: `src/runtime.js`
- Test: `tests/playwright-capture-integration.mjs`

**Interfaces:**
- Consumes: `normalizeCapture`, current `validateCase`, revision store/persistence/evidence ledger.
- Produces: `loadCapture({expectedRevision,capture})`, `window.faultline.loadCapture`, WebMCP `faultline_load_capture`.

- [ ] **Step 1: Import `normalizeCapture`/`captureSummary` into runtime.**
- [ ] **Step 2: Implement `loadCapture` as one atomic guarded mutation**: normalize, validate canonical case, assert revision, snapshot rollback state, clear pins, commit `capture_import`, remember revision and bounded provenance evidence, persist once, rerender, return state plus capture summary.
- [ ] **Step 3: Add strict WebMCP JSON schema** for the versioned capture and register `faultline_load_capture` as an untrusted-content write tool.
- [ ] **Step 4: Expose `loadCapture` on `window.faultline`.**
- [ ] **Step 5: Extend the browser acceptance** to prove successful import/run, stale-revision rejection, unknown-version rejection, and zero mutation on rejected artifacts.
- [ ] **Step 6: Run the targeted browser test and then all pre-existing browser tests.**
- [ ] **Step 7: Commit canonical import.**

### Task 5: Add accessible human capture import

**Files:**
- Modify: `src/ui.js`
- Test: `tests/playwright-capture-integration.mjs`

**Interfaces:**
- Consumes: `window.faultline.loadCapture`.
- Produces: file picker + paste editor + import button + accessible success/error status in existing workbench.

- [ ] **Step 1: Install an `Import Playwright capture` details panel** adjacent to complete-case import with an explicit file label, `.json` accept filter, paste textarea, and guarded import button.
- [ ] **Step 2: Read selected files as text into the same editor** so file and paste paths share one parser/import implementation.
- [ ] **Step 3: Report successful provenance summary** through the existing live summary/health surface and route errors through `reportActionError`.
- [ ] **Step 4: Update the Integrate panel dynamically** to show the Playwright capture path and new WebMCP tool without duplicating execution logic.
- [ ] **Step 5: Extend Chromium acceptance** to load the generated capture file through the human control and prove the canonical revision/case matches the WebMCP path.
- [ ] **Step 6: Run accessibility/mobile/UI browser regressions plus the full browser suite.**
- [ ] **Step 7: Commit the human integration.**

### Task 6: Documentation and production verification

**Files:**
- Modify: `README.md`
- Modify: `docs/WEBMCP.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Documents the exact capture format, Playwright fixture usage, safety boundary, and WebMCP import tool.

- [ ] **Step 1: Document a copy-paste Playwright integration example** using `createFaultlineTest` and `faultline.arm` before the failing interaction.
- [ ] **Step 2: Document capture limitations**: no hosted browsing, no cross-origin body scraping, source-size bounds, explicit omitted resources, opt-in same-origin JS.
- [ ] **Step 3: Update WebMCP tool count/contracts and mark the Playwright integration roadmap item delivered without overstating framework-complete reproduction.**
- [ ] **Step 4: Run `npm test`, `npm run check`, `npm run build`, and `npm run test:browser` on the exact candidate SHA; require all green.**
- [ ] **Step 5: Re-read `main`; compare candidate against current main and require 0 commits behind before non-force fast-forward.**
- [ ] **Step 6: Allow only the existing guarded `.github/workflows/deploy-production.yml` path to deploy to project `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM` under team `team_APBZJjf6iizHCTuseqHosFnU`.**
- [ ] **Step 7: Verify the production deployment is READY and Git SHA exact; fetch public runtime/UI artifacts and verify the capture feature is actually served.**
- [ ] **Step 8: Verify `main`, live Vercel production, and recoverable `production` checkpoint all resolve to the same exact SHA.**
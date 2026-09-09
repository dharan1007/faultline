# Playwright Capture Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-grade Playwright capture artifact workflow that turns a real browser-test reproduction into a versioned FAULTLINE artifact and imports it atomically into the existing canonical reducer.

**Architecture:** Keep the canonical reducer/runtime unchanged as the only mutation authority. Add a pure capture-contract module shared by Node and browser code, a local Playwright capture helper/CLI, and a browser integration module that validates an artifact before delegating to `window.faultline.loadCase`. The existing WebMCP `faultline_load_case` remains the agent mutation path, with capture normalization documented as a pre-step rather than introducing another privileged state path.

**Tech Stack:** ECMAScript modules, Node.js 22+, Playwright 1.55.0, browser File API, existing FAULTLINE static runtime and GitHub Actions/Vercel pipeline.

**Spec:** `docs/superpowers/specs/2026-09-09-playwright-capture-ingestion-design.md`

## Global Constraints

- Do not weaken iframe sandbox/CSP/navigation/result-channel containment.
- Imported artifacts must still pass canonical `loadCase` validation and expected-revision checks.
- Invalid capture artifacts must not mutate canonical state.
- No hosted arbitrary-URL crawler or new server-side privileged browser service.
- No duplicate Vercel project; deploy only through the existing `faultline-webmcp` guarded production workflow.
- Full `npm test`, `npm run check`, `npm run build`, and `npm run test:browser` gates are mandatory.

---

### Task 1: Capture artifact contract

**Files:**
- Create: `src/capture-contract.js`
- Create: `tests/capture-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateCaptureArtifact(input) -> normalizedArtifact`
- Produces: `createCaptureArtifact({caseValue, provenance, capturedAt}) -> artifact`
- Artifact contract: `{format:'faultline.capture',version:1,capturedAt,case,provenance,baseline}`

- [ ] **Step 1: Write failing pure contract tests**

Test a valid artifact round-trip; reject wrong format/version, extra top-level fields, malformed/missing provenance, malformed viewport, and malformed case axes. Assert the original input is not mutated.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/capture-contract.test.js`
Expected: FAIL because `src/capture-contract.js` does not exist.

- [ ] **Step 3: Implement the pure contract module**

Use strict top-level key validation, exact version `1`, ISO timestamp validation, bounded text metadata, positive integer viewport dimensions, exact case keys `html/css/js/oracle`, and deep-clone normalized output. Do not duplicate canonical oracle/action validation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/capture-contract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add versioned capture artifact contract`

### Task 2: Local Playwright capture helper and CLI

**Files:**
- Create: `playwright/faultline-capture.mjs`
- Create: `bin/faultline-capture.mjs`
- Create: `tests/playwright-capture-cli.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createCaptureArtifact()` from `src/capture-contract.js`
- Produces: `captureFaultlineCase({page,caseValue,outputPath,browserName})`
- CLI: `node bin/faultline-capture.mjs --url <url> --case <case.json> --out <capture.json> [--browser chromium]`

- [ ] **Step 1: Write a failing CLI integration test**

Start a local HTTP server with a deterministic title, create a temporary valid FAULTLINE case JSON, spawn the CLI, then assert successful exit, exact case preservation, `format/version`, captured URL/title/user-agent/viewport/browser provenance, and no output file after an invalid case invocation.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/playwright-capture-cli.test.js`
Expected: FAIL because the CLI/helper do not exist.

- [ ] **Step 3: Implement helper and CLI**

Launch Chromium, navigate with bounded timeout, call helper, close browser in `finally`, write only after validation/provenance collection succeeds, and return stable `FAULTLINE_CAPTURE_*` errors for argument/case/navigation/write failures.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/playwright-capture-cli.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: capture Playwright reproductions as FAULTLINE artifacts`

### Task 3: Atomic browser workbench ingestion

**Files:**
- Create: `src/capture-integration.js`
- Create: `tests/capture-import-browser.mjs`
- Modify: `src/ui.js`
- Modify: `index.html`
- Modify: `package.json`

**Interfaces:**
- Consumes: `validateCaptureArtifact()` from `src/capture-contract.js`
- Produces: `window.faultlineCapture.validate(artifact)`
- Produces: `window.faultlineCapture.import({artifact,expectedRevision})`
- Delegates mutation only to: `window.faultline.loadCase({expectedRevision,case:artifact.case})`

- [ ] **Step 1: Write failing real-browser import test**

Load the workbench in Chromium, assert a labelled `Playwright capture artifact` file input exists, upload a valid artifact, click `Import capture atomically`, verify revision increments exactly once and canonical case equals the artifact case, verify provenance summary is text-visible, then upload an invalid version and assert revision/case remain unchanged while the status becomes `ERROR` with a stable capture-validation message.

- [ ] **Step 2: Run the focused browser test and verify RED**

Run: `node tests/capture-import-browser.mjs`
Expected: FAIL because the capture import surface/API does not exist.

- [ ] **Step 3: Implement browser integration and accessible import UI**

Keep capture validation in the focused module. Extend the existing complete-case import details with a labelled file input, import button, and provenance summary region. Read files as text, parse JSON, validate, call `window.faultlineCapture.import`, and route errors through existing UI status/evidence behavior. Never use `innerHTML` for provenance.

- [ ] **Step 4: Run focused browser test and verify GREEN**

Run: `node tests/capture-import-browser.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: import Playwright captures atomically in workbench`

### Task 4: Integration documentation and product workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/WEBMCP.md`
- Modify: `ROADMAP.md`
- Modify: `llms.txt`

**Interfaces:**
- Documents CLI capture command.
- Documents browser `window.faultlineCapture` API.
- Documents agent flow: validate capture -> use `artifact.case` with existing `faultline_load_case` -> run/reduce/export.

- [ ] **Step 1: Add documentation assertions to the browser/workbench structure regression or a focused documentation test**

Assert the shipped integration surface mentions the capture workflow and does not claim arbitrary hosted URL crawling.

- [ ] **Step 2: Verify RED if documentation contract is absent**

Run the focused test selected above and confirm the missing capture workflow is the failure.

- [ ] **Step 3: Update docs and integration copy**

Explain exact scope: local Playwright adapter, source case supplied from test/project, provenance captured from the real browser page, canonical baseline re-verification after import, and current limitations around automatic source reconstruction for complex framework/module apps.

- [ ] **Step 4: Verify GREEN**

Run focused contract/browser test.

- [ ] **Step 5: Commit**

Commit message: `docs: document Playwright capture workflow`

### Task 5: Full verification and guarded deployment

**Files:**
- No additional product files unless a failing gate identifies a real defect.

- [ ] **Step 1: Run full repository gate**

Run: `npm test`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

Run: `npm run test:browser`
Expected: PASS, including capture CLI and capture import browser acceptance.

- [ ] **Step 2: Verify branch CI**

Require the GitHub Actions `ci` workflow for the exact candidate SHA to pass. Do not advance `main` on a partial/failed tree.

- [ ] **Step 3: Re-read `main` and compare ancestry**

Confirm `main` has not moved from the inspected production base or reconcile safely. Advance only with a non-force fast-forward.

- [ ] **Step 4: Let the existing guarded production workflow redeploy the single bound Vercel project**

Require exact-tree tests, Vercel project ID `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`, staged byte parity, promotion, public byte parity, and successful production checkpoint advancement.

- [ ] **Step 5: Independently verify production**

Fetch the public app and capture integration modules from `https://faultline-webmcp.vercel.app`, verify HTTP 200 and expected capture surface, verify Vercel reports the exact Git SHA as `READY` / production, and verify both `main` and `production` point at the deployed SHA.
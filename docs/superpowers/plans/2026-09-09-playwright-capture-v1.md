# Playwright Capture v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert a real Playwright-observed browser failure into a bounded `faultline.capture.v1` artifact, transactionally verify/import it into FAULTLINE, reduce it, and export the reduced reproducer with provenance through human, Browser API, and WebMCP surfaces.

**Architecture:** Add a pure capture-contract module for schema/bounds/normalization, a local Playwright adapter that only snapshots already-authorized pages, and one canonical runtime `importCapture()` operation that performs validation, sandbox baseline verification, stale-revision protection, atomic commit, provenance persistence, and rollback. Human UI and WebMCP must delegate to the canonical operation; no hosted remote browser or alternate execution path is introduced.

**Tech Stack:** Vanilla ES modules, Node.js 24, Playwright 1.55.0, Node test runner, browser `window.faultline` API, WebMCP `document.modelContext`, existing Vercel exact-tree deployment workflow.

**Spec:** `docs/superpowers/specs/2026-09-09-playwright-capture-v1-design.md`

## Global Constraints

- Capture schema is exactly `faultline.capture.v1`.
- HTML/CSS/JS each max 1 MiB; human/browser JSON import max 4 MiB.
- Reuse existing oracle/action validators and limits: sequence 1–8 steps, total wait <= 2000 ms, oracle delay <= 2000 ms.
- Hosted production must never fetch the capture source URL or arbitrary external dependencies.
- Only independently reproduced `FAIL` captures may mutate canonical state.
- Baseline `PASS` => `CAPTURE_NOT_REPRODUCED`; baseline `UNRESOLVED` => `CAPTURE_UNRESOLVED`.
- Stale revision, cancellation, validation failure, unsupported dependency/action, and persistence failure must leave case and provenance unchanged.
- No second Vercel project or backend.
- Existing `loadCase` behavior remains unchanged.

---

### Task 1: Capture contract and pure validation

**Files:**
- Create: `src/capture-contract.js`
- Create: `tests/capture-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `CAPTURE_SCHEMA`, `CAPTURE_LIMITS`, `validateCaptureArtifact(capture)`, `normalizeCaptureArtifact(capture)`, and `summarizeCaptureProvenance(capture)`.
- `normalizeCaptureArtifact` returns `{case:{html,css,js,oracle}, provenance}` and never performs I/O or DOM execution.

- [ ] Write tests first covering valid normalization; wrong/missing schema; non-object capture; >1 MiB source fields; unsupported action/oracle; external dependency diagnostics; bounded metadata; and source strings retained exactly.
- [ ] Run `node --test tests/capture-contract.test.js` and verify RED because `src/capture-contract.js` does not exist.
- [ ] Implement pure validation/normalization with explicit error codes: `INVALID_CAPTURE`, `UNSUPPORTED_CAPTURE_SCHEMA`, `CAPTURE_TOO_LARGE`, `UNSUPPORTED_CAPTURE_ACTION`, `UNSUPPORTED_CAPTURE_DEPENDENCY`.
- [ ] Re-run focused unit test, then `npm test` and `npm run check`.
- [ ] Commit unit/contract slice.

### Task 2: Local Playwright capture adapter

**Files:**
- Create: `integrations/playwright-capture/index.js`
- Create: `tests/playwright-capture-adapter.mjs`
- Create: `tests/fixtures/capture-app.html`
- Modify: `package.json`

**Interfaces:**
- Consumes a caller-owned Playwright `page`, canonical oracle, optional caller JS, and provenance.
- Produces `captureFaultlineCase({page,oracle,js='',provenance={},writeTo}) -> Promise<capture>`.
- Adapter records page URL/title, current DOM snapshot, same-origin/inline CSS it can read, Chromium/viewport metadata, bounded console/page errors, and inaccessible external stylesheet diagnostics. It never navigates on its own and never uploads.

- [ ] Write RED Playwright test against a local HTTP fixture proving the adapter API is absent.
- [ ] Implement capture collection with exact schema/bounds and safe optional file output using Node filesystem only when `writeTo` is provided.
- [ ] Verify artifact contains real page snapshot, CSS, oracle, provenance and environment; cross-origin/inaccessible stylesheet becomes dependency diagnostic rather than hidden success.
- [ ] Run focused adapter test and syntax check.
- [ ] Commit adapter slice.

### Task 3: Canonical transactional runtime import and provenance persistence

**Files:**
- Modify: `src/runtime.js`
- Modify: `src/capture-contract.js`
- Create: `tests/capture-runtime-import.mjs`
- Modify: `package.json`

**Interfaces:**
- Adds `await window.faultline.importCapture({expectedRevision,capture}, {signal}?)`.
- `inspect()` returns bounded `captureProvenance` or `null`.
- Canonical state snapshots/persistence/restoration include revision-bound provenance while reducer truth remains based only on `{html,css,js,oracle}`.

- [ ] Write RED browser tests asserting `window.faultline.importCapture` is absent and state is unchanged on attempted capture flow.
- [ ] Add capture provenance to canonical snapshot/restore/persistence with backward-compatible recovery when old persisted state lacks provenance.
- [ ] Implement import sequence: capture validate/normalize -> `store.assertRevision()` -> policy preflight via existing execution path -> `runCase(normalized.case)` without mutation -> require FAIL -> reassert revision -> commit case/provenance atomically -> persist or rollback.
- [ ] Map baseline PASS/UNRESOLVED to `CAPTURE_NOT_REPRODUCED`/`CAPTURE_UNRESOLVED`, preserve underlying bounded evidence, and honor AbortSignal before/after baseline.
- [ ] Prove malformed schema, unsupported dependency, PASS, UNRESOLVED, stale revision, cancellation and forced persistence failure all leave case/revision/provenance unchanged.
- [ ] Verify ordinary `loadCase` clears capture provenance because the new manual case is no longer capture-derived.
- [ ] Run focused browser test and existing persistence/recovery/cancellation tests.
- [ ] Commit runtime slice.

### Task 4: WebMCP import and structured export contracts

**Files:**
- Modify: `src/runtime.js`
- Create: `tests/webmcp-capture-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Adds WebMCP tool `faultline_import_capture` requiring `expectedRevision` and bounded complete `capture` object, executing canonical `importCapture` through the cancellable operation wrapper.
- Adds `window.faultline.exportBundle()` and upgrades `faultline_export` response to include `schema:'faultline.export.v1'`, canonical case, standalone HTML, capture provenance, and reduction/revision history without removing existing standalone HTML availability.

- [ ] Write RED test requiring manifest/tool registration for `faultline_import_capture` and structured provenance-aware export.
- [ ] Define explicit JSON schema for capture without URL-fetch/host callback/browser-command fields.
- [ ] Add tool to cancellable set and delegate to canonical import operation.
- [ ] Implement `exportBundle()` from canonical state with copied bounded provenance/history.
- [ ] Verify native result serialization, cancellation cleanup, and old export HTML behavior.
- [ ] Run focused WebMCP tests and existing 16-tool contract tests, updating expected tool count only after RED proves the new tool.
- [ ] Commit WebMCP/export slice.

### Task 5: Human Verify & Import workflow

**Files:**
- Modify: `index.html`
- Modify: `src/runtime.js`
- Modify: `src/ui.js` only if existing structural helpers are needed
- Create: `tests/human-capture-import.mjs`
- Modify: `package.json`

**Interfaces:**
- Adds accessible file picker accepting `.json,.faultline.json`, a non-HTML-injected capture summary, `Verify & import`, and live status region.
- File selection parses and validates but does not mutate; explicit verification performs canonical `importCapture` against the currently inspected revision.

- [ ] Write RED browser test for missing capture controls and missing keyboard flow.
- [ ] Add compact functional ingestion panel to the Case surface with label-associated hidden input, summary `<dl>`/text fields, explicit import button, and `aria-live` outcome region.
- [ ] Parse at most 4 MiB before JSON parse/normalization; display source URL/test title only through `textContent`.
- [ ] Disable Verify until a valid pending capture exists; retain current case on every failed verification/import.
- [ ] Verify keyboard-only operation, malicious metadata rendering as text, narrow viewport no horizontal overflow, and successful UI import.
- [ ] Run focused browser test plus existing workbench/accessibility/mobile tests.
- [ ] Commit UI slice.

### Task 6: Real end-to-end capture -> import -> reduce -> export acceptance

**Files:**
- Create: `tests/playwright-capture-ingestion.mjs`
- Modify: `package.json`

**Interfaces:**
- Acceptance owns a real local fixture HTTP server and a Playwright page, invokes the local adapter, then drives FAULTLINE through Browser API/WebMCP and UI where relevant.

- [ ] Write an acceptance whose failure is reproducible from captured DOM + caller-supplied deterministic JS using `set_value` + `click` and `dom_attribute` oracle.
- [ ] Assert full chain: fixture HTTP -> Playwright capture -> `faultline.capture.v1` -> import baseline FAIL -> provenance inspect -> autopilot/reduction -> reduced case still FAIL -> `faultline.export.v1` retains provenance.
- [ ] Add negative acceptance for a non-reproducing capture and prove revision unchanged.
- [ ] Run the focused acceptance until green.
- [ ] Commit acceptance slice.

### Task 7: Documentation and trust-boundary accuracy

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md` if present
- Modify: `SECURITY.md` if present

**Interfaces:**
- Documentation must distinguish local Playwright capture from hosted FAULTLINE execution and list v1 limitations honestly.

- [ ] Document installation/use of `captureFaultlineCase`, artifact shape, human import, Browser API, WebMCP tool, export provenance, supported oracle/actions, dependency rejection, and no-hosted-browser guarantee.
- [ ] Move Playwright ingestion roadmap item from future to shipped only if all acceptance tests are green.
- [ ] Run link/code syntax checks where applicable.
- [ ] Commit docs slice.

### Task 8: Complete verification, exact-tree promotion, and recoverable checkpoint

**Files:**
- No production-code edits unless a failing verification produces a separately TDD-proven defect.

**Interfaces:**
- Candidate SHA must be immutable and strictly fast-forward from current `main`.

- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Install Chromium as CI does and run `npm run test:browser`.
- [ ] Confirm no unexpected generated/untracked production artifacts are included.
- [ ] Re-fetch `main` and verify candidate is 0 behind before non-force fast-forward.
- [ ] Let existing `.github/workflows/deploy-production.yml` rerun the complete immutable-tree gate and deploy only to project `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM` under team `team_APBZJjf6iizHCTuseqHosFnU`.
- [ ] Verify workflow staged/source parity, public-production parity, deployment `READY`, and live capture UI/runtime source.
- [ ] Verify `main` and recoverable `production` checkpoint both resolve to the exact deployed SHA.
- [ ] If any step fails, do not advance production; report the blocker with production left at the previous verified SHA.

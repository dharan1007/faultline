# FAULTLINE Capture-First Runtime Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace source-first FAULTLINE with a capture-first causal debugging product that accepts real websites/sessions, ships a credible modern demo, records/replays failures, discovers runtime causal candidates, and preserves the existing deterministic legacy reducer as an advanced compatibility path.

**Architecture:** Keep the verified production runtime intact behind a `legacy-source` adapter while introducing a versioned Investigation model, a local Playwright coordinator, runtime-capability adapters, and a multi-page product shell. The hosted Vercel site owns non-sensitive investigation UI/artifacts; the local coordinator owns browser capture/replay/private targets and reversible interventions. No feature is exposed as supported before its real browser/security tests are green.

**Tech Stack:** Node.js 22 for existing release compatibility; Playwright 1.55 for capture/replay; React 19.2.x + React DOM 19.2.x and Vite 8.2.x for the complex modern demo; ES modules for coordinator/protocol packages; Node `node:test`; existing WebMCP/browser runtime; Vercel existing project `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`.

**Spec:** `docs/superpowers/specs/2026-09-08-capture-first-runtime-cases-design.md`

## Global Constraints

- The default product flow must never require HTML/CSS/JS.
- Legacy source cases remain functional only under Advanced compatibility UI.
- Public URL capture must execute a real browser; server-side HTML fetch is not an acceptable substitute.
- Public capture must block non-http(s), loopback, private/link-local/reserved ranges, cloud metadata targets, unsafe redirects, and DNS rebinding.
- Current-tab/private capture never silently collects passwords, cookies, authorization headers, credit-card/autofill-sensitive values, or unrelated-tab data.
- Oracle outcomes remain exactly `PASS | FAIL | UNRESOLVED` and stay distinct from operation status.
- Every mutating experiment is expected-revision guarded, plan-bound, lease-bound, reversible, and restoration-verified.
- Restore failure marks the target dirty and stops automatic reduction.
- Capability depth is honest: unavailable framework/source internals are reported as unavailable rather than guessed.
- Complex-demo metrics are measured at runtime; candidate/experiment counts are never marketing constants.
- Existing reducer, revision, persistence, cancellation, sandbox, WebMCP, and deployment-integrity tests remain required.
- Production remains on the existing `faultline-webmcp` Vercel project; never create a duplicate project.

---

## Task 1: Investigation protocol + legacy compatibility boundary

**Files:**
- Create `src/investigation-protocol.js`
- Create `src/investigation-store.js`
- Create `src/legacy-source-adapter.js`
- Create `tests/investigation-protocol.test.js`
- Modify `package.json`

**Interfaces:**
- `validateInvestigation(value)` validates schemaVersion 1 Investigation values.
- `createInvestigation(input)` returns a canonical `Investigation` at revision `r1`.
- `createInvestigationStore(initial)` returns `{inspect, commit, restore, exportBundle}` with stale-revision rejection.
- `legacyCaseToInvestigation(caseValue)` creates a `target.mode='legacy_source'` Investigation without changing the legacy case payload.
- `investigationToLegacyCase(investigation)` returns the compatibility payload only when `target.mode==='legacy_source'`.

- [ ] Write `tests/investigation-protocol.test.js` first. Require schema rejection for future versions, immutable revision advancement, stale-write rejection, observation append-only behavior, export manifest/checksum fields, and lossless legacy conversion.
- [ ] Run `node --test tests/investigation-protocol.test.js` and confirm RED because the protocol module is absent.
- [ ] Implement the three focused modules with no DOM dependency and deterministic canonical JSON hashing via `crypto.subtle` where browser-side and `node:crypto`-compatible pure string canonicalization for tests.
- [ ] Add the protocol test to `npm test` and syntax coverage to `npm run check`.
- [ ] Run `npm test && npm run check && npm run build` and the full existing `npm run test:browser` gate.
- [ ] Commit `feat: add investigation protocol and legacy adapter`.

## Task 2: Complex React/Vite modern demo with deterministic multi-layer failure

**Files:**
- Create `apps/demo-modern/package.json`
- Create `apps/demo-modern/index.html`
- Create `apps/demo-modern/src/main.jsx`
- Create `apps/demo-modern/src/app.jsx`
- Create `apps/demo-modern/src/styles.css`
- Create `apps/demo-modern/src/mock-api.js`
- Create `apps/demo-modern/src/demo-contract.js`
- Create `tests/complex-demo-e2e.mjs`
- Modify root `package.json`
- Modify `scripts-build.mjs`

**Interfaces:**
- Demo exposes `window.__FAULTLINE_DEMO__` with read-only `version`, `canonicalJourney`, `bugState()`, and `candidateHints()` for deterministic test instrumentation only.
- Canonical journey: deployment row -> configuration drawer -> environment switch -> advanced toggle -> Save -> async success -> drawer exit -> stale backdrop intercepts pointer input.
- Demo must expose real observable noise: analytics request simulation, irrelevant activity rendering, unrelated chart updates, route/search state.

- [ ] Write `tests/complex-demo-e2e.mjs` first. Require a React-rendered dashboard, responsive sidebar, chart/table/activity/drawer/toast surfaces, two consecutive failing canonical journeys, pointer-blocking evidence after save, and successful reset.
- [ ] Run the test and confirm RED because `/demo/` does not exist.
- [ ] Add React/Vite demo dependencies at pinned stable versions and implement the dashboard without hard-coded reduction metrics.
- [ ] Implement the deterministic bug: successful async save closes the drawer visually but leaves the exiting backdrop mounted with `pointer-events:auto` until an incorrect lifecycle condition is satisfied.
- [ ] Build demo assets into `public/demo/` from root `npm run build`.
- [ ] Run the dedicated demo test twice plus full legacy browser regression.
- [ ] Commit `feat: replace toy demo with modern React failure case`.

## Task 3: Local Playwright capture coordinator + hostile URL policy

**Files:**
- Create `apps/coordinator/server.mjs`
- Create `apps/coordinator/url-policy.mjs`
- Create `apps/coordinator/capture-session.mjs`
- Create `apps/coordinator/redaction.mjs`
- Create `apps/coordinator/limits.mjs`
- Create `tests/url-policy.test.js`
- Create `tests/coordinator-capture-e2e.mjs`
- Modify `package.json`

**Interfaces:**
- `validateCaptureTarget(url, resolver)` returns normalized public target or typed rejection.
- Coordinator endpoints: `GET /health`, `POST /investigations`, `POST /captures`, `GET /operations/:id`, `POST /operations/:id/cancel`.
- Browser capture records DOM snapshot metadata, screenshots, console/runtime events, request/response metadata, route/navigation events, resources, and environment details into Investigation observations.
- Coordinator never binds beyond loopback by default.

- [ ] RED unit tests block `file:`, `data:`, localhost, IPv4/IPv6 private/link-local/reserved ranges, metadata endpoints, redirect-to-private targets, and simulated DNS rebinding.
- [ ] RED browser test starts a controlled modern target, sends it through coordinator capture, verifies hydration/dynamic content/console/network/route observations, and verifies a private redirect is refused.
- [ ] Implement bounded DNS resolution/redirect validation and browser-context permission/download restrictions.
- [ ] Implement explicit capture limits with `CAPTURE_LIMIT_REACHED` rather than silent truncation.
- [ ] Implement default redaction for authorization/cookies/password/autofill-sensitive values.
- [ ] Run security unit tests, capture E2E, then the complete legacy suite.
- [ ] Commit `feat: add secure local browser capture coordinator`.

## Task 4: Journey recording/replay + symptom-first oracle derivation

**Files:**
- Create `src/journey.js`
- Create `src/oracle-suggestions.js`
- Create `apps/coordinator/replay.mjs`
- Create `tests/journey-replay.test.js`
- Create `tests/journey-replay-e2e.mjs`
- Create `tests/oracle-suggestions.test.js`

**Interfaces:**
- `rankSelectorStrategies(elementSnapshot)` produces ordered role/name/test-id/text/CSS fallbacks.
- `replayJourney(page, journey, {signal})` returns operation status and separate oracle outcome.
- `suggestOracles(observations, selectedTarget?)` returns inspectable technical oracle definitions for visibility, clickability, content, route, runtime error, network status, visual region, and geometry.
- Reduction gate requires two consecutive matching `FAIL` results by default.

- [ ] RED tests selector ranking, stale-selector `UNRESOLVED`, cancellation, route transitions, async waits, and symptom-to-technical-oracle mapping.
- [ ] Implement immutable journey steps with explicit timeouts/preconditions and redacted sensitive inputs.
- [ ] Implement replay using Playwright locators with ranked fallback strategies.
- [ ] Implement reproducibility gate and explicit unstable-baseline override flag in evidence.
- [ ] Run all new journey/oracle tests plus coordinator and legacy suites.
- [ ] Commit `feat: add deterministic journey replay and oracle suggestions`.

## Task 5: Runtime capability discovery + reversible causal reduction

**Files:**
- Create `src/capability-registry.js`
- Create `src/causal-engine.js`
- Create `src/capabilities/journey.js`
- Create `src/capabilities/dom.js`
- Create `src/capabilities/style.js`
- Create `src/capabilities/network.js`
- Create `src/capabilities/resource.js`
- Create `src/capabilities/browser-state.js`
- Create `src/intervention-leases.js`
- Create `tests/capability-reduction.test.js`
- Create `tests/complex-demo-reduction-e2e.mjs`

**Interfaces:**
- Every capability implements `observe`, `discoverCandidates`, `describeCandidate`, `planIntervention`, `validateIntervention`, `applyIntervention`, `verifyApplied`, `restoreIntervention`, `verifyRestored`.
- `runCausalReduction({investigation, capabilityId, candidateIds, oracle, maxTrials, signal})` returns measured experiment/receipt data.
- Lease receipts bind target fingerprint, baseline capture ID, expected revision, plan hash, affected candidate IDs, fencing token, apply verification, and restore verification.

- [ ] RED tests reject unknown/unsupported mutation capabilities and stale revision/plan mismatches.
- [ ] RED dirty-target test forces restore verification failure and requires automatic reduction to stop.
- [ ] RED complex-demo reduction test requires real candidates across journey, DOM, style, and network/resource axes; proves baseline FAIL twice; runs experiments; preserves FAIL after reduction; and verifies a required-cause intervention changes outcome.
- [ ] Implement capability registry and lease-bound orchestration; reuse existing ddmin core only over stable candidate IDs.
- [ ] Implement each initial adapter with reversible browser interventions; never synthesize uncaptured remote API responses as evidence.
- [ ] Run reduction test repeatedly to detect nondeterminism, then complete legacy regression.
- [ ] Commit `feat: add runtime causal capabilities and verified restoration`.

## Task 6: Capture-first multi-page UI + advanced legacy path

**Files:**
- Replace `index.html` with Home dashboard.
- Create `new.html`, `capture.html`, `reproduce.html`, `fault-map.html`, `reduce.html`, `evidence.html`, `integrations.html`, `advanced.html`.
- Create `src/ui.css`, `src/app-shell.js`, `src/ui-home.js`, `src/ui-new.js`, `src/ui-capture.js`, `src/ui-reproduce.js`, `src/ui-fault-map.js`, `src/ui-reduce.js`, `src/ui-evidence.js`, `src/ui-integrations.js`, `src/ui-advanced.js`.
- Preserve existing `src/runtime.js`/`src/ui.js` behind the advanced legacy page until equivalent legacy adapter coverage exists.
- Create `tests/capture-first-ui.mjs`.
- Modify `tests/workbench-ui-structure.mjs` into legacy-page compatibility coverage.

**Interfaces:**
- Default `/` has no HTML/CSS/JS editor and prominently offers Public URL, Current Tab, Trace/Bundle import, saved investigations, and Complex Demo.
- All pages rehydrate the same Investigation from versioned persistence.
- Advanced page alone mounts the legacy source workbench.

- [ ] RED browser test requires all routes, one `h1` per page, skip links, visible focus, 390px no-overflow, keyboard navigation, and zero source editor on `/`.
- [ ] Implement shared black/white/neutral/pink developer-tool design system with page-specific layouts rather than repeated cards.
- [ ] Wire Public URL to coordinator health/capture, Complex Demo to real demo target, trace import to artifact parser, and Current Tab to companion status.
- [ ] Implement Capture timeline/observations, Reproduce reliability view, symptom-first Oracle, Fault Map, Reduce experiment workspace, Evidence receipts, and Integrations setup surfaces.
- [ ] Keep Advanced legacy workbench fully functional and regression-tested.
- [ ] Run all UI/browser/accessibility/mobile tests and complete legacy WebMCP suite.
- [ ] Commit `feat: ship capture-first multi-page product UI`.

## Task 7: Current-tab companion, investigation APIs, artifact/release hardening

**Files:**
- Create `apps/companion/manifest.json`, `apps/companion/service-worker.js`, `apps/companion/content.js`.
- Create `src/companion-protocol.js`.
- Create `src/investigation-api.js`.
- Create `src/artifact-bundle.js`.
- Create `tests/companion-protocol.test.js`, `tests/artifact-bundle.test.js`, `tests/investigation-agent-api.mjs`.
- Modify `scripts-build.mjs` to expose a single shipped-file manifest.
- Modify `tests/deployment-tree-parity.test.js` and `.github/workflows/deploy-production.yml` to consume that manifest for staged/live parity.
- Modify `README.md` and `docs/SECURITY.md`.

**Interfaces:**
- Investigation API operations: `investigation_create`, `investigation_inspect`, `capture_start`, `capture_status`, `journey_record_start`, `journey_record_stop`, `replay_run`, `oracle_suggest`, `oracle_lock`, `candidates_list`, `candidate_probe`, `reduction_run`, `operation_cancel`, `evidence_get`, `investigation_export`.
- Portable bundle contains schema/version manifest, checksums, redaction summary, lightweight metadata, and artifact references.
- Companion activation is explicit, origin scoped, visibly active, and export-previewable.

- [ ] RED protocol tests require explicit activation/origin scope and secret redaction.
- [ ] RED artifact tests reject future schema and checksum mismatch and prove export is read-only.
- [ ] RED agent API test requires expected revision on mutations and cancellation handles for long operations.
- [ ] Implement companion protocol/harness and local coordinator pairing without background unrelated-tab capture.
- [ ] Implement dynamic Browser API/WebMCP/MCP-facing logical contract; do not hard-code tool counts.
- [ ] Centralize shipped manifest so build and both production parity stages use the same source of truth.
- [ ] Update docs to describe capture-first product, local coordinator, security limitations, and Advanced legacy path.
- [ ] Run `npm test`, `npm run check`, `npm run build`, complete `npm run test:browser`, capture/demo/reduction suites, then PR CI.
- [ ] Merge only exact green head; allow production workflow to create protected staged deployment, verify manifest/artifact parity, promote, verify public alias, advance `production`, and create a verified checkpoint branch.
- [ ] Commit `feat: complete capture-first investigation platform`.

## Self-Review Result

- Spec coverage: all acceptance criteria map to Tasks 1–7; public URL capture, current-tab capture, complex demo, symptom-first oracle, capability reduction, restoration, security, legacy compatibility, agent interfaces, and release provenance each have explicit tests.
- Placeholder scan: no implementation placeholder/TBD requirements remain.
- Type/interface consistency: canonical object is `Investigation`; legacy cases convert through a compatibility adapter; coordinator/capabilities consume the same Investigation and observation model; operation status remains distinct from oracle outcome.

# FAULTLINE Organisational Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FAULTLINE organisationally credible by adding richer canonical browser actions, real-application Playwright execution, causal-equivalence enforcement, runtime-bound reproducer artifacts, immutable external qualification, and evidence-gated release status.

**Architecture:** Preserve the current portable sandbox reducer and add an explicitly separate caller-owned Playwright live mode. Both modes share a strict action/oracle vocabulary and causal fingerprint rules. Production status is computed from executed external evidence rather than repository test success alone.

**Tech Stack:** Node.js >=22, JavaScript ESM, Playwright 1.63, Node test runner, GitHub Actions/Vercel.

**Spec:** `docs/superpowers/specs/2026-09-15-organisational-readiness-design.md`

## Global Constraints

- Never silently convert unsupported behavior to PASS.
- `DIFFERENT_FAIL` and `UNRESOLVED` are distinct from preserved failure.
- Live execution receives an existing caller-owned Playwright Page.
- No cookies, auth headers, password values, file bytes or browser storage secrets may enter exported repro artifacts.
- Production status requires executed external evidence and minimum sample sizes.
- Existing local/CI boundary remains; shared hostile multi-tenant execution is unsupported.

---

### Task 1: Canonical richer action protocol

**Files:**
- Modify: `src/capture-contract.js`
- Modify: `src/runtime.js`
- Test: `tests/oracle-pointer-keyboard-actions.mjs`
- Create: `tests/oracle-focus-select-actions.mjs`

**Interfaces:**
- Produces canonical actions: `hover`, `pointer_move`, `key_press`, `focus`, `blur`, `scroll`, `select_option` plus existing actions.

- [ ] Extend the already-failing pointer/keyboard contract test with strict payload validation cases.
- [ ] Add failing tests for focus/blur/select-option and invalid coordinate/key/value payloads.
- [ ] Implement capture-contract validation with 16-step/5000ms bounds.
- [ ] Implement sandbox execution using browser-native MouseEvent/PointerEvent/KeyboardEvent, focus/blur, scroll and select change/input dispatch.
- [ ] Run the action contract and browser tests; require explicit `UNRESOLVED` for missing/invalid targets.
- [ ] Commit `feat: expand deterministic browser action protocol`.

### Task 2: Consolidate causal equivalence into production hardening

**Files:**
- Bring forward from PR #38: `src/causal-fingerprint.js`, `src/oracle-classes.js`, `src/causal-dependency-graph.js`, `src/flaky-policy.js`, `src/reduction-dimensions.js`, `src/reproducer-artifact.js` and associated tests/docs.
- Modify: `src/runtime.js`
- Modify: `bin/faultline.mjs`

**Interfaces:**
- Consumes `fingerprint(result, context)` from causal modules.
- Produces explicit candidate classification `SAME_CAUSE | DIFFERENT_FAIL | PASS | UNRESOLVED`.

- [ ] Merge PR #38 into the production-hardening branch rather than main.
- [ ] Resolve runtime/package conflicts in favor of the richer production branch while retaining causal modules.
- [ ] Add/retain failing false-equivalence test proving a different runtime error cannot be accepted merely because status is FAIL.
- [ ] Route every reduction trial through causal-equivalence classification.
- [ ] Independently rerun the final candidate and compare fingerprint again.
- [ ] Commit `feat: require causal equivalence for accepted reductions`.

### Task 3: Playwright live action/oracle runner

**Files:**
- Create: `integrations/playwright-live/index.js`
- Create: `src/live-action-contract.js`
- Create: `tests/playwright-live-actions.test.js`
- Create: `tests/playwright-live-oracles.test.js`

**Interfaces:**
- `runLiveTrial({ page, reset, recipe, oracle, provenance, signal }) -> {status,evidence,fingerprint,timing}`
- `executeLiveAction(page, action)`
- `evaluateLiveOracle(page, oracle)`

- [ ] Write failing tests against a real Playwright Page for hover, keyboard, scroll, focus/blur and select actions.
- [ ] Write failing tests showing reset runs before every trial and failed reset is `UNRESOLVED`.
- [ ] Implement native Playwright action dispatch, bounded waits and oracle evaluation.
- [ ] Capture browser/version/origin metadata but no secret browser state.
- [ ] Verify supported cases across Chromium and, when runtime available, Firefox/WebKit.
- [ ] Commit `feat: add caller-owned Playwright live execution`.

### Task 4: Runtime-bound action-sequence reducer

**Files:**
- Create: `src/live-reducer.js`
- Create: `tests/live-reducer.test.js`

**Interfaces:**
- `reduceLiveRecipe({ runTrial, recipe, maxTrials }) -> {recipe,trialCount,removedSteps,baselineFingerprint,finalFingerprint}`

- [ ] Write failing test where irrelevant setup steps are removed but the causal fingerprint remains identical.
- [ ] Write failing test where a shorter recipe yields a different failure and must be rejected.
- [ ] Implement bounded ddmin over action steps with reset before every trial.
- [ ] Require final independent rerun.
- [ ] Commit `feat: reduce runtime-bound action recipes safely`.

### Task 5: Runtime reproducer artifact

**Files:**
- Create: `src/runtime-reproducer-artifact.js`
- Create: `schema/faultline-runtime-repro-v1.schema.json`
- Create: `tests/runtime-reproducer-artifact.test.js`
- Modify: `bin/faultline.mjs`

**Interfaces:**
- `createRuntimeReproducerArtifact(input) -> faultline.runtime-repro.v1`

- [ ] Write failing schema/secret-redaction/provenance tests.
- [ ] Implement artifact generation with `portable:false`, exact source commit when supplied, reset ID, original/reduced recipe, fingerprints and metrics.
- [ ] Reject malformed/zero source SHAs when repository provenance claims an immutable commit.
- [ ] Add CLI inspect/export support.
- [ ] Commit `feat: export runtime-bound reproducer evidence`.

### Task 6: Immutable real-world qualification runner

**Files:**
- Modify/Create: `benchmarks/runners/run-faultline.mjs`
- Create: `src/qualification-evidence.js`
- Create: `tests/qualification-evidence.test.js`
- Modify: `benchmarks/manifests/upstream-playwright.json`

**Interfaces:**
- `validateQualificationManifest(manifest)` rejects placeholders/mutable identities.
- `summarizeQualification(results) -> metrics/status`.

- [ ] Write failing tests rejecting all-zero SHAs, missing original reproduction command, missing license/provenance, and fabricated result fields.
- [ ] Implement immutable manifest validation and result schemas.
- [ ] Compute supported reproduction rate, same-cause rate, false-equivalence count, reduction distributions and timing distributions.
- [ ] Keep external results absent until real cases execute; never seed fake green evidence.
- [ ] Commit `feat: gate qualification on immutable external evidence`.

### Task 7: Evidence-derived capability status

**Files:**
- Modify: `capability-matrix.json`
- Create: `scripts/qualification-gate.mjs`
- Create: `tests/qualification-gate.test.js`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Qualification gate returns non-zero unless sample size and thresholds are met for `PRODUCTION`.

- [ ] Write failing tests proving checked-in synthetic tests cannot promote status.
- [ ] Implement thresholds from the spec.
- [ ] Make generated release evidence include qualification digest/metrics.
- [ ] Leave capabilities EXPERIMENTAL until actual external evidence satisfies thresholds.
- [ ] Commit `feat: derive production status from real workload evidence`.

### Task 8: Zero-hosted-minute execution path

**Files:**
- Create: `.github/workflows/self-hosted-qualification.yml`
- Modify: `.github/workflows/production-integrity.yml`
- Test: `tests/deploy-production-contract.test.js`

**Interfaces:**
- Dedicated jobs use `[self-hosted, Linux, X64, production-ci]` only for trusted manual/main qualification paths.

- [ ] Add contract tests that self-hosted release jobs cannot run from fork/untrusted PR contexts with production secrets.
- [ ] Add manual qualification workflow with exact SHA input and source binding.
- [ ] Preserve hosted CI workflows for monthly quota reset.
- [ ] Commit `ci: add trusted self-hosted qualification path`.

### Task 9: Verification and release

- [ ] Execute Node/static/browser qualification available in the environment.
- [ ] Build/package/SBOM.
- [ ] Deploy preview from the hardening branch and exercise live UI/runtime behavior.
- [ ] Inspect Vercel runtime errors.
- [ ] Only after executable gates are green, merge the consolidated PR to main.
- [ ] Deploy exact qualified main SHA and independently verify `/release.json`, `/integrity.json` and all asset digests.
- [ ] Keep status `EXPERIMENTAL` if external sample-size evidence is still incomplete.

# Playwright Capture Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a deterministic failure from a real Playwright-controlled same-origin page and import it transactionally into FAULTLINE for baseline verification and reduction.

**Architecture:** A Node/Playwright adapter emits a strict `faultline.capture.v1` envelope. A browser-neutral normalizer validates that envelope. The canonical runtime adds one `importCapture` mutation that baseline-runs the normalized case before committing it, while UI and WebMCP call exactly that same mutation.

**Tech Stack:** ECMAScript modules, browser JavaScript, Node.js 22, Playwright 1.55/Chromium, static Vercel deployment.

**Spec:** `docs/superpowers/specs/2026-09-09-playwright-capture-ingestion-design.md`

## Global Constraints

- Do not weaken the existing CSP/sandbox/navigation/network containment boundary.
- Import must be atomic and optimistic-revision guarded.
- A capture may commit only when the normalized baseline returns `FAIL`.
- Unsupported or inaccessible source dependencies must be explicit errors, never silently dropped.
- Capture v1 serializes no cookies, storage, authentication headers, or response bodies.
- Existing raw case import and all 16 current WebMCP tools remain compatible; capture adds one new tool.

---

### Task 1: Prove the missing end-to-end capability

**Files:**
- Create: `tests/playwright-capture-ingestion.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `window.faultline`, case import UI, Playwright test harness pattern.
- Produces: a regression that requires `capture/playwright.mjs`, `window.faultline.importCapture`, provenance, and `faultline_import_capture`.

- [ ] **Step 1: Write the failing browser test**

Serve a real fixture page containing an input, button, status node, stylesheet, and script. Open it with Playwright. Dynamically import `../capture/playwright.mjs` and call:

```js
const capture=await captureFaultlineFailure(fixturePage,{
  label:'delayed form regression',
  actions:[
    {kind:'set_value',selector:'#name',value:'alice'},
    {kind:'click',selector:'#save'}
  ],
  oracle:{kind:'dom_property',selector:'#status',property:'textContent',equals:'broken',delayMs:0}
});
```

Then load the FAULTLINE workbench and assert:

```js
const before=await page.evaluate(()=>window.faultline.inspect());
const result=await page.evaluate(async ({revision,capture})=>
  window.faultline.importCapture({expectedRevision:revision,capture}),
  {revision:before.revision,capture}
);
assert.equal(result.baseline.status,'FAIL');
assert.equal(result.state.captureProvenance.label,'delayed form regression');
assert.equal(Number(result.state.revision.slice(1)),Number(before.revision.slice(1))+1);
assert.equal(await page.evaluate(()=>window.faultline.manifest().some(x=>x.name==='faultline_import_capture')),true);
```

Also assert stale import and a capture whose sandbox baseline is not `FAIL` leave revision/case/provenance unchanged.

- [ ] **Step 2: Wire the new test into `check` and `test:browser`**

Add `node --check tests/playwright-capture-ingestion.mjs` to `check` and `node tests/playwright-capture-ingestion.mjs` to `test:browser`.

- [ ] **Step 3: Push and verify RED in GitHub Actions**

Expected failure: module `capture/playwright.mjs` is missing or `window.faultline.importCapture` is undefined. Existing preceding tests must remain green.

- [ ] **Step 4: Commit the RED test**

Commit message: `test: require real Playwright failure capture ingestion`.

---

### Task 2: Add strict capture schema normalization

**Files:**
- Create: `src/capture.js`
- Create: `tests/capture-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeCapture(capture)` and `CAPTURE_SCHEMA='faultline.capture.v1'`.

- [ ] **Step 1: Write contract tests first**

Tests must accept a minimal valid envelope and reject wrong schema, extra top/source/provenance keys, non-string source fields, invalid expectedStatus, missing provenance fields, and malformed oracle/action shapes.

- [ ] **Step 2: Run the unit test and observe RED**

Expected: import/module missing.

- [ ] **Step 3: Implement `src/capture.js`**

`normalizeCapture` returns a deep-cloned object:

```js
{
  case:{html,cms:undefined,css,js,oracle},
  provenance:{url,title,capturedAt,userAgent,label?},
  expectedStatus:'FAIL'
}
```

The actual returned case must contain exactly `{html,css,js,oracle}`. Reuse the same oracle/action field rules as runtime v1, including sequence limits and 2000 ms total wait cap; do not import runtime.js because it has DOM side effects.

- [ ] **Step 4: Run contract tests GREEN**

- [ ] **Step 5: Add the contract test and `src/capture.js` syntax check to package scripts**

- [ ] **Step 6: Commit**

Commit message: `feat: define strict capture v1 contract`.

---

### Task 3: Implement the Playwright capture adapter

**Files:**
- Create: `capture/playwright.mjs`
- Create: `tests/playwright-capture-adapter.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Playwright `Page`, FAULTLINE oracle/action JSON.
- Produces: `captureFaultlineFailure(page,{label,actions,oracle}) -> Promise<CaptureV1>`.

- [ ] **Step 1: Write adapter tests first**

Test a same-origin fixture with inline CSS/JS and a same-origin external script. Require the emitted envelope to contain body HTML without script/style/link tags, collected CSS, collected JS, action sequence, real-page failure verification, and provenance. Add negative cases for a page that does not reach the failure and a cross-origin script dependency.

- [ ] **Step 2: Observe RED**

Expected: exported adapter function missing.

- [ ] **Step 3: Implement source collection**

Before actions, evaluate the page to collect cleaned body markup, readable stylesheet rules, inline classic scripts, and same-origin external classic script bodies. Reject inaccessible/cross-origin dependencies with `CAPTURE_UNSUPPORTED_DEPENDENCY`.

- [ ] **Step 4: Implement bounded action replay and oracle measurement on the real page**

Map `set_value` to `locator.fill`, `click` to `locator.click`, `set_checked` to `locator.check/uncheck`, and `wait` to `page.waitForTimeout`. Reuse v1 limits. Measure `dom_property`, `dom_attribute`, `computed_style`, and `dom_exists`. Reject unsupported `runtime_error` capture in v1 with `CAPTURE_UNSUPPORTED_ORACLE`.

- [ ] **Step 5: Require the real page to demonstrate the configured failure**

If the measured value does not equal `oracle.equals`, throw `CAPTURE_SOURCE_NOT_FAILING`.

- [ ] **Step 6: Run adapter tests GREEN and commit**

Commit message: `feat: capture Playwright failures as portable cases`.

---

### Task 4: Add transactional canonical capture import

**Files:**
- Modify: `src/runtime.js`
- Modify: `tests/playwright-capture-ingestion.mjs`

**Interfaces:**
- Consumes: `normalizeCapture`.
- Produces: `importCapture({expectedRevision,capture},{signal?})` and `inspect().captureProvenance`.

- [ ] **Step 1: Extend the failing ingestion test**

Require baseline execution before commit and non-mutation on PASS/UNRESOLVED/stale revision.

- [ ] **Step 2: Implement canonical provenance state**

Add `captureProvenance=null`. Include it in persistence snapshots and recoverable revision snapshots. Restore it with revisions and reset it for raw `loadCase` unless a private capture-import path supplies provenance.

- [ ] **Step 3: Implement `importCapture`**

Pseudo-contract:

```js
async function importCapture({expectedRevision=revision(),capture},{signal}={}){
  store.assertRevision(expectedRevision);
  const normalized=normalizeCapture(capture);
  const baseline=await runCase(normalized.case,{signal});
  throwIfAborted(signal);
  store.assertRevision(expectedRevision);
  if(baseline.status!=='FAIL')throw new Error(`CAPTURE_BASELINE_${baseline.status}`);
  // snapshot, clear pins, commit exactly once, bind provenance, persist, render
  return {baseline,state:inspect()};
}
```

- [ ] **Step 4: Expose browser API and one WebMCP tool**

Add `faultline_import_capture` requiring `expectedRevision` and a strict capture schema. Add it to `window.faultline` and manifest. Mark it mutating and untrusted-content-aware.

- [ ] **Step 5: Run ingestion test GREEN**

- [ ] **Step 6: Commit**

Commit message: `feat: import captured failures transactionally`.

---

### Task 5: Add accessible human capture import/export

**Files:**
- Modify: `src/ui.js`
- Modify: `tests/playwright-capture-ingestion.mjs`

**Interfaces:**
- Consumes: `window.faultline.importCapture` and `inspect().captureProvenance`.
- Produces: `#capture-import-json`, `#import-capture`, `#export-capture-json`.

- [ ] **Step 1: Add failing UI assertions**

Require a labelled capture JSON textarea, explicit import button, keyboard-expandable container, live error reporting, and export button only after successful captured-case import.

- [ ] **Step 2: Implement UI**

Create a separate `details#capture-import` adjacent to raw case import. Parse JSON, read current revision immediately before mutation, await `importCapture`, and report `READY`/baseline confirmation. Do not overwrite raw case JSON importer.

- [ ] **Step 3: Implement capture JSON export**

Preserve the last successful envelope in runtime state sufficiently to export a v1 envelope whose source reflects the current reduced case but whose provenance points to the original capture.

- [ ] **Step 4: Run UI/browser regression GREEN and commit**

Commit message: `feat: expose captured-failure workflow in workbench`.

---

### Task 6: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `SECURITY.md`

- [ ] **Step 1: Document the real workflow**

Show a Playwright example using `captureFaultlineFailure`, saving the returned object as `.faultline.json`, human import, browser API import, and `faultline_import_capture` WebMCP flow.

- [ ] **Step 2: Document trust boundary**

State same-origin v1 limitation, no secrets/storage capture, explicit unsupported dependencies, and baseline-before-commit semantics.

- [ ] **Step 3: Run full candidate CI**

Required: `npm test`, `npm run check`, `npm run build`, Chromium install, `npm run test:browser`.

- [ ] **Step 4: Re-read `main` and compare candidate**

Candidate must be 0 commits behind `main`; if `main` advanced, rebuild on the new verified base rather than force-updating.

- [ ] **Step 5: Fast-forward `main` non-force only after complete green**

- [ ] **Step 6: Let the existing guarded production workflow rerun the immutable tree**

No manual duplicate Vercel project. The workflow must remain bound to `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM` / `team_APBZJjf6iizHCTuseqHosFnU`.

- [ ] **Step 7: Verify staged/public parity and live UI/source**

Confirm Vercel `READY`, exact Git SHA, live capture controls, live runtime import API/schema, and zero project duplication.

- [ ] **Step 8: Verify recoverable `production` branch checkpoint**

`main`, `production`, and the promoted Vercel deployment must resolve to the exact same commit SHA.

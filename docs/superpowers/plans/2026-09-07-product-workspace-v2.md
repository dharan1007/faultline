# FAULTLINE Product Workspace V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense single-page FAULTLINE workbench with four production surfaces—Start, Workbench, Evidence, and Connect—while preserving one deterministic local-first runtime and exact-tree deployment integrity.

**Architecture:** Keep `src/runtime.js`, `src/reducer-engine.js`, and `src/sandbox-policy.js` as the canonical engine. Add page-specific UI modules over a shared shell/CSS layer, with same-origin navigation and state rehydration through `window.faultline.inspect()`. Expand build and deployment parity from the old five-file set to an explicit static manifest containing every shipped HTML/CSS/JS asset.

**Tech Stack:** Static HTML/CSS/ES modules, existing FAULTLINE browser runtime/WebMCP API, Node test runner, Playwright Chromium, GitHub Actions, Vercel static deployment.

**Spec:** `docs/superpowers/specs/2026-09-07-product-workspace-v2-design.md`

## Global Constraints

- Do not change WebMCP tool semantics merely to fit the UI.
- Preserve the experiment iframe sandbox and restrictive CSP.
- Preserve canonical revision guards, atomic case replacement, persistence, cancellation cleanup, result revision lineage, and recovery semantics.
- No arbitrary URL crawler, backend execution, account system, cloud persistence, analytics, or duplicate Vercel project.
- Every shipped file must be staged byte-for-byte into `public/` and verified against staged and public Vercel deployments.
- Existing Vercel project is `faultline-webmcp`, project ID `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`, team ID `team_APBZJjf6iizHCTuseqHosFnU`.

---

### Task 1: Static manifest + shared shell foundation

**Files:**
- Create: `src/ui.css`
- Create: `src/ui-shell.js`
- Create: `tests/product-surfaces.mjs`
- Modify: `scripts-build.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/deploy-production.yml`
- Modify: `tests/deployment-tree-parity.test.js`

**Interfaces:**
- `src/ui-shell.js` exports `faultlineState()`, `syncShell()`, `reportUiError(error)`, `downloadText(filename,text,type)`, and `copyText(text)`.
- `scripts-build.mjs` exports/uses one explicit `productionFiles` list that contains every deployed asset.

- [ ] **Step 1: Write RED production-surface/parity tests**

Create `tests/product-surfaces.mjs` that starts the existing local static server, opens `/`, `/workbench.html`, `/evidence.html`, and `/connect.html`, and asserts each page has one `<main>`, one `<h1>`, shared product navigation, and no 404 for `src/ui.css`/`src/ui-shell.js`. Extend `tests/deployment-tree-parity.test.js` to require the expanded manifest and reject any release workflow that compares only the old five files.

- [ ] **Step 2: Run RED through branch CI**

Expected: FAIL because the three new pages and shared assets do not exist and the build manifest is still five files.

- [ ] **Step 3: Add shared CSS/shell and explicit build manifest**

Implement `src/ui.css` for the dark FAULTLINE product shell, visible focus, skip links, responsive navigation, `prefers-reduced-motion`, status badges, panels, command bars, and mobile overflow protection. Implement `src/ui-shell.js` as a thin UI adapter over `window.faultline` with no canonical duplicate state. Update build/parity scripts and production workflow to use the complete asset manifest.

- [ ] **Step 4: Run deterministic/check/build tests**

Expected: unit/parity/check/build PASS for the foundation.

- [ ] **Step 5: Commit foundation**

Commit message: `feat: add multi-surface product shell and release manifest`

### Task 2: Start surface and real case intake

**Files:**
- Replace: `index.html`
- Create: `src/ui-start.js`
- Create: `tests/start-case-intake.mjs`

**Interfaces:**
- `parseCaseJson(text)` in `ui-start.js` parses JSON only; canonical validation remains `window.faultline.loadCase`.
- `loadImportedCase(candidate)` calls `window.faultline.loadCase({ expectedRevision, case:candidate })` exactly once.

- [ ] **Step 1: Write RED intake tests**

Playwright assertions: Start page exposes Continue session, Open case file, Paste case JSON, Load verified example, and Connect. Valid paste advances revision and navigates to Workbench. Invalid JSON/case leaves revision unchanged and reports an accessible error. File input accepts `.json,.faultline.json`. Drag/drop has the same parsing path and a keyboard-equivalent file picker.

- [ ] **Step 2: Run RED**

Expected: FAIL on missing controls/module.

- [ ] **Step 3: Implement Start UI**

Use one accessible intake panel, a hidden-but-labeled file input triggered by a button, drop zone with keyboard-equivalent input, paste dialog/details, verified example action using the existing fixture/case contract, and current-session card based on `window.faultline.inspect()`.

- [ ] **Step 4: Run intake + existing atomic import tests**

Expected: new Start intake tests PASS and `atomic-case-load`, `human-atomic-case-import`, `human-case-json-roundtrip`, and persistence tests remain PASS.

- [ ] **Step 5: Commit Start surface**

Commit message: `feat: add guided start and atomic case intake`

### Task 3: Workbench redesign with guided oracle and contextual reduction

**Files:**
- Create: `workbench.html`
- Create: `src/ui-workbench.js`
- Create: `tests/workbench-v2.mjs`
- Modify: `tests/workbench-ui-structure.mjs`
- Modify: `tests/source-axis-tab-accessibility.mjs`

**Interfaces:**
- Workbench uses existing `window.faultline.inspect/loadCase/applySource/defineOracle/run/units/probe/pin/reduce/autopilot/revisions/restore/cancelActive` APIs only.
- Oracle intent maps: `exists -> dom_exists`, `property -> dom_property`, `style -> computed_style`, `runtime -> runtime_error`.
- Reduction rows derive from `window.faultline.units({targetAxis})` and history/results; no separate canonical model.

- [ ] **Step 1: Write RED Workbench V2 tests**

Assert desktop three-zone hierarchy; mobile source -> oracle -> reduction sequence; no 390px overflow; top command bar; guided oracle progressively hides irrelevant fields; Test oracle reports FAIL/PASS/UNRESOLVED; semantic rows expose probe/pin/copy actions; revision recovery remains available; source tabs retain arrow/Home/End keyboard semantics.

- [ ] **Step 2: Run RED**

Expected: FAIL on missing Workbench V2 page/controls.

- [ ] **Step 3: Implement Workbench V2**

Build left session/source rail, center editor/frontier, right preview/oracle inspector, and command bar. Keep the visible preview isolated exactly as runtime provides. Use contextual unit actions and explicit status text in addition to color.

- [ ] **Step 4: Run Workbench and core browser regression set**

Expected: Workbench V2 tests PASS plus browser-e2e, oracle validation, canonical preview isolation, cancellation, revision isolation, pin integrity, recovery, and WebMCP unit discovery remain PASS.

- [ ] **Step 5: Commit Workbench**

Commit message: `feat: rebuild workbench around guided deterministic debugging`

### Task 4: Evidence and Connect production surfaces

**Files:**
- Create: `evidence.html`
- Create: `connect.html`
- Create: `src/ui-evidence.js`
- Create: `src/ui-connect.js`
- Create: `tests/evidence-connect-v2.mjs`

**Interfaces:**
- Evidence reads only from public inspect/history/revisions/export APIs and must not call canonical mutation operations during page initialization/rendering.
- Connect tool catalog is generated from `window.faultline.manifest()`; hard-coded tool counts are forbidden.

- [ ] **Step 1: Write RED Evidence/Connect tests**

Evidence: record revision before navigation, render metrics/timeline, verify revision unchanged after load/refresh, verify export/copy controls. Connect: assert rendered count equals `window.faultline.manifest().length`, every manifest tool name appears, runtime revision is shown, Browser API and recommended WebMCP sequence are present, and native WebMCP availability is reported independently of tool count.

- [ ] **Step 2: Run RED**

Expected: FAIL on missing pages/modules.

- [ ] **Step 3: Implement Evidence**

Render current revision/oracle state, current source size, earliest-available retained baseline size, reduction percentage when provable, experiment count, pinned/retained information, lineage-aware timeline, reproducer export, case export, and copyable text summary. Label unavailable baseline metrics instead of guessing.

- [ ] **Step 4: Implement Connect**

Render live manifest-derived tool count/catalog, WebMCP host availability, current revision/local-first status, browser API examples, recommended agent sequence, case handoff schema/example, and copy buttons.

- [ ] **Step 5: Run Evidence/Connect + serialization/WebMCP tests**

Expected: new tests PASS and evidence lineage, native result serialization, native signal, explicit-axis contract, and manifest registration tests remain PASS.

- [ ] **Step 6: Commit Evidence/Connect**

Commit message: `feat: add evidence and live WebMCP connection surfaces`

### Task 5: Remove legacy UI dependency and harden full release

**Files:**
- Delete after proof: `src/ui.js`
- Modify: `README.md`
- Modify: `package.json`
- Modify: all relevant UI tests to new routes
- Modify: `scripts-build.mjs`
- Modify: `.github/workflows/deploy-production.yml`

- [ ] **Step 1: Add RED assertion that no shipped page references `src/ui.js` and all shipped assets are in production manifest**

Expected: FAIL while legacy page/module reference remains.

- [ ] **Step 2: Remove legacy dependency and update docs/scripts**

Update README from stale nine-tool/single-page copy to the live manifest-driven product surfaces and current verification commands. Remove `src/ui.js` only when no page/test imports it.

- [ ] **Step 3: Run complete verification**

Run via branch CI: `npm test`, `npm run check`, `npm run build`, full `npm run test:browser`. All existing security/containment/persistence/cancellation/recovery tests plus new UI tests must PASS.

- [ ] **Step 4: PR gate**

Open PR to `main`; require PR-context CI on exact head SHA. Review changed-file scope and ensure no reducer/sandbox weakening slipped in.

- [ ] **Step 5: Guarded merge and production release**

Re-read `main`, merge with expected head SHA, then require the production workflow to pass deterministic, syntax, build, full Chromium/WebMCP, stale-main, fast-forward, protected staged full-manifest parity, Vercel promote, anonymous public full-manifest parity, and production-branch advancement.

- [ ] **Step 6: Live verification and checkpoint**

Verify the existing `faultline-webmcp` deployment is READY and live routes `/`, `/workbench.html`, `/evidence.html`, `/connect.html` all return current assets. Create `verified/2026-09-07-product-workspace-v2` at the deployed SHA only after successful production verification.

# Hierarchical Reducer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace FAULTLINE's shallow HTML/CSS reducer discovery with deterministic hierarchical units and coarse-to-fine reduction while preserving all production correctness invariants.

**Architecture:** `src/reducer-engine.js` becomes the canonical structural-scanning and hierarchy utility boundary. `src/runtime.js` orchestrates hierarchical frontier reduction against immutable revision snapshots, protects pinned ancestor chains, consumes one global trial budget, independently re-verifies the final candidate, and exposes hierarchy metadata through existing Browser API/WebMCP surfaces. Browser tests prove the full canonical workflow rather than only parser output.

**Tech Stack:** Browser JavaScript ES modules, Node.js test runner, Playwright 1.55.0, existing FAULTLINE sandbox/runtime/WebMCP implementation.

**Spec:** `docs/superpowers/specs/2026-09-09-hierarchical-reducer-design.md`

## Global Constraints

- Production invariants in `AGENTS.md` remain mandatory.
- No new runtime dependency is introduced.
- JavaScript semantic-unit behavior is unchanged in this run.
- `UNRESOLVED` never preserves failure.
- One global reduction trial budget covers every hierarchy frontier pass plus final verification accounting exactly as documented by runtime results.
- Existing WebMCP unit fields remain backward-compatible; hierarchy metadata is additive.
- Production deployment remains bound to the existing `faultline-webmcp` Vercel project only.

---

### Task 1: Structural scanner RED tests

**Files:**
- Modify: `tests/reducer-engine.test.js`
- Modify: `src/reducer-engine.js`

**Interfaces:**
- Produces: `semanticUnits(axis, source)` units with additive `depth:number` and `parentId:string|null` for HTML/CSS.

- [ ] Add failing tests asserting nested HTML exposes parent and child subtree units with stable `depth`/`parentId`, void elements are leaves, raw-text script/style contents do not create fake HTML descendants, CSS style rules expose declaration children, and braces/semicolons inside quoted values/comments do not corrupt ranges.
- [ ] Run `node --test tests/reducer-engine.test.js` and verify the new assertions fail against the shallow regex implementation.
- [ ] Implement deterministic balanced scanners in `src/reducer-engine.js`: HTML tag tokenization with stack pairing/raw-text skipping and CSS brace/string/comment scanning with declaration extraction.
- [ ] Run `node --test tests/reducer-engine.test.js` and make all parser tests pass without changing JS-unit behavior.
- [ ] Commit the parser/test deliverable.

### Task 2: Hierarchy helpers and pin closure

**Files:**
- Modify: `src/reducer-engine.js`
- Modify: `tests/reducer-engine.test.js`

**Interfaces:**
- Produces: `ancestorClosure(units, pinnedIds)` returning a `Set` containing each pinned id plus every discoverable ancestor.
- Produces: `hierarchyFrontier(units, protectedIds, depth)` returning deterministic non-overlapping units at the requested depth whose ancestors have not already been removed.

- [ ] Add failing unit tests for upward ancestor protection, deterministic root/child frontiers, and absence of ancestor/descendant overlap inside one frontier.
- [ ] Run the focused reducer-engine tests and verify RED.
- [ ] Implement `ancestorClosure` and `hierarchyFrontier` with cycle/unknown-parent defensive handling.
- [ ] Run focused tests and verify GREEN.
- [ ] Commit hierarchy helpers.

### Task 3: Hierarchical runtime reduction

**Files:**
- Modify: `src/runtime.js`
- Modify: `tests/reduction-budget-integrity.mjs`
- Create: `tests/hierarchical-reduction.mjs`

**Interfaces:**
- Consumes: `semanticUnits`, `removeUnits`, `ddminReduce`, `ancestorClosure`, `hierarchyFrontier`.
- Produces: canonical reduce results whose trial accounting spans all frontier passes and whose committed source is independently reverified as `FAIL`.

- [ ] Add a browser RED test with nested HTML and CSS where a whole irrelevant parent branch and irrelevant declarations should be removed before deeper surviving units are considered; pin a descendant that would disappear if its ancestor were incorrectly removable.
- [ ] Extend budget-integrity coverage so multiple frontier passes share one max-trial budget and never reset per depth.
- [ ] Run the new browser test(s) against current runtime and verify RED.
- [ ] Refactor the canonical reduction path in `src/runtime.js` to iterate structural frontiers coarse-to-fine from an immutable revision snapshot, close pins upward, apply accepted source changes, rediscover hierarchy after each accepted pass, remap protected surviving units deterministically, and consume a single remaining-trials counter.
- [ ] Independently execute the final candidate; require `FAIL` before canonical commit. Preserve stale revision, abort, persistence rollback, and experiment-ledger semantics.
- [ ] Run focused browser tests and existing reduction isolation/budget/pin tests until GREEN.
- [ ] Commit runtime hierarchy orchestration.

### Task 4: WebMCP and accessible unit metadata

**Files:**
- Modify: `src/runtime.js`
- Modify: `src/ui.js` only if unit rendering requires explicit hierarchy/protection labels.
- Modify: `tests/webmcp-unit-discovery.mjs`
- Modify: `tests/source-axis-tab-accessibility.mjs` if UI metadata is rendered.

**Interfaces:**
- `faultline_units` returns existing fields plus `depth` and `parentId` for hierarchical units.

- [ ] Add RED WebMCP assertions for nested HTML/CSS hierarchy metadata and backward-compatible existing fields.
- [ ] If the human unit list renders hierarchy, add an accessibility assertion that hierarchy/protection information is available as text/ARIA and keyboard behavior is unchanged.
- [ ] Implement the minimal surface changes required to expose canonical metadata; do not duplicate hierarchy logic in UI/WebMCP adapters.
- [ ] Run focused WebMCP/accessibility tests until GREEN.
- [ ] Commit integration-surface changes.

### Task 5: Documentation truth and complete verification

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `README.md` if minimality/capability claims require alignment.
- Modify: `ROADMAP.md` to mark hierarchical HTML/CSS production reduction complete and leave parser-backed JS reduction as future work.
- Modify: `package.json` to include new browser test(s) in `check` and `test:browser`.

- [ ] Update docs so production claims exactly match the shipped hierarchy implementation and its non-HTML5/non-CSSOM boundaries.
- [ ] Add new browser test files to syntax/full-browser scripts.
- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run check` and require zero syntax failures.
- [ ] Run `npm run build` and require a verified production tree.
- [ ] Run the complete `npm run test:browser` Playwright/Chromium suite and require zero failures.
- [ ] Inspect the exact branch commit tree and verify no unrelated cosmetic churn or new deployment project configuration.
- [ ] Commit documentation/test wiring.

### Task 6: Guarded promotion and recoverable checkpoint

**Files:**
- No source edits unless a verified gate exposes a defect; any defect returns to the relevant TDD task.

- [ ] Re-read GitHub `main` immediately before promotion and ensure it still descends from the verified baseline; if it moved incompatibly, stop and leave production unchanged.
- [ ] Fast-forward `main` to the exact green candidate without force.
- [ ] Verify branch CI/status checks for the exact SHA where available.
- [ ] Run the repository's existing guarded production deployment workflow for that immutable SHA; do not create a Vercel project.
- [ ] Verify Vercel reports project id `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`, project name `faultline-webmcp`, target `production`, state `READY`, and the exact Git SHA.
- [ ] Fetch/inspect the public production artifact and exercise the hierarchical reduction path in a real browser against production.
- [ ] Advance the recoverable `production` branch/checkpoint only after public verification succeeds.

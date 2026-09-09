# Hierarchical Reduction v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shallow HTML/CSS reduction with deterministic hierarchical semantic units and coarse-to-fine reduction while preserving FAULTLINE's production invariants.

**Architecture:** `src/reducer-engine.js` owns structural discovery, hierarchy metadata, ancestor closure, frontier reduction and pin-path remapping helpers. `src/runtime.js` remains the canonical orchestration layer: it validates revision/cancellation, evaluates candidates in the existing sandbox, remaps explicit pins transactionally, performs final FAIL verification and commits. WebMCP and the human workbench consume the same richer unit metadata.

**Tech Stack:** Browser-native ES modules, Node 22 tests, Playwright 1.55 Chromium, GitHub Actions, Vercel static deployment.

**Spec:** `docs/superpowers/specs/2026-09-09-hierarchical-reduction-v1-design.md`

## Global Constraints

- Do not add runtime dependencies or remote services.
- `UNRESOLVED` must never count as a successful removal.
- A committed reduction must independently reverify `FAIL`.
- One global trial budget applies across all hierarchy frontiers.
- Budget exhaustion, abort, stale revision, or pin-remap failure must leave canonical state unchanged.
- `src/domain.js` remains non-canonical and untouched.
- Existing WebMCP request shapes remain compatible.

---

### Task 1: RED structural discovery contract

**Files:**
- Modify: `tests/reducer-engine.test.js`

**Interfaces:**
- Consumes: existing `semanticUnits(axis, source)`.
- Produces: failing tests requiring `depth`/`parentId`, nested HTML parent ranges, CSS declaration child units, and quote/comment-safe boundaries.

- [ ] **Step 1: Add RED tests** asserting `<main><section><p>A</p></section><aside>B</aside></main>` exposes `main`, `section`, `p`, and `aside` with deterministic hierarchy metadata, and `.card{width:300px;color:red}` exposes one rule plus `width` and `color` declaration children.
- [ ] **Step 2: Add malformed/quoted boundary cases** proving `>` in an HTML attribute, CSS braces in strings/comments, and unbalanced HTML do not create corrupt ranges.
- [ ] **Step 3: Push tests only and confirm CI fails for the expected missing capability.**

### Task 2: Implement deterministic HTML/CSS scanners

**Files:**
- Modify: `src/reducer-engine.js`
- Test: `tests/reducer-engine.test.js`

**Interfaces:**
- Produces: `semanticUnits(axis, source)` units with `{id,axis,start,end,kind,text,depth,parentId}` for HTML/CSS, preserving current JS behavior with `depth:0,parentId:null`.

- [ ] **Step 1: Implement quote/comment-aware HTML tag scanning** with stack-based balanced element ranges, void-element handling and conservative malformed-fragment behavior.
- [ ] **Step 2: Implement brace/string/comment-aware CSS block scanning** with rule hierarchy and direct declaration child ranges.
- [ ] **Step 3: Run `npm test` in CI and require all structural discovery tests green.**

### Task 3: RED hierarchy reduction and pin semantics

**Files:**
- Modify: `tests/reducer-engine.test.js`
- Create: `tests/hierarchical-reduction.mjs`
- Modify: `package.json`

**Interfaces:**
- Requires future `hierarchicalReduce(...)`, `protectedHierarchyIds(...)`, and structural-path remapping helpers from `src/reducer-engine.js`.

- [ ] **Step 1: Add unit tests** requiring pinned-descendant ancestor closure, overlap-free frontier behavior, global trial-budget exhaustion, and deterministic structural paths.
- [ ] **Step 2: Add Chromium RED acceptance** that loads a nested case, pins a required descendant, reduces HTML and CSS, and checks WebMCP hierarchy metadata plus canonical/exported source.
- [ ] **Step 3: Add the browser test to `check` and `test:browser`, push, and confirm the expected RED failures.**

### Task 4: Implement hierarchy-aware reducer helpers

**Files:**
- Modify: `src/reducer-engine.js`

**Interfaces:**
- Produces:
  - `protectedHierarchyIds(units, explicitIds) -> Set<string>`
  - `structuralPathFor(units, unitId) -> string | null`
  - `findUnitByStructuralPath(units, path) -> unit | null`
  - `hierarchicalReduce(units, evaluateRemovedIds, {protectedItems,maxTrials}) -> {removedIds,trials,trialCount,frontiers}`

- [ ] **Step 1: Implement ancestor closure and structural-path helpers.**
- [ ] **Step 2: Implement breadth-first non-overlapping frontier construction.**
- [ ] **Step 3: Implement hierarchical ddmin with one shared budget; throw `TRIAL_BUDGET_EXHAUSTED` before returning an incomplete search.**
- [ ] **Step 4: Run unit tests in CI and require green.**

### Task 5: Integrate canonical runtime transactionally

**Files:**
- Modify: `src/runtime.js`

**Interfaces:**
- Consumes hierarchy helpers.
- `units()` adds `depth`, `parentId`, `protectedByPin`.
- `reduce()` uses hierarchical reduction for HTML/CSS and flat ddmin for JS.

- [ ] **Step 1: Compute explicit pin structural paths before reduction and ancestor-protected metadata for unit listing.**
- [ ] **Step 2: Materialize candidate source using only topmost removed ranges and execute through existing `runCase` sandbox.**
- [ ] **Step 3: Reverify final candidate as `FAIL`; rediscover units; remap explicit pins by structural path; abort with `PIN_REMAP_FAILED` if any explicit pin cannot be recovered.**
- [ ] **Step 4: Commit source + remapped pins atomically only after all gates pass; preserve stale revision, abort and persistence rollback semantics.**
- [ ] **Step 5: Return exact `hierarchical` and `frontiers` metadata without overstating global minimality.**

### Task 6: Human/WebMCP surface and documentation

**Files:**
- Modify: `src/runtime.js`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/WEBMCP.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Human unit rows visually indent by `depth` and label `pinned` vs `protected by pin`.
- WebMCP `faultline_units` emits hierarchy metadata using the canonical `units()` result.

- [ ] **Step 1: Add compact hierarchy indentation and protection labeling without changing overall layout.**
- [ ] **Step 2: Update docs to state exact HTML/CSS hierarchy/minimality boundary and JS limitation.**
- [ ] **Step 3: Run `npm run check` and `npm run build` in CI.**

### Task 7: Full verification and guarded production promotion

**Files:**
- No feature code changes unless a failing gate reveals a real defect.

- [ ] **Step 1: Re-read `main` and confirm it still equals the verified base or can fast-forward safely from it.**
- [ ] **Step 2: Require exact feature-head CI + CodeQL green, including full Chromium suite.**
- [ ] **Step 3: Fast-forward `main` without force to the exact green feature SHA.**
- [ ] **Step 4: Require `main` CI green on the exact SHA.**
- [ ] **Step 5: Deploy only through the existing `faultline-webmcp` Vercel project and verify project ID `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM` before promotion.**
- [ ] **Step 6: Fetch the public production artifact and perform real-browser verification of hierarchical unit discovery/reduction.**
- [ ] **Step 7: Advance `production` branch by non-force fast-forward to the exact deployed SHA only after public verification succeeds.**
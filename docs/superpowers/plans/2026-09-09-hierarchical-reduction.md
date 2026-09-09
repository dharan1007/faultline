# Hierarchical HTML/CSS Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat HTML/CSS reduction with deterministic coarse-to-fine hierarchical reduction that preserves pinned descendants and exposes structure through WebMCP and the human workbench.

**Architecture:** `src/reducer-engine.js` becomes the single structural scanner/removal/reduction primitive provider. `src/runtime.js` derives ancestor protection, performs hierarchical passes under one global budget, remaps pins before commit, and exposes hierarchy metadata. The UI only renders that canonical metadata; it does not implement independent hierarchy logic.

**Tech Stack:** Browser-native ES modules, Node.js 22 tests, Playwright 1.55 Chromium, GitHub Actions, Vercel exact-tree production workflow.

**Spec:** `docs/superpowers/specs/2026-09-09-hierarchical-reduction-design.md`

## Global Constraints

- No new runtime or parser dependencies.
- Preserve existing unit fields `id`, `axis`, `start`, `end`, `kind`, `text`.
- HTML/CSS hierarchy metadata is `parentId` and `depth`; JS remains flat in this run.
- Direct pins remain the only persisted pin state; ancestor protection is derived.
- `maxTrials` is a single global budget for each reduction invocation.
- Any failed/stale/aborted/budget-exhausted/pin-remap operation leaves canonical state unchanged.
- Production deployment must remain bound to Vercel project `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`.

---

### Task 1: Structural scanners and safe removal

**Files:**
- Modify: `src/reducer-engine.js`
- Modify: `tests/reducer-engine.test.js`

**Interfaces:**
- Produces: `semanticUnits(axis, source)` with `parentId` and `depth`.
- Produces: `removeUnits(source, units)` with hierarchical range collapsing and overlap validation.

- [ ] **Step 1: Write failing scanner/removal tests**

Add assertions that HTML units include `main`, `p`, and `aside` with correct parent/depth; CSS rules expose declaration children; removing an ancestor plus its descendant removes the ancestor exactly once; partial overlaps throw `OVERLAPPING_UNIT_RANGES`.

- [ ] **Step 2: Run `npm test` and verify RED**

Expected: scanner assertions fail because the current HTML scanner returns only leaf nodes and CSS returns only rules.

- [ ] **Step 3: Implement deterministic scanners**

Implement a stack-based HTML tokenizer with raw-text/void handling and a brace/string/comment-aware CSS block scanner. Use only source offsets; do not normalize or reserialize source.

- [ ] **Step 4: Implement safe range collapsing**

Sort selected ranges, discard descendants covered by selected ancestors, reject partially overlapping ranges, then remove canonical ranges from right to left.

- [ ] **Step 5: Run `npm test` and verify GREEN**

Expected: all deterministic tests pass.

### Task 2: Runtime hierarchy, ancestor protection and pin remapping

**Files:**
- Modify: `src/runtime.js`
- Create: `tests/hierarchical-reduction.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `units()` entries with `parentId`, `depth`, `pinned`, `protectedByDescendant`.
- Produces: hierarchy-aware `reduce()` for HTML/CSS and unchanged flat JS reduction.

- [ ] **Step 1: Write RED browser test**

The Playwright test loads a nested failing case, pins a required descendant, asserts the parent is reported `protectedByDescendant`, runs HTML reduction, verifies an irrelevant whole subtree disappears, verifies the required ancestor/descendant remain, and confirms the final case still returns `FAIL`.

- [ ] **Step 2: Add the test to `check` and `test:browser` scripts and run branch CI**

Expected: RED because current `faultline_units` lacks hierarchy metadata and flat reduction has no ancestor closure.

- [ ] **Step 3: Derive structural pin closure**

Build maps by unit ID, walk direct pinned units to root, and mark ancestors protected without persisting synthetic pins.

- [ ] **Step 4: Implement coarse-to-fine reducer**

For HTML/CSS: maintain a remaining trial budget, evaluate non-overlapping frontiers, rescan after accepted branch removal, descend only into surviving branches, and perform final independent `FAIL` verification.

- [ ] **Step 5: Remap direct pins before commit**

Capture direct pin descriptors before reduction and resolve them against the final source using kind/text/ancestor signature. Throw `PIN_REMAP_FAILED` before mutation if any descriptor cannot be uniquely resolved.

- [ ] **Step 6: Run full branch CI and verify GREEN**

Expected: deterministic suite, syntax, build, Chromium and all existing WebMCP/capture/security tests pass.

### Task 3: WebMCP contract and accessible workbench hierarchy

**Files:**
- Modify: `src/runtime.js`
- Modify: `tests/webmcp-unit-discovery.mjs`
- Modify: `tests/workbench-ui-structure.mjs`
- Modify: `docs/WEBMCP.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- `faultline_units` exposes `parentId`, `depth`, `pinned`, `protectedByDescendant`.
- Human unit buttons expose `data-depth` and readable structural/protection labels.

- [ ] **Step 1: Extend WebMCP/UI tests first**

Require hierarchy metadata through the registered WebMCP tool and require the unit list to remain keyboard buttons with deterministic depth/protection text.

- [ ] **Step 2: Run relevant tests and confirm RED**

Expected: current UI does not expose structural depth/protection.

- [ ] **Step 3: Render canonical metadata**

Update `renderUnits()` only; do not duplicate scanner logic in the UI.

- [ ] **Step 4: Correct docs**

Document the actual production hierarchy contract, pin closure, bounded coarse-to-fine behavior, and explicitly state that JS remains statement-level.

- [ ] **Step 5: Run complete branch CI**

Expected: all checks green.

### Task 4: Production promotion and recovery checkpoint

**Files:**
- No production workflow changes unless verification proves the existing workflow insufficient.

**Interfaces:**
- `main` becomes the exact verified candidate by non-force fast-forward only.
- Existing `deploy-production.yml` performs exact-tree Vercel build, staged parity, promotion, live parity, then moves `production`.

- [ ] **Step 1: Re-read `main` and `production` immediately before promotion**

Require both still descend from baseline `1e1ab54f5483499d8bb14cf4acaff08af8c0da87` and require `main` not to have moved independently.

- [ ] **Step 2: Fast-forward `main` to the verified branch SHA without force**

- [ ] **Step 3: Wait for `ci`, CodeQL and `Promote verified FAULTLINE production` on the exact SHA**

Inspect failed jobs/logs rather than claiming success from workflow creation alone.

- [ ] **Step 4: Verify Vercel project/deployment directly**

Require project name `faultline-webmcp`, project ID `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`, production state `READY`, and the deployed Git SHA equal the verified candidate.

- [ ] **Step 5: Verify live UI/source and recovery branch**

Fetch the production alias, confirm hierarchy behavior/source is served, and require `production` equals the deployed SHA. If any gate fails, leave the last verified production deployment/checkpoint unchanged and report the blocker.
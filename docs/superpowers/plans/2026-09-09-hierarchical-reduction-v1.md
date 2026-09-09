# Hierarchical Reduction v1 Implementation Plan

> **For agentic workers:** Use the execution/verification skills appropriate to the environment. This plan records the production implementation and its evidence gates.

**Goal:** Replace shallow HTML/CSS reduction with deterministic hierarchical semantic units and coarse-to-fine reduction while preserving FAULTLINE's production invariants.

**Architecture:** `src/reducer-engine.js` owns structural discovery, hierarchy metadata, ancestor closure, exact offset pin remapping, and frontier reduction. `src/runtime.js` remains the canonical orchestration layer: it validates revision/cancellation, evaluates candidates in the existing sandbox, remaps explicit pins transactionally, performs final FAIL verification, and commits. WebMCP and the human workbench consume the same richer unit metadata.

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

### Task 1: RED structural discovery contract — complete

- [x] Add RED tests requiring deterministic nested HTML `depth`/`parentId`, CSS declaration children, and conservative quote/comment/malformed handling.
- [x] Push tests without implementation and confirm CI fails specifically at `npm test`.

### Task 2: Deterministic HTML/CSS scanners — complete

- [x] Implement quote/comment-aware stack-based HTML scanning with balanced subtrees, void elements, raw-text handling, and conservative malformed boundaries.
- [x] Implement brace/string/comment-aware CSS rule hierarchy and direct declaration discovery.
- [x] Preserve current JavaScript behavior with `depth: 0` / `parentId: null`.
- [x] Confirm structural unit tests pass before moving to runtime integration.

### Task 3: RED hierarchy reduction and pin semantics — complete

- [x] Add RED unit tests for ancestor closure, global trial budget, coarse-to-fine parent/child reduction, and exact pin offset remapping.
- [x] Add Chromium acceptance covering HTML reduction, CSS declaration reduction, WebMCP metadata, human workbench metadata, pin remapping, final FAIL, and export.
- [x] Confirm the isolated browser RED fails at the canonical runtime hierarchy boundary rather than at the helper layer.

### Task 4: Hierarchy-aware reducer helpers — complete

The final interfaces are:

- `protectedHierarchyIds(units, explicitIds) -> Set<string>`
- `remapUnitAfterRemoval(unit, removedUnits, nextUnits) -> unit | null`
- `hierarchicalReduce(units, evaluateRemovedIds, {protectedItems,maxTrials}) -> {removedIds,trials,trialCount,frontiers,protectedIds}`

The original sibling-index structural-path remapping idea was rejected during implementation because deleting an earlier sibling changes the path. The production design instead transforms exact source ranges by known accepted removals, then requires rediscovery with matching transformed offsets, `kind`, and exact `text`. Duplicate text therefore does not introduce guesswork.

- [x] Implement ancestor closure.
- [x] Implement exact range remapping.
- [x] Implement breadth-first frontier reduction with descendants of removed parents suppressed.
- [x] Share one explicit `maxTrials` budget across all frontiers and throw `TRIAL_BUDGET_EXHAUSTED` instead of returning a partial search.
- [x] Confirm helper unit suite is green.

### Task 5: Canonical runtime integration — complete

- [x] `units()` exposes `depth`, `parentId`, `pinned`, and `protectedByPin` from canonical discovery.
- [x] HTML/CSS `reduce()` uses `hierarchicalReduce`; JavaScript remains the flat bounded reducer and is reported as such.
- [x] Candidate source remains non-mutating during search and executes only through existing `runCase` sandbox boundaries.
- [x] Final materialized candidate is independently reverified as `FAIL`.
- [x] Explicit pins are remapped by exact transformed range; any unprovable remap aborts with `PIN_REMAP_FAILED` before commit.
- [x] Revision is rechecked immediately before canonical mutation.
- [x] Source + remapped pins use the existing persistence rollback boundary and are recorded in the same revision snapshot.
- [x] Reduction results expose exact `hierarchical` and `frontiers` metadata without a global-minimality claim.

### Task 6: Human/WebMCP surface and documentation — complete

- [x] Human unit rows remain native focusable buttons, indent by `depth`, and distinguish explicit `pinned` units from ancestors `protected by pin`.
- [x] WebMCP `faultline_units` uses the same canonical unit result and exposes hierarchy/protection metadata.
- [x] README, architecture, WebMCP contract, and roadmap describe the shipped HTML/CSS hierarchy and explicit JavaScript limitation.
- [x] WebMCP documentation reflects the existing 17-tool surface including `faultline_import_capture`.

### Task 7: Full verification and guarded production promotion — in progress

- [ ] Re-read `main` and confirm it still equals the verified base or can fast-forward safely from it.
- [ ] Require the exact final feature SHA to pass `npm test`, `npm run check`, `npm run build`, full `npm run test:browser`, and CodeQL.
- [ ] Compare final feature tree against the verified base and confirm only intended production/test/documentation changes exist.
- [ ] Fast-forward `main` without force to the exact green feature SHA.
- [ ] Require ordinary `main` CI and the guarded deployment workflow to pass again on that same SHA.
- [ ] Deploy only through the existing Vercel project `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM` / team `team_APBZJjf6iizHCTuseqHosFnU`.
- [ ] Require staged/source byte parity, promotion, public/source byte parity, and Vercel `READY` state.
- [ ] Advance the recoverable `production` branch only after the guarded public verification succeeds.

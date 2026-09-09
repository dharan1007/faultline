# Hierarchical Reduction v1 Design

## Goal

Make FAULTLINE materially better at shrinking real captured browser failures by replacing shallow HTML/CSS unit discovery with deterministic hierarchical units and by teaching the canonical production reducer to operate coarse-to-fine across non-overlapping frontiers while preserving every existing failure, revision, budget, pin, sandbox, and WebMCP invariant.

## Current production defect

`src/reducer-engine.js` currently discovers only shallow paired/void HTML units, whole flat CSS rules, and line-like JavaScript statements. `src/runtime.js` sends one flat unit set to `ddminReduce`. For nested HTML this prevents removal of entire irrelevant parent subtrees. For CSS it cannot remove declarations inside a required rule. A pinned descendant also protects only its exact unit ID, so a removable ancestor can invalidate the user's pin intent once hierarchy exists.

## Scope

V1 changes HTML and CSS only. JavaScript retains the existing bounded statement discovery in this release. This avoids claiming parser-backed JavaScript minimality before FAULTLINE has a justified AST dependency.

The canonical implementation remains `src/reducer-engine.js` + `src/runtime.js`. `src/domain.js` remains legacy/experimental and must not become a production dependency.

## HTML structural units

Implement a deterministic scanner that walks tags while respecting quoted attribute values, comments, declarations, raw-text `script`/`style` bodies, void elements, and closing tags. It emits balanced element ranges with:

- `id`: `${axis}:${start}:${end}`
- `axis`
- `start`, `end`
- `kind: 'element'`
- `text`
- `depth`
- `parentId`

Nested elements are emitted, not only leaves. Unbalanced/malformed fragments are tolerated conservatively: only ranges whose closing boundary is known are actionable. Void elements are actionable immediately.

## CSS hierarchical units

Implement a deterministic brace/string/comment-aware scanner. Emit rule blocks and direct declarations inside simple declaration bodies. Each declaration has `parentId` equal to its containing rule ID and `depth = rule.depth + 1`. Nested grouping rules may contain child rules; declaration discovery occurs only in blocks whose top-level body contains declaration separators rather than nested rule blocks.

Removing a declaration removes its full declaration range including its terminating semicolon where present. Removing a rule removes the full selector/at-rule + block range.

## Hierarchical reduction algorithm

Add a canonical `hierarchicalReduce(units, evaluateRemovedIds, options)` helper in `src/reducer-engine.js`.

Inputs:

- full semantic unit array for one axis;
- an async evaluator accepting the current set of removed unit IDs and returning `PASS | FAIL | UNRESOLVED`;
- `protectedItems` containing explicitly pinned unit IDs;
- one global `maxTrials` budget.

Rules:

1. Compute ancestor closure of protected items. A pinned descendant implicitly protects every ancestor.
2. Process hierarchy breadth-first by depth.
3. At each depth, form a frontier of units whose ancestors are still present. Units in one frontier are non-overlapping by construction; descendants of removed ancestors are skipped.
4. Run ddmin only against removable units in that frontier. The evaluator materializes source using only topmost removed ranges, so overlapping ancestor/descendant removals can never corrupt offsets.
5. Descend only into parents that survived.
6. All frontier searches share one `maxTrials` budget. If the budget cannot complete the current ddmin search, throw `TRIAL_BUDGET_EXHAUSTED`; runtime must not commit a partial reduction.
7. Perform one independent final candidate execution after the search. Commit only if it is still `FAIL`.
8. Return exact tested metadata: trial count, removed unit count, frontier summaries and hierarchy completeness. Do not call the result globally minimal.

## Pin remapping after reduction

Unit IDs encode source offsets, so surviving pins must be remapped after a source-changing reduction. Sibling-index paths are explicitly not used because deleting an earlier sibling changes those indexes and makes the mapping unstable.

Before reduction, retain every explicitly pinned unit's exact `{start,end,kind,text}` identity. Once the reducer has its final non-overlapping topmost removal ranges, transform a pinned unit's offsets by subtracting the total length of removal ranges that end before the pin begins. Protected ancestor closure guarantees no accepted removal may overlap a pinned unit. Rediscover semantic units in the reduced source and require one unit matching the transformed `start`, transformed `end`, `kind`, and exact `text`.

If any removal overlaps an explicit pin, or the transformed unit cannot be rediscovered exactly, abort before canonical commit with `PIN_REMAP_FAILED`. This handles duplicate unit text deterministically because transformed offsets, rather than textual uniqueness or sibling position, identify the survivor.

The same exact range-remapping helper is used for flat JavaScript reductions so source-offset pins never become stale after any axis reduction. Ancestor-protected but not explicitly pinned units are not persisted as pins.

## Runtime and WebMCP surface

`faultline_units` remains backward compatible and adds:

- `depth`
- `parentId`
- `protectedByPin` (true for an ancestor protected by a pinned descendant)

The human unit list adds compact hierarchy indentation and distinguishes `pinned` from `protected by pin`; no cosmetic redesign.

`faultline_reduce` and `faultline_autopilot` keep existing request shapes. Reduction results add `frontiers` and `hierarchical: true` for HTML/CSS. JavaScript returns `hierarchical: false` until its parser-backed design ships.

## Safety and correctness invariants

- Baseline and final failure status must be `FAIL`.
- `UNRESOLVED` is never treated as removable success.
- Trial budget remains global and explicit.
- Stale revisions cannot mutate canonical state.
- Aborted operations cannot commit.
- Pinned descendants and their ancestor chain cannot be removed.
- Failed pin remapping cannot commit.
- Candidate execution remains inside the existing sandbox/CSP/network/navigation boundary.
- No new dependency or remote service is introduced.

## TDD acceptance

RED tests must prove the existing production implementation lacks:

1. nested parent HTML units;
2. CSS declaration child units;
3. hierarchy metadata;
4. ancestor closure for pinned descendants;
5. coarse-to-fine removal of an irrelevant parent subtree;
6. declaration-level reduction inside a required CSS rule;
7. exact pin offset remapping after successful source shrinkage.

A Chromium end-to-end test must load a real nested failure case with irrelevant source preceding a pinned descendant, pin that descendant, run HTML reduction then CSS reduction through the canonical runtime/WebMCP surface, verify the pinned descendant and ancestors survive with the pin ID remapped to its new offsets, verify irrelevant parent branches and declarations disappear, verify final status remains `FAIL`, and verify exported source matches canonical reduced source.

## Deployment gate

Only promote if the exact candidate SHA passes `npm test`, `npm run check`, `npm run build`, full `npm run test:browser`, CodeQL/CI, and live production browser verification. Promotion must target only existing Vercel project `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`. Advance `production` checkpoint only after public artifact verification.
# Hierarchical HTML/CSS Reduction Design

## Goal

Upgrade FAULTLINE from flat regex semantic units to deterministic hierarchical HTML and CSS units so reduction can remove large irrelevant branches first, descend only into surviving branches, preserve pinned descendants through ancestor closure, and expose that structure through the human workbench and WebMCP.

## Production problem

The current canonical `semanticUnits()` implementation discovers only shallow HTML leaf elements and flat CSS rules. The reducer therefore cannot test removal of a complete nested subtree before spending trials on its children, cannot descend from a required CSS rule into individual declarations, and treats pins as exact unit IDs rather than structural constraints. This produces unnecessarily large reproducers and weakens minimality for modern nested UI failures.

## Scope

This change covers HTML and CSS only. JavaScript keeps its current bounded statement units in this run. The change must not add parser/runtime dependencies, must remain deterministic in the browser and Node 22, and must preserve the existing `id`, `axis`, `start`, `end`, `kind`, and `text` unit fields for compatibility.

## Structural unit contract

`semanticUnits(axis, source)` returns units sorted by `(start, end, depth)` and adds:

- `parentId: string | null`
- `depth: non-negative integer`

HTML units are balanced element ranges produced by a stack scanner. Void elements are self-contained units. Comments, declarations, processing instructions, and raw text inside `script`/`style` are not recursively tokenized as HTML children. Malformed/unbalanced markup is handled conservatively: only ranges whose boundaries are proven are emitted.

CSS units are produced by a brace/string/comment aware scanner. Top-level qualified rules and at-rules with blocks are `rule` units. Direct declarations inside each rule block are `declaration` children whose `parentId` references that rule. Nested rules are emitted as nested `rule` units; declarations belong to the closest containing rule.

Overlapping units are therefore expected only through explicit ancestor/descendant relationships.

## Pin semantics

A directly pinned unit is `pinned: true`. Any ancestor required to keep that unit reachable is `protectedByDescendant: true`. Reduction treats the entire upward closure as protected. The API continues storing only direct user pins; structural protection is derived from the current source on every read/reduction.

After a successful reduction, pins are remapped by structural identity rather than retaining stale offsets. A pin is matched using `(axis, kind, normalized text, ancestor signature)` among surviving units. If an exact surviving match cannot be proven, the reduction is rejected before commit with `PIN_REMAP_FAILED`; FAULTLINE must never silently drop a user pin.

## Hierarchical reduction algorithm

For HTML/CSS, reduction operates coarse-to-fine under one global `maxTrials` budget:

1. Verify the complete baseline still returns `FAIL`.
2. Build structural units and protected ancestor closure.
3. Select the current frontier: units whose parent is absent, removed, or already retained as a required ancestor, excluding descendants hidden beneath a frontier ancestor.
4. Delta-debug that non-overlapping frontier while keeping protected frontier items.
5. Permanently remove accepted frontier branches.
6. Re-scan the new source so offsets and hierarchy are canonical.
7. Descend into surviving removable branches and repeat until no deeper frontier can shrink the source or the trial budget is exhausted.
8. Re-run the final candidate independently and require `FAIL` before commit.
9. Remap direct pins against the final source; reject commit if any pin cannot be proven.

JavaScript continues using the existing flat ddmin flow.

The trial budget is global across baseline/frontier searches for the requested reduction invocation. Exhaustion returns `TRIAL_BUDGET_EXHAUSTED` without mutating canonical state.

## Source removal semantics

`removeUnits()` must accept hierarchical units safely. It first collapses selected ranges so descendants wholly covered by a selected ancestor are ignored. Partially overlapping non-ancestor ranges are rejected as `OVERLAPPING_UNIT_RANGES` rather than producing corrupt source.

## WebMCP and browser API

`faultline_units` and `window.faultline.units()` retain the current response shape and add per-unit:

- `parentId`
- `depth`
- `pinned`
- `protectedByDescendant`

No existing field is removed or renamed.

`faultline_reduce` keeps its existing input schema and result fields. It may add `passes` to report coarse-to-fine passes but this is informational only.

## Human workbench

The unit list remains keyboard-operable buttons. Each unit row shows structural depth and protection state in its secondary text. Child units receive deterministic indentation using CSS based on a `data-depth` attribute; no visual redesign is part of this change.

## Reliability and compatibility

All source mutation remains optimistic-revision guarded and atomic. Failed, aborted, stale, budget-exhausted, lost-failure, or pin-remap reductions leave the canonical source and direct pins unchanged. Existing persistence and recovery semantics remain unchanged.

## Required TDD acceptance

RED tests must prove the current tree lacks:

1. nested parent HTML discovery;
2. CSS declaration discovery;
3. ancestor closure for a pinned child;
4. safe ancestor+descendant range removal;
5. WebMCP hierarchy metadata;
6. a browser reduction that removes a whole irrelevant subtree and then descends into the surviving branch while retaining a pinned descendant.

GREEN acceptance requires all existing deterministic, syntax, build, Chromium, WebMCP, persistence, security, accessibility, capture-ingestion and deployment-parity tests plus the new hierarchical tests.

## Deployment gate

Production may move only after the exact branch tree passes CI. `main` must still equal the verified baseline before fast-forward. The existing guarded `deploy-production.yml` must deploy only to `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`, verify staged/public byte parity, and only then advance the `production` recovery branch.
# Hierarchical Reducer Production Design

## Problem

FAULTLINE's canonical reducer currently discovers HTML with a shallow paired-element regex and CSS as whole flat rules. That prevents coarse-to-fine reduction of modern nested reproductions, wastes trial budget, and makes the production architecture documentation stronger than the shipped implementation.

## Goal

Upgrade the canonical production reducer so HTML and CSS expose deterministic hierarchy metadata and reduction proceeds over non-overlapping coarse-to-fine frontiers while preserving the existing FAIL/UNRESOLVED, revision, cancellation, pin, persistence, sandbox, and WebMCP invariants.

## Scope

This change covers HTML structural units, CSS rule/declaration units, hierarchy-aware pin protection, hierarchical reduction orchestration, WebMCP unit metadata, and browser acceptance. JavaScript remains the existing bounded statement-level scanner in this run.

## Canonical unit model

Every semantic unit keeps the existing fields `id`, `axis`, `start`, `end`, `kind`, and `text`, and may additionally expose:

- `depth`: zero-based structural depth within its axis hierarchy.
- `parentId`: parent unit id or `null` for a root unit.

HTML units are balanced element subtrees. Void elements are leaves. Script/style/raw-text contents are scanned without interpreting embedded markup as child HTML.

CSS units are complete rules. Simple style rules additionally expose declaration children whose ranges include the declaration text but not the parent rule braces. At-rules with nested blocks are represented as structural rule nodes and their nested rules are scanned recursively where deterministic.

## Reduction algorithm

Reduction is coarse-to-fine:

1. Build the hierarchy for the selected axis from the immutable source snapshot.
2. Close pinned unit ids upward over every ancestor.
3. Select the shallowest surviving non-overlapping frontier.
4. Run ddmin over that frontier only, with ancestor-protected units excluded from removal.
5. Apply accepted removals to the source snapshot.
6. Re-discover hierarchy on the accepted source, remap surviving pins by exact surviving unit text/range relationship, and descend to the next frontier.
7. Consume one global trial budget across all frontier passes.
8. Before commit, independently execute the final candidate and require `FAIL`.
9. Commit atomically against the original expected revision; stale or aborted operations do not mutate canonical state.

`UNRESOLVED` never counts as failure preservation.

## Pin semantics

A pinned descendant protects itself and its full ancestor chain for that reduction snapshot. After accepted source deletion, pins are remapped only to surviving structural units. If an exact pinned unit cannot be identified after a source transformation, the reduction aborts with a deterministic pin-remap failure instead of silently dropping protection.

## WebMCP and human surfaces

`faultline_units` continues returning all existing fields and adds `depth` and `parentId`. Existing consumers remain compatible. The human source-unit list may expose indentation/protection metadata but no visual redesign is required.

## Correctness boundaries

- HTML parsing is a deterministic bounded structural scanner, not a standards-complete HTML5 tree builder.
- CSS scanning handles balanced braces, strings and comments deterministically; it does not claim full CSSOM equivalence.
- JavaScript minimality remains statement-level and is not upgraded in this run.
- Minimality claims apply to the hierarchical frontier sequence actually tested under the configured global trial budget.

## TDD acceptance

RED tests must prove the current production implementation fails to provide nested HTML parents, CSS declaration children, upward pin closure, and hierarchy metadata.

GREEN automated tests must prove:

- nested HTML hierarchy with stable parent/depth metadata;
- void/raw-text handling without overlapping malformed units;
- CSS rule/declaration hierarchy including comments/strings;
- non-overlapping frontier selection;
- upward pin closure;
- global trial-budget accounting across frontier passes;
- one-unit frontier can be fully removed when failure persists;
- final independent FAIL verification before commit;
- WebMCP returns hierarchy metadata without breaking existing fields.

A real Chromium acceptance must start from a nested failing case with irrelevant wrapper branches and irrelevant declarations, run canonical reduction through the browser/WebMCP surface, preserve a pinned descendant and its ancestors, verify the final case still FAILs, and confirm export reflects the reduced source.

## Deployment gate

Production remains unchanged until the exact candidate tree passes `npm test`, `npm run check`, `npm run build`, the complete `npm run test:browser`, source concurrency checks, and the existing guarded single-project Vercel production workflow. The recoverable `production` checkpoint advances only after public artifact verification.
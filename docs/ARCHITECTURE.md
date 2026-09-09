# Architecture

FAULTLINE has one canonical state graph shared by the human UI, Browser API and WebMCP tools.

The browser runtime owns the case, revision, pins, revision snapshots, capture provenance and causal experiment ledger. Candidate execution is delegated to the isolated browser runner built by `buildSandboxDocument`; trusted oracle results return through a private `MessageChannel` rather than candidate-controlled window messages.

Reducers never decide whether an edit is correct. They only produce structural candidate units. The failure oracle is authoritative. `ddminReduce` searches for removable units whose complement preserves `FAIL`; `UNRESOLVED` is never treated as failure preservation.

HTML units are deterministic balanced element subtrees with `depth` and `parentId`. Void elements are leaves, while raw-text script/style contents are not interpreted as descendant HTML. CSS exposes complete rule units and declaration children, including deterministic nested-rule structure for supported at-rules. Strings and comments are respected while scanning delimiters. JavaScript remains bounded statement-level lexical grouping and is deliberately not claimed to be a full ESTree/AST reducer.

The production WebMCP surface contains 17 bounded tools over the same canonical runtime used by the human workbench. Mutation tools carry `expectedRevision`, long-running operations honor WebMCP cancellation, and semantic-unit discovery exposes the same hierarchy metadata used by reduction.

## Hierarchical reduction

HTML and CSS reduction proceeds coarse-to-fine over non-overlapping structural frontiers rather than mixing parent and descendant ranges in one ddmin candidate set.

For one source axis, the runtime:

1. snapshots the exact canonical revision and source;
2. discovers the current hierarchy;
3. closes direct pins upward through every structural ancestor;
4. selects one non-overlapping depth frontier;
5. runs bounded ddmin over removable units in that frontier;
6. applies only accepted removals that preserve `FAIL`;
7. re-discovers the hierarchy and remaps surviving pin IDs after source ranges shift;
8. descends to deeper surviving structure using the same global trial budget;
9. independently executes the final candidate and requires `FAIL` before commit;
10. re-checks the expected revision and commits source plus remapped pins transactionally.

Accepted shallower removals suppress their descendants because those descendants no longer exist when the next hierarchy is discovered. A pinned descendant therefore cannot disappear through removal of an ancestor, and a range shift caused by earlier deletions cannot silently orphan its pin.

The core `ddminReduce` evaluates an empty candidate as a legitimate hypothesis. For a one-element frontier, if the same failure remains after the final removable unit disappears, that unit is correctly classified as unnecessary rather than retained by convention.

## Reduction-minimality boundary

FAULTLINE does not claim a globally shortest program. The production guarantee is bounded, deterministic failure-preserving reduction over the hierarchy/frontiers actually explored within the configured global trial budget. Each accepted edit and the final committed candidate must preserve the configured `FAIL`; `PASS`, `UNRESOLVED`, stale revisions, cancellation, pin-remap ambiguity and persistence failure do not become successful reductions.

The HTML scanner is not a standards-complete HTML5 tree builder, the CSS scanner is not a full CSSOM parser, and JavaScript is not yet parser-backed. Those boundaries are explicit so reduction evidence is stronger than the product claim, never weaker.

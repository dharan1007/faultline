# Architecture

FAULTLINE has one canonical state graph shared by the human UI and WebMCP tools.

`FaultlineDomain` owns the case, revision, pins, revision snapshots and causal ledger. It delegates execution to a runner supplied by the browser app. The runner renders a candidate into a sandboxed iframe using `buildSandboxDocument` and receives a structured result through `postMessage`.

Reducers never decide whether an edit is correct. They only produce structural candidate units. The failure oracle is authoritative. `ddmin` searches for removable units whose complement preserves `FAIL`; `UNRESOLVED` is never treated as a pass or failure preservation.

HTML units are balanced element subtrees. CSS units are complete rules and declarations. JavaScript is currently statement-level with lightweight lexical grouping; it is deliberately not claimed to be a full ESTree AST reducer.

WebMCP registers nine bounded tools over the same domain methods used by the interface. Mutation tools carry `expectedRevision`, providing optimistic concurrency protection against stale agent operations.


## Reduction-minimality boundary

`ddmin` is 1-minimal over the exact candidate set it receives. Current HTML and CSS scanners expose overlapping structural units (for example a parent subtree plus its child subtree, or a CSS rule plus its declarations). Those overlaps are useful for inspection/probing but mean a single mixed-granularity `reduce` call is not a proof of a global syntactic minimum. The production roadmap is to reduce over hierarchical non-overlapping frontiers, recalculate after each accepted frontier, then descend.


## Hierarchical reducer

The reducer represents HTML units with `depth` and `parentId`, and CSS declarations as children of their containing rule. Reduction proceeds coarse-to-fine over non-overlapping frontiers. Accepted removals from a shallower frontier suppress all descendants beneath that branch; deeper frontiers are considered only when their ancestors survived. Pins close upward over the ancestor chain, preventing an apparently pinned child from disappearing through removal of a parent.

The core `ddmin` evaluates the empty candidate as a legitimate hypothesis. This matters for a one-element frontier: if the same failure remains after that final candidate is removed, the unit is correctly classified as unnecessary rather than being retained by algorithmic convention.

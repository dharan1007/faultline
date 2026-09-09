# Architecture

FAULTLINE has one canonical revisioned state graph shared by the human workbench, the `window.faultline` browser API, and WebMCP tools. The production orchestration lives in `src/runtime.js`; source-unit discovery and reduction algorithms live in `src/reducer-engine.js`. Older experimental domain code is not part of the production execution path.

The browser runtime owns the case, revision, pins, revision snapshots, capture provenance, and bounded causal ledger. Candidate execution is delegated to the sandbox runner, which renders a candidate through `buildSandboxDocument` and accepts only structured results from the isolated iframe.

Reducers never decide whether an edit is correct. The configured failure oracle is authoritative. A candidate removal is accepted only when execution returns `FAIL`; `PASS` means the failure was lost and `UNRESOLVED` is never treated as failure preservation.

## Canonical semantic units

HTML uses a deterministic quote/comment-aware structural scanner. It exposes balanced element subtrees with `depth` and `parentId`, including nested parents and leaves. Malformed fragments are handled conservatively: a range is actionable only when its boundary is known.

CSS uses a deterministic brace/string/comment-aware scanner. It exposes complete rules and, inside simple declaration bodies, individual declaration children. Grouping/nested rules remain hierarchical rather than being flattened into overlapping declaration guesses.

JavaScript remains bounded statement-level lexical grouping in this release. It is intentionally **not** described as an ESTree/AST reducer.

Every semantic unit uses immutable source offsets for its current revision. When a reduction changes offsets, explicit pins are remapped by exact transformed ranges; a remap that cannot be proven exact aborts with `PIN_REMAP_FAILED` before canonical commit.

## Hierarchical reduction

HTML and CSS use `hierarchicalReduce` in the canonical production runtime. Reduction proceeds breadth-first over non-overlapping frontiers:

1. explicit pins close upward over their complete ancestor chain;
2. the shallowest surviving frontier is tested first;
3. removing a parent suppresses its descendants from later frontiers;
4. surviving required parents are decomposed at deeper frontiers;
5. all frontiers share one explicit `maxTrials` budget;
6. after search completes, the fully materialized candidate is independently executed again;
7. source and remapped pins are committed only when that final execution is still `FAIL` and the optimistic revision guard still matches.

This gives coarse-to-fine behavior: an irrelevant HTML branch can disappear in one parent removal, while a required branch is subsequently reduced among its children. Likewise, an irrelevant CSS rule can disappear at the rule frontier while declarations inside a required rule are tested only after that rule survives.

JavaScript continues to use the flat bounded `ddminReduce` path until a parser-backed design is justified. Its result reports `hierarchical: false`; HTML/CSS report `hierarchical: true` plus the frontiers actually tested.

## Reduction-minimality boundary

FAULTLINE does not claim a globally shortest program. The production guarantee is narrower and testable: within the discovered semantic units, configured trial budget, deterministic oracle, and frontiers actually explored, accepted removals preserve `FAIL`, and the final committed candidate is independently reverified.

HTML/CSS hierarchy avoids the old mixed-overlap problem by never testing an ancestor and descendant in the same frontier. Budget exhaustion aborts rather than committing a partially searched reduction. Parser completeness is not implied by these guarantees.

## Concurrency, persistence, and recovery

Mutations carry `expectedRevision`. Stale operations fail instead of overwriting newer canonical state. Reduction snapshots the baseline, performs candidate experiments without mutating canonical state, rechecks revision immediately before commit, and relies on the existing transactional persistence rollback path if durable storage fails.

Pins, source, oracle, revision history, capture provenance, and bounded evidence history are recovered together. Restore creates a new revision rather than silently rewinding canonical identity.

## WebMCP

WebMCP delegates to the same canonical functions used by the workbench. `faultline_units` exposes `depth`, `parentId`, `pinned`, and `protectedByPin`; `faultline_reduce` returns the same hierarchy/frontier metadata produced by the canonical runtime. Agent access therefore does not bypass revision, sandbox, pin, trial-budget, or final-failure-preservation rules.

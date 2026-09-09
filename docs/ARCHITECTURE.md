# Architecture

FAULTLINE has one canonical browser state graph shared by the human workbench, the `window.faultline` browser API, and WebMCP tools. `src/runtime.js` owns the active case, optimistic revision, direct pins, capture provenance, bounded revision snapshots, and experiment ledger. Browser execution is delegated to isolated sandbox iframes built from the canonical case; candidate results return through a private message channel.

Reducers never decide whether an edit is correct. The locked oracle is authoritative. A candidate is accepted only when isolated execution returns `FAIL`. `PASS` and `UNRESOLVED` never count as failure preservation, and every committed reduction receives an independent final `FAIL` verification.

## Structural unit model

`src/reducer-engine.js` is the canonical structural scanner.

HTML is scanned with a deterministic stack/token scanner. Proven balanced elements become units with exact source ranges, `parentId`, and `depth`. Void elements are self-contained units. Comments/declarations are skipped, and `script`/`style` bodies are treated as raw text rather than recursively tokenized as HTML. Malformed boundaries are handled conservatively: FAULTLINE emits only ranges whose end boundary is known.

CSS is scanned with brace, string, escape, and comment awareness. Rules are structural units; direct declarations are child units of the containing rule. Nested rules retain parent/depth relationships. JavaScript remains statement-level with the existing bounded lexical grouping and is not represented as a full ESTree AST in this release.

`removeUnits()` accepts ancestor/descendant selections safely: a descendant already covered by a selected ancestor is collapsed, while partially overlapping non-hierarchical ranges are rejected with `OVERLAPPING_UNIT_RANGES` instead of producing corrupt source.

## Hierarchical reduction

HTML and CSS reduction is coarse-to-fine under one global trial budget per invocation.

1. The complete inspected source is independently verified as `FAIL`.
2. FAULTLINE computes direct pins and closes protection upward over every ancestor of a pinned descendant.
3. It evaluates one non-overlapping structural depth frontier at a time.
4. Whole removable branches are tested before their descendants.
5. Accepted branch removals are applied to an in-memory candidate only; canonical state is unchanged.
6. FAULTLINE rescans the surviving source so ranges and hierarchy are canonical before descending deeper.
7. Direct pins are resolved against structural descriptors after source offsets move. If a pin cannot be resolved uniquely, the operation fails with `PIN_REMAP_FAILED` before commit.
8. The final candidate is executed again independently and must return `FAIL`.
9. Only then are source and remapped direct pins committed under the original `expectedRevision`.

JavaScript continues through the existing flat `ddmin` path, but surviving direct JavaScript pins are also remapped before commit so source-offset changes cannot silently leave stale pin IDs.

Budget exhaustion, abort, stale revision, unresolved execution, lost failure, pin-remap failure, or persistence failure leaves canonical source and direct pins unchanged. Persistence rollback restores the pre-operation checkpoint if durable storage cannot be written.

## Pin semantics

Only direct user pins are persisted. `protectedByDescendant` is derived from the current unit hierarchy on each inspection and is never stored as a synthetic pin. A protected ancestor cannot be probed or removed, because doing so would indirectly remove the pinned descendant.

`faultline_units` and `window.faultline.units()` expose the same unit contract:

- `id`
- `kind`
- `text`
- `parentId`
- `depth`
- `pinned`
- `protectedByDescendant`

This structural metadata is generated once by the canonical runtime; the human UI and WebMCP do not maintain separate hierarchy implementations.

## Capture and reduction boundary

Playwright Capture v1 converts a caller-owned prepared browser state into a bounded `faultline.capture.v1` artifact. Capture import is transactional: validate → normalize → isolated baseline execution → confirm `FAIL` → revision recheck → canonical commit. FAULTLINE rejects captures it cannot reproduce deterministically rather than treating unsupported external dependencies as successful imports.

Once imported, captured cases use the same hierarchical reduction path as manually loaded cases.

## WebMCP and concurrency

FAULTLINE currently registers 17 bounded WebMCP tools over the same canonical runtime used by the human interface. Mutating and long-running operations use optimistic `expectedRevision` guards; cancellable operations support native WebMCP abort signals plus bounded request-ID compatibility cancellation. Agent-visible semantic-unit discovery includes the same hierarchy and protection metadata rendered by the workbench.

## Minimality boundary

For HTML and CSS, each reduction invocation now performs coarse-to-fine delta debugging over non-overlapping structural frontiers and descends only into surviving branches. This is materially stronger than the previous flat mixed-granularity search, but FAULTLINE does not claim a language-theoretic global minimum across arbitrary equivalent rewrites. JavaScript minimality remains bounded by the current statement-level unit discovery until a dedicated parser-backed JavaScript reducer is introduced.

# Architecture

FAULTLINE has one canonical browser state graph shared by the human workbench, the `window.faultline` browser API, and WebMCP tools. `src/runtime.js` owns the active case, optimistic revision, direct pins, capture provenance, bounded revision snapshots, and experiment ledger. Browser execution is delegated to isolated sandbox iframes built from the canonical case; candidate results return through a private message channel.

Reducers never decide whether an edit is correct. The locked oracle is authoritative. A candidate is accepted only when isolated execution returns `FAIL`. `PASS` and `UNRESOLVED` never count as failure preservation, and every committed reduction receives an independent final `FAIL` verification.

## Structural unit model

`src/reducer-engine.js` is the canonical structural scanner.

HTML is scanned with a deterministic stack/token scanner. Proven balanced elements become units with exact source ranges, `parentId`, and `depth`. Void elements are self-contained units. Comments/declarations are skipped, and `script`/`style` bodies are treated as raw text rather than recursively tokenized as HTML. Malformed boundaries are handled conservatively: FAULTLINE emits only ranges whose end boundary is known.

CSS is scanned with brace, string, escape, and comment awareness. Rules are structural units; direct declarations are child units of the containing rule. Nested rules retain parent/depth relationships.

JavaScript uses the pinned Acorn parser shipped with the production artifact. FAULTLINE parses normal scripts first and ES modules second, then derives removable units only from syntax positions where removing a complete list member is structurally meaningful: program statements, block statements, switch-case consequents, class methods/properties, and static-block statements. Nested statement units receive deterministic `parentId` and `depth` metadata. Mandatory expressions such as an `if` condition are not independently exposed as removable units. If source is already syntactically invalid and both parser modes reject it, FAULTLINE conservatively falls back to the previous bounded lexical statement discovery so syntax-error reproductions remain inspectable rather than becoming unusable.

`removeUnits()` accepts ancestor/descendant selections safely: a descendant already covered by a selected ancestor is collapsed, while partially overlapping non-hierarchical ranges are rejected with `OVERLAPPING_UNIT_RANGES` instead of producing corrupt source.

## Hierarchical reduction

HTML, CSS, and parser-backed JavaScript reduction are coarse-to-fine under one global trial budget per invocation.

1. The complete inspected source is independently verified as `FAIL`.
2. FAULTLINE computes direct pins and closes protection upward over every ancestor of a pinned descendant.
3. It evaluates one non-overlapping structural depth frontier at a time.
4. Whole removable branches are tested before their descendants.
5. Accepted branch removals are applied to an in-memory candidate only; canonical state is unchanged.
6. FAULTLINE rescans the surviving source so ranges and hierarchy are canonical before descending deeper.
7. Direct pins are resolved against structural descriptors after source offsets move. If a pin cannot be resolved uniquely, the operation fails with `PIN_REMAP_FAILED` before commit.
8. The final candidate is executed again independently and must return `FAIL`.
9. Only then are source and remapped direct pins committed under the original `expectedRevision`.

When JavaScript cannot be parsed because the reproducer intentionally contains invalid syntax, its fallback lexical units remain flat and use the existing bounded ddmin path. This fallback is intentionally not described as AST-level minimality.

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

## Browser parser supply chain

The production browser never fetches its JavaScript parser from a CDN. `acorn` is version-pinned in `package.json`; `scripts-vendor.mjs` verifies that exact installed version and materializes the ESM distribution as `vendor/acorn.js`. The `.js` extension deliberately preserves compatibility with FAULTLINE's existing static/dev-server integrations that already serve JavaScript MIME types correctly. The build stages that parser beside the application modules, and guarded deployment byte-compares it against both the staged deployment and the public production alias before the recoverable `production` checkpoint can advance.

## WebMCP and concurrency

FAULTLINE currently registers 17 bounded WebMCP tools over the same canonical runtime used by the human interface. Mutating and long-running operations use optimistic `expectedRevision` guards; cancellable operations support native WebMCP abort signals plus bounded request-ID compatibility cancellation. Agent-visible semantic-unit discovery includes the same hierarchy and protection metadata rendered by the workbench.

## Minimality boundary

For HTML, CSS, and parseable JavaScript, each reduction invocation performs coarse-to-fine delta debugging over non-overlapping structural frontiers and descends only into surviving branches. This is materially stronger than flat mixed-granularity search, but FAULTLINE does not claim a language-theoretic global minimum across arbitrary equivalent rewrites. JavaScript expression-level rewriting and semantics-preserving transformations remain outside this release; syntactically invalid JavaScript uses the conservative flat fallback described above.

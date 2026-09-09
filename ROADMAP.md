# FAULTLINE Roadmap

FAULTLINE's roadmap is ordered around a measurable debugging outcome: **turn a real browser failure into a smaller trustworthy reproducer without changing what is failing.**

## Shipped foundation — capture, verify, structurally reduce

The canonical production architecture contains a local Playwright capture path in addition to direct case loading:

- a caller-owned Playwright `page` can be converted to bounded `faultline.capture.v1`,
- diagnostics can be armed before the failing step so bounded `console.error` and uncaught `pageerror` evidence survives capture,
- captured diagnostic evidence is retained through canonical import, persistence/recovery, reduction and structured export,
- the human import surface previews captured console/page-error evidence as inert text before verification,
- the hosted workbench never navigates to or fetches the capture source URL,
- capture artifacts are schema/size/dependency validated,
- import executes the captured candidate before canonical mutation and commits only a reproduced `FAIL`,
- capture provenance follows the canonical revision through persistence, restore, reduction and structured export,
- human, Browser API and WebMCP import surfaces delegate to the same canonical operation,
- the complete capture → import → reduction → re-verification → export path is exercised in Chromium as part of the standard production browser gate.

The v1 adapter deliberately snapshots already-authorized page state rather than pretending to reconstruct arbitrary application bundles. External/inaccessible dependencies are rejected instead of hidden. Diagnostic recorders are explicit and caller-owned: they listen only from arming until deterministic disposal and never navigate, retry, or broaden browser authority.

Semantic reduction is hierarchical across the three source axes. HTML uses balanced subtree units, CSS uses rule/declaration hierarchy, and parseable JavaScript uses a pinned Acorn AST to expose syntax-safe statement/class-member frontiers with parent/depth metadata. Pinned descendants protect required ancestors. JavaScript that is intentionally syntactically invalid remains reducible through a conservative lexical fallback rather than being falsely classified as parser-safe.

## Now — measure reducer quality on real failures

The next major technical step is proving and improving reduction quality against a reproducible browser-failure corpus instead of adding unmeasured heuristics.

Candidate work:

1. A public Web Reduction Benchmark corpus with deterministic fixtures representing DOM, styling, event, asynchronous, runtime-error and state bugs.
2. Per-case metrics for original bytes, reduced bytes, semantic-unit counts, trial counts, wall-clock execution and final preservation status.
3. Exact minimality-class assertions for each semantic frontier rather than global-minimum claims.
4. Parser-backed JavaScript expression boundaries only where removal/rewrite semantics can be proven safe and materially improve benchmark results.
5. Reproducer bundles carrying deterministic environment metadata required to rerun a benchmark case.

## Next — broader real-browser integrations

- Recipes/wrappers for common Playwright Test failure hooks and CI artifact upload flows without introducing a hosted arbitrary-browser service.
- Component-test and local dev-server capture recipes.
- Optional screenshot/trace references that remain provenance only and never become an implicit execution dependency.
- Cross-browser verification adapters where a reduced case can be executed deterministically in Chromium, Firefox and WebKit.
- Benchmark-driven prioritization for additional semantic reducers instead of parser breadth for its own sake.

## Later — stronger isolation / scale

- Optional process/VM-backed execution for services accepting arbitrary third-party code.
- Standards-complete parsing for selected axes where it materially improves reduction quality.
- Stable reusable reducer/oracle/capture packages after APIs settle.
- Signed/reproducible release metadata once the package surfaces stabilize.

## Non-goals

FAULTLINE will not:

- call a source globally minimal when only a bounded candidate set was tested,
- treat `UNRESOLVED` as success,
- disable containment to reduce more aggressively,
- claim a browser iframe is equivalent to process/VM isolation,
- invent reduction percentages for marketing,
- fetch arbitrary capture URLs in hosted production,
- expose arbitrary remote/browser control merely to appear more agentic,
- claim `faultline.capture.v1` reconstructs an arbitrary SPA bundle when it does not,
- describe lexical fallback units as parser-backed AST structure.

## Contributing to roadmap work

Small fixtures, oracle cases and accessibility/docs work should become `good first issue` tasks. Parser/reducer semantics, sandbox boundaries, capture adapters and browser integrations should use an issue/RFC with explicit acceptance tests before implementation.

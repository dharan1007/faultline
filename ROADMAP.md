# FAULTLINE Roadmap

FAULTLINE's roadmap is ordered around a measurable debugging outcome: **turn a real browser failure into a smaller trustworthy reproducer without changing what is failing.**

## Shipped foundation — capture, verify, reduce

The canonical production architecture contains a local Playwright capture path in addition to direct case loading:

- a caller-owned Playwright `page` can be converted to bounded `faultline.capture.v1`,
- the hosted workbench never navigates to or fetches the capture source URL,
- capture artifacts are schema/size/dependency validated,
- import executes the captured candidate before canonical mutation and commits only a reproduced `FAIL`,
- capture provenance follows the canonical revision through persistence, restore, reduction and structured export,
- human, Browser API and WebMCP import surfaces delegate to the same canonical operation,
- the complete capture → import → reduction → re-verification → export path is exercised in Chromium as part of the standard production browser gate.

The v1 adapter deliberately snapshots already-authorized page state rather than pretending to reconstruct arbitrary application bundles. External/inaccessible dependencies are rejected instead of hidden.

## Shipped semantic-reduction upgrade — hierarchical HTML/CSS

The canonical production reducer now performs coarse-to-fine hierarchical reduction for HTML and CSS:

- HTML discovery exposes balanced nested element subtrees with deterministic `depth`/`parentId` metadata.
- CSS discovery exposes whole rules and declaration children using brace/string/comment-aware scanning.
- Reduction searches non-overlapping frontiers breadth-first, so irrelevant parent branches can disappear before trials are spent on their descendants.
- Surviving required parents are decomposed at deeper frontiers, enabling declaration-level reduction inside a required CSS rule and child-level reduction inside a required HTML branch.
- Explicit pins protect their complete ancestor chain.
- Source-offset pin IDs are remapped by exact transformed ranges after accepted removals; an unprovable remap aborts before canonical commit.
- All frontiers share one explicit trial budget, and the final candidate is independently re-run before commit.
- Human, Browser API and WebMCP unit discovery consume the same hierarchy metadata.

This does not make the scanners standards-complete parsers and does not justify a globally-minimal claim. The exact guarantee remains scoped to discovered units, explored frontiers, configured trial budget and deterministic failure-preservation semantics.

## Now — strengthen JavaScript and measurable reducer quality

The next major technical work should improve semantic precision where the current implementation is still deliberately bounded:

1. Evaluate parser-backed JavaScript statement/expression boundaries and dependency cost; do not add an AST stack unless benchmarked reduction quality justifies it.
2. Build a reproducible browser-failure corpus measuring original size, reduced size, trial count, frontier count, preservation status and capture environment.
3. Add adversarial fixtures for malformed-but-browser-tolerated HTML/CSS so scanner conservatism can be measured rather than assumed.
4. Benchmark hierarchical reduction against the previous flat strategy on the same captured failures.
5. Improve trial scheduling/caching only when evidence shows repeated candidate executions dominate end-to-end reduction time.
6. Define the exact minimality class for parser-backed JavaScript before changing production claims.

## Next — broader real-browser integrations

- Recipes/wrappers for common Playwright Test failure hooks and CI artifact upload flows without introducing a hosted arbitrary-browser service.
- Capture diagnostics that can be armed before a failing test step so bounded console/page-error evidence is retained in the artifact.
- Component-test and local dev-server capture recipes.
- Optional screenshot/trace references that remain provenance only and never become an implicit execution dependency.
- Cross-browser verification adapters where a reduced case can be executed deterministically in Chromium, Firefox and WebKit.
- A public Web Reduction Benchmark corpus with original/reduced size, trial count, status preservation and environment metadata.

## Later — stronger isolation / scale

- Optional process/VM-backed execution for services accepting arbitrary third-party code.
- Standards-complete parsing for selected axes where it materially improves reduction quality.
- Reproducer bundles with deterministic environment metadata.
- Stable reusable reducer/oracle/capture packages after APIs settle.

## Non-goals

FAULTLINE will not:

- call a source globally minimal when only a bounded candidate set/frontier set was tested,
- treat `UNRESOLVED` as success,
- commit a partially searched reduction after trial-budget exhaustion,
- allow a pinned descendant to disappear by deleting one of its required ancestors,
- keep a stale source-offset pin when exact remapping cannot be proven,
- disable containment to reduce more aggressively,
- claim a browser iframe is equivalent to process/VM isolation,
- invent reduction percentages for marketing,
- fetch arbitrary capture URLs in hosted production,
- expose arbitrary remote/browser control merely to appear more agentic,
- claim `faultline.capture.v1` reconstructs an arbitrary SPA bundle when it does not.

## Contributing to roadmap work

Small fixtures, oracle cases and accessibility/docs work should become `good first issue` tasks. Parser/reducer semantics, sandbox boundaries, capture adapters and browser integrations should use an issue/RFC with explicit acceptance tests before implementation.

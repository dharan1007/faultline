# FAULTLINE Roadmap

FAULTLINE's roadmap is ordered around a measurable debugging outcome: **turn a real browser failure into a smaller trustworthy reproducer without changing what is failing.**

## Shipped foundation — capture, verify, reduce

The canonical production architecture now contains a local Playwright capture path in addition to direct case loading:

- a caller-owned Playwright `page` can be converted to bounded `faultline.capture.v1`,
- the hosted workbench never navigates to or fetches the capture source URL,
- capture artifacts are schema/size/dependency validated,
- import executes the captured candidate before canonical mutation and commits only a reproduced `FAIL`,
- capture provenance follows the canonical revision through persistence, restore, reduction and structured export,
- human, Browser API and WebMCP import surfaces delegate to the same canonical operation,
- the complete capture → import → reduction → re-verification → export path is exercised in Chromium as part of the standard production browser gate.

The v1 adapter deliberately snapshots already-authorized page state rather than pretending to reconstruct arbitrary application bundles. External/inaccessible dependencies are rejected instead of hidden.

## Now — make semantic reduction stronger

The next major technical step is stronger semantic-unit quality while preserving non-overlap and deterministic removal semantics.

Candidate work:

1. HTML structural units that handle nested subtrees deliberately.
2. CSS two-stage rule/declaration reduction with non-overlapping frontiers.
3. JavaScript parser-backed statement/expression boundaries where the dependency/size cost is justified.
4. Hierarchical reduction in the **canonical production runtime**, with pinned descendants protecting required ancestors.
5. Tests proving the exact minimality class for each frontier.
6. A reproducible browser-failure corpus measuring original size, reduced size, trial count, preservation status and capture environment.

The repository contains older/experimental depth-aware concepts, but they do not change the production claim until integrated into `src/runtime.js` and release tests.

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

- call a source globally minimal when only a bounded candidate set was tested,
- treat `UNRESOLVED` as success,
- disable containment to reduce more aggressively,
- claim a browser iframe is equivalent to process/VM isolation,
- invent reduction percentages for marketing,
- fetch arbitrary capture URLs in hosted production,
- expose arbitrary remote/browser control merely to appear more agentic,
- claim `faultline.capture.v1` reconstructs an arbitrary SPA bundle when it does not.

## Contributing to roadmap work

Small fixtures, oracle cases and accessibility/docs work should become `good first issue` tasks. Parser/reducer semantics, sandbox boundaries, capture adapters and browser integrations should use an issue/RFC with explicit acceptance tests before implementation.

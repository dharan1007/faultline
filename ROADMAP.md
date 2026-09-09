# FAULTLINE Roadmap

FAULTLINE's roadmap is ordered around a measurable debugging outcome: **turn a real browser failure into a smaller trustworthy reproducer without changing what is failing.**

## Delivered — real Playwright failure ingestion

The canonical product now has a first production browser-test integration rather than requiring every user to hand-assemble HTML/CSS/JavaScript before reduction:

- `faultline.capture.v1` is a versioned, bounded capture artifact.
- `integrations/playwright/index.mjs` captures the pre-failure page baseline plus deterministic oracle/action and can emit `faultline.capture.json` for an armed unexpected Playwright result.
- Accessible CSSOM is captured; classic JavaScript capture is bounded and same-origin-only when explicitly enabled.
- Unsupported/unreadable resources are recorded explicitly in diagnostics instead of silently omitted.
- Browser API, WebMCP, pasted JSON and file import converge on the same canonical guarded case mutation.
- The hosted workbench never browses the capture URL; imported source still executes only through the existing sandbox/CSP boundary.
- Real Chromium acceptance proves a captured local browser regression can be imported and replayed as the same `FAIL` result before reduction begins.

This is intentionally a deterministic capture path, not unrestricted remote browser control and not a claim of framework-complete application bundling.

## Now — prove reduction quality on real captures

- Publish a small reproducible browser-failure corpus using the capture format rather than relying on one built-in example.
- Measure original/captured/reduced source size, trial count, result preservation, omitted-resource count and environment metadata.
- Add capture fidelity fixtures for stateful forms, delayed UI transitions, component-style pages and runtime-error failures.
- Keep production claims aligned with the exact canonical runtime and reducer.
- Keep browser containment tests green for navigation, form submission, result forgery, script/style export boundaries, capture import and WebMCP cancellation.

## Next — better semantic reduction

The next major reducer step is stronger semantic-unit quality while preserving non-overlap and deterministic removal semantics.

Candidate work:

1. HTML structural units that handle nested subtrees deliberately.
2. CSS two-stage rule/declaration reduction with non-overlapping frontiers.
3. JavaScript parser-backed statement/expression boundaries where the dependency/size cost is justified.
4. Hierarchical reduction in the **canonical production runtime**, with pinned descendants protecting required ancestors.
5. Tests proving the exact minimality class for each frontier.

The repository contains older/experimental depth-aware concepts, but they do not change the production claim until integrated into the canonical runtime and release tests.

## Next — deeper browser-test integrations

- Export metadata suitable for attaching a reduced reproducer and its capture provenance to a CI/bug artifact.
- Recipes for browser regressions, component sandboxes and test failures.
- Capture fidelity for selected module/bundler architectures without silently fetching cross-origin code.
- Optional cross-browser replay validation after a case has been reduced.
- A public Web Reduction Benchmark corpus with original/captured/reduced size, trial count, status preservation, capture diagnostics and environment metadata.

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
- fetch arbitrary cross-origin application code merely to improve capture rate,
- expose arbitrary hosted remote-browser control merely to appear more agentic.

## Contributing to roadmap work

Small fixtures, oracle cases and accessibility/docs work should become `good first issue` tasks. Parser/reducer semantics, sandbox boundaries and browser integrations should use an issue/RFC with explicit acceptance tests before implementation.
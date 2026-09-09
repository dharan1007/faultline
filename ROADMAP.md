# FAULTLINE Roadmap

FAULTLINE's roadmap is ordered around a measurable debugging outcome: **turn a real browser failure into a smaller trustworthy reproducer without changing what is failing.**

## Now — make the current reducer contract undeniable

- Keep production claims aligned with `src/runtime.js` + `src/reducer-engine.js`.
- Expand deterministic fixtures for HTML, CSS and JavaScript semantic-unit extraction.
- Add more oracle normalization and runtime-error specificity cases.
- Keep browser containment tests green for navigation, form submission, result forgery, script/style export boundaries and WebMCP cancellation.
- Publish a small reproducible browser-failure corpus rather than relying on one built-in example.
- Measure reduction size, trial count and oracle preservation without claiming global minimality.

## Next — better semantic reduction

The next major technical step is stronger semantic-unit quality while preserving non-overlap and deterministic removal semantics.

Candidate work:

1. HTML structural units that handle nested subtrees deliberately.
2. CSS two-stage rule/declaration reduction with non-overlapping frontiers.
3. JavaScript parser-backed statement/expression boundaries where the dependency/size cost is justified.
4. Hierarchical reduction in the **canonical production runtime**, with pinned descendants protecting required ancestors.
5. Tests proving the exact minimality class for each frontier.

The repository contains older/experimental depth-aware concepts, but they do not change the production claim until integrated into `src/runtime.js` and release tests.

## Next — browser-test integrations

- Playwright workflow that takes a deterministic failing case and produces an importable FAULTLINE case.
- Export metadata suitable for attaching a reduced reproducer to a bug/CI artifact.
- Recipes for browser regressions, component sandboxes and test failures.
- A public Web Reduction Benchmark corpus with original/reduced size, trial count, status preservation and environment metadata.

## Later — stronger isolation / scale

- Optional process/VM-backed execution for services accepting arbitrary third-party code.
- Standards-complete parsing for selected axes where it materially improves reduction quality.
- Cross-browser validation of reduced cases.
- Reproducer bundles with deterministic environment metadata.
- Stable reusable reducer/oracle packages after APIs settle.

## Non-goals

FAULTLINE will not:

- call a source globally minimal when only a bounded candidate set was tested,
- treat `UNRESOLVED` as success,
- disable containment to reduce more aggressively,
- claim a browser iframe is equivalent to process/VM isolation,
- invent reduction percentages for marketing,
- expose arbitrary remote/browser control merely to appear more agentic.

## Contributing to roadmap work

Small fixtures, oracle cases and accessibility/docs work should become `good first issue` tasks. Parser/reducer semantics, sandbox boundaries and browser integrations should use an issue/RFC with explicit acceptance tests before implementation.

## Real browser ingestion

- [x] Playwright snapshot capture pipeline for bounded DOM-state failures
- [x] Transactional capture import with canonical FAIL preflight and provenance
- [x] Browser API, human workbench and WebMCP capture import/export parity
- [ ] Script-aware capture/replay for failures whose causality cannot be represented by a final DOM snapshot
- [ ] Framework/dev-server adapters with explicit dependency packaging instead of silent network coupling

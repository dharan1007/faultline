# FAULTLINE Roadmap

FAULTLINE's roadmap is ordered around a measurable debugging outcome: **turn a real browser failure into a smaller trustworthy reproducer without changing what is failing.**

## Shipped foundation

- Deterministic PASS / FAIL / UNRESOLVED oracle execution with bounded interaction actions.
- Revision-guarded local state, evidence/history, recovery checkpoints and canonical case import/export.
- Native WebMCP causal tool surface sharing the same canonical runtime as the human workbench.
- Browser-side network/navigation/result-channel containment with real Chromium regression coverage.
- Versioned `faultline.capture` v1 artifacts, a local Playwright capture helper/CLI, strict capture-envelope validation, browser provenance, and accessible atomic workbench ingestion through canonical `loadCase`.
- Exact-tree staged/public Vercel parity before advancing the recoverable production branch.

## Now — prove the product on real failures

- Publish a small reproducible browser-failure corpus rather than relying on the built-in example.
- Add Playwright recipes for browser regressions, component sandboxes and application test failures using the shipped capture artifact workflow.
- Record original/reduced size, trial count, status preservation and browser/capture environment metadata without inventing benchmark results.
- Expand deterministic fixtures for HTML, CSS and JavaScript semantic-unit extraction.
- Keep browser containment, capture ingestion, WebMCP and recovery tests green as the reducer evolves.

## Next — better semantic reduction

The next major technical step is stronger semantic-unit quality while preserving non-overlap and deterministic removal semantics.

Candidate work:

1. HTML structural units that handle nested subtrees deliberately.
2. CSS two-stage rule/declaration reduction with non-overlapping frontiers.
3. JavaScript parser-backed statement/expression boundaries where the dependency/size cost is justified.
4. Hierarchical reduction in the **canonical production runtime**, with pinned descendants protecting required ancestors.
5. Tests proving the exact minimality class for each frontier.

The repository contains older/experimental depth-aware concepts, but they do not change the production claim until integrated into `src/runtime.js` and release tests.

## Next — deeper browser-test integrations

The first Playwright capture/import bridge is shipped. Follow-on work should increase coverage without pretending that arbitrary bundled applications can be losslessly reconstructed from a browser network trace.

- Framework/component adapters that can provide exact reducible source at the test boundary.
- CI artifact recipes that attach a `faultline.capture` plus the reduced standalone reproducer to failed jobs.
- Optional capture-time console/runtime evidence that remains provenance only until re-verified by the FAULTLINE oracle.
- Cross-browser capture/verification once deterministic semantics are defined for Chromium, Firefox and WebKit differences.
- A public Web Reduction Benchmark corpus with original/reduced size, trial count, status preservation and environment metadata.

## Later — stronger isolation / scale

- Optional process/VM-backed execution for services accepting arbitrary third-party code.
- Standards-complete parsing for selected axes where it materially improves reduction quality.
- Cross-browser validation of reduced cases.
- Reproducer bundles with deterministic environment metadata.
- Stable reusable reducer/oracle/capture packages after APIs settle.

## Non-goals

FAULTLINE will not:

- call a source globally minimal when only a bounded candidate set was tested,
- treat `UNRESOLVED` as success,
- disable containment to reduce more aggressively,
- claim a browser iframe is equivalent to process/VM isolation,
- invent reduction percentages for marketing,
- expose arbitrary remote/browser control merely to appear more agentic,
- claim that browser provenance proves an imported failure still reproduces before the canonical oracle is rerun,
- silently reconstruct incomplete framework/module source and call it a trustworthy reducer input.

## Contributing to roadmap work

Small fixtures, oracle cases and accessibility/docs work should become `good first issue` tasks. Parser/reducer semantics, sandbox boundaries and browser integrations should use an issue/RFC with explicit acceptance tests before implementation.

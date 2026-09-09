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

## Shipped — hierarchical HTML/CSS reduction

The canonical production reducer now performs structural coarse-to-fine reduction instead of feeding overlapping parent/child ranges into one flat candidate set:

- nested HTML elements expose deterministic `depth` and `parentId` metadata,
- void elements are leaves and script/style raw-text contents do not create fake descendants,
- CSS style rules expose declaration children and supported nested at-rules expose child rule structure,
- quoted delimiters and comments are respected by the structural scanners,
- HTML/CSS reduction operates over one non-overlapping depth frontier at a time,
- accepted shallower removals suppress descendants by re-discovering the current hierarchy,
- pinned descendants protect their full ancestor chain,
- surviving pins are remapped after accepted deletions shift source ranges,
- all hierarchy passes share one global reduction trial budget,
- the final candidate is independently executed and must still return `FAIL` before canonical commit,
- Browser API, human unit rendering and `faultline_units` WebMCP discovery expose the same canonical hierarchy metadata.

The scanners are deliberately bounded structural scanners, not standards-complete HTML5/CSSOM parsers. JavaScript remains the existing bounded statement-level scanner.

## Now — improve semantic precision and measured effectiveness

The next major technical work should improve reduction quality where evidence shows the current structural boundaries are insufficient:

1. JavaScript parser-backed statement/expression reduction where the dependency/size cost is justified.
2. A reproducible browser-failure corpus measuring original size, reduced size, trial count, preservation status, hierarchy passes and capture environment.
3. Corpus-driven HTML/CSS scanner hardening for malformed-but-browser-tolerated markup and advanced CSS constructs.
4. Reduction strategy improvements driven by benchmark data rather than additional heuristic complexity by default.

## Next — broader real-browser integrations

- Recipes/wrappers for common Playwright Test failure hooks and CI artifact upload flows without introducing a hosted arbitrary-browser service.
- Capture diagnostics that can be armed before a failing test step so bounded console/page-error evidence is retained in the artifact.
- Component-test and local dev-server capture recipes.
- Optional screenshot/trace references that remain provenance only and never become an implicit execution dependency.
- Cross-browser verification adapters where a reduced case can be executed deterministically in Chromium, Firefox and WebKit.
- A public Web Reduction Benchmark corpus with original/reduced size, trial count, status preservation and environment metadata.

## Later — stronger isolation / scale

- Optional process/VM-backed execution for services accepting arbitrary third-party code.
- Standards-complete parsing for selected axes where benchmark evidence shows it materially improves reduction quality.
- Reproducer bundles with deterministic environment metadata.
- Stable reusable reducer/oracle/capture packages after APIs settle.

## Non-goals

FAULTLINE will not:

- call a source globally minimal when only a bounded candidate set/frontier sequence was tested,
- treat `UNRESOLVED` as success,
- disable containment to reduce more aggressively,
- claim a browser iframe is equivalent to process/VM isolation,
- invent reduction percentages for marketing,
- fetch arbitrary capture URLs in hosted production,
- expose arbitrary remote/browser control merely to appear more agentic,
- claim `faultline.capture.v1` reconstructs an arbitrary SPA bundle when it does not,
- claim its bounded structural scanners are standards-complete parsers.

## Contributing to roadmap work

Small fixtures, oracle cases and accessibility/docs work should become `good first issue` tasks. Parser/reducer semantics, sandbox boundaries, capture adapters and browser integrations should use an issue/RFC with explicit acceptance tests before implementation.

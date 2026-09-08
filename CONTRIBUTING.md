# Contributing to FAULTLINE

FAULTLINE is a deterministic browser-failure reducer. The best contributions make failures easier to reproduce, reduction more semantically useful, containment stronger or evidence more trustworthy.

## High-value contributions

- Small synthetic browser-failure fixtures that expose real reducer/oracle edge cases.
- Improvements to HTML/CSS/JavaScript semantic-unit extraction with regression tests.
- New deterministic oracle cases or normalization tests.
- Sandbox/navigation/result-channel containment tests.
- Real-browser regression tests.
- Export/import and Playwright/browser-test integration improvements.
- Accessibility and developer-experience improvements.

Look for [`good first issue`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and [`help wanted`](https://github.com/dharan1007/faultline/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

## Setup

```bash
git clone https://github.com/dharan1007/faultline.git
cd faultline
npm install
npm test
npm run check
npm run build
```

For real-browser validation:

```bash
npm run test:browser
```

## Core invariants

1. A reduction may be committed only when the configured oracle still returns `FAIL`.
2. `UNRESOLVED` is not silently converted into PASS or FAIL.
3. Pinned units cannot be removed by reduction.
4. Stale expected revisions fail rather than mutating newer canonical state.
5. Probe operations do not mutate canonical case state.
6. Candidate execution remains inside the documented sandbox/CSP boundary.
7. Navigation/network/result-channel containment must not be weakened for convenience.
8. Exports must safely cross `<style>` and `<script>` boundaries.
9. WebMCP operations use the canonical runtime and preserve cancellation/revision behavior.
10. Minimality claims must match the reducer actually used by `src/runtime.js`.

## Reducer changes

The production runtime currently uses `src/reducer-engine.js`. If you change semantic-unit extraction or ddmin behavior:

- add a deterministic unit/regression test,
- explain candidate overlap/granularity implications,
- test pinned units,
- test baseline-not-failing and trial-budget behavior,
- verify final output still fails,
- update README claims if the minimality class changes.

Do not use an unused/experimental reducer implementation as evidence that production behavior changed.

## Browser/security changes

Read both `SECURITY.md` and `docs/SECURITY.md`. Attempt `npm run test:browser` for changes involving runtime execution, iframe policy, navigation, result channels, persistence or WebMCP.

Potential sandbox escapes or security vulnerabilities should be reported privately according to `SECURITY.md`.

## Pull requests

A strong PR includes:

- concrete failure/reducer problem,
- minimal synthetic fixture,
- expected PASS/FAIL/UNRESOLVED behavior,
- tests,
- browser-test evidence where relevant,
- security/minimality impact,
- docs update if externally observable behavior changed.

Keep PRs narrowly scoped. Reducer and sandbox changes are easier to review when unrelated UI refactors are kept separate.
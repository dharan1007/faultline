# FAULTLINE

**Turn a real browser failure into a smaller, independently verified reproducer without changing what is failing.**

FAULTLINE is a local-first causal browser debugging workbench. It captures an already-authorized Playwright page into a bounded `faultline.capture.v1` artifact, independently reproduces the failure, removes candidate HTML/CSS/JavaScript units under a deterministic oracle, and commits a reduction only while the same failure remains `FAIL`.

[Live workbench](https://faultline-webmcp.vercel.app/) · [Production contract](docs/PRODUCTION.md) · [Security](docs/SECURITY.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

[![ci](https://github.com/dharan1007/faultline/actions/workflows/ci.yml/badge.svg)](https://github.com/dharan1007/faultline/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What FAULTLINE proves

```text
caller-owned application / dev server
              ↓
      caller-owned Playwright page
              ↓
       faultline.capture.v1
              ↓
independent baseline execution == FAIL
              ↓
 semantic units + bounded causal trials
              ↓
keep a removal only if oracle still == FAIL
              ↓
re-verify the final candidate == FAIL
              ↓
source-minimal CI report
        + optional full reproducer bundle
```

A `PASS` baseline is not imported as a failure. An unsafe or unsupported experiment is `UNRESOLVED`, not silently reclassified as success. FAULTLINE does not claim a globally shortest program; the production claim is bounded 1-minimality relative to the semantic candidate frontier and trial budget actually tested.

## Supported ways to use it

### Public browser workbench

Open `https://faultline-webmcp.vercel.app/`. The browser owns the workspace and revision history. You can load a case, import a `faultline.capture.v1` artifact, run the oracle, probe individual removals, pin required units, reduce one axis or run Autopilot, restore prior revisions, inspect evidence, and export a standalone reproducer.

The hosted application does not provide a server-side customer source workspace and does not fetch a capture's `source.url`.

### Local CLI / CI runner

Clone a reviewed commit and install the exact lockfile:

```bash
git clone https://github.com/dharan1007/faultline.git
cd faultline
npm ci
npx playwright install chromium
```

Validate or inspect a capture without printing source:

```bash
node bin/faultline.mjs validate failure.faultline.json
node bin/faultline.mjs inspect failure.faultline.json
```

Reproduce and reduce the failure through the canonical browser runtime:

```bash
node bin/faultline.mjs analyze failure.faultline.json \
  --browser chromium \
  --axes html,css,js \
  --max-trials 80 \
  --out faultline-report.json
```

The default CI report is source-minimal. It contains hashes, byte counts, capture provenance, reduction statistics, final failure evidence and containment evidence. Full captured/reduced source is written only when you explicitly request it:

```bash
node bin/faultline.mjs analyze failure.faultline.json \
  --out faultline-report.json \
  --bundle faultline-reproducer.json
```

CLI exit classes are stable:

- `0` — requested validation/analysis completed and failure preservation succeeded;
- `2` — invalid input or unsupported capture/CLI contract;
- `3` — failure did not reproduce or was not preserved;
- `4` — containment violation detected;
- `5` — FAULTLINE/browser/runtime failure.

### GitHub Action

The repository ships a composite action that runs the same CLI analysis on the caller's CI runner:

```yaml
- uses: dharan1007/faultline@<immutable-commit-or-reviewed-tag>
  with:
    capture: artifacts/failure.faultline.json
    report: artifacts/faultline-report.json
    browser: chromium
    axes: html,css,js
    max-trials: '80'
```

Pin an immutable commit SHA or a reviewed release tag in production. Do not use a moving branch as the trust anchor for a security-sensitive workflow.

## Capture a real Playwright failure

The capture adapter receives a `page` your test already owns. It does not navigate to arbitrary remote targets or extract credentials.

```js
import {captureFaultlineCase} from './integrations/playwright-capture/index.js';

await page.goto('http://127.0.0.1:3000/profile');

await captureFaultlineCase({
  page,
  js: `
    const input = document.querySelector('#name');
    const save = document.querySelector('#save');
    input.addEventListener('input', () => save.dataset.name = input.value);
    save.addEventListener('click', () => {
      save.setAttribute('aria-disabled', save.dataset.name === 'alice' ? 'true' : 'false');
    });
  `,
  oracle: {
    kind: 'dom_attribute',
    selector: '#save',
    property: 'aria-disabled',
    equals: 'true',
    action: {
      kind: 'sequence',
      steps: [
        {kind: 'set_value', selector: '#name', value: 'alice'},
        {kind: 'click', selector: '#save'}
      ]
    },
    delayMs: 0
  },
  provenance: {
    testTitle: 'save remains disabled after valid name',
    testFile: 'tests/profile.spec.mjs'
  },
  writeTo: 'save-disabled.faultline.json'
});
```

The v1 capture contract is deliberately bounded:

- HTML, CSS and JavaScript are each limited to 1 MiB;
- the complete artifact is limited to 4 MiB;
- inaccessible/external dependencies are surfaced instead of silently reconstructed;
- import must independently reproduce `FAIL` before canonical state can change;
- validation failure, cancellation, stale revision, non-reproduction or persistence failure cannot replace the active case;
- v1 snapshots already-authorized observable state; it does not pretend to reconstruct an arbitrary SPA bundle.

## Failure oracles

Production oracle classes include:

- `dom_property`
- `dom_attribute`
- `dom_exists`
- `computed_style`
- `runtime_error`

Actions include `none`, `click`, `set_value`, `set_checked`, and bounded `sequence`. Waits and oracle delays are bounded. Results are always one of:

```text
PASS
FAIL
UNRESOLVED
```

`UNRESOLVED` is a first-class result for unsupported execution, blocked capabilities, missing action targets, timeouts or other cases where FAULTLINE cannot truthfully prove PASS/FAIL.

## Reduction model

The canonical reducer extracts semantic units for HTML/CSS/JavaScript, protects pinned units and required ancestors, verifies the baseline, and performs bounded delta-debugging trials. JavaScript uses pinned Acorn parsing when the source is parseable and a conservative fallback when it is intentionally syntactically invalid.

Reduction is one source axis at a time. A candidate is committed only after the oracle still returns `FAIL`. Final export preserves revision-bound provenance and bounded experiment history.

## Security boundary

Candidate source executes inside a sandboxed iframe without `allow-same-origin`, under a restrictive CSP. The regression suite covers network/navigation/resource containment across fetch, XHR, WebSocket, EventSource, beacon, workers, script/style/image/media/frame/object resources, CSS imports and related paths. It also covers stale revision guards, result forgery, cancellation cleanup, persistence recovery, CSP evidence and export isolation.

This is a **browser isolation boundary, not a VM/process boundary**. The supported industrial model is customer-owned application code executed on the customer's own browser or CI runner. Do not expose the current runtime as a shared multi-tenant hostile-code execution service. That requires an additional process/VM isolation layer, workload identity, quotas, network/filesystem namespaces and tenant scheduling.

Read [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/PRODUCTION.md`](docs/PRODUCTION.md) before using FAULTLINE as a security boundary.

## WebMCP and Browser API

The workbench exposes the same canonical operations through `window.faultline` and, where supported, browser WebMCP via `document.modelContext.registerTool()`. The production WebMCP surface has 17 tools covering inspection, capture import, case loading/reset, run, oracle/source mutation, semantic-unit discovery, probe, reduction, pinning, revisions/history, structured export and Autopilot.

Agent surfaces are not privileged implementations: they call the same revision-guarded canonical runtime used by the human workbench.

## Supply-chain and release evidence

Production CI uses `npm ci --ignore-scripts` against the committed `package-lock.json` and fails on high-severity runtime dependency advisories. Acorn and Playwright are exact-version dependencies. Dependabot monitors both npm and GitHub Actions dependencies.

Every release gate verifies:

- deterministic unit/contract tests;
- syntax/static checks;
- package exports;
- `npm pack --dry-run`;
- SPDX 2.3 SBOM generation from the exact lockfile;
- reducer performance/regression budget;
- the complete Chromium/WebMCP suite;
- representative Chromium, Firefox and WebKit behavior;
- real packaged CLI capture -> reproduce -> reduce -> re-verify behavior;
- CodeQL.

Release evidence includes the benchmark output, SBOM, `release.json` and `integrity.json`.

The public Vercel deployment is accepted only when the canonical URL converges to the exact verified `main` SHA and the deployed runtime files match their SHA-256 integrity manifest. “Deployment READY” by itself is not release evidence.

## Performance evidence

CI records original/reduced bytes, semantic-unit counts, trial count, wall time and failure preservation on a deterministic reducer benchmark. Those numbers are a regression budget, not a universal SLO. Real runtime depends on source size, oracle cost, browser startup, selected axes and trial budget.

## Run the repository verification locally

```bash
npm ci
npm audit --audit-level=high --omit=dev
npm test
npm run check
npm run build
npm run sbom
npm run verify:package
npx playwright install chromium firefox webkit
npm run test:browser
node tests/cross-browser-production.mjs
node tests/cli-browser.mjs
```

A release should not claim browser readiness from syntax/unit checks alone.

## Production deployment and rollback

Vercel Git integration deploys the public workbench from `main`. `release.json` identifies source provenance; `integrity.json` binds the shipped runtime assets. A post-release workflow verifies canonical production against the accepted source tree.

If verification fails, the deployment is treated as failed even if Vercel reports it ready. Roll back to the last accepted Vercel deployment or revert the offending `main` commit, rerun the complete repository gate, and accept production only after exact-tree verification passes again.

## Non-goals

FAULTLINE does not provide CAPTCHA/bot-defense bypass, credential scraping, arbitrary capture-URL fetching, a hosted remote-browser farm, or VM-grade hostile-code execution. Those are intentionally outside the current product boundary.

## Contributing

High-value contributions include reproducible browser failures, capture fixtures, reducer/oracle regressions, containment tests and integrations that turn real failures into trustworthy standalone reproducers. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT — see [`LICENSE`](LICENSE).

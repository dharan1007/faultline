# FAULTLINE Production Contract

This document defines the supported production boundary for FAULTLINE. It is intentionally narrower than “run arbitrary untrusted browser code as a hosted service.”

## Supported production modes

### 1. Public workbench

`https://faultline-webmcp.vercel.app/` is the canonical hosted static workbench. It is suitable for manually loaded or imported captures that the user chooses to execute in their own browser. Canonical production is accepted only when `release.json` identifies the exact `main` source SHA and every runtime asset matches `integrity.json`.

### 2. Local CLI / customer CI

The supported automation surface is the `faultline` CLI. It consumes a local `faultline.capture.v1` file and runs the same canonical workbench runtime in a local Playwright browser on the caller's machine or CI runner.

```bash
npm ci
npx playwright install chromium
node bin/faultline.mjs validate failure.faultline.json
node bin/faultline.mjs analyze failure.faultline.json \
  --browser chromium \
  --axes html,css,js \
  --max-trials 80 \
  --out faultline-report.json
```

`validate` and `inspect` never print captured source. `analyze` emits a source-minimal `faultline.ci-report.v1` containing hashes, byte counts, provenance, reduction evidence, final failure status, and containment evidence. Full source is exported only when the caller explicitly supplies `--bundle <path>`.

Exit classes:

- `0`: capture validated / requested analysis completed and failure was preserved.
- `2`: invalid input or unsupported capture/CLI contract.
- `3`: the captured failure did not reproduce or was not preserved after reduction.
- `4`: containment violation was detected.
- `5`: FAULTLINE/browser/runtime failure.

### 3. GitHub Action

A repository can invoke FAULTLINE directly from a pinned commit or release ref:

```yaml
- uses: dharan1007/faultline@<pinned-ref>
  with:
    capture: artifacts/failure.faultline.json
    report: artifacts/faultline-report.json
    browser: chromium
    axes: html,css,js
    max-trials: '80'
```

For production use, pin an immutable commit SHA or reviewed release tag. Do not pin `main` in a security-sensitive workflow.

The composite action performs an exact `npm ci`, materializes the pinned parser asset, installs the selected Playwright browser, executes the CLI analysis, and fails the job when FAULTLINE returns a non-zero exit class.

## Security boundary

Candidate HTML/CSS/JavaScript executes inside FAULTLINE's browser sandbox and restrictive CSP. The runtime has extensive regression tests for fetch/XHR/WebSocket/EventSource/beacon/worker/resource/navigation containment, stale revision guards, result forgery, cancellation cleanup, CSP, persistence/recovery, and export isolation.

This is a browser isolation boundary, not a process/VM boundary. The supported industrial model is **customer-owned code running on a customer-owned browser/CI runner**. Do not operate the current runtime as a multi-tenant service that accepts hostile third-party code from mutually untrusted tenants. That would require process/VM isolation, workload identity, resource quotas, filesystem/network namespaces, and per-tenant scheduling outside the current browser-only architecture.

## Capture data and confidentiality

A capture can contain proprietary DOM/CSS/JavaScript. FAULTLINE therefore defaults to local execution and source-minimal reports. The public workbench has no server-side capture workspace. The CLI does not upload captures to FAULTLINE. A complete reproducer bundle is opt-in.

Treat `.faultline.json` and explicit bundle outputs as source artifacts under the same access policy as the application code from which they were captured.

## Reproducibility and supply chain

The repository commits `package-lock.json` and CI installs with `npm ci --ignore-scripts`. The release gate fails on high-severity runtime dependency advisories. Playwright and Acorn are exact-version dependencies. CI produces an SPDX 2.3 SBOM from the exact lockfile and uploads it with reducer benchmark output plus source-bound `release.json`/`integrity.json` evidence.

The release gate also verifies:

- unit and contract tests;
- JavaScript syntax/static checks;
- package exports and `npm pack --dry-run`;
- deterministic reducer benchmark budgets;
- complete Chromium/WebMCP behavior;
- representative Chromium/Firefox/WebKit behavior;
- the packaged CLI's real capture -> reproduce -> reduce -> re-verify path;
- CodeQL.

A release is not production evidence if any of those checks are skipped or fail.

## Failure preservation

FAULTLINE accepts a capture into canonical state only after an independent run returns `FAIL`. Reduction keeps a candidate only when the same oracle continues to return `FAIL`. `UNRESOLVED` is never converted to success. The reducer claims bounded 1-minimality relative to the tested semantic frontier and trial budget; it does not claim a globally shortest program.

## Performance evidence

CI runs a deterministic reducer benchmark and records original/reduced bytes, semantic-unit counts, trial count, wall time, reduction percentage, and final preservation status. Treat this as a regression budget, not a universal latency SLO for all browser failures. Real latency depends on the oracle, source size, selected axes, browser startup, and trial budget.

## Production deployment and rollback

The public site is deployed by Vercel Git integration from `main`. A post-release verifier waits for the canonical alias and requires the exact source SHA plus the complete runtime asset tree. `release.json` and `integrity.json` are the machine-readable deployment evidence.

If a release fails canonical verification:

1. do not move the production source marker to the failed SHA;
2. identify the last deployment whose source SHA and integrity manifest were accepted;
3. roll the Vercel project back to that deployment or revert the offending `main` commit;
4. rerun the complete repository gate;
5. accept production only after the canonical verifier passes again.

## Operational non-goals

The current product does not provide a hosted multi-tenant arbitrary-browser farm, CAPTCHA/bot-defense bypass, remote credential scraping, automatic source-URL fetching, or VM-grade hostile-code isolation. Those are not hidden “enterprise” capabilities and must not be represented as such.

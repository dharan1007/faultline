# FAULTLINE Organisational Readiness Design

## Purpose

Move FAULTLINE from an experimentally validated local browser reducer to an organisational-grade failure-reduction system with explicit capability boundaries, real-application execution, reproducible evidence, and release gating based on real workloads rather than synthetic fixtures alone.

## Product boundary

FAULTLINE remains local-first and CI-first. It does not become a shared hostile-code multi-tenant execution service. Two execution modes are supported:

1. **Portable Reproducer Mode** — bounded HTML/CSS/explicit JavaScript executed in the existing sandbox. This mode must remain fully self-contained, network-contained, deterministic where the source permits it, and fail closed when dependencies cannot be represented safely.
2. **In-Situ Playwright Mode** — caller-owned Playwright browser/page executing the real application/runtime. This mode is for framework/runtime-dependent failures that cannot truthfully be reconstructed from DOM/CSS capture alone. It records an exact runtime-bound recipe and never claims portability unless an independent portable replay passes.

Every user-visible result declares which mode produced it.

## Action protocol

The canonical action protocol is shared by capture validation, sandbox execution, live Playwright execution, CLI artifacts, WebMCP, and benchmark runners.

Supported atomic actions:

- `click { selector }`
- `hover { selector }`
- `pointer_move { selector?, x?, y? }`
- `set_value { selector, value }`
- `set_checked { selector, checked }`
- `key_press { selector?, key }`
- `focus { selector }`
- `blur { selector }`
- `scroll { selector?, x?, y? }`
- `select_option { selector, value }`
- `wait { durationMs }` only inside bounded sequences

`sequence` supports at most 16 steps and at most 5000 ms aggregate explicit wait. Unknown fields, invalid selectors, non-finite coordinates, unsafe keys, and out-of-budget actions fail validation. Unsupported browser primitives return `UNRESOLVED`; they never silently degrade to a different interaction.

## Oracle and causal equivalence

The existing deterministic oracle classes remain authoritative for the portable runtime. The causal-fingerprint work from PR #38 becomes mandatory for every reduction decision.

A candidate is accepted only when:

- the baseline independently returns `FAIL`;
- the candidate returns `FAIL`;
- strong fingerprint dimensions match the baseline;
- any configured supporting dimensions satisfy their declared tolerance;
- the final candidate is independently rerun after reduction.

A different failure is `DIFFERENT_FAIL`, not success. Timeout, navigation policy, dependency loss, or missing action targets are `UNRESOLVED`.

## In-Situ Playwright mode

Create `integrations/playwright-live/` with a caller-owned page API. FAULTLINE must never create an unauthorised external session or inherit secrets implicitly.

The live contract accepts:

- `page`: existing Playwright Page;
- `recipe`: ordered canonical actions;
- `oracle`: supported live oracle;
- `reset`: caller callback invoked before every trial;
- `provenance`: application URL, source commit, test file/title, browser metadata;
- `budgets`: max trials and wall clock.

Before each trial FAULTLINE calls `reset`, verifies the page is at the declared origin/runtime identity when supplied, executes actions using Playwright-native primitives, evaluates the oracle, and computes a causal fingerprint. The first production reduction target in live mode is the action sequence itself; action ddmin removes unnecessary setup/interactions while preserving the same cause. Runtime-bound artifacts retain the source commit and reset contract identity so they cannot be mistaken for standalone reproducers.

## Runtime-bound reproducer artifact

Add a versioned `faultline.runtime-repro.v1` artifact containing:

- source repository and exact 40-hex commit when available;
- application URL/origin;
- browser name/version + Playwright version;
- reset contract identifier;
- original and reduced action recipe;
- oracle;
- baseline/final causal fingerprints;
- trial counts, wall time and reduction metrics;
- external dependency list;
- explicit `portable: false`.

Portable bundles retain `portable: true` only after independent self-contained replay.

## External qualification corpus

The release corpus consumes untouched external cases with immutable provenance. A case is invalid when repository, exact upstream commit, original command/reproduction, expected failure identity, or licensing/provenance fields are missing. Zero SHAs and mutable branch-only identities are rejected.

Each executed case records:

- baseline reproduction result;
- support classification;
- capture/live-mode success;
- candidate reduction result;
- same-cause outcome;
- original and reduced bytes/steps;
- P50/P95 trial timing inputs;
- unsupported/unresolved reason;
- final independent rerun.

No capability can be labelled production from checked-in test files alone.

## Production evidence thresholds

For an eligible release corpus with at least 30 independent external cases and at least 10 accepted reductions:

- known false-equivalent accepted reductions = 0;
- same-cause preservation among accepted reductions >= 99%;
- reproduction success among explicitly supported cases >= 90%;
- unsupported cases must fail closed;
- median structural reduction for portable eligible cases >= 60% OR median action-step reduction for live eligible cases >= 30%;
- P50/P95 timing must be published from measured runs, without a fabricated target.

If sample-size requirements are not met, status remains `EXPERIMENTAL` even if all observed cases pass.

## Security and organisational controls

- Browser sandbox mode remains non-same-origin and network-contained.
- Live mode runs only in caller-owned Playwright contexts and never exports cookies, localStorage, authorization headers, password values or file contents.
- Captured diagnostics remain bounded and secrets must be redacted by the adapter before persistence/export.
- CI artifacts include source SHA, browser versions, benchmark manifest digest and evidence digest.
- Production deployment is accepted only when source provenance and published integrity manifest match the qualified SHA.
- Release workflows may run on a dedicated self-hosted Linux runner labelled `production-ci`, but untrusted PR code must never receive production credentials.

## Release state model

Capability state is one of `PLANNED`, `EXPERIMENTAL`, `QUALIFIED`, `PRODUCTION`, `UNSUPPORTED`.

`PRODUCTION` requires both normal correctness/security gates and the external evidence thresholds above. Loss of evidence, stale provenance, or regression below a threshold demotes the capability automatically.

## Non-goals

This design does not provide VM isolation, arbitrary hostile multi-tenant execution, automatic reproduction of every framework failure, or a claim that a DOM snapshot captures application logic. Those remain explicit non-goals until separate architectures and evidence exist.

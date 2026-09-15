# Causal equivalence — SAME_CAUSE acceptance

Binary FAIL preservation is necessary but not sufficient. A reduction that
turns "checkout races payment state" into "JS syntax error" is worthless even
though both are FAIL.

## Fingerprint dimensions

`src/causal-fingerprint.js` (`faultline.causal-fingerprint.v1`):

- strong: `oracleIdentity` (oracle kind+selector+property+expected),
  `exceptionClass`, `stackSignature` (normalized, line numbers
  stripped, 12 frames), `assertionIdentity`
- supporting: `networkSequence`, `domInvariant`, `requestResponse`,
  `eventOrdering`, `consoleSignature`, `renderRegion`, `statePredicate`,
  `timingRelation`, `sourceAncestry`

## Enforcement status (honest)

- Commit-level SAME_CAUSE is enforced in `src/runtime.js`: `reduce()`
  runs an explicit baseline, attaches a fingerprint to every `runCase`
  result, and commits only when `verdictForReduction(baseline, final)`
  accepts; otherwise it throws `REDUCTION_LOST_FAILURE:<reason>`.
  `probe()` reports `sameCause`/`cause` against a fresh baseline without
  mutating state. Fingerprints persist in the experiment ledger and
  `exportBundle()` (`causalFingerprint`) and the CLI report
  (`baseline.fingerprint`, per-axis `cause`, `final.fingerprint`).
- Trial-level SAME_CAUSE inside the ddmin frontiers is planned, not yet
  enforced: intermediate trials still accept binary FAIL. The commit-level
  gate catches drift (final is compared against the original baseline),
  but per-trial cause tracking is the next hardening step.
- Fingerprint helpers live in import-free `src/causal-fingerprint.js`
  (shared by browser runtime, Node CLI and tests — one implementation).

## Acceptance rule (provisional)

- every jointly-present strong dimension must match, else `DIFFERENT_FAIL`;
- plus ≥ 2 supporting matches, else `WEAK_MATCH` / `INSUFFICIENT_DIMENSIONS`;
- only `FAIL + FAIL + SAME_CAUSE` accepts a removal (`verdictForReduction`).

## Flaky failures

Single-run preservation proves nothing for nondeterministic bugs. Default
policy (`src/flaky-policy.js`): baseline fail ≥ 15/20, candidate fail ≥
15/20, fingerprint confidence ≥ 0.8. Wilson lower bound reported for the
baseline rate. Tune per-suite via `minFails` / `trials` / `confidenceThreshold`
and record the policy in the evidence manifest.

## Targets

- 0 observed false-equivalent accepted reproductions on the release corpus
  (seed: `tests/false-equivalence-rejection.mjs` proves a TypeError→
  ReferenceError drift is rejected at probe and reduce in a real browser);
- deterministic reproduction where the original failure is deterministic;
- regression validation of any agent fix on the original unreduced test.

## Minimality reporting

Successful `reduce()` returns `minimality: 'LOCALLY_MINIMAL'` — ddmin ran to
fixpoint over the declared structural domain, so no single remaining unit in
that domain can be removed without losing SAME_CAUSE FAIL. Budget exhaustion
throws `TRIAL_BUDGET_EXHAUSTED` and commits nothing; it is reported as
`BUDGET_LIMITED`, never as minimal (see `MINIMALITY_STATUSES` in
`src/reduction-dimensions.js`). The CLI report carries per-axis
`cause`/`sameCause`/`minimality` plus baseline and final fingerprints.

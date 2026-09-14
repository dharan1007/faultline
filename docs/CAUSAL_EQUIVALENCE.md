# Causal equivalence — SAME_CAUSE acceptance

Binary FAIL preservation is necessary but not sufficient. A reduction that
turns "checkout races payment state" into "JS syntax error" is worthless even
though both are FAIL.

## Fingerprint dimensions

`src/causal-fingerprint.js` (`faultline.causal-fingerprint.v1`):

- strong: `exceptionClass`, `stackSignature` (normalized, line numbers
  stripped, 12 frames), `assertionIdentity`
- supporting: `networkSequence`, `domInvariant`, `requestResponse`,
  `eventOrdering`, `consoleSignature`, `renderRegion`, `statePredicate`,
  `timingRelation`, `sourceAncestry`

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

- 0 observed false-equivalent accepted reproductions on the release corpus;
- deterministic reproduction where the original failure is deterministic;
- regression validation of any agent fix on the original unreduced test.

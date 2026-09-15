// Flaky-failure policy — never pretend one failing run proves preservation.
// Default provisional policy: baseline fail >= 15/20, candidate fail >= 15/20
// with causal-fingerprint confidence >= threshold. Binomial helpers included.
export const DEFAULT_BASELINE_TRIALS = 20;
export const DEFAULT_MIN_FAILS = 15;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

export function summarizeRuns(results) {
  // results: array of 'FAIL' | 'PASS' | 'UNRESOLVED'
  const fails = results.filter((r) => r === 'FAIL').length;
  const passes = results.filter((r) => r === 'PASS').length;
  const unresolved = results.length - fails - passes;
  return { total: results.length, fails, passes, unresolved, failRate: results.length ? fails / results.length : 0 };
}

// Normal-approx two-sided 95% Wilson lower bound for fail rate.
export function wilsonLowerBound(fails, total, z = 1.96) {
  if (!total) return 0;
  const p = fails / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return Math.max(0, (center - margin) / denom);
}

export function baselineAccepted(results, { minFails = DEFAULT_MIN_FAILS, trials = DEFAULT_BASELINE_TRIALS } = {}) {
  const s = summarizeRuns(results);
  if (s.total < trials) return { accepted: false, reason: `INSUFFICIENT_TRIALS:${s.total}/${trials}`, ...s };
  if (s.fails < minFails) return { accepted: false, reason: `BASELINE_FLAKY:${s.fails}/${s.total}`, ...s };
  return { accepted: true, reason: 'BASELINE_STABLE', ...s, wilsonLowerBound: wilsonLowerBound(s.fails, s.total) };
}

export function candidateAccepted(baselineResults, candidateResults, fingerprintConfidence, opts = {}) {
  const { minFails = DEFAULT_MIN_FAILS, trials = DEFAULT_BASELINE_TRIALS, confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD } = opts;
  const base = baselineAccepted(baselineResults, { minFails, trials });
  if (!base.accepted) return { accept: false, reason: base.reason };
  const cand = summarizeRuns(candidateResults);
  if (cand.total < trials) return { accept: false, reason: `CANDIDATE_INSUFFICIENT_TRIALS:${cand.total}/${trials}` };
  if (cand.fails < minFails) return { accept: false, reason: `CANDIDATE_LOST_FAILURE:${cand.fails}/${cand.total}` };
  if ((fingerprintConfidence ?? 0) < confidenceThreshold) {
    return { accept: false, reason: `LOW_FINGERPRINT_CONFIDENCE:${fingerprintConfidence}` };
  }
  return { accept: true, reason: 'SAME_CAUSE_STABLE', baseline: base, candidate: cand };
}

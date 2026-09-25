import { verdictForReduction } from './causal-fingerprint.js';

// Faultline causal stability policy.
//
// Fast path: a failure that reproduces with the SAME_CAUSE fingerprint on
// three consecutive observations is treated as deterministic. Accepted
// candidate removals are independently confirmed once more.
//
// Escalation path: a baseline that is not perfectly deterministic but does not
// exhibit a DIFFERENT_FAIL is sampled up to 20 observations. At least 15/20
// observations must reproduce the baseline cause. Candidate preservation uses
// the same 15/20 rule. A different-cause FAIL is never counted as evidence.
//
// This keeps deterministic reductions practical while preventing a single
// lucky flaky observation from being promoted into canonical state.

export const DEFAULT_BASELINE_TRIALS = 20;
export const DEFAULT_MIN_FAILS = 15;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
export const DEFAULT_DETERMINISTIC_PROBE_RUNS = 3;

const fail = code => { throw new Error(code); };
const validStatus = status => ['FAIL', 'PASS', 'UNRESOLVED'].includes(status);

export function summarizeRuns(results) {
  const statuses = results.map(result => typeof result === 'string' ? result : result?.status);
  const fails = statuses.filter(status => status === 'FAIL').length;
  const passes = statuses.filter(status => status === 'PASS').length;
  const unresolved = statuses.length - fails - passes;
  return {
    total: statuses.length,
    fails,
    passes,
    unresolved,
    failRate: statuses.length ? fails / statuses.length : 0
  };
}

// Two-sided 95% Wilson lower confidence bound for a binomial proportion.
export function wilsonLowerBound(fails, total, z = 1.96) {
  if (!total) return 0;
  const p = fails / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return Math.max(0, (center - margin) / denom);
}

export function baselineAccepted(results, {
  minFails = DEFAULT_MIN_FAILS,
  trials = DEFAULT_BASELINE_TRIALS
} = {}) {
  const summary = summarizeRuns(results);
  if (summary.total < trials) {
    return { accepted: false, reason: `INSUFFICIENT_TRIALS:${summary.total}/${trials}`, ...summary };
  }
  if (summary.fails < minFails) {
    return { accepted: false, reason: `BASELINE_FLAKY:${summary.fails}/${summary.total}`, ...summary };
  }
  return {
    accepted: true,
    reason: 'BASELINE_STABLE',
    ...summary,
    wilsonLowerBound: wilsonLowerBound(summary.fails, summary.total)
  };
}

// Kept for callers that already have status-only observations plus an
// independently computed aggregate fingerprint confidence.
export function candidateAccepted(
  baselineResults,
  candidateResults,
  fingerprintConfidence,
  {
    minFails = DEFAULT_MIN_FAILS,
    trials = DEFAULT_BASELINE_TRIALS,
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD
  } = {}
) {
  const baseline = baselineAccepted(baselineResults, { minFails, trials });
  if (!baseline.accepted) return { accept: false, reason: baseline.reason };
  const candidate = summarizeRuns(candidateResults);
  if (candidate.total < trials) {
    return { accept: false, reason: `CANDIDATE_INSUFFICIENT_TRIALS:${candidate.total}/${trials}` };
  }
  if (candidate.fails < minFails) {
    return { accept: false, reason: `CANDIDATE_LOST_FAILURE:${candidate.fails}/${candidate.total}` };
  }
  if ((fingerprintConfidence ?? 0) < confidenceThreshold) {
    return { accept: false, reason: `LOW_FINGERPRINT_CONFIDENCE:${fingerprintConfidence}` };
  }
  return { accept: true, reason: 'SAME_CAUSE_STABLE', baseline, candidate };
}

function assertObservation(result) {
  if (!result || !validStatus(result.status)) fail('FAULTLINE_STABILITY_INVALID_OBSERVATION');
  return result;
}

function compareTo(reference, observation) {
  const result = assertObservation(observation);
  if (result.status !== 'FAIL') {
    return { type: result.status, verdict: { accept: false, reason: `CANDIDATE_${result.status}` } };
  }
  const verdict = verdictForReduction(reference, result);
  return verdict.accept
    ? { type: 'SAME_CAUSE_FAIL', verdict }
    : { type: 'DIFFERENT_FAIL', verdict };
}

function stabilitySummary(observations, reference) {
  let sameCauseFails = 0;
  let differentFails = 0;
  let passes = 0;
  let unresolved = 0;
  let minimumFingerprintConfidence = 1;
  const causeReasons = [];

  for (const observation of observations) {
    const classified = compareTo(reference, observation);
    causeReasons.push(classified.verdict.reason);
    if (classified.type === 'SAME_CAUSE_FAIL') {
      sameCauseFails++;
      const confidence = Number(classified.verdict.confidence);
      if (Number.isFinite(confidence)) minimumFingerprintConfidence = Math.min(minimumFingerprintConfidence, confidence);
    } else if (classified.type === 'DIFFERENT_FAIL') {
      differentFails++;
    } else if (classified.type === 'PASS') {
      passes++;
    } else {
      unresolved++;
    }
  }

  return {
    total: observations.length,
    sameCauseFails,
    differentFails,
    passes,
    unresolved,
    sameCauseFailRate: observations.length ? sameCauseFails / observations.length : 0,
    wilsonLowerBound: wilsonLowerBound(sameCauseFails, observations.length),
    minimumFingerprintConfidence: sameCauseFails ? minimumFingerprintConfidence : 0,
    causeReasons
  };
}

async function runObservation(run) {
  const result = await run();
  return assertObservation(result);
}

/**
 * Establish the baseline causal stability profile.
 *
 * Returns:
 * {
 *   accepted, mode: 'deterministic'|'flaky'|'rejected',
 *   reference, observations, summary, reason
 * }
 */
export async function establishCausalStability({
  run,
  deterministicProbeRuns = DEFAULT_DETERMINISTIC_PROBE_RUNS,
  trials = DEFAULT_BASELINE_TRIALS,
  minFails = DEFAULT_MIN_FAILS
} = {}) {
  if (typeof run !== 'function') fail('FAULTLINE_STABILITY_RUN_REQUIRED');
  if (!Number.isSafeInteger(deterministicProbeRuns) || deterministicProbeRuns < 2 || deterministicProbeRuns > trials) {
    fail('FAULTLINE_STABILITY_INVALID_PROBE_RUNS');
  }
  if (!Number.isSafeInteger(trials) || trials < deterministicProbeRuns || trials > 100) {
    fail('FAULTLINE_STABILITY_INVALID_TRIALS');
  }
  if (!Number.isSafeInteger(minFails) || minFails < 1 || minFails > trials) {
    fail('FAULTLINE_STABILITY_INVALID_MIN_FAILS');
  }

  const first = await runObservation(run);
  if (first.status !== 'FAIL' || !first.fingerprint) {
    return {
      accepted: false,
      mode: 'rejected',
      reference: first,
      observations: [first],
      summary: summarizeRuns([first]),
      reason: first.status === 'FAIL' ? 'BASELINE_MISSING_FINGERPRINT' : 'BASELINE_NOT_FAILING'
    };
  }

  const observations = [first];
  for (let index = 1; index < deterministicProbeRuns; index++) {
    observations.push(await runObservation(run));
  }

  let summary = stabilitySummary(observations, first);
  if (summary.differentFails > 0) {
    return {
      accepted: false,
      mode: 'rejected',
      reference: first,
      observations,
      summary,
      reason: 'BASELINE_CAUSE_UNSTABLE'
    };
  }

  if (summary.sameCauseFails === deterministicProbeRuns) {
    return {
      accepted: true,
      mode: 'deterministic',
      reference: first,
      observations,
      summary,
      reason: 'DETERMINISTIC_SAME_CAUSE'
    };
  }

  while (observations.length < trials) {
    observations.push(await runObservation(run));
    summary = stabilitySummary(observations, first);
    if (summary.differentFails > 0) {
      return {
        accepted: false,
        mode: 'rejected',
        reference: first,
        observations,
        summary,
        reason: 'BASELINE_CAUSE_UNSTABLE'
      };
    }
  }

  summary = stabilitySummary(observations, first);
  if (summary.sameCauseFails < minFails) {
    return {
      accepted: false,
      mode: 'rejected',
      reference: first,
      observations,
      summary,
      reason: `BASELINE_INSUFFICIENT_SAME_CAUSE:${summary.sameCauseFails}/${trials}`
    };
  }

  return {
    accepted: true,
    mode: 'flaky',
    reference: first,
    observations,
    summary,
    reason: 'FLAKY_SAME_CAUSE_STABLE'
  };
}

/**
 * Evaluate whether a candidate preserves an established baseline profile.
 *
 * Deterministic profile: two consecutive SAME_CAUSE observations required.
 * Flaky profile: minFails/trials SAME_CAUSE observations required, and any
 * DIFFERENT_FAIL rejects immediately.
 */
export async function evaluateCandidateStability({
  run,
  profile,
  deterministicConfirmRuns = 2,
  trials = DEFAULT_BASELINE_TRIALS,
  minFails = DEFAULT_MIN_FAILS
} = {}) {
  if (typeof run !== 'function') fail('FAULTLINE_STABILITY_RUN_REQUIRED');
  if (!profile?.accepted || !profile.reference?.fingerprint) fail('FAULTLINE_STABILITY_PROFILE_REQUIRED');

  const observations = [];
  const requiredRuns = profile.mode === 'deterministic' ? deterministicConfirmRuns : trials;
  if (!Number.isSafeInteger(requiredRuns) || requiredRuns < 1 || requiredRuns > 100) {
    fail('FAULTLINE_STABILITY_INVALID_CANDIDATE_RUNS');
  }

  for (let index = 0; index < requiredRuns; index++) {
    const observation = await runObservation(run);
    observations.push(observation);
    const classified = compareTo(profile.reference, observation);

    // A different cause is a hard rejection. On the deterministic fast path,
    // PASS/UNRESOLVED also rejects immediately rather than wasting a rerun.
    if (classified.type === 'DIFFERENT_FAIL') {
      return {
        accept: false,
        reason: classified.verdict.reason,
        observations,
        summary: stabilitySummary(observations, profile.reference)
      };
    }
    if (profile.mode === 'deterministic' && classified.type !== 'SAME_CAUSE_FAIL') {
      return {
        accept: false,
        reason: `DETERMINISTIC_CANDIDATE_${classified.type}`,
        observations,
        summary: stabilitySummary(observations, profile.reference)
      };
    }
  }

  const summary = stabilitySummary(observations, profile.reference);
  if (profile.mode === 'deterministic') {
    const accept = summary.sameCauseFails === requiredRuns && summary.differentFails === 0;
    return {
      accept,
      reason: accept ? 'DETERMINISTIC_SAME_CAUSE_CONFIRMED' : 'DETERMINISTIC_CONFIRMATION_FAILED',
      observations,
      summary
    };
  }

  const accept = summary.differentFails === 0 && summary.sameCauseFails >= minFails;
  return {
    accept,
    reason: accept ? 'FLAKY_SAME_CAUSE_CONFIRMED' : `FLAKY_CANDIDATE_INSUFFICIENT_SAME_CAUSE:${summary.sameCauseFails}/${requiredRuns}`,
    observations,
    summary
  };
}

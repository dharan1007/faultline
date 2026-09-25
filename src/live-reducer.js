import { validateCaptureAction } from './capture-contract.js';
import {
  establishCausalStability,
  evaluateCandidateStability
} from './flaky-policy.js';

const fail = code => { throw new Error(code); };
const clone = value => structuredClone(value);

function validateRecipe(recipe) {
  if (!Array.isArray(recipe) || recipe.length < 1 || recipe.length > 64) fail('FAULTLINE_LIVE_INVALID_RECIPE');
  for (const action of recipe) validateCaptureAction(action);
  return recipe;
}

async function executeTrial(runTrial, recipe, signal) {
  if (signal?.aborted) throw new DOMException('Faultline live reduction aborted', 'AbortError');
  const result = await runTrial(clone(recipe), { signal });
  if (!result || !['PASS', 'FAIL', 'UNRESOLVED'].includes(result.status)) fail('FAULTLINE_LIVE_INVALID_TRIAL_RESULT');
  return result;
}

export async function reduceLiveRecipe({
  runTrial,
  recipe,
  maxTrials = 160,
  signal,
  stability = {}
} = {}) {
  if (typeof runTrial !== 'function') fail('FAULTLINE_LIVE_RUN_TRIAL_REQUIRED');
  validateRecipe(recipe);
  if (!Number.isSafeInteger(maxTrials) || maxTrials < 8 || maxTrials > 2000) fail('FAULTLINE_LIVE_INVALID_TRIAL_BUDGET');

  let browserRuns = 0;
  let candidateEvaluations = 0;
  const runRecipe = async candidate => {
    if (browserRuns >= maxTrials) fail('FAULTLINE_LIVE_TRIAL_BUDGET_EXHAUSTED');
    browserRuns++;
    return executeTrial(runTrial, candidate, signal);
  };

  const original = clone(recipe);
  const baselineProfile = await establishCausalStability({
    run: () => runRecipe(original),
    ...stability
  });
  if (!baselineProfile.accepted) {
    fail(`FAULTLINE_LIVE_BASELINE_NOT_CAUSALLY_STABLE:${baselineProfile.reason}`);
  }

  const evaluate = async candidate => {
    candidateEvaluations++;
    const remaining = maxTrials - browserRuns;
    if (remaining <= 0) fail('FAULTLINE_LIVE_TRIAL_BUDGET_EXHAUSTED');
    const requestedTrials = baselineProfile.mode === 'flaky'
      ? Math.min(stability.trials ?? 20, remaining)
      : undefined;
    const result = await evaluateCandidateStability({
      run: () => runRecipe(candidate),
      profile: baselineProfile,
      ...stability,
      ...(requestedTrials ? { trials: requestedTrials } : {})
    });
    return result;
  };

  let current = clone(original);
  let granularity = 2;

  while (current.length > 1 && browserRuns < maxTrials) {
    const chunkSize = Math.ceil(current.length / granularity);
    let changed = false;

    for (let start = 0; start < current.length && browserRuns < maxTrials; start += chunkSize) {
      const candidate = current.filter((_, index) => index < start || index >= start + chunkSize);
      if (candidate.length === 0) continue;

      const result = await evaluate(candidate);
      if (result.accept) {
        current = candidate;
        granularity = Math.max(2, granularity - 1);
        changed = true;
        break;
      }
    }

    if (changed) continue;
    if (granularity >= current.length) break;
    granularity = Math.min(current.length, granularity * 2);
  }

  const finalStability = await evaluate(current);
  if (!finalStability.accept) {
    fail(`FAULTLINE_LIVE_FINAL_CAUSE_MISMATCH:${finalStability.reason}`);
  }

  const finalObservation = finalStability.observations.findLast?.(item => item.status === 'FAIL')
    ?? [...finalStability.observations].reverse().find(item => item.status === 'FAIL')
    ?? null;

  return {
    schema: 'faultline.live-reduction.v2',
    originalRecipe: original,
    recipe: clone(current),
    originalSteps: original.length,
    reducedSteps: current.length,
    removedSteps: original.length - current.length,
    reduction: original.length ? 1 - current.length / original.length : 0,
    trialCount: candidateEvaluations,
    browserRuns,
    stabilityMode: baselineProfile.mode,
    baselineStability: clone(baselineProfile.summary),
    finalStability: clone(finalStability.summary),
    baselineFingerprint: clone(baselineProfile.reference.fingerprint),
    finalFingerprint: clone(finalObservation?.fingerprint ?? baselineProfile.reference.fingerprint),
    cause: finalStability.reason,
    independentFinalRerun: true
  };
}

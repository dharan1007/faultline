import { verdictForReduction } from './causal-fingerprint.js';
import { validateCaptureAction } from './capture-contract.js';

const fail=code=>{throw new Error(code)};
const clone=value=>structuredClone(value);

function validateRecipe(recipe){
  if(!Array.isArray(recipe)||recipe.length<1||recipe.length>64)fail('FAULTLINE_LIVE_INVALID_RECIPE');
  for(const action of recipe)validateCaptureAction(action);
  return recipe;
}

async function executeTrial(runTrial,recipe,signal){
  if(signal?.aborted)throw new DOMException('Faultline live reduction aborted','AbortError');
  const result=await runTrial(clone(recipe),{signal});
  if(!result||!['PASS','FAIL','UNRESOLVED'].includes(result.status))fail('FAULTLINE_LIVE_INVALID_TRIAL_RESULT');
  return result;
}

export async function reduceLiveRecipe({runTrial,recipe,maxTrials=80,signal}={}){
  if(typeof runTrial!=='function')fail('FAULTLINE_LIVE_RUN_TRIAL_REQUIRED');
  validateRecipe(recipe);
  if(!Number.isSafeInteger(maxTrials)||maxTrials<2||maxTrials>500)fail('FAULTLINE_LIVE_INVALID_TRIAL_BUDGET');
  let trials=0;
  const run=async candidate=>{
    if(trials>=maxTrials)fail('FAULTLINE_LIVE_TRIAL_BUDGET_EXHAUSTED');
    trials+=1;
    return executeTrial(runTrial,candidate,signal);
  };
  const original=clone(recipe);
  const baseline=await run(original);
  if(baseline.status!=='FAIL'||!baseline.fingerprint)fail('FAULTLINE_LIVE_BASELINE_NOT_CAUSALLY_FAILING');

  let current=clone(original);
  let granularity=2;
  while(current.length>1&&trials<maxTrials-1){
    const chunkSize=Math.ceil(current.length/granularity);
    let changed=false;
    for(let start=0;start<current.length&&trials<maxTrials-1;start+=chunkSize){
      const candidate=current.filter((_,index)=>index<start||index>=start+chunkSize);
      if(candidate.length===0)continue;
      const result=await run(candidate);
      const verdict=verdictForReduction(baseline,result);
      if(verdict.accept){current=candidate;granularity=Math.max(2,granularity-1);changed=true;break;}
    }
    if(changed)continue;
    if(granularity>=current.length)break;
    granularity=Math.min(current.length,granularity*2);
  }

  const finalResult=await run(current);
  const finalVerdict=verdictForReduction(baseline,finalResult);
  if(!finalVerdict.accept)fail(`FAULTLINE_LIVE_FINAL_CAUSE_MISMATCH:${finalVerdict.reason}`);
  return {
    schema:'faultline.live-reduction.v1',
    originalRecipe:original,
    recipe:clone(current),
    originalSteps:original.length,
    reducedSteps:current.length,
    removedSteps:original.length-current.length,
    reduction:original.length?1-current.length/original.length:0,
    trialCount:trials,
    baselineFingerprint:clone(baseline.fingerprint),
    finalFingerprint:clone(finalResult.fingerprint),
    cause:finalVerdict.reason,
    independentFinalRerun:true
  };
}

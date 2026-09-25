import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerprint } from '../src/causal-fingerprint.js';
import { reduceLiveRecipe } from '../src/live-reducer.js';

const targetFingerprint=buildFingerprint({oracle:{kind:'dom_attribute',selector:'#status',property:'data-bad',equals:'1'}});
const differentFingerprint=buildFingerprint({oracle:{kind:'runtime_error',equals:'boom'},exceptionClass:'TypeError'});

test('removes irrelevant actions while preserving the original cause',async()=>{
  const recipe=[
    {kind:'click',selector:'#noise'},
    {kind:'click',selector:'#trigger'},
    {kind:'scroll',y:200}
  ];
  const runTrial=async candidate=>candidate.some(action=>action.selector==='#trigger')
    ? {status:'FAIL',fingerprint:targetFingerprint,evidence:{}}
    : {status:'PASS',fingerprint:targetFingerprint,evidence:{}};
  const result=await reduceLiveRecipe({runTrial,recipe,maxTrials:20});
  assert.deepEqual(result.recipe,[{kind:'click',selector:'#trigger'}]);
  assert.equal(result.removedSteps,2);
  assert.equal(result.cause,'SAME_CAUSE');
  assert.equal(result.independentFinalRerun,true);
});

test('never accepts a shorter recipe that fails for a different cause',async()=>{
  const recipe=[{kind:'click',selector:'#setup'},{kind:'click',selector:'#trigger'}];
  const runTrial=async candidate=>{
    const setup=candidate.some(action=>action.selector==='#setup');
    const trigger=candidate.some(action=>action.selector==='#trigger');
    if(setup&&trigger)return {status:'FAIL',fingerprint:targetFingerprint,evidence:{}};
    if(trigger)return {status:'FAIL',fingerprint:differentFingerprint,evidence:{}};
    return {status:'PASS',fingerprint:targetFingerprint,evidence:{}};
  };
  const result=await reduceLiveRecipe({runTrial,recipe,maxTrials:20});
  assert.deepEqual(result.recipe,recipe);
  assert.equal(result.removedSteps,0);
});

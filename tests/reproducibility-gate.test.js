import test from 'node:test';
import assert from 'node:assert/strict';

import {runReproducibilityGate} from '../apps/coordinator/replay.mjs';

test('reproducibility gate requires two consecutive matching FAIL outcomes by default',async()=>{
  let calls=0;
  const result=await runReproducibilityGate({run:async()=>{calls+=1;return {operationStatus:'COMPLETED',oracleOutcome:'FAIL',attempt:calls};}});
  assert.equal(calls,2);
  assert.equal(result.status,'REPRODUCIBLE');
  assert.equal(result.oracleOutcome,'FAIL');
  assert.equal(result.requiredMatches,2);
  assert.equal(result.attempts.length,2);
  assert.equal(result.stable,true);
  assert.equal(result.override,false);
});

test('reproducibility gate blocks an unstable baseline instead of guessing',async()=>{
  const outcomes=['FAIL','PASS'];
  const result=await runReproducibilityGate({run:async()=>({operationStatus:'COMPLETED',oracleOutcome:outcomes.shift()})});
  assert.equal(result.status,'UNSTABLE');
  assert.equal(result.oracleOutcome,'UNRESOLVED');
  assert.equal(result.stable,false);
  assert.equal(result.blocked,true);
  assert.equal(result.override,false);
});

test('unstable-baseline override is explicit in returned evidence',async()=>{
  const outcomes=['FAIL','PASS'];
  const result=await runReproducibilityGate({allowUnstable:true,run:async()=>({operationStatus:'COMPLETED',oracleOutcome:outcomes.shift()})});
  assert.equal(result.status,'UNSTABLE_OVERRIDE');
  assert.equal(result.stable,false);
  assert.equal(result.blocked,false);
  assert.equal(result.override,true);
  assert.equal(result.oracleOutcome,'UNRESOLVED');
});

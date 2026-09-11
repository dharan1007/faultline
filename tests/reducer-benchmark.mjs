import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {semanticUnits,ddminReduce,removeUnits} from '../src/reducer-engine.js';

const noise=Array.from({length:96},(_,index)=>`const irrelevant_${index}=${index};`).join('\n');
const source=`${noise}\nthrow new Error('LOCKED_FAILURE');\n`;
const units=semanticUnits('js',source);
assert.ok(units.length>=90,`expected a substantial semantic frontier, got ${units.length}`);

const started=performance.now();
const reduced=await ddminReduce(units,async kept=>kept.some(unit=>unit.text.includes('LOCKED_FAILURE'))?'FAIL':'PASS',{maxTrials:100});
const elapsedMs=performance.now()-started;
const kept=new Set(reduced.items.map(unit=>unit.id));
const removed=units.filter(unit=>!kept.has(unit.id));
const reducedSource=removeUnits(source,removed);
const originalBytes=Buffer.byteLength(source);
const reducedBytes=Buffer.byteLength(reducedSource);
const ratio=reducedBytes/originalBytes;

assert.match(reducedSource,/LOCKED_FAILURE/,'reduction must preserve the locked failure');
assert.ok(!/irrelevant_0\s*=/.test(reducedSource),'reduction should remove irrelevant source');
assert.ok(reduced.items.length<=2,`expected near-minimal semantic frontier, kept ${reduced.items.length}`);
assert.ok(ratio<0.2,`expected >80% byte reduction, ratio=${ratio}`);
assert.ok(reduced.trialCount<=100,`trial budget exceeded: ${reduced.trialCount}`);
assert.ok(elapsedMs<5000,`deterministic reducer benchmark exceeded 5s: ${elapsedMs.toFixed(1)}ms`);

const metrics={
  benchmark:'faultline-js-locked-failure-v1',
  originalBytes,
  reducedBytes,
  reductionPercent:Number(((1-ratio)*100).toFixed(2)),
  originalUnits:units.length,
  reducedUnits:reduced.items.length,
  trialCount:reduced.trialCount,
  wallClockMs:Number(elapsedMs.toFixed(2)),
  preservationStatus:'FAIL'
};
console.log(JSON.stringify(metrics));

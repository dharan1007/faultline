import assert from 'node:assert/strict';
import { validateCaptureAction, CAPTURE_LIMITS } from '../src/capture-contract.js';
import { readFile } from 'node:fs/promises';

for (const action of [
  {kind:'focus',selector:'#name'},
  {kind:'blur',selector:'#name'},
  {kind:'select_option',selector:'#country',value:'IN'},
  {kind:'pointer_move',selector:'#target',x:12,y:24},
  {kind:'key_press',selector:'#name',key:'Enter'},
  {kind:'scroll',selector:'#panel',x:0,y:120}
]) assert.equal(validateCaptureAction(action),action);

assert.throws(()=>validateCaptureAction({kind:'pointer_move',x:Number.NaN,y:2}),/UNSUPPORTED_CAPTURE_ACTION/);
assert.throws(()=>validateCaptureAction({kind:'key_press',key:'bad\nkey'}),/UNSUPPORTED_CAPTURE_ACTION/);
assert.throws(()=>validateCaptureAction({kind:'scroll'}),/UNSUPPORTED_CAPTURE_ACTION/);
assert.throws(()=>validateCaptureAction({kind:'select_option',selector:'#country',value:3}),/UNSUPPORTED_CAPTURE_ACTION/);
assert.throws(()=>validateCaptureAction({kind:'focus',selector:''}),/UNSUPPORTED_CAPTURE_ACTION/);

const maxSequence={kind:'sequence',steps:Array.from({length:CAPTURE_LIMITS.sequenceSteps},()=>({kind:'click',selector:'#x'}))};
assert.equal(validateCaptureAction(maxSequence),maxSequence);
assert.throws(()=>validateCaptureAction({kind:'sequence',steps:[...maxSequence.steps,{kind:'click',selector:'#x'}]}),/UNSUPPORTED_CAPTURE_ACTION/);
assert.throws(()=>validateCaptureAction({kind:'sequence',steps:[{kind:'wait',durationMs:CAPTURE_LIMITS.totalWaitMs},{kind:'wait',durationMs:1}]}),/UNSUPPORTED_CAPTURE_ACTION/);

const runtime=await readFile(new URL('../src/runtime.js',import.meta.url),'utf8');
for(const marker of ["action?.kind==='focus'","action?.kind==='blur'","action?.kind==='select_option'","ACTION_OPTION_NOT_FOUND"]){
  assert.match(runtime,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
}
console.log('extended deterministic action contract present');

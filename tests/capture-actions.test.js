import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCaptureAction, CAPTURE_LIMITS } from '../src/capture-contract.js';

const ok = action => assert.equal(validateCaptureAction(action), action);
const bad = action => assert.throws(() => validateCaptureAction(action), /UNSUPPORTED_CAPTURE_ACTION/);

test('accepts deterministic organisation-grade interaction primitives', () => {
  ok({kind:'click',selector:'#save'});
  ok({kind:'hover',selector:'#tip'});
  ok({kind:'pointer_move',selector:'#canvas',x:4,y:8});
  ok({kind:'pointer_move',x:40,y:80});
  ok({kind:'key_press',selector:'#search',key:'Enter'});
  ok({kind:'key_press',key:'Escape'});
  ok({kind:'focus',selector:'#email'});
  ok({kind:'blur',selector:'#email'});
  ok({kind:'scroll',selector:'#panel',y:400});
  ok({kind:'scroll',x:0,y:900});
  ok({kind:'select_option',selector:'#country',value:'IN'});
});

test('rejects ambiguous, unbounded and malformed interactions', () => {
  bad({kind:'pointer_move'});
  bad({kind:'pointer_move',x:Number.POSITIVE_INFINITY,y:0});
  bad({kind:'key_press',key:''});
  bad({kind:'key_press',key:'A'.repeat(65)});
  bad({kind:'scroll'});
  bad({kind:'hover',selector:''});
  bad({kind:'select_option',selector:'#country'});
  bad({kind:'click',selector:'#x',value:'unexpected'});
});

test('bounds sequences and aggregate explicit waiting', () => {
  ok({kind:'sequence',steps:[
    {kind:'focus',selector:'#q'},
    {kind:'key_press',key:'A'},
    {kind:'wait',durationMs:100},
    {kind:'blur',selector:'#q'}
  ]});
  bad({kind:'sequence',steps:Array.from({length:CAPTURE_LIMITS.sequenceSteps+1},()=>({kind:'click',selector:'#x'}))});
  bad({kind:'sequence',steps:[{kind:'wait',durationMs:CAPTURE_LIMITS.totalWaitMs},{kind:'wait',durationMs:1}]});
});
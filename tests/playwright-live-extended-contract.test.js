import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLiveRecipe, executeLiveAction, evaluateLiveOracle } from '../integrations/playwright-live/index.js';

function pageWith(target){return{locator(){return{first(){return target}}},evaluate:async()=>null,on(){},off(){},waitForTimeout:async()=>{},keyboard:{press:async()=>{}},mouse:{move:async()=>{}},context(){return{browser(){return null}}},url(){return'http://127.0.0.1/'}}}

test('runtime-bound recipe accepts explicit left/right/middle click buttons only',()=>{
  assert.equal(validateLiveRecipe([{kind:'click',selector:'#button',button:'right'}])[0].button,'right');
  assert.equal(validateLiveRecipe([{kind:'sequence',steps:[{kind:'click',selector:'#button',button:'middle'},{kind:'wait',durationMs:1}]}])[0].steps[0].button,'middle');
  assert.throws(()=>validateLiveRecipe([{kind:'click',selector:'#button',button:'magic'}]),/FAULTLINE_LIVE_INVALID_ACTION/);
});

test('runtime-bound right click reaches Playwright as a real secondary-button click',async()=>{
  let options=null;const target={async click(value){options=value}};
  await executeLiveAction(pageWith(target),{kind:'click',selector:'#button',button:'right'},{timeoutMs:3210});
  assert.deepEqual(options,{timeout:3210,button:'right'});
});

test('runtime-bound oracle can fingerprint focus state without converting it to a DOM snapshot',async()=>{
  const target={async count(){return 1},async evaluate(fn){assert.match(String(fn),/activeElement/);return true}};
  const result=await evaluateLiveOracle(pageWith(target),{kind:'dom_focused',selector:'#field',equals:true});
  assert.equal(result.status,'FAIL');
  assert.equal(result.evidence.actual,true);
  assert.equal(result.evidence.expected,true);
});

test('runtime-bound oracle can fingerprint rendered text content',async()=>{
  const target={async count(){return 1},async evaluate(fn){assert.match(String(fn),/textContent/);return'Count: 2'}};
  const result=await evaluateLiveOracle(pageWith(target),{kind:'text_content',selector:'#count',equals:'Count: 2'});
  assert.equal(result.status,'FAIL');
  assert.equal(result.evidence.actual,'Count: 2');
  assert.equal(result.evidence.expected,'Count: 2');
});

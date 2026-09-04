import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilityId, verifyCapability } from '../server/capability.js';
import { ok, fail, readJson, publicError } from '../server/http.js';

test('capability ids are deterministic sha256 identifiers and verify bearer possession', () => {
  const token='flk_test_capability_0123456789abcdefghijklmnopqrstuvwxyz';
  const id=capabilityId(token);
  assert.match(id,/^[a-f0-9]{64}$/);
  assert.equal(id,capabilityId(token));
  assert.equal(verifyCapability(new Headers({authorization:`Bearer ${token}`}),id),true);
  assert.throws(()=>verifyCapability(new Headers({authorization:'Bearer wrong'}),id),/UNAUTHORIZED_CAPABILITY/);
  assert.throws(()=>verifyCapability(new Headers(),id),/UNAUTHORIZED_CAPABILITY/);
});

test('API envelopes always expose request id and structured result', () => {
  assert.deepEqual(ok({status:'healthy'},'req_1'),{ok:true,requestId:'req_1',data:{status:'healthy'},error:null});
  assert.deepEqual(fail('BUILD_FAILED','Build failed',{retryable:false,details:{exitCode:1}},'req_2'),{
    ok:false,requestId:'req_2',data:null,error:{code:'BUILD_FAILED',message:'Build failed',retryable:false,details:{exitCode:1}}
  });
});

test('readJson enforces bounded request bodies and valid JSON', async () => {
  const value=await readJson(new Request('https://faultline.test/api',{method:'POST',headers:{'content-type':'application/json'},body:'{"a":1}'}),{maxBytes:64});
  assert.deepEqual(value,{a:1});
  await assert.rejects(()=>readJson(new Request('https://faultline.test/api',{method:'POST',body:'123456789'}),{maxBytes:4}),/REQUEST_TOO_LARGE/);
  await assert.rejects(()=>readJson(new Request('https://faultline.test/api',{method:'POST',body:'not-json'}),{maxBytes:64}),/INVALID_JSON/);
});

test('publicError never leaks stack traces or secret-shaped details', () => {
  const error=new Error('clone failed');
  error.stack='SECRET_STACK_LINE';
  error.details={authorization:'Bearer abc',stderr:'safe summary'};
  const result=publicError(error,'SOURCE_ACCESS_FAILED');
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes('SECRET_STACK_LINE'),false);
  assert.equal(serialized.includes('Bearer abc'),false);
  assert.equal(result.code,'SOURCE_ACCESS_FAILED');
});

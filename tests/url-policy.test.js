import test from 'node:test';
import assert from 'node:assert/strict';

import {validateCaptureTarget} from '../apps/coordinator/url-policy.mjs';
import {redactHeaders,redactText,redactUrl} from '../apps/coordinator/redaction.mjs';
import {assertCaptureLimit,mergeCaptureLimits} from '../apps/coordinator/limits.mjs';

const answer=(...addresses)=>addresses.map(address=>({address,family:address.includes(':')?6:4}));
const stableResolver=addresses=>async()=>answer(...addresses);
const sequenceResolver=sequence=>{let index=0;return async()=>answer(...sequence[Math.min(index++,sequence.length-1)]);};

async function rejectionCode(url,resolver=stableResolver(['93.184.216.34'])){
  try{await validateCaptureTarget(url,resolver);return null;}catch(error){return error?.code||error?.message;}
}

test('validateCaptureTarget normalizes a stable public HTTP(S) target',async()=>{
  const result=await validateCaptureTarget('HTTPS://Example.COM:443/runtime?view=health',stableResolver(['93.184.216.34']));
  assert.equal(result.url,'https://example.com/runtime?view=health');
  assert.equal(result.origin,'https://example.com');
  assert.equal(result.hostname,'example.com');
  assert.deepEqual(result.addresses,['93.184.216.34']);
  assert.match(result.resolutionFingerprint,/^[a-f0-9]{64}$/);
});

test('validateCaptureTarget blocks non-web schemes and credential-bearing URLs',async()=>{
  for(const url of ['file:///etc/passwd','data:text/html,hello','javascript:alert(1)','ftp://example.com/file']){
    assert.equal(await rejectionCode(url),'CAPTURE_SCHEME_BLOCKED',url);
  }
  assert.equal(await rejectionCode('https://user:pass@example.com/'),'CAPTURE_URL_CREDENTIALS_BLOCKED');
});

test('validateCaptureTarget blocks localhost, metadata names, and direct private/reserved IP literals',async()=>{
  for(const url of [
    'http://localhost/','http://localhost.localdomain/','http://metadata.google.internal/','http://instance-data.ec2.internal/',
    'http://127.0.0.1/','http://0.0.0.0/','http://10.2.3.4/','http://100.64.0.1/','http://169.254.169.254/',
    'http://172.16.10.2/','http://192.168.4.8/','http://192.0.2.1/','http://198.18.0.1/','http://198.51.100.5/',
    'http://203.0.113.8/','http://224.0.0.1/','http://240.0.0.1/','http://[::1]/','http://[fc00::1]/',
    'http://[fe80::1]/','http://[ff02::1]/','http://[2001:db8::1]/','http://[::ffff:127.0.0.1]/'
  ]){
    const code=await rejectionCode(url);
    assert.ok(['CAPTURE_HOST_BLOCKED','PRIVATE_ADDRESS_BLOCKED'].includes(code),`${url} -> ${code}`);
  }
});

test('validateCaptureTarget rejects DNS answers that resolve to non-public space',async()=>{
  assert.equal(await rejectionCode('https://service.example/',stableResolver(['10.0.0.8'])),'PRIVATE_ADDRESS_BLOCKED');
  assert.equal(await rejectionCode('https://service.example/',stableResolver(['93.184.216.34','127.0.0.1'])),'PRIVATE_ADDRESS_BLOCKED');
});

test('validateCaptureTarget detects a public-to-private DNS rebinding sequence',async()=>{
  const resolver=sequenceResolver([['93.184.216.34'],['127.0.0.1']]);
  assert.equal(await rejectionCode('https://rebind.example/',resolver),'DNS_REBINDING_BLOCKED');
});

test('redaction removes authorization, cookie, API-key, URL-secret, and obvious secret-text values',()=>{
  const headers=redactHeaders({Authorization:'Bearer top-secret',Cookie:'session=abc','Set-Cookie':'sid=xyz','X-API-Key':'key-123','X-Trace':'trace-ok'});
  assert.equal(headers.authorization,'[REDACTED]');
  assert.equal(headers.cookie,'[REDACTED]');
  assert.equal(headers['set-cookie'],'[REDACTED]');
  assert.equal(headers['x-api-key'],'[REDACTED]');
  assert.equal(headers['x-trace'],'trace-ok');
  const url=redactUrl('https://example.com/run?view=full&token=route-secret&api_key=another-secret#access_token=fragment-secret');
  assert.match(url,/view=full/);
  assert.ok(!url.includes('route-secret'));
  assert.ok(!url.includes('another-secret'));
  assert.ok(!url.includes('fragment-secret'));
  assert.equal(redactText('password=hunter2 authorization: Bearer hidden'),'password=[REDACTED] authorization=[REDACTED]');
});

test('capture limits are bounded and fail explicitly instead of truncating silently',()=>{
  const limits=mergeCaptureLimits({maxEvents:25,maxDurationMs:2000});
  assert.equal(limits.maxEvents,25);
  assert.equal(limits.maxDurationMs,2000);
  assert.throws(()=>assertCaptureLimit('events',26,25),error=>error?.code==='CAPTURE_LIMIT_REACHED'&&error?.limit==='events');
  assert.throws(()=>mergeCaptureLimits({maxEvents:999999}),error=>error?.code==='CAPTURE_LIMIT_CONFIGURATION_INVALID');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHealth, handleProjectInspect, handleFailureEvaluate } from '../server/api-handlers.js';

async function json(response){return await response.json();}

test('health handler returns a structured production capability envelope', async()=>{
  const response=await handleHealth(new Request('https://faultline.test/api/v1/health'));
  assert.equal(response.status,200);
  const body=await json(response);
  assert.equal(body.ok,true);
  assert.equal(body.data.status,'healthy');
  assert.equal(body.data.apiVersion,'v1');
  assert.equal(body.data.remoteExecution,'gated');
  assert.match(body.requestId,/^req_/);
});

test('project inspection deterministically detects a modern Next.js repository manifest', async()=>{
  const response=await handleProjectInspect(new Request('https://faultline.test/api/v1/projects/inspect',{method:'POST',headers:{'content-type':'application/json','origin':'https://faultline-webmcp.vercel.app'},body:JSON.stringify({packageJson:{dependencies:{next:'16.0.0',react:'19.0.0'},scripts:{dev:'next dev',build:'next build'}},files:['package.json','package-lock.json','next.config.mjs']})}));
  assert.equal(response.status,200);
  const body=await json(response);
  assert.equal(body.ok,true);
  assert.equal(body.data.framework,'next');
  assert.equal(body.data.packageManager,'npm');
  assert.equal(body.data.compatibility,'ready');
  assert.deepEqual(body.data.commands.start,['npm','run','dev','--','--hostname','0.0.0.0']);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://faultline-webmcp.vercel.app');
});

test('project inspection rejects unsupported methods and oversized/malformed payloads explicitly', async()=>{
  const get=await handleProjectInspect(new Request('https://faultline.test/api/v1/projects/inspect'));
  assert.equal(get.status,405);
  assert.equal((await json(get)).error.code,'METHOD_NOT_ALLOWED');
  const malformed=await handleProjectInspect(new Request('https://faultline.test/api/v1/projects/inspect',{method:'POST',body:'not-json'}));
  assert.equal(malformed.status,400);
  assert.equal((await json(malformed)).error.code,'INVALID_JSON');
});

test('failure evaluation compares normalized observations without executing user code', async()=>{
  const response=await handleFailureEvaluate(new Request('https://faultline.test/api/v1/failures/evaluate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oracle:{kind:'dom_property',equals:true},observation:{actual:true}})}));
  assert.equal(response.status,200);
  const body=await json(response);
  assert.equal(body.data.status,'FAIL');
  assert.equal(body.data.executed,false);
});

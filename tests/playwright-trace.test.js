import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  startFaultlineTrace,
  verifyTraceEvidence,
  attachTraceEvidence,
  PLAYWRIGHT_TRACE_EVIDENCE_SCHEMA
} from '../integrations/playwright-trace/index.js';

test('trace wrapper binds official Playwright trace artifact to cryptographic evidence',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-trace-'));
  const path=join(dir,'trace.zip');
  const calls=[];
  const context={tracing:{
    async start(options){calls.push(['start',options]);},
    async stop(options){calls.push(['stop',options]);await writeFile(options.path,Buffer.from('playwright-trace-fixture'));}
  }};
  try{
    const session=await startFaultlineTrace({context,path,title:'checkout failure'});
    const evidence=await session.stop({
      sourceRepository:'https://github.com/example/app',
      sourceCommit:'a'.repeat(40),
      testTitle:'checkout keeps spinner',
      testFile:'tests/checkout.spec.ts'
    });
    assert.equal(evidence.schema,PLAYWRIGHT_TRACE_EVIDENCE_SCHEMA);
    assert.match(evidence.sha256,/^[0-9a-f]{64}$/);
    assert.ok(evidence.bytes>0);
    assert.deepEqual(calls.map(call=>call[0]),['start','stop']);
    assert.equal((await verifyTraceEvidence(evidence)).ok,true);

    const attached=attachTraceEvidence({schema:'faultline.example.v1'},evidence);
    assert.equal(attached.traceEvidence.sha256,evidence.sha256);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('trace evidence detects artifact mutation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-trace-mutation-'));
  const path=join(dir,'trace.zip');
  const context={tracing:{
    async start(){},
    async stop({path}){await writeFile(path,Buffer.from('original'));}
  }};
  try{
    const session=await startFaultlineTrace({context,path});
    const evidence=await session.stop();
    await writeFile(path,Buffer.from('modified'));
    assert.equal((await verifyTraceEvidence(evidence)).ok,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});

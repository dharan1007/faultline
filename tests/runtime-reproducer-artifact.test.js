import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerprint } from '../src/causal-fingerprint.js';
import { createRuntimeReproducerArtifact, RUNTIME_REPRO_SCHEMA } from '../src/runtime-reproducer-artifact.js';

const fp=buildFingerprint({oracle:{kind:'dom_exists',selector:'#broken',expected:true}});
const base={
  sourceRepository:'https://github.com/acme/web',
  sourceCommit:'1234567890abcdef1234567890abcdef12345678',
  applicationUrl:'https://example.test/account?token=secret#private',
  browser:'chromium',browserVersion:'140',playwrightVersion:'1.63.0',resetId:'fixture:account-42',
  originalRecipe:[{kind:'click',selector:'#noise'},{kind:'click',selector:'#trigger'}],
  reducedRecipe:[{kind:'click',selector:'#trigger'}],
  oracle:{kind:'dom_exists',selector:'#broken',equals:true},
  baselineFingerprint:fp,finalFingerprint:fp,trialCount:5,browserRuns:13,wallTimeMs:80,reduction:0.5,
  externalDependencies:['https://cdn.example.test/app.js?sig=secret']
};

test('marks runtime repros non-portable and strips URL credentials/query material',()=>{
  const artifact=createRuntimeReproducerArtifact(base);
  assert.equal(artifact.schema,RUNTIME_REPRO_SCHEMA);
  assert.equal(artifact.portable,false);
  assert.equal(artifact.applicationUrl,'https://example.test/account');
  assert.equal(artifact.externalDependencies[0],'https://cdn.example.test/app.js');
  assert.equal(artifact.source.sourceCommit,base.sourceCommit);
  assert.equal(artifact.metrics.browserRuns,13);
  assert.equal(artifact.evidence.confidentiality.requiresSecretArtifactHandling,false);
});

test('binds optional modern-app replay evidence and surfaces confidentiality risk',()=>{
  const environmentState={
    schema:'faultline.playwright-environment.v1',
    cookies:[{name:'sid',value:'secret',redacted:false}],
    localStorage:[{key:'token',value:'secret',redacted:false}],
    sessionStorage:[]
  };
  const networkFixtures=[{
    schema:'faultline.network-fixture.v1',
    id:'n1',
    requestBody:{captured:false},
    response:{body:{captured:true,encoding:'base64',data:'e30=',bytes:2,sha256:'x'}}
  }];
  const trace={schema:'faultline.playwright-trace-evidence.v1',sha256:'a'.repeat(64),bytes:100,path:'/tmp/trace.zip'};
  const sourceMaps=[{
    schema:'faultline.source-map-evidence.v1',
    generated:{sha256:'b'.repeat(64),bytes:10,path:'/tmp/app.js'},
    map:{sha256:'c'.repeat(64),bytes:10,path:'/tmp/app.js.map'}
  }];
  const artifact=createRuntimeReproducerArtifact({...base,environmentState,networkFixtures,trace,sourceMaps});
  assert.equal(artifact.evidence.environmentState.schema,'faultline.playwright-environment.v1');
  assert.equal(artifact.evidence.networkFixtures.length,1);
  assert.equal(artifact.evidence.trace.sha256,trace.sha256);
  assert.equal(artifact.evidence.sourceMaps.length,1);
  assert.equal(artifact.evidence.confidentiality.containsReplayableCookieValues,true);
  assert.equal(artifact.evidence.confidentiality.containsReplayableStorageValues,true);
  assert.equal(artifact.evidence.confidentiality.containsCapturedNetworkBodies,true);
  assert.equal(artifact.evidence.confidentiality.requiresSecretArtifactHandling,true);
});

test('rejects placeholder or missing immutable commit when repository provenance is claimed',()=>{
  assert.throws(()=>createRuntimeReproducerArtifact({...base,sourceCommit:'0'.repeat(40)}),/INVALID_SOURCE_COMMIT/);
  assert.throws(()=>createRuntimeReproducerArtifact({...base,sourceCommit:null}),/SOURCE_COMMIT_REQUIRED/);
});

test('rejects metric claims inconsistent with the actual reduction',()=>{
  assert.throws(()=>createRuntimeReproducerArtifact({...base,reduction:0.9}),/REDUCTION_MISMATCH/);
});

test('rejects malformed attached evidence rather than accepting unverifiable context',()=>{
  assert.throws(()=>createRuntimeReproducerArtifact({...base,environmentState:{schema:'wrong'}}),/INVALID_ENVIRONMENT_STATE/);
  assert.throws(()=>createRuntimeReproducerArtifact({...base,networkFixtures:[{schema:'wrong'}]}),/INVALID_NETWORK_FIXTURE/);
  assert.throws(()=>createRuntimeReproducerArtifact({...base,trace:{schema:'wrong'}}),/INVALID_TRACE_EVIDENCE/);
  assert.throws(()=>createRuntimeReproducerArtifact({...base,sourceMaps:[{schema:'wrong'}]}),/INVALID_SOURCE_MAP_EVIDENCE/);
});

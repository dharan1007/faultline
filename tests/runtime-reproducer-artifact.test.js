import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerprint } from '../src/causal-fingerprint.js';
import { createRuntimeReproducerArtifact } from '../src/runtime-reproducer-artifact.js';

const fp=buildFingerprint({oracle:{kind:'dom_exists',selector:'#broken',expected:true}});
const base={
  sourceRepository:'https://github.com/acme/web',
  sourceCommit:'1234567890abcdef1234567890abcdef12345678',
  applicationUrl:'https://example.test/account?token=secret#private',
  browser:'chromium',browserVersion:'140',playwrightVersion:'1.63.0',resetId:'fixture:account-42',
  originalRecipe:[{kind:'click',selector:'#noise'},{kind:'click',selector:'#trigger'}],
  reducedRecipe:[{kind:'click',selector:'#trigger'}],
  oracle:{kind:'dom_exists',selector:'#broken',equals:true},
  baselineFingerprint:fp,finalFingerprint:fp,trialCount:5,wallTimeMs:80,reduction:0.5,
  externalDependencies:['https://cdn.example.test/app.js?sig=secret']
};

test('marks runtime repros non-portable and strips URL credentials/query material',()=>{
  const artifact=createRuntimeReproducerArtifact(base);
  assert.equal(artifact.portable,false);
  assert.equal(artifact.applicationUrl,'https://example.test/account');
  assert.equal(artifact.externalDependencies[0],'https://cdn.example.test/app.js');
  assert.equal(artifact.source.sourceCommit,base.sourceCommit);
});

test('rejects placeholder or missing immutable commit when repository provenance is claimed',()=>{
  assert.throws(()=>createRuntimeReproducerArtifact({...base,sourceCommit:'0'.repeat(40)}),/INVALID_SOURCE_COMMIT/);
  assert.throws(()=>createRuntimeReproducerArtifact({...base,sourceCommit:null}),/SOURCE_COMMIT_REQUIRED/);
});

test('rejects metric claims inconsistent with the actual reduction',()=>{
  assert.throws(()=>createRuntimeReproducerArtifact({...base,reduction:0.9}),/REDUCTION_MISMATCH/);
});

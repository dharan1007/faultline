import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureArtifact, validateCaptureArtifact } from '../src/capture-contract.js';

const caseValue={html:'<main id="bug">Broken</main>',css:'#bug{color:red}',js:'',oracle:{kind:'dom_exists',selector:'#bug',equals:true,action:{kind:'none'},delayMs:0}};
const provenance={adapter:'faultline-playwright',adapterVersion:1,url:'http://127.0.0.1:3000/repro',title:'Repro',userAgent:'Playwright Chromium',viewport:{width:1280,height:720},browser:'chromium'};
const baseline={status:'FAIL',evidence:{actual:true,expected:true,kind:'dom_exists',selector:'#bug'}};

function capture(){return createCaptureArtifact({caseValue,provenance,baseline,capturedAt:'2026-09-09T00:00:00.000Z'});}

test('creates and validates a measured versioned capture without mutating inputs',()=>{
  const originalCase=structuredClone(caseValue),originalProvenance=structuredClone(provenance);
  const artifact=capture();
  assert.equal(artifact.format,'faultline.capture');
  assert.equal(artifact.version,1);
  assert.equal(artifact.baseline.captured,true);
  assert.equal(artifact.baseline.status,'FAIL');
  assert.deepEqual(artifact.baseline.evidence,baseline.evidence);
  assert.match(artifact.baseline.note,/independently re-verifies FAIL/);
  assert.deepEqual(validateCaptureArtifact(artifact),artifact);
  assert.deepEqual(caseValue,originalCase);
  assert.deepEqual(provenance,originalProvenance);
  assert.notEqual(artifact.case,caseValue);
});

test('strictly rejects unsupported or ambiguous capture envelopes',()=>{
  const valid=capture();
  const invalid=[
    {...valid,format:'faultline.capture.v2'},
    {...valid,version:2},
    {...valid,extra:true},
    {...valid,capturedAt:'not-a-date'},
    {...valid,provenance:{...provenance,viewport:{width:0,height:720}}},
    {...valid,provenance:{...provenance,adapterVersion:0}},
    {...valid,provenance:{...provenance,browser:''}},
    {...valid,case:{...caseValue,html:42}},
    {...valid,case:{...caseValue,extra:true}},
    {...valid,baseline:{...valid.baseline,status:'PASS'}},
    {...valid,baseline:{captured:true,status:'FAIL',note:valid.baseline.note}}
  ];
  for(const candidate of invalid)assert.throws(()=>validateCaptureArtifact(candidate),/FAULTLINE_CAPTURE_INVALID/);
});

test('requires bounded provenance text and exact measured-baseline semantics',()=>{
  const valid=capture();
  assert.throws(()=>validateCaptureArtifact({...valid,provenance:{...provenance,title:'x'.repeat(2049)}}),/FAULTLINE_CAPTURE_INVALID/);
  assert.throws(()=>validateCaptureArtifact({...valid,baseline:{...valid.baseline,captured:false}}),/FAULTLINE_CAPTURE_INVALID/);
  assert.throws(()=>validateCaptureArtifact({...valid,baseline:{...valid.baseline,note:'different'}}),/FAULTLINE_CAPTURE_INVALID/);
});

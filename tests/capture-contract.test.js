import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const contractPath=new URL('../src/capture-contract.js',import.meta.url);
const validOracle={kind:'dom_attribute',selector:'#save',property:'aria-disabled',equals:'false',action:{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'click',selector:'#save'}]},delayMs:0};
const validCapture={schema:'faultline.capture.v1',capturedAt:'2026-09-09T00:00:00.000Z',source:{url:'http://127.0.0.1:4173/profile',title:'Profile',html:'<main><input id="name"><button id="save" aria-disabled="true">Save</button></main>',css:'button{display:block}',js:"document.querySelector('#save').addEventListener('click',()=>document.querySelector('#save').setAttribute('aria-disabled','true'))"},oracle:validOracle,environment:{browser:'chromium',playwrightVersion:'1.55.0',viewport:{width:1280,height:720}},provenance:{adapter:'@faultline/playwright-capture',testTitle:'profile enables save after name entry',testFile:'tests/profile.spec.mjs'},diagnostics:{externalDependencies:[],consoleErrors:['pre-capture console failure'],pageErrors:['Error: pre-capture page boom']}};

async function contract(){ return import(contractPath.href); }

function errorCode(fn,code){assert.throws(fn,error=>error?.message===code,`expected ${code}`);}

test('Playwright capture contract exists as a dedicated production module',()=>{
  assert.equal(existsSync(contractPath),true,'src/capture-contract.js must exist before FAULTLINE can validate portable browser captures');
});

test('capture contract exports versioned bounds and pure validator/normalizer APIs',async()=>{
  const mod=await contract();
  assert.equal(mod.CAPTURE_SCHEMA,'faultline.capture.v1');
  assert.equal(mod.CAPTURE_LIMITS?.sourceBytes,1024*1024);
  assert.equal(typeof mod.validateCaptureArtifact,'function');
  assert.equal(typeof mod.normalizeCaptureArtifact,'function');
  assert.equal(typeof mod.summarizeCaptureProvenance,'function');
});

test('valid capture normalizes exactly to canonical case plus bounded provenance',async()=>{
  const {validateCaptureArtifact,normalizeCaptureArtifact}=await contract();
  assert.equal(validateCaptureArtifact(validCapture),validCapture);
  const normalized=normalizeCaptureArtifact(validCapture);
  assert.deepEqual(normalized.case,{html:validCapture.source.html,css:validCapture.source.css,js:validCapture.source.js,oracle:validOracle});
  assert.equal(normalized.provenance.schema,'faultline.capture.v1');
  assert.equal(normalized.provenance.sourceUrl,validCapture.source.url);
  assert.equal(normalized.provenance.provenance.testTitle,validCapture.provenance.testTitle);
  assert.equal(normalized.provenance.diagnosticsSummary.externalDependencies,0);
  assert.deepEqual(normalized.provenance.diagnostics.consoleErrors,validCapture.diagnostics.consoleErrors,'bounded console evidence must survive normalization into canonical provenance');
  assert.deepEqual(normalized.provenance.diagnostics.pageErrors,validCapture.diagnostics.pageErrors,'bounded page-error evidence must survive normalization into canonical provenance');
  validCapture.diagnostics.consoleErrors[0]='mutated after normalize';
  assert.equal(normalized.provenance.diagnostics.consoleErrors[0],'pre-capture console failure','normalized provenance must own an immutable clone of captured diagnostics');
  validCapture.diagnostics.consoleErrors[0]='pre-capture console failure';
});

test('capture validation rejects schema, size, dependency and unsupported-action violations deterministically',async()=>{
  const {validateCaptureArtifact}=await contract();
  errorCode(()=>validateCaptureArtifact(null),'INVALID_CAPTURE');
  errorCode(()=>validateCaptureArtifact({...validCapture,schema:'faultline.capture.v2'}),'UNSUPPORTED_CAPTURE_SCHEMA');
  errorCode(()=>validateCaptureArtifact({...validCapture,source:{...validCapture.source,html:'x'.repeat(1024*1024+1)}}),'CAPTURE_TOO_LARGE');
  errorCode(()=>validateCaptureArtifact({...validCapture,diagnostics:{...validCapture.diagnostics,externalDependencies:['https://example.com/app.css']}}),'UNSUPPORTED_CAPTURE_DEPENDENCY');
  errorCode(()=>validateCaptureArtifact({...validCapture,oracle:{...validOracle,action:{kind:'drag',selector:'#save'}}}),'UNSUPPORTED_CAPTURE_ACTION');
});

test('capture validation preserves exact source text and enforces existing wait/action/oracle limits',async()=>{
  const {normalizeCaptureArtifact,validateCaptureArtifact}=await contract();
  const exact={...validCapture,source:{...validCapture.source,html:' <main>\n  exact text\n</main> ',css:'\n.x { color: red }\n',js:'// exact\n'}};
  assert.deepEqual(normalizeCaptureArtifact(exact).case,{html:exact.source.html,css:exact.source.css,js:exact.source.js,oracle:exact.oracle});
  errorCode(()=>validateCaptureArtifact({...validCapture,oracle:{...validOracle,action:{kind:'sequence',steps:Array.from({length:9},()=>({kind:'click',selector:'#save'}))}}}),'UNSUPPORTED_CAPTURE_ACTION');
  errorCode(()=>validateCaptureArtifact({...validCapture,oracle:{...validOracle,action:{kind:'sequence',steps:[{kind:'wait',durationMs:2001}]}}}),'UNSUPPORTED_CAPTURE_ACTION');
  errorCode(()=>validateCaptureArtifact({...validCapture,oracle:{...validOracle,delayMs:2001}}),'INVALID_ORACLE');
});

test('capture validation rejects shapes that canonical oracle validation cannot persist or recover',async()=>{
  const {validateCaptureArtifact}=await contract();
  errorCode(()=>validateCaptureArtifact({...validCapture,unexpected:true}),'INVALID_CAPTURE');
  errorCode(()=>validateCaptureArtifact({...validCapture,source:{...validCapture.source,unexpected:true}}),'INVALID_CAPTURE');
  errorCode(()=>validateCaptureArtifact({...validCapture,oracle:{...validOracle,unexpected:true}}),'INVALID_ORACLE');
  errorCode(()=>validateCaptureArtifact({...validCapture,oracle:{...validOracle,action:{kind:'sequence',selector:'#save',steps:[{kind:'click',selector:'#save'}]}}}),'UNSUPPORTED_CAPTURE_ACTION');
  errorCode(()=>validateCaptureArtifact({...validCapture,oracle:{...validOracle,action:{kind:'sequence',steps:[{kind:'wait',durationMs:0,selector:'#save'}]}}}),'UNSUPPORTED_CAPTURE_ACTION');
});

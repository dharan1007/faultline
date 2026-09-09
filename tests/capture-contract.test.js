import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPTURE_SCHEMA, normalizeCapture } from '../src/capture.js';

const validCapture=()=>({
  schema:CAPTURE_SCHEMA,
  source:{html:'<main id="x"></main>',css:'#x{display:block}',js:'document.querySelector("#x").dataset.ready="1";'},
  oracle:{kind:'dom_exists',selector:'#x',equals:true,action:{kind:'none'},delayMs:0},
  provenance:{url:'http://127.0.0.1:4173/',title:'Fixture',capturedAt:'2026-09-09T11:00:00.000Z',userAgent:'Chromium test',label:'fixture failure'},
  expectedStatus:'FAIL'
});

const expectInvalid=mutate=>{
  const capture=validCapture();
  mutate(capture);
  assert.throws(()=>normalizeCapture(capture),/INVALID_CAPTURE/);
};

test('normalizeCapture accepts and clones a strict faultline.capture.v1 envelope',()=>{
  const input=validCapture();
  const normalized=normalizeCapture(input);
  assert.deepEqual(normalized,{
    case:{html:input.source.html,css:input.source.css,js:input.source.js,oracle:input.oracle},
    provenance:input.provenance,
    expectedStatus:'FAIL'
  });
  normalized.case.html='changed';
  normalized.provenance.label='changed';
  assert.notEqual(input.source.html,'changed');
  assert.notEqual(input.provenance.label,'changed');
});

test('normalizeCapture accepts an explicit empty title from untitled pages',()=>{
  const input=validCapture();
  input.provenance.title='';
  const normalized=normalizeCapture(input);
  assert.equal(normalized.provenance.title,'');
});

test('normalizeCapture rejects version drift and unknown fields',()=>{
  expectInvalid(c=>{c.schema='faultline.capture.v2';});
  expectInvalid(c=>{c.extra=true;});
  expectInvalid(c=>{c.source.extra='x';});
  expectInvalid(c=>{c.provenance.extra='x';});
});

test('normalizeCapture rejects malformed source and provenance',()=>{
  expectInvalid(c=>{c.source.html=42;});
  expectInvalid(c=>{delete c.source.css;});
  expectInvalid(c=>{c.provenance.url='';});
  expectInvalid(c=>{c.provenance.title=42;});
  expectInvalid(c=>{c.provenance.userAgent='';});
  expectInvalid(c=>{c.provenance.capturedAt='not-a-date';});
  expectInvalid(c=>{c.provenance.label=42;});
  expectInvalid(c=>{c.expectedStatus='PASS';});
});

test('normalizeCapture rejects malformed oracle and bounded actions',()=>{
  expectInvalid(c=>{c.oracle.kind='unknown';});
  expectInvalid(c=>{c.oracle.action={kind:'sequence',steps:[]};});
  expectInvalid(c=>{c.oracle.action={kind:'sequence',steps:[{kind:'wait',durationMs:2001}]};});
  expectInvalid(c=>{c.oracle.action={kind:'set_value',selector:'#x',value:10};});
  expectInvalid(c=>{c.oracle={kind:'dom_attribute',selector:'#x',property:'aria-expanded',equals:true,action:{kind:'none'},delayMs:0};});
});

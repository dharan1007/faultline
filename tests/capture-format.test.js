import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPTURE_SCHEMA, MAX_CAPTURE_SOURCE_BYTES, normalizeCapture, captureSummary } from '../src/capture-format.js';

function fixture(){
  return {
    schema:CAPTURE_SCHEMA,
    case:{
      html:'<button id="trigger">Trigger</button><p id="status" data-broken="false">ready</p>',
      css:'#status{font-weight:700}',
      js:"document.querySelector('#trigger').onclick=()=>document.querySelector('#status').setAttribute('data-broken','true')",
      oracle:{kind:'dom_attribute',selector:'#status',property:'data-broken',equals:'true',action:{kind:'click',selector:'#trigger'},delayMs:0}
    },
    provenance:{
      url:'http://127.0.0.1:3000/repro',
      title:'Captured regression',
      capturedAt:'2026-09-09T00:00:00.000Z',
      viewport:{width:1280,height:720},
      userAgent:'test-agent',
      playwright:{projectName:'chromium',testTitle:'regression'}
    },
    diagnostics:{
      omittedResources:[{kind:'script',url:'https://cdn.example/module.js',reason:'CROSS_ORIGIN_SCRIPT'}],
      capturedScripts:[{url:'http://127.0.0.1:3000/app.js',chars:42}],
      capturedStylesheets:[{url:'http://127.0.0.1:3000/app.css',chars:24}]
    }
  };
}

test('normalizeCapture accepts faultline.capture.v1 and returns detached canonical data',()=>{
  const input=fixture();
  const normalized=normalizeCapture(input);
  assert.deepEqual(normalized,input);
  assert.notEqual(normalized,input);
  assert.notEqual(normalized.case,input.case);
  assert.notEqual(normalized.case.oracle,input.case.oracle);
  input.case.oracle.kind='runtime_error';
  input.diagnostics.omittedResources[0].reason='MUTATED';
  assert.equal(normalized.case.oracle.kind,'dom_attribute');
  assert.equal(normalized.diagnostics.omittedResources[0].reason,'CROSS_ORIGIN_SCRIPT');

  const summary=captureSummary(normalized);
  assert.equal(summary.schema,CAPTURE_SCHEMA);
  assert.equal(summary.url,normalized.provenance.url);
  assert.equal(summary.title,normalized.provenance.title);
  assert.equal(summary.testTitle,'regression');
  assert.equal(summary.omittedResources,1);
  assert.ok(summary.sourceBytes>0);
});

test('normalizeCapture rejects unknown versions and malformed top-level shapes',()=>{
  assert.throws(()=>normalizeCapture({...fixture(),schema:'faultline.capture.v2'}),/INVALID_CAPTURE_SCHEMA/);
  assert.throws(()=>normalizeCapture({...fixture(),extra:true}),/INVALID_CAPTURE/);
  const missing=fixture();delete missing.case;
  assert.throws(()=>normalizeCapture(missing),/INVALID_CAPTURE/);
});

test('normalizeCapture rejects malformed provenance and diagnostics instead of coercing them',()=>{
  const badViewport=fixture();badViewport.provenance.viewport={width:0,height:720};
  assert.throws(()=>normalizeCapture(badViewport),/INVALID_CAPTURE_PROVENANCE/);
  const badDate=fixture();badDate.provenance.capturedAt='not-a-date';
  assert.throws(()=>normalizeCapture(badDate),/INVALID_CAPTURE_PROVENANCE/);
  const badDiagnostics=fixture();badDiagnostics.diagnostics.omittedResources='not-an-array';
  assert.throws(()=>normalizeCapture(badDiagnostics),/INVALID_CAPTURE_DIAGNOSTICS/);
  const extraDiagnosticField=fixture();extraDiagnosticField.diagnostics.capturedScripts[0].body='must-not-be-accepted';
  assert.throws(()=>normalizeCapture(extraDiagnosticField),/INVALID_CAPTURE_DIAGNOSTICS/);
});

test('normalizeCapture enforces the executable source byte ceiling',()=>{
  const capture=fixture();
  capture.case.html='x'.repeat(MAX_CAPTURE_SOURCE_BYTES+1);
  capture.case.css='';capture.case.js='';
  assert.throws(()=>normalizeCapture(capture),/CAPTURE_SOURCE_TOO_LARGE/);
});
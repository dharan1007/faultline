import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureArtifact, validateCaptureArtifact } from '../src/capture-contract.js';

const caseValue = {
  html: '<main id="bug">Broken</main>',
  css: '#bug{color:red}',
  js: 'document.querySelector("#bug").dataset.ready="yes";',
  oracle: {
    kind: 'dom_exists',
    selector: '#bug',
    equals: true,
    action: { kind: 'none' },
    delayMs: 0
  }
};

const provenance = {
  adapter: 'faultline-playwright',
  adapterVersion: 1,
  url: 'http://127.0.0.1:3000/repro',
  title: 'Repro',
  userAgent: 'Playwright Chromium',
  viewport: { width: 1280, height: 720 },
  browser: 'chromium'
};

test('creates and validates a versioned capture without mutating inputs', () => {
  const originalCase = structuredClone(caseValue);
  const originalProvenance = structuredClone(provenance);
  const artifact = createCaptureArtifact({
    caseValue,
    provenance,
    capturedAt: '2026-09-09T00:00:00.000Z'
  });

  assert.deepEqual(artifact, {
    format: 'faultline.capture',
    version: 1,
    capturedAt: '2026-09-09T00:00:00.000Z',
    case: caseValue,
    provenance,
    baseline: {
      captured: true,
      note: 'Source and oracle captured from the Playwright test boundary; FAULTLINE re-verifies baseline after import.'
    }
  });
  assert.deepEqual(validateCaptureArtifact(artifact), artifact);
  assert.deepEqual(caseValue, originalCase);
  assert.deepEqual(provenance, originalProvenance);
  assert.notEqual(artifact.case, caseValue);
  assert.notEqual(artifact.provenance, provenance);
});

test('strictly rejects unsupported or ambiguous capture envelopes', () => {
  const valid = createCaptureArtifact({caseValue, provenance, capturedAt:'2026-09-09T00:00:00.000Z'});
  const invalid = [
    {...valid, format:'faultline.capture.v2'},
    {...valid, version:2},
    {...valid, extra:true},
    {...valid, capturedAt:'not-a-date'},
    {...valid, provenance:{...provenance, viewport:{width:0,height:720}}},
    {...valid, provenance:{...provenance, adapterVersion:0}},
    {...valid, provenance:{...provenance, browser:''}},
    {...valid, case:{...caseValue, html:42}},
    {...valid, case:{html:caseValue.html,css:caseValue.css,js:caseValue.js,oracle:caseValue.oracle,extra:true}}
  ];

  for (const candidate of invalid) {
    assert.throws(() => validateCaptureArtifact(candidate), /FAULTLINE_CAPTURE_INVALID/);
  }
});

test('requires bounded provenance text and exact baseline semantics', () => {
  const valid = createCaptureArtifact({caseValue, provenance, capturedAt:'2026-09-09T00:00:00.000Z'});
  assert.throws(() => validateCaptureArtifact({...valid, provenance:{...provenance, title:'x'.repeat(2049)}}), /FAULTLINE_CAPTURE_INVALID/);
  assert.throws(() => validateCaptureArtifact({...valid, baseline:{captured:false,note:valid.baseline.note}}), /FAULTLINE_CAPTURE_INVALID/);
  assert.throws(() => validateCaptureArtifact({...valid, baseline:{...valid.baseline, note:'different'}}), /FAULTLINE_CAPTURE_INVALID/);
});
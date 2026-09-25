import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerprint, compareFingerprints, verdictForReduction, signalsFromOracleEvidence, hashString, stableStringify } from '../src/causal-fingerprint.js';

const sig = (over = {}) => ({
  exceptionClass: 'TypeError', stack: 'TypeError: x\n    at pay (app.js:10:5)\n    at checkout (app.js:20:3)',
  assertionIdentity: 'checkout-total', networkSequence: [{ method: 'POST', status: 200, url: 'https://pay.test/charge' }],
  domInvariant: { total: '$10' }, eventOrdering: ['click', 'charge'], consoleSignature: 'charge ok',
  ...over,
});

test('same failure produces SAME_CAUSE acceptance', () => {
  const a = buildFingerprint(sig());
  const b = buildFingerprint(sig());
  const v = verdictForReduction({ status: 'FAIL', fingerprint: a }, { status: 'FAIL', fingerprint: b });
  assert.equal(v.accept, true);
  assert.equal(v.reason, 'SAME_CAUSE');
});

test('syntax-break reduction is rejected as DIFFERENT_FAIL', () => {
  const a = buildFingerprint(sig());
  const b = buildFingerprint(sig({ exceptionClass: 'SyntaxError', stack: 'SyntaxError: bad\n    at parse (bundle.js:1:1)', assertionIdentity: 'parse' }));
  const v = verdictForReduction({ status: 'FAIL', fingerprint: a }, { status: 'FAIL', fingerprint: b });
  assert.equal(v.accept, false);
  assert.match(v.reason, /STRONG_MISMATCH/);
});

test('PASS baseline never accepts', () => {
  const a = buildFingerprint(sig());
  const v = verdictForReduction({ status: 'PASS', fingerprint: a }, { status: 'FAIL', fingerprint: a });
  assert.equal(v.accept, false);
});

test('missing fingerprint rejects rather than guessing', () => {
  const v = verdictForReduction({ status: 'FAIL' }, { status: 'FAIL' });
  assert.equal(v.accept, false);
  assert.equal(v.reason, 'MISSING_FINGERPRINT');
});

test('fingerprints are deterministic', () => {
  assert.equal(buildFingerprint(sig()).signature, buildFingerprint(sig()).signature);
  assert.equal(compareFingerprints(buildFingerprint(sig()), buildFingerprint(sig())).sameCause, true);
});

test('oracleIdentity separates same-outcome different-oracle failures', () => {
  const oracleA = { kind: 'dom_attribute', selector: '#save', property: 'aria-disabled', equals: 'true' };
  const oracleB = { kind: 'dom_attribute', selector: '#other', property: 'aria-disabled', equals: 'true' };
  const a = buildFingerprint({ oracle: oracleA, domInvariant: { actual: 'true', expected: 'true' } });
  const b = buildFingerprint({ oracle: oracleB, domInvariant: { actual: 'true', expected: 'true' } });
  const v = verdictForReduction({ status: 'FAIL', fingerprint: a }, { status: 'FAIL', fingerprint: b });
  assert.equal(v.accept, false);
  assert.match(v.reason, /STRONG_MISMATCH:oracleIdentity/);
});

test('same oracle plus same invariant accepts (simple DOM fixture shape)', () => {
  const oracle = { kind: 'dom_property', selector: '#modal', property: 'open', equals: true };
  const ev = { actual: true, expected: true, kind: 'dom_property', selector: '#modal', property: 'open' };
  const a = buildFingerprint(signalsFromOracleEvidence(ev, oracle));
  const b = buildFingerprint(signalsFromOracleEvidence({ ...ev }, { ...oracle }));
  const v = verdictForReduction({ status: 'FAIL', fingerprint: a }, { status: 'FAIL', fingerprint: b });
  assert.equal(v.accept, true);
  assert.equal(v.reason, 'SAME_CAUSE');
});

test('signalsFromOracleEvidence maps runtime error name and stack', () => {
  const signals = signalsFromOracleEvidence(
    { actual: 'boom', kind: 'runtime_error', errorName: 'TypeError', errorStack: 'TypeError: boom\n    at pay (app.js:10:5)' },
    { kind: 'runtime_error' },
  );
  assert.equal(signals.exceptionClass, 'TypeError');
  assert.match(signals.stack, /TypeError/);
  const fp = buildFingerprint(signals);
  assert.ok(fp.dimensions.exceptionClass);
  assert.ok(fp.dimensions.stackSignature);
});

test('hash helpers are deterministic and key-order insensitive', () => {
  assert.equal(hashString('faultline'), hashString('faultline'));
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
});


test('network sequence drift is a different cause even under the same oracle', () => {
  const oracle={kind:'network_sequence',sequence:[{url:'/checkout',method:'POST',status:500}]};
  const a=buildFingerprint({oracle,networkSequence:[{method:'POST',status:500,url:'https://app.test/checkout'}]});
  const b=buildFingerprint({oracle,networkSequence:[{method:'POST',status:200,url:'https://app.test/checkout'}]});
  const v=verdictForReduction({status:'FAIL',fingerprint:a},{status:'FAIL',fingerprint:b});
  assert.equal(v.accept,false);
  assert.match(v.reason,/SUPPORTING_MISMATCH:networkSequence/);
});

test('oracle identity includes network/timing failure conditions but ignores action and delay', () => {
  const base={kind:'network_status',url:'/api/save',status:500,action:{kind:'none'},delayMs:10};
  const same={...base,action:{kind:'click',selector:'#retry'},delayMs:30};
  const different={...base,status:409};
  const a=buildFingerprint({oracle:base});
  const b=buildFingerprint({oracle:same});
  const c=buildFingerprint({oracle:different});
  assert.equal(a.dimensions.oracleIdentity,b.dimensions.oracleIdentity);
  assert.notEqual(a.dimensions.oracleIdentity,c.dimensions.oracleIdentity);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerprint, compareFingerprints, verdictForReduction } from '../src/causal-fingerprint.js';

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

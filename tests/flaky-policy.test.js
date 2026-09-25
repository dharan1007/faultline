import test from 'node:test';
import assert from 'node:assert/strict';
import {
  establishCausalStability,
  evaluateCandidateStability,
  wilsonLowerBound
} from '../src/flaky-policy.js';
import { buildFingerprint } from '../src/causal-fingerprint.js';

const fp = name => buildFingerprint({
  oracleIdentity: 'oracle-a',
  exceptionClass: name,
  stack: `${name}\n at handler (app.js:10:20)`,
  domInvariant: { selector: '#save', actual: 'bad', expected: 'good' },
  statePredicate: { key: 'saved', value: false }
});
const fail = fingerprint => ({ status: 'FAIL', fingerprint });
const pass = { status: 'PASS', fingerprint: null };
const unresolved = { status: 'UNRESOLVED', fingerprint: null };

function sequence(values) {
  let index = 0;
  return async () => structuredClone(values[Math.min(index++, values.length - 1)]);
}

test('deterministic baseline uses three-run fast path', async () => {
  const a = fp('TypeError');
  const profile = await establishCausalStability({ run: sequence([fail(a), fail(a), fail(a)]) });
  assert.equal(profile.accepted, true);
  assert.equal(profile.mode, 'deterministic');
  assert.equal(profile.observations.length, 3);

  const candidate = await evaluateCandidateStability({
    run: sequence([fail(a), fail(a)]),
    profile
  });
  assert.equal(candidate.accept, true);
  assert.equal(candidate.observations.length, 2);
});

test('different failing cause rejects immediately', async () => {
  const a = fp('TypeError');
  const b = fp('ReferenceError');
  const profile = await establishCausalStability({ run: sequence([fail(a), fail(b), fail(a)]) });
  assert.equal(profile.accepted, false);
  assert.equal(profile.reason, 'BASELINE_CAUSE_UNSTABLE');
});

test('flaky but repeatable baseline escalates to 20 observations', async () => {
  const a = fp('TypeError');
  const baseline = Array.from({ length: 20 }, (_, index) => index < 16 ? fail(a) : (index % 2 ? pass : unresolved));
  const profile = await establishCausalStability({ run: sequence(baseline) });
  assert.equal(profile.accepted, true);
  assert.equal(profile.mode, 'flaky');
  assert.equal(profile.observations.length, 20);
  assert.equal(profile.summary.sameCauseFails, 16);

  const candidateRuns = Array.from({ length: 20 }, (_, index) => index < 15 ? fail(a) : pass);
  const candidate = await evaluateCandidateStability({ run: sequence(candidateRuns), profile });
  assert.equal(candidate.accept, true);
  assert.equal(candidate.summary.sameCauseFails, 15);
});

test('flaky candidate with fewer than 15 same-cause failures is rejected', async () => {
  const a = fp('TypeError');
  const baseline = Array.from({ length: 20 }, (_, index) => index < 16 ? fail(a) : pass);
  const profile = await establishCausalStability({ run: sequence(baseline) });
  const candidateRuns = Array.from({ length: 20 }, (_, index) => index < 14 ? fail(a) : pass);
  const candidate = await evaluateCandidateStability({ run: sequence(candidateRuns), profile });
  assert.equal(candidate.accept, false);
  assert.match(candidate.reason, /INSUFFICIENT_SAME_CAUSE/);
});

test('wilson lower bound is bounded', () => {
  assert.equal(wilsonLowerBound(0, 0), 0);
  assert.ok(wilsonLowerBound(15, 20) > 0);
  assert.ok(wilsonLowerBound(15, 20) < 0.75);
});

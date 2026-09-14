import test from 'node:test';
import assert from 'node:assert/strict';
import { ORACLE_CLASSES, validateOracleClass, describeOracleClass } from '../src/oracle-classes.js';
import { baselineAccepted, candidateAccepted } from '../src/flaky-policy.js';
import { planReduction, MINIMALITY_DISCLAIMER } from '../src/reduction-dimensions.js';
import { buildReproManifest, REPRO_LAYOUT } from '../src/reproducer-artifact.js';

test('all 11 oracle classes validate with required fields', () => {
  assert.ok(ORACLE_CLASSES.length >= 11);
  assert.doesNotThrow(() => validateOracleClass({ class: 'assertion_failure', assertionId: 'a', expected: 1, actual: 2 }));
  assert.doesNotThrow(() => validateOracleClass({ class: 'network_sequence', sequence: [] }));
  assert.doesNotThrow(() => validateOracleClass({ class: 'flaky_statistical', trials: 20, minFailRate: 0.75 }));
  assert.throws(() => validateOracleClass({ class: 'nope' }), /UNKNOWN_ORACLE_CLASS/);
  assert.throws(() => validateOracleClass({ class: 'dom_state', selector: '#x' }), /ORACLE_MISSING_FIELD/);
  assert.ok(describeOracleClass('race_timing').required.includes('relation'));
});

test('flaky policy requires 15/20 baseline and confident candidate', () => {
  const stable = Array(15).fill('FAIL').concat(Array(5).fill('PASS'));
  const weak = Array(10).fill('FAIL').concat(Array(10).fill('PASS'));
  assert.equal(baselineAccepted(stable).accepted, true);
  assert.equal(baselineAccepted(weak).accepted, false);
  assert.equal(candidateAccepted(stable, stable, 0.9).accept, true);
  assert.equal(candidateAccepted(stable, weak, 0.9).accept, false);
  assert.equal(candidateAccepted(stable, stable, 0.1).accept, false);
});

test('reduction plan documents minimality boundary', () => {
  const plan = planReduction({});
  assert.ok(plan.some((d) => d.level === 'dom' && d.status === 'SHIPPED'));
  assert.ok(plan.some((d) => d.level === 'repository' && d.status === 'PLANNED'));
  assert.match(MINIMALITY_DISCLAIMER, /never a globally shortest program/);
});

test('repro manifest requires oracle + fingerprint', () => {
  assert.throws(() => buildReproManifest({}), /REPRO_MISSING_ORACLE/);
  const m = buildReproManifest({ oracle: { class: 'assertion_failure' }, fingerprint: { signature: 'abc' } });
  assert.equal(m.format, 'faultline-repro.v1');
  assert.match(m.manifestSha256, /^[0-9a-f]{64}$/);
  assert.ok(REPRO_LAYOUT.includes('run.sh') && REPRO_LAYOUT.includes('Dockerfile'));
});

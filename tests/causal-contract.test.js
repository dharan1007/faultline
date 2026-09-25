import test from 'node:test';
import assert from 'node:assert/strict';
import { ORACLE_CLASSES, validateOracleClass, describeOracleClass, describeOracleClassFull, ORACLE_CLASS_METADATA, RUNTIME_ORACLE_CLASS } from '../src/oracle-classes.js';
import { baselineAccepted, candidateAccepted } from '../src/flaky-policy.js';
import { planReduction, MINIMALITY_DISCLAIMER, MINIMALITY_STATUSES, describeMinimality } from '../src/reduction-dimensions.js';
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
  assert.ok(plan.some((d) => d.level === 'repository' && d.status === 'PARTIAL'));
  assert.match(MINIMALITY_DISCLAIMER, /never a globally shortest program/);
});

test('repro manifest requires oracle + fingerprint', () => {
  assert.throws(() => buildReproManifest({}), /REPRO_MISSING_ORACLE/);
  const m = buildReproManifest({ oracle: { class: 'assertion_failure' }, fingerprint: { signature: 'abc' } });
  assert.equal(m.format, 'faultline-repro.v1');
  assert.match(m.manifestSha256, /^[0-9a-f]{64}$/);
  assert.ok(REPRO_LAYOUT.includes('run.sh') && REPRO_LAYOUT.includes('Dockerfile'));
});

test('every oracle class carries the full engineering contract metadata', () => {
  const requiredKeys = ['id', 'failureType', 'signature', 'normalization', 'allowedNondeterminism', 'requiredSignals', 'fingerprintInputs', 'repeatPolicy', 'timeoutMs', 'equivalencePolicy'];
  for (const cls of ORACLE_CLASSES) {
    const full = describeOracleClassFull(cls);
    for (const key of requiredKeys) assert.ok(full[key] !== undefined, `${cls} must define ${key}`);
    assert.ok(Number.isFinite(full.timeoutMs) && full.timeoutMs > 0, `${cls} must define a positive timeout`);
  }
  assert.throws(() => describeOracleClassFull('nope'), /UNKNOWN_ORACLE_CLASS/);
});

test('runtime oracle kinds map onto documented classes', () => {
  assert.deepEqual(RUNTIME_ORACLE_CLASS, {
    dom_property: 'dom_state',
    dom_attribute: 'dom_state',
    dom_exists: 'dom_state',
    computed_style: 'dom_state',
    runtime_error: 'uncaught_exception',
  });
});

test('minimality vocabulary never calls a budget-limited result minimal', () => {
  assert.ok(MINIMALITY_STATUSES.includes('LOCALLY_MINIMAL'));
  assert.ok(MINIMALITY_STATUSES.includes('BUDGET_LIMITED'));
  assert.match(describeMinimality('BUDGET_LIMITED').meaning, /never reported as minimal/);
  assert.match(describeMinimality('LOCALLY_MINIMAL').meaning, /SAME_CAUSE/);
  assert.throws(() => describeMinimality('GLOBALLY_MINIMAL'), /UNKNOWN_MINIMALITY_STATUS/);
});

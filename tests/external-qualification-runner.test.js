import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineMatches, validateExternalRunnerManifest } from '../src/external-qualification-runner.js';

const sha = '1234567890abcdef1234567890abcdef12345678';
const externalCase = (overrides = {}) => ({
  id: 'upstream-case-1',
  repository: 'https://github.com/example/project',
  commit: sha,
  reproduction: 'npm test -- --grep original-case',
  setupCommand: 'npm ci --ignore-scripts',
  license: 'MIT',
  provenance: 'https://github.com/example/project/issues/1',
  expectedFailure: {
    oracle: { kind: 'runtime_error', equals: 'boom' },
    runner: { exitCode: 1, stderrIncludes: ['boom'] }
  },
  adapter: {
    command: 'node ./capture-original-case.mjs',
    capturePath: '.faultline/capture.json',
    mode: 'portable'
  },
  timeoutMs: 120000,
  ...overrides
});

const manifest = cases => ({ schema: 'faultline.external-corpus.v1', cases });

test('accepts an immutable untouched external case with a separate capture adapter', () => {
  const validated = validateExternalRunnerManifest(manifest([externalCase()]));
  assert.equal(validated.cases.length, 1);
  assert.equal(validated.cases[0].commit, sha);
  assert.equal(validated.cases[0].reproduction, 'npm test -- --grep original-case');
  assert.equal(validated.cases[0].adapter.capturePath, '.faultline/capture.json');
  assert.match(validated.digest, /^[0-9a-f]{64}$/);
});

test('rejects credentials in source repository URL and unsafe adapter definitions', () => {
  assert.throws(() => validateExternalRunnerManifest(manifest([
    externalCase({ repository: 'https://token@example.com/project' })
  ])), /REPOSITORY_CREDENTIALS_FORBIDDEN/);
  assert.throws(() => validateExternalRunnerManifest(manifest([
    externalCase({ adapter: { command: '', capturePath: 'capture.json' } })
  ])), /CAPTURE_COMMAND_REQUIRED/);
  assert.throws(() => validateExternalRunnerManifest(manifest([
    externalCase({ adapter: { command: 'node capture.mjs', capturePath: 'capture.json', mode: 'magic' } })
  ])), /INVALID_MODE/);
});

test('rejects floating, duplicate and zero source identities through the shared corpus contract', () => {
  assert.throws(() => validateExternalRunnerManifest(manifest([
    externalCase({ commit: 'main' })
  ])), /IMMUTABLE_COMMIT_REQUIRED/);
  assert.throws(() => validateExternalRunnerManifest(manifest([
    externalCase({ commit: '0'.repeat(40) })
  ])), /IMMUTABLE_COMMIT_REQUIRED/);
  assert.throws(() => validateExternalRunnerManifest(manifest([
    externalCase(),
    externalCase({ id: 'upstream-case-2' })
  ])), /DUPLICATE_UPSTREAM_CASE/);
});

test('baseline matching is explicit and never treats a successful run as a failing incident by default', () => {
  assert.equal(baselineMatches({ exitCode: 0, stdout: '', stderr: '' }, { mode: 'nonzero-exit' }), false);
  assert.equal(baselineMatches({ exitCode: 1, stdout: '', stderr: '' }, { mode: 'nonzero-exit' }), true);
  assert.equal(baselineMatches(
    { exitCode: 7, stdout: 'baseline reproduced', stderr: 'Target crashed' },
    { exitCode: 7, stdoutIncludes: ['baseline reproduced'], stderrIncludes: ['Target crashed'] }
  ), true);
  assert.equal(baselineMatches(
    { exitCode: 7, stdout: 'baseline reproduced', stderr: 'different failure' },
    { exitCode: 7, stderrIncludes: ['Target crashed'] }
  ), false);
});

test('rejects meaningless runner predicates and unbounded execution time', () => {
  assert.throws(() => validateExternalRunnerManifest(manifest([
    externalCase({ expectedFailure: { oracle: { kind: 'runtime_error', equals: 'boom' }, runner: {} } })
  ])), /EMPTY_RUNNER_EXPECTATION/);
  assert.throws(() => validateExternalRunnerManifest(manifest([
    externalCase({ timeoutMs: 31 * 60 * 1000 })
  ])), /INVALID_TIMEOUT/);
});

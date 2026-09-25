import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reduceCollection,
  reduceNetworkFixtures,
  reduceStateEntries,
  reduceRepositoryManifest
} from '../src/collection-reducer.js';

test('collection reducer reaches an explicit 1-minimal fixpoint', async () => {
  const items = ['noise-a', 'required', 'noise-b', 'noise-c'];
  const result = await reduceCollection(
    items,
    async candidate => ({ accept: candidate.includes('required'), reason: 'REQUIRED_PRESENT' }),
    { maxTrials: 50, concurrency: 3 }
  );
  assert.deepEqual(result.items, ['required']);
  assert.equal(result.minimality, 'LOCALLY_MINIMAL');
  assert.equal(result.reducedCount, 1);
  assert.ok(result.trialCount <= 50);
});

test('protected collection keys survive reduction', async () => {
  const items = [{ id: 'required' }, { id: 'protected' }, { id: 'noise' }];
  const result = await reduceCollection(
    items,
    async candidate => candidate.some(item => item.id === 'required'),
    { protectedKeys: ['id:protected'] }
  );
  assert.deepEqual(result.items.map(item => item.id).sort(), ['protected', 'required']);
});

test('memoization prevents duplicate evaluator work', async () => {
  let evaluations = 0;
  const result = await reduceCollection(
    ['a', 'required', 'b'],
    async candidate => {
      evaluations++;
      return candidate.includes('required');
    },
    { maxTrials: 50, concurrency: 2 }
  );
  assert.ok(result.cacheHits >= 1);
  assert.equal(evaluations, result.trialCount);
});

test('network, state, and repository adapters preserve structured records', async () => {
  const network = await reduceNetworkFixtures(
    [
      { id: 'n1', method: 'GET', url: 'https://app.test/noise' },
      { id: 'n2', method: 'POST', url: 'https://app.test/save' }
    ],
    async candidate => candidate.some(item => item.id === 'n2')
  );
  assert.deepEqual(network.items.map(item => item.id), ['n2']);

  const state = await reduceStateEntries(
    [{ id: 's1', key: 'noise' }, { id: 's2', key: 'auth' }],
    async candidate => candidate.some(item => item.id === 's2')
  );
  assert.deepEqual(state.items.map(item => item.id), ['s2']);

  const repository = await reduceRepositoryManifest(
    [{ path: 'noise.js' }, { path: 'src/fault.js' }],
    async candidate => candidate.some(item => item.path === 'src/fault.js')
  );
  assert.deepEqual(repository.items.map(item => item.path), ['src/fault.js']);
});

test('budget exhaustion fails closed instead of claiming minimality', async () => {
  await assert.rejects(
    reduceCollection(
      ['required', 'noise-a', 'noise-b', 'noise-c'],
      async candidate => candidate.includes('required'),
      { maxTrials: 1 }
    ),
    /TRIAL_BUDGET_EXHAUSTED/
  );
});

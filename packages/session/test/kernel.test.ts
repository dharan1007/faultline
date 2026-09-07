import test from 'node:test';
import assert from 'node:assert/strict';
import { ProtocolError, type DebugSession, type MutationEnvelope } from '@faultline/protocol';
import { MemorySessionRepository, SessionKernel } from '../src/index.js';

const fixedTime = '2026-09-07T11:05:00.000Z';

function makeSession(): DebugSession {
  return {
    schemaVersion: '3.1.0',
    sessionId: 'ses_kernel_1',
    revision: 'r1',
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
    target: {
      kind: 'legacy_case',
      targetId: 'target_legacy_1',
      snapshotId: 'sha256:abc',
      safety: 'reversible',
      artifactRef: 'artifact_legacy_case',
    },
    environment: { browser: null, route: null, buildId: null, adapterVersions: {} },
    adapters: [],
    capabilities: { ids: [] },
    journey: { revision: 'r1', actions: [] },
    oracle: { revision: 'r1', kind: 'dom_exists', config: { selector: '#app', equals: true } },
    baselines: [],
    observations: { items: {} },
    dimensions: [],
    experiments: [],
    causalGraph: { nodes: {}, edges: {} },
    pins: { dimensionIds: [] },
    artifacts: { items: {} },
    provenance: { createdBy: 'test', sourceRefs: [] },
  };
}

function env(expectedRevision: string, idempotencyKey: string): MutationEnvelope {
  return {
    requestId: `req_${idempotencyKey}`,
    idempotencyKey,
    sessionId: 'ses_kernel_1',
    expectedRevision,
  };
}

test('kernel alone stamps revision and timestamp and replays identical idempotency keys', async () => {
  const repo = new MemorySessionRepository();
  const kernel = new SessionKernel(repo, { clock: () => new Date(fixedTime) });
  await repo.create(makeSession());

  const first = await kernel.mutate(env('r1', 'idem-a'), 'set_pin', { id: 'dim-1' }, (session) => ({
    next: { ...session, pins: { dimensionIds: ['dim-1'] } },
    result: { pinned: 'dim-1' },
  }));

  assert.equal(first.revision, 'r2');
  const stored = await repo.get('ses_kernel_1');
  assert.equal(stored?.session.revision, 'r2');
  assert.equal(stored?.session.updatedAt, fixedTime);

  const replay = await kernel.mutate(env('r1', 'idem-a'), 'set_pin', { id: 'dim-1' }, () => {
    throw new Error('idempotent replay must not rerun reducer');
  });
  assert.deepEqual(replay, first);
});

test('stale revisions and reused idempotency keys with different payloads fail before reducer execution', async () => {
  const repo = new MemorySessionRepository();
  const kernel = new SessionKernel(repo, { clock: () => new Date(fixedTime) });
  await repo.create(makeSession());
  await kernel.mutate(env('r1', 'idem-a'), 'set_pin', { id: 'dim-1' }, (session) => ({
    next: { ...session, pins: { dimensionIds: ['dim-1'] } },
    result: { pinned: 'dim-1' },
  }));

  let staleReducerRan = false;
  await assert.rejects(
    kernel.mutate(env('r1', 'idem-b'), 'set_pin', { id: 'dim-2' }, (session) => {
      staleReducerRan = true;
      return { next: session, result: null };
    }),
    (error: unknown) => error instanceof ProtocolError && error.code === 'conflict',
  );
  assert.equal(staleReducerRan, false);

  let reusedReducerRan = false;
  await assert.rejects(
    kernel.mutate(env('r1', 'idem-a'), 'set_pin', { id: 'different' }, (session) => {
      reusedReducerRan = true;
      return { next: session, result: null };
    }),
    (error: unknown) => error instanceof ProtocolError && error.code === 'conflict',
  );
  assert.equal(reusedReducerRan, false);
});

test('compare-and-swap permits exactly one concurrent mutation for one expected revision', async () => {
  const repo = new MemorySessionRepository();
  const kernel = new SessionKernel(repo, { clock: () => new Date(fixedTime) });
  await repo.create(makeSession());

  const mutations = ['dim-a', 'dim-b'].map((id) => kernel.mutate(
    env('r1', `idem-${id}`),
    'set_pin',
    { id },
    (session) => ({
      next: { ...session, pins: { dimensionIds: [id] } },
      result: { pinned: id },
    }),
  ));

  const results = await Promise.allSettled(mutations);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert(rejected && rejected.status === 'rejected');
  assert(rejected.reason instanceof ProtocolError);
  assert.equal(rejected.reason.code, 'conflict');
  assert.equal((await repo.get('ses_kernel_1'))?.session.revision, 'r2');
});

test('reducers cannot forge session identity or revision lineage', async () => {
  const repo = new MemorySessionRepository();
  const kernel = new SessionKernel(repo, { clock: () => new Date(fixedTime) });
  await repo.create(makeSession());

  await assert.rejects(
    kernel.mutate(env('r1', 'idem-forge'), 'forge', {}, (session) => ({
      next: { ...session, revision: 'r99' },
      result: null,
    })),
    (error: unknown) => error instanceof ProtocolError && error.code === 'invalid_request',
  );
  assert.equal((await repo.get('ses_kernel_1'))?.session.revision, 'r1');
});

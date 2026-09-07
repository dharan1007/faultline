import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DebugSessionSchema,
  MutationEnvelopeSchema,
  OperationResultSchema,
  ProtocolError,
  parseDebugSession,
} from '../src/index.js';

const session = {
  schemaVersion: '3.1.0',
  sessionId: 'ses_01JFAULTLINE00000000000000',
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
  environment: {
    browser: null,
    route: null,
    buildId: null,
    adapterVersions: {},
  },
  adapters: [],
  capabilities: { ids: [] },
  journey: { revision: 'r1', actions: [] },
  oracle: {
    revision: 'r1',
    kind: 'dom_exists',
    config: { selector: '#app', equals: true },
  },
  baselines: [],
  observations: { items: {} },
  dimensions: [],
  experiments: [],
  causalGraph: { nodes: {}, edges: {} },
  pins: { dimensionIds: [] },
  artifacts: { items: {} },
  provenance: { createdBy: 'test', sourceRefs: [] },
};

export const validSession = session;

test('canonical session validates strict revision/oracle structure', () => {
  assert.equal(DebugSessionSchema.parse(session).revision, 'r1');
  assert.throws(() => DebugSessionSchema.parse({ ...session, revision: '1' }));
  assert.throws(() => DebugSessionSchema.parse({
    ...session,
    oracle: { revision: 'r1', kind: 'unknown', config: {} },
  }));
  assert.throws(() => DebugSessionSchema.parse({ ...session, unexpectedTopLevel: true }));
});

test('mutation envelope requires explicit revision identity', () => {
  const parsed = MutationEnvelopeSchema.parse({
    requestId: 'req_1',
    idempotencyKey: 'idem_1',
    sessionId: session.sessionId,
    expectedRevision: 'r1',
  });
  assert.equal(parsed.expectedRevision, 'r1');
  assert.throws(() => MutationEnvelopeSchema.parse({ requestId: 'req_1' }));
});

test('transport result cannot masquerade as oracle result', () => {
  assert.equal(OperationResultSchema.parse({
    kind: 'ok',
    operationId: 'op_1',
    revision: 'r1',
  }).kind, 'ok');
  assert.throws(() => OperationResultSchema.parse({ kind: 'FAIL' }));
});

test('invalid external session becomes safe protocol error', () => {
  assert.throws(
    () => parseDebugSession({ secret: 'must-not-echo' }),
    (error: unknown) => {
      assert(error instanceof ProtocolError);
      assert.equal(error.code, 'invalid_request');
      assert.doesNotMatch(JSON.stringify(error.toJSON()), /must-not-echo/);
      return true;
    },
  );
});

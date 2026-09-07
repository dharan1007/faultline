import test from 'node:test';
import assert from 'node:assert/strict';
import { ProtocolError, type CapabilityDescriptor } from '@faultline/protocol';
import { CapabilityRegistry } from '../src/index.js';

const observe: CapabilityDescriptor = {
  id: 'browser.capture.dom',
  version: '1',
  adapterId: 'generic',
  mode: 'observe',
  safety: 'read_only',
  determinism: 'deterministic',
};

const destructive: CapabilityDescriptor = {
  id: 'framework.next.mutate.route_fixture',
  version: '1',
  adapterId: 'next',
  mode: 'intervene',
  safety: 'destructive',
  determinism: 'deterministic',
};

test('capability resolution is exact and unknown mutation never falls back', () => {
  const registry = new CapabilityRegistry();
  registry.register(observe);
  assert.equal(registry.require('browser.capture.dom', 'generic').id, 'browser.capture.dom');
  assert.throws(
    () => registry.require('unknown.mutate', 'generic'),
    (error: unknown) => error instanceof ProtocolError && error.code === 'capability_missing',
  );
});

test('duplicate capability descriptors must be byte-for-byte compatible', () => {
  const registry = new CapabilityRegistry();
  registry.register(observe);
  registry.register({ ...observe });
  assert.throws(
    () => registry.register({ ...observe, version: '2' }),
    (error: unknown) => error instanceof ProtocolError && error.code === 'conflict',
  );
});

test('destructive capabilities require approval bound to exact session target capability and plan', () => {
  const registry = new CapabilityRegistry();
  registry.register(destructive);
  const context = {
    sessionId: 'ses_1',
    sessionRevision: 'r4',
    targetSnapshotId: 'sha256:target',
    planId: 'plan_1',
  } as const;

  assert.throws(
    () => registry.require(destructive.id, destructive.adapterId, context),
    (error: unknown) => error instanceof ProtocolError && error.code === 'safety_approval_required',
  );

  const approval = {
    approvalId: 'approval_1',
    sessionId: 'ses_1',
    sessionRevision: 'r4',
    targetSnapshotId: 'sha256:target',
    adapterId: 'next',
    capabilityId: destructive.id,
    planId: 'plan_1',
  } as const;
  assert.equal(registry.require(destructive.id, destructive.adapterId, { ...context, approval }).id, destructive.id);

  assert.throws(
    () => registry.require(destructive.id, destructive.adapterId, {
      ...context,
      approval: { ...approval, sessionRevision: 'r5' },
    }),
    (error: unknown) => error instanceof ProtocolError && error.code === 'safety_approval_required',
  );
});

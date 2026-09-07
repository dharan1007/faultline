import {
  DebugSessionSchema,
  MutationEnvelopeSchema,
  ProtocolError,
  type DebugSession,
  type MutationEnvelope,
} from '@faultline/protocol';
import { fingerprintMutation } from './idempotency.js';
import type {
  MutationReceipt,
  SessionRepository,
  StoredIdempotencyRecord,
  StoredMutationRecord,
} from './repository.js';

export interface SessionKernelOptions {
  clock?: () => Date;
}

const clone = <T>(value: T): T => structuredClone(value);

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function nextRevision(revision: string): string {
  const match = /^r([1-9]\d*)$/.exec(revision);
  if (!match?.[1]) throw new ProtocolError('internal_error', 'Stored session revision is invalid');
  return `r${BigInt(match[1]) + 1n}`;
}

function validateEnvelope(envelope: MutationEnvelope): MutationEnvelope {
  const parsed = MutationEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    throw new ProtocolError('invalid_request', 'Invalid mutation envelope', {
      details: { paths: parsed.error.issues.map((issue) => issue.path.map(String).join('.')) },
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function assertKernelOwnedFieldsUnchanged(current: DebugSession, proposed: DebugSession): void {
  const immutable: Array<keyof DebugSession> = ['schemaVersion', 'sessionId', 'revision', 'createdAt', 'updatedAt'];
  const changed = immutable.filter((key) => proposed[key] !== current[key]);
  if (changed.length) {
    throw new ProtocolError('invalid_request', 'Reducer attempted to modify kernel-owned session identity', {
      details: { fields: changed },
    });
  }
}

export class SessionKernel {
  readonly #repository: SessionRepository;
  readonly #clock: () => Date;

  constructor(repository: SessionRepository, options: SessionKernelOptions = {}) {
    this.#repository = repository;
    this.#clock = options.clock ?? (() => new Date());
  }

  async mutate<T>(
    envelope: MutationEnvelope,
    kind: string,
    input: unknown,
    reducer: (current: Readonly<DebugSession>) => { next: DebugSession; result: T },
  ): Promise<MutationReceipt<T>> {
    const request = validateEnvelope(envelope);
    const fingerprint = fingerprintMutation(kind, input);

    const prior = await this.#repository.getIdempotency(request.sessionId, request.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new ProtocolError('conflict', 'Idempotency key was already used for a different mutation');
      }
      return clone(prior.receipt) as MutationReceipt<T>;
    }

    const stored = await this.#repository.get(request.sessionId);
    if (!stored) throw new ProtocolError('invalid_request', `Session not found: ${request.sessionId}`);
    if (stored.session.revision !== request.expectedRevision) {
      throw new ProtocolError('conflict', 'Session revision is stale', {
        details: { expectedRevision: request.expectedRevision, currentRevision: stored.session.revision },
      });
    }

    const current = deepFreeze(clone(stored.session));
    let reduction: { next: DebugSession; result: T };
    try {
      reduction = reducer(current);
    } catch (error) {
      if (error instanceof ProtocolError) throw error;
      throw new ProtocolError('internal_error', 'Session reducer failed', { cause: error });
    }

    if (!reduction || typeof reduction !== 'object' || !('next' in reduction)) {
      throw new ProtocolError('internal_error', 'Session reducer returned an invalid result');
    }

    assertKernelOwnedFieldsUnchanged(stored.session, reduction.next);
    const at = this.#clock().toISOString();
    const stampedCandidate = {
      ...clone(reduction.next),
      revision: nextRevision(stored.session.revision),
      updatedAt: at,
    };

    const validated = DebugSessionSchema.safeParse(stampedCandidate);
    if (!validated.success) {
      throw new ProtocolError('invalid_request', 'Reducer produced an invalid session', {
        details: { paths: validated.error.issues.map((issue) => issue.path.map(String).join('.')) },
        cause: validated.error,
      });
    }

    let safeResult: T;
    try {
      safeResult = clone(reduction.result);
    } catch (error) {
      throw new ProtocolError('internal_error', 'Mutation result is not serializable', { cause: error });
    }

    const receipt: MutationReceipt<T> = {
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      sessionId: request.sessionId,
      kind,
      revision: validated.data.revision,
      result: safeResult,
      at,
    };
    const mutation: StoredMutationRecord = {
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      kind,
      inputDigest: fingerprint,
      revision: validated.data.revision,
      at,
    };
    const idempotency: StoredIdempotencyRecord = {
      key: request.idempotencyKey,
      fingerprint,
      receipt: receipt as MutationReceipt,
    };

    const committed = await this.#repository.compareAndSwap({
      sessionId: request.sessionId,
      expectedRevision: request.expectedRevision,
      next: validated.data,
      mutation,
      idempotency,
    });

    if (committed === 'committed') return clone(receipt);

    const raced = await this.#repository.getIdempotency(request.sessionId, request.idempotencyKey);
    if (raced?.fingerprint === fingerprint) return clone(raced.receipt) as MutationReceipt<T>;
    throw new ProtocolError('conflict', 'Session revision changed before mutation commit');
  }
}

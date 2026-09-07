import type { DebugSession } from '@faultline/protocol';

export interface MutationReceipt<T = unknown> {
  requestId: string;
  idempotencyKey: string;
  sessionId: string;
  kind: string;
  revision: string;
  result: T;
  at: string;
}

export interface StoredMutationRecord {
  requestId: string;
  idempotencyKey: string;
  kind: string;
  inputDigest: string;
  revision: string;
  at: string;
}

export interface StoredIdempotencyRecord {
  key: string;
  fingerprint: string;
  receipt: MutationReceipt;
}

export interface StoredSession {
  session: DebugSession;
  mutations: StoredMutationRecord[];
}

export interface SessionRepository {
  create(session: DebugSession): Promise<void>;
  get(sessionId: string): Promise<StoredSession | null>;
  compareAndSwap(args: {
    sessionId: string;
    expectedRevision: string;
    next: DebugSession;
    mutation: StoredMutationRecord;
    idempotency: StoredIdempotencyRecord;
  }): Promise<'committed' | 'conflict'>;
  getIdempotency(sessionId: string, key: string): Promise<StoredIdempotencyRecord | null>;
}

import { DebugSessionSchema, ProtocolError, type DebugSession } from '@faultline/protocol';
import type {
  SessionRepository,
  StoredIdempotencyRecord,
  StoredMutationRecord,
  StoredSession,
} from './repository.js';

interface Entry {
  session: DebugSession;
  mutations: StoredMutationRecord[];
  idempotency: Map<string, StoredIdempotencyRecord>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class MemorySessionRepository implements SessionRepository {
  #entries = new Map<string, Entry>();

  async create(session: DebugSession): Promise<void> {
    const validated = DebugSessionSchema.parse(session);
    if (this.#entries.has(validated.sessionId)) {
      throw new ProtocolError('conflict', `Session already exists: ${validated.sessionId}`);
    }
    this.#entries.set(validated.sessionId, {
      session: clone(validated),
      mutations: [],
      idempotency: new Map(),
    });
  }

  async get(sessionId: string): Promise<StoredSession | null> {
    const entry = this.#entries.get(sessionId);
    if (!entry) return null;
    return {
      session: clone(entry.session),
      mutations: clone(entry.mutations),
    };
  }

  async getIdempotency(sessionId: string, key: string): Promise<StoredIdempotencyRecord | null> {
    const record = this.#entries.get(sessionId)?.idempotency.get(key);
    return record ? clone(record) : null;
  }

  async compareAndSwap(args: {
    sessionId: string;
    expectedRevision: string;
    next: DebugSession;
    mutation: StoredMutationRecord;
    idempotency: StoredIdempotencyRecord;
  }): Promise<'committed' | 'conflict'> {
    const entry = this.#entries.get(args.sessionId);
    if (!entry || entry.session.revision !== args.expectedRevision) return 'conflict';

    const existingIdempotency = entry.idempotency.get(args.idempotency.key);
    if (existingIdempotency) return 'conflict';

    const validated = DebugSessionSchema.parse(args.next);
    entry.session = clone(validated);
    entry.mutations.push(clone(args.mutation));
    entry.idempotency.set(args.idempotency.key, clone(args.idempotency));
    return 'committed';
  }
}

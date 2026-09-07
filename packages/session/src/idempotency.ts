import { createHash } from 'node:crypto';
import { ProtocolError } from '@faultline/protocol';

function canonicalize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ProtocolError('invalid_request', 'Mutation input contains a non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new ProtocolError('invalid_request', `Mutation input contains unsupported type: ${typeof value}`);
  }

  if (seen.has(value)) throw new ProtocolError('invalid_request', 'Mutation input contains a cycle');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item, seen)).join(',')}]`;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new ProtocolError('invalid_request', 'Mutation input must contain plain JSON objects');
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`);
    return `{${entries.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalMutationInput(value: unknown): string {
  return canonicalize(value, new WeakSet<object>());
}

export function fingerprintMutation(kind: string, input: unknown): string {
  if (!kind) throw new ProtocolError('invalid_request', 'Mutation kind is required');
  const canonical = canonicalMutationInput({ kind, input });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

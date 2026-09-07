import { DebugSessionSchema, type DebugSession } from './session.js';
import { ProtocolError } from './errors.js';

export * from './primitives.js';
export * from './capabilities.js';
export * from './session.js';
export * from './operations.js';
export * from './errors.js';

export function parseDebugSession(value: unknown): DebugSession {
  const parsed = DebugSessionSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new ProtocolError('invalid_request', 'Invalid debug session', {
    details: {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        code: issue.code,
        message: issue.message,
      })),
    },
    cause: parsed.error,
  });
}

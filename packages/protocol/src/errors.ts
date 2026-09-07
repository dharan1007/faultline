import type { ProtocolErrorCode } from './primitives.js';

export interface ProtocolErrorOptions {
  details?: unknown;
  cause?: unknown;
}

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(code: ProtocolErrorCode, message: string, options: ProtocolErrorOptions = {}) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
    if ('details' in options) this.details = options.details;
    if ('cause' in options) this.cause = options.cause;
  }

  toJSON(): { code: ProtocolErrorCode; message: string; details?: unknown } {
    const result: { code: ProtocolErrorCode; message: string; details?: unknown } = {
      code: this.code,
      message: this.message,
    };
    if (this.details !== undefined) result.details = this.details;
    return result;
  }
}

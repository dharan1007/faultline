import { z } from 'zod';

export const SchemaVersionSchema = z.literal('3.1.0');
export const RevisionSchema = z.string().regex(/^r[1-9]\d*$/, 'revision must be rN with N >= 1');
export const IdentifierSchema = z.string().min(1).max(256);
export const DigestSchema = z.string().regex(/^sha256:[A-Za-z0-9._~+/=-]+$/, 'digest must be sha256:<digest>');
export const TimestampSchema = z.iso.datetime({ offset: true });

export const OracleResultSchema = z.enum(['PASS', 'FAIL', 'UNRESOLVED']);
export const SafetyClassSchema = z.enum(['read_only', 'reversible', 'destructive']);
export const DeterminismSchema = z.enum(['deterministic', 'bounded_variance', 'unknown']);
export const TargetKindSchema = z.enum([
  'local_url',
  'staging_url',
  'live_url_capture',
  'playwright_trace',
  'har',
  'ci_failure',
  'otel_trace',
  'legacy_case',
]);

export const ProtocolErrorCodeSchema = z.enum([
  'conflict',
  'invalid_request',
  'capability_missing',
  'safety_approval_required',
  'target_dirty',
  'unresolved',
  'cancelled',
  'internal_error',
]);

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type OracleResult = z.infer<typeof OracleResultSchema>;
export type SafetyClass = z.infer<typeof SafetyClassSchema>;
export type Determinism = z.infer<typeof DeterminismSchema>;
export type TargetKind = z.infer<typeof TargetKindSchema>;
export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>;

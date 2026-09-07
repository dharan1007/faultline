import { z } from 'zod';
import {
  DigestSchema,
  IdentifierSchema,
  ProtocolErrorCodeSchema,
  RevisionSchema,
} from './primitives.js';

export const MutationEnvelopeSchema = z.object({
  requestId: IdentifierSchema,
  idempotencyKey: IdentifierSchema,
  sessionId: IdentifierSchema,
  expectedRevision: RevisionSchema,
  targetSnapshotId: DigestSchema.optional(),
  adapterId: IdentifierSchema.optional(),
  capabilityId: IdentifierSchema.optional(),
}).strict();

export const OperationKindSchema = z.union([
  z.literal('ok'),
  ProtocolErrorCodeSchema,
]);

export const OperationResultSchema = z.object({
  kind: OperationKindSchema,
  operationId: IdentifierSchema.optional(),
  revision: RevisionSchema.optional(),
  message: z.string().max(2048).optional(),
  details: z.unknown().optional(),
}).strict();

export type MutationEnvelope = z.infer<typeof MutationEnvelopeSchema>;
export type OperationKind = z.infer<typeof OperationKindSchema>;
export type OperationResult = z.infer<typeof OperationResultSchema>;

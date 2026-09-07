import { z } from 'zod';
import type { Observation, TargetDescriptor } from './session.js';
import {
  DeterminismSchema,
  DigestSchema,
  IdentifierSchema,
  OracleResultSchema,
  RevisionSchema,
  SafetyClassSchema,
} from './primitives.js';

export const CapabilityModeSchema = z.enum(['observe', 'replay', 'intervene']);

export const CapabilityDescriptorSchema = z.object({
  id: IdentifierSchema,
  version: z.string().min(1).max(64),
  adapterId: IdentifierSchema,
  mode: CapabilityModeSchema,
  safety: SafetyClassSchema,
  determinism: DeterminismSchema,
}).strict();

export const CapabilitySetSchema = z.object({
  ids: z.array(IdentifierSchema),
}).strict();

export const AdapterDescriptorSchema = z.object({
  id: IdentifierSchema,
  version: z.string().min(1).max(64),
  name: z.string().min(1).max(160),
  protocolVersion: z.literal('3.1.0'),
}).strict();

export const AdapterBindingSchema = z.object({
  adapterId: IdentifierSchema,
  version: z.string().min(1).max(64),
  capabilityIds: z.array(IdentifierSchema),
  detected: z.boolean(),
  data: z.unknown().optional(),
}).strict();

export const CapabilityApprovalSchema = z.object({
  approvalId: IdentifierSchema,
  sessionId: IdentifierSchema,
  sessionRevision: RevisionSchema,
  targetSnapshotId: DigestSchema,
  adapterId: IdentifierSchema,
  capabilityId: IdentifierSchema,
  planId: IdentifierSchema,
}).strict();

export const InterventionDescriptorSchema = z.object({
  capabilityId: IdentifierSchema,
  planId: IdentifierSchema,
  data: z.unknown().optional(),
}).strict();

export const CausalDimensionSchema = z.object({
  id: IdentifierSchema,
  adapterId: IdentifierSchema,
  kind: IdentifierSchema,
  label: z.string().min(1).max(512),
  parentId: IdentifierSchema.optional(),
  dependencies: z.array(IdentifierSchema),
  conflicts: z.array(IdentifierSchema),
  safety: SafetyClassSchema,
  determinism: DeterminismSchema,
  intervention: InterventionDescriptorSchema,
  evidenceRefs: z.array(IdentifierSchema),
}).strict();

export interface DetectionResult {
  matched: boolean;
  confidence?: number;
  evidenceRefs?: string[];
  data?: unknown;
}

export interface CaptureContext {
  sessionId: string;
  target: TargetDescriptor;
  data?: unknown;
}

export interface ReplayContext {
  sessionId: string;
  sessionRevision: string;
  target: TargetDescriptor;
  data?: unknown;
}

export interface ReplayResult {
  status: z.infer<typeof OracleResultSchema>;
  evidenceRefs: string[];
  data?: unknown;
}

export interface DimensionContext {
  sessionId: string;
  sessionRevision: string;
  target: TargetDescriptor;
  data?: unknown;
}

export interface InterventionContext {
  sessionId: string;
  sessionRevision: string;
  target: TargetDescriptor;
  dimension: CausalDimension;
  planId: string;
  data?: unknown;
}

export interface InterventionLease {
  leaseId: string;
  adapterId: string;
  capabilityId: string;
  planId: string;
  targetSnapshotId: string;
  data?: unknown;
}

export interface RestorationResult {
  restored: boolean;
  verified: boolean;
  evidenceRefs: string[];
  data?: unknown;
}

export interface FaultlineAdapter {
  descriptor(): AdapterDescriptor;
  detect(target: TargetDescriptor, signal?: AbortSignal): Promise<DetectionResult>;
  capabilities(target: TargetDescriptor, signal?: AbortSignal): Promise<CapabilityDescriptor[]>;
  capture(ctx: CaptureContext, signal?: AbortSignal): AsyncIterable<Observation>;
  replay(ctx: ReplayContext, signal?: AbortSignal): Promise<ReplayResult>;
  enumerateDimensions(ctx: DimensionContext, signal?: AbortSignal): Promise<CausalDimension[]>;
  intervene(ctx: InterventionContext, signal?: AbortSignal): Promise<InterventionLease>;
  restore(lease: InterventionLease, signal?: AbortSignal): Promise<RestorationResult>;
}

export type CapabilityMode = z.infer<typeof CapabilityModeSchema>;
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;
export type CapabilitySet = z.infer<typeof CapabilitySetSchema>;
export type AdapterDescriptor = z.infer<typeof AdapterDescriptorSchema>;
export type AdapterBinding = z.infer<typeof AdapterBindingSchema>;
export type CapabilityApproval = z.infer<typeof CapabilityApprovalSchema>;
export type InterventionDescriptor = z.infer<typeof InterventionDescriptorSchema>;
export type CausalDimension = z.infer<typeof CausalDimensionSchema>;

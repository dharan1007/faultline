import { z } from 'zod';
import {
  DeterminismSchema,
  IdentifierSchema,
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

export type CapabilityMode = z.infer<typeof CapabilityModeSchema>;
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;
export type CapabilitySet = z.infer<typeof CapabilitySetSchema>;
export type AdapterDescriptor = z.infer<typeof AdapterDescriptorSchema>;
export type AdapterBinding = z.infer<typeof AdapterBindingSchema>;
export type InterventionDescriptor = z.infer<typeof InterventionDescriptorSchema>;
export type CausalDimension = z.infer<typeof CausalDimensionSchema>;

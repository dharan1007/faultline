import { z } from 'zod';
import {
  AdapterBindingSchema,
  CapabilitySetSchema,
  CausalDimensionSchema,
} from './capabilities.js';
import {
  DigestSchema,
  IdentifierSchema,
  OracleResultSchema,
  RevisionSchema,
  SafetyClassSchema,
  SchemaVersionSchema,
  TargetKindSchema,
  TimestampSchema,
} from './primitives.js';

export const TargetDescriptorSchema = z.object({
  kind: TargetKindSchema,
  targetId: IdentifierSchema,
  snapshotId: DigestSchema,
  safety: SafetyClassSchema,
  url: z.string().url().optional(),
  artifactRef: IdentifierSchema.optional(),
  data: z.unknown().optional(),
}).strict();

const BrowserDescriptorSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
}).strict();

export const EnvironmentSnapshotSchema = z.object({
  browser: BrowserDescriptorSchema.nullable(),
  route: z.string().nullable(),
  buildId: z.string().nullable(),
  adapterVersions: z.record(z.string(), z.string()),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  data: z.unknown().optional(),
}).strict();

export const JourneyActionSchema = z.object({
  actionId: IdentifierSchema,
  kind: z.enum(['navigate', 'click', 'fill', 'select', 'press', 'submit', 'wait_for_condition', 'upload_file', 'adapter_action']),
  locator: z.string().optional(),
  data: z.unknown().optional(),
  redacted: z.boolean().optional(),
}).strict();

export const ReproductionJourneySchema = z.object({
  revision: RevisionSchema,
  actions: z.array(JourneyActionSchema),
}).strict();

const OracleBase = { revision: RevisionSchema };

const DomExistsOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('dom_exists'),
  config: z.object({ selector: z.string().min(1), equals: z.boolean() }).strict(),
}).strict();

const DomPropertyOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('dom_property'),
  config: z.object({ selector: z.string().min(1), property: z.string().min(1), equals: z.unknown() }).strict(),
}).strict();

const DomTextOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('dom_text'),
  config: z.object({ selector: z.string().min(1), equals: z.string() }).strict(),
}).strict();

const ComputedStyleOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('computed_style'),
  config: z.object({ selector: z.string().min(1), property: z.string().min(1), equals: z.string() }).strict(),
}).strict();

const RuntimeErrorOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('runtime_error'),
  config: z.object({ signature: z.string().min(1), exact: z.boolean().default(false) }).strict(),
}).strict();

const UnhandledRejectionOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('unhandled_rejection'),
  config: z.object({ signature: z.string().min(1), exact: z.boolean().default(false) }).strict(),
}).strict();

const HttpOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('http'),
  config: z.object({
    urlPattern: z.string().min(1),
    method: z.string().min(1).optional(),
    status: z.number().int().min(100).max(599).optional(),
    predicate: z.unknown().optional(),
  }).strict(),
}).strict();

const MissingRequestOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('request_presence'),
  config: z.object({ urlPattern: z.string().min(1), expected: z.boolean() }).strict(),
}).strict();

const RouteOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('route'),
  config: z.object({ equals: z.string().min(1) }).strict(),
}).strict();

const VisualThresholdOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('visual_threshold'),
  config: z.object({ baselineArtifactRef: IdentifierSchema, maxDifference: z.number().min(0) }).strict(),
}).strict();

const PerformanceThresholdOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('performance_threshold'),
  config: z.object({
    metric: z.string().min(1),
    operator: z.enum(['lt', 'lte', 'gt', 'gte']),
    threshold: z.number().finite(),
    sampleCount: z.number().int().positive().default(3),
  }).strict(),
}).strict();

const OtelSpanOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('otel_span'),
  config: z.object({
    spanName: z.string().optional(),
    status: z.string().optional(),
    attribute: z.object({ key: z.string().min(1), equals: z.unknown() }).strict().optional(),
  }).strict(),
}).strict();

const AdapterDefinedOracleSchema = z.object({
  ...OracleBase,
  kind: z.literal('adapter_defined'),
  adapterId: IdentifierSchema,
  oracleType: IdentifierSchema,
  config: z.unknown(),
}).strict();

export const FailureOracleSchema = z.discriminatedUnion('kind', [
  DomExistsOracleSchema,
  DomPropertyOracleSchema,
  DomTextOracleSchema,
  ComputedStyleOracleSchema,
  RuntimeErrorOracleSchema,
  UnhandledRejectionOracleSchema,
  HttpOracleSchema,
  MissingRequestOracleSchema,
  RouteOracleSchema,
  VisualThresholdOracleSchema,
  PerformanceThresholdOracleSchema,
  OtelSpanOracleSchema,
  AdapterDefinedOracleSchema,
]);

export const BaselineRunSchema = z.object({
  baselineId: IdentifierSchema,
  journeyRevision: RevisionSchema,
  oracleRevision: RevisionSchema,
  targetSnapshotId: DigestSchema,
  environmentDigest: DigestSchema,
  adapterVersions: z.record(z.string(), z.string()),
  result: OracleResultSchema,
  evidenceRefs: z.array(IdentifierSchema),
  at: TimestampSchema,
}).strict();

export const ObservationSchema = z.object({
  observationId: IdentifierSchema,
  type: IdentifierSchema,
  source: IdentifierSchema,
  at: TimestampSchema,
  data: z.unknown().optional(),
}).strict();

export const ObservationIndexSchema = z.object({
  items: z.record(z.string(), ObservationSchema),
}).strict();

export const ExperimentRecordSchema = z.object({
  experimentId: IdentifierSchema,
  operationId: IdentifierSchema.optional(),
  dimensionIds: z.array(IdentifierSchema),
  oracleResult: OracleResultSchema,
  receiptDigest: DigestSchema,
  revision: RevisionSchema,
  evidenceRefs: z.array(IdentifierSchema),
}).strict();

export const CausalGraphNodeSchema = z.object({
  id: IdentifierSchema,
  kind: IdentifierSchema,
  evidenceRefs: z.array(IdentifierSchema),
  data: z.unknown().optional(),
}).strict();

export const CausalGraphEdgeSchema = z.object({
  id: IdentifierSchema,
  from: IdentifierSchema,
  to: IdentifierSchema,
  kind: z.enum(['occurred_before', 'triggered', 'observed_in', 'depends_on', 'intervened_on', 'preserved_failure', 'removed_failure', 'unresolved', 'derived_from']),
  evidenceRefs: z.array(IdentifierSchema),
  experimentId: IdentifierSchema.optional(),
}).strict();

export const CausalGraphSchema = z.object({
  nodes: z.record(z.string(), CausalGraphNodeSchema),
  edges: z.record(z.string(), CausalGraphEdgeSchema),
}).strict();

export const ArtifactSchema = z.object({
  artifactId: IdentifierSchema,
  kind: IdentifierSchema,
  digest: DigestSchema,
  metadata: z.unknown().optional(),
}).strict();

export const ArtifactIndexSchema = z.object({
  items: z.record(z.string(), ArtifactSchema),
}).strict();

export const DebugSessionSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  sessionId: IdentifierSchema,
  revision: RevisionSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  target: TargetDescriptorSchema,
  environment: EnvironmentSnapshotSchema,
  adapters: z.array(AdapterBindingSchema),
  capabilities: CapabilitySetSchema,
  journey: ReproductionJourneySchema,
  oracle: FailureOracleSchema,
  baselines: z.array(BaselineRunSchema),
  observations: ObservationIndexSchema,
  dimensions: z.array(CausalDimensionSchema),
  experiments: z.array(ExperimentRecordSchema),
  causalGraph: CausalGraphSchema,
  pins: z.object({ dimensionIds: z.array(IdentifierSchema) }).strict(),
  artifacts: ArtifactIndexSchema,
  provenance: z.object({ createdBy: IdentifierSchema, sourceRefs: z.array(IdentifierSchema) }).strict(),
}).strict();

export type TargetDescriptor = z.infer<typeof TargetDescriptorSchema>;
export type EnvironmentSnapshot = z.infer<typeof EnvironmentSnapshotSchema>;
export type JourneyAction = z.infer<typeof JourneyActionSchema>;
export type ReproductionJourney = z.infer<typeof ReproductionJourneySchema>;
export type FailureOracle = z.infer<typeof FailureOracleSchema>;
export type BaselineRun = z.infer<typeof BaselineRunSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type ExperimentRecord = z.infer<typeof ExperimentRecordSchema>;
export type CausalGraph = z.infer<typeof CausalGraphSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type DebugSession = z.infer<typeof DebugSessionSchema>;

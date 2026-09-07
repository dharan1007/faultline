# FAULTLINE V3.1 Protocol + Session Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V3 protocol/session kernel and legacy compatibility layer so FAULTLINE can represent revisioned modern debug sessions, negotiate adapter capabilities, record causal evidence, enforce safe operation semantics, and preserve the existing source reducer behind a `legacy-case` adapter.

**Architecture:** V3.1 is introduced as strict TypeScript workspace packages alongside the current production static application. The new kernel is independent of browser UI/runtime code and does not replace production yet. A versioned protocol package owns runtime schemas and cross-surface contracts; a session package owns authoritative revision/idempotency state; an engine package owns evidence-backed causal graph and receipt rules; an adapter package wraps the existing reducer through the new adapter contract. Existing browser/runtime tests stay mandatory so V3.1 cannot regress the deployed product.

**Tech Stack:** Node.js 24 LTS, npm workspaces, TypeScript 7, Zod 4.5, `tsx` 4.23, Node `node:test`, Node `crypto`, existing JavaScript reducer/runtime tests.

**Spec:** `docs/superpowers/specs/2026-09-07-faultline-v3-causal-platform-design.md`

## Global Constraints

- Keep the current `faultline-webmcp` Vercel production application deployable throughout V3.1.
- Do not merge the rejected `feat/product-workspace-v2` branch into V3.
- New V3 code uses strict TypeScript and runtime validation at every external boundary.
- The canonical V3 object is `DebugSession`; `html + css + js + oracle` exists only through `legacy-case` compatibility.
- `PASS | FAIL | UNRESOLVED` is an oracle result and must never be conflated with protocol/transport operation success.
- Every mutation is revision guarded; stale writes fail before mutation.
- Idempotency keys may replay the same logical mutation but may never be reused with different request content.
- Causal edges that claim preservation/removal of failure require experiment provenance.
- Unknown mutation capabilities are never executed.
- Existing reducer, sandbox, cancellation, revision-lineage and WebMCP regressions remain green.
- V3.1 contains no local coordinator, Playwright capture service, framework instrumentation, Next.js product migration, cloud execution, or destructive target mutation.
- CI runs on Node 24 LTS; the existing production deployment workflow is not changed by V3.1 unless needed only to keep existing tests green.

---

## File Structure

### Root workspace

- Modify `package.json` — preserve current scripts/dependencies, add npm workspaces and V3 scripts/dependencies.
- Create `tsconfig.base.json` — strict TypeScript 7 compiler defaults shared by V3 packages.
- Modify `.github/workflows/ci.yml` — run V3 typecheck/tests in addition to the existing production suite.

### `packages/protocol`

- Create `packages/protocol/package.json` — workspace package metadata/exports.
- Create `packages/protocol/tsconfig.json` — package compiler config.
- Create `packages/protocol/src/primitives.ts` — revision IDs, digests, oracle results, timestamps, identifiers.
- Create `packages/protocol/src/session.ts` — `DebugSession` and related runtime schemas/types.
- Create `packages/protocol/src/capabilities.ts` — adapter/capability/intervention contracts.
- Create `packages/protocol/src/operations.ts` — request envelopes, normalized operation results, operation status.
- Create `packages/protocol/src/errors.ts` — typed protocol errors and error normalization.
- Create `packages/protocol/src/index.ts` — public package surface.
- Create `packages/protocol/test/schema.test.ts` — schema and protocol contract tests.

### `packages/session`

- Create `packages/session/package.json`.
- Create `packages/session/tsconfig.json`.
- Create `packages/session/src/repository.ts` — repository interface and stored-session record type.
- Create `packages/session/src/memory-repository.ts` — deterministic test/reference repository.
- Create `packages/session/src/kernel.ts` — revision-guarded authoritative session mutation kernel.
- Create `packages/session/src/idempotency.ts` — request fingerprinting and replay records.
- Create `packages/session/src/operations.ts` — explicit long-running operation lifecycle/cancellation state.
- Create `packages/session/src/index.ts`.
- Create `packages/session/test/kernel.test.ts`.
- Create `packages/session/test/operations.test.ts`.

### `packages/engine`

- Create `packages/engine/package.json`.
- Create `packages/engine/tsconfig.json`.
- Create `packages/engine/src/canonical-json.ts` — deterministic canonical serialization for digests.
- Create `packages/engine/src/receipts.ts` — receipt binding and SHA-256 digest generation/verification.
- Create `packages/engine/src/causal-graph.ts` — evidence-backed graph mutation/invariants.
- Create `packages/engine/src/index.ts`.
- Create `packages/engine/test/receipts.test.ts`.
- Create `packages/engine/test/causal-graph.test.ts`.

### `packages/adapters/legacy-case`

- Create `packages/adapters/legacy-case/package.json`.
- Create `packages/adapters/legacy-case/tsconfig.json`.
- Create `packages/adapters/legacy-case/src/legacy-schema.ts` — runtime-validated legacy case/artifact contract.
- Create `packages/adapters/legacy-case/src/session-conversion.ts` — convert legacy case to V3 session/artifact binding.
- Create `packages/adapters/legacy-case/src/adapter.ts` — V3 adapter over current reducer functions and injected legacy runner.
- Create `packages/adapters/legacy-case/src/index.ts`.
- Create `packages/adapters/legacy-case/test/adapter.test.ts`.
- Create `packages/adapters/legacy-case/test/compatibility.test.ts`.

### Documentation

- Create `docs/V3_PROTOCOL.md` — stable V3.1 protocol/kernel public contract and declared limitations.

---

### Task 1: Establish the strict TypeScript workspace without changing production runtime

**Files:**
- Modify: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Test: `packages/protocol/test/toolchain.test.ts`

**Interfaces:**
- Consumes: existing root npm scripts and production source.
- Produces: npm workspace resolution for `@faultline/protocol`, `@faultline/session`, `@faultline/engine`, and `@faultline/adapter-legacy-case`; root commands `v3:typecheck` and `v3:test`.

- [ ] **Step 1: Write the failing workspace/toolchain test**

Create `packages/protocol/test/toolchain.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootPackage = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
const tsconfig = JSON.parse(await readFile(new URL('../../../tsconfig.base.json', import.meta.url), 'utf8'));

test('V3 workspace keeps production scripts and enables strict TypeScript packages', () => {
  assert.equal(rootPackage.scripts.build, 'node scripts-build.mjs');
  assert.match(rootPackage.scripts['v3:typecheck'], /tsc/);
  assert.match(rootPackage.scripts['v3:test'], /tsx/);
  assert.deepEqual(rootPackage.workspaces, ['packages/*', 'packages/adapters/*']);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
  assert.equal(tsconfig.compilerOptions.module, 'NodeNext');
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npx tsx --test packages/protocol/test/toolchain.test.ts
```

Expected: FAIL because `tsconfig.base.json`, workspace metadata, and V3 scripts do not exist.

- [ ] **Step 3: Add workspace/toolchain configuration**

Modify root `package.json` while preserving all existing `test`, `check`, `build`, and `test:browser` commands. Add:

```json
{
  "workspaces": ["packages/*", "packages/adapters/*"],
  "engines": { "node": ">=24.20 <27" },
  "scripts": {
    "v3:typecheck": "tsc -b packages/protocol packages/session packages/engine packages/adapters/legacy-case",
    "v3:test": "tsx --test packages/protocol/test/*.test.ts packages/session/test/*.test.ts packages/engine/test/*.test.ts packages/adapters/legacy-case/test/*.test.ts"
  },
  "dependencies": {
    "zod": "^4.5.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.23.13",
    "typescript": "^7.0.2"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

Create protocol package configs with `type: module`, private workspace version `0.1.0`, `src/index.ts` export, and `tsconfig.json` extending the root config with `rootDir: "src"`, `outDir: "dist"`, `include: ["src/**/*.ts"]`.

- [ ] **Step 4: Install and verify GREEN without touching existing runtime behavior**

Run:

```bash
npm install --no-audit --no-fund
npx tsx --test packages/protocol/test/toolchain.test.ts
npm test
npm run check
npm run build
```

Expected: toolchain test PASS and all existing production deterministic/syntax/build gates PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json packages/protocol

git commit -m "build: establish strict V3 TypeScript workspace"
```

---

### Task 2: Define the versioned V3 protocol and runtime schemas

**Files:**
- Create: `packages/protocol/src/primitives.ts`
- Create: `packages/protocol/src/session.ts`
- Create: `packages/protocol/src/capabilities.ts`
- Create: `packages/protocol/src/operations.ts`
- Create: `packages/protocol/src/errors.ts`
- Create: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/schema.test.ts`

**Interfaces:**
- Produces: `DebugSessionSchema`, `DebugSession`, `TargetDescriptorSchema`, `FailureOracleSchema`, `CausalDimensionSchema`, `AdapterDescriptorSchema`, `CapabilitySetSchema`, `MutationEnvelopeSchema`, `OperationResultSchema`, `ProtocolError`, `parseDebugSession`.
- Consumers: all later V3 packages.

- [ ] **Step 1: Write failing protocol schema tests**

Create tests that require:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DebugSessionSchema,
  MutationEnvelopeSchema,
  OperationResultSchema,
  ProtocolError,
  parseDebugSession,
} from '../src/index.js';

const validSession = {
  schemaVersion: '3.1.0',
  sessionId: 'ses_01JFAULTLINE00000000000000',
  revision: 'r1',
  createdAt: '2026-09-07T10:00:00.000Z',
  updatedAt: '2026-09-07T10:00:00.000Z',
  target: { kind:'legacy_case', targetId:'target_legacy_1', snapshotId:'sha256:abc', safety:'reversible', artifactRef:'artifact_legacy_case' },
  environment: { browser:null, route:null, buildId:null, adapterVersions:{} },
  adapters: [],
  capabilities: { ids:[] },
  journey: { revision:'r1', actions:[] },
  oracle: { revision:'r1', kind:'dom_exists', config:{ selector:'#app', equals:true } },
  baselines: [],
  observations: { items:{} },
  dimensions: [],
  experiments: [],
  causalGraph: { nodes:{}, edges:{} },
  pins: { dimensionIds:[] },
  artifacts: { items:{} },
  provenance: { createdBy:'test', sourceRefs:[] }
};

test('DebugSession accepts a valid canonical session and rejects invalid revision/oracle states', () => {
  assert.equal(DebugSessionSchema.parse(validSession).revision, 'r1');
  assert.throws(() => DebugSessionSchema.parse({...validSession, revision:'1'}));
  assert.throws(() => DebugSessionSchema.parse({...validSession, oracle:{revision:'r1',kind:'unknown',config:{}}}));
});

test('mutation envelope requires explicit session and expected revision', () => {
  assert.equal(MutationEnvelopeSchema.parse({requestId:'req_1',idempotencyKey:'idem_1',sessionId:validSession.sessionId,expectedRevision:'r1'}).expectedRevision, 'r1');
  assert.throws(() => MutationEnvelopeSchema.parse({requestId:'req_1'}));
});

test('operation result stays distinct from oracle PASS/FAIL/UNRESOLVED', () => {
  assert.equal(OperationResultSchema.parse({kind:'ok',operationId:'op_1',revision:'r1'}).kind, 'ok');
  assert.throws(() => OperationResultSchema.parse({kind:'FAIL'}));
});

test('parseDebugSession returns normalized protocol error on invalid external data', () => {
  assert.throws(() => parseDebugSession({}), (error: unknown) => error instanceof ProtocolError && error.code === 'invalid_request');
});
```

- [ ] **Step 2: Run RED**

```bash
npx tsx --test packages/protocol/test/schema.test.ts
```

Expected: FAIL because protocol exports do not exist.

- [ ] **Step 3: Implement protocol primitives and schemas**

Use Zod runtime schemas with inferred TypeScript types. Define exact enums:

```ts
export const OracleResultSchema = z.enum(['PASS','FAIL','UNRESOLVED']);
export const SafetyClassSchema = z.enum(['read_only','reversible','destructive']);
export const DeterminismSchema = z.enum(['deterministic','bounded_variance','unknown']);
export const TargetKindSchema = z.enum(['local_url','staging_url','live_url_capture','playwright_trace','har','ci_failure','otel_trace','legacy_case']);
export const ProtocolErrorCodeSchema = z.enum([
  'conflict','invalid_request','capability_missing','safety_approval_required',
  'target_dirty','unresolved','cancelled','internal_error'
]);
```

`FailureOracleSchema` must be a discriminated union for the initial oracle kinds from the V3 spec; adapter-defined oracle uses `{ kind:'adapter_defined', adapterId, oracleType, config }` and remains typed as unknown config rather than executable code.

`DebugSessionSchema` must be `.strict()` at authoritative top-level boundaries. Observation payloads/artifact metadata may preserve typed unknown data under explicit `data` fields.

- [ ] **Step 4: Implement normalized protocol errors**

`ProtocolError` carries `code`, `message`, optional `details`, and optional `cause`, but `toJSON()` emits only safe protocol fields. `parseDebugSession()` catches Zod errors and throws `ProtocolError('invalid_request', ...)` with issues but no secret values.

- [ ] **Step 5: Run protocol GREEN/typecheck**

```bash
npx tsx --test packages/protocol/test/schema.test.ts
npm run v3:typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol

git commit -m "feat: define V3 debug session protocol"
```

---

### Task 3: Build the authoritative revisioned session kernel with idempotency

**Files:**
- Create: `packages/session/package.json`
- Create: `packages/session/tsconfig.json`
- Create: `packages/session/src/repository.ts`
- Create: `packages/session/src/memory-repository.ts`
- Create: `packages/session/src/idempotency.ts`
- Create: `packages/session/src/kernel.ts`
- Create: `packages/session/src/index.ts`
- Test: `packages/session/test/kernel.test.ts`

**Interfaces:**
- Consumes: `DebugSession`, `MutationEnvelope`, protocol errors.
- Produces: `SessionRepository`, `MemorySessionRepository`, `SessionKernel`, `SessionMutation<T>`, `MutationReceipt<T>`.

`SessionKernel.mutate` signature:

```ts
mutate<T>(
  envelope: MutationEnvelope,
  kind: string,
  input: unknown,
  reducer: (current: Readonly<DebugSession>) => { next: DebugSession; result: T }
): Promise<MutationReceipt<T>>
```

- [ ] **Step 1: Write failing session-kernel tests**

Require these behaviors:

```ts
const repo = new MemorySessionRepository();
const kernel = new SessionKernel(repo);
await repo.create(validSession);

const first = await kernel.mutate(env('r1','idem-a'),'set_pin',{id:'dim-1'}, session => ({
  next:{...session,pins:{dimensionIds:['dim-1']}},
  result:{pinned:'dim-1'}
}));
assert.equal(first.revision,'r2');

await assert.rejects(
  kernel.mutate(env('r1','idem-b'),'set_pin',{id:'dim-2'}, () => { throw new Error('must not execute'); }),
  (error: unknown) => error instanceof ProtocolError && error.code === 'conflict'
);

const replay = await kernel.mutate(env('r1','idem-a'),'set_pin',{id:'dim-1'}, () => { throw new Error('idempotent replay must not rerun reducer'); });
assert.deepEqual(replay, first);

await assert.rejects(
  kernel.mutate(env('r1','idem-a'),'set_pin',{id:'different'}, () => { throw new Error('must not execute'); }),
  (error: unknown) => error instanceof ProtocolError && error.code === 'conflict'
);
```

Also test concurrent mutations with the same expected revision: exactly one commits; the other receives `conflict`.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test packages/session/test/kernel.test.ts
```

Expected: FAIL because session package does not exist.

- [ ] **Step 3: Implement repository abstraction**

`SessionRepository` must expose atomic compare-and-swap semantics, not `get()` followed by `set()`:

```ts
export interface SessionRepository {
  create(session: DebugSession): Promise<void>;
  get(sessionId: string): Promise<StoredSession | null>;
  compareAndSwap(args: {
    sessionId: string;
    expectedRevision: string;
    next: DebugSession;
    mutation: StoredMutationRecord;
  }): Promise<'committed' | 'conflict'>;
  getIdempotency(sessionId: string, key: string): Promise<StoredIdempotencyRecord | null>;
}
```

The in-memory repository serializes `compareAndSwap` per session via a promise chain/mutex so the concurrency test is deterministic and actually exercises atomicity.

- [ ] **Step 4: Implement canonical request fingerprinting**

`fingerprintMutation(kind,input)` uses deterministic key-sorted JSON and SHA-256. The stored idempotency record binds key + fingerprint + result + committed revision.

Reusing an idempotency key with a different fingerprint throws `conflict` before reducer execution.

- [ ] **Step 5: Implement `SessionKernel.mutate`**

Rules:

1. Validate envelope.
2. Check idempotency record first.
3. Load current session.
4. Reject stale `expectedRevision` before reducer execution.
5. Clone/freeze reducer input so reducers cannot mutate repository state by reference.
6. Require reducer output to preserve `sessionId`, increment revision by exactly one, and validate through `DebugSessionSchema`.
7. Commit through repository compare-and-swap.
8. Persist mutation/idempotency receipt atomically with the state change.
9. Return committed revision/result.

`updatedAt` is supplied by the kernel clock dependency, not arbitrary reducer input. Tests use a fixed clock.

- [ ] **Step 6: Run GREEN and typecheck**

```bash
npx tsx --test packages/session/test/kernel.test.ts
npm run v3:typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/session packages/protocol/package.json tsconfig.base.json

git commit -m "feat: add revisioned V3 session kernel"
```

---

### Task 4: Implement capability negotiation and adapter contracts

**Files:**
- Modify: `packages/protocol/src/capabilities.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/session/src/capability-registry.ts`
- Modify: `packages/session/src/index.ts`
- Create: `packages/session/test/capabilities.test.ts`

**Interfaces:**
- Produces: `FaultlineAdapter`, `CapabilityDescriptor`, `AdapterDescriptor`, `CapabilityRegistry`, `CapabilityResolution`.

Adapter contract:

```ts
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
```

- [ ] **Step 1: Write failing capability tests**

Test that:

- duplicate capability IDs from the same adapter/version are deduplicated;
- same capability ID with incompatible descriptors is rejected;
- a requested capability absent from registry yields `capability_missing`;
- `destructive` capability resolution returns `safety_approval_required` unless an exact approval binding is present;
- unknown mutation capability is never resolved as executable.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test packages/session/test/capabilities.test.ts
```

- [ ] **Step 3: Implement capability schemas and registry**

`CapabilityDescriptor` includes:

```ts
{
  id: string;
  version: string;
  adapterId: string;
  mode: 'observe' | 'replay' | 'intervene';
  safety: 'read_only' | 'reversible' | 'destructive';
  determinism: 'deterministic' | 'bounded_variance' | 'unknown';
}
```

`CapabilityRegistry.resolve()` requires exact capability ID and selected adapter binding. It never falls back from an unknown mutation ID to a generic adapter.

- [ ] **Step 4: Run GREEN/typecheck**

```bash
npx tsx --test packages/session/test/capabilities.test.ts
npm run v3:typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/protocol packages/session

git commit -m "feat: add capability-negotiated adapter contract"
```

---

### Task 5: Add explicit long-running operation lifecycle and cancellation semantics

**Files:**
- Modify: `packages/protocol/src/operations.ts`
- Create: `packages/session/src/operations.ts`
- Modify: `packages/session/src/index.ts`
- Test: `packages/session/test/operations.test.ts`

**Interfaces:**
- Produces: `OperationRegistry`, `OperationRecord`, `OperationState`, `OperationHandle`.

`OperationState` exact values:

```ts
'queued' | 'running' | 'cancelling' | 'cancelled' | 'succeeded' | 'failed'
```

- [ ] **Step 1: Write failing operation tests**

Require:

```ts
const ops = new OperationRegistry({ clock: fixedClock });
const handle = ops.begin({sessionId:'ses_1',kind:'reduction',boundRevision:'r4'});
assert.equal(ops.inspect(handle.operationId).state,'running');

handle.cancel('user_request');
assert.equal(ops.inspect(handle.operationId).state,'cancelling');
assert.equal(handle.signal.aborted,true);

ops.markCancelled(handle.operationId);
assert.equal(ops.inspect(handle.operationId).state,'cancelled');
assert.throws(() => ops.succeed(handle.operationId,{ok:true}), /INVALID_OPERATION_TRANSITION/);
```

Also verify cancellation of operation A does not abort B, pre-aborted caller signals propagate immediately, and terminal records retain bound session revision.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test packages/session/test/operations.test.ts
```

- [ ] **Step 3: Implement operation state machine**

Allowed transitions:

```text
queued -> running | cancelled
running -> cancelling | succeeded | failed
cancelling -> cancelled | failed
terminal -> no transitions
```

Each operation owns an `AbortController`; optional caller signal is bridged with listener cleanup after terminal state. Never use a global abort controller.

- [ ] **Step 4: Run GREEN/typecheck**

```bash
npx tsx --test packages/session/test/operations.test.ts
npm run v3:typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/protocol packages/session

git commit -m "feat: add explicit V3 operation lifecycle"
```

---

### Task 6: Add tamper-evident receipts and evidence-backed causal graph invariants

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/canonical-json.ts`
- Create: `packages/engine/src/receipts.ts`
- Create: `packages/engine/src/causal-graph.ts`
- Create: `packages/engine/src/index.ts`
- Test: `packages/engine/test/receipts.test.ts`
- Test: `packages/engine/test/causal-graph.test.ts`

**Interfaces:**
- Produces: `canonicalJson`, `sha256Digest`, `createExperimentReceipt`, `verifyExperimentReceipt`, `CausalGraphStore`.

- [ ] **Step 1: Write failing receipt tests**

Test that canonical object key order produces the same digest, array order remains meaningful, and modifying target/oracle/journey/adapter/result fields invalidates receipt verification.

Receipt binding must include:

```ts
{
  receiptVersion: '1';
  experimentId: string;
  sessionId: string;
  sessionRevision: string;
  targetSnapshotId: string;
  journeyRevision: string;
  oracleRevision: string;
  adapterBindings: Array<{adapterId:string;version:string}>;
  dimensionIds: string[];
  interventionDigest: string;
  oracleResult: 'PASS'|'FAIL'|'UNRESOLVED';
  evidenceDigests: string[];
  restoration: 'verified'|'not_required'|'failed'|'unknown';
  createdAt: string;
}
```

- [ ] **Step 2: Run receipt RED**

```bash
npx tsx --test packages/engine/test/receipts.test.ts
```

- [ ] **Step 3: Implement canonical JSON + receipt digesting**

`canonicalJson` recursively sorts object keys, preserves array order, rejects unsupported values (`undefined`, functions, symbols, non-finite numbers), and serializes only JSON values. `createExperimentReceipt` returns `{ body, digest:'sha256:<hex>' }`.

- [ ] **Step 4: Write causal graph RED tests**

Require that:

- observation nodes/`occurred-before` edges can be added with observation provenance;
- `preserved-failure`, `removed-failure`, and `unresolved` edges are rejected without an existing experiment receipt reference;
- edges cannot reference unknown nodes;
- duplicate edge IDs with different content are rejected;
- graph export is deterministic.

- [ ] **Step 5: Implement `CausalGraphStore`**

The graph store validates through protocol graph schemas and has explicit methods:

```ts
addNode(node: CausalNode): void;
addObservationEdge(edge: ObservationEdge): void;
addExperimentEdge(edge: ExperimentEdge, receipt: VerifiedExperimentReceipt): void;
export(): CausalGraph;
```

It does not infer causal edges from correlation.

- [ ] **Step 6: Run GREEN/typecheck**

```bash
npx tsx --test packages/engine/test/*.test.ts
npm run v3:typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/engine packages/protocol

git commit -m "feat: bind causal evidence to tamper-evident receipts"
```

---

### Task 7: Wrap the existing reducer as the V3 `legacy-case` adapter

**Files:**
- Create: `packages/adapters/legacy-case/package.json`
- Create: `packages/adapters/legacy-case/tsconfig.json`
- Create: `packages/adapters/legacy-case/src/legacy-schema.ts`
- Create: `packages/adapters/legacy-case/src/session-conversion.ts`
- Create: `packages/adapters/legacy-case/src/adapter.ts`
- Create: `packages/adapters/legacy-case/src/index.ts`
- Test: `packages/adapters/legacy-case/test/adapter.test.ts`
- Test: `packages/adapters/legacy-case/test/compatibility.test.ts`
- Read-only dependency: `src/reducer-engine.js`

**Interfaces:**
- Consumes: current `semanticUnits`, `removeUnits`, `ddminReduce`, new `FaultlineAdapter` protocol.
- Produces: `LegacyCaseSchema`, `LegacyCaseAdapter`, `legacyCaseToSession`, `LegacyRunner`.

`LegacyRunner`:

```ts
export type LegacyRunner = (
  legacyCase: LegacyCase,
  signal?: AbortSignal
) => Promise<{ status:'PASS'|'FAIL'|'UNRESOLVED'; evidence?: Record<string, unknown> }>;
```

- [ ] **Step 1: Write failing adapter detection/capability tests**

Require `descriptor()` to return stable ID/version and these capability IDs:

```text
source.reduce.legacy
legacy.capture.source
legacy.replay.case
legacy.intervene.unit
```

Detection returns match only for `target.kind === 'legacy_case'` with a valid referenced legacy artifact.

- [ ] **Step 2: Write failing session conversion test**

`legacyCaseToSession()` must:

- validate the four-field legacy payload;
- put the payload in a digest-bound inline JSON artifact;
- create `target.kind='legacy_case'` referencing that artifact;
- preserve the legacy oracle semantics in the V3 oracle representation;
- begin at `r1`;
- expose only legacy capabilities rather than pretending framework/network/server capabilities exist.

- [ ] **Step 3: Run RED**

```bash
npx tsx --test packages/adapters/legacy-case/test/adapter.test.ts
```

- [ ] **Step 4: Implement dimension enumeration from current reducer**

For each `semanticUnits(axis, source)` unit, return a `CausalDimension`:

```ts
{
  id:`legacy:${unit.id}`,
  adapterId:'legacy-case',
  kind:`legacy_source_${unit.kind}`,
  label:`${axis} ${unit.kind}`,
  dependencies: unit.parentId ? [`legacy:${unit.parentId}`] : [],
  conflicts:[],
  safety:'reversible',
  determinism:'deterministic',
  intervention:{type:'legacy_remove_unit',axis,unitId:unit.id},
  evidenceRefs:[artifactId]
}
```

Do not claim AST/component semantics beyond what the current reducer actually exposes.

- [ ] **Step 5: Implement reversible in-memory intervention lease**

The adapter context owns a cloned working legacy case. `intervene()` validates the dimension, captures the pre-intervention case digest, removes the exact unit through existing `removeUnits`, and returns a lease containing before/after digests and a private restoration token. `restore()` returns the exact prior case and verifies its digest. Invalid/unknown dimensions return `capability_missing`/`invalid_request`; aborted signals return `cancelled` without partial mutation.

- [ ] **Step 6: Implement replay through injected runner**

`replay()` runs the working legacy case through the injected `LegacyRunner`, validates oracle result, and never treats runner exceptions as PASS/FAIL; normalize infrastructure exceptions to protocol `unresolved` unless already a typed cancellation/error.

- [ ] **Step 7: Write compatibility tests against current reducer behavior**

Tests must prove:

- semantic unit IDs/text from the adapter match direct `semanticUnits` output;
- removing a dimension produces the same source as direct `removeUnits`;
- pin/dependency metadata never claims nonexistent hierarchy;
- a fake failing runner can reduce a legacy frontier while preserving FAIL;
- restoring an intervention returns byte-identical legacy source;
- the current production reducer tests remain unchanged and pass.

- [ ] **Step 8: Run GREEN/typecheck + legacy regression**

```bash
npx tsx --test packages/adapters/legacy-case/test/*.test.ts
npm run v3:typecheck
npm test
```

- [ ] **Step 9: Commit**

```bash
git add packages/adapters/legacy-case

git commit -m "feat: preserve current reducer as V3 legacy adapter"
```

---

### Task 8: Integrate V3.1 into CI without weakening current production gates

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Test: existing CI and all V3 tests.

**Interfaces:**
- Produces: one CI verification path that runs both deployed-product regressions and V3.1 kernel gates.

- [ ] **Step 1: Write a static CI regression before changing workflow**

Create `packages/protocol/test/ci-contract.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('CI gates both current production and V3 kernel', () => {
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /npm run v3:typecheck/);
  assert.match(workflow, /npm run v3:test/);
});
```

- [ ] **Step 2: Run RED**

```bash
npx tsx --test packages/protocol/test/ci-contract.test.ts
```

Expected: FAIL because V3 gates are absent.

- [ ] **Step 3: Add V3 CI gates**

Keep all existing production steps and insert after `npm install`/before browser installation:

```yaml
- run: npm run v3:typecheck
- run: npm run v3:test
```

Do not remove `npm test`, `npm run check`, `npm run build`, Chromium installation, or `npm run test:browser`.

- [ ] **Step 4: Run the complete local-equivalent gate**

```bash
npm install --no-audit --no-fund
npm run v3:typecheck
npm run v3:test
npm test
npm run check
npm run build
npx playwright install chromium
npm run test:browser
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json packages/protocol/test/ci-contract.test.ts

git commit -m "ci: gate V3 kernel beside production regressions"
```

---

### Task 9: Document the V3.1 contract and verify the entire increment

**Files:**
- Create: `docs/V3_PROTOCOL.md`
- Modify only if tests require: `README.md`

**Interfaces:**
- Documents public contracts produced by Tasks 2–8.

- [ ] **Step 1: Write protocol documentation with exact supported scope**

`docs/V3_PROTOCOL.md` must explicitly document:

- `DebugSession` is canonical;
- schema version `3.1.0`;
- revision format and mutation envelope;
- operation-result vs oracle-result distinction;
- idempotency key semantics;
- capability negotiation and safety classes;
- adapter contract;
- causal receipt binding fields;
- legacy-case capability set;
- what V3.1 does **not** yet provide: local coordinator, browser capture, artifact adapters, framework deep integration, MCP server, V3 web UI.

Include a minimal valid session JSON example that passes `DebugSessionSchema`.

- [ ] **Step 2: Add documentation drift test**

Extend protocol tests to read `docs/V3_PROTOCOL.md` and assert it contains `3.1.0`, `DebugSession`, `PASS | FAIL | UNRESOLVED`, `legacy-case`, and the exact four capability IDs exported by the legacy adapter. This prevents silently stale docs during V3.1.

- [ ] **Step 3: Run fresh final verification**

Run from a clean install/worktree:

```bash
npm install --no-audit --no-fund
npm run v3:typecheck
npm run v3:test
npm test
npm run check
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

Then run:

```bash
git diff --check
git status --short
```

Expected: every test passes; no generated `dist/`, secrets, temporary artifacts, or untracked build output are committed unless explicitly intended.

- [ ] **Step 4: Verify no production deployment mutation occurred**

Confirm:

```bash
git rev-parse origin/main
git rev-parse origin/production
```

Both should remain on the last verified production release until a later V3 web release is explicitly merged/deployed. V3.1 itself is a kernel increment and does not replace the current public site.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/V3_PROTOCOL.md packages/protocol/test

git commit -m "docs: define FAULTLINE V3.1 protocol contract"
```

- [ ] **Step 6: Open a PR only after the feature branch is fully green**

PR title:

```text
feat: establish FAULTLINE V3.1 causal session kernel
```

PR body must include exact evidence for:

- V3 typecheck;
- V3 unit/contract tests;
- current deterministic tests;
- syntax/build;
- full Chromium/WebMCP suite;
- production branch/site unchanged;
- legacy reducer compatibility;
- declared V3.1 limitations.

Do not merge if any gate is red.

---

## Plan Self-Review

### Spec coverage

V3.1 requirements are all mapped:

- TypeScript workspace foundation — Task 1.
- Versioned schemas — Task 2.
- Revisioned `DebugSession` state — Task 3.
- Protocol conflict/error/idempotency semantics — Tasks 2–3.
- Capability negotiation and adapter contract — Task 4.
- Explicit cancellation/operation IDs — Task 5.
- Causal graph invariants and provenance — Task 6.
- Tamper-evident receipt binding — Task 6.
- Legacy-case compatibility — Task 7.
- Existing production behavior preserved — Tasks 1, 7, 8, 9.
- CI gating — Task 8.
- Public contract/limitations — Task 9.

The following V3 spec areas are intentionally deferred to their already-defined later increments and are not hidden V3.1 gaps: coordinator/browser capture/replay target execution (V3.2), multi-page Next.js UI (V3.3), Playwright trace/HAR artifact ingestion (V3.4), React/Next/OTel SDK depth (V3.5), MCP/CI agent surface (V3.6), additional framework adapters (V3.7).

### Placeholder scan

No implementation step contains TBD/TODO/“similar to” placeholders. Every task declares files, interfaces, RED command, implementation contract, GREEN command, and commit boundary.

### Type consistency

- `DebugSession`, `MutationEnvelope`, `ProtocolError`, `CausalDimension`, adapter descriptor/capabilities originate only from `@faultline/protocol`.
- `SessionKernel` owns revision/idempotency mutation semantics and does not duplicate those rules inside adapters.
- `OperationRegistry` owns cancellation state and does not reuse the old browser-global cancellation mechanism.
- `LegacyCaseAdapter` consumes existing reducer primitives but presents only the new adapter contract.
- `ExperimentReceipt` is the provenance source required by authoritative causal graph edges.

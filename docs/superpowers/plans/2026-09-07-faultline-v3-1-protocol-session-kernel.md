# FAULTLINE V3.1 Protocol + Session Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V3 protocol/session kernel and legacy compatibility layer so FAULTLINE can represent revisioned modern debug sessions, negotiate adapter capabilities, record causal evidence, enforce safe operation semantics, and preserve the existing source reducer behind a `legacy-case` adapter.

**Architecture:** V3.1 is introduced as strict TypeScript workspace packages alongside the current production static application. `@faultline/protocol` owns versioned schemas and cross-surface contracts; `@faultline/session` owns revision/idempotency/operation state; `@faultline/engine` owns receipt and causal-graph invariants; `@faultline/adapter-legacy-case` wraps the proven reducer without changing its deployed behavior. The kernel, not reducers/adapters, owns session revision advancement and timestamps.

**Tech Stack:** Node.js 24 LTS, npm workspaces, TypeScript 7, Zod 4.5, `tsx` 4.23, Node `node:test`, Node `crypto`, existing JavaScript reducer/runtime tests.

**Spec:** `docs/superpowers/specs/2026-09-07-faultline-v3-causal-platform-design.md`

## Global Constraints

- Keep the current `faultline-webmcp` Vercel production application deployable throughout V3.1.
- Do not merge the rejected `feat/product-workspace-v2` branch into V3.
- New V3 code uses strict TypeScript and runtime validation at every external boundary.
- The canonical V3 object is `DebugSession`; `html + css + js + oracle` exists only through `legacy-case` compatibility.
- `PASS | FAIL | UNRESOLVED` is an oracle result and must never be conflated with protocol/transport operation success.
- Every mutation is revision guarded; stale writes fail before reducer execution.
- The session kernel alone stamps the next revision and `updatedAt`; reducers/adapters cannot forge revision lineage.
- Idempotency keys may replay the same logical mutation but may never be reused with different request content.
- Causal edges that claim preservation/removal of failure require experiment provenance.
- Unknown mutation capabilities are never executed.
- Existing reducer, sandbox, cancellation, revision-lineage and WebMCP regressions remain green.
- V3.1 contains no local coordinator, Playwright capture service, framework instrumentation, Next.js product migration, cloud execution, or destructive target mutation.
- CI runs on Node 24 LTS; V3.1 does not alter the production deployment target or Vercel project.

---

## File Structure

### Root
- Modify `package.json` — preserve existing production commands and add workspaces/V3 commands.
- Create `tsconfig.base.json` — shared strict compiler configuration.
- Modify `.github/workflows/ci.yml` — add V3 gates without removing current gates.

### `packages/protocol`
- `package.json`, `tsconfig.json`
- `src/primitives.ts` — IDs, revisions, digests, timestamps, oracle result.
- `src/session.ts` — canonical session schemas/types.
- `src/capabilities.ts` — adapter/capability/intervention schemas and interfaces.
- `src/operations.ts` — mutation envelopes and normalized operation results.
- `src/errors.ts` — normalized safe protocol errors.
- `src/index.ts` — public exports.
- `test/toolchain.test.ts`, `test/schema.test.ts`, `test/ci-contract.test.ts`.

### `packages/session`
- `package.json`, `tsconfig.json`
- `src/repository.ts` — atomic repository contract.
- `src/memory-repository.ts` — deterministic test/reference implementation.
- `src/idempotency.ts` — canonical request fingerprints.
- `src/kernel.ts` — authoritative revisioned session mutations.
- `src/capability-registry.ts` — capability resolution/safety policy.
- `src/operations.ts` — explicit long-running operation state/cancellation.
- `src/index.ts`.
- `test/kernel.test.ts`, `test/capabilities.test.ts`, `test/operations.test.ts`.

### `packages/engine`
- `package.json`, `tsconfig.json`
- `src/canonical-json.ts` — deterministic JSON serialization.
- `src/receipts.ts` — receipt digest creation/verification.
- `src/causal-graph.ts` — graph mutation/invariants.
- `src/index.ts`.
- `test/receipts.test.ts`, `test/causal-graph.test.ts`.

### `packages/adapters/legacy-case`
- `package.json`, `tsconfig.json`
- `src/legacy-schema.ts` — legacy case validation.
- `src/session-conversion.ts` — legacy case -> V3 session/artifact binding.
- `src/adapter.ts` — adapter contract over existing reducer primitives.
- `src/index.ts`.
- `test/adapter.test.ts`, `test/compatibility.test.ts`.

### Docs
- `docs/V3_PROTOCOL.md` — V3.1 contract, scope and limitations.

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
- Produces: npm workspace resolution and root `v3:typecheck` / `v3:test` commands.

- [ ] **Step 1: Write the failing toolchain test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootPackage = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
const tsconfig = JSON.parse(await readFile(new URL('../../../tsconfig.base.json', import.meta.url), 'utf8'));

test('V3 workspace preserves production and enables strict TS', () => {
  assert.equal(rootPackage.scripts.build, 'node scripts-build.mjs');
  assert.match(rootPackage.scripts['v3:typecheck'], /tsc/);
  assert.match(rootPackage.scripts['v3:test'], /tsx/);
  assert.deepEqual(rootPackage.workspaces, ['packages/*','packages/adapters/*']);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
  assert.equal(tsconfig.compilerOptions.module, 'NodeNext');
});
```

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test packages/protocol/test/toolchain.test.ts
```

Expected: FAIL because V3 workspace config does not exist.

- [ ] **Step 3: Add the workspace/toolchain**

Preserve every existing root script/dependency. Add:

```json
{
  "workspaces": ["packages/*", "packages/adapters/*"],
  "engines": { "node": ">=24.20 <27" },
  "scripts": {
    "v3:typecheck": "tsc -b packages/protocol packages/session packages/engine packages/adapters/legacy-case",
    "v3:test": "tsx --test packages/protocol/test/*.test.ts packages/session/test/*.test.ts packages/engine/test/*.test.ts packages/adapters/legacy-case/test/*.test.ts"
  },
  "dependencies": { "zod": "^4.5.0" },
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

Protocol package is ESM/private `0.1.0`; its `tsconfig.json` extends root with `rootDir: "src"`, `outDir: "dist"`, `include:["src/**/*.ts"]`.

- [ ] **Step 4: Verify GREEN and current production compatibility**

```bash
npm install --no-audit --no-fund
npx tsx --test packages/protocol/test/toolchain.test.ts
npm test
npm run check
npm run build
```

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

- [ ] **Step 1: Write the failing protocol tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { DebugSessionSchema, MutationEnvelopeSchema, OperationResultSchema, ProtocolError, parseDebugSession } from '../src/index.js';

const session = {
  schemaVersion:'3.1.0', sessionId:'ses_01JFAULTLINE00000000000000', revision:'r1',
  createdAt:'2026-09-07T10:00:00.000Z', updatedAt:'2026-09-07T10:00:00.000Z',
  target:{kind:'legacy_case',targetId:'target_legacy_1',snapshotId:'sha256:abc',safety:'reversible',artifactRef:'artifact_legacy_case'},
  environment:{browser:null,route:null,buildId:null,adapterVersions:{}}, adapters:[], capabilities:{ids:[]},
  journey:{revision:'r1',actions:[]}, oracle:{revision:'r1',kind:'dom_exists',config:{selector:'#app',equals:true}},
  baselines:[], observations:{items:{}}, dimensions:[], experiments:[], causalGraph:{nodes:{},edges:{}},
  pins:{dimensionIds:[]}, artifacts:{items:{}}, provenance:{createdBy:'test',sourceRefs:[]}
};

test('canonical session validates strict revision/oracle structure', () => {
  assert.equal(DebugSessionSchema.parse(session).revision,'r1');
  assert.throws(() => DebugSessionSchema.parse({...session,revision:'1'}));
  assert.throws(() => DebugSessionSchema.parse({...session,oracle:{revision:'r1',kind:'unknown',config:{}}}));
});

test('mutation envelope requires explicit revision identity', () => {
  assert.equal(MutationEnvelopeSchema.parse({requestId:'req_1',idempotencyKey:'idem_1',sessionId:session.sessionId,expectedRevision:'r1'}).expectedRevision,'r1');
  assert.throws(() => MutationEnvelopeSchema.parse({requestId:'req_1'}));
});

test('transport result cannot masquerade as oracle result', () => {
  assert.equal(OperationResultSchema.parse({kind:'ok',operationId:'op_1',revision:'r1'}).kind,'ok');
  assert.throws(() => OperationResultSchema.parse({kind:'FAIL'}));
});

test('invalid external session becomes safe protocol error', () => {
  assert.throws(() => parseDebugSession({}), (e:unknown) => e instanceof ProtocolError && e.code === 'invalid_request');
});
```

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test packages/protocol/test/schema.test.ts
```

- [ ] **Step 3: Implement exact protocol enums and schemas**

```ts
export const OracleResultSchema = z.enum(['PASS','FAIL','UNRESOLVED']);
export const SafetyClassSchema = z.enum(['read_only','reversible','destructive']);
export const DeterminismSchema = z.enum(['deterministic','bounded_variance','unknown']);
export const TargetKindSchema = z.enum(['local_url','staging_url','live_url_capture','playwright_trace','har','ci_failure','otel_trace','legacy_case']);
export const ProtocolErrorCodeSchema = z.enum(['conflict','invalid_request','capability_missing','safety_approval_required','target_dirty','unresolved','cancelled','internal_error']);
```

`FailureOracleSchema` is a discriminated union for DOM, property/text, computed-style, runtime error/rejection, HTTP, route, visual threshold, performance threshold, OTel span, and typed `adapter_defined`. Top-level authoritative schemas use `.strict()`. Arbitrary extension data is permitted only inside explicit `data`/`config` fields.

- [ ] **Step 4: Implement normalized errors**

`ProtocolError` carries `code`, safe `message`, optional safe `details`, and internal `cause`; `toJSON()` never serializes `cause`. `parseDebugSession()` converts Zod failures to `invalid_request` with field paths but not raw secret-bearing values.

- [ ] **Step 5: Verify GREEN/typecheck**

```bash
npx tsx --test packages/protocol/test/schema.test.ts
npm run v3:typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/protocol
git commit -m "feat: define V3 debug session protocol"
```

---

### Task 3: Build the authoritative revisioned session kernel with idempotency

**Files:**
- Create: `packages/session/package.json`, `packages/session/tsconfig.json`
- Create: `packages/session/src/repository.ts`
- Create: `packages/session/src/memory-repository.ts`
- Create: `packages/session/src/idempotency.ts`
- Create: `packages/session/src/kernel.ts`
- Create: `packages/session/src/index.ts`
- Test: `packages/session/test/kernel.test.ts`

**Interfaces:**
- Consumes: `DebugSession`, `MutationEnvelope`, `ProtocolError`.
- Produces: `SessionRepository`, `MemorySessionRepository`, `SessionKernel`, `MutationReceipt<T>`.

```ts
mutate<T>(
  envelope: MutationEnvelope,
  kind: string,
  input: unknown,
  reducer: (current: Readonly<DebugSession>) => { next: DebugSession; result: T }
): Promise<MutationReceipt<T>>
```

The reducer returns content changes while keeping the current `sessionId`, `revision`, `createdAt`, and `updatedAt`. The **kernel** stamps `revision = nextRevision(current.revision)` and `updatedAt = clock()` after reducer completion and before schema validation/CAS.

- [ ] **Step 1: Write failing kernel tests**

```ts
const repo = new MemorySessionRepository();
const kernel = new SessionKernel(repo,{clock:()=>new Date('2026-09-07T10:01:00.000Z')});
await repo.create(validSession);

const first = await kernel.mutate(env('r1','idem-a'),'set_pin',{id:'dim-1'}, s => ({
  next:{...s,pins:{dimensionIds:['dim-1']}}, result:{pinned:'dim-1'}
}));
assert.equal(first.revision,'r2');
assert.equal((await repo.get(validSession.sessionId))?.session.updatedAt,'2026-09-07T10:01:00.000Z');

await assert.rejects(
  kernel.mutate(env('r1','idem-b'),'set_pin',{id:'dim-2'}, () => { throw new Error('must not execute'); }),
  (e:unknown) => e instanceof ProtocolError && e.code === 'conflict'
);

const replay = await kernel.mutate(env('r1','idem-a'),'set_pin',{id:'dim-1'}, () => { throw new Error('idempotent replay must not rerun reducer'); });
assert.deepEqual(replay,first);

await assert.rejects(
  kernel.mutate(env('r1','idem-a'),'set_pin',{id:'different'}, () => { throw new Error('must not execute'); }),
  (e:unknown) => e instanceof ProtocolError && e.code === 'conflict'
);
```

Also run two concurrent mutations with `expectedRevision:'r1'`; exactly one commits and the other returns `conflict`.

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test packages/session/test/kernel.test.ts
```

- [ ] **Step 3: Implement atomic repository contract**

```ts
export interface SessionRepository {
  create(session: DebugSession): Promise<void>;
  get(sessionId:string): Promise<StoredSession|null>;
  compareAndSwap(args:{
    sessionId:string;
    expectedRevision:string;
    next:DebugSession;
    mutation:StoredMutationRecord;
    idempotency:StoredIdempotencyRecord;
  }): Promise<'committed'|'conflict'>;
  getIdempotency(sessionId:string,key:string): Promise<StoredIdempotencyRecord|null>;
}
```

`MemorySessionRepository.compareAndSwap` serializes mutations per session so state + mutation + idempotency record commit atomically.

- [ ] **Step 4: Implement canonical request fingerprinting**

`fingerprintMutation(kind,input)` uses deterministic key-sorted JSON and SHA-256. Reusing a key with different fingerprint throws `conflict` before reducer execution.

- [ ] **Step 5: Implement `SessionKernel.mutate`**

Order is mandatory: validate envelope -> check idempotency -> read state -> stale-revision check -> deep-clone/freeze reducer input -> execute reducer -> verify immutable identity fields were not changed -> kernel stamps next revision/time -> validate `DebugSessionSchema` -> CAS state/mutation/idempotency -> return receipt. CAS conflict is normalized to `conflict` and never retries a non-idempotent reducer implicitly.

- [ ] **Step 6: Verify GREEN/typecheck**

```bash
npx tsx --test packages/session/test/kernel.test.ts
npm run v3:typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/session packages/protocol/package.json
git commit -m "feat: add revisioned V3 session kernel"
```

---

### Task 4: Implement capability negotiation and adapter contracts

**Files:**
- Modify: `packages/protocol/src/capabilities.ts`, `packages/protocol/src/index.ts`
- Create: `packages/session/src/capability-registry.ts`
- Modify: `packages/session/src/index.ts`
- Test: `packages/session/test/capabilities.test.ts`

**Interfaces:**
- Produces: `FaultlineAdapter`, `CapabilityDescriptor`, `AdapterDescriptor`, `CapabilityRegistry`, `CapabilityResolution`.

```ts
export interface FaultlineAdapter {
  descriptor(): AdapterDescriptor;
  detect(target:TargetDescriptor,signal?:AbortSignal):Promise<DetectionResult>;
  capabilities(target:TargetDescriptor,signal?:AbortSignal):Promise<CapabilityDescriptor[]>;
  capture(ctx:CaptureContext,signal?:AbortSignal):AsyncIterable<Observation>;
  replay(ctx:ReplayContext,signal?:AbortSignal):Promise<ReplayResult>;
  enumerateDimensions(ctx:DimensionContext,signal?:AbortSignal):Promise<CausalDimension[]>;
  intervene(ctx:InterventionContext,signal?:AbortSignal):Promise<InterventionLease>;
  restore(lease:InterventionLease,signal?:AbortSignal):Promise<RestorationResult>;
}
```

- [ ] **Step 1: Write failing capability tests**

```ts
const registry = new CapabilityRegistry();
registry.register({id:'browser.capture.dom',version:'1',adapterId:'generic',mode:'observe',safety:'read_only',determinism:'deterministic'});
assert.equal(registry.require('browser.capture.dom','generic').id,'browser.capture.dom');
assert.throws(() => registry.require('unknown.mutate','generic'), (e:unknown) => e instanceof ProtocolError && e.code === 'capability_missing');
```

Also require incompatible duplicate descriptors to fail and destructive capability resolution to return/throw `safety_approval_required` unless approval binds exact session revision + target snapshot + capability/plan ID.

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test packages/session/test/capabilities.test.ts
```

- [ ] **Step 3: Implement registry and schemas**

`CapabilityDescriptor` fields: `id`, `version`, `adapterId`, `mode:'observe'|'replay'|'intervene'`, `safety`, `determinism`. Resolution is exact; unknown mutation IDs never fall back to generic execution.

- [ ] **Step 4: Verify GREEN/typecheck**

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

### Task 5: Add explicit long-running operation lifecycle and cancellation

**Files:**
- Modify: `packages/protocol/src/operations.ts`
- Create: `packages/session/src/operations.ts`
- Modify: `packages/session/src/index.ts`
- Test: `packages/session/test/operations.test.ts`

**Interfaces:**
- Produces: `OperationRegistry`, `OperationRecord`, `OperationHandle`.
- States: `queued | running | cancelling | cancelled | succeeded | failed`.

- [ ] **Step 1: Write failing operation tests**

```ts
const ops = new OperationRegistry({clock:fixedClock});
const handle = ops.begin({sessionId:'ses_1',kind:'reduction',boundRevision:'r4'});
assert.equal(ops.inspect(handle.operationId).state,'running');
handle.cancel('user_request');
assert.equal(ops.inspect(handle.operationId).state,'cancelling');
assert.equal(handle.signal.aborted,true);
ops.markCancelled(handle.operationId);
assert.equal(ops.inspect(handle.operationId).state,'cancelled');
assert.throws(() => ops.succeed(handle.operationId,{ok:true}), /INVALID_OPERATION_TRANSITION/);
```

Also prove A cancellation never aborts B, pre-aborted caller signals abort immediately, listener cleanup happens on terminal state, and terminal records retain `boundRevision`.

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test packages/session/test/operations.test.ts
```

- [ ] **Step 3: Implement state machine**

Allowed transitions:

```text
queued -> running | cancelled
running -> cancelling | succeeded | failed
cancelling -> cancelled | failed
terminal -> none
```

Each operation owns one `AbortController`; optional external signal is bridged with cleanup. No global controller.

- [ ] **Step 4: Verify GREEN/typecheck**

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

### Task 6: Add tamper-evident receipts and evidence-backed causal graph rules

**Files:**
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`
- Create: `packages/engine/src/canonical-json.ts`
- Create: `packages/engine/src/receipts.ts`
- Create: `packages/engine/src/causal-graph.ts`
- Create: `packages/engine/src/index.ts`
- Test: `packages/engine/test/receipts.test.ts`, `packages/engine/test/causal-graph.test.ts`

**Interfaces:**
- Produces: `canonicalJson`, `sha256Digest`, `createExperimentReceipt`, `verifyExperimentReceipt`, `CausalGraphStore`.

- [ ] **Step 1: Write failing receipt tests**

```ts
const a = createExperimentReceipt({...baseReceipt,adapterBindings:[{adapterId:'legacy-case',version:'1'}]});
const b = createExperimentReceipt({...baseReceipt,adapterBindings:[{adapterId:'legacy-case',version:'1'}]});
assert.equal(a.digest,b.digest);
assert.equal(verifyExperimentReceipt(a),true);
assert.equal(verifyExperimentReceipt({...a,body:{...a.body,targetSnapshotId:'changed'}}),false);
```

Receipt body binds: receipt version, experiment/session/session revision, target snapshot, journey revision, oracle revision, adapter bindings, dimension IDs, intervention digest, oracle result, evidence digests, restoration status, created timestamp.

- [ ] **Step 2: Verify receipt RED**

```bash
npx tsx --test packages/engine/test/receipts.test.ts
```

- [ ] **Step 3: Implement deterministic digesting**

`canonicalJson` recursively sorts object keys, preserves array order, and rejects unsupported JSON values including non-finite numbers/functions/symbols/undefined. Receipts use SHA-256 `sha256:<hex>`.

- [ ] **Step 4: Write causal graph RED tests**

```ts
const graph = new CausalGraphStore();
graph.addNode({id:'dim_1',kind:'dimension',provenanceRefs:['obs_1']});
graph.addNode({id:'oracle_1',kind:'oracle',provenanceRefs:[]});
assert.throws(() => graph.addExperimentEdge({id:'e1',from:'dim_1',to:'oracle_1',kind:'preserved-failure',experimentRef:'missing'}, fakeUnverifiedReceipt));
```

Also test unknown node refs, conflicting duplicate edge IDs, and deterministic export.

- [ ] **Step 5: Implement graph invariant methods**

```ts
addNode(node:CausalNode):void;
addObservationEdge(edge:ObservationEdge):void;
addExperimentEdge(edge:ExperimentEdge,receipt:VerifiedExperimentReceipt):void;
export():CausalGraph;
```

`preserved-failure`, `removed-failure`, `unresolved` require a verified matching experiment receipt. No correlation-only causal edge path exists.

- [ ] **Step 6: Verify GREEN/typecheck**

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

### Task 7: Wrap the existing reducer as `legacy-case` adapter

**Files:**
- Create: `packages/adapters/legacy-case/package.json`, `packages/adapters/legacy-case/tsconfig.json`
- Create: `packages/adapters/legacy-case/src/legacy-schema.ts`
- Create: `packages/adapters/legacy-case/src/session-conversion.ts`
- Create: `packages/adapters/legacy-case/src/adapter.ts`
- Create: `packages/adapters/legacy-case/src/index.ts`
- Test: `packages/adapters/legacy-case/test/adapter.test.ts`, `packages/adapters/legacy-case/test/compatibility.test.ts`
- Read-only dependency: `src/reducer-engine.js`

**Interfaces:**
- Consumes: `semanticUnits`, `removeUnits`, `ddminReduce`, V3 `FaultlineAdapter`.
- Produces: `LegacyCaseSchema`, `LegacyCaseAdapter`, `legacyCaseToSession`, `LegacyRunner`.

```ts
export type LegacyRunner = (legacyCase:LegacyCase,signal?:AbortSignal) => Promise<{
  status:'PASS'|'FAIL'|'UNRESOLVED';
  evidence?:Record<string,unknown>;
}>;
```

- [ ] **Step 1: Write failing detection/capability test**

```ts
const adapter = new LegacyCaseAdapter(fakeRunner);
assert.equal(adapter.descriptor().id,'legacy-case');
assert.deepEqual((await adapter.capabilities(target)).map(x=>x.id).sort(),[
  'legacy.capture.source','legacy.intervene.unit','legacy.replay.case','source.reduce.legacy'
].sort());
```

Detection matches only `legacy_case` target with a valid referenced legacy artifact.

- [ ] **Step 2: Write failing conversion test**

`legacyCaseToSession()` must validate the four-field payload, create a digest-bound inline JSON artifact, target `kind:'legacy_case'`, translate the legacy oracle, begin at `r1`, and expose only legacy capabilities.

- [ ] **Step 3: Verify RED**

```bash
npx tsx --test packages/adapters/legacy-case/test/adapter.test.ts
```

- [ ] **Step 4: Implement dimension enumeration using current reducer truthfully**

```ts
{
  id:`legacy:${unit.id}`,
  adapterId:'legacy-case',
  kind:`legacy_source_${unit.kind}`,
  label:`${axis} ${unit.kind}`,
  dependencies:unit.parentId?[`legacy:${unit.parentId}`]:[],
  conflicts:[],
  safety:'reversible',
  determinism:'deterministic',
  intervention:{type:'legacy_remove_unit',axis,unitId:unit.id},
  evidenceRefs:[artifactId]
}
```

Never claim AST/framework semantics beyond the current reducer.

- [ ] **Step 5: Implement reversible in-memory intervention lease**

Adapter context owns a cloned working legacy case. `intervene()` validates the dimension, records before digest, applies exact `removeUnits`, records after digest, returns a private restoration token. `restore()` reinstates exact prior case and verifies digest. Abort before commit produces typed `cancelled` and no mutation.

- [ ] **Step 6: Implement replay through injected runner**

Validate returned oracle result. Runner/infrastructure exception does not become PASS/FAIL; normalize to protocol `unresolved` unless typed cancellation/protocol error.

- [ ] **Step 7: Write compatibility tests**

Require adapter semantic units to equal direct `semanticUnits`, intervention output to equal direct `removeUnits`, restore to be byte-identical, fake failing runner reduction to preserve FAIL, and current production reducer tests to remain unchanged.

- [ ] **Step 8: Verify GREEN + legacy regressions**

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

### Task 8: Integrate V3.1 into CI without weakening production gates

**Files:**
- Modify: `.github/workflows/ci.yml`
- Test: `packages/protocol/test/ci-contract.test.ts`

**Interfaces:**
- Produces: CI that gates both existing deployed product and V3.1.

- [ ] **Step 1: Write failing CI contract test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const workflow = await readFile(new URL('../../../.github/workflows/ci.yml', import.meta.url),'utf8');
test('CI gates current production and V3 kernel',()=>{
  for (const required of ['npm test','npm run check','npm run build','npm run test:browser','npm run v3:typecheck','npm run v3:test']) {
    assert.match(workflow,new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});
```

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test packages/protocol/test/ci-contract.test.ts
```

- [ ] **Step 3: Add V3 workflow gates**

Preserve all existing jobs/steps. Add after install and before Chromium/browser work:

```yaml
- run: npm run v3:typecheck
- run: npm run v3:test
```

- [ ] **Step 4: Run complete local-equivalent gate**

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

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml packages/protocol/test/ci-contract.test.ts
git commit -m "ci: gate V3 kernel beside production regressions"
```

---

### Task 9: Document the V3.1 contract and run final verification

**Files:**
- Create: `docs/V3_PROTOCOL.md`
- Modify only if needed: `README.md`
- Test: protocol documentation drift assertion.

**Interfaces:**
- Documents exact public contracts produced by Tasks 2–8.

- [ ] **Step 1: Write `docs/V3_PROTOCOL.md`**

It must document schema `3.1.0`, `DebugSession`, mutation envelope/revision rules, operation-vs-oracle result distinction, idempotency semantics, capability/safety classes, adapter contract, receipt binding, legacy capability set, and explicit V3.1 non-features: no coordinator/browser capture/artifact adapters/framework deep adapter/MCP server/V3 UI yet.

Include a minimal valid session JSON that passes `DebugSessionSchema`.

- [ ] **Step 2: Add documentation drift test**

```ts
const docs = await readFile(new URL('../../../docs/V3_PROTOCOL.md', import.meta.url),'utf8');
for (const term of ['3.1.0','DebugSession','PASS | FAIL | UNRESOLVED','legacy-case','source.reduce.legacy','legacy.capture.source','legacy.replay.case','legacy.intervene.unit']) {
  assert.match(docs,new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
}
```

- [ ] **Step 3: Run fresh final verification**

```bash
npm install --no-audit --no-fund
npm run v3:typecheck
npm run v3:test
npm test
npm run check
npm run build
npx playwright install --with-deps chromium
npm run test:browser
git diff --check
git status --short
```

All tests must pass. Generated `dist/`, secrets, temporary artifacts and unintended build output must not be committed.

- [ ] **Step 4: Verify production was not mutated by V3.1**

```bash
git rev-parse origin/main
git rev-parse origin/production
```

Both remain at the verified production release until a later V3 web release is explicitly merged/deployed.

- [ ] **Step 5: Commit docs**

```bash
git add docs/V3_PROTOCOL.md packages/protocol/test
git commit -m "docs: define FAULTLINE V3.1 protocol contract"
```

- [ ] **Step 6: Open PR only after all gates are green**

PR title:

```text
feat: establish FAULTLINE V3.1 causal session kernel
```

PR evidence must name exact V3 typecheck/tests, current deterministic tests, syntax/build, full Chromium/WebMCP suite, legacy compatibility, and confirm public production remains unchanged. Do not merge a red PR.

---

## Plan Self-Review

### Spec coverage
- TypeScript workspace foundation — Task 1.
- Versioned schemas and result semantics — Task 2.
- Revisioned authoritative session state + idempotency — Task 3.
- Capability negotiation/adapter contract — Task 4.
- Explicit operation IDs/cancellation — Task 5.
- Causal graph + tamper-evident provenance — Task 6.
- Legacy reducer compatibility — Task 7.
- CI coexistence with deployed product — Task 8.
- Public V3.1 contract and final regression gate — Task 9.

Deferred by the approved decomposition, not omitted: coordinator/generic browser capture (V3.2), multi-page Next.js UI (V3.3), trace/HAR adapters (V3.4), React/Next/OTel SDK (V3.5), MCP/CI integration (V3.6), additional deep framework adapters (V3.7).

### Placeholder scan
No TBD/TODO/“similar to” steps remain. Each implementation task contains exact files, interface names, RED test expectations, GREEN commands and commit boundary.

### Type consistency
- Protocol owns shared types.
- Kernel alone owns revision/timestamp advancement.
- Repository CAS atomically commits state + mutation + idempotency record.
- Operation registry owns cancellation state independently per operation.
- Adapter registry never fabricates unsupported mutation capabilities.
- Legacy adapter consumes current reducer truthfully and does not claim framework semantics.
- Verified experiment receipts are required for authoritative causal graph edges.

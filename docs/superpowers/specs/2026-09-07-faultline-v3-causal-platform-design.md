# FAULTLINE V3 — Causal Debugging Platform Design

## Status

Approved architectural replacement for Product Workspace V2.

Implementation branch: `feat/faultline-v3-causal-platform`

Baseline: verified production commit `8e8dacc4d6c142b9f6b583af5de69db7a95d4d46`.

The partial `feat/product-workspace-v2` branch remains a recoverable historical checkpoint and is not the architecture to ship.

## Decision

FAULTLINE V3 is a **local-first causal debugging platform**. Its canonical object is a revisioned debug session containing target identity, replayable actions, observations, controllable dimensions, experiments, causal evidence and exportable receipts.

The existing deterministic reducer, stale-revision guards, cancellation semantics, evidence lineage, sandbox policies and legacy WebMCP behavior remain valuable. Raw `html + css + js + oracle` reduction becomes the `legacy-case` adapter instead of the universal product model.

## Why V2 is replaced

V2 improved navigation but preserved the wrong abstraction. A modern application can execute across React Server Components, client hydration, route transitions, server actions, route handlers, edge/server middleware, service workers, dynamic imports, APIs, third-party SDKs and distributed traces. A production debugger cannot truthfully flatten all of that into three source textareas.

V3 therefore reasons over **execution evidence plus executable interventions** rather than assuming source text is the only causal surface.

## Product promise

For a reproducible web failure FAULTLINE should answer:

1. What happened?
2. Can the failure be reproduced under a bound environment and target snapshot?
3. Which controllable dimensions are necessary for the failure?
4. What is the smallest reproducer FAULTLINE can prove within the active adapter capabilities?
5. What evidence proves that result?
6. How can a developer, CI system or agent continue the investigation?

FAULTLINE never claims global minimality or causal control over a dimension that an adapter cannot safely observe and intervene on.

# Core principles

1. **Evidence first.** DOM, actions, network requests, routes, storage, source units, framework events and server spans are possible evidence; none is universally canonical.
2. **Capability negotiation.** Adapters declare exactly what they can observe, replay and mutate. The engine schedules only validated capabilities.
3. **Replay before reduction.** No causal reduction begins until the configured oracle reproduces under the baseline stability policy.
4. **Bound provenance.** Every experiment is bound to session, target, journey, oracle and adapter revisions.
5. **Local-first mutation.** Credentials, private source and mutating experiments stay on the developer machine by default.
6. **Safe degradation.** Generic browser capture remains the fallback when deep framework instrumentation is unavailable.
7. **One protocol.** Web UI, local UI, CLI, SDK, MCP and optional WebMCP use the same versioned orchestration contract.
8. **Correlation is not causation.** Observations can suggest experiments; authoritative causal edges require experiment provenance.

# Alternatives

## A — Keep V2 and add framework adapters

Rejected as the primary architecture because it still forces modern applications into the old case model.

## B — Capability-driven causal session platform

Selected. It preserves proven reduction mechanics while making framework/runtime behavior adapter-specific instead of core-specific.

## C — Fully hosted observability platform

Deferred. Accounts, multitenant ingestion, cloud execution, billing, retention and data residency are unnecessary before the causal engine is proven.

# Canonical session model

```ts
interface DebugSession {
  schemaVersion: string;
  sessionId: string;
  revision: string;
  createdAt: string;
  updatedAt: string;

  target: TargetDescriptor;
  environment: EnvironmentSnapshot;
  adapters: AdapterBinding[];
  capabilities: CapabilitySet;

  journey: ReproductionJourney;
  oracle: FailureOracle;
  baselines: BaselineRun[];

  observations: ObservationIndex;
  dimensions: CausalDimension[];
  experiments: ExperimentReceipt[];
  causalGraph: CausalGraph;

  pins: PinSet;
  artifacts: ArtifactIndex;
  provenance: Provenance;
}
```

All external session data is runtime-schema validated. Unknown mutation capabilities are never executed.

## Targets

Initial target classes:

- `local_url` — localhost/LAN application under developer control;
- `staging_url` — explicitly approved remote environment;
- `live_url_capture` — read-only/safe capture by default;
- `playwright_trace`;
- `har`;
- `ci_failure`;
- `otel_trace`;
- `legacy_case`.

Target objects contain policy and opaque credential references, not raw credentials.

## Environment snapshot

A session binds relevant reproducibility inputs such as browser/version, viewport, locale, timezone, route, build/commit ID, framework/runtime versions when known, selected flags/storage snapshots and adapter versions.

Secret values are redacted or represented by local opaque handles unless a user explicitly exports them.

## Reproduction journey

A journey is a revisioned sequence of semantic actions such as navigation, click, fill, select, key press, submit, file reference, wait-for-condition and adapter-defined actions.

Journeys may come from interactive recording, Playwright traces/tests, CI artifacts, agents or manual editing.

## Failure oracle

Initial typed oracle classes:

- DOM existence/absence;
- DOM property/attribute/text;
- computed style;
- runtime error or unhandled rejection signature;
- request/response status or payload predicate;
- expected/missing request;
- navigation/route outcome;
- screenshot threshold when explicitly configured;
- bounded performance threshold;
- OpenTelemetry span status/error/attribute predicate;
- adapter-defined typed oracle.

Changing an oracle creates a new oracle revision and invalidates incompatible baseline claims.

## Observations

Immutable observations include actions, DOM snapshots, console messages, runtime errors, network metadata, storage mutations, route transitions, performance events, screenshots, source/stack references, framework events, server/edge spans, OpenTelemetry references, and supported WebSocket/service-worker events.

Large artifacts are content-addressed and referenced by digest.

## Causal dimensions

A causal dimension is not merely something observed; it must have an executable intervention supplied by an adapter.

```ts
interface CausalDimension {
  id: string;
  adapterId: string;
  kind: string;
  label: string;
  parentId?: string;
  dependencies: string[];
  conflicts: string[];
  safety: 'read_only' | 'reversible' | 'destructive';
  determinism: 'deterministic' | 'bounded_variance' | 'unknown';
  intervention: InterventionDescriptor;
  evidenceRefs: string[];
}
```

Possible dimensions include journey steps, storage keys, requests/request fields, response fixtures, feature flags, third-party scripts, service workers, route middleware, instrumented server handlers/spans, framework route segments, controlled source modules and legacy structural units.

# Adapter system

```ts
interface FaultlineAdapter {
  descriptor(): AdapterDescriptor;
  detect(target: TargetContext): Promise<DetectionResult>;
  capabilities(target: TargetContext): Promise<CapabilitySet>;
  capture(ctx: CaptureContext): AsyncIterable<Observation>;
  replay(ctx: ReplayContext): Promise<ReplayResult>;
  enumerateDimensions(ctx: DimensionContext): Promise<CausalDimension[]>;
  intervene(ctx: InterventionContext): Promise<InterventionLease>;
  restore(lease: InterventionLease): Promise<void>;
}
```

Capabilities are independently versioned, for example `browser.capture.network`, `browser.replay.actions`, `browser.intervene.storage`, `artifact.playwright.trace.read`, `framework.next.server_error_context` and `source.reduce.legacy`.

Safety rules:

- read-only targets never receive mutating interventions;
- reversible interventions must return a restoration lease and pass restoration verification;
- destructive interventions require explicit approval bound to target, session revision and exact plan;
- adapter infrastructure failure yields `UNRESOLVED`, never a fabricated oracle PASS/FAIL;
- network interception stays scoped to the selected browser context/target;
- adapters receive only declared credential capabilities.

# Initial adapters

## Generic browser — required baseline

Playwright is the first browser runner. It provides navigation/action replay, DOM snapshots, console/page errors, network events, screenshots and safe browser-state/request interventions where enabled.

CDP-specific features are capability-gated rather than falsely advertised on all browsers.

## Playwright trace — required

Imports action history, DOM snapshots, console/network evidence, screenshots and available source metadata. Trace-only sessions are observational until attached to a replayable target.

## HAR — required

Provides network topology/evidence. HAR alone is read-only; intervention requires a replayable target.

## Legacy case — required

Wraps the existing HTML/CSS/JS reducer and preserves hierarchical reduction, sandbox execution, current oracles, revision guards, cancellation and evidence lineage. The UI labels this explicitly as `legacy-source`.

## React/Next — first deep framework adapter

Targets React 19 / Next.js 16 using public/stable instrumentation surfaces wherever possible: build/runtime metadata, route transitions, Next client instrumentation, server `instrumentation`/`onRequestError`, OpenTelemetry correlation, source maps/build manifests belonging to the user's project and optional FAULTLINE SDK hooks.

Server Components and server actions are never inferred from browser DOM alone. Deeper dimensions appear only when the required instrumentation is installed and verified.

## Vue/Nuxt and SvelteKit

The protocol is ready for dedicated adapters, but first-release depth may be generic-browser-only. The product must show exact capability coverage instead of pretending equal framework support.

## OpenTelemetry

Initially ingest/correlation-focused. Browser OpenTelemetry remains optional because current browser instrumentation is not a universal stable capture layer.

# Execution modes

## Local full mode — primary developer path

`faultline` CLI starts a loopback coordinator, browser worker and **locally served FAULTLINE UI**. This is the guaranteed path for localhost/private targets and does not depend on a public website being allowed to contact loopback.

Responsibilities:

- launch/manage Playwright contexts;
- connect to local/staging targets;
- store session data and artifacts locally;
- load adapters;
- hold credential handles locally;
- execute capture/replay/interventions/reduction;
- expose the versioned protocol to local UI, CLI and MCP.

The coordinator binds loopback by default, uses an ephemeral pairing/auth credential, validates Host/Origin, enforces request limits and rejects DNS-rebinding style origin confusion.

## Hosted artifact mode

The existing Vercel application supports portable session, Playwright trace and HAR inspection/import. Artifact inspection is local-in-browser where practical and read-only unless paired with a coordinator.

Artifacts are not silently uploaded merely to view them.

## Hosted-to-local pairing — optional convenience

The hosted HTTPS UI may pair with a local coordinator only after an explicit user action. Browsers can gate public-to-loopback/private requests with Local Network Access permissions, and enterprise/browser policy can deny that access. Therefore:

- hosted-to-local pairing must detect and explain permission denial;
- it must never be the only local developer workflow;
- local full mode must remain complete without the hosted site;
- transports must not rely on an assumption that WebSocket/fetch loopback access is universally ungated;
- the Integrations/Doctor surfaces must report browser-specific pairing limitations precisely.

## Future hosted control plane

The protocol can later support an authenticated remote coordinator, but V3 first release does not require multitenant cloud execution or arbitrary remote-code execution.

# Coordinator architecture

```text
Local/Hosted UI | CLI | MCP | optional WebMCP
                    |
                    v
             Protocol Gateway
                    |
                    v
           Session Orchestrator
            /       |        \
           v        v         v
       Capture    Replay    Reduction
            \       |        /
             \      v       /
               Adapter Host
                    |
                    v
      Browser / Framework / Artifacts / OTel / Legacy
```

## Protocol gateway

Owns runtime validation, authentication/pairing, request IDs, idempotency, cancellation, streaming, normalized errors and MCP/WebMCP translation.

## Session orchestrator

Owns authoritative revisioned state, target snapshot binding, baseline policy, experiment leases, causal graph, receipts and crash recovery.

## Capture

Records observations; it does not decide causality.

## Replay

Executes the bound journey against a bound target/environment and returns typed oracle result plus evidence.

## Reduction

Selects dimensions, applies adapter interventions, replays, records result, restores target and updates the causal graph. Existing ddmin/hierarchical search becomes one strategy among several.

# Baseline determinism

Before reduction, deterministic functional failures default to at least two consecutive reproductions with identical oracle result, unchanged target snapshot and no unresolved infrastructure failures.

Bounded-variance oracles define an explicit sampling policy.

Every baseline stores journey/oracle revisions, target/build identity, environment digest, adapter/capability versions, result and evidence digests. Changing any bound identity makes prior claims stale rather than silently reusable.

# Experiment lifecycle

```text
plan
 -> validate capability/safety
 -> bind session/target/journey/oracle revisions
 -> acquire intervention lease
 -> apply
 -> verify intervention
 -> replay
 -> evaluate oracle
 -> capture evidence
 -> restore
 -> verify restoration
 -> persist receipt
 -> update causal graph
```

Mutating adapters must support reconciliation of durable leases. If restoration cannot be proven after a crash or adapter failure, the target becomes `dirty` and further experiments stop until reset/reconnection.

# Causal graph

Evidence-backed node classes include action, observation, dimension, oracle, experiment, artifact and runtime/span nodes.

Evidence-backed edge classes include occurred-before, triggered, observed-in, depends-on, intervened-on, preserved-failure, removed-failure, unresolved and derived-from.

Agents/LLMs may summarize and propose experiments, but authoritative causal edges require stored provenance.

# Repository architecture

V3 migrates to a strict TypeScript workspace while production remains deployable throughout migration.

```text
apps/
  web/                 Next.js product/artifact UI
  cli/                 command-line client
  bridge/              local coordinator + local UI host

packages/
  protocol/            schemas, errors, versioning, events
  session/             revisioned state + persistence interfaces
  engine/              reduction strategies + causal graph rules
  orchestrator/        capture/replay/experiment lifecycle
  browser/             Playwright worker
  sdk/                 optional app instrumentation
  mcp/                 MCP adapter
  adapters/
    generic-web/
    playwright-trace/
    har/
    legacy-case/
    react-next/
    otel/

fixtures/
  vanilla/
  react-vite/
  next-app-router/
  vue-vite/
  sveltekit/
  service-worker/
  websocket/

integration-tests/
```

All external schemas receive runtime validation; TypeScript types alone are not a trust boundary.

The web UI may use Next.js 16/React 19, but the causal engine and protocol remain framework-independent and usable from CLI/MCP without the web application.

Local persistence uses transactional metadata storage plus content-addressed artifact storage behind an interface that can later support a remote backend.

# UI / UX architecture

V3 is a real multi-page product. Pages have different structures based on their job rather than repeating the same card grid.

## Global shell

Desktop uses a persistent product rail, compact command/status bar, task canvas and optional inspector. Near-black/black surfaces, white/neutral typography and restrained pink causal emphasis remain the visual identity. Dense data views use dividers, tables, timelines and panes rather than excessive bordered cards.

Primary navigation:

- Home
- New Session
- Sessions
- Integrations
- Docs

Session navigation:

- Overview
- Capture
- Reproduce
- Fault Map
- Reduce
- Evidence

Mobile is task-oriented, not a compressed desktop workspace.

## Home

Operational dashboard: coordinator connection, recent sessions, target health, last reproduction state, recent receipts, New Session and artifact import. No source editor.

## New Session

Three-stage wizard:

1. target/artifact source — Local App, Staging/Live URL, Playwright Trace, HAR, CI Artifact, OTel Trace, Legacy Case;
2. detect target/framework/adapters/capabilities and select safety mode;
3. record/import journey, define oracle and establish baseline.

Reduction is unavailable until baseline is valid.

## Session Overview

Target/build identity, environment, journey/oracle revisions, capability matrix, baseline stability, latest result, causal progress and blockers such as dirty target or missing capability.

## Capture

Timeline-centric workspace with filmstrip/screenshots, actions, DOM/navigation/runtime events, network waterfall/table and console/errors. The inspector shows request/response, stack/source refs, span correlation and redaction state.

## Reproduce

Journey editor, oracle builder, environment controls, replay console and explicit stability indicator. PASS/FAIL/UNRESOLVED explanations are visible.

## Fault Map

Evidence-backed causal graph with filters and provenance inspector plus an accessible list/table fallback. The graph is not required to understand the evidence.

## Reduce

Three-zone experimental workspace:

- candidate dimensions, dependencies, pins and safety/capability badges;
- active experiment/replay progress and frontier;
- oracle outcome, intervention/restoration state and receipt provenance.

Autopilot may propose/run permitted experiments but cannot bypass approvals or capability limits.

## Evidence

Read-only report showing bound target/build, journey/oracle, necessary/unnecessary/unresolved dimensions, experiment receipts and exports. Metrics remain dimension-specific; FAULTLINE never combines unrelated dimensions into a misleading single reduction percentage.

## Integrations

Actual setup/verification hub for local coordinator, CLI, SDK, Next/React instrumentation, Playwright/CI, trace/HAR import, OTel, MCP and optional WebMCP. Each integration supports Detect, Setup, Verify, Test Capture and Troubleshoot states.

## Docs

Separately routed/searchable protocol, schema, adapters, security, tutorials and limitations.

# CLI

Initial command family:

```text
faultline init
faultline doctor
faultline connect <url>
faultline record
faultline replay
faultline import <trace|har|session>
faultline inspect
faultline reduce
faultline export
faultline mcp serve
faultline ui
```

`--json` provides structured machine/agent output. Success is not reported without a persisted receipt/session revision where the operation mutates authoritative state.

# SDK

The SDK is optional. Generic browser sessions need no application changes.

The SDK can register framework/runtime metadata, custom observations, feature flags, safe controllable dimensions, browser/server correlation IDs, redaction hooks, Next instrumentation helpers and OTel correlation.

Server mutations require explicit application registration; installing the SDK never grants arbitrary server-state mutation.

# MCP 2026

MCP translates the same protocol gateway. Stateful investigations use explicit `sessionId`, revision and operation handles rather than hidden transport session state.

Tool groups cover sessions, targets/capabilities, capture, journey, oracle, reproduce, dimensions, experiments, reduction and evidence/export.

Mutation tools include expected revision/plan identity. Long-running tasks expose operation IDs, status and cancellation.

Optional WebMCP exposes only browser-appropriate subsets backed by the same handles.

# Protocol semantics

Every mutation includes request ID, session ID, expected revision, target snapshot when relevant, capability/version binding and idempotency key where retries could duplicate effects.

Normalized operation outcomes include `ok`, `conflict`, `invalid_request`, `capability_missing`, `safety_approval_required`, `target_dirty`, `unresolved`, `cancelled` and `internal_error`.

Oracle result remains separately typed as `PASS | FAIL | UNRESOLVED` and is never conflated with transport success.

# Security model

## Bridge

- loopback by default;
- ephemeral pairing/auth token;
- strict Host/Origin/CORS validation;
- Local Network Access-aware hosted pairing;
- DNS-rebinding protections;
- no unauthenticated mutation endpoints;
- session-scoped capabilities;
- request size/rate limits;
- pairing/token rotation.

## Targets

- live/third-party target defaults to capture/read-only;
- mutation requires developer-controlled local/staging target or explicit target policy;
- destructive capability requires exact-plan approval;
- reversible intervention requires verified restoration;
- uncertainty marks target dirty.

## Secrets

Secrets stay in local providers by default and portable sessions contain opaque handles/redacted values. Secret material is never written into client source or MCP descriptions/results by default.

## Imported artifacts

Treat archives/traces/HAR as untrusted: bounded size/decompression, traversal protection, no execution of imported source, isolated parsing where practical and sanitized rendering.

## Browser isolation

Legacy iframe experiments remain sandboxed. Real-target replay uses dedicated browser contexts and captured page content never receives FAULTLINE UI-origin privileges.

# Durability and recovery

Session metadata is transactionally persisted. Long-running operations and intervention leases are durable.

Restart recovery reconciles unfinished operations, verifies restoration and marks uncertain targets dirty before any further reduction. Receipts bind digests of session, target, journey, oracle and adapter versions.

# Migration

Preserve:

- revision/stale-mutation rejection;
- ddmin/hierarchical reduction;
- FAIL/PASS/UNRESOLVED semantics;
- sandbox policy;
- cancellation cleanup;
- result revision lineage;
- recovery concepts;
- exact-tree deployment gates;
- legacy behavior through `legacy-case`.

Replace:

- `html/css/js/oracle` as universal session model;
- single browser runtime as only execution host;
- source-only frontier;
- hidden integration panel;
- textarea-centric main UI;
- hard-coded framework assumptions.

The V2 branch is not merged wholesale. Proven pieces are selectively ported into V3.

# Testing

## Unit/contract

Schema/versioning, revision conflict, graph invariants, capability negotiation, lease state machines, receipt binding, redaction and adapter conformance.

Every adapter must prove detect-without-mutation, stable capability reporting, typed capture, replay declaration, intervention/restore behavior, cancellation, dirty-target handling and malformed input handling.

## Fixture matrix

Required fixtures:

- vanilla DOM/CSS/JS;
- React + Vite SPA;
- Next.js 16 App Router with Server/Client Components, route handler and server-action/error instrumentation;
- Vue/Vite generic fallback;
- SvelteKit generic fallback;
- service-worker cache failure;
- WebSocket/event-driven failure;
- third-party request/script failure;
- Playwright trace import;
- HAR import;
- OTel-correlated server error;
- legacy case.

Frameworks lacking deep adapters must still pass generic capture/replay and explicitly report limitations.

## UI/browser

Real-browser tests cover multi-page routing, New Session, local/hosted connection states, Local Network Access denial handling, capability matrix, Capture, baseline gate, Fault Map list fallback, Reduce safety/cancel, read-only Evidence, Integrations verification, keyboard/ARIA/reduced motion and 390px mobile overflow.

## End-to-end release gate

A V3 production candidate must demonstrate:

1. connect a real fixture without converting it to source text;
2. record/import journey;
3. define oracle;
4. establish baseline;
5. enumerate adapter dimensions;
6. apply an intervention;
7. verify restoration;
8. reduce a frontier;
9. persist/reload;
10. inspect via CLI;
11. inspect/run via MCP;
12. export/re-import evidence;
13. preserve legacy-case behavior.

# Release architecture

The existing `faultline-webmcp` Vercel project remains the sole production web project unless the user explicitly changes that decision.

Migrating the web app from the current static build to Next.js must preserve exact source/deployment provenance. The release workflow may change build mechanics, but it must still bind the candidate Git SHA/tree, stage into the same Vercel project, verify the deployed artifact/build identity, promote only a green candidate and advance `production` only after live verification.

Because Next/Vercel may produce framework-generated assets rather than byte-identical source files, the V3 release gate will compare a deterministic build manifest containing content digests and build/source metadata rather than pretending raw source-file parity still proves the deployed runtime. Legacy static releases retain the existing byte-parity path until migration.

CLI/bridge packages require reproducible builds, checksums and provenance before production-ready claims.

# Ordered implementation sub-projects

## V3.1 — Protocol/session kernel + legacy compatibility

- TypeScript workspace foundation;
- runtime schemas/versioning;
- revisioned DebugSession store;
- protocol errors/idempotency/cancellation;
- causal graph core;
- legacy-case adapter wrapping current engine;
- legacy regression suite.

## V3.2 — Local coordinator + generic browser

- CLI/bridge + local UI serving;
- pairing/security/LNA-aware optional hosted pairing;
- Playwright worker;
- browser observations;
- journey record/replay;
- baseline gate;
- durable operations/intervention leases;
- local/staging target policy.

## V3.3 — Product UI

- Next.js 16/React 19 shell;
- Home;
- New Session;
- Sessions/Overview;
- Capture;
- Reproduce;
- Fault Map;
- Reduce;
- Evidence;
- Integrations;
- Docs;
- responsive/accessibility matrix.

## V3.4 — Artifact adapters

- Playwright trace;
- HAR;
- portable session bundles;
- artifact-mode UX and provenance.

## V3.5 — React/Next + OTel deep integration

- SDK;
- client/server instrumentation helpers;
- route/error/span correlation;
- adapter-backed deeper dimensions;
- Next fixture matrix.

## V3.6 — MCP 2026 + CI

- stateless MCP translation;
- explicit session/operation handles;
- CI commands/artifacts;
- structured JSON;
- optional WebMCP compatibility.

## V3.7 — Additional framework adapters

- Nuxt/Vue;
- SvelteKit;
- deeper support only through stable public instrumentation surfaces;
- generic browser remains fallback.

Each sub-project gets its own implementation plan and must leave production recoverable.

# Production-readiness acceptance

V3 is production-ready only for its explicitly declared capability set when:

- real React/Vite and Next targets connect without manual source conversion;
- capture records action, DOM, console/runtime and network evidence;
- replay establishes a deterministic fixture failure;
- reduction cannot start without baseline;
- supported journey/network/storage/legacy dimensions can be intervened on;
- restoration is verified;
- crash recovery cannot silently lose a target mutation;
- evidence is receipt/provenance-derived;
- trace/HAR input is treated as untrusted;
- CLI structured output works;
- MCP uses explicit session/revision handles;
- web/local UI is truly multi-page/task-specific;
- capability limits are visible;
- full test/security suites pass;
- deployment is verified in the same Vercel project;
- a recoverable verified source checkpoint is created.

# Explicit first-release non-goals

- arbitrary server-code mutation without SDK/adapter support;
- universal AST reduction for every language/framework;
- mutating third-party production sites;
- credential harvesting;
- multitenant cloud execution;
- billing/accounts/collaboration;
- replacing observability backends;
- claiming causality from correlation;
- claiming a global minimum across incomparable dimensions.

# Final invariant

FAULTLINE V3 must remain truthful when technology changes. A future framework should require a new or updated adapter capability—not a rewrite of the session, experiment, evidence, UI or agent architecture.

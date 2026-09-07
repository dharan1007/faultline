# FAULTLINE V3 — Causal Debugging Platform Design

## Status

Approved architectural replacement for Product Workspace V2.

Implementation branch: `feat/faultline-v3-causal-platform`

Baseline: verified production commit `8e8dacc4d6c142b9f6b583af5de69db7a95d4d46`.

The partially implemented `feat/product-workspace-v2` branch is preserved as a historical checkpoint but is not the architecture to ship.

## Decision

FAULTLINE V3 is not an HTML/CSS/JavaScript reducer with framework adapters bolted on top.

It is a local-first causal debugging platform whose canonical object is a **debug session** made of observations, replayable actions, controllable dimensions, experiments, causal evidence, and a revisioned result.

The existing deterministic reducer, revision guards, cancellation semantics, evidence lineage, sandbox policies, and WebMCP work are retained as proven engine capabilities. Raw HTML/CSS/JS source reduction becomes one adapter/capability rather than the product model.

## Why V2 is being replaced

V2 improved navigation but retained the wrong abstraction:

- a case was still exactly `html + css + js + oracle`;
- execution still centered on rendering candidate source into an iframe;
- JavaScript reduction remained statement/lexical rather than program/framework aware;
- server execution, Server Components, server actions, edge middleware, route loaders, APIs, service workers, dynamic imports, framework state and distributed traces were outside the model;
- integrations were still browser-runtime conveniences rather than first-class product surfaces;
- multiple pages did not change how FAULTLINE actually understood a modern application.

Modern applications routinely split behavior across browser, server, edge and external services. A production debugger therefore cannot truthfully map every failure back to three text boxes.

## Product promise

Given a reproducible failure in a web application, FAULTLINE should answer:

1. **What happened?**
2. **Can the failure be reproduced deterministically?**
3. **Which controllable parts of the execution are causally necessary for the failure?**
4. **What is the smallest evidence-backed reproducer FAULTLINE can prove within the capabilities exposed by this target?**
5. **What evidence proves that conclusion?**
6. **How can a developer or agent consume and continue the investigation?**

FAULTLINE must never claim global minimality or causal control over a dimension the active target adapter cannot observe and manipulate safely.

## Architectural principles

### 1. Execution evidence, not source-file assumptions

DOM, source text, framework components, network requests, route transitions, feature flags, storage keys and server spans are all possible evidence or reduction dimensions. None is universally canonical.

### 2. Capability negotiation

Every adapter declares the capabilities it can actually provide. The engine only schedules experiments over declared, validated capabilities.

### 3. Replay before reduction

FAULTLINE never starts causal reduction until it has a baseline replay that reproduces the configured failure under the selected stability policy.

### 4. Deterministic evidence lineage

Every observation and experiment is bound to a session revision, target snapshot, journey revision, oracle revision and adapter version.

### 5. Local-first execution

Private source, localhost applications, authenticated developer environments and destructive experiment controls stay on the developer's machine by default.

The hosted web application may render and analyze portable artifacts, but it is not an arbitrary remote-code execution service or an SSRF proxy.

### 6. Safe degradation

Generic browser capture should work for nearly any standards-compliant web application. Framework-specific/server-specific capabilities are additive. Missing capabilities reduce what FAULTLINE can prove; they do not make the session dishonest.

### 7. One protocol, many surfaces

Human web UI, CLI, SDK, MCP and optional WebMCP use the same versioned orchestration contract.

## Alternatives considered

### A. Keep V2 and add framework adapters

Rejected as the primary architecture. It is fast but forces modern frameworks back into an HTML/CSS/JS case model and leaves server/distributed failures fundamentally second-class.

### B. Causal session platform with adapter capabilities — selected

Retains the proven deterministic core while changing the canonical product model to execution evidence + controllable dimensions. Supports future frameworks without encoding framework internals into the core protocol.

### C. Fully hosted observability/Sentry-style platform

Deferred. It would require accounts, collectors, multitenant storage, ingestion billing, retention policy, data residency and a much larger security/compliance surface before the causal engine itself is proven.

V3 keeps the architecture compatible with a future hosted control plane without requiring one for the first production release.

# Canonical model

## DebugSession

A session is the authoritative investigation object.

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

The schema is versioned and validated at every external boundary.

## TargetDescriptor

Supported target classes:

- `local_url` — application running on localhost/LAN under explicit developer control;
- `staging_url` — remote environment explicitly selected for experiments;
- `live_url_capture` — remote URL capture/replay in read-only/safe mode by default;
- `playwright_trace` — imported Playwright trace artifact;
- `har` — imported HTTP Archive;
- `ci_failure` — CI metadata + trace/artifacts;
- `otel_trace` — OpenTelemetry trace bundle/collector handoff;
- `legacy_case` — V2 `.faultline.json` compatibility adapter.

A target contains identity and policy, not credentials. Credentials remain in the local secret provider and are referenced by opaque handles.

## EnvironmentSnapshot

Captures inputs that can affect reproduction:

- browser family/version;
- viewport/device/emulation;
- locale/timezone;
- user agent and relevant client hints;
- route/URL;
- build/commit identity when known;
- framework/runtime versions when adapters can identify them;
- selected feature flags;
- permitted storage/cookie snapshot references;
- server/edge deployment identifiers when instrumented;
- adapter versions and capture policy.

Secret values must be redacted or represented by opaque references unless the user explicitly exports them.

## ReproductionJourney

A journey is a revisioned sequence of semantic actions, not just Playwright source text.

Action kinds initially include:

- navigate;
- click;
- fill;
- select;
- press;
- submit;
- wait-for-condition;
- upload-file reference;
- custom adapter action.

Each action stores a resilient selector/locator description, timing policy, input redaction metadata and captured pre/post observations.

The journey can originate from:

- interactive recorder;
- Playwright trace import;
- Playwright test import/adapter;
- agent-created steps;
- manually authored steps.

## FailureOracle

V3 keeps deterministic oracle semantics but generalizes the observation domain.

Initial oracle kinds:

- DOM exists/absent;
- DOM property/attribute/text value;
- computed style value;
- console/runtime error signature;
- unhandled rejection signature;
- HTTP request/response status/payload predicate;
- missing/unexpected request;
- navigation/route outcome;
- screenshot/visual threshold where explicitly configured;
- performance threshold with stability policy;
- OpenTelemetry span status/error/attribute predicate;
- adapter-defined typed oracle.

An oracle is immutable once a reduction run begins. Changing it creates a new oracle revision and invalidates incompatible baseline claims.

## Observation

Observations are immutable, timestamped and source-typed:

- journey action events;
- DOM snapshots;
- console messages;
- page errors;
- network request/response metadata;
- storage mutations;
- route/navigation events;
- performance entries;
- screenshots;
- source map references;
- framework adapter events;
- server/edge spans;
- OpenTelemetry spans/log references;
- WebSocket/service-worker events when supported.

Large bodies/screenshots/traces live as artifacts referenced by digest rather than copied into every event.

## CausalDimension

A dimension is something the active adapter can safely intervene on.

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

Examples:

- user journey step;
- DOM subtree generated by a controlled fixture;
- CSS rule/module;
- JS bundle/chunk/module in a controlled local build;
- React/Next route segment where adapter support exists;
- network request;
- request field/header/query parameter;
- response fixture branch;
- cookie/localStorage/IndexedDB key;
- feature flag;
- third-party script/SDK;
- service worker;
- route middleware;
- server action/request handler/span in an instrumented application;
- legacy HTML/CSS/JS structural unit.

The engine never fabricates dimensions from observations alone. A dimension must include an executable intervention supplied by an adapter.

# Capability system

## Adapter contract

Every adapter implements a common capability descriptor.

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

Capabilities are independently versioned. Example capability IDs:

- `browser.capture.dom`
- `browser.capture.console`
- `browser.capture.network`
- `browser.replay.actions`
- `browser.intervene.storage`
- `browser.intervene.request`
- `source.reduce.legacy`
- `framework.react.observe`
- `framework.next.route_context`
- `framework.next.server_error_context`
- `runtime.node.otel`
- `artifact.playwright.trace.read`
- `artifact.har.read`

## Safety rules

- A read-only target may capture and analyze but cannot run mutating interventions.
- Reversible interventions must return a restoration lease and pass restoration verification.
- Destructive interventions require explicit user approval bound to session revision, target identity and intervention plan.
- Network interception must be scoped to the selected browser context/target, not system-wide networking.
- No adapter receives secret values it did not explicitly declare a need for.
- Adapter failure never silently changes the oracle result to PASS/FAIL; infrastructure uncertainty yields `UNRESOLVED`.

# Initial adapter portfolio

## Generic browser adapter — required baseline

Implemented with Playwright/CDP where available.

Provides:

- navigation and action replay;
- DOM snapshots;
- console/page errors;
- network events;
- screenshots;
- browser storage observations;
- request interception in controlled replay contexts;
- journey-step interventions;
- safe storage/request dimensions where explicitly enabled.

This is the universal fallback and must not require React/Next/Vue/Svelte.

## Playwright trace adapter — required

Imports trace artifacts and reconstructs:

- actions;
- DOM snapshots;
- console events;
- network traffic;
- screenshots;
- source locations/metadata where present.

Artifact-only sessions may analyze causal candidates but cannot claim intervention proof unless a replayable target is also attached.

## HAR adapter — required

Provides portable network evidence and request topology. HAR alone is observational. It becomes intervention-capable only when attached to a replayable browser target.

## Legacy case adapter — required

Preserves existing V2 functionality and tests:

- HTML subtree reduction;
- CSS hierarchical reduction;
- statement-level JavaScript reduction;
- iframe sandbox execution;
- existing oracle compatibility;
- existing revision/cancellation/evidence invariants.

Legacy support is explicitly labeled `legacy-source` in the UI and protocol.

## React/Next adapter — first deep framework adapter

V3's first framework-specific adapter targets React 19 + Next.js 16 patterns without depending on unstable private React internals as the only source of truth.

It may consume:

- framework version/build metadata;
- client instrumentation events;
- route transition events;
- Next server `instrumentation`/`onRequestError` context;
- OpenTelemetry spans;
- source maps/build manifest metadata available to the user's own project;
- optional FAULTLINE SDK instrumentation.

It can expose deeper dimensions only when the application has installed/enabled the relevant instrumentation. Server Components and server actions are never inferred solely from the browser DOM.

## Vue/Nuxt, SvelteKit, Vite adapters — protocol-ready, shipped incrementally

The core protocol must not require code changes to support them. Each adapter follows the same detection/capability/intervention contract.

Initial V3 production readiness does not require pretending all framework adapters have equal depth. The UI shows exact capability coverage per session.

## OpenTelemetry adapter — required protocol, initially ingest-focused

Maps span/trace identity into FAULTLINE observations and causal graph edges.

Because browser OpenTelemetry instrumentation remains experimental, FAULTLINE treats browser OTel as an optional signal, not the universal browser capture mechanism.

# Execution modes

## Local Mode — primary developer path

`faultline` CLI starts a local coordinator and browser worker.

Responsibilities:

- connect to localhost/staging targets;
- launch/manage Playwright browser contexts;
- store session database/artifacts locally;
- load adapter plugins;
- keep credentials in a local secret provider;
- execute interventions/replay/reduction;
- expose the versioned FAULTLINE protocol to UI/CLI/MCP.

The coordinator listens on loopback by default, uses an ephemeral pairing credential, validates `Host`/`Origin`, and rejects DNS-rebinding style origin confusion.

## Artifact Mode — zero-install inspection

The hosted web app can import portable session bundles, Playwright traces and HAR files for local-in-browser inspection when feasible.

Artifacts are not uploaded by default merely to view them. Large browser-only parsing paths should use workers to avoid blocking the UI.

Artifact mode is read-only unless paired with a local coordinator/replay target.

## Hosted control plane — future-compatible, not required for V3 first release

The protocol permits a later authenticated remote coordinator, but V3 does not require multi-tenant cloud execution, persistent accounts or arbitrary remote-code execution.

# Coordinator architecture

```text
Human UI / CLI / MCP / WebMCP
            |
            v
     Protocol Gateway
            |
            v
   Session Orchestrator
      /      |       \
     v       v        v
 Capture   Replay   Reduction
     \       |       /
      \      v      /
       Adapter Host
            |
            v
 Browser / Framework / Trace / OTel / Legacy adapters
            |
            v
     Target + Artifacts
```

## Protocol Gateway

- versioned request/response schemas;
- authentication/pairing;
- request IDs and idempotency keys;
- cancellation;
- event streaming;
- error normalization;
- MCP translation;
- optional WebMCP translation.

## Session Orchestrator

- authoritative revisioned session state;
- target snapshot binding;
- baseline policy;
- experiment leases;
- causal graph updates;
- evidence receipts;
- crash recovery.

## Capture service

Captures observations without deciding causality.

## Replay service

Replays a journey against a target snapshot and returns a typed oracle result plus evidence.

## Reduction service

Selects candidate dimensions, applies interventions through the adapter, replays, records results, restores target state and updates the causal graph.

The existing ddmin/hierarchical reducer becomes one reduction strategy rather than the entire system.

# Reproduction and determinism

Before causal reduction, FAULTLINE runs a configurable baseline stability gate.

Default policy for deterministic functional failures:

- at least 2 consecutive reproductions;
- identical oracle outcome;
- target snapshot identity unchanged;
- no unresolved infrastructure failure.

For bounded-variance oracles such as performance thresholds, the oracle defines the repetition/sample policy explicitly.

A baseline stores:

- journey revision;
- oracle revision;
- target/build identity;
- environment snapshot digest;
- adapter/capability versions;
- result;
- evidence digests.

If any bound identity changes, existing baseline/reduction claims become stale rather than silently reused.

# Causal experiment lifecycle

```text
plan
 -> validate capabilities + safety
 -> bind target/session/oracle/journey revisions
 -> acquire intervention lease
 -> apply intervention
 -> verify intervention
 -> replay journey
 -> evaluate oracle
 -> capture evidence
 -> restore
 -> verify restoration
 -> persist experiment receipt
 -> update causal graph
```

A crash after intervention but before restoration is recoverable because the lease is durable and the adapter must support reconciliation for mutating capabilities.

If exact restoration cannot be proven, the target is marked dirty and further experiments stop until the user resets/reconnects it.

# Causal graph

The graph is evidence-backed, not an AI-generated explanation graph.

Node classes:

- journey action;
- observation/event;
- causal dimension;
- oracle;
- experiment;
- artifact;
- target/runtime span.

Edge classes:

- occurred-before;
- triggered;
- observed-in;
- depends-on;
- intervened-on;
- preserved-failure;
- removed-failure;
- unresolved;
- derived-from.

LLMs/agents may summarize the graph, suggest candidate experiments and explain evidence, but they may not create authoritative causal edges without experiment/observation provenance.

# Repository architecture

V3 migrates toward a TypeScript workspace while keeping the current production release deployable during development.

```text
apps/
  web/                 product UI
  cli/                 CLI entry point
  bridge/              local coordinator/bridge process

packages/
  protocol/            schemas, errors, versioning, event types
  session/             revisioned session state + persistence interfaces
  engine/              reduction strategies + causal graph rules
  orchestrator/        capture/replay/experiment lifecycle
  browser/             Playwright/CDP worker
  sdk/                 application instrumentation SDK
  mcp/                 MCP 2026 adapter
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

apps/web/tests/
integration-tests/
```

## Technology choices

### TypeScript

All new protocol/orchestrator/adapter packages use strict TypeScript. Runtime schemas are validated at boundaries; TypeScript types alone are insufficient for imported artifacts or MCP/CLI requests.

### Web application

The product UI may use Next.js 16/React 19 for routing/layout/server-capable documentation surfaces, but the debugging engine must not depend on React/Next internals. The local coordinator remains independently usable by CLI/MCP.

### Browser automation

Playwright is the first-class browser runner. CDP-specific features are capability-gated so Firefox/WebKit/generic browser support does not falsely claim Chromium-only functionality.

### Persistence

Local coordinator uses a durable embedded store with transactional semantics for session metadata and a content-addressed artifact directory for large artifacts.

The storage interface is abstracted so a future remote store can be introduced without changing session protocol objects.

# Product UI / UX

The V3 UI is a real multi-page application. Each page is designed around one job and has different information density; it is not the same card grid repeated under different routes.

## Global shell

Desktop:

- persistent left product rail;
- compact top command/status bar;
- main task canvas;
- optional contextual inspector drawer;
- connection/session indicator always visible.

Primary rail:

- Home
- New Session
- Sessions
- Integrations
- Docs

Session-scoped rail/context appears once a session is open:

- Overview
- Capture
- Reproduce
- Fault Map
- Reduce
- Evidence

Visual system:

- near-black/black surfaces;
- white/neutral typography;
- restrained pink for selected/causal emphasis;
- semantic result colors accompanied by explicit labels/icons;
- minimal container chrome;
- dividers and hierarchy instead of excessive cards;
- mono typography only for IDs/source/evidence, not all UI copy;
- high-density data views where appropriate;
- full keyboard navigation and reduced-motion behavior.

## Home

Purpose: operational entry/dashboard.

Contains:

- local coordinator connection state;
- recent sessions;
- last reproduction result;
- active/stale/dirty target state;
- recent evidence receipts;
- one clear `New session` action;
- quick import of trace/HAR/session bundle.

No source editor appears on Home.

## New Session

A focused wizard, not a dashboard.

Step 1 — source:

- Local app
- Staging/live URL
- Playwright trace
- HAR
- CI failure/artifact
- OpenTelemetry trace
- Legacy case

Step 2 — connection/capabilities:

- target identity;
- detected framework/runtime;
- available adapters;
- capability coverage;
- permission/safety mode.

Step 3 — reproduction setup:

- record/import journey;
- choose/create oracle;
- run baseline.

A session does not enter Reduce until baseline is valid.

## Session Overview

Shows the current truth of the investigation:

- target/build/environment identity;
- journey/oracle revisions;
- baseline stability;
- capability matrix;
- latest result;
- causal progress;
- blockers such as dirty target or missing adapter.

## Capture

Timeline-centric workspace.

Main area:

- filmstrip/screenshots when available;
- action timeline;
- DOM/navigation/runtime events;
- network waterfall/table;
- console/errors.

Inspector:

- selected event detail;
- request/response metadata;
- source/stack reference;
- correlated span IDs;
- redaction state.

Capture can record a new journey or inspect imported artifacts.

## Reproduce

Focused baseline builder.

- journey editor/timeline;
- oracle builder;
- environment controls;
- replay console;
- repetition/stability indicator;
- exact reasons for PASS/FAIL/UNRESOLVED.

No causal reduction controls appear until the baseline gate passes.

## Fault Map

Graph-centric investigation surface.

- causal graph canvas;
- filters by browser/network/framework/server/action/dimension;
- evidence-backed edges only;
- right inspector for node provenance and related experiments;
- list fallback for accessibility and low-power/mobile contexts.

The graph is never required to understand the result; evidence remains available as tables/timelines.

## Reduce

Three-zone experimental workspace:

Left:
- candidate dimension groups;
- capability/safety badges;
- pins;
- dependencies.

Center:
- active experiment/replay progress;
- before/after journey evidence;
- current reduction frontier;

Right:
- oracle outcome;
- experiment receipt;
- intervention/restoration status;
- selected dimension provenance.

Top command bar:
- Run candidate
- Autopilot
- Pause/cancel
- Pin
- Save checkpoint

Autopilot cannot bypass safety approvals or capability limits.

## Evidence

Read-only report surface.

Contains:

- final/current oracle state;
- target + build identity;
- journey summary;
- proven necessary dimensions;
- dimensions proven unnecessary within tested frontier;
- unresolved dimensions;
- experiment count;
- reduction metrics appropriate to each dimension class;
- causal graph summary;
- chronological receipts;
- export actions.

Never report a single misleading “87% reduced” metric across incomparable dimensions. Source-size reduction, journey-step reduction, request reduction and other classes are reported separately.

## Integrations

First-class setup hub:

- CLI install/setup;
- local coordinator status;
- SDK integration;
- Next/React instrumentation;
- Playwright/CI integration;
- HAR/trace import;
- OpenTelemetry setup;
- MCP endpoint/config;
- optional WebMCP status;
- adapter capability documentation.

Each integration has:

- Detect
- Setup
- Verify connection
- Test capture
- Troubleshoot

The page shows actual connected state rather than documentation-only copy.

## Docs

Documentation is separately routed and searchable. It contains protocol/schema reference, adapters, security model, tutorials and limitations.

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
```

Commands emit structured JSON with `--json` for agents/CI.

CLI output never claims success without a persisted receipt/session revision.

# SDK

The SDK is optional. Generic browser sessions do not require application code changes.

SDK responsibilities:

- framework/runtime identification;
- custom observation events;
- feature flag registration;
- safe controllable-dimension registration;
- correlation IDs across browser/server;
- redaction hooks;
- Next/server instrumentation helpers;
- OpenTelemetry correlation.

SDK intervention APIs require explicit registration by application code; FAULTLINE cannot mutate arbitrary server state merely because the SDK is installed.

# MCP 2026 interface

MCP is a translation over the same protocol gateway, not a separate engine.

The server follows the current stateless MCP model. Stateful investigations use explicit `sessionId`/revision handles in tool arguments rather than hidden protocol sessions.

Tool groups:

- sessions: create/list/inspect/import;
- targets: detect/connect/capabilities;
- capture: start/stop/events;
- journey: inspect/update;
- oracle: define/test;
- reproduce: run/baseline;
- dimensions: list/inspect/pin;
- experiments: plan/run/cancel;
- reduction: run/status;
- evidence: graph/history/export.

Mutation tools require expected revision/plan identity. Long-running work returns explicit operation IDs and supports cancellation/status rather than holding implicit browser state.

Optional WebMCP exposes the subset that is meaningful inside the FAULTLINE web UI, backed by the same session handles.

# API/protocol semantics

Every mutation request includes:

- request ID;
- idempotency key where replay could duplicate effects;
- session ID;
- expected session revision;
- target snapshot identity when target mutation is possible;
- adapter capability/version binding.

Normalized result classes:

- `ok`;
- `conflict`;
- `invalid_request`;
- `capability_missing`;
- `safety_approval_required`;
- `target_dirty`;
- `unresolved`;
- `cancelled`;
- `internal_error`.

Oracle result remains separately typed as `PASS | FAIL | UNRESOLVED` and is never conflated with transport/operation success.

# Security model

## Local bridge

- binds loopback by default;
- ephemeral pairing/auth token;
- strict Host and Origin validation;
- CORS allowlist;
- anti-DNS-rebinding checks;
- no unauthenticated mutation endpoints;
- session-scoped capabilities;
- request size/rate limits;
- token rotation on restart/pairing reset.

## Target safety

- default remote/live mode is capture/read-only;
- mutating experiments require user-controlled local/staging target or an explicitly approved target policy;
- destructive adapter capability requires exact-plan approval;
- restoration verification required after reversible interventions;
- target marked dirty when reconciliation fails.

## Secrets

- never written into portable session JSON by default;
- represented by opaque local secret handles;
- redaction occurs before portable artifact/export boundaries;
- no secret exposure to MCP tool descriptions/results unless explicitly requested by an authorized user and allowed by policy.

## Imported artifacts

- treat as untrusted;
- bounded decompression/size limits;
- archive path traversal protection;
- no execution of imported source;
- parse in isolated workers/processes where practical;
- sanitize rendered text/HTML.

## Browser execution

The existing sandboxed legacy runner remains isolated. Real target replay uses a dedicated browser context and explicit target policy. Captured page content never gains privileges in the FAULTLINE UI origin.

# Durability and recovery

Local session metadata is transactionally persisted.

Long-running experiments use durable operation records and intervention leases.

On restart:

1. recover incomplete operations;
2. reconcile outstanding intervention leases with adapters;
3. verify target restoration;
4. mark session/target dirty if uncertain;
5. do not resume reduction until safety state is known.

Evidence receipts include digests of bound session/oracle/journey/target revisions and adapter version.

# Compatibility and future-proofing

The core engine knows capability IDs and typed observations/dimensions, not framework internals.

A new framework adapter should be addable without changing:

- session schema fundamentals;
- experiment lifecycle;
- oracle result semantics;
- evidence receipt rules;
- UI page architecture;
- MCP session/revision model.

Protocol evolution uses explicit schema versions and capability versions.

Unknown optional observation types are preserved when safely possible; unknown mutation/intervention capabilities are never executed.

# Migration from current FAULTLINE

## Preserve

- revision store and stale-mutation rejection;
- deterministic ddmin/hierarchical strategy;
- legacy structural units;
- FAIL/PASS/UNRESOLVED oracle semantics;
- experiment sandbox policy;
- cancellation cleanup;
- operation result revision lineage;
- bounded recovery concepts;
- production exact-tree deployment gates;
- current legacy WebMCP behavior through compatibility adapter while the V3 MCP surface is introduced.

## Replace

- `html/css/js/oracle` as universal canonical case;
- one static browser runtime as the only execution host;
- source-only reduction frontier;
- integration as a hidden browser feature;
- UI organized around source textareas;
- hard-coded framework assumptions.

## V2 branch

`feat/product-workspace-v2` remains untouched as a recoverable checkpoint. V3 implementation starts from production baseline and selectively ports proven pieces rather than merging the rejected architecture wholesale.

# Testing strategy

## Unit

- schema validation/versioning;
- revision/conflict rules;
- causal graph invariants;
- capability negotiation;
- intervention lease state machine;
- receipt digest/binding;
- adapter contract conformance;
- redaction.

## Contract

Every adapter runs the same conformance suite:

- detect without mutation;
- report stable capability IDs;
- capture typed observations;
- replay or explicitly declare no replay;
- intervention/restore semantics;
- cancellation;
- dirty-target behavior;
- malformed target/artifact handling.

## Fixture matrix

Required integration fixtures:

- vanilla DOM/CSS/JS;
- React + Vite SPA;
- Next.js 16 App Router with Server + Client Components, route handlers and server action/error instrumentation;
- Vue/Vite SPA generic fallback;
- SvelteKit generic fallback;
- service worker caching failure;
- WebSocket/event-driven failure;
- third-party script/request failure;
- imported Playwright trace;
- imported HAR;
- OpenTelemetry-correlated server error;
- legacy `.faultline.json` case.

Frameworks without deep adapters must still pass generic-browser capture/replay tests and clearly report capability limitations.

## Browser/UI

Real Chromium tests cover:

- multi-page route architecture;
- New Session wizard;
- coordinator pairing state;
- capability matrix;
- Capture timeline;
- baseline gate;
- Fault Map keyboard/list fallback;
- Reduce safety/cancel flows;
- read-only Evidence;
- Integrations verification;
- 390px mobile overflow/navigation;
- keyboard/focus/ARIA/reduced motion.

Cross-browser replay is added where capabilities exist; Chromium-only CDP features are never treated as universal.

## End-to-end

At minimum, production release gates must prove:

1. create/connect a local fixture session;
2. record/import a journey;
3. define oracle;
4. establish deterministic baseline;
5. enumerate real adapter dimensions;
6. run an intervention;
7. restore target;
8. reduce a frontier;
9. persist/reload session;
10. inspect via CLI;
11. inspect/run through MCP;
12. export and re-import portable evidence;
13. preserve legacy case behavior.

# Release architecture

The existing single `faultline-webmcp` Vercel project remains the only production web project unless the user explicitly changes that decision.

V3 web deployment continues exact-tree staging/parity/promotion verification. If the shipped asset model changes from the current static manifest, the replacement build manifest must still enumerate every deployable artifact and verify staged/public parity.

CLI/bridge packages require reproducible package builds, checksums and provenance before being called production-ready.

No release is promoted merely because UI tests pass; protocol, adapter, bridge, security and end-to-end fixture gates are release blockers.

# Implementation decomposition

This architecture is too large to implement safely as one undifferentiated patch. Implementation is divided into ordered sub-projects that share this spec.

## V3.1 — Protocol + session kernel + legacy compatibility

- TypeScript workspace foundation;
- versioned schemas;
- revisioned DebugSession store;
- protocol errors/cancellation/idempotency;
- causal graph core;
- legacy-case adapter wrapping current engine;
- tests proving current legacy behavior remains available.

No UI migration is required to declare V3.1 complete.

## V3.2 — Local coordinator + generic browser capture/replay

- CLI/bridge;
- pairing/security boundary;
- Playwright browser worker;
- generic browser observations;
- journey recorder/replay;
- baseline gate;
- durable operations/intervention leases;
- local/staging target policy.

## V3.3 — Product UI

- Next.js 16/React 19 application shell;
- Home;
- New Session;
- Session Overview;
- Capture;
- Reproduce;
- Fault Map;
- Reduce;
- Evidence;
- Integrations;
- Docs;
- responsive/accessibility test matrix.

## V3.4 — Portable artifact adapters

- Playwright trace;
- HAR;
- portable session bundle;
- artifact-mode UI;
- export/import provenance.

## V3.5 — React/Next + OTel deep integration

- SDK;
- Next client/server instrumentation helpers;
- route/error/span correlation;
- additional causal dimensions where intervention can be proven;
- Next fixture matrix.

## V3.6 — MCP 2026 + CI integration

- stateless MCP adapter over protocol gateway;
- explicit session handles;
- operation IDs/cancellation;
- CI commands/artifact upload/download hooks;
- structured JSON output;
- optional WebMCP compatibility surface.

## V3.7 — Additional framework adapters

- Nuxt/Vue;
- SvelteKit;
- framework-specific depth driven by stable public instrumentation surfaces;
- generic adapter remains fallback.

Each sub-project gets its own implementation plan and must leave production deployable.

# Production-readiness acceptance criteria

FAULTLINE V3 may be described as production-ready for its declared capability set only when all are true:

- a real local React/Vite and Next.js target can be connected without manually converting it to raw source text;
- capture records browser actions, console/runtime errors, network and DOM evidence;
- replay reproduces at least one fixture failure deterministically;
- baseline stability is enforced before reduction;
- at least journey/network/storage/legacy source dimensions can be experimentally intervened on where supported;
- interventions are restored and verified;
- crash/restart cannot silently leave a target mutation untracked;
- Evidence is generated entirely from receipts/provenance;
- imported traces/HAR are handled as untrusted artifacts;
- CLI works with structured JSON output;
- MCP operates using explicit session handles and revision guards;
- Web UI exposes multiple task-specific pages, not one giant workbench;
- all capability limitations are shown explicitly;
- full unit/contract/integration/browser/security suites pass;
- exact deployed web tree is verified in the existing Vercel project;
- a recoverable verified source checkpoint exists for the deployed release.

# Explicit non-goals for first V3 production release

- automatic arbitrary server-code mutation without SDK/adapter support;
- universal AST reduction for every language/framework;
- production mutation of third-party sites;
- hidden credential harvesting;
- multi-tenant cloud execution;
- billing/accounts/team collaboration;
- replacing Sentry/Datadog/OpenTelemetry as an observability backend;
- claiming causality from correlation alone;
- claiming global minimality across incomparable causal dimensions.

# Final architectural invariant

FAULTLINE V3's core must remain truthful under technology change.

If a future framework changes how it renders, routes, streams, hydrates or executes server functions, FAULTLINE should need a new/updated adapter capability—not a rewrite of the session, experiment, evidence, UI or agent architecture.

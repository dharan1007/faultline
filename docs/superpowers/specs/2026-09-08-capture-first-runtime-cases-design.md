# FAULTLINE Capture-First Runtime Cases — Design Specification

Date: 2026-09-08
Branch: `feat/capture-first-runtime-cases`
Production baseline: `0a62c0159d43e9f963a804804328ed7503b1306f`

## 1. Decision

FAULTLINE will stop treating `html + css + js + oracle` as the primary user input model. The product entrypoint becomes a running website or captured browser session. Raw HTML/CSS/JS editing remains available only as an advanced legacy adapter.

The user-facing product goal is:

```text
URL / current browser tab / trace / saved investigation
                     ↓
                  Capture
                     ↓
                 Reproduce
                     ↓
            Establish failure oracle
                     ↓
              Discover causal axes
                     ↓
          Probe / reduce / verify causality
                     ↓
             Evidence + minimal reproducer
```

This change is source-agnostic by design. FAULTLINE must not require the user to know whether the target is React, Next.js, Vue, Nuxt, Svelte, SvelteKit, Angular, Astro, Web Components, server-rendered HTML, SPA, microfrontend, minified production JavaScript, partially WebAssembly-backed, or a mixture of those technologies.

## 2. Problem With The Current Product

The current production runtime validates a case as exactly four fields: `html`, `css`, `js`, and `oracle`. The reducer exposes three hard-coded axes: HTML elements, CSS rules, and JavaScript statements. This creates four material product problems.

First, it assumes source access. Many real users can reproduce a bug on a site they can visit but do not own or cannot obtain source code for.

Second, it assumes a single-document architecture. Modern applications distribute behavior across browser bundles, dynamic imports, server rendering, API calls, browser state, service workers, third-party scripts, route transitions, and asynchronous state.

Third, it makes the user describe implementation details before FAULTLINE can help. A causal debugging tool should discover the relevant technical units itself.

Fourth, the current built-in demonstration is too small to prove the product. A dialog, save button, and noise paragraph cannot demonstrate that FAULTLINE can isolate a failure in a realistic modern application.

The approved replacement is therefore capture-first and runtime-artifact-oriented.

## 3. Product Modes

FAULTLINE will expose five intake modes. The first three are primary; the last two are compatibility/advanced paths.

### 3.1 Public URL Capture

The user enters a public `http://` or `https://` URL and selects **Capture & Analyze**.

FAULTLINE launches an isolated Chromium capture session through the local/worker coordinator. The browser loads the actual page, records the runtime environment, captures browser-visible evidence, and allows the user to reproduce the failure.

This mode is intended for public sites and staging environments that do not require local/private-network access or user credentials.

A server-side HTML fetch is explicitly insufficient and will not be used as the primary capture implementation. Capture must execute a real browser so hydration, client-side routing, dynamic imports, event handlers, shadow DOM where observable, CSSOM state, browser APIs, console events, network traffic, and asynchronous behavior can be observed.

### 3.2 Capture Current Browser Tab

For authenticated websites, localhost, private staging systems, or pages whose state cannot safely be reconstructed in a remote browser, the user chooses **Capture Current Tab**.

A FAULTLINE browser companion communicates with the currently open page and records the reproduction journey from the user's own browser context. The user does not provide FAULTLINE with passwords or long-lived cookies.

The companion must be permission-scoped and explicit. Capture begins only after a user action and is visibly active. Sensitive values are redacted by default.

### 3.3 Trace / Session Import

The user may import a portable FAULTLINE investigation bundle, Playwright trace, HAR, or supported capture artifact. This is the artifact-mode path for CI failures and previously recorded investigations.

### 3.4 Saved Investigation

A previously persisted FAULTLINE investigation can be reopened with revision lineage, experiment history, evidence, and capture metadata intact.

### 3.5 Advanced Legacy Source Case

The existing HTML/CSS/JS case format remains available under **Advanced → Legacy source case**.

It is not shown as the default start state and is no longer the canonical product model.

## 4. Primary UI Information Architecture

The live website will no longer be a single large source-oriented workbench. It becomes a multi-surface product with persistent investigation identity and explicit navigation.

### 4.1 Home

Purpose: investigation dashboard.

Home contains:

- **New investigation** primary action.
- Recent investigations with URL, status, last revision, last verified outcome, and capture mode.
- Runtime/bridge health.
- Quick entry actions: Public URL, Current Tab, Import Trace, Complex Demo.
- No raw source editor.

### 4.2 New Investigation

Purpose: choose how FAULTLINE gets evidence.

Primary choices:

1. Public URL.
2. Capture Current Tab.
3. Import Trace / HAR / Investigation Bundle.
4. Complex Demo.
5. Advanced Legacy Source Case.

For Public URL, the page contains one primary URL input and an explicit **Capture & Analyze** action.

### 4.3 Capture

Purpose: record the real failing journey and runtime evidence.

Desktop layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ TARGET / browser / viewport / connection status              │
├─────────────────┬──────────────────────────┬─────────────────┤
│ JOURNEY         │ LIVE TARGET             │ OBSERVATIONS    │
│                 │                          │                 │
│ 1 open route    │ browser viewport         │ console         │
│ 2 click button  │                          │ network         │
│ 3 type value    │                          │ route           │
│ 4 save          │                          │ runtime         │
│                 │                          │ storage changes │
├─────────────────┴──────────────────────────┴─────────────────┤
│ Record / stop / replay / mark failure                        │
└──────────────────────────────────────────────────────────────┘
```

The journey recorder supports, at minimum:

- navigation;
- click;
- pointer activation;
- text entry;
- select/change;
- keyboard action;
- scroll;
- explicit wait;
- page/route transition;
- assertion marker.

Selectors recorded for replay must use a ranked strategy rather than one brittle CSS selector. Preferred identifiers are stable role/name/test-id/text relationships, with CSS/XPath-like fallback only when necessary. Each replay step stores selector alternatives and the selector strategy that succeeded.

### 4.4 Reproduce

Purpose: prove the failure is deterministic enough to reduce.

The user replays the captured journey. FAULTLINE shows repeated run outcomes and will not permit reduction until a baseline reproducibility requirement is met.

Default reproducibility gate:

- at least two consecutive matching FAIL outcomes;
- no unresolved action target;
- no uncontrolled navigation escape;
- no active dirty-target condition.

The user may override only through an explicit advanced control, and the evidence receipt must state that the baseline was unstable.

### 4.5 Oracle Builder

The default experience is symptom-first, not selector/property-first.

The page asks **What went wrong?** and offers:

- Element remained visible.
- Element disappeared.
- Element became unclickable.
- Wrong text/value appeared.
- Page or component crashed.
- JavaScript/runtime error occurred.
- Request failed or returned the wrong status.
- Navigation ended at the wrong route.
- Layout shifted unexpectedly.
- Visual region changed unexpectedly.
- Pick something on the screen.
- Advanced technical oracle.

FAULTLINE derives the technical oracle from the recorded target and observations.

A derived oracle is always inspectable. The user can see exactly what will count as FAIL/PASS/UNRESOLVED before locking it.

### 4.6 Fault Map

Purpose: show what FAULTLINE can currently observe and control.

The fault map visualizes causal candidates grouped by capability axis:

- Journey steps.
- DOM subtrees.
- Style rules / style sheets.
- Script/runtime resources.
- Network requests.
- Browser storage/state.
- Routes/navigation.
- Framework-aware units when an adapter provides them.
- Third-party resources.

Every candidate displays:

- stable candidate ID;
- human-readable description;
- source axis/capability;
- whether it is observable;
- whether it is safely controllable;
- whether it is pinned;
- latest experiment outcome;
- evidence references;
- risk class.

FAULTLINE must never show a candidate as reducible if the active adapter cannot safely control it.

### 4.7 Reduce

Purpose: run causal experiments.

The reduction workspace is not a raw source editor. It is a causal experiment workspace.

Desktop layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ investigation / revision / baseline / RUN / CANCEL / EXPORT │
├────────────────┬──────────────────────────┬──────────────────┤
│ CANDIDATES     │ REPLAY / LIVE TARGET     │ INSPECTOR        │
│                │                          │                  │
│ journey        │ experiment state         │ selected unit    │
│ DOM            │ screenshots / outcome    │ evidence         │
│ styles         │                          │ last probe       │
│ network        │                          │ intervention     │
│ scripts        │                          │ restore status   │
├────────────────┴──────────────────────────┴──────────────────┤
│ Experiment timeline                                           │
└──────────────────────────────────────────────────────────────┘
```

Primary actions:

- Probe candidate.
- Pin/unpin candidate.
- Reduce selected axis.
- Autopilot permitted axes.
- Cancel active operation.
- Restore exact baseline.

### 4.8 Evidence

Purpose: immutable explanation and handoff.

Evidence includes:

- target URL and capture identity;
- environment summary;
- baseline reproduction rate;
- oracle definition;
- original candidate count;
- remaining necessary candidates;
- experiment count;
- FAIL/PASS/UNRESOLVED timeline;
- screenshots and relevant runtime/network excerpts;
- minimal replay journey;
- intervention/restore receipts;
- exported investigation bundle;
- optional minimal source reproducer only when the adapter can truthfully create one.

### 4.9 Integrations

Purpose: real setup surface.

Sections:

- Browser companion.
- CLI/local coordinator.
- Playwright capture.
- CI integration.
- Browser API.
- WebMCP.
- MCP.
- Framework adapter status.

Tool counts and capabilities are generated dynamically from manifests; they are never hard-coded in descriptive UI.

## 5. Canonical Runtime Data Model

The new canonical object is an `Investigation`, not a source case.

Conceptual schema:

```text
Investigation
  id
  revision
  createdAt
  updatedAt
  target
  environment
  capture
  journey
  oracle
  observations
  capabilities
  candidateGraph
  experiments
  receipts
  exports
```

### 5.1 Target

```text
Target
  url
  origin
  mode: public_url | current_tab | trace_import | complex_demo | legacy_source
  title?
  finalUrl?
  captureStartedAt
  captureCompletedAt?
```

### 5.2 Environment

```text
Environment
  browserName
  browserVersion
  viewport
  deviceScaleFactor
  locale
  timezone
  colorScheme
  userAgent
  reducedMotion
  networkProfile?
```

### 5.3 Capture

```text
Capture
  id
  mode
  status
  startedAt
  completedAt?
  documentSnapshots[]
  screenshots[]
  consoleEvents[]
  runtimeEvents[]
  networkEvents[]
  navigationEvents[]
  resources[]
  storageDiffs[]
  traceReferences[]
  redactionSummary
```

### 5.4 Journey

A journey is an ordered immutable action definition with replay metadata.

```text
JourneyStep
  id
  index
  kind
  target?
  value?
  selectorStrategies[]
  timeoutMs
  preconditions[]
  recordedAt
```

The implementation must not store plaintext passwords, credit card values, authentication tokens, or sensitive form content in a portable bundle. Input values from password fields are always represented as redacted placeholders and require user-provided runtime value injection if replay needs them.

### 5.5 Observations

Observations are append-only evidence records produced during capture or experiments.

Every observation includes:

- `observationId`;
- investigation ID;
- revision;
- run/experiment ID;
- monotonic sequence;
- browser-relative timestamp;
- observation type;
- source/capability;
- redaction state;
- payload reference.

Operation status and oracle outcome remain separate concepts.

### 5.6 Experiments

Each experiment binds exactly:

- investigation ID;
- starting revision;
- baseline capture identity;
- target identity;
- oracle identity;
- intervention plan hash;
- candidate IDs;
- outcome;
- evidence references;
- restore receipt;
- timestamps;
- cancellation state.

The system may never reuse an experiment receipt for another revision, target, oracle, or intervention plan.

## 6. Capability-Driven Reduction

The current hard-coded `semanticUnits('html'|'css'|'js')` becomes a legacy adapter. The general reduction engine operates over capability adapters.

Each adapter implements the conceptual contract:

```text
capabilityId
observe(context)
discoverCandidates(context)
describeCandidate(candidateId)
planIntervention(candidateIds, context)
validateIntervention(plan, context)
applyIntervention(plan, lease)
verifyApplied(plan, lease)
restoreIntervention(lease)
verifyRestored(lease)
```

Reduction never calls ad-hoc mutation code directly. It asks the active capability adapter to plan and execute a bounded intervention.

### 6.1 Initial Capability Axes

The first production-capable axes are:

#### Journey axis

Remove or simplify captured user actions while preserving the failure.

Examples:

- omit a navigation that turns out irrelevant;
- remove an intermediate click;
- remove a wait;
- simplify typed content where allowed.

#### DOM axis

Operate on captured/replayed DOM subtrees only when a sandbox/local replay environment permits reversible mutation.

Candidates are structural DOM nodes/subtrees, not regex matches on HTML text.

#### Style axis

Operate through CSSOM/style-sheet rule control where permitted. Candidate identity derives from stylesheet URL/owner, rule path, and normalized rule fingerprint rather than source-string offsets alone.

#### Network axis

Operate through controlled request blocking, response substitution, or deterministic replay fixtures. Each mutation is explicit and restored after the experiment.

Examples:

- block a third-party analytics request;
- replay a recorded API response;
- omit an optional request;
- substitute a known captured response.

FAULTLINE must not fabricate server responses that were not captured or user-provided and then present the result as causal proof.

#### Resource/script axis

Initially operates at resource/chunk boundaries: block or allow a script/resource URL in controlled replay.

Fine-grained source-level JavaScript reduction remains the legacy source adapter until a trustworthy AST/source-map-aware adapter exists.

#### Browser-state axis

Controlled changes to explicitly captured state such as selected localStorage/sessionStorage keys, cookies where permitted, feature flags, and URL state.

Sensitive values are redacted from exported evidence.

### 6.2 Framework-Aware Units

Framework adapters may add richer candidates—for example route segments or component identities—but generic browser capture must not depend on private framework internals.

When framework metadata is unavailable, the system falls back to generic browser/runtime candidates and reports the reduced capability depth honestly.

## 7. Intervention Safety, Leases, And Restoration

Every mutating experiment must be reversible and lease-bound.

Before applying an intervention, the coordinator records:

- target identity;
- baseline snapshot/fingerprint;
- exact plan hash;
- expected revision;
- affected capability;
- restore material;
- lease ID;
- expiry/fencing token.

After the experiment, FAULTLINE must restore and verify the target.

Possible restore outcomes:

- `RESTORED_VERIFIED`
- `RESTORE_FAILED`
- `TARGET_DIRTY`
- `TARGET_CHANGED_EXTERNALLY`

If restoration cannot be proven, the target enters `DIRTY` state and automatic reduction stops. The UI must not continue pretending later experiments share the same baseline.

## 8. Public URL Capture Security

Public URL capture treats all target content as hostile.

### 8.1 URL Scheme

Only `http:` and `https:` are accepted.

Blocked schemes include at least:

- `file:`
- `data:` as top-level targets
- `javascript:`
- `blob:` as top-level targets
- browser-internal schemes
- extension schemes

### 8.2 SSRF / Network Boundary

The coordinator must deny requests resolving to:

- loopback addresses;
- RFC1918 private ranges;
- link-local ranges;
- carrier-grade NAT ranges where appropriate;
- IPv6 loopback/link-local/private ranges;
- cloud metadata endpoints;
- non-routable and reserved ranges.

DNS is resolved and validated before connection, and redirects are revalidated at every hop.

A hostname that resolves from an allowed public IP to a disallowed private IP during the same capture is treated as DNS rebinding and the navigation is terminated.

### 8.3 Resource Limits

Public capture has explicit bounded limits for:

- total wall-clock capture duration;
- navigation count;
- downloaded bytes;
- per-resource bytes;
- screenshot count/size;
- trace size;
- console/runtime events;
- network event count;
- nested frames;
- browser CPU/runtime budget.

Limits produce an explicit `CAPTURE_LIMIT_REACHED` condition rather than silent truncation.

### 8.4 Downloads And Dangerous Actions

Downloads are disabled by default. Permission prompts are denied unless a capability explicitly requires and safely supports them. External protocol handlers are blocked. Clipboard, geolocation, camera, microphone, MIDI, USB, Bluetooth, serial, HID, and similar browser permissions are denied by default.

### 8.5 Authentication

Public URL capture does not request user passwords.

Authenticated/private cases use Current Tab capture or an explicitly configured local coordinator profile.

## 9. Current Tab Privacy And Redaction

The browser companion uses least privilege.

Requirements:

- explicit user activation per capture session;
- visible capture indicator;
- origin-scoped access;
- no background capture of unrelated tabs;
- no silent password field collection;
- redaction of authorization headers and known secret-bearing headers;
- redaction of cookies by default;
- redaction of password/credit-card/autofill-sensitive fields;
- configurable redaction rules for application-specific secrets;
- export preview listing what data will leave the browser.

The portable investigation bundle records that data was redacted so later analysis does not mistake missing values for actual runtime null/empty values.

## 10. Oracle Model

Existing oracle semantics remain useful but become implementation details under higher-level symptoms.

### 10.1 Required Technical Oracle Types

Initial technical oracle support includes:

- element existence/visibility;
- element pointer-interaction availability;
- DOM property/value;
- computed style;
- text/content;
- route/URL;
- runtime error;
- console error pattern;
- network request failure/status;
- visual-region difference threshold;
- layout geometry relation.

### 10.2 Oracle Outcome

Oracle outcomes remain exactly:

- `FAIL`
- `PASS`
- `UNRESOLVED`

`UNRESOLVED` is used for measurement inability, stale action target, missing evidence, capture timeout, or other conditions where the system cannot truthfully decide whether the failure persisted.

## 11. Complex Modern Demo

The existing dialog fixture is replaced as the primary demo by a deliberately complex modern SaaS operations dashboard.

The old fixture remains only for deterministic unit/regression tests where a tiny case is useful.

### 11.1 Demo Product Surface

The demo application contains:

- responsive application sidebar;
- project/environment switcher;
- command/search surface;
- deployment status cards;
- SVG usage/performance charts;
- sortable/filterable deployment table;
- asynchronous activity feed;
- toast/notification system;
- settings drawer rendered through a portal-like layer;
- confirmation modal;
- animated backdrop;
- optimistic save state;
- mocked asynchronous API layer;
- route transitions;
- feature-flag state;
- third-party analytics simulation;
- mobile navigation state;
- keyboard interaction support.

The demo must be visually credible enough to resemble a contemporary production dashboard rather than a debugging fixture.

### 11.2 Canonical Demo Failure

The verified reproduction journey is:

```text
Open deployment
→ open configuration drawer
→ switch environment
→ enable advanced setting
→ save
→ async save resolves successfully
→ success toast appears
→ drawer begins exit animation
→ backdrop remains with `pointer-events: auto`
→ main dashboard becomes unclickable
```

The causal bug crosses multiple layers:

1. asynchronous state update;
2. drawer/backdrop lifecycle;
3. CSS transition state;
4. event/pointer interaction;
5. unrelated analytics/network behavior exists as removable noise.

### 11.3 Demo Reduction Goal

The demo is not accepted merely because it looks complex. It must prove reduction.

A valid demo run must:

- reproduce the failure at least two consecutive times;
- expose candidates across at least four capability axes;
- run a meaningful number of causal experiments;
- eliminate substantial irrelevant state/actions/resources;
- retain a small set of necessary candidates that explain why the overlay still intercepts pointer interaction;
- produce an evidence report that a reviewer can understand without reading the source.

The UI may display actual measured numbers only. It must not hard-code marketing claims such as “73 candidates → 4 causes” unless that exact run produced those values.

## 12. Local Coordinator And Hosted Product Boundary

The production Vercel website is the investigation UI and artifact surface. It is not assumed to have unrestricted direct access to localhost/private applications.

### 12.1 Local Coordinator

A local coordinator is responsible for:

- launching/controlling Playwright Chromium for local capture;
- connecting to the browser companion;
- replaying journeys;
- executing reversible interventions;
- enforcing leases and restoration;
- streaming observations to the UI;
- storing local sensitive capture material when the user chooses local-only mode.

### 12.2 Hosted UI

The hosted UI may:

- operate on public URL capture through an approved capture service;
- import portable artifacts;
- display evidence;
- manage non-sensitive investigation metadata;
- connect to a local coordinator when browser/network permission allows.

Hosted-to-local pairing is optional. A local full UI/CLI path must exist so Chrome Local Network Access restrictions cannot make localhost debugging impossible.

## 13. API / MCP / WebMCP Contract

The agent API becomes investigation-oriented.

Core operations conceptually include:

```text
investigation_create
investigation_inspect
capture_start
capture_status
journey_record_start
journey_record_stop
replay_run
oracle_suggest
oracle_lock
candidates_list
candidate_probe
reduction_run
operation_cancel
evidence_get
investigation_export
```

Every mutating operation includes:

- investigation ID;
- expected revision;
- request/idempotency key;
- capability/plan identity where relevant.

Long-running operations return operation handles and support cancellation.

WebMCP remains supported for browser-native use. MCP/CLI/local coordinator expose the same logical contract rather than implementing parallel semantics.

## 14. Persistence And Versioning

The existing source case persistence is migrated behind a versioned compatibility adapter.

New persistent data uses an explicit investigation schema version.

The runtime must support:

- safe rejection of future unsupported schema versions;
- migration of supported older versions;
- no partial migration writes;
- bounded local retention;
- large capture artifacts stored separately from lightweight investigation metadata;
- content-addressed references where feasible;
- export bundles with manifest + checksums.

## 15. Error Handling

Errors are typed and surfaced without leaking secret-bearing payloads.

Required classes include:

- invalid target URL;
- blocked network target;
- DNS rebinding detected;
- capture navigation failure;
- capture resource limit reached;
- target authentication required;
- companion unavailable;
- replay action unresolved;
- baseline not reproducible;
- oracle unresolved;
- intervention unsupported;
- intervention approval required;
- restore failed / target dirty;
- stale revision;
- operation cancelled;
- artifact schema unsupported;
- artifact checksum mismatch.

A user-facing error must explain the next safe action without dumping raw headers, cookies, tokens, or captured secret values.

## 16. Testing Strategy

The change is not complete without real browser tests.

### 16.1 Protocol/Unit Tests

Cover:

- investigation schema validation;
- URL validation;
- redirect validation;
- IP/range blocking;
- DNS rebinding handling;
- redaction;
- journey selector ranking;
- oracle derivation;
- capability negotiation;
- intervention plan binding;
- lease/fencing semantics;
- restoration verification;
- revision/idempotency behavior;
- export manifest/checksums;
- legacy case migration.

### 16.2 Browser Integration Tests

Cover:

- public capture of a modern test application;
- dynamic rendering after hydration;
- client route transition capture;
- async request capture;
- console/runtime error capture;
- current-tab companion handshake using a controlled test extension/harness;
- record/replay of multi-step journey;
- symptom-first oracle creation;
- at least one successful candidate probe per initial capability axis;
- cancellation;
- dirty-target stop behavior;
- mobile UI layout/no horizontal overflow;
- keyboard navigation/accessibility.

### 16.3 Complex Demo Acceptance Test

The complex demo has a dedicated end-to-end test that:

1. loads the demo through the same user-facing New Investigation flow;
2. records or loads the canonical journey;
3. reproduces the failure twice;
4. locks the pointer-interaction oracle;
5. discovers candidates across at least journey, DOM, style, and network/resource axes;
6. runs reduction;
7. proves the reduced candidate set still FAILs;
8. proves a causally required candidate removal makes it PASS or UNRESOLVED as appropriate;
9. verifies intervention restoration;
10. exports evidence without mutating investigation state.

### 16.4 Legacy Regression

All existing deterministic reducer, revision, persistence, cancellation, runtime-error, sandbox, WebMCP, and deployment-integrity tests remain required. Legacy source editing remains functional under the Advanced adapter.

## 17. Repository Direction

The implementation should converge toward clear boundaries rather than expanding the existing monolithic `runtime.js`.

Target layout:

```text
apps/
  web/                 hosted product UI
  coordinator/         local capture/replay coordinator
  demo-modern/         complex modern demo application

packages/
  protocol/            investigation/event schemas
  capture-browser/     Playwright/CDP capture
  replay/              journey replay
  oracle/              symptom → technical oracle logic
  engine/              deterministic reduction orchestration
  capabilities/
    journey/
    dom/
    style/
    network/
    resource/
    browser-state/
    legacy-source/
  evidence/            receipts / exports / checksums
  companion-protocol/  browser companion messages
  mcp/                 MCP surface
```

This target is directional. Migration occurs incrementally behind tests; the existing production runtime is not deleted before equivalent behavior exists through the new packages.

## 18. Implementation Decomposition

This design is intentionally implemented in production-safe increments.

### Increment A — Investigation protocol and compatibility layer

- versioned Investigation schema;
- legacy source case adapter;
- revision/idempotency integration;
- observation/event types;
- capability registry;
- no production UI switch yet.

### Increment B — Complex modern demo

- build the modern SaaS dashboard;
- canonical multi-step failure;
- deterministic reproduction;
- demo-specific capture fixture only where necessary;
- dedicated end-to-end test.

### Increment C — Browser capture + journey replay

- local coordinator;
- Playwright/CDP capture;
- public URL safety policy;
- recording/replay;
- runtime/network/DOM/style observations.

### Increment D — Capture-first UI

- Home;
- New Investigation;
- Capture;
- Reproduce;
- symptom-first Oracle;
- Fault Map;
- Reduce;
- Evidence;
- Integrations;
- Legacy Source under Advanced only.

### Increment E — Capability reduction

- journey capability;
- DOM capability;
- style capability;
- network/resource capability;
- browser-state capability where safe;
- intervention leases/restoration;
- causal graph/evidence integration.

### Increment F — Current Tab companion

- explicit user-authorized capture;
- private/local/authenticated target flow;
- redaction and export preview;
- pairing with local coordinator.

### Increment G — Agent interfaces and release hardening

- investigation-oriented Browser API/WebMCP/MCP/CLI;
- artifact export/import;
- full CI;
- staged deployment verification;
- public production verification;
- verified checkpoint.

No increment may be represented as supporting a later capability before the corresponding tests are real and green.

## 19. Production Release Rules

Production remains on the existing Vercel project `faultline-webmcp`. No duplicate project is created.

Each deployable increment follows:

```text
feature branch
→ RED tests
→ implementation
→ full green suite
→ PR CI
→ merge with exact-head/stale-main guard
→ production workflow
→ exact project binding
→ staged deployment
→ staged verification
→ promote
→ public production verification
→ advance production branch
→ verified checkpoint
```

For the future compiled/multi-app architecture, release provenance must verify the deterministic build manifest and produced artifact hashes rather than pretending source-file byte equality is sufficient for compiled bundles. The release contract must prove which source SHA produced the deployed artifacts.

## 20. Non-Goals For The First Capture-First Release

The first release does not claim:

- universal source-level reduction of arbitrary minified JavaScript;
- decompilation of WebAssembly into causal source code;
- access to closed shadow roots the browser cannot observe;
- arbitrary mutation of remote server-side code;
- automatic login credential capture;
- unrestricted private-network crawling from the hosted service;
- framework-private internals as a required dependency;
- deterministic reduction of inherently nondeterministic distributed failures without a stable replay mechanism.

Unsupported depth is surfaced as a capability limitation, not hidden behind a generic success state.

## 21. Acceptance Criteria

This architecture is considered implemented only when all of the following are true:

1. The default product start flow does not ask for HTML/CSS/JS.
2. A public URL can be captured in a real browser without user-provided source.
3. An authenticated/current browser tab has a permission-scoped capture path.
4. A multi-step journey can be recorded and replayed.
5. The system can establish and display reproducibility before reduction.
6. The default oracle flow is symptom-first and the derived technical oracle is inspectable.
7. Candidate discovery operates over runtime/capability axes rather than only source strings.
8. At least journey, DOM, style, and network/resource axes have real reversible experiment support.
9. Interventions are lease-bound and restoration is verified.
10. A restore failure marks the target dirty and stops automatic reduction.
11. Public capture passes SSRF, redirect, DNS-rebinding, scheme, permission, and resource-limit tests.
12. Current-tab capture redacts secret-bearing values by default.
13. The complex modern dashboard demo is the primary demo and reproduces a non-trivial multi-layer bug.
14. The demo reduction uses actual measured candidates/experiments and does not display fabricated metrics.
15. The evidence view explains the causal result without requiring source-code knowledge.
16. Advanced legacy HTML/CSS/JS cases remain functional.
17. Existing revision, persistence, cancellation, sandbox and WebMCP regression tests remain green.
18. All new browser integration and complex-demo tests are green.
19. The production release uses the existing Vercel project only.
20. Staged and public production verification both pass before the `production` branch advances.

## 22. Final Product Principle

FAULTLINE is a causal debugging system for running web applications. It may use source code when source is available, but source code is an optional source of evidence—not a prerequisite for using the product.

The product must always distinguish between what it observed, what it controlled, what it inferred, and what it could not access. That distinction is part of FAULTLINE's trust model and is required for every future framework, browser, agent, and runtime integration.
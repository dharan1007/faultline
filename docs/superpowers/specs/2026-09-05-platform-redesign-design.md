# FAULTLINE Connected Platform Redesign

Date: 2026-09-05
Status: approved for implementation
Base checkpoint: `e13676d49546f8c4506e4d468cb417849c9ebacd`

## Product decision

FAULTLINE will stop presenting its low-level HTML/CSS/JavaScript reduction engine as the primary product. The existing deterministic reducer remains a core execution primitive, but the user-facing product becomes a connected investigation platform for modern web applications.

A normal user starts from a repository, deployment URL, failing test, stack trace, or recorded browser flow. FAULTLINE detects the application stack, establishes a reproducible failure, performs bounded counterfactual experiments, preserves deterministic evidence, and hands the result to a human or coding agent through WebMCP, remote MCP, REST, and exportable artifacts.

Raw HTML/CSS/JS editing remains available only as an Advanced / Minimal Reproducer workflow.

## Product principles

1. The primary object is an investigation, not a text editor.
2. The user describes or supplies a failure; FAULTLINE derives the low-level oracle whenever it can and exposes the generated oracle for review.
3. Every mutating action has a visible state transition and an auditable revision.
4. A result is called causal only when backed by an executed counterfactual experiment.
5. LLM text is never treated as proof of causality.
6. The same canonical investigation engine backs the UI, WebMCP, remote MCP, and REST surfaces.
7. Existing browser-local reduction remains available when remote execution is unavailable.
8. Production must fail closed: unsupported builds, missing credentials, ambiguous oracles, sandbox failures, and timeouts produce explicit blocked/unresolved states rather than fabricated success.
9. No runtime depends on unsafe execution inside the main Vercel Function process. Untrusted project commands execute only in an isolated Vercel Sandbox.
10. No duplicate Vercel project is created. All releases target the existing `faultline-webmcp` project.

## Supported application model

The first production adapter targets modern Node/web projects and live web deployments while providing a custom-command escape hatch for unusual repositories.

Framework detection covers Next.js, React/Vite, Vue/Vite, Nuxt, SvelteKit, Remix, Angular, Astro, Solid/Vite, static HTML, and unknown/custom Node projects. Package-manager detection covers npm, pnpm, yarn, and bun. Workspace detection covers npm/yarn workspaces, pnpm workspaces, Turborepo, and Nx.

The adapter must never claim that detection equals compatibility. Each project receives an explicit compatibility result:

- `ready`: detected and a runnable command is available.
- `configuration_required`: framework detected but start/build command or environment input is missing.
- `unsupported`: project is outside the current execution contract.
- `blocked`: source access, installation, build, or sandbox execution failed.

Any modern project can still use the live-URL path or Advanced / Minimal Reproducer path even when repository execution is not available.

## Information architecture

The application becomes a multi-view single-page app with stable hash routes so it remains deployable as a static shell while Vercel Functions provide API/MCP endpoints.

### `/projects`

Purpose: orient the user and start work.

Shows locally persisted connected projects, current compatibility state, latest investigation status, active execution environment, and recent evidence.

Primary action: `New investigation`.

Secondary actions: `Connect project`, `Open project`, `Resume investigation`, `Connect agent`.

Empty state explains the three fastest paths: Git repository, live URL, or minimal reproducer.

### `/connect`

Purpose: ingest the source of truth.

Connection modes:

- Git repository URL + branch/revision
- live/staging URL
- deployment URL
- failing test or error artifact
- Advanced / Minimal Reproducer

Repository connection collects only information required to run the project. Public repositories require no token. Private Git repositories accept a per-run credential; the credential is never persisted in IndexedDB or returned in evidence.

The connection wizard shows these states:

`source -> inspect -> detected -> configuration -> verified`

`Verify project` is disabled until required inputs are present. The result must show detected framework, package manager, workspace, candidate commands, and exact blocker if verification fails.

### `/project/:id`

Purpose: answer what FAULTLINE connected to and what it can do.

Sections:

- project identity and source
- compatibility verdict
- detected stack
- install/build/start/test commands
- routes/deployment target when known
- environment requirements (names only, never secret values)
- recent investigations
- agent/API connection state

Primary action: `Start investigation`.

Secondary actions: `Run health check`, `Open deployment`, `Configure runtime`, `Connect coding agent`.

### `/investigation/:id`

Purpose: guide debugging without exposing reducer internals by default.

Persistent five-stage progress model:

1. Reproduce
2. Observe
3. Isolate
4. Verify
5. Handoff

#### Reproduce

Inputs may be natural-language bug description, route, stack trace, failing test name, browser action sequence, or an existing raw oracle.

The UI displays a human-readable expectation and observation. The generated deterministic oracle is shown in an expandable technical panel.

Required state outcomes:

- `draft`
- `validating`
- `reproducing`
- `reproduced`
- `not_reproduced`
- `blocked`

#### Observe

Shows console/runtime errors, relevant DOM snapshot metadata, network failure summaries, route, environment, browser, and build metadata. Observations are evidence, not yet causal claims.

#### Isolate

Runs bounded experiments. Default view summarizes candidates and necessary/irrelevant regions. Advanced view exposes HTML/CSS/JS semantic units, pins, probes, and reducer controls.

#### Verify

Re-runs the minimized or fixed scenario multiple times. A verified result records run count, pass/fail consistency, source revision, and environment fingerprint.

#### Handoff

Produces a minimal reproducer, evidence receipt, machine-readable JSON, and connection-ready context for an external coding agent.

### `/runs`

Purpose: operational history.

Each run records status, project, investigation, source revision, environment, browser, duration, failure signature, reduction amount, and final verdict.

Run state machine:

`queued -> provisioning -> cloning -> installing -> building -> launching -> reproducing -> investigating -> verifying -> completed`

Terminal alternatives:

`cancelled`, `source_access_failed`, `install_failed`, `build_failed`, `launch_failed`, `route_unreachable`, `not_reproduced`, `oracle_ambiguous`, `experiment_timeout`, `sandbox_failed`, `browser_failed`.

### `/evidence`

Purpose: make causal claims inspectable.

Separates:

- observed failure
- executed interventions
- passing counterfactuals
- failing counterfactuals
- necessary components
- removable components
- candidate causes
- verification runs
- exported artifacts

Every claim links to the run/revision that supports it.

### `/integrations`

Purpose: make FAULTLINE usable by developers and agents rather than merely demoable.

Surfaces:

1. WebMCP status for the current browser page.
2. Remote MCP endpoint.
3. REST API base URL and endpoint catalog.
4. Generated client configuration examples.
5. Capability token creation/revocation guidance.

The UI must clearly explain that WebMCP is page-scoped while remote MCP is the surface for external coding agents.

### `/settings`

Purpose: local project/runtime preferences, sandbox limits, browser defaults, token management, data export, local data deletion, and safety controls.

## Visual and interaction system

The redesign uses a restrained dark operational interface rather than a decorative marketing dashboard. The palette remains near-black, white/gray, and the existing restrained pink accent only for active/primary state. Status colors are reserved for semantics.

Desktop layout:

- persistent left navigation
- compact top context bar showing project, environment, connection status, and current run
- main content area with one dominant primary action per view
- optional right inspector only on investigation/evidence views

Mobile layout:

- top app bar
- navigation drawer
- one-column content
- sticky current-stage control only during investigation

Buttons communicate direction in their labels. Avoid ambiguous labels such as `Apply` when the result is not obvious. Examples: `Verify project`, `Start investigation`, `Run reproduction`, `Begin isolation`, `Verify minimized case`, `Create MCP connection`, `Export reproducer`.

All asynchronous actions expose `idle`, `working`, `success`, `blocked`, and `failed` visual states. Buttons are disabled only when the reason is visible or available through accessible helper text.

No important state is represented by color alone. Focus indicators are always visible. Interactive controls have accessible names, keyboard activation, and minimum practical touch targets. Motion respects `prefers-reduced-motion`.

## Canonical domain model

### Project

```js
{
  id,
  name,
  source: {
    kind: 'git' | 'url' | 'minimal',
    url,
    revision,
    branch
  },
  detected: {
    framework,
    packageManager,
    workspace,
    commands: { install, build, start, test },
    confidence
  },
  compatibility: 'ready' | 'configuration_required' | 'unsupported' | 'blocked',
  createdAt,
  updatedAt
}
```

Secret values are excluded from this object.

### Investigation

```js
{
  id,
  projectId,
  title,
  stage: 'reproduce' | 'observe' | 'isolate' | 'verify' | 'handoff',
  status,
  report: { description, route, expected, observed },
  oracle,
  activeRunId,
  evidenceIds,
  sourceRevision,
  createdAt,
  updatedAt
}
```

### Run

```js
{
  id,
  projectId,
  investigationId,
  status,
  sandboxId,
  sourceRevision,
  environmentFingerprint,
  startedAt,
  finishedAt,
  events: []
}
```

### Evidence

```js
{
  id,
  investigationId,
  runId,
  kind,
  status,
  revision,
  intervention,
  observation,
  createdAt
}
```

## Local-first persistence

The browser retains project metadata, investigation state, revisions, and evidence in IndexedDB. The existing revision-safe persistence behavior is preserved.

Secrets are not stored in IndexedDB. Git credentials and environment secret values are held in memory for the active remote request or supplied by an external agent for that call.

A capability token is a random high-entropy bearer secret generated by the client. The public project capability identifier is `sha256(token)`. The server verifies that `sha256(providedToken)` matches the requested capability ID. This permits stateless authorization without a central credential database. Possession of the token grants the scoped capability, so the UI treats it like an API key and never logs it.

## Remote execution architecture

Untrusted repository commands execute in Vercel Sandbox, never directly in the Vercel Function host.

Flow:

`UI / MCP / REST -> API validation -> capability check -> Sandbox adapter -> repository clone -> project inspection -> install/build/start/test -> browser runner -> normalized evidence -> canonical response`

The sandbox adapter uses a bounded timeout, bounded resource request, explicit network policy, source-depth limit, and sanitized command allow-list derived from detected package scripts or explicit user configuration.

The server never interpolates arbitrary shell strings into `sh -c`. Commands are represented as executable + argument arrays. Custom commands are tokenized and validated before execution.

Remote source inspection returns normalized metadata only. It must not return environment values, Git credentials, `.env` file contents, or arbitrary filesystem dumps.

## Framework/project detection

Detection is deterministic and manifest-driven.

Inputs:

- `package.json`
- lockfiles
- workspace config files
- framework config filenames
- selected package scripts

Signals are ranked, with explicit precedence for framework packages over generic React/Vite signals.

Examples:

- `next` dependency => Next.js
- `nuxt` => Nuxt
- `@sveltejs/kit` => SvelteKit
- `@remix-run/*` => Remix
- `@angular/core` => Angular
- `astro` => Astro
- `vue` + `vite` => Vue/Vite
- `react` + `vite` => React/Vite
- otherwise generic Node/static/custom

The detector selects candidate commands but never executes an unvalidated package script merely because it exists.

## REST API

Base path: `/api/v1`.

Initial production endpoints:

- `GET /api/v1/health`
- `POST /api/v1/projects/inspect`
- `POST /api/v1/runs/provision`
- `POST /api/v1/runs/command`
- `POST /api/v1/runs/stop`
- `POST /api/v1/failures/evaluate`
- `POST /api/v1/reducers/reduce`

Every endpoint returns a structured envelope:

```js
{
  ok: true | false,
  requestId,
  data,
  error: null | { code, message, retryable, details }
}
```

Request size, URL schemes, repository hosts, branch names, command count, command arguments, timeout values, and source payload sizes are validated.

CORS defaults to the FAULTLINE origin. MCP clients use the MCP endpoint rather than broad wildcard REST CORS.

## Remote MCP

Endpoint: `/mcp`.

The implementation targets MCP protocol revision `2026-07-28`: stateless HTTP request/response, self-describing requests, and standard routing headers. It also provides a compatibility path for established 2025 Streamable HTTP clients when the SDK supports it.

Remote tools are high-level and project-oriented:

- `faultline_project_inspect`
- `faultline_project_verify`
- `faultline_investigation_create`
- `faultline_run_start`
- `faultline_run_status`
- `faultline_failure_evaluate`
- `faultline_reduce`
- `faultline_evidence_get`
- `faultline_reproducer_export`

The MCP tool layer calls the same service functions as REST. There is no separate fake/demo implementation.

Long-running work returns explicit run/sandbox handles rather than relying on hidden protocol session state.

## WebMCP

The existing `document.modelContext.registerTool(...)` integration remains, but tools are renamed/reframed around the user workflow. Each tool uses `execute`, JSON Schema input, accurate `readOnlyHint`, and canonical service functions.

The page must register tools only when `document.modelContext.registerTool` exists. Lack of WebMCP is a capability state, not an application error.

## Browser investigation

Two execution modes exist.

### Browser-local mode

Used for minimal reproducers and page-scoped WebMCP. It preserves the current sandboxed iframe execution and deterministic oracle runner.

### Remote project mode

Used for complex repositories. A Vercel Sandbox clones and runs the project. Browser automation runs inside the sandbox against the launched port. The runner emits normalized observations rather than exposing unrestricted remote-browser control to the public API.

Browser automation must be bounded by navigation timeout, action count, total run timeout, and origin policy. The first production runner supports navigation, click, fill, keypress, wait-for-selector, DOM/property assertions, text assertions, URL assertions, computed-style assertions, console/runtime-error assertions, and screenshot metadata.

If Chromium cannot be installed or launched in the sandbox environment, the run returns `browser_failed` and production does not claim remote browser support.

## Existing reducer integration

The existing reducer engine remains the browser-local reduction primitive. The planned hierarchical/dependency-aware reducer improvement remains valid but is not allowed to block the product-shell/API redesign.

Advanced reduction presents semantic units grouped by source axis and structural frontier. Normal users see summarized candidates and reduction outcome rather than raw source by default.

## Security boundary

1. Repository execution only in Vercel Sandbox.
2. Sandbox network access is restricted to package registries, source host, and the investigated target where required.
3. Secret values never enter evidence or UI persistence.
4. Git credentials are redacted from errors.
5. API rejects `file:`, `javascript:`, `data:`, localhost/private-network targets from public URL investigation unless the target is the owned sandbox endpoint.
6. Command execution is array-based and bounded.
7. Output is truncated and scrubbed before returning to the browser.
8. Reproducer export removes secret-bearing headers and environment values.
9. Capability tokens are displayed once and never placed in query strings.
10. Every remote mutation has a request/run identifier for audit correlation.

## Reliability and error contract

User-visible errors are specific and actionable. Required canonical codes include:

- `SOURCE_ACCESS_FAILED`
- `INVALID_REPOSITORY`
- `UNSUPPORTED_PROJECT`
- `CONFIGURATION_REQUIRED`
- `SANDBOX_PROVISION_FAILED`
- `INSTALL_FAILED`
- `BUILD_FAILED`
- `START_FAILED`
- `ROUTE_UNREACHABLE`
- `BROWSER_FAILED`
- `NOT_REPRODUCED`
- `ORACLE_AMBIGUOUS`
- `EXPERIMENT_TIMEOUT`
- `REDUCTION_LOST_FAILURE`
- `STALE_REVISION`
- `UNAUTHORIZED_CAPABILITY`
- `RATE_LIMITED`

No handler returns a bare stack trace to the user.

## Test strategy

All behavior changes use red-green-refactor TDD.

Unit coverage:

- framework/package-manager/workspace detection
- command selection and unsafe-command rejection
- capability-token verification
- domain-state transitions
- API envelopes and validation
- MCP tool catalog and tool-to-service mapping
- reducer regressions

Integration coverage:

- API health
- project-inspection contract using fixture manifests
- MCP `tools/list` and one tool call against the HTTP handler
- local browser investigation state persistence

Real browser E2E:

- desktop and 390x844 mobile shell
- navigation across Projects, Connect, Project, Investigation, Runs, Evidence, Integrations
- keyboard navigation and visible focus
- project creation from a live URL or fixture repository metadata
- guided investigation state progression
- Advanced / Minimal Reproducer retains baseline run/probe/reduce/restore behavior
- strict WebMCP tool registration with `execute` and no legacy `handler`
- no page errors and no horizontal overflow

Remote sandbox gate:

- executed only when Vercel Sandbox credentials/runtime are available
- provisions a tiny public fixture project
- inspects manifest
- executes a harmless command
- tears down sandbox

A production release that advertises remote repository execution is blocked unless this remote sandbox gate succeeds against the preview deployment.

## Build and deployment

The project remains one Vercel project: `faultline-webmcp`.

The static product shell and Vercel Functions are deployed together. Preview is mandatory. Release sequence:

1. branch tests green
2. branch browser E2E green
3. merge/checkpoint source
4. main tests green
5. Vercel preview deployment
6. HTTP health/API/MCP verification
7. real browser verification against preview
8. remote sandbox smoke test if remote execution is advertised
9. production promotion/deployment to existing project
10. stable URL post-deploy verification

If any required gate cannot run or fails, production remains unchanged and the blocker is reported.

## Scope ordering

This architecture is implemented as three independently testable subprojects in this order:

1. Product shell + canonical project/investigation model + advanced minimal-reproducer preservation.
2. REST + remote MCP bridge + capability authentication + deterministic project detector.
3. Vercel Sandbox project adapter + remote browser runner + end-to-end complex-project verification.

Subproject 1 makes FAULTLINE understandable and usable without reducing existing functionality. Subproject 2 makes it connectable to external agents. Subproject 3 turns the connection surface into real modern-project execution rather than a demo contract.

No subproject may be advertised as complete before its own production gate is green.

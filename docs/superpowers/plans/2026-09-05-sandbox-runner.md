# FAULTLINE Isolated Modern Project Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository/project support real by provisioning isolated Vercel Sandboxes, inspecting modern web projects, executing bounded lifecycle commands, launching apps, and running deterministic browser scenarios.

**Architecture:** A `SandboxAdapter` is the only layer allowed to execute untrusted repository commands. It uses `@vercel/sandbox@3.2.1` with project OIDC when deployed on Vercel. Commands are executable/argument arrays selected from the project detector or explicit validated configuration. Remote browser execution is a sandbox-owned Playwright runner whose output is normalized and scrubbed before it crosses the API boundary.

**Tech Stack:** `@vercel/sandbox@3.2.1`, Node 22/24 sandbox runtime, Playwright inside sandbox project environment, Vercel Functions, existing detector/services.

**Spec:** `docs/superpowers/specs/2026-09-05-platform-redesign-design.md`

## Global Constraints

- Never execute repository code in the Vercel Function host.
- Public URL targets must reject private/link-local/loopback destinations to prevent SSRF.
- Secrets are request-scoped and redacted from all logs/evidence.
- All commands/timeouts/output are bounded.
- Remote capability is not advertised as ready unless a real preview sandbox smoke test succeeds.

---

### Task 1: Sandbox command policy

**Files:**
- Create: `server/command-policy.js`
- Create: `tests/command-policy.test.js`

**Interfaces:**
- Produces `normalizeCommand(command)`, `validateLifecycleCommand(command,detected)`, `redactOutput(text,secrets)`.

- [ ] Write RED tests rejecting shell metacharacter injection, nested shells, absolute executable paths, overlong args, credential-bearing URLs, and unapproved lifecycle scripts.
- [ ] Verify RED.
- [ ] Implement executable/argument-array policy and redaction.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 2: Sandbox adapter

**Files:**
- Create: `server/sandbox-adapter.js`
- Create: `tests/sandbox-adapter.test.js`
- Modify: `package.json`

**Interfaces:**
- `provision({source,projectId,capabilityId,timeoutMs})`
- `run({sandboxId,command,cwd,timeoutMs,secrets})`
- `stop({sandboxId})`
- `inspectFiles({sandboxId,paths})`

- [ ] Add `@vercel/sandbox@3.2.1` dependency.
- [ ] Write RED tests against an injected fake Sandbox SDK to prove network policy, timeout/resource bounds, source-depth limit, command policy application, output truncation, and guaranteed teardown on failure.
- [ ] Verify RED.
- [ ] Implement adapter with dependency injection; production factory uses real SDK/OIDC.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 3: Repository inspection pipeline

**Files:**
- Modify: `server/services.js`
- Create: `api/v1/runs/provision.js`
- Create: `api/v1/runs/command.js`
- Create: `api/v1/runs/stop.js`
- Create: `tests/remote-project.test.js`

- [ ] Write RED tests for public repository provisioning -> manifest inspection -> detector output and for source-access/install/build failure normalization.
- [ ] Verify RED.
- [ ] Implement run handles and explicit run-state events. Do not persist secrets in handles.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 4: Remote browser scenario runner

**Files:**
- Create: `runner/browser-runner.mjs`
- Create: `server/browser-scenario.js`
- Create: `tests/browser-scenario.test.js`

**Interfaces:**
- Scenario actions: `navigate`, `click`, `fill`, `press`, `waitFor`.
- Assertions: DOM exists/property, text, URL, computed style, runtime error.
- Produces `{status:'PASS'|'FAIL'|'UNRESOLVED',evidence,timings}`.

- [ ] Write RED validator tests for bounded action count, URL/origin restrictions, timeout bounds, unsupported action/assertion rejection, and redacted evidence.
- [ ] Verify RED.
- [ ] Implement scenario serializer/validator and sandbox runner script using Playwright.
- [ ] Verify local pure tests GREEN.
- [ ] Commit.

### Task 5: Project verification and run-start service

**Files:**
- Modify: `server/services.js`
- Modify: `server/mcp-server.js`
- Create: `api/v1/projects/verify.js`
- Create: `api/v1/runs/start.js`
- Create: `api/v1/runs/status.js`
- Modify: `tests/mcp-contract.test.js`
- Modify: `tests/api-contract.test.js`

- [ ] Write RED service/API/MCP tests that require real orchestration calls through an injected sandbox adapter.
- [ ] Verify RED.
- [ ] Implement `project_verify` and `run_start` against the same orchestration service.
- [ ] Verify unit/integration GREEN.
- [ ] Commit.

### Task 6: UI remote execution states

**Files:**
- Modify: `src/pages.js`
- Modify: `src/app-shell.js`
- Modify: `tests/browser-e2e.mjs`

- [ ] Add RED browser flow for repository connect -> detected stack -> verify project -> explicit provisioning/install/build/launch states -> start investigation. Stub API responses only in the local UI test; the remote preview gate separately proves real sandbox behavior.
- [ ] Verify RED.
- [ ] Implement progress timeline, retryable/blocking errors, cancel/stop action, and safe credential inputs that are never persisted.
- [ ] Verify browser GREEN.
- [ ] Commit.

### Task 7: Real preview sandbox and browser smoke gate

- [ ] Deploy exact green branch to the existing Vercel project as preview.
- [ ] Call preview `/api/v1/health`.
- [ ] Create a capability token and call `projects/verify` against a tiny public fixture repository.
- [ ] Require a real Vercel Sandbox ID and successful harmless command.
- [ ] Launch the fixture web app in sandbox, run one deterministic Playwright assertion, and stop the sandbox.
- [ ] Exercise the same project-inspection/run surface through remote MCP.
- [ ] If sandbox/OIDC/package/browser provisioning cannot be verified, mark remote execution blocked and do not advertise/deploy it to production.
- [ ] If all gates pass, merge/checkpoint and rerun exact main tree before production promotion.

# FAULTLINE REST and Remote MCP Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a real, tested, stateless developer integration surface so external coding agents can inspect projects and invoke FAULTLINE services without operating the browser UI.

**Architecture:** Add small pure service modules shared by REST and MCP. REST uses Vercel Functions under `/api/v1`. Remote MCP uses the official MCP TypeScript SDK v2 (`2026-07-28`) at `/mcp`. Authentication is a stateless high-entropy capability token with `capabilityId = sha256(token)` and no server-side token database.

**Tech Stack:** Node 22+, Vercel Functions, `@modelcontextprotocol/server@2.0.0`, `@modelcontextprotocol/node@2.0.0`, `zod`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-platform-redesign-design.md`

## Global Constraints

- REST and MCP must call the same service functions.
- Never log or persist capability tokens.
- No wildcard mutation endpoint and no arbitrary shell execution endpoint in this subproject.
- MCP must use official 2026-07-28 SDK behavior rather than a hand-written protocol approximation.
- WebMCP remains page-scoped and uses `execute`, never legacy `handler`.

---

### Task 1: Deterministic project detector

**Files:**
- Create: `src/project-detector.js`
- Create: `tests/project-detector.test.js`

**Interfaces:**
- Produces `detectProject({packageJson,files}) -> {framework,packageManager,workspace,commands,confidence,compatibility,reasons}`.

- [ ] Write RED fixtures for Next.js, React/Vite, Vue/Vite, Nuxt, SvelteKit, Remix, Angular, Astro, pnpm workspace/Turborepo, Nx, static HTML, and unknown Node.
- [ ] Verify focused test failure.
- [ ] Implement deterministic precedence and command selection.
- [ ] Verify focused and full unit suite GREEN.
- [ ] Commit.

### Task 2: Capability authentication and API envelope

**Files:**
- Create: `server/capability.js`
- Create: `server/http.js`
- Create: `tests/server-core.test.js`

**Interfaces:**
- Produces `capabilityId(token)`, `verifyCapability(headers,requestedId)`, `ok(data,requestId)`, `fail(code,message,{retryable,details},requestId)`, `readJson(req,{maxBytes})`.

- [ ] Write RED tests for valid/invalid bearer capabilities, constant-format ID, missing auth, malformed JSON, request-size rejection, and stack-trace redaction.
- [ ] Verify RED.
- [ ] Implement with Node `crypto`, strict bearer parsing, bounded bodies and stable error envelopes.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 3: Pure project inspection service and REST endpoints

**Files:**
- Create: `server/services.js`
- Create: `api/v1/health.js`
- Create: `api/v1/projects/inspect.js`
- Create: `api/v1/failures/evaluate.js`
- Create: `tests/api-contract.test.js`
- Create: `vercel.json`

**Interfaces:**
- `inspectProjectManifest(input)` consumes manifest/file-name payloads and calls `detectProject`.
- `evaluateFailure(input)` validates a normalized oracle/result pair without executing untrusted code.

- [ ] Write RED handler tests using Web `Request` objects / mocked Vercel response adapters.
- [ ] Verify health and inspect routes are absent/failing.
- [ ] Implement strict method/CORS/content-type/validation behavior.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 4: Official remote MCP endpoint

**Files:**
- Create: `server/mcp-server.js`
- Create: `api/mcp.js`
- Modify: `package.json`
- Create: `tests/mcp-contract.test.js`

**Interfaces:**
- Produces `createFaultlineMcpServer(context)` registering project-oriented tools.
- HTTP route `/mcp` adapts official `createMcpHandler` to Vercel Node requests.

- [ ] Add dependencies `@modelcontextprotocol/server@2.0.0`, `@modelcontextprotocol/node@2.0.0`, `@modelcontextprotocol/client@2.0.0`, `zod`.
- [ ] Write a RED MCP integration test using the official client/handler in-process. Require tool discovery and a real `faultline_project_inspect` call.
- [ ] Verify RED before server implementation.
- [ ] Register tools: `faultline_project_inspect`, `faultline_project_verify`, `faultline_investigation_create`, `faultline_run_start`, `faultline_run_status`, `faultline_failure_evaluate`, `faultline_reduce`, `faultline_evidence_get`, `faultline_reproducer_export`.
- [ ] Tools that need remote execution but are not yet available return a structured `CONFIGURATION_REQUIRED` result rather than pretending execution occurred.
- [ ] Verify modern protocol and 2025 compatibility path using SDK tests.
- [ ] Commit.

### Task 5: Integration page uses live endpoint

**Files:**
- Modify: `src/pages.js`
- Modify: `src/app-shell.js`
- Modify: `tests/browser-e2e.mjs`

- [ ] Add RED browser assertions that Integrations shows the actual `/mcp` endpoint, REST base, WebMCP status, creates a client-side capability token, displays it once, and generates copyable configuration without placing token in URL/local storage.
- [ ] Verify RED.
- [ ] Implement the integration flow and health probe.
- [ ] Verify browser GREEN and token secrecy after reload.
- [ ] Commit.

### Task 6: API/MCP preview gate

- [ ] Run all unit, syntax, build, and browser tests.
- [ ] Deploy preview only.
- [ ] Verify `GET /api/v1/health` returns 200 structured envelope.
- [ ] Exercise `/mcp` with official client or protocol-compatible test against preview.
- [ ] Keep production unchanged on any failure.

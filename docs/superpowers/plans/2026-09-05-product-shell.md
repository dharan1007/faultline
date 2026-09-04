# FAULTLINE Product Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-editor-first single screen with a multi-view project/investigation product shell while preserving every verified minimal-reproducer capability.

**Architecture:** Keep a static ESM browser application. Introduce a router, canonical local workspace store, project/investigation domain module, and page renderers. The existing reducer remains behind an Advanced / Minimal Reproducer view and keeps its existing `window.faultline` compatibility surface.

**Tech Stack:** HTML, CSS, browser ES modules, IndexedDB/local persistence, Node test runner, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-09-05-platform-redesign-design.md`

## Global Constraints

- Do not create a second Vercel project.
- Do not remove deterministic reducer/oracle behavior.
- No secrets in IndexedDB.
- One dominant primary action per view.
- All navigation and controls keyboard accessible.
- Production promotion is blocked unless unit, syntax, build, and real-browser gates pass.

---

### Task 1: Canonical project and investigation domain

**Files:**
- Create: `src/platform-domain.js`
- Create: `tests/platform-domain.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createProject(input)`, `createInvestigation(projectId,input)`, `transitionInvestigation(value,nextStage,status)`, `projectCompatibility(input)`, `RUN_STATES`, `TERMINAL_RUN_STATES`.

- [ ] **Step 1: Write failing tests** covering valid project creation, secret-field rejection, ordered investigation-stage transitions, invalid backward transition rejection, and explicit compatibility verdicts.
- [ ] **Step 2: Run** `node --test tests/platform-domain.test.js` and verify RED because the module does not exist.
- [ ] **Step 3: Implement the minimum deterministic domain functions** with no DOM dependencies.
- [ ] **Step 4: Run** `node --test tests/platform-domain.test.js` and verify GREEN.
- [ ] **Step 5: Commit** `test/feat: add canonical project and investigation domain`.

### Task 2: Local workspace persistence and hash router

**Files:**
- Create: `src/workspace-store.js`
- Create: `src/router.js`
- Create: `tests/workspace-store.test.js`

**Interfaces:**
- Consumes: domain objects from Task 1.
- Produces: `createWorkspaceStore(storageAdapter)`, `parseRoute(hash)`, `hrefFor(route)`.

- [ ] **Step 1: Write failing tests** for project/investigation round-trip, versioned migration, corrupted-state fail-closed behavior, token/secret stripping, and route parsing for projects/connect/project/investigation/runs/evidence/integrations/settings/minimal.
- [ ] **Step 2: Run the focused tests** and verify RED.
- [ ] **Step 3: Implement versioned JSON serialization behind a storage adapter plus a deterministic hash router.** Browser runtime uses IndexedDB when available and an in-memory fallback only when persistence is unavailable.
- [ ] **Step 4: Run focused and full unit tests** and verify GREEN.
- [ ] **Step 5: Commit.**

### Task 3: Multi-view application shell

**Files:**
- Replace: `index.html`
- Create: `styles/app.css`
- Create: `src/app-shell.js`
- Create: `src/pages.js`
- Modify: `src/runtime.js`

**Interfaces:**
- Consumes: router/workspace/domain modules.
- Produces: navigable pages and global `window.faultlinePlatform` inspection API.

- [ ] **Step 1: Rewrite `tests/browser-e2e.mjs` first** so it expects sidebar/top-context navigation; Projects, Connect, Runs, Evidence, Integrations and Settings pages; a guided investigation stage bar; and Advanced / Minimal Reproducer reachable without raw source controls on Projects.
- [ ] **Step 2: Run the browser gate against the old UI** and verify RED on missing navigation/pages.
- [ ] **Step 3: Implement the accessible shell and page renderers.** Use semantic `nav/main/aside`, visible focus, `aria-current`, live regions for async state, and `prefers-reduced-motion` handling. Keep primary actions page-specific.
- [ ] **Step 4: Move the existing reducer UI into the Advanced / Minimal Reproducer route** and preserve `window.faultline` methods used by regression tests.
- [ ] **Step 5: Run syntax/unit/browser gates** and verify GREEN at desktop and 390x844.
- [ ] **Step 6: Commit.**

### Task 4: Guided connect and investigation flows

**Files:**
- Modify: `src/pages.js`
- Modify: `src/app-shell.js`
- Modify: `tests/browser-e2e.mjs`

**Interfaces:**
- Produces UI flows for `git`, `url`, and `minimal` sources and investigation stages `reproduce -> observe -> isolate -> verify -> handoff`.

- [ ] **Step 1: Add failing browser assertions** that a user can create a live-URL project without editing source code, start an investigation, enter a bug description/route, see a generated human-readable oracle summary placeholder state, and move through stage navigation only when prerequisites are met.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement form validation, explicit working/blocked/success state components, project cards, investigation stage controls, and Advanced technical details drawers.**
- [ ] **Step 4: Verify GREEN and ensure no horizontal overflow/page errors.**
- [ ] **Step 5: Commit.**

### Task 5: Product-shell release gate

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Make CI run all unit tests, syntax checks, static-tree build verification, and Playwright browser gate.**
- [ ] **Step 2: Run/observe branch CI.**
- [ ] **Step 3: Do not merge or deploy if any gate is red.**

# FAULTLINE Product Workspace V2 Design

## Status

Approved product architecture for implementation on `feat/product-workspace-v2` from production SHA `8e8dacc4d6c142b9f6b583af5de69db7a95d4d46`.

## Problem

FAULTLINE's deterministic reducer, revision model, sandbox, persistence, export path, browser API, and WebMCP tool surface are production-capable, but the current product still exposes them as one dense debugging form. The primary experience assumes the user already understands FAULTLINE, already has raw HTML/CSS/JavaScript, knows how to define an oracle, and knows that the agent/API surface is hidden in a collapsed integration panel.

The next release must improve actual usability and integration without weakening deterministic behavior, sandbox boundaries, revision guards, or release integrity.

## Goals

1. Make FAULTLINE understandable and usable before the user knows its internal model.
2. Separate task modes into clear product surfaces while preserving one canonical local-first runtime state.
3. Make case intake, oracle definition, reduction, evidence, and agent/API connection discoverable.
4. Keep the current reducer/runtime contracts stable unless a feature proves a runtime addition is necessary.
5. Preserve keyboard accessibility, responsive behavior, reduced-motion support, deterministic execution, persistence, cancellation, revision isolation, and hostile-code containment.
6. Make every shipped page/script/style part of build verification and exact-tree Vercel parity.

## Non-goals

- No arbitrary remote URL scraping/crawling in this release.
- No server-side execution of user code.
- No account system, cloud persistence, billing, analytics, or multi-user collaboration.
- No framework migration merely for visual polish.
- No weakening of iframe sandbox or CSP.
- No changes to WebMCP tool semantics simply to fit the UI.
- No duplicate Vercel project.

## Product model

FAULTLINE becomes a four-surface static product sharing the same local canonical engine.

### 1. Start (`index.html`)

Purpose: explain the product and let a user enter through the correct path.

Primary actions:

- Continue local session when persisted state exists.
- Open a `.faultline.json` case file.
- Drag/drop a `.faultline.json` case file.
- Paste/import complete case JSON.
- Load a verified bundled example.
- Open the Connect surface for agent/browser integrations.

The Start surface must not mutate canonical state except through explicit case/session actions.

### 2. Workbench (`workbench.html`)

Purpose: perform the actual deterministic debugging session.

Desktop structure:

- Left rail: session status, source axes, import/replace case, retained revisions.
- Center: source editor, semantic units/frontier, contextual reduction controls.
- Right inspector: isolated preview, oracle builder, current run status/result.
- Top command bar: product navigation, revision, WebMCP status, PASS/FAIL/UNRESOLVED state, Run, Autopilot, Export.

Mobile structure:

- Intentional vertical task sequence rather than a squeezed three-column layout.
- Command bar remains usable without horizontal overflow.
- Workbench order remains source/case -> oracle/preview -> reduction -> evidence link/actions.

### 3. Evidence (`evidence.html`)

Purpose: turn the experiment ledger into a human-readable result.

Show:

- Current tested revision.
- Current locked oracle and reproduction status.
- Original character count and current character count.
- Absolute and percentage reduction.
- Experiment count.
- Retained/pinned units.
- Chronological evidence timeline with event type and tested revision.
- Export reproducer.
- Export FAULTLINE case JSON.
- Copy evidence summary.

Evidence rendering must be read-only. Visiting or refreshing this surface must not create a canonical mutation.

### 4. Connect (`connect.html`)

Purpose: make FAULTLINE directly usable by developers and agents.

Show live runtime-derived data rather than stale hard-coded copy:

- Whether native `document.modelContext` WebMCP registration is available.
- Current manifest tool count.
- Generated tool catalog from `window.faultline.manifest()`.
- Current revision.
- Local-first/persistence status.
- Browser API examples.
- Recommended WebMCP operation sequence.
- Case JSON handoff example.

No hard-coded tool count is allowed.

## Shared navigation and state

All pages load the same `src/runtime.js` canonical runtime. The runtime remains authoritative for current case, revision, pins, experiment ledger, persistence, WebMCP registration, and exports.

Page navigation is ordinary same-origin navigation. Canonical continuity comes from the existing local persistence model; UI code must rehydrate from `window.faultline.inspect()` on each page load.

Shared product shell responsibilities live in `src/ui-shell.js`:

- active product navigation;
- runtime/WebMCP/revision badges;
- safe navigation helpers;
- common error reporting;
- current-session summary.

No page may maintain a second source of truth for canonical state.

## Case intake

Case intake remains based on the exact four-field case contract:

- `html: string`
- `css: string`
- `js: string`
- `oracle: object`

All imports use the existing atomic guarded `loadCase` operation.

Supported UI intake methods:

- file picker for `.json` / `.faultline.json`;
- drag and drop;
- paste complete case JSON;
- load verified bundled example;
- advanced manual editing from the Workbench.

Invalid files/payloads must leave canonical state unchanged and produce an accessible error message.

## Guided oracle builder

The UI presents intent first, then required fields.

User-facing oracle choices:

- Element exists/does not exist -> `dom_exists`.
- Property has failure value -> `dom_property`.
- Computed style has failure value -> `computed_style`.
- JavaScript throws/rejects -> `runtime_error`.

Only fields required for the selected oracle are shown/enabled. Action configuration remains `none` or `click` and continues to use the current selector contract.

States shown in the inspector:

- Not configured.
- Locked.
- Reproduces failure (`FAIL`).
- Does not reproduce (`PASS`).
- Unresolved.

`Test oracle` executes the current case through the existing deterministic run operation. Locking remains a guarded canonical mutation.

## Reduction frontier UX

Semantic units continue to come from the current engine and existing `units`/probe/pin/reduce operations.

Each unit row exposes:

- axis/type label;
- compact source summary;
- pinned state;
- selected state;
- last observed probe result when available.

Contextual actions:

- Probe removal.
- Pin/unpin.
- Copy semantic unit ID.
- Inspect source context.

Autopilot displays current operation state and may be cancelled using the already-supported cancellation contract. UI cancellation must not invent a second cancellation mechanism.

## Evidence metrics

Metrics are derived from canonical state and ledger only.

- Original size: earliest retained canonical case available for the current session; if unavailable after bounded retention, label the metric unavailable rather than fabricate it.
- Current size: total `html.length + css.length + js.length`.
- Reduction percentage: `(original-current)/original*100` when original > 0.
- Experiment count: experiment ledger length returned by the public API/history surface.
- Tested revision: the revision recorded by each operation/result, never the revision observed after the operation finishes.

No metric may imply global syntactic minimality. Copy must preserve the engine's documented claim: 1-minimal within each tested non-overlapping structural frontier.

## Accessibility

Required behavior:

- One visible `h1` per page and logical heading order.
- Skip link to main content.
- Visible keyboard focus.
- Proper tablist keyboard semantics for source axes where tabs are used.
- Buttons have explicit type.
- Icon-only controls require accessible names.
- Status/error/result regions use appropriate `aria-live` without announcing continuous noise.
- Drag/drop has a keyboard-equivalent file picker.
- Mobile viewport has no horizontal overflow at 390px.
- `prefers-reduced-motion: reduce` disables non-essential transitions/scroll animation.
- Color is never the only PASS/FAIL/pin indication.

## Security and reliability invariants

The redesign must preserve:

- experiment iframe `sandbox="allow-scripts"` with no `allow-same-origin`;
- restrictive experiment CSP and network-disabled execution;
- canonical revision guards;
- atomic case replacement;
- bounded persistence/recovery behavior;
- deterministic operation result lineage;
- cancellation cleanup;
- WebMCP native execution-signal semantics;
- no user source execution in the visible canonical preview unless the existing runtime explicitly allows it;
- no secret material in client source.

## File architecture

New/changed product files:

- `index.html` — Start surface.
- `workbench.html` — primary debugging workspace.
- `evidence.html` — evidence/results surface.
- `connect.html` — API/WebMCP integration surface.
- `src/ui.css` — shared product visual system and responsive rules.
- `src/ui-shell.js` — shared navigation/status/session shell.
- `src/ui-start.js` — intake/session entry interactions.
- `src/ui-workbench.js` — source/oracle/reduction interactions.
- `src/ui-evidence.js` — read-only metrics/timeline/export interactions.
- `src/ui-connect.js` — generated manifest/browser API integration UI.

Existing core files retained:

- `src/runtime.js` — canonical browser/WebMCP runtime.
- `src/reducer-engine.js` — reduction/revision engine.
- `src/sandbox-policy.js` — navigation/sandbox policy.

The old `src/ui.js` may be removed only after all behavior is migrated and all tests prove no shipped page depends on it.

## Visual direction

FAULTLINE remains a serious developer tool:

- near-black background;
- white/neutral typography;
- restrained pink only for active/causal/brand emphasis;
- semantic green/red for result state where accompanied by text/iconography;
- dense but readable developer-tool layout;
- fewer decorative cards and borders;
- strong selected/active/focus hierarchy;
- no ornamental animation that interferes with debugging.

## Test strategy

TDD is mandatory.

New browser regressions must first fail against the existing UI for:

1. four product surfaces and navigation;
2. file-picker/paste/drop case intake and invalid-input atomicity;
3. guided oracle field visibility and deterministic test action;
4. workbench desktop hierarchy and mobile ordering/overflow;
5. Evidence page being read-only and reporting deterministic metrics;
6. Connect page generating its tool catalog/count from the live manifest;
7. cross-page canonical revision continuity;
8. keyboard navigation/focus and reduced-motion behavior;
9. all new shipped assets included in production build/parity checks.

The complete existing deterministic, syntax, build, Chromium/WebMCP, containment, persistence, cancellation, recovery, and serialization suites must remain green.

## Build and deployment integrity

`npm run build` must stage every shipped page, stylesheet, and UI module into Vercel's `public/` output without changing bytes.

The production release workflow must compare the complete shipped static manifest between the verified Git tree, protected staged deployment, and anonymous production alias.

Release sequence remains:

feature branch -> RED -> minimal implementation -> full green suite -> PR CI -> stale-main check -> guarded merge -> full production CI -> exact existing Vercel project staging -> protected staged parity -> promote -> anonymous public parity -> fast-forward `production` -> verified recovery checkpoint.

Existing Vercel identity is immutable for this work:

- Project: `faultline-webmcp`
- Project ID: `prj_XtQdMYG2kOufYTrZ1SDj61VEExDM`
- Team ID: `team_APBZJjf6iizHCTuseqHosFnU`
- Production URL: `https://faultline-webmcp.vercel.app`

No duplicate Vercel project may be created.

## Acceptance criteria

The release is acceptable only when:

- a new user can start from file/paste/example without editing raw source first;
- an experienced user can reach the full Workbench directly;
- the Connect surface accurately reflects the live WebMCP manifest;
- Evidence is useful without mutating state;
- all pages preserve one canonical revision history;
- keyboard/mobile/accessibility regressions are covered by real Chromium tests;
- the complete old core regression suite remains green;
- protected staged and anonymous live assets byte-match the exact verified Git tree;
- only the existing `faultline-webmcp` Vercel project is promoted;
- a recoverable verified branch points to the deployed SHA.
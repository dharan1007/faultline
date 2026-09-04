# FAULTLINE

FAULTLINE is a local-first causal web failure reducer for deterministic HTML/CSS/JavaScript reproductions. Instead of exposing DOM clicks to an agent, it exposes semantic experiments through WebMCP: inspect a case, define a failure oracle, probe one intervention, run bounded reduction, pin invariants, inspect causal history, restore revisions, and export a standalone reproducer.


## Hierarchical reduction semantics

Faultline does not minimize overlapping parent/child syntax units in one ddmin set. HTML is reduced by depth: retained coarse element subtrees are minimized first, then Faultline descends into their surviving children. CSS is reduced in two frontiers: whole rules first, then declarations inside retained rules. JavaScript statements are already non-overlapping and use a single frontier. A pinned descendant implicitly protects its ancestor chain.

Each frontier is independently ddmin-reduced, including evaluation of the empty subset, so Faultline can prove that an entire frontier contributes nothing to the failure. The resulting claim is therefore **1-minimal within each tested non-overlapping structural frontier**, not a proof of globally smallest source text.

## Why it exists

Large browser bugs are hard to reason about because most of the page is irrelevant to the failure. FAULTLINE repeatedly removes structure and executes deterministic counterfactuals. A reduction is accepted only when the configured failure oracle still returns `FAIL`.

## Current production nucleus

- deterministic `PASS / FAIL / UNRESOLVED` experiment contract
- ddmin-style 1-minimal reduction core
- structural HTML subtree units
- CSS rule and declaration units
- bounded JavaScript statement units
- pinned semantic units
- stale revision rejection
- isolated sandbox document with network-disabled CSP
- lexical execution-budget instrumentation that ignores strings/comments, supports nested loop conditions, and rejects unsafe unbraced loops as `UNRESOLVED`
- DOM-property, DOM-existence, computed-style, and runtime-error oracles
- immutable experiment/revision ledger
- causal suspicion ranking from passing/failing interventions
- IndexedDB persistence
- standalone reproducible HTML export
- nine native `document.modelContext.registerTool(...)` WebMCP tools
- zero runtime dependencies

## Run locally

```bash
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/`.

## Verification

```bash
npm test
npm run check
npm run build

# Real Chromium/CDP gate (local origin when policy permits)
npm run test:browser

# Or validate an HTTPS deployment
FAULTLINE_E2E_URL=https://your-deployment.example npm run test:browser
```

The project intentionally has no install step and no external application backend.

## Security boundary

The experiment iframe uses `sandbox="allow-scripts"`, does not receive `allow-same-origin`, and receives a restrictive CSP with network, frames, workers, objects, base URLs and form actions disabled. Source is local-first and persisted only in IndexedDB by the app.

This is still browser-side hostile-code containment rather than a VM boundary. See `docs/SECURITY.md` for the remaining limits.

## Reduction semantics

FAULTLINE claims 1-minimality only relative to the candidate set supplied to a `ddmin` run. HTML parent/child subtree units and CSS rule/declaration units can overlap, so the current domain reducer must not be interpreted as a global syntactic minimum across mixed structural granularities. A hierarchical non-overlapping reduction frontier is the next reducer milestone.

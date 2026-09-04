# Faultline UI/UX Production Audit — 2026-09-04

## Scope
Audit performed against the recovered final Faultline source and the real rendered production bundle. The causal engine and WebMCP contracts were preserved unless tests required otherwise.

## Confirmed baseline defects
1. Critical controls and labels used 11–12px text.
2. Three permanent desktop panes compressed source, preview, oracle, and evidence simultaneously.
3. Operational secondary text used low-emphasis gray values and weak state hierarchy.
4. The causal trace rendered raw event tokens rather than evidence cards.
5. Pin and restore existed in the domain/WebMCP layer but were absent from the human UI.
6. Oracle fields were not conditional on oracle type.
7. Locking an oracle could silently discard the existing pre-measurement click action.
8. Persistence errors were swallowed silently.
9. Selecting a semantic unit called `render()`, which rewrote the source textarea and could discard unapplied edits.
10. WebMCP-originated mutations changed the canonical domain but did not immediately re-render/persist the human UI.
11. The first redesigned off-canvas evidence implementation contributed to document horizontal overflow.
12. Restore controls initially rendered at 36px / 13px in the live browser.
13. Mobile operation status was truncated in the header.

## Implemented corrections
- Two-column desktop workbench with a collapsible causal-evidence rail.
- Source / Experiment / Evidence workspace tabs on mobile.
- 15px body type, 14px code/editor type, 14px+ operational controls.
- Explicit FAIL / PASS / UNRESOLVED / RUNNING / ERROR visual states with textual labels.
- Strong focus-visible treatment and >=38px live-browser control gate; primary operational controls target 40px+.
- Axis segmented control, selected/pinned semantic-unit states, pin/unpin control, probe gating, reduction state.
- Dynamic oracle form for DOM property, computed style, DOM existence, and runtime error.
- Explicit pre-measurement click action and delay controls; locked-oracle human-readable summary.
- Evidence cards with action, target, outcome, revision, structured evidence, and restore affordance.
- Visible Local / Saving / Saved / Storage unavailable status.
- Source editor no longer resets during ordinary render/selection.
- WebMCP mutations now synchronize the visible UI and persistence state.
- Off-canvas evidence no longer enlarges the page scroll area.
- Mobile status wraps instead of clipping.

## Contrast checks
Measured token contrast ratios:
- primary text `#f5f7fa` on `#07080a`: ~18.67:1
- secondary text `#c1c8d2` on `#0d0f13`: ~11.38:1
- muted operational copy `#98a2b1` on `#0d0f13`: ~7.43:1
- primary-action text `#17060d` on `#ff4d8d`: ~6.27:1

## Real Chromium/CDP functional audit
The self-contained production artifact is loaded directly into Chromium via CDP to avoid this environment's network-navigation policy while still exercising the actual DOM, CSS, scripts, iframe sandbox, postMessage result path, and user actions.

Verified operations:
- HTML/CSS/JS axis switching
- unapplied source edit survives semantic-unit selection
- Apply source -> canonical revision increment
- oracle type conditional fields
- Lock oracle -> canonical revision increment
- baseline oracle run -> deterministic FAIL on fixture
- select semantic unit
- pin -> probe disabled
- unpin -> probe re-enabled
- counterfactual probe
- hierarchical reduce
- evidence rail open/close
- evidence cards populated
- historical revision restore
- standalone reproducer export status
- mobile Source / Experiment / Evidence navigation
- WebMCP test surface registers nine tools
- browser console/actionable errors = 0

Viewport gates:
- 1440x900 desktop
- 1024x768 tablet
- 768x1024 narrow tablet
- 390x844 mobile

For each viewport the audit asserts no document/body horizontal overflow, >=14px visible control text, minimum rendered control height, and no clipping of critical workflow text.

## Browser evidence
Generated under `/mnt/data/faultline-ui-audit/` during verification:
- `desktop-source.png`
- `desktop-evidence.png`
- `tablet-1024.png`
- `tablet-768.png`
- `mobile-source.png`
- `mobile-source-units.png`
- `mobile-experiment.png`
- `mobile-experiment-oracle.png`
- `mobile-evidence.png`
- `report.json`

## Known environment limitation
The CDP audit uses an opaque about:blank document populated with the self-contained build because this managed runtime blocks direct Chromium navigation to local/external origins. IndexedDB is therefore unavailable in that audit context and Faultline correctly surfaces `Storage unavailable`. Persistence implementation remains covered by source contracts; deployed-origin persistence must be validated in a normal browser origin after publication.

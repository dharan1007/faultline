# WebMCP contract

FAULTLINE exposes 17 causal tools after the capture adapter is installed by the production UI:

1. `faultline_inspect`
2. `faultline_units`
3. `faultline_load_case`
4. `faultline_reset_case`
5. `faultline_run`
6. `faultline_cancel_active`
7. `faultline_define_oracle`
8. `faultline_apply_source`
9. `faultline_probe`
10. `faultline_reduce`
11. `faultline_pin`
12. `faultline_history`
13. `faultline_revisions`
14. `faultline_restore`
15. `faultline_export`
16. `faultline_autopilot`
17. `faultline_load_capture`

The interface exposes causal operations rather than unrestricted browser scripting. UI actions, the `window.faultline` browser API, and WebMCP tools share the same canonical revision-guarded engine. Long-running WebMCP operations support the native execution `AbortSignal`; `faultline_cancel_active` is the compatibility surface for callers that supply a stable `requestId`.

## Real Playwright failure ingestion

`faultline_load_capture` closes the gap between a real Playwright failure and FAULTLINE's canonical reducer. The browser under test creates a versioned `faultline.capture.v1` artifact in the developer/test process; the FAULTLINE web application only imports that JSON. Production never navigates to the artifact's `provenance.url`.

The stable top-level artifact is:

```json
{
  "schema": "faultline.capture.v1",
  "case": {
    "html": "...",
    "css": "...",
    "js": "...",
    "oracle": {
      "kind": "dom_attribute",
      "selector": "#status",
      "property": "data-broken",
      "equals": "true",
      "action": { "kind": "click", "selector": "#trigger" },
      "delayMs": 0
    }
  },
  "provenance": {
    "url": "http://127.0.0.1:3000/repro",
    "title": "Captured regression",
    "capturedAt": "2026-09-09T00:00:00.000Z",
    "viewport": { "width": 1280, "height": 720 },
    "userAgent": "...",
    "playwright": { "projectName": "chromium", "testTitle": "regression" }
  },
  "diagnostics": {
    "omittedResources": [],
    "capturedScripts": [],
    "capturedStylesheets": []
  }
}
```

WebMCP import is optimistic-revision guarded:

```text
faultline_inspect()
  -> expectedRevision
faultline_load_capture({ expectedRevision, capture })
  -> one new canonical revision + bounded capture summary
faultline_run({ expectedRevision: newRevision })
  -> PASS | FAIL | UNRESOLVED
```

The executable state remains exactly `{html, css, js, oracle}`. Provenance and diagnostics are validated but are not inserted into candidate HTML/JavaScript. Unknown capture versions, malformed metadata, malformed diagnostics, or captures above the source-size ceiling are rejected before the canonical case mutation. Stale expected revisions are rejected by the same canonical mutation path as `faultline_load_case`.

The tool is annotated as mutating and untrusted-content accepting. Importing a capture does not grant any new execution privilege: once loaded, the case is subject to FAULTLINE's existing sandbox, CSP, navigation/network containment, oracle validation, revision semantics, and reducer rules.

The repository-side producer is `integrations/playwright/index.mjs`. `captureFaultlineBaseline(page, options)` captures the current browser baseline; `createFaultlineTest(baseTest, options)` adds a reusable `faultline.arm(...)` fixture that can emit `faultline.capture.json` when the armed test ends unexpectedly. Capture should be armed before the interaction expected to expose the bug so FAULTLINE receives the pre-failure source plus the deterministic replay action.

Same-origin external classic JavaScript capture is opt-in. Cross-origin scripts are not fetched. Unreadable stylesheets, module scripts, disabled JavaScript capture, failed resources, and other unsupported dependencies are represented in `diagnostics.omittedResources` rather than silently disappearing.

## Deterministic oracle measurements

FAULTLINE supports DOM property, DOM attribute, computed-style, DOM-existence, and runtime-error measurements. `dom_attribute` reads the named attribute with `Element.getAttribute()` after the configured action and delay. Its expected value must be a string or `null`: strings preserve exact serialized attribute values such as `aria-expanded="true"` or `data-state="open"`, while `null` distinguishes an absent attribute from an attribute whose value is the empty string. Attribute names are passed directly to `getAttribute()` rather than mapped to JavaScript properties, so ARIA, `data-*`, and other serialized state markers retain browser-native attribute semantics.

## Deterministic pre-measurement actions

An oracle may perform one bounded action contract before measurement:

- `none` — measure without interaction.
- `click` — click the element selected by `action.selector`.
- `set_value` — assign the string in `action.value` to a value-capable form control selected by `action.selector`, then dispatch bubbling `input` followed by `change` before measurement.
- `set_checked` — assign the boolean in `action.checked` to a checkbox or radio selected by `action.selector`, then dispatch bubbling `input` followed by `change` before measurement.
- `sequence` — execute 1–8 ordered `click`, `set_value`, `set_checked`, and/or bounded `wait` steps from `action.steps`. Interactive steps yield to a browser task boundary; a `wait` step uses `durationMs` and allows timer/debounce-driven state to settle before the next interaction.

A sequence is deliberately structured and bounded rather than an arbitrary script escape hatch. Nested sequences and empty sequences are invalid. Each `wait` is limited to 0–2000 ms and the total declared wait budget across one sequence is capped at 2000 ms. Click, set-value, and set-checked steps use the same target/value validation and runtime safety boundaries as their standalone equivalents.

Example:

```json
{
  "kind": "sequence",
  "steps": [
    { "kind": "set_value", "selector": "#email", "value": "user@example.test" },
    { "kind": "set_checked", "selector": "#terms", "checked": true },
    { "kind": "wait", "durationMs": 150 },
    { "kind": "click", "selector": "#submit" }
  ]
}
```

`set_value` is intended for deterministic input, textarea, select, and equivalent value-control reproductions. `set_checked` is intentionally limited to checkbox and radio inputs; it uses the browser's native checked-state setter, so radio-group exclusivity follows normal DOM semantics. Unsupported targets resolve as `ACTION_TARGET_NOT_CHECKABLE`. Missing targets resolve as `ACTION_TARGET_NOT_FOUND`; targets without a writable DOM `value` setter resolve as `ACTION_TARGET_NOT_VALUE_CONTROL`. These execution failures are `UNRESOLVED`, never ordinary PASS/FAIL evidence. Runtime CSP or navigation policy violations detected between sequence steps likewise stop the sequence and retain FAULTLINE's existing `UNRESOLVED` safety evidence.

## Recovery flow

`faultline_restore` requires an exact retained `targetRevision`. Agents must not guess revision IDs. Call `faultline_revisions` first, choose one of the returned recoverable revisions, then pass that revision together with the current optimistic revision guard to `faultline_restore`.

```text
faultline_inspect()
  -> current revision
faultline_revisions({ limit: 8 })
  -> retained structural recovery metadata
faultline_restore({ expectedRevision, targetRevision })
  -> new canonical revision containing the chosen historical case
```

`faultline_revisions` is read-only and returns structural metadata only: revision identity, whether it is current, the canonical mutation event, source-axis character counts, oracle kind, and pin count. It does not expose historical candidate source text. The result set is bounded by the runtime recovery-retention window.

For semantic reduction, use the equivalent discovery pattern: `faultline_units` first, then feed the returned unit ID to `faultline_probe` or `faultline_pin`.
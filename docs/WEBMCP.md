# WebMCP contract

FAULTLINE registers 16 causal tools:

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

The interface exposes causal operations rather than click/type primitives. UI actions, the `window.faultline` browser API, and WebMCP tools share the same canonical revision-guarded engine. Long-running WebMCP operations support the native execution `AbortSignal`; `faultline_cancel_active` is the compatibility surface for callers that supply a stable `requestId`.

## Deterministic pre-measurement actions

An oracle may perform one bounded action before measurement:

- `none` — measure without interaction.
- `click` — click the element selected by `action.selector`.
- `set_value` — assign the string in `action.value` to a value-capable form control selected by `action.selector`, then dispatch bubbling `input` followed by `change` before measurement.

`set_value` is intended for deterministic input, textarea, select, and equivalent value-control reproductions. Missing targets resolve as `ACTION_TARGET_NOT_FOUND`; targets without a writable DOM `value` setter resolve as `ACTION_TARGET_NOT_VALUE_CONTROL`. These execution failures are `UNRESOLVED`, never ordinary PASS/FAIL evidence.

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

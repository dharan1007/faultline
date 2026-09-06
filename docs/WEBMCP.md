# WebMCP contract

FAULTLINE registers 15 causal tools:

1. `faultline_inspect`
2. `faultline_units`
3. `faultline_load_case`
4. `faultline_reset_case`
5. `faultline_run`
6. `faultline_define_oracle`
7. `faultline_apply_source`
8. `faultline_probe`
9. `faultline_reduce`
10. `faultline_pin`
11. `faultline_history`
12. `faultline_revisions`
13. `faultline_restore`
14. `faultline_export`
15. `faultline_autopilot`

The interface exposes causal operations rather than click/type primitives. UI actions, the `window.faultline` browser API, and WebMCP tools share the same canonical revision-guarded engine.

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

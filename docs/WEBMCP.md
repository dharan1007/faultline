# WebMCP contract

FAULTLINE registers exactly nine tools:

1. `faultline_inspect`
2. `faultline_define_oracle`
3. `faultline_run`
4. `faultline_probe`
5. `faultline_reduce`
6. `faultline_pin`
7. `faultline_history`
8. `faultline_restore`
9. `faultline_export`

The interface deliberately exposes causal operations rather than click/type primitives. The same `FaultlineDomain` instance services both UI actions and agent calls.

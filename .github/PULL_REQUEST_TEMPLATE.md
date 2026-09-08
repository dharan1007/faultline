## Failure / debugging problem

<!-- What concrete browser/reducer/oracle problem does this solve? -->

## Change

<!-- Explain the bounded implementation and canonical code path touched. -->

## Verification

- [ ] `npm test` passes.
- [ ] `npm run check` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:browser` was run if runtime/sandbox/WebMCP/browser behavior changed, or the execution limitation is documented.
- [ ] A small synthetic regression case was added/updated where applicable.

## Reducer / oracle contract

- [ ] Committed reductions still require final `FAIL`.
- [ ] `UNRESOLVED` remains distinct.
- [ ] Pins/revision/probe semantics remain correct.
- [ ] Any minimality claim matches the production reducer actually changed.

## Security boundary

- [ ] Sandbox/CSP/navigation/result-channel/export boundaries were not weakened.
- [ ] WebMCP cancellation/revision behavior remains canonical.

## Reproduction / proof

<!-- Include synthetic HTML/CSS/JS + oracle or screenshot/results. -->

## Documentation

<!-- README/security/roadmap changes or why no update is required. -->
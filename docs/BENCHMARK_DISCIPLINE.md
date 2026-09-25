# Benchmark discipline — Faultline commercial evidence

## Reference to replay, honestly

Web Debug Bench (April 2026, 177 problems) published: Claude Code Opus 4.6 +
Replay MCP 76%, Codex GPT-5.4 68%, Claude Code Opus 4.6 61%, Gemini 3 48%.
These are Replay's own numbers — a vendor reference, not independent proof.
Faultline runs the same suite under equivalent conditions
(`benchmarks/manifests/web-debug-bench.json`, pinned SHA required) and does
not claim "better than Replay" until it exceeds the comparable score with an
immutable results bundle.

## Beyond the bench

Web Debug Bench buys competitor relevance; commercial proof also needs real
upstream bugs: exact-commit Playwright/Cypress failures, BugsJS where
relevant, browser-component SWE-bench issues, and consented early-user cases.
No rewritten "equivalent" tests (`benchmarks/manifests/upstream-playwright.json`).

## The money benchmark: agent debugging uplift

Same model, same seed/scaffold/budgets. Control = original repo + test +
trace. Treatment = same + Faultline minimal repro + causal evidence. Measure
valid fix rate, root-cause accuracy, regression pass rate, tokens, context
bytes, tool calls, wall time, cost, incorrect patches
(`benchmarks/manifests/agent-uplift.json`). Win = correct fixes X→Y while
cutting context by Z%.

## Release gates (provisional)

- 0 false-equivalent repros on release corpus;
- median eligible reduction ≥ 80% structural size;
- p50 ≤ 5 min, p95 ≤ 20 min on pinned hardware;
- deterministic repro where original is deterministic;
- significant positive agent uplift;
- agent-fix regression validation on the original test.

A missed target fails the release (Rule D). Progress ≠ superiority.

# FAULTLINE GitHub Discovery Setup

## About panel

**Description**

> Automatically reduce broken HTML/CSS/JS pages into small standalone reproducers using deterministic causal experiments. Local-first browser debugging.

**Homepage**

`https://faultline-webmcp-tejs-projects-70bb4568.vercel.app/`

**Topics**

`debugging`, `developer-tools`, `browser`, `web-development`, `delta-debugging`, `test-case-reduction`, `bug-reproduction`, `javascript`, `html`, `css`, `testing`, `webmcp`, `mcp`, `local-first`

## Repository features

Enable Issues and Discussions. Maintain a public Project only if issue-backed roadmap work stays current. Disable an empty Wiki.

Discussion categories:

1. Announcements
2. Q&A
3. Ideas
4. Show and tell
5. RFC / design
6. Reproducer corpus
7. Oracles and reduction semantics

Pin a welcome post, roadmap post and a Show & Tell prompt asking users to share before/after reduced reproducers.

## Social preview

Use a 1280×640 visual that communicates the transformation without fabricated numbers:

```text
LARGE BROKEN PAGE
HTML + CSS + JS
       ↓
   FAULTLINE
       ↓
SMALLER REPRODUCER
SAME FAILURE ORACLE
```

When a real benchmark corpus exists, numeric before/after examples can be used in launch-specific artwork only when tied to reproducible cases.

## Main branch policy

Recommended after the current `ci` workflow is stable on main:

- require the `ci` status check,
- block force pushes/deletion,
- require conversation resolution,
- prefer squash merge for external contributions,
- delete merged feature branches,
- require maintainer review for sandbox/reducer security paths via CODEOWNERS where account features permit it.

Do not configure a permanently failing browser check as required until its environment is reliable.

## Security / analysis

Enable where available:

- private vulnerability reporting,
- dependency graph,
- Dependabot alerts/security updates,
- secret scanning,
- push protection,
- CodeQL/default code scanning.

OpenSSF Scorecard is useful after its findings are reviewed and maintained.

## Contributor discovery

Maintain real bounded fixtures/oracle tasks under `good first issue`. Use `help wanted` for parser-backed reduction, browser integrations and corpus/benchmark work.

Contributor landing page:

`https://github.com/dharan1007/faultline/contribute`

## Launch gate

Before a major external launch:

- main `ci` is green,
- `npm test`, `npm run check`, `npm run build` pass,
- the real-browser suite passes in a supported environment against local or canonical HTTPS deployment,
- canonical production deployment is READY,
- a visual demo case genuinely reduces while preserving the oracle,
- README and UI state the exact current minimality class,
- sandbox/security docs match the runtime,
- no invented before/after LOC percentages are used.

## Distribution narrative

Lead with the debugging cost:

> Browser bug reports often contain thousands of irrelevant details. FAULTLINE repeatedly removes bounded HTML/CSS/JS units and reruns a deterministic failure oracle, keeping only reductions that preserve the bug, then exports the result as a standalone reproducer.

The strongest launch asset is a real screen recording of one non-trivial public/synthetic case shrinking while the failure remains, followed by the exported reproducer and test evidence.
# Faultline UI/UX Release Status

Release: 0.5.0

## Verified in this release
- redesigned desktop/tablet/mobile workspace
- complete Source / Experiment / Evidence navigation
- no horizontal overflow at 1440x900, 1024x768, 768x1024, 390x844
- no critical-text clipping in the audited viewports
- source editing does not get overwritten by ordinary render/selection
- all four oracle configurations remain available with conditional fields
- pre-measurement click action and delay are explicitly editable
- run / probe / reduce status states are visible and semantic
- pin/unpin is available from the human UI
- WebMCP-originated pin/unpin immediately updates the human UI
- evidence cards expose outcomes, evidence, revisions, and restore actions
- persistence availability is visible rather than silently swallowed
- export path remains available
- nine WebMCP tools remain registered in the rendered audit harness
- actionable Chromium console errors during the complete UI audit: 0

## Publication status
The connected Vercel account contains exactly one project named `faultline-webmcp`, but this execution environment does not expose a safe deployment action that accepts both this local directory and that existing project ID. The corrected release is therefore not represented as deployed until that exact targeting can be performed and fetched back from production.

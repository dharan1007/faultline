# FAULTLINE Build Status (current as of 2026-09-14)

Verified 2026-09-14 on Windows (Node v22.23.2):
- `npm ci --ignore-scripts`: clean, 0 vulnerabilities.
- `node --test tests/cli.test.js tests/capture-contract.test.js tests/reducer-engine.test.js`: 21/21 passing after Windows path fix (`fileURLToPath` for CLI invocation).
- Full `npm test` (5 suites) + `npm run check` + `npm run build` remain canonical on Linux CI; last CI green on main@c7ce0a4 (2026-09-12): `ci` success, `CodeQL` success, `Verify FAULTLINE production` success.

Production:
- Vercel project `faultline-webmcp` production `● Ready` at https://faultline-webmcp.vercel.app (deploy 2026-09-12, verified main SHA).
- GitHub repo `dharan1007/faultline` public exists (created 2026-09-04). Prior Sept-04 notes below are superseded.

---
Superseded 2026-09-04 snapshot:
- `npm test`: 25/25 passing.
- `npm run check`: passing.
- `npm run build`: passing and emits `dist/faultline.html`.
- Self-contained production artifact SHA-256: ec7fe417f4819baae1d02e25e0f37ae9a85ceb1069de8ec4dd88ae8bb49073ae.
- Real Chromium/CDP navigation in this automation environment remains blocked before application execution by `net::ERR_BLOCKED_BY_ADMINISTRATOR`.

Publication:
- Vercel project `faultline-webmcp` exists and responds HTTP 200 at https://faultline-webmcp.vercel.app.
- That current Vercel deployment is a publication probe and is NOT byte-for-byte the verified `dist/` build. Do not treat it as the final production artifact.
- A new public GitHub repository could not be created because the authenticated GitHub connector exposed repository/file operations but no repository-creation action.

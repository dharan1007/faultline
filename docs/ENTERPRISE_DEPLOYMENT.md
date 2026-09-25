# FAULTLINE enterprise/local deployment

FAULTLINE's supported organizational boundary is customer-owned execution. The CLI, Playwright adapters, reducers, captures, traces and optional replay state stay inside the customer's workstation, CI runner or container environment. The public workbench is not a multi-tenant hostile-code execution service.

## Container contract

The repository ships a pinned Playwright container based on:

`mcr.microsoft.com/playwright:v1.63.0-noble`

The project dependency is also pinned to Playwright 1.63.0. Matching the package and browser image versions is mandatory because Playwright browser binaries are version-coupled.

Build:

```bash
docker build --pull --tag faultline:0.9.0 .
```

Validate a capture without sending it to an external service:

```bash
docker run --rm \
  --ipc=host \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=512m \
  --mount type=bind,src="$PWD/artifacts",dst=/work,ro \
  faultline:0.9.0 validate /work/failure.faultline.json
```

Run reduction with a writable output directory:

```bash
docker run --rm \
  --ipc=host \
  --read-only \
  --tmpfs /tmp:rw,nosuid,size=1g \
  --mount type=bind,src="$PWD/input",dst=/input,ro \
  --mount type=bind,src="$PWD/output",dst=/output,rw \
  faultline:0.9.0 analyze /input/failure.faultline.json \
    --browser chromium \
    --axes html,css,js \
    --max-trials 160 \
    --out /output/faultline-report.json
```

The image executes as Playwright's non-root `pwuser`. Do not override it with root for workloads containing application code unless the environment has an independent isolation boundary.

## Trust model

FAULTLINE's browser sandbox is defense in depth; it is not an operating-system isolation boundary. For mutually untrusted tenants, run one job per ephemeral VM/container sandbox with an independent filesystem and network namespace. Do not multiplex unrelated customers into a shared browser process.

Recommended organization deployment:

```text
source repository / CI
        |
        v
ephemeral runner or VM
        |
        +-- application under test
        +-- Playwright browser
        +-- FAULTLINE CLI
        +-- local capture / trace / replay fixtures
        |
        v
source-minimal report + explicitly selected artifacts
        |
        v
customer-controlled artifact store
```

## Confidentiality

By default:

- browser-state capture redacts cookie values;
- browser-state capture redacts local/session storage values;
- URL queries are omitted;
- network request/response bodies are not captured;
- Authorization, Cookie, Set-Cookie, API-key and related secret headers are removed;
- captures and complete reproducer bundles are local files.

Replayable secret-bearing values require an explicit opt-in. Treat those artifacts with the same controls as application secrets.

## Network replay

The Playwright environment adapter records only explicitly allowed origins. Strict replay aborts requests that are not represented by an authorized fixture. This supports deterministic network/data reduction without allowing the hosted workbench to browse arbitrary targets.

## Artifact retention

Recommended defaults:

- source-minimal CI report: retain according to normal test-artifact policy;
- complete capture/reproducer: repository-source confidentiality level;
- trace.zip: repository-source confidentiality level;
- replayable cookies/storage/network bodies: secret-bearing artifact policy;
- benchmark summaries without source: standard engineering telemetry policy.

## Organization controls

FAULTLINE does not currently provide hosted SAML/SCIM/RBAC because its recommended enterprise model is execution inside the customer's existing identity and CI boundary. Access control should therefore be enforced by the source repository, CI runner, artifact store and container/VM platform.

## Supply chain

The project pins npm dependencies and the Playwright container version, produces SPDX SBOM evidence, binds production assets to SHA-256 integrity metadata and binds web production to the exact Git commit.

GitHub artifact attestations are an optional stronger signing layer when the repository/account is eligible. For private repositories GitHub currently requires Enterprise Cloud for artifact attestations. Do not mark signed provenance as present until an attestation is actually generated and verified.

## Production qualification

Organizational capability promotion is evidence-gated. `capability-matrix.json` must not mark an externally qualified capability `PRODUCTION` unless the qualification summary meets the configured external-corpus thresholds. Synthetic fixtures are regression evidence, not external product validation.

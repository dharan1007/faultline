# Security Policy

FAULTLINE intentionally executes user-supplied HTML/CSS/JavaScript inside a constrained browser sandbox. Security reports that could escape or materially weaken that boundary should not be disclosed publicly before investigation.

## Supported version

Security fixes target the current `main` branch and latest tagged release.

## Report privately

Prefer GitHub private vulnerability reporting when enabled under **Security → Report a vulnerability**. If unavailable, contact the repository owner privately through the contact method on the maintainer's GitHub profile.

Do not put exploit details, private data or credentials in a public issue, Discussion, gist or social-media post.

A useful report includes:

- affected commit/release,
- browser/runtime,
- minimal synthetic reproducer,
- required attacker capability,
- observed boundary bypass,
- impact,
- suggested mitigation if known.

## High-priority classes

Report privately if a case can:

- obtain same-origin access from the experiment iframe,
- perform network access despite the configured sandbox/CSP/navigation controls,
- escape the experiment result channel or forge trusted host results,
- bypass navigation/form/anchor containment in a way that performs an external action,
- cause arbitrary host-page DOM/script execution,
- bypass WebMCP input/revision/cancellation boundaries to mutate unrelated state,
- corrupt or restore revision state across cases in a way that breaks canonical isolation,
- inject untrusted export content across `<script>`/`<style>` boundaries,
- leak data from other persisted cases or browser contexts.

## Scope limits

The browser sandbox is not an operating-system/VM isolation boundary. Expensive recursion or a single pathological native operation may consume renderer resources before the host timeout can recover. That is a documented containment limitation, not a claim of process-level isolation.

See `docs/SECURITY.md` for the current technical controls and known limits.

## Coordinated disclosure

The maintainer will acknowledge actionable reports as soon as reasonably possible, reproduce and triage them, coordinate a safe fix and credit the reporter if requested and appropriate. Avoid destructive testing against public/shared infrastructure; use local or explicitly authorized environments.
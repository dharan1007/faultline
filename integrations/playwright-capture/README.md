# FAULTLINE Playwright Capture

This adapter converts a caller-owned, already-authorized Playwright `page` into a bounded `faultline.capture.v1` artifact. It does not navigate on your behalf, fetch a hosted source URL, or widen the browser authority your test already has.

## Preserve failure diagnostics

Arm diagnostics **before** the browser step that may fail, then pass the recorder to `captureFaultlineCase`. The recorder retains bounded `console.error` and uncaught `pageerror` evidence emitted between arming and disposal.

```js
import {
  armFaultlineDiagnostics,
  captureFaultlineCase
} from './integrations/playwright-capture/index.js';

await page.goto('http://127.0.0.1:3000/profile');

const diagnostics = armFaultlineDiagnostics({ page });
try {
  // Drive the application into the failing state here.
  await page.getByLabel('Name').fill('alice');
  await page.getByRole('button', { name: 'Save' }).click();

  const capture = await captureFaultlineCase({
    page,
    diagnostics,
    js: `/* smallest deterministic JS needed by the isolated reproducer */`,
    oracle: {
      kind: 'dom_attribute',
      selector: '#save',
      property: 'aria-disabled',
      equals: 'true',
      action: { kind: 'click', selector: '#save' },
      delayMs: 0
    },
    provenance: {
      testTitle: 'save remains disabled after valid name',
      testFile: 'tests/profile.spec.mjs'
    },
    writeTo: 'save-disabled.faultline.json'
  });

  console.log(capture.diagnostics.consoleErrors);
  console.log(capture.diagnostics.pageErrors);
} finally {
  diagnostics.dispose();
}
```

`dispose()` is idempotent and detaches the Playwright listeners. Events emitted after disposal are not added to later snapshots. A recorder must come from `armFaultlineDiagnostics`; arbitrary diagnostic objects are rejected.

The capture contract bounds diagnostic arrays to 200 entries per class and each diagnostic string to 2048 characters. These limits are validated again before import. Valid captured error evidence is retained in canonical capture provenance, persists with capture-derived revisions, and is included in `faultline.export.v1` after reduction. The human import workbench previews up to five entries from each diagnostic class using `textContent`, so captured strings are displayed as inert text rather than interpreted as HTML.

## Scope

The recorder observes only:

- Playwright `console` events whose type is `error`, and
- Playwright `pageerror` events for uncaught page exceptions.

It intentionally does not capture arbitrary console noise, network bodies, credentials, cookies, local storage, traces, screenshots, or browser context state. Those require separate explicit contracts rather than being smuggled into a failure artifact.

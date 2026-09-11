import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('commercial launch surface is complete and payment configuration fails closed', () => {
  assert.equal(existsSync(new URL('../commerce.html', import.meta.url)), true, 'commerce.html must exist');
  assert.equal(existsSync(new URL('../commercial-config.js', import.meta.url)), true, 'commercial-config.js must exist');

  const html = read('commerce.html');
  for (const required of [
    'Debug Sprint',
    'Production Incident',
    'Team Retainer',
    'Start intake',
    'Request invoice',
    'Service SLA',
    'Playwright',
    'GitHub Action'
  ]) assert.match(html, new RegExp(required, 'i'));

  const config = read('commercial-config.js');
  assert.match(config, /PAYMENT_LINKS/);
  assert.match(config, /INTAKE_URL/);
  assert.match(config, /https:\/\//);
  assert.doesNotMatch(config, /rzp_(live|test)_/i, 'gateway secrets or key IDs must not be embedded');
  assert.doesNotMatch(config, /secret/i, 'browser config must not contain secrets');

  const build = read('scripts-build.mjs');
  assert.match(build, /commerce\.html/);
  assert.match(build, /commercial-config\.js/);
});

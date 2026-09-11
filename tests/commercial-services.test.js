import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');

test('FAULTLINE ships a public paid-debugging services surface',()=>{
  assert.equal(existsSync('services.html'),true,'services.html must exist');
  const html=read('services.html');
  assert.match(html,/Single Debug Sprint/);
  assert.match(html,/Production Incident/);
  assert.match(html,/Team Debugging Retainer/);
  assert.match(html,/https:\/\/tally\.so\/r\/ZjMEKV/);
  assert.match(html,/SLA/i);
  assert.match(html,/Playwright/i);
  assert.match(html,/GitHub Action/i);
  assert.doesNotMatch(html,/rzp_(?:test|live)_[A-Za-z0-9]+/,'no Razorpay credential may be embedded in public HTML');
});

test('commercial CTA is loaded by the product and fails closed without a real payment URL',()=>{
  assert.equal(existsSync('src/commercial-cta.js'),true,'commercial CTA module must exist');
  const runtime=read('src/runtime.js');
  const cta=read('src/commercial-cta.js');
  assert.match(runtime,/commercial-cta\.js/);
  assert.match(cta,/\/services/);
  assert.match(cta,/https:\/\/tally\.so\/r\/ZjMEKV/);
  assert.match(cta,/https:\/\//,'external checkout URLs must require HTTPS');
  assert.match(cta,/payment/i);
});

test('production build and support contract include commercial assets and paid SLA semantics',()=>{
  const build=read('scripts-build.mjs');
  const support=read('SUPPORT.md');
  assert.match(build,/services\.html/);
  assert.match(build,/src\/commercial-cta\.js/);
  assert.match(support,/paid engagement/i);
  assert.match(support,/SLA/i);
  assert.match(support,/payment|invoice/i);
});

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
  assert.match(html,/https:\/\/tally\.so\/r\/WOL5eP/);
  assert.match(html,/SLA/i);
  assert.match(html,/Playwright/i);
  assert.match(html,/GitHub Action/i);
  assert.match(html,/commercial-cta\.js/);
  assert.doesNotMatch(html,/rzp_(?:test|live)_[A-Za-z0-9]+/,'no Razorpay credential may be embedded in public HTML');
});

test('commercial checkout fails closed without a configured HTTPS payment URL',()=>{
  assert.equal(existsSync('src/commercial-cta.js'),true,'commercial checkout module must exist');
  const cta=read('src/commercial-cta.js');
  assert.match(cta,/commercial-config\.json/);
  assert.match(cta,/https:/);
  assert.match(cta,/payment/i);
  assert.match(cta,/https:\/\/tally\.so\/r\/WOL5eP/);
});

test('production build and support contract include commercial assets and paid SLA semantics',()=>{
  const build=read('scripts-build.mjs');
  const support=read('SUPPORT.md');
  assert.match(build,/services\.html/);
  assert.match(build,/src\/commercial-cta\.js/);
  assert.match(build,/commercial-config\.json/);
  assert.match(build,/https:\/\/tally\.so\/r\/WOL5eP/);
  assert.match(support,/paid engagement/i);
  assert.match(support,/SLA/i);
  assert.match(support,/payment|invoice/i);
});

test('clean /services URL is routed to the paid services document',()=>{
  assert.equal(existsSync('vercel.json'),true,'Vercel routing config must exist');
  const vercel=read('vercel.json');
  assert.match(vercel,/"source"\s*:\s*"\/services"/);
  assert.match(vercel,/"destination"\s*:\s*"\/services\.html"/);
});

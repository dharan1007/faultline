import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// False-equivalence rejection: a candidate that fails for a DIFFERENT
// underlying reason must be rejected even though its status is FAIL.
// Baseline throws TypeError; removing the declaration turns the survivor
// into a ReferenceError. probe() must report sameCause:false and reduce()
// must retain the original cause and never commit the different-failure candidate.
const port = 4228;
const server = spawn(process.execPath, ['-e', `const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())){res.statusCode=403;return res.end()}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end('not found')}if(f.endsWith('.js'))res.setHeader('content-type','application/javascript');if(f.endsWith('.html'))res.setHeader('content-type','text/html; charset=utf-8');res.end(b)})}).listen(${port},'127.0.0.1')`], { stdio: 'inherit' });
await new Promise(r => setTimeout(r, 700));

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.faultline && typeof window.faultline.loadCase === 'function');

  const before = await page.evaluate(() => window.faultline.inspect());
  const loaded = await page.evaluate(expectedRevision => window.faultline.loadCase({
    expectedRevision,
    case: {
      html: '<main><button id="pay">Pay</button></main>',
      css: 'button{display:block}',
      js: 'const pay = null;\npay.charge();',
      oracle: { kind: 'runtime_error', action: { kind: 'none' } },
    },
  }), before.revision);

  const ran = await page.evaluate(revision => window.faultline.run({ expectedRevision: revision }), loaded.revision);
  assert.equal(ran.status, 'FAIL', 'baseline must reproduce as FAIL');
  assert.equal(ran.evidence?.errorName, 'TypeError', 'baseline failure must be a TypeError');

  const listed = await page.evaluate(() => window.faultline.units({ targetAxis: 'js' }));
  assert.ok(listed.units.length >= 2, 'fixture must expose at least two removable JS statements');

  const probes = [];
  for (const unit of listed.units) {
    const current = await page.evaluate(() => window.faultline.inspect());
    const probed = await page.evaluate(({ revision, unitId }) => window.faultline.probe({ expectedRevision: revision, targetAxis: 'js', unitId }), { revision: current.revision, unitId: unit.id });
    probes.push({ unitId: unit.id, text: unit.text, status: probed.status, sameCause: probed.sameCause, cause: probed.cause, errorName: probed.evidence?.errorName ?? null });
  }
  const differentFail = probes.filter(p => p.status === 'FAIL' && p.sameCause === false);
  assert.ok(differentFail.length >= 1, 'removing the declaration must keep FAIL but lose the cause');
  assert.ok(differentFail.every(p => /STRONG_MISMATCH/.test(p.cause || '')), 'cause drift must be a strong fingerprint mismatch');
  for (const p of probes.filter(p => p.sameCause === true)) {
    assert.equal(p.status, 'FAIL', 'sameCause:true requires FAIL');
    assert.equal(p.errorName, 'TypeError', 'sameCause:true requires the same error class');
  }

  const preReduce = await page.evaluate(() => window.faultline.inspect());
  const reduced = await page.evaluate(revision =>
    window.faultline.reduce({ expectedRevision: revision, targetAxis: 'js', maxTrials: 80 }),
    preReduce.revision
  );
  assert.equal(reduced.sameCause, true, 'the final retained case must preserve the baseline cause');
  assert.equal(reduced.removed, 0, 'a different-cause candidate must never be accepted as a reduction');
  assert.equal(reduced.mutated, false, 'a no-op reduction must not create a canonical mutation');
  const postReduce = await page.evaluate(() => window.faultline.inspect());
  assert.equal(postReduce.revision, preReduce.revision, 'cause-drifting candidates must not advance the canonical revision');
  assert.deepEqual(postReduce.case, preReduce.case, 'cause-drifting candidates must preserve the exact canonical case');

  console.log('False-equivalence rejection PASS: DIFFERENT_FAIL candidates are rejected while the original same-cause case remains canonical.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}

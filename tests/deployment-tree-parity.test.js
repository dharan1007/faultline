import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/deploy-production.yml','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const manifest='faultline-release-files.txt';

test('production deployment parity is driven by the complete built release manifest',()=>{
  assert.match(pkg.scripts.build,/node scripts-release-manifest\.mjs/,'build must generate a release manifest after all production assets are built');
  assert.ok((workflow.split(`public/${manifest}`).length-1)>=2,'staged and live parity must both read the built release manifest');
  assert.match(workflow,/Smoke-test staged deployment against verified source/);
  assert.match(workflow,/Verify public production alias serves exact tree/);

  const stagedStep=workflow.match(/- name: Smoke-test staged deployment against verified source[\s\S]*?(?=\n      - name: Promote staged deployment to production)/)?.[0];
  const liveStep=workflow.match(/- name: Verify public production alias serves exact tree[\s\S]*?(?=\n      - name: Mark exact deployed tree as production source)/)?.[0];
  assert.ok(stagedStep&&liveStep,'both parity steps must exist');
  for(const step of [stagedStep,liveStep]){
    assert.match(step,/while IFS= read -r file/,'parity must iterate every manifest entry rather than a hard-coded shortlist');
    assert.match(step,/public\/\$file/,'parity must compare the exact built public artifact');
  }
});

test('staged parity authenticates Vercel curl through VERCEL_TOKEN environment only',()=>{
  const stagedStep=workflow.match(/- name: Smoke-test staged deployment against verified source[\s\S]*?(?=\n      - name: Promote staged deployment to production)/)?.[0];
  assert.ok(stagedStep,'staged parity workflow step must exist');
  assert.match(stagedStep,/VERCEL_TOKEN:\s*\$\{\{ secrets\.VERCEL_TOKEN \}\}/);
  assert.match(stagedStep,/vercel\s+curl\s+"\$remote_path"\s+--deployment\s+"\$DEPLOYMENT_URL"/);
  assert.doesNotMatch(stagedStep,/vercel[^\n]*--token/);
  assert.doesNotMatch(stagedStep,/curl -fsSL/);
});

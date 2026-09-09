import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const buildScript = fs.readFileSync('scripts-build.mjs', 'utf8');
const productionFiles = [
  'index.html',
  'src/runtime.js',
  'src/ui.js',
  'src/reducer-engine.js',
  'src/sandbox-policy.js',
  'src/capture-contract.js',
  'src/capture-integration.js'
];

test('production build and deployment parity cover every shipped application file', () => {
  for (const file of productionFiles) {
    assert.ok(
      buildScript.includes(`'${file}'`),
      `${file} must be explicitly staged into the production tree`
    );
    const occurrences = workflow.split(file).length - 1;
    assert.ok(
      occurrences >= 2,
      `${file} must be verified in both staged and live production parity checks; found ${occurrences} workflow references`
    );
  }

  assert.match(workflow, /Smoke-test staged deployment against verified source/);
  assert.match(workflow, /Verify public production alias serves exact tree/);
});

test('staged parity authenticates Vercel curl through VERCEL_TOKEN environment only', () => {
  const stagedStep = workflow.match(/- name: Smoke-test staged deployment against verified source[\s\S]*?(?=\n      - name: Promote staged deployment to production)/)?.[0];
  assert.ok(stagedStep, 'staged parity workflow step must exist');
  assert.match(stagedStep, /VERCEL_TOKEN:\s*\$\{\{ secrets\.VERCEL_TOKEN \}\}/);
  assert.match(stagedStep, /vercel\s+curl\s+"\$remote_path"\s+--deployment\s+"\$DEPLOYMENT_URL"/);
  assert.doesNotMatch(stagedStep, /vercel[^\n]*--token/);
  assert.doesNotMatch(stagedStep, /curl -fsSL/);
});

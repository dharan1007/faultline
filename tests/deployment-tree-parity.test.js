import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const productionFiles = [
  'index.html',
  'src/runtime.js',
  'src/ui.js',
  'src/reducer-engine.js',
  'src/sandbox-policy.js'
];

test('production deployment parity verifies every shipped application file before and after promotion', () => {
  for (const file of productionFiles) {
    const occurrences = workflow.split(file).length - 1;
    assert.ok(
      occurrences >= 2,
      `${file} must be verified in both staged and live production parity checks; found ${occurrences} workflow references`
    );
  }

  assert.match(workflow, /Smoke-test staged deployment against verified source/);
  assert.match(workflow, /Verify public production alias serves exact tree/);
});

test('staged parity uses authenticated Vercel curl so deployment protection cannot replace app bytes', () => {
  const stagedStep = workflow.match(/- name: Smoke-test staged deployment against verified source[\s\S]*?(?=\n      - name: Promote staged deployment to production)/)?.[0];
  assert.ok(stagedStep, 'staged parity workflow step must exist');
  assert.match(stagedStep, /VERCEL_TOKEN:\s*\$\{\{ secrets\.VERCEL_TOKEN \}\}/);
  assert.match(stagedStep, /vercel curl/);
  assert.match(stagedStep, /--deployment[ =\"]+\$DEPLOYMENT_URL/);
  assert.doesNotMatch(stagedStep, /curl -fsSL/);
});

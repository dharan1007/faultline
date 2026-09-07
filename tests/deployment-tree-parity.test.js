import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const buildScript = fs.readFileSync('scripts-build.mjs', 'utf8');
const productionFiles = [
  'index.html',
  'workbench.html',
  'evidence.html',
  'connect.html',
  'src/ui.css',
  'src/ui-shell.js',
  'src/ui-start.js',
  'src/ui-workbench.js',
  'src/ui-evidence.js',
  'src/ui-connect.js',
  'src/runtime.js',
  'src/reducer-engine.js',
  'src/sandbox-policy.js'
];

test('production build manifest includes every shipped product surface and runtime asset', () => {
  for (const file of productionFiles) {
    assert.match(buildScript, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')), `${file} must be present in the canonical production manifest`);
  }
  assert.match(buildScript, /--list/, 'build script must expose the canonical manifest to release automation');
});

test('production deployment parity uses the canonical manifest before and after promotion', () => {
  const stagedStep = workflow.match(/- name: Smoke-test staged deployment against verified source[\s\S]*?(?=\n      - name: Promote staged deployment to production)/)?.[0];
  const liveStep = workflow.match(/- name: Verify public production alias serves exact tree[\s\S]*?(?=\n      - name: Mark exact deployed tree as production source)/)?.[0];
  assert.ok(stagedStep, 'staged parity workflow step must exist');
  assert.ok(liveStep, 'live parity workflow step must exist');
  assert.match(stagedStep, /scripts-build\.mjs --list/, 'staged parity must consume the canonical manifest');
  assert.match(liveStep, /scripts-build\.mjs --list/, 'live parity must consume the canonical manifest');
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

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
  'vendor/acorn.js'
];

test('production build emits every runtime file plus cryptographic release evidence', () => {
  for (const file of productionFiles) assert.ok(buildScript.includes(file),`${file} must be staged`);
  assert.match(buildScript,/integrity\.json/);
  assert.match(buildScript,/release\.json/);
  assert.match(buildScript,/createHash\(['"]sha256['"]\)/);
  assert.match(buildScript,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(buildScript,/GITHUB_SHA/);
});

test('production verification relies on Vercel Git integration without long-lived deployment credentials', () => {
  assert.doesNotMatch(workflow,/VERCEL_TOKEN/);
  assert.doesNotMatch(workflow,/vercel\s+(?:deploy|build|pull|promote|curl)/);
  assert.match(workflow,/Vercel Git integration/i);
  assert.match(workflow,/release\.json/);
  assert.match(workflow,/integrity\.json/);
  assert.match(workflow,/EXPECTED_SHA/);
  assert.match(workflow,/source\?\.authority!=='vercel-git'/);
});

test('production verifier requires exact canonical source and full runtime integrity', () => {
  assert.match(workflow,/seq 1 120/);
  assert.match(workflow,/Canonical production did not converge to the verified FAULTLINE source/);
  assert.match(workflow,/integrity digest mismatch/);
  for (const file of productionFiles) assert.ok(workflow.includes(`/${file}`),`${file} must be represented in canonical integrity verification`);
});

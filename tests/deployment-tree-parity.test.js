import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const buildScript = fs.readFileSync('scripts-build.mjs', 'utf8');
const productionFiles = [
  'index.html',
  'commerce.html',
  'commercial-config.js',
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

test('production promotion uses a scoped Vercel credential only to create and promote an exact Git-source deployment', () => {
  assert.match(workflow,/VERCEL_TOKEN:\s*\$\{\{\s*secrets\.VERCEL_TOKEN\s*\}\}/);
  assert.match(workflow,/api\.vercel\.com\/v13\/deployments/);
  assert.match(workflow,/gitSource/);
  assert.match(workflow,/repo:\"faultline\"/);
  assert.match(workflow,/ref:\"main\"/);
  assert.match(workflow,/sha:\$sha/);
  assert.match(workflow,/target:\"production\"/);
  assert.match(workflow,/api\.vercel\.com\/v2\/deployments\/\$deployment_id\/aliases/);
  assert.match(workflow,/faultline-webmcp\.vercel\.app/);
  assert.doesNotMatch(workflow,/vercel\s+(?:deploy|build|pull|promote|curl)/);
});

test('production verifier requires exact canonical source and full runtime integrity after promotion', () => {
  assert.match(workflow,/githubCommitSha/);
  assert.match(workflow,/source\?\.authority!=='vercel-git'/);
  assert.match(workflow,/Canonical production did not converge to the verified FAULTLINE source/);
  assert.match(workflow,/integrity digest mismatch/);
  for (const file of productionFiles) assert.ok(workflow.includes(`/${file}`),`${file} must be represented in canonical integrity verification`);
});

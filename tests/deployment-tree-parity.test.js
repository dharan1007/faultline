import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/deploy-production.yml','utf8');
const buildScript=fs.readFileSync('scripts-build.mjs','utf8');
const verifier=fs.readFileSync('scripts/verify-live-deployment.mjs','utf8');

const productionFiles=[
  'index.html',
  'services.html',
  'src/runtime.js',
  'src/ui.js',
  'src/reducer-engine.js',
  'src/sandbox-policy.js',
  'src/capture-contract.js',
  'src/causal-fingerprint.js',
  'src/flaky-policy.js',
  'src/causal-dependency-graph.js',
  'src/commercial-cta.js',
  'vendor/acorn.js'
];

test('production build emits every browser runtime asset plus integrity and SLSA provenance',()=>{
  for(const file of productionFiles)assert.ok(buildScript.includes(file),`${file} must be staged`);
  assert.match(buildScript,/integrity\.json/);
  assert.match(buildScript,/provenance\.json/);
  assert.match(buildScript,/release\.json/);
  assert.match(buildScript,/https:\/\/in-toto\.io\/Statement\/v1/);
  assert.match(buildScript,/https:\/\/slsa\.dev\/provenance\/v1/);
  assert.match(buildScript,/signed:false/,'unsigned provenance must be represented honestly until an external signing layer exists');
  assert.match(buildScript,/createHash\(['"]sha256['"]\)/);
  assert.match(buildScript,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(buildScript,/GITHUB_SHA/);
});

test('production promotion is exact-SHA qualification gated and stages before promotion',()=>{
  assert.match(workflow,/workflows:\s*\["self-hosted-qualification"\]/);
  assert.match(workflow,/release_sha:/);
  assert.match(workflow,/FAULTLINE_RELEASE_NOT_CURRENT_MAIN_HEAD/);
  assert.match(workflow,/self-hosted organizational qualification/);
  assert.match(workflow,/self-hosted organizational codeql/);
  assert.match(workflow,/vercel@59\.11\.7\s+pull/);
  assert.match(workflow,/vercel@59\.11\.7\s+build\s+--prod/);
  assert.match(workflow,/vercel@59\.11\.7\s+deploy\s+--prebuilt\s+--prod\s+--skip-domain/);
  assert.match(workflow,/vercel@59\.11\.7\s+promote/);
  const stage=workflow.indexOf('--skip-domain');
  const firstVerify=workflow.indexOf('verify-live-deployment.mjs');
  const promote=workflow.indexOf(' promote ');
  const finalVerify=workflow.lastIndexOf('verify-live-deployment.mjs');
  assert.ok(stage>=0&&firstVerify>stage,'staged deployment must be verified after creation');
  assert.ok(promote>firstVerify,'promotion must follow staged verification');
  assert.ok(finalVerify>promote,'canonical deployment must be reverified after promotion');
});

test('live verifier binds release, SLSA provenance, integrity manifest and every declared asset',()=>{
  assert.match(verifier,/FAULTLINE_LIVE_RELEASE_SHA_MISMATCH/);
  assert.match(verifier,/FAULTLINE_LIVE_PROVENANCE_BINDING_MISMATCH/);
  assert.match(verifier,/https:\/\/in-toto\.io\/Statement\/v1/);
  assert.match(verifier,/https:\/\/slsa\.dev\/provenance\/v1/);
  assert.match(verifier,/FAULTLINE_LIVE_PROVENANCE_SOURCE_MISMATCH/);
  assert.match(verifier,/FAULTLINE_LIVE_PROVENANCE_SUBJECT_MISMATCH/);
  assert.match(verifier,/Object\.entries\(integrity\?\.assets/);
  assert.match(verifier,/FAULTLINE_LIVE_ASSET_SHA_MISMATCH/);
  assert.match(verifier,/chromium\.launch/);
});

test('release verification does not rely on a hard-coded asset shortlist',()=>{
  assert.doesNotMatch(verifier,/const required=\[/);
  assert.match(verifier,/for\(const \[path,expected\] of assets\)/);
});

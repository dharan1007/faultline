import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
const integrityWorkflow=await readFile(new URL('../.github/workflows/production-integrity.yml',import.meta.url),'utf8');

test('production deploy is sourced only from exact self-hosted organizational qualification',()=>{
  assert.match(workflow,/workflows:\s*\["self-hosted-qualification"\]/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/release_sha:/);
  assert.match(workflow,/runs-on:\s*\[self-hosted, Linux, X64, production-ci\]/);
  assert.doesNotMatch(workflow,/runs-on:\s*ubuntu-latest/);
  assert.match(workflow,/git fetch --no-tags origin main/);
  assert.match(workflow,/FAULTLINE_RELEASE_NOT_CURRENT_MAIN_HEAD/);
  assert.match(workflow,/self-hosted organizational qualification/);
  assert.match(workflow,/self-hosted organizational codeql/);
  assert.match(workflow,/FAULTLINE_ORGANIZATIONAL_QUALIFICATION_NOT_GREEN/);
  assert.match(workflow,/FAULTLINE_ORGANIZATIONAL_CODEQL_NOT_GREEN/);
});

test('production deploy installs exact dependencies, audits and reruns source verification',()=>{
  assert.match(workflow,/npm ci --ignore-scripts/);
  assert.match(workflow,/npm audit --audit-level=high --omit=dev/);
  assert.match(workflow,/npm test/);
  assert.match(workflow,/npm run check/);
  assert.match(workflow,/npm run verify:package/);
  assert.doesNotMatch(workflow,/npm install\b/);
});

test('production workflow pins third-party GitHub Actions to immutable commit SHAs',()=>{
  const uses=[...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gm)].map(match=>match[1]);
  assert.ok(uses.length>=2,'expected checkout/setup-node actions');
  for(const action of uses)assert.match(action,/@[0-9a-f]{40}$/i,`un-pinned action: ${action}`);
});

test('production workflow stages exact production-configured artifact before any promotion',()=>{
  assert.match(workflow,/VERCEL_TOKEN:\s*\$\{\{\s*secrets\.VERCEL_TOKEN\s*\}\}/);
  assert.match(workflow,/vercel@59\.11\.7\s+pull/);
  assert.match(workflow,/vercel@59\.11\.7\s+build\s+--prod/);
  assert.match(workflow,/vercel@59\.11\.7\s+deploy\s+--prebuilt\s+--prod\s+--skip-domain/);
  assert.match(workflow,/verify-live-deployment\.mjs/);
  assert.match(workflow,/vercel@59\.11\.7\s+promote/);
  const stage=workflow.indexOf('--skip-domain');
  const firstVerify=workflow.indexOf('verify-live-deployment.mjs');
  const promote=workflow.indexOf(' promote ');
  const finalVerify=workflow.lastIndexOf('verify-live-deployment.mjs');
  assert.ok(stage>=0&&firstVerify>stage,'staged deployment must be verified after creation');
  assert.ok(promote>firstVerify,'promotion must follow staged live verification');
  assert.ok(finalVerify>promote,'canonical deployment must be reverified after promotion');
});

test('continuous production integrity is self-hosted, follows main and uses the same canonical verifier',()=>{
  assert.match(integrityWorkflow,/schedule:/);
  assert.match(integrityWorkflow,/workflow_dispatch:/);
  assert.match(integrityWorkflow,/ref:\s*main/);
  assert.match(integrityWorkflow,/git rev-parse HEAD/);
  assert.match(integrityWorkflow,/runs-on:\s*\[self-hosted, Linux, X64, production-ci\]/);
  assert.doesNotMatch(integrityWorkflow,/runs-on:\s*ubuntu-latest/);
  assert.match(integrityWorkflow,/npm ci --ignore-scripts/);
  assert.match(integrityWorkflow,/playwright install chromium/);
  assert.match(integrityWorkflow,/verify-live-deployment\.mjs/);
  assert.match(integrityWorkflow,/faultline-webmcp\.vercel\.app/);
  assert.doesNotMatch(integrityWorkflow,/vercel-git/);
});

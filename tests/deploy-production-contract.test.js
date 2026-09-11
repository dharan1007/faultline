import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');

test('production verifier installs from the exact lockfile and audits runtime dependencies',()=>{
  assert.match(workflow,/npm ci --ignore-scripts/);
  assert.match(workflow,/npm audit --audit-level=high --omit=dev/);
  assert.doesNotMatch(workflow,/npm install\b/);
});

test('production verifier pins third-party GitHub Actions to immutable commit SHAs',()=>{
  const uses=[...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gm)].map(match=>match[1]);
  assert.ok(uses.length>=2,'expected checkout/setup-node actions');
  for(const action of uses){assert.match(action,/@[0-9a-f]{40}$/i,`un-pinned action: ${action}`);}
});

test('production workflow actively deploys the verified exact Git SHA through Vercel REST rather than waiting on an absent Git link',()=>{
  assert.match(workflow,/VERCEL_TOKEN:\s*\$\{\{\s*secrets\.VERCEL_TOKEN\s*\}\}/);
  assert.match(workflow,/https:\/\/api\.vercel\.com\/v13\/deployments/);
  assert.match(workflow,/gitSource/);
  assert.match(workflow,/"github"/);
  assert.match(workflow,/dharan1007/);
  assert.match(workflow,/faultline/);
  assert.match(workflow,/EXPECTED_SHA/);
  assert.match(workflow,/target:\s*"production"|target:\"production\"|target:"production"/);
  assert.match(workflow,/githubCommitSha/);
});

test('production workflow atomically assigns the public canonical alias only after the exact deployment is READY',()=>{
  assert.match(workflow,/https:\/\/api\.vercel\.com\/v2\/deployments\/\$deployment_id\/aliases/);
  assert.match(workflow,/faultline-webmcp\.vercel\.app/);
  const readyIndex=workflow.indexOf('READY)');
  const aliasIndex=workflow.indexOf('/v2/deployments/$deployment_id/aliases');
  assert.ok(readyIndex>=0&&aliasIndex>readyIndex,'canonical alias must be assigned only after Vercel reports the exact deployment READY');
});

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

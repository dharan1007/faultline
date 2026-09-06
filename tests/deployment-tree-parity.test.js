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
      occurrences >= 3,
      `${file} must be part of the production file manifest and both staged/live parity checks; found ${occurrences} workflow references`
    );
  }

  assert.match(workflow, /Smoke-test staged deployment against verified source/);
  assert.match(workflow, /Verify public production alias serves exact tree/);
});

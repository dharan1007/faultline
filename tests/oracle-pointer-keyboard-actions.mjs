import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contract = await readFile(new URL('../src/capture-contract.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../src/runtime.js', import.meta.url), 'utf8');

for (const kind of ['hover','pointer_move','key_press','scroll']) {
  assert.match(contract, new RegExp(`['\"]${kind}['\"]`), `capture contract must support ${kind}`);
  assert.match(runtime, new RegExp(`['\"]${kind}['\"]`), `runtime must execute ${kind}`);
}

assert.match(runtime, /MouseEvent/, 'pointer actions must use browser mouse events');
assert.match(runtime, /KeyboardEvent/, 'key_press must use browser keyboard events');
assert.match(runtime, /scrollTop|scrollTo/, 'scroll action must mutate scroll state');
console.log('oracle pointer/keyboard action contract present');

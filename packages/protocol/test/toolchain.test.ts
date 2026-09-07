import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootPackage = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
const tsconfig = JSON.parse(await readFile(new URL('../../../tsconfig.base.json', import.meta.url), 'utf8'));

test('V3 workspace preserves production and enables strict TS', () => {
  assert.equal(rootPackage.scripts.build, 'node scripts-build.mjs');
  assert.match(rootPackage.scripts['v3:typecheck'], /tsc/);
  assert.match(rootPackage.scripts['v3:test'], /tsx/);
  assert.deepEqual(rootPackage.workspaces, ['packages/*','packages/adapters/*']);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
  assert.equal(tsconfig.compilerOptions.module, 'NodeNext');
});

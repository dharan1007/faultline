import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const contractPath=new URL('../src/capture-contract.js',import.meta.url);

test('Playwright capture contract exists as a dedicated production module',()=>{
  assert.equal(existsSync(contractPath),true,'src/capture-contract.js must exist before FAULTLINE can validate portable browser captures');
});

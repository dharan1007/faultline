import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildReproManifest,writeReproBundle} from '../src/reproducer-artifact.js';

const oracle={kind:'runtime_error'};
const fingerprint={version:'faultline.causal-fingerprint.v1',signature:'abc'};

test('repro manifest pins the runtime toolchain',()=>{
  const manifest=buildReproManifest({oracle,fingerprint});
  assert.equal(manifest.format,'faultline-repro.v2');
  assert.deepEqual(manifest.runtime,{node:'22.x',playwright:'1.63.0'});
  assert.match(manifest.manifestSha256,/^[0-9a-f]{64}$/);
});

test('bundle evidence is emitted last and covers generated payloads',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-repro-bundle-'));
  try{
    const result=await writeReproBundle(dir,{
      oracle,fingerprint,
      minimalFiles:{'index.html':'<main>minimal</main>','src/app.js':'console.log("nested")'},
      testFiles:{'repro.mjs':'console.log("repro")'}
    });
    const evidence=JSON.parse(await readFile(join(dir,'evidence.json'),'utf8'));
    assert.equal(evidence.schema,'faultline.repro-evidence.v2');
    for(const required of [
      'Dockerfile','package.json','environment.lock','failure-oracle.json',
      'causal-fingerprint.json','README.md','run.sh','run.ps1',
      'minimal/index.html','minimal/src/app.js','test/repro.mjs'
    ]) {
      assert.ok(evidence.files[required],`${required} must be covered by evidence`);
      assert.match(evidence.files[required].sha256,/^[0-9a-f]{64}$/);
      assert.ok(evidence.files[required].bytes>0);
    }
    assert.equal(result.files['evidence.json'].bytes,(await readFile(join(dir,'evidence.json'))).length);
    const docker=await readFile(join(dir,'Dockerfile'),'utf8');
    const packageJson=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
    assert.match(docker,/FROM node:22-bookworm/);
    assert.equal(packageJson.engines.node,'22.x');
    assert.equal(packageJson.dependencies.playwright,'1.63.0');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('bundle rejects traversal and absolute payload paths',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-repro-traversal-'));
  try{
    await assert.rejects(
      writeReproBundle(dir,{oracle,fingerprint,minimalFiles:{'../escape.txt':'bad'}}),
      /REPRO_INVALID_FILE_NAME|REPRO_FILE_ESCAPE/
    );
    await assert.rejects(
      writeReproBundle(dir,{oracle,fingerprint,testFiles:{'/tmp/escape.mjs':'bad'}}),
      /REPRO_INVALID_FILE_NAME|REPRO_FILE_ESCAPE/
    );
  }finally{await rm(dir,{recursive:true,force:true});}
});

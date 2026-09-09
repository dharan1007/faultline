import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureFaultlineCase } from '../playwright/faultline-capture.mjs';

const oracle={kind:'dom_exists',selector:'#captured',equals:true,action:{kind:'none'},delayMs:0};
function fakePage(){
  return {
    url:()=> 'http://127.0.0.1:3000/repro',
    title:async()=> 'Captured fixture',
    evaluate:async fn=>fn.toString().includes('navigator.userAgent')?'Fake Chromium UA':{html:'<main id="captured">Captured</main>',css:'#captured { display: block; }',js:'',baseline:{status:'FAIL',evidence:{actual:true,expected:true,kind:'dom_exists',selector:'#captured'}},inaccessible:[]},
    viewportSize:()=>({width:1280,height:720})
  };
}

test('capture helper snapshots source and writes one measured validated artifact',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-helper-')),outputPath=join(dir,'capture.json');
  try{
    const artifact=await captureFaultlineCase({page:fakePage(),oracle,outputPath,browserName:'chromium',capturedAt:'2026-09-09T00:00:00.000Z'});
    assert.deepEqual(JSON.parse(await readFile(outputPath,'utf8')),artifact);
    assert.match(artifact.case.html,/captured/);
    assert.match(artifact.case.css,/#captured/);
    assert.equal(artifact.case.js,'');
    assert.deepEqual(artifact.case.oracle,oracle);
    assert.equal(artifact.baseline.status,'FAIL');
    assert.equal(artifact.provenance.userAgent,'Fake Chromium UA');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('capture helper fails before writing when provenance cannot be collected',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-helper-')),outputPath=join(dir,'capture.json');
  const broken={...fakePage(),title:async()=>{throw new Error('page gone');}};
  try{
    await assert.rejects(()=>captureFaultlineCase({page:broken,oracle,outputPath,browserName:'chromium'}),/FAULTLINE_CAPTURE_PROVENANCE/);
    await assert.rejects(()=>stat(outputPath),error=>error?.code==='ENOENT');
  }finally{await rm(dir,{recursive:true,force:true});}
});

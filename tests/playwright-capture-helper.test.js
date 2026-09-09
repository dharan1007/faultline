import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureFaultlineCase } from '../playwright/faultline-capture.mjs';

const caseValue={
  html:'<main id="captured">Captured</main>',
  css:'#captured{display:block}',
  js:'',
  oracle:{kind:'dom_exists',selector:'#captured',equals:true,action:{kind:'none'},delayMs:0}
};

function fakePage(){
  return {
    url:()=> 'http://127.0.0.1:3000/repro',
    title:async()=> 'Captured fixture',
    evaluate:async fn=> fn.toString().includes('userAgent')?'Fake Chromium UA':null,
    viewportSize:()=>({width:1280,height:720})
  };
}

test('capture helper writes one validated artifact after provenance succeeds',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-helper-'));
  const outputPath=join(dir,'capture.json');
  try{
    const artifact=await captureFaultlineCase({page:fakePage(),caseValue,outputPath,browserName:'chromium',capturedAt:'2026-09-09T00:00:00.000Z'});
    assert.deepEqual(JSON.parse(await readFile(outputPath,'utf8')),artifact);
    assert.deepEqual(artifact.case,caseValue);
    assert.equal(artifact.provenance.url,'http://127.0.0.1:3000/repro');
    assert.equal(artifact.provenance.title,'Captured fixture');
    assert.equal(artifact.provenance.userAgent,'Fake Chromium UA');
    assert.deepEqual(artifact.provenance.viewport,{width:1280,height:720});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('capture helper fails before writing when provenance cannot be collected',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-helper-'));
  const outputPath=join(dir,'capture.json');
  const broken={...fakePage(),title:async()=>{throw new Error('page gone');}};
  try{
    await assert.rejects(()=>captureFaultlineCase({page:broken,caseValue,outputPath,browserName:'chromium'}),/FAULTLINE_CAPTURE_PROVENANCE/);
    await assert.rejects(()=>stat(outputPath),error=>error?.code==='ENOENT');
  }finally{await rm(dir,{recursive:true,force:true});}
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const execFileAsync=promisify(execFile);
const cli=new URL('../bin/faultline.mjs',import.meta.url);
const capture={
  schema:'faultline.capture.v1',capturedAt:'2026-09-11T00:00:00.000Z',
  source:{url:'http://127.0.0.1/example',title:'CLI fixture',html:'<main><button id="save" aria-disabled="true">Save</button><p>noise</p></main>',css:'button{display:block} p{color:gray}',js:"document.querySelector('#save').addEventListener('click',()=>document.querySelector('#save').setAttribute('aria-disabled','true'));"},
  oracle:{kind:'dom_attribute',selector:'#save',property:'aria-disabled',equals:'true',action:{kind:'click',selector:'#save'},delayMs:0},
  environment:{browser:'chromium',playwrightVersion:'1.55.0',viewport:{width:1280,height:720}},
  provenance:{adapter:'@faultline/playwright-capture',testTitle:'CLI contract fixture',testFile:'tests/cli.test.js'},
  diagnostics:{externalDependencies:[],consoleErrors:[],pageErrors:[]}
};

async function fixture(){const dir=await mkdtemp(join(tmpdir(),'faultline-cli-'));const file=join(dir,'capture.json');await writeFile(file,JSON.stringify(capture));return{dir,file};}

test('CLI validate emits machine-readable capture evidence without source text',async()=>{
  const {dir,file}=await fixture();
  try{
    const {stdout,stderr}=await execFileAsync(process.execPath,[cli.pathname,'validate',file],{encoding:'utf8'});
    assert.equal(stderr,'');const result=JSON.parse(stdout);assert.equal(result.ok,true);assert.equal(result.schema,'faultline.capture.v1');assert.equal(result.provenance.provenance.testTitle,'CLI contract fixture');assert.equal(result.sourceBytes.html,Buffer.byteLength(capture.source.html));assert.match(result.sourceSha256.html,/^[0-9a-f]{64}$/);assert.equal(stdout.includes(capture.source.html),false,'validation output must not leak captured source');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI inspect exposes deterministic semantic-unit counts and digests',async()=>{
  const {dir,file}=await fixture();
  try{
    const {stdout}=await execFileAsync(process.execPath,[cli.pathname,'inspect',file],{encoding:'utf8'});const result=JSON.parse(stdout);assert.ok(result.units.html>=1);assert.ok(result.units.css>=1);assert.ok(result.units.js>=1);assert.match(result.sourceSha256.js,/^[0-9a-f]{64}$/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI rejects unsupported capture before browser execution',async()=>{
  const {dir,file}=await fixture();
  try{
    await writeFile(file,JSON.stringify({...capture,schema:'faultline.capture.v99'}));
    await assert.rejects(execFileAsync(process.execPath,[cli.pathname,'validate',file],{encoding:'utf8'}),error=>error.code===2&&/UNSUPPORTED_CAPTURE_SCHEMA/.test(error.stderr));
  }finally{await rm(dir,{recursive:true,force:true});}
});

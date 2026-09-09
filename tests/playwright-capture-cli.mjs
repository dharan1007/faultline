import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const run=(args)=>new Promise(resolve=>{
  const child=spawn(process.execPath,['bin/faultline-capture.mjs',...args],{cwd:process.cwd(),env:process.env});
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  child.on('close',code=>resolve({code,stdout,stderr}));
});

const dir=await mkdtemp(join(tmpdir(),'faultline-capture-'));
const casePath=join(dir,'case.json');
const outPath=join(dir,'capture.json');
const invalidOutPath=join(dir,'invalid.capture.json');
const invalidCasePath=join(dir,'invalid-case.json');
const caseValue={
  html:'<main id="captured">Captured</main>',
  css:'#captured{display:block}',
  js:'document.querySelector("#captured").dataset.ok="yes";',
  oracle:{kind:'dom_exists',selector:'#captured',equals:true,action:{kind:'none'},delayMs:0}
};
await writeFile(casePath,JSON.stringify(caseValue));
await writeFile(invalidCasePath,JSON.stringify({...caseValue,html:42}));

const server=createServer((req,res)=>{
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end('<!doctype html><html><head><title>FAULTLINE Capture Fixture</title></head><body><main>fixture</main></body></html>');
});
await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
const address=server.address();
const url=`http://127.0.0.1:${address.port}/repro`;

try{
  const success=await run(['--url',url,'--case',casePath,'--out',outPath,'--browser','chromium']);
  assert.equal(success.code,0,`capture CLI must succeed\nstdout=${success.stdout}\nstderr=${success.stderr}`);
  const artifact=JSON.parse(await readFile(outPath,'utf8'));
  assert.equal(artifact.format,'faultline.capture');
  assert.equal(artifact.version,1);
  assert.deepEqual(artifact.case,caseValue,'capture must preserve the exact source/oracle case supplied by the test boundary');
  assert.equal(artifact.provenance.adapter,'faultline-playwright');
  assert.equal(artifact.provenance.adapterVersion,1);
  assert.equal(artifact.provenance.url,url);
  assert.equal(artifact.provenance.title,'FAULTLINE Capture Fixture');
  assert.match(artifact.provenance.userAgent,/Chrome|Chromium/);
  assert.equal(artifact.provenance.browser,'chromium');
  assert.ok(artifact.provenance.viewport.width>0&&artifact.provenance.viewport.height>0,'capture must record a concrete viewport');
  assert.equal(artifact.baseline.captured,true);
  assert.match(success.stdout,/FAULTLINE capture written:/);

  const invalid=await run(['--url',url,'--case',invalidCasePath,'--out',invalidOutPath]);
  assert.notEqual(invalid.code,0,'invalid case must fail closed');
  assert.match(invalid.stderr,/FAULTLINE_CAPTURE_INVALID/);
  await assert.rejects(()=>stat(invalidOutPath),error=>error?.code==='ENOENT','failed capture must not leave a partial artifact');

  console.log('Playwright capture CLI PASS: real Chromium provenance and exact source case are packaged atomically; invalid input leaves no artifact.');
} finally {
  await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
}

import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const run=args=>new Promise(resolve=>{const child=spawn(process.execPath,['bin/faultline-capture.mjs',...args],{cwd:process.cwd(),env:process.env});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.on('close',code=>resolve({code,stdout,stderr}));});
const dir=await mkdtemp(join(tmpdir(),'faultline-capture-'));
const oraclePath=join(dir,'oracle.json'),outPath=join(dir,'capture.json'),invalidOutPath=join(dir,'invalid.capture.json'),invalidOraclePath=join(dir,'invalid-oracle.json');
const oracle={kind:'dom_attribute',selector:'#captured',property:'data-state',equals:'broken',action:{kind:'none'},delayMs:0};
await writeFile(oraclePath,JSON.stringify(oracle));
await writeFile(invalidOraclePath,JSON.stringify({...oracle,action:{kind:'click',selector:'#captured'}}));
const server=createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>FAULTLINE Capture Fixture</title><style>#captured{display:block}</style></head><body><main id="captured" data-state="broken">fixture</main><p>noise</p></body></html>');});
await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
const url=`http://127.0.0.1:${server.address().port}/repro`;
try{
  const success=await run(['--url',url,'--oracle',oraclePath,'--out',outPath,'--browser','chromium']);
  assert.equal(success.code,0,`capture CLI must succeed\nstdout=${success.stdout}\nstderr=${success.stderr}`);
  const artifact=JSON.parse(await readFile(outPath,'utf8'));
  assert.equal(artifact.format,'faultline.capture');
  assert.equal(artifact.version,1);
  assert.match(artifact.case.html,/id="captured"/);
  assert.match(artifact.case.html,/noise/);
  assert.match(artifact.case.css,/#captured/);
  assert.equal(artifact.case.js,'');
  assert.deepEqual(artifact.case.oracle,oracle);
  assert.equal(artifact.baseline.status,'FAIL');
  assert.equal(artifact.baseline.evidence.actual,'broken');
  assert.equal(artifact.provenance.url,url);
  assert.equal(artifact.provenance.title,'FAULTLINE Capture Fixture');
  assert.match(artifact.provenance.userAgent,/Chrome|Chromium/);
  assert.match(success.stdout,/FAULTLINE capture written:/);

  const invalid=await run(['--url',url,'--oracle',invalidOraclePath,'--out',invalidOutPath]);
  assert.notEqual(invalid.code,0,'unsupported replay action must fail closed');
  assert.match(invalid.stderr,/FAULTLINE_CAPTURE_UNSUPPORTED_ACTION/);
  await assert.rejects(()=>stat(invalidOutPath),error=>error?.code==='ENOENT');
  console.log('Playwright capture CLI PASS: a real Chromium page plus oracle becomes a self-contained measured FAULTLINE capture without a prebuilt source case.');
}finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}

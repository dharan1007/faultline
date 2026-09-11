import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const execFileAsync=promisify(execFile);const cli=new URL('../bin/faultline.mjs',import.meta.url);
const dir=await mkdtemp(join(tmpdir(),'faultline-cli-browser-'));
const capture={
  schema:'faultline.capture.v1',capturedAt:'2026-09-11T00:00:00.000Z',
  source:{url:'http://127.0.0.1/profile',title:'Browser CLI fixture',html:'<label>Name <input id="name"></label><button id="save" aria-disabled="true">Save</button><section id="noise"><p>unrelated diagnostics</p></section>',css:'button{display:block} #noise{color:gray} section{margin:20px}',js:"const name=document.querySelector('#name'),save=document.querySelector('#save');name.addEventListener('input',()=>save.dataset.name=name.value);save.addEventListener('click',()=>save.setAttribute('aria-disabled',save.dataset.name==='alice'?'true':'false'));console.debug('unrelated');"},
  oracle:{kind:'dom_attribute',selector:'#save',property:'aria-disabled',equals:'true',action:{kind:'sequence',steps:[{kind:'set_value',selector:'#name',value:'alice'},{kind:'click',selector:'#save'}]},delayMs:0},
  environment:{browser:'chromium',playwrightVersion:'1.55.0',viewport:{width:1280,height:720}},
  provenance:{adapter:'@faultline/playwright-capture',testTitle:'browser CLI preserves failure',testFile:'tests/cli-browser.mjs'},
  diagnostics:{externalDependencies:[],consoleErrors:[],pageErrors:[]}
};
try{
  const input=join(dir,'capture.json'),out=join(dir,'report.json'),bundle=join(dir,'bundle.json');await writeFile(input,JSON.stringify(capture));
  const {stdout,stderr}=await execFileAsync(process.execPath,[cli.pathname,'analyze',input,'--browser','chromium','--axes','html,css,js','--max-trials','80','--out',out,'--bundle',bundle],{encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  assert.equal(stderr,'');const inline=JSON.parse(stdout),report=JSON.parse(await readFile(out,'utf8')),exported=JSON.parse(await readFile(bundle,'utf8'));
  assert.equal(inline.schema,'faultline.ci-report.v1');assert.equal(report.final.status,'FAIL');assert.equal(report.containment.unexpectedNetworkRequests,0);assert.equal(report.containment.pageErrors,0);assert.equal(report.reductions.length,3);assert.ok(report.reductions.some(item=>item.afterBytes<item.beforeBytes),'at least one axis must be causally reduced');assert.ok(report.reductions.every(item=>item.afterBytes<=item.beforeBytes));assert.equal(exported.schema,'faultline.export.v1');assert.match(exported.standaloneHtml,/save/);
  console.log('FAULTLINE CLI browser PASS: captured failure reproduced, causally reduced, preserved, source-minimal report emitted, and explicit bundle exported.');
}finally{await rm(dir,{recursive:true,force:true});}

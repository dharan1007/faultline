#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,stat,writeFile,mkdir} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCaptureArtifact,normalizeCaptureArtifact,summarizeCaptureProvenance} from '../src/capture-contract.js';
import {semanticUnits} from '../src/reducer-engine.js';

const APP_ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const MAX_CAPTURE_FILE_BYTES=4*1024*1024;
const AXES=new Set(['html','css','js']);
const BROWSERS=new Set(['chromium','firefox','webkit']);

function digest(value){return createHash('sha256').update(String(value??'')).digest('hex');}
function fail(message,code=2){const error=new Error(message);error.exitCode=code;throw error;}
function usage(){return `FAULTLINE CLI\n\nUsage:\n  faultline validate <capture.json>\n  faultline inspect <capture.json>\n  faultline analyze <capture.json> [--out report.json] [--bundle bundle.json] [--browser chromium|firefox|webkit] [--axes html,css,js] [--max-trials 80]\n\nExit codes: 0 success, 2 invalid input/contract, 3 failure did not reproduce, 4 containment violation, 5 internal/runtime failure.\n`;}
function parseOptions(argv){
  const positional=[];const options={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];
    if(!token.startsWith('--')){positional.push(token);continue;}
    const name=token.slice(2);if(!name)fail('INVALID_OPTION');
    const next=argv[i+1];if(!next||next.startsWith('--'))fail(`MISSING_OPTION_VALUE:${name}`);
    options[name]=next;i++;
  }
  return{positional,options};
}
async function readCapture(path){
  if(!path)fail('CAPTURE_PATH_REQUIRED');
  let info;try{info=await stat(path);}catch{fail('CAPTURE_NOT_FOUND');}
  if(!info.isFile())fail('CAPTURE_NOT_FILE');
  if(info.size>MAX_CAPTURE_FILE_BYTES)fail('CAPTURE_FILE_TOO_LARGE');
  let parsed;try{parsed=JSON.parse(await readFile(path,'utf8'));}catch{fail('INVALID_CAPTURE_JSON');}
  try{return validateCaptureArtifact(parsed);}catch(error){error.exitCode=2;throw error;}
}
function captureSummary(capture){
  const normalized=normalizeCaptureArtifact(capture);
  const units=Object.fromEntries(['html','css','js'].map(axis=>[axis,semanticUnits(axis,normalized.case[axis]).length]));
  const sourceBytes=Object.fromEntries(['html','css','js'].map(axis=>[axis,Buffer.byteLength(normalized.case[axis])]));
  const sourceSha256=Object.fromEntries(['html','css','js'].map(axis=>[axis,digest(normalized.case[axis])]));
  return{schema:capture.schema,capturedAt:capture.capturedAt,sourceUrl:capture.source.url,provenance:summarizeCaptureProvenance(capture),units,sourceBytes,sourceSha256};
}
async function writeJson(path,value){await mkdir(dirname(resolve(path)),{recursive:true});await writeFile(path,`${JSON.stringify(value,null,2)}\n`,'utf8');}
function allowedAsset(pathname){return pathname==='/'||pathname==='/index.html'||pathname==='/style.css'||pathname==='/favicon.svg'||pathname.startsWith('/src/')||pathname.startsWith('/vendor/');}
function contentType(path){const ext=extname(path);if(ext==='.js'||ext==='.mjs')return'application/javascript; charset=utf-8';if(ext==='.html')return'text/html; charset=utf-8';if(ext==='.css')return'text/css; charset=utf-8';if(ext==='.svg')return'image/svg+xml';return'application/octet-stream';}
async function startWorkbenchServer(){
  const requests=[];
  const server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://127.0.0.1').pathname;requests.push(pathname);
      if(!allowedAsset(pathname)){res.statusCode=404;return res.end('not found');}
      const relative=pathname==='/'?'index.html':pathname.slice(1);
      const file=resolve(APP_ROOT,relative);
      if(file!==APP_ROOT&&!file.startsWith(`${APP_ROOT}${sep}`)){res.statusCode=403;return res.end('forbidden');}
      const body=await readFile(file);res.setHeader('content-type',contentType(file));res.setHeader('cache-control','no-store');res.end(body);
    }catch{res.statusCode=404;res.end('not found');}
  });
  await new Promise((ok,reject)=>server.listen(0,'127.0.0.1',ok).once('error',reject));
  const address=server.address();
  return{server,origin:`http://127.0.0.1:${address.port}`,requests};
}
async function analyze(capture,options){
  const browserName=options.browser??'chromium';if(!BROWSERS.has(browserName))fail('INVALID_BROWSER');
  const axes=(options.axes??'html,css,js').split(',').map(x=>x.trim()).filter(Boolean);if(!axes.length||axes.some(axis=>!AXES.has(axis))||new Set(axes).size!==axes.length)fail('INVALID_AXES');
  const maxTrials=Number(options['max-trials']??80);if(!Number.isInteger(maxTrials)||maxTrials<1||maxTrials>200)fail('INVALID_MAX_TRIALS');
  const {chromium,firefox,webkit}=await import('playwright');const browserType={chromium,firefox,webkit}[browserName];
  const local=await startWorkbenchServer();let browser;const pageErrors=[];
  const started=Date.now();
  try{
    browser=await browserType.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',error=>pageErrors.push(String(error)));
    await page.addInitScript(()=>{const tools=[];Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:async tool=>tools.push(tool)}});window.__faultlineCliTools=tools;});
    const response=await page.goto(local.origin,{waitUntil:'networkidle'});if(!response||response.status()!==200)throw new Error('WORKBENCH_BOOT_FAILED');
    await page.waitForFunction(()=>window.faultline&&typeof window.faultline.importCapture==='function');
    const baselineRequestCount=local.requests.length;
    const before=await page.evaluate(()=>window.faultline.inspect());
    let imported;
    try{imported=await page.evaluate(({expectedRevision,capture})=>window.faultline.importCapture({expectedRevision,capture}),{expectedRevision:before.revision,capture});}
    catch(error){const message=String(error?.message||error);if(/BASELINE_NOT_FAILING|NOT_FAIL|REPRODUC/i.test(message))fail('FAILURE_DID_NOT_REPRODUCE',3);throw error;}
    if(imported?.baseline?.status!=='FAIL')fail('FAILURE_DID_NOT_REPRODUCE',3);
    const reductions=[];
    for(const targetAxis of axes){
      const state=await page.evaluate(()=>window.faultline.inspect());
      const axisBefore=String(state.case[targetAxis]??'');
      const reduction=await page.evaluate(({expectedRevision,targetAxis,maxTrials})=>window.faultline.reduce({expectedRevision,targetAxis,maxTrials}),{expectedRevision:state.revision,targetAxis,maxTrials});
      const after=await page.evaluate(()=>window.faultline.inspect());
      const axisAfter=String(after.case[targetAxis]??'');
      reductions.push({axis:targetAxis,status:reduction.status,beforeBytes:Buffer.byteLength(axisBefore),afterBytes:Buffer.byteLength(axisAfter),removed:reduction.removed??0,trials:reduction.trials??reduction.trialCount??0,passes:reduction.passes??0,beforeSha256:digest(axisBefore),afterSha256:digest(axisAfter)});
    }
    const finalState=await page.evaluate(()=>window.faultline.inspect());
    const finalRun=await page.evaluate(expectedRevision=>window.faultline.run({expectedRevision}),finalState.revision);
    if(finalRun?.status!=='FAIL')fail('FAILURE_NOT_PRESERVED',3);
    const escaped=local.requests.slice(baselineRequestCount).filter(path=>!allowedAsset(path));if(escaped.length)fail(`SANDBOX_ESCAPE_DETECTED:${escaped[0]}`,4);
    if(pageErrors.length)throw new Error(`PAGE_ERROR:${pageErrors[0]}`);
    const bundle=await page.evaluate(()=>window.faultline.exportBundle());
    const finalCase=finalState.case;
    const report={schema:'faultline.ci-report.v1',generatedAt:new Date().toISOString(),browser:browserName,durationMs:Date.now()-started,capture:captureSummary(capture),baseline:{status:imported.baseline.status,revision:imported.revision},reductions,final:{status:finalRun.status,revision:finalState.revision,sourceBytes:Object.fromEntries(['html','css','js'].map(axis=>[axis,Buffer.byteLength(String(finalCase[axis]??''))])),sourceSha256:Object.fromEntries(['html','css','js'].map(axis=>[axis,digest(finalCase[axis])])),evidence:finalRun.evidence??null},containment:{unexpectedNetworkRequests:0,pageErrors:0}};
    if(options.out)await writeJson(options.out,report);if(options.bundle)await writeJson(options.bundle,bundle);
    return report;
  }finally{if(browser)await browser.close();await new Promise(ok=>local.server.close(ok));}
}

async function main(){
  const [command,...rest]=process.argv.slice(2);if(!command||command==='help'||command==='--help'||command==='-h'){process.stdout.write(usage());return;}
  const {positional,options}=parseOptions(rest);const capture=await readCapture(positional[0]);
  if(command==='validate'){process.stdout.write(`${JSON.stringify({ok:true,...captureSummary(capture)})}\n`);return;}
  if(command==='inspect'){process.stdout.write(`${JSON.stringify(captureSummary(capture),null,2)}\n`);return;}
  if(command==='analyze'){const report=await analyze(capture,options);process.stdout.write(`${JSON.stringify(report)}\n`);return;}
  fail('UNKNOWN_COMMAND');
}

main().catch(error=>{const message=String(error?.message||error||'INTERNAL_ERROR').replace(/[\r\n]+/g,' ');let code=Number(error?.exitCode)||5;if(code===5&&/^(INVALID_|UNSUPPORTED_|CAPTURE_)/.test(message))code=2;process.stderr.write(`FAULTLINE_ERROR ${message}\n`);process.exitCode=code;});

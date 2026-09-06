import fs from 'node:fs';

const runtimePath='src/runtime.js';
let s=fs.readFileSync(runtimePath,'utf8');
const old=`async function executeWebMCPOperation(tool,execute,input){
  const requestId=requireRequestId(input);
  if(activeWebMCPOperations.has(requestId))throw new Error('REQUEST_ID_IN_USE');
  const controller=new AbortController();
  const operation={requestId,tool,startedAt:new Date().toISOString(),controller};
  activeWebMCPOperations.set(requestId,operation);
  const abortPromise=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(abortError()),{once:true}));
  try{
    const task=Promise.resolve().then(()=>execute(input,{signal:controller.signal}));
    return await Promise.race([task,abortPromise]);
  }finally{
    activeWebMCPOperations.delete(requestId);
  }
}
`;
const replacement=`function optionalRequestId(input){ const raw=input?.requestId;if(raw===undefined||raw===null||raw==='')return null;return requireRequestId(input); }
function combineAbortSignals(...signals){
  const active=signals.filter(Boolean);
  if(!active.length)return undefined;
  if(active.length===1)return active[0];
  if(typeof AbortSignal.any==='function')return AbortSignal.any(active);
  const controller=new AbortController();
  const abort=()=>controller.abort();
  for(const signal of active){if(signal.aborted){controller.abort();break;}signal.addEventListener('abort',abort,{once:true});}
  return controller.signal;
}
async function executeWebMCPOperation(tool,execute,input,options={}){
  const requestId=optionalRequestId(input);
  if(requestId&&activeWebMCPOperations.has(requestId))throw new Error('REQUEST_ID_IN_USE');
  const controller=requestId?new AbortController():null;
  const signal=combineAbortSignals(options?.signal,controller?.signal);
  if(requestId)activeWebMCPOperations.set(requestId,{requestId,tool,startedAt:new Date().toISOString(),controller});
  throwIfAborted(signal);
  const abortPromise=signal?new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(abortError()),{once:true})):null;
  try{
    const task=Promise.resolve().then(()=>execute(input,{signal}));
    return await (abortPromise?Promise.race([task,abortPromise]):task);
  }finally{
    if(requestId)activeWebMCPOperations.delete(requestId);
  }
}
`;
if(!s.includes(old))throw new Error('executeWebMCPOperation block not found exactly');
s=s.replace(old,replacement);
const descriptions=new Map([
['Execute the locked deterministic failure oracle against the inspected canonical revision. requestId is caller-owned and can be cancelled independently.','Execute the locked deterministic failure oracle against the inspected canonical revision. Native WebMCP options.signal cancellation is supported; requestId is an optional compatibility handle for faultline_cancel_active.'],
['Test removing one semantic unit from the inspected canonical revision without mutating canonical state; the probe evidence trail is persisted. requestId is caller-owned and independently cancellable.','Test removing one semantic unit from the inspected canonical revision without mutating canonical state; the probe evidence trail is persisted. Native WebMCP options.signal cancellation is supported; requestId is optional.'],
['Delta-debug one source axis while preserving the failing oracle and rejecting stale revisions. requestId is caller-owned and independently cancellable.','Delta-debug one source axis while preserving the failing oracle and rejecting stale revisions. Native WebMCP options.signal cancellation is supported; requestId is optional.'],
['Run baseline verification and reduce HTML, CSS and JS sequentially from one inspected revision. requestId is caller-owned and independently cancellable.','Run baseline verification and reduce HTML, CSS and JS sequentially from one inspected revision. Native WebMCP options.signal cancellation is supported; requestId is optional.']
]);
for(const [a,b] of descriptions){if(!s.includes(a))throw new Error('description anchor missing');s=s.replace(a,b);}
const requiredReplacements=[
["['expectedRevision','requestId']],\n ['faultline_cancel_active'","['expectedRevision']],\n ['faultline_cancel_active'"],
["['expectedRevision','requestId','targetAxis','unitId']]","['expectedRevision','targetAxis','unitId']]"],
["['expectedRevision','requestId','targetAxis']]","['expectedRevision','targetAxis']]"],
["['expectedRevision','requestId']]\n];","['expectedRevision']]\n];"]
];
for(const [a,b] of requiredReplacements){if(!s.includes(a))throw new Error('required anchor missing: '+a);s=s.replace(a,b);}
const oldReg="execute:async input=>JSON.stringify(await (CANCELLABLE_WEBMCP_TOOLS.has(name)?executeWebMCPOperation(name,execute,input||{}):execute(input||{})))";
const newReg="execute:async(input,options)=>JSON.stringify(await (CANCELLABLE_WEBMCP_TOOLS.has(name)?executeWebMCPOperation(name,execute,input||{},options||{}):execute(input||{},options||{})))";
if(!s.includes(oldReg))throw new Error('registration callback anchor missing');
s=s.replace(oldReg,newReg);
fs.writeFileSync(runtimePath,s);

const browserPath='tests/browser-e2e.mjs';
let browser=fs.readFileSync(browserPath,'utf8');
const oldBrowser=`  for(const name of ['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot']){\n    assert.ok(guardedContracts[name].properties.includes('requestId'),\`${'${name}'} must expose requestId for targeted cancellation\`);\n    assert.ok(guardedContracts[name].required.includes('requestId'),\`${'${name}'} must require requestId for targeted cancellation\`);\n  }`;
const newBrowser=`  for(const name of ['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot']){\n    assert.ok(guardedContracts[name].properties.includes('requestId'),\`${'${name}'} must retain optional requestId for compatibility cancellation\`);\n    assert.ok(!guardedContracts[name].required.includes('requestId'),\`${'${name}'} must allow native options.signal cancellation without proprietary requestId\`);\n  }`;
if(!browser.includes(oldBrowser))throw new Error('browser contract anchor missing');
browser=browser.replace(oldBrowser,newBrowser);
fs.writeFileSync(browserPath,browser);

const axisPath='tests/webmcp-explicit-axis-contract.mjs';
let axis=fs.readFileSync(axisPath,'utf8');
const oldExpected=`  const expected={\n    faultline_probe:['expectedRevision','requestId','targetAxis','unitId'],\n    faultline_pin:['expectedRevision','targetAxis','unitId'],\n    faultline_reduce:['expectedRevision','requestId','targetAxis']\n  };`;
const newExpected=`  const expected={\n    faultline_probe:['expectedRevision','targetAxis','unitId'],\n    faultline_pin:['expectedRevision','targetAxis','unitId'],\n    faultline_reduce:['expectedRevision','targetAxis']\n  };`;
if(!axis.includes(oldExpected))throw new Error('explicit-axis expected anchor missing');
axis=axis.replace(oldExpected,newExpected);
axis=axis.replace('registered WebMCP schemas must require every input needed to choose a deterministic semantic axis/unit and cancellation owner','registered WebMCP schemas must require every input needed to choose a deterministic semantic axis/unit while native cancellation remains transport-owned');
axis=axis.replace('WebMCP explicit-axis contract PASS: probe, pin, and reduce cannot inherit hidden human tab state, while cancellable operations require caller-owned request IDs.','WebMCP explicit-axis contract PASS: probe, pin, and reduce cannot inherit hidden human tab state, while cancellation uses the native WebMCP execution signal.');
fs.writeFileSync(axisPath,axis);

const pkgPath='package.json';
let pkg=fs.readFileSync(pkgPath,'utf8');
const checkAnchor='node --check tests/runtime-recovery-case-validation.mjs';
if(!pkg.includes(checkAnchor))throw new Error('check package anchor missing');
pkg=pkg.replace(checkAnchor,checkAnchor+' && node --check tests/webmcp-native-execution-signal.mjs');
const browserAnchor='node tests/runtime-recovery-case-validation.mjs';
if(!pkg.includes(browserAnchor))throw new Error('browser package anchor missing');
pkg=pkg.replace(browserAnchor,browserAnchor+' && node tests/webmcp-native-execution-signal.mjs');
fs.writeFileSync(pkgPath,pkg);

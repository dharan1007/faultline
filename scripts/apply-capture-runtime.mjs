import { readFileSync, writeFileSync } from 'node:fs';

const browserPath='tests/browser-e2e.mjs';
let browser=readFileSync(browserPath,'utf8');
const replace=(from,to,label,{all=false}={})=>{
  if(!browser.includes(from))throw new Error(`PATCH_PRECONDITION_FAILED:${label}`);
  browser=all?browser.split(from).join(to):browser.replace(from,to);
};

replace('window.__webmcpTools?.length===16','window.__webmcpTools?.length===17','tool-count-wait',{all:true});
replace(
"['applySource','autopilot','defineOracle','exportCase','history','inspect','loadCase','manifest','pin','probe','reduce','resetCase','restore','revisions','run','units'].sort()",
"['applySource','autopilot','defineOracle','exportBundle','exportCase','history','importCapture','inspect','loadCase','manifest','pin','probe','reduce','resetCase','restore','revisions','run','units'].sort()",
'public-api-contract');
replace("'WebMCP ready · 16 tools'","'WebMCP ready · 17 tools'",'webmcp-ready-copy');
replace('/16 WebMCP tools/i','/17 WebMCP tools/i','connection-copy');
replace('assert.equal(toolContract.length,16)','assert.equal(toolContract.length,17)','tool-contract-count');
replace(
"['faultline_load_case','faultline_reset_case','faultline_run','faultline_define_oracle','faultline_apply_source','faultline_probe','faultline_reduce','faultline_pin','faultline_restore','faultline_autopilot']",
"['faultline_load_case','faultline_import_capture','faultline_reset_case','faultline_run','faultline_define_oracle','faultline_apply_source','faultline_probe','faultline_reduce','faultline_pin','faultline_restore','faultline_autopilot']",
'guarded-capture-import');
replace(
"['faultline_run','faultline_probe','faultline_reduce','faultline_autopilot']",
"['faultline_run','faultline_import_capture','faultline_probe','faultline_reduce','faultline_autopilot']",
'cancellable-capture-import');
replace('registered 16 spec-valid WebMCP tools','registered 17 spec-valid WebMCP tools','final-gate-copy');
writeFileSync(browserPath,browser);

const packagePath='package.json';
const pkg=JSON.parse(readFileSync(packagePath,'utf8'));
pkg.scripts.test='node --test tests/reducer-engine.test.js tests/deployment-tree-parity.test.js tests/capture-contract.test.js';
for(const file of [
  'src/capture-contract.js',
  'integrations/playwright-capture/index.js',
  'tests/capture-contract.test.js',
  'tests/playwright-capture-adapter.mjs',
  'tests/capture-runtime-import.mjs',
  'tests/human-capture-import.mjs',
  'tests/playwright-capture-ingestion.mjs'
]){
  const command=`node --check ${file}`;
  if(!pkg.scripts.check.includes(command))pkg.scripts.check+=` && ${command}`;
}
for(const file of [
  'tests/playwright-capture-adapter.mjs',
  'tests/capture-runtime-import.mjs',
  'tests/human-capture-import.mjs',
  'tests/playwright-capture-ingestion.mjs'
]){
  const command=`node ${file}`;
  if(!pkg.scripts['test:browser'].includes(command))pkg.scripts['test:browser']+=` && ${command}`;
}
writeFileSync(packagePath,`${JSON.stringify(pkg,null,2)}\n`);

const ciPath='.github/workflows/ci.yml';
let ci=readFileSync(ciPath,'utf8');
for(const line of [
  '      - run: node tests/playwright-capture-adapter.mjs\n',
  '      - run: node tests/capture-runtime-import.mjs\n',
  '      - run: node tests/human-capture-import.mjs\n',
  '      - run: node tests/playwright-capture-ingestion.mjs\n'
]) ci=ci.replace(line,'');
writeFileSync(ciPath,ci);

console.log('capture integration contracts and standard verification gates aligned');

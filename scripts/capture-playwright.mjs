import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCaptureV1 } from '../src/capture-format.js';

const fail=message=>{throw new Error(message)};
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--config')fail('USAGE: node scripts/capture-playwright.mjs --config <path>');

const configPath=resolve(args[1]);
let config;
try{config=JSON.parse(readFileSync(configPath,'utf8'));}catch{fail('INVALID_CAPTURE_CONFIG')}
if(!config||typeof config!=='object'||Array.isArray(config))fail('INVALID_CAPTURE_CONFIG');
const allowedConfigKeys=['url','output','oracle','actions','viewport'];
if(Object.keys(config).some(key=>!allowedConfigKeys.includes(key)))fail('INVALID_CAPTURE_CONFIG');
if(typeof config.url!=='string'||!/^https?:\/\//i.test(config.url)||typeof config.output!=='string'||!config.output.trim())fail('INVALID_CAPTURE_CONFIG');
if(!config.oracle||typeof config.oracle!=='object'||Array.isArray(config.oracle))fail('INVALID_CAPTURE_CONFIG');
if(config.oracle.kind==='runtime_error')fail('CAPTURE_ORACLE_UNSUPPORTED');
if(!['dom_property','dom_attribute','computed_style','dom_exists'].includes(config.oracle.kind))fail('CAPTURE_ORACLE_UNSUPPORTED');
const actions=config.actions??[];
if(!Array.isArray(actions)||actions.length>8)fail('INVALID_CAPTURE_CONFIG');
let totalWait=0;
for(const action of actions){
  if(!action||typeof action!=='object'||Array.isArray(action)||!['click','set_value','set_checked','wait'].includes(action.kind))fail('INVALID_CAPTURE_CONFIG');
  if(action.kind==='wait'){
    if(Object.keys(action).some(key=>!['kind','durationMs'].includes(key))||!Number.isFinite(action.durationMs)||action.durationMs<0||action.durationMs>2000)fail('INVALID_CAPTURE_CONFIG');
    totalWait+=action.durationMs;
  }else{
    if(typeof action.selector!=='string'||!action.selector.trim())fail('INVALID_CAPTURE_CONFIG');
    if(action.kind==='click'&&Object.keys(action).some(key=>!['kind','selector'].includes(key)))fail('INVALID_CAPTURE_CONFIG');
    if(action.kind==='set_value'&&(typeof action.value!=='string'||Object.keys(action).some(key=>!['kind','selector','value'].includes(key))))fail('INVALID_CAPTURE_CONFIG');
    if(action.kind==='set_checked'&&(typeof action.checked!=='boolean'||Object.keys(action).some(key=>!['kind','selector','checked'].includes(key))))fail('INVALID_CAPTURE_CONFIG');
  }
}
if(totalWait>2000)fail('INVALID_CAPTURE_CONFIG');
const viewport=config.viewport??{width:1280,height:720};
if(!viewport||!Number.isInteger(viewport.width)||viewport.width<1||!Number.isInteger(viewport.height)||viewport.height<1)fail('INVALID_CAPTURE_CONFIG');

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport});
  await page.goto(config.url,{waitUntil:'networkidle'});
  for(const action of actions){
    if(action.kind==='click')await page.locator(action.selector).click();
    else if(action.kind==='set_value')await page.locator(action.selector).fill(action.value);
    else if(action.kind==='set_checked')action.checked?await page.locator(action.selector).check():await page.locator(action.selector).uncheck();
    else await page.waitForTimeout(action.durationMs);
  }

  const snapshot=await page.evaluate(()=>{
    const clone=document.body.cloneNode(true);
    clone.querySelectorAll('script').forEach(script=>script.remove());
    const css=[];
    const unresolvedResources=[];
    for(const sheet of document.styleSheets){
      try{
        css.push([...sheet.cssRules].map(rule=>rule.cssText).join('\n'));
      }catch{
        unresolvedResources.push(sheet.href||'stylesheet:unreadable');
      }
    }
    return {
      html:clone.innerHTML,
      css:css.filter(Boolean).join('\n'),
      url:location.href,
      title:document.title,
      unresolvedResources:[...new Set(unresolvedResources)]
    };
  });

  const oracle=JSON.parse(JSON.stringify(config.oracle));
  oracle.action={kind:'none'};
  oracle.delayMs=0;
  const artifact={
    format:'faultline.capture.v1',
    mode:'snapshot',
    capturedAt:new Date().toISOString(),
    provenance:{url:snapshot.url,title:snapshot.title,browser:'chromium',viewport,actions:JSON.parse(JSON.stringify(actions))},
    unresolvedResources:snapshot.unresolvedResources,
    case:{html:snapshot.html,css:snapshot.css,js:'',oracle}
  };
  validateCaptureV1(artifact);
  writeFileSync(resolve(config.output),`${JSON.stringify(artifact,null,2)}\n`,'utf8');
  process.stdout.write(`${resolve(config.output)}\n`);
} finally {
  await browser.close();
}

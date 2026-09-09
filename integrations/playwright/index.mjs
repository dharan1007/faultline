import { writeFile } from 'node:fs/promises';
import { CAPTURE_SCHEMA, MAX_CAPTURE_SOURCE_BYTES, normalizeCapture } from '../../src/capture-format.js';

const encoder=new TextEncoder();
const sourceBytes=value=>encoder.encode(value).byteLength;

function omitted(kind,url,reason){return {kind,url:url||null,reason};}
function captured(url,text){return {url:url||null,chars:text.length};}

function sameOrigin(url,origin){
  try{return new URL(url).origin===origin}catch{return false}
}

export async function captureFaultlineBaseline(page,{oracle,includeJavaScript=false,playwright={}}={}){
  if(!page||typeof page.evaluate!=='function')throw new Error('INVALID_PLAYWRIGHT_PAGE');
  if(!oracle||typeof oracle!=='object'||Array.isArray(oracle))throw new Error('INVALID_CAPTURE_ORACLE');

  const snapshot=await page.evaluate(()=>{
    const clone=document.body.cloneNode(true);
    clone.querySelectorAll('script,link[rel~="stylesheet"],base,meta[http-equiv="refresh" i]').forEach(node=>node.remove());

    const styles=[];
    const capturedStylesheets=[];
    const omittedResources=[];
    for(const sheet of Array.from(document.styleSheets)){
      const url=sheet.href||null;
      try{
        const text=Array.from(sheet.cssRules).map(rule=>rule.cssText).join('\n');
        styles.push(text);
        capturedStylesheets.push({url,chars:text.length});
      }catch{
        omittedResources.push({kind:'stylesheet',url,reason:'UNREADABLE_CSSOM'});
      }
    }

    const scripts=Array.from(document.scripts).map(script=>({
      url:script.src||null,
      type:(script.type||'').trim().toLowerCase(),
      text:script.src?'':script.textContent||''
    }));

    return {
      html:clone.innerHTML,
      css:styles.filter(Boolean).join('\n'),
      scripts,
      origin:location.origin,
      url:location.href,
      title:document.title,
      viewport:{width:innerWidth,height:innerHeight},
      userAgent:navigator.userAgent,
      omittedResources,
      capturedStylesheets
    };
  });

  const diagnostics={
    omittedResources:[...snapshot.omittedResources],
    capturedScripts:[],
    capturedStylesheets:[...snapshot.capturedStylesheets]
  };
  const javascript=[];

  for(const script of snapshot.scripts){
    const isModule=script.type==='module';
    if(isModule){
      diagnostics.omittedResources.push(omitted('script',script.url,'UNSUPPORTED_MODULE_SCRIPT'));
      continue;
    }
    if(!script.url){
      if(script.text){
        javascript.push(script.text);
        diagnostics.capturedScripts.push(captured(null,script.text));
      }
      continue;
    }
    if(!includeJavaScript){
      diagnostics.omittedResources.push(omitted('script',script.url,'JAVASCRIPT_CAPTURE_DISABLED'));
      continue;
    }
    if(!sameOrigin(script.url,snapshot.origin)){
      diagnostics.omittedResources.push(omitted('script',script.url,'CROSS_ORIGIN_SCRIPT'));
      continue;
    }
    try{
      const result=await page.evaluate(async url=>{
        const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
        return {ok:response.ok,status:response.status,text:response.ok?await response.text():''};
      },script.url);
      if(!result.ok){
        diagnostics.omittedResources.push(omitted('script',script.url,`HTTP_${result.status}`));
        continue;
      }
      javascript.push(result.text);
      diagnostics.capturedScripts.push(captured(script.url,result.text));
    }catch{
      diagnostics.omittedResources.push(omitted('script',script.url,'SCRIPT_FETCH_FAILED'));
    }
  }

  const js=javascript.filter(Boolean).join('\n');
  const total=sourceBytes(snapshot.html)+sourceBytes(snapshot.css)+sourceBytes(js);
  if(total>MAX_CAPTURE_SOURCE_BYTES)throw new Error('CAPTURE_SOURCE_TOO_LARGE');

  return normalizeCapture({
    schema:CAPTURE_SCHEMA,
    case:{html:snapshot.html,css:snapshot.css,js,oracle},
    provenance:{
      url:snapshot.url,
      title:snapshot.title,
      capturedAt:new Date().toISOString(),
      viewport:snapshot.viewport,
      userAgent:snapshot.userAgent,
      playwright:{
        projectName:String(playwright?.projectName||''),
        testTitle:String(playwright?.testTitle||'')
      }
    },
    diagnostics
  });
}

export function createFaultlineTest(baseTest,defaults={}){
  if(!baseTest||typeof baseTest.extend!=='function')throw new Error('INVALID_PLAYWRIGHT_TEST');
  return baseTest.extend({
    faultline:async({page},use,testInfo)=>{
      let armedCapture=null;
      const faultline={
        arm:async(oracle,options={})=>{
          armedCapture=await captureFaultlineBaseline(page,{
            ...defaults,
            ...options,
            oracle,
            playwright:{
              projectName:testInfo.project?.name||'',
              testTitle:testInfo.title,
              ...(defaults.playwright||{}),
              ...(options.playwright||{})
            }
          });
          return armedCapture;
        },
        current:()=>armedCapture
      };

      await use(faultline);

      if(armedCapture&&testInfo.status!==testInfo.expectedStatus){
        const artifactPath=testInfo.outputPath('faultline.capture.json');
        await writeFile(artifactPath,`${JSON.stringify(armedCapture,null,2)}\n`,'utf8');
        await testInfo.attach('faultline.capture',{path:artifactPath,contentType:'application/json'});
      }
    }
  });
}
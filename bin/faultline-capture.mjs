#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureFaultlineCase } from '../playwright/faultline-capture.mjs';

function fail(code,detail=''){
  const suffix=detail?`:${String(detail)}`:'';
  throw new Error(`${code}${suffix}`);
}

function parseArgs(argv){
  const allowed=new Set(['--url','--case','--out','--browser']);
  const values={browser:'chromium'};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i];
    const value=argv[i+1];
    if(!allowed.has(key)||value===undefined||value.startsWith('--'))fail('FAULTLINE_CAPTURE_ARGS',key||'UNKNOWN');
    if(key==='--url')values.url=value;
    else if(key==='--case')values.casePath=value;
    else if(key==='--out')values.outPath=value;
    else if(key==='--browser')values.browser=value;
  }
  if(!values.url||!values.casePath||!values.outPath)fail('FAULTLINE_CAPTURE_ARGS','REQUIRED');
  if(values.browser!=='chromium')fail('FAULTLINE_CAPTURE_ARGS','UNSUPPORTED_BROWSER');
  try{new URL(values.url);}catch{fail('FAULTLINE_CAPTURE_ARGS','URL');}
  return values;
}

async function readCase(casePath){
  let raw;
  try{raw=await readFile(casePath,'utf8');}
  catch(error){fail('FAULTLINE_CAPTURE_CASE_READ',error?.message||error);}
  try{return JSON.parse(raw);}
  catch(error){fail('FAULTLINE_CAPTURE_INVALID','CASE_JSON');}
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  const caseValue=await readCase(args.casePath);
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    try{
      await page.goto(args.url,{waitUntil:'networkidle',timeout:15000});
    }catch(error){
      fail('FAULTLINE_CAPTURE_NAVIGATION',error?.message||error);
    }
    await captureFaultlineCase({page,caseValue,outputPath:args.outPath,browserName:args.browser});
    process.stdout.write(`FAULTLINE capture written: ${args.outPath}\n`);
  }finally{
    if(browser)await browser.close();
  }
}

main().catch(error=>{
  process.stderr.write(`${String(error?.message||error)}\n`);
  process.exitCode=1;
});

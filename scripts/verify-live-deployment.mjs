#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const fail=code=>{throw new Error(code)};
const [urlArg,shaArg]=process.argv.slice(2);
const baseRaw=urlArg||process.env.FAULTLINE_DEPLOYMENT_URL;
const expectedSha=String(shaArg||process.env.FAULTLINE_EXPECTED_SHA||'').trim().toLowerCase();
if(!/^[a-f0-9]{40}$/.test(expectedSha))fail('FAULTLINE_LIVE_EXPECTED_SHA_REQUIRED');
let base;try{const value=new URL(baseRaw);if(value.protocol!=='https:')fail('FAULTLINE_LIVE_HTTPS_REQUIRED');value.pathname=value.pathname.replace(/\/$/,'');value.search='';value.hash='';base=value.toString().replace(/\/$/,'')}catch(error){if(error?.message?.startsWith('FAULTLINE_'))throw error;fail('FAULTLINE_LIVE_URL_INVALID')}
async function bytes(path){const response=await fetch(`${base}${path}`,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});if(!response.ok)fail(`FAULTLINE_LIVE_HTTP_${response.status}:${path}`);return Buffer.from(await response.arrayBuffer())}
const release=JSON.parse((await bytes('/release.json')).toString('utf8'));
if(release?.source?.sha!==expectedSha)fail('FAULTLINE_LIVE_RELEASE_SHA_MISMATCH');
if(release?.source?.provenance!=='source-bound')fail('FAULTLINE_LIVE_PROVENANCE_NOT_BOUND');
if(release?.source?.authority!=='github-actions')fail('FAULTLINE_LIVE_PROVENANCE_AUTHORITY_INVALID');
if(release?.source?.repository!=='dharan1007/faultline')fail('FAULTLINE_LIVE_REPOSITORY_MISMATCH');
if(!String(release?.source?.ref??'').includes('main'))fail('FAULTLINE_LIVE_REF_MISMATCH');
const integrityBytes=await bytes('/integrity.json');const integritySha=createHash('sha256').update(integrityBytes).digest('hex');
if(release?.evidence?.integrity?.sha256!==integritySha||release?.evidence?.integrity?.bytes!==integrityBytes.length)fail('FAULTLINE_LIVE_INTEGRITY_BINDING_MISMATCH');
const integrity=JSON.parse(integrityBytes.toString('utf8'));const assets=Object.entries(integrity?.assets??{});if(!assets.length)fail('FAULTLINE_LIVE_INTEGRITY_EMPTY');
for(const [path,expected] of assets){const asset=await bytes(path);if(asset.length!==expected.bytes)fail(`FAULTLINE_LIVE_ASSET_BYTES_MISMATCH:${path}`);if(createHash('sha256').update(asset).digest('hex')!==expected.sha256)fail(`FAULTLINE_LIVE_ASSET_SHA_MISMATCH:${path}`)}
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const pageErrors=[],consoleErrors=[];page.on('pageerror',error=>pageErrors.push(String(error?.message??error).slice(0,500)));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text().slice(0,500))});try{const response=await page.goto(`${base}/`,{waitUntil:'networkidle',timeout:30000});if(!response?.ok())fail('FAULTLINE_LIVE_BROWSER_DOCUMENT_FAILED');const body=await page.locator('body').innerText({timeout:5000});if(typeof body!=='string'||body.trim().length<20)fail('FAULTLINE_LIVE_BROWSER_EMPTY_UI');if(pageErrors.length)fail(`FAULTLINE_LIVE_PAGE_ERRORS:${pageErrors.join('|')}`);if(consoleErrors.length)fail(`FAULTLINE_LIVE_CONSOLE_ERRORS:${consoleErrors.join('|')}`)}finally{await browser.close()}
console.log(JSON.stringify({ok:true,baseUrl:base,releaseSha:expectedSha,assetCount:assets.length,browser:'chromium',pageErrors:0,consoleErrors:0,integritySha256:integritySha}));

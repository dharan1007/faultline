import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await files(path));
    else if(/\.(?:mjs|js)$/.test(entry.name))out.push(path);
  }
  return out;
}

const replacements=[
  ['window.__webmcpTools?.length===16','window.__webmcpTools?.length===17'],
  ['window.__webmcpTools.length===16','window.__webmcpTools.length===17'],
  ["'WebMCP ready · 16 tools'","'WebMCP ready · 17 tools'"],
  ['registered 16 spec-valid WebMCP tools','registered 17 spec-valid WebMCP tools']
];
let changed=0;
for(const path of await files('tests')){
  let source=await readFile(path,'utf8'),next=source;
  for(const [from,to] of replacements)next=next.split(from).join(to);
  if(next!==source){await writeFile(path,next,'utf8');changed++;console.log(path);}
}
if(!changed)throw new Error('NO_STALE_WEBMCP_COUNTS_FOUND');
console.log(`updated ${changed} test files`);

import {readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const RELEASE_MANIFEST='faultline-release-files.txt';

function listFiles(root,current=''){
  const directory=path.join(root,current);
  const files=[];
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const relative=current?`${current}/${entry.name}`:entry.name;
    if(relative===RELEASE_MANIFEST)continue;
    if(entry.isDirectory())files.push(...listFiles(root,relative));
    else if(entry.isFile())files.push(relative.replaceAll(path.sep,'/'));
  }
  return files;
}

export function buildReleaseManifest(root='public'){
  const files=listFiles(root).sort((a,b)=>a.localeCompare(b));
  const manifestFiles=[RELEASE_MANIFEST,...files];
  writeFileSync(path.join(root,RELEASE_MANIFEST),`${manifestFiles.join('\n')}\n`,'utf8');
  return Object.freeze(manifestFiles);
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const files=buildReleaseManifest(process.argv[2]||'public');
  console.log(`release manifest generated with ${files.length} shipped files`);
}

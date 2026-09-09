import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const packagePath='node_modules/acorn/package.json';
const sourcePath='node_modules/acorn/dist/acorn.mjs';
const targetPath='vendor/acorn.js';

if(!existsSync(packagePath)||!existsSync(sourcePath)){
  console.error('Pinned Acorn dependency is missing. Run npm install before verification.');
  process.exit(1);
}

const packageJson=JSON.parse(readFileSync(packagePath,'utf8'));
if(packageJson.version!=='8.18.0'){
  console.error(`Unexpected Acorn version ${packageJson.version}; expected 8.18.0.`);
  process.exit(1);
}

mkdirSync(dirname(targetPath),{recursive:true});
copyFileSync(sourcePath,targetPath);
console.log(`browser parser vendor ready: acorn ${packageJson.version}`);

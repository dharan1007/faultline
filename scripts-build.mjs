import { rmSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const modules = ['core.js','reducers.js','sandbox.js','domain.js','webmcp.js','app.js'];

function toInlineModule(source) {
  return source
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
}

rmSync('dist',{recursive:true,force:true});
mkdirSync('dist/src',{recursive:true});
copyFileSync('index.html','dist/index.html');
copyFileSync('styles.css','dist/styles.css');
for(const f of modules) copyFileSync(`src/${f}`,`dist/src/${f}`);

const css = readFileSync('styles.css','utf8');
const js = modules.map((f)=>toInlineModule(readFileSync(`src/${f}`,'utf8'))).join('\n');
const shell = readFileSync('index.html','utf8')
  .replace('<link rel="stylesheet" href="./styles.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="./src/app.js"></script>', `<script type="module">${js}</script>`);
writeFileSync('dist/faultline.html', shell);
console.log('Built dist/ including self-contained faultline.html');

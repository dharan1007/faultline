import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

let source=readFileSync('scripts/implement-capture-pipeline.mjs','utf8');
source=source.replace(/\nedit\('\.github\/workflows\/deploy-production\.yml',[\s\S]*?\n\}\);\n\nedit\('tests\/deployment-tree-parity\.test\.js'/,"\nedit('tests/deployment-tree-parity.test.js'");
source=source.replace(/\nunlinkSync\('scripts\/implement-capture-pipeline\.mjs'\);\nunlinkSync\('\.github\/workflows\/capture-implementation\.yml'\);\n?$/,'\n');
const output='/tmp/faultline-capture-transform.mjs';
writeFileSync(output,source,'utf8');
await import(`${pathToFileURL(output).href}?v=${Date.now()}`);

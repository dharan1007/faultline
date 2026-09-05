const fs=require('fs');
const path='src/runtime.js';
let source=fs.readFileSync(path,'utf8');
const before="    experiment.setAttribute('sandbox','allow-scripts');\n    const bootstrapId=";
const after="    experiment.setAttribute('sandbox','allow-scripts');\n    const previewPolicy=$('preview')?.getAttribute('csp');\n    if(previewPolicy)experiment.setAttribute('csp',previewPolicy);\n    const bootstrapId=";
const matches=source.split(before).length-1;
if(matches!==1)throw new Error(`experiment CSP inheritance: expected exactly one match, got ${matches}`);
source=source.replace(before,after);
fs.writeFileSync(path,source);

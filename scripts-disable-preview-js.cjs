const fs=require('fs');
const path='src/runtime.js';
let source=fs.readFileSync(path,'utf8');
const before=" const start=()=>{executeCandidate();if(send)measure(send)};";
const after=" const start=()=>{${previewOnly?'':'executeCandidate();'}if(send)measure(send)};";
const matches=source.split(before).length-1;
if(matches!==1)throw new Error(`canonical preview JS isolation: expected exactly one match, got ${matches}`);
source=source.replace(before,after);
fs.writeFileSync(path,source);

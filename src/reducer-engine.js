import { parse as parseJavaScript } from '../vendor/acorn.js';

const clone = value => JSON.parse(JSON.stringify(value));
const MAX_REVISION_SNAPSHOTS = 32;
const MAX_REVISION_LEDGER = 64;
const VOID_HTML_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const RAW_HTML_TAGS = new Set(['script','style']);

function unitId(axis,start,end){ return `${axis}:${start}:${end}`; }
function finishUnits(axis,source,records){
  const complete=records.filter(record=>Number.isInteger(record.end)&&record.end>record.start);
  const ids=new Map(complete.map(record=>[record,unitId(axis,record.start,record.end)]));
  const nearestCompleteParent=record=>{
    let parent=record.parent;
    while(parent&&!ids.has(parent))parent=parent.parent;
    return parent||null;
  };
  return complete.map(record=>{
    const parent=nearestCompleteParent(record);
    let depth=0,cursor=parent;
    while(cursor){depth++;cursor=nearestCompleteParent(cursor);}
    return {id:ids.get(record),axis,start:record.start,end:record.end,kind:record.kind,text:source.slice(record.start,record.end),parentId:parent?ids.get(parent):null,depth};
  }).sort((a,b)=>a.start-b.start||b.end-a.end||a.depth-b.depth||a.kind.localeCompare(b.kind));
}
function htmlTagEnd(source,start){
  let quote=null;
  for(let i=start+1;i<source.length;i++){
    const ch=source[i];
    if(quote){if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='>')return i+1;
  }
  return -1;
}
function parseHtmlTag(source,start){
  const end=htmlTagEnd(source,start);
  if(end<0)return null;
  const raw=source.slice(start,end);
  if(/^<\s*![^-]|^<\s*\?/.test(raw))return {special:true,end};
  const closing=/^<\s*\/\s*([A-Za-z][\w:-]*)/.exec(raw);
  if(closing)return {closing:true,tag:closing[1].toLowerCase(),end};
  const opening=/^<\s*([A-Za-z][\w:-]*)/.exec(raw);
  if(!opening)return {special:true,end};
  const tag=opening[1].toLowerCase();
  return {closing:false,tag,end,selfClosing:/\/\s*>$/.test(raw)||VOID_HTML_TAGS.has(tag)};
}
function htmlUnits(source){
  const records=[];
  const stack=[];
  const lower=source.toLowerCase();
  for(let i=0;i<source.length;){
    if(source[i]!=='<'){i++;continue;}
    if(source.startsWith('<!--',i)){
      const close=source.indexOf('-->',i+4);
      i=close<0?source.length:close+3;
      continue;
    }
    const tag=parseHtmlTag(source,i);
    if(!tag)break;
    if(tag.special){i=tag.end;continue;}
    if(tag.closing){
      const top=stack.at(-1);
      if(top?.tag===tag.tag){top.end=tag.end;records.push(top);stack.pop();}
      i=tag.end;
      continue;
    }
    const parent=stack.at(-1)||null;
    if(tag.selfClosing){records.push({tag:tag.tag,start:i,end:tag.end,kind:'element',parent});i=tag.end;continue;}
    if(RAW_HTML_TAGS.has(tag.tag)){
      const closeStart=lower.indexOf(`</${tag.tag}`,tag.end);
      if(closeStart>=0){
        const closeTag=parseHtmlTag(source,closeStart);
        if(closeTag?.closing&&closeTag.tag===tag.tag){records.push({tag:tag.tag,start:i,end:closeTag.end,kind:'element',parent});i=closeTag.end;continue;}
      }
      i=tag.end;
      continue;
    }
    stack.push({tag:tag.tag,start:i,end:null,kind:'element',parent});
    i=tag.end;
  }
  return finishUnits('html',source,records);
}
function skipCssComment(source,i,end){
  const close=source.indexOf('*/',i+2);
  return close<0?end:Math.min(end,close+2);
}
function skipCssString(source,i,end){
  const quote=source[i];
  for(let cursor=i+1;cursor<end;cursor++){
    if(source[cursor]==='\\'){cursor++;continue;}
    if(source[cursor]===quote)return cursor+1;
  }
  return end;
}
function findCssClose(source,open,end){
  let depth=1;
  for(let i=open+1;i<end;i++){
    if(source.startsWith('/*',i)){i=skipCssComment(source,i,end)-1;continue;}
    if(source[i]==='"'||source[i]==="'"){i=skipCssString(source,i,end)-1;continue;}
    if(source[i]==='{')depth++;
    else if(source[i]==='}'&&--depth===0)return i;
  }
  return -1;
}
function trimmedStart(source,start,end){while(start<end&&/\s/.test(source[start]))start++;return start;}
function trimmedEnd(source,start,end){while(end>start&&/\s/.test(source[end-1]))end--;return end;}
function declarationRecord(source,start,end,parent){
  const s=trimmedStart(source,start,end),e=trimmedEnd(source,s,end);
  if(e<=s)return null;
  const text=source.slice(s,e);
  const colon=text.indexOf(':');
  if(colon<=0)return null;
  const name=text.slice(0,colon).trim();
  if(!name||name.startsWith('@'))return null;
  return {start:s,end:e,kind:'declaration',parent};
}
function scanCssBody(source,start,end,parent,records){
  let segmentStart=start;
  for(let i=start;i<end;){
    if(source.startsWith('/*',i)){i=skipCssComment(source,i,end);continue;}
    const ch=source[i];
    if(ch==='"'||ch==="'"){i=skipCssString(source,i,end);continue;}
    if(ch===';'){
      const declaration=declarationRecord(source,segmentStart,i+1,parent);
      if(declaration)records.push(declaration);
      segmentStart=i+1;i++;continue;
    }
    if(ch==='{'){
      const close=findCssClose(source,i,end);
      if(close<0)return;
      const ruleStart=trimmedStart(source,segmentStart,i);
      if(ruleStart<i){
        const nested={start:ruleStart,end:close+1,kind:'rule',parent};
        records.push(nested);
        scanCssBody(source,i+1,close,nested,records);
      }
      segmentStart=close+1;i=close+1;continue;
    }
    i++;
  }
  const declaration=declarationRecord(source,segmentStart,end,parent);
  if(declaration)records.push(declaration);
}
function cssUnits(source){
  const records=[];
  let segmentStart=0;
  for(let i=0;i<source.length;){
    if(source.startsWith('/*',i)){i=skipCssComment(source,i,source.length);continue;}
    const ch=source[i];
    if(ch==='"'||ch==="'"){i=skipCssString(source,i,source.length);continue;}
    if(ch===';'){segmentStart=i+1;i++;continue;}
    if(ch==='{'){
      const close=findCssClose(source,i,source.length);
      if(close<0)break;
      const ruleStart=trimmedStart(source,segmentStart,i);
      if(ruleStart<i){
        const rule={start:ruleStart,end:close+1,kind:'rule',parent:null};
        records.push(rule);
        scanCssBody(source,i+1,close,rule,records);
      }
      segmentStart=close+1;i=close+1;continue;
    }
    i++;
  }
  return finishUnits('css',source,records);
}

const JAVASCRIPT_UNIT_CONTAINERS=new Set(['Program','BlockStatement','StaticBlock','ClassBody']);
function parseJavaScriptProgram(source){
  const common={ecmaVersion:'latest',allowHashBang:true,allowAwaitOutsideFunction:true};
  try{return parseJavaScript(source,{...common,sourceType:'script',allowReturnOutsideFunction:true});}
  catch(scriptError){
    try{return parseJavaScript(source,{...common,sourceType:'module'});}
    catch{throw scriptError;}
  }
}
function isAstNode(value){return Boolean(value&&typeof value==='object'&&typeof value.type==='string'&&Number.isInteger(value.start)&&Number.isInteger(value.end));}
function jsUnitKind(node){return ['MethodDefinition','PropertyDefinition','StaticBlock'].includes(node.type)?'class_member':'statement';}
function parserBackedJsUnits(source){
  const ast=parseJavaScriptProgram(source);
  const records=[];
  const visit=(node,parentRecord=null,forceUnit=false)=>{
    if(!isAstNode(node))return;
    let currentParent=parentRecord;
    if(forceUnit&&node.type!=='EmptyStatement'){
      const record={start:node.start,end:node.end,kind:jsUnitKind(node),parent:parentRecord};
      records.push(record);
      currentParent=record;
    }
    for(const [key,value] of Object.entries(node)){
      if(['start','end','loc','range'].includes(key))continue;
      if(Array.isArray(value)){
        const forceChildren=(JAVASCRIPT_UNIT_CONTAINERS.has(node.type)&&key==='body')||(node.type==='SwitchCase'&&key==='consequent');
        for(const child of value)if(isAstNode(child))visit(child,currentParent,forceChildren);
      }else if(isAstNode(value))visit(value,currentParent,false);
    }
  };
  visit(ast,null,false);
  return finishUnits('js',source,records);
}
function legacyJsUnits(source){
  const units=[];
  const line=/[^\n;{}]+(?:\([^\n{}]*\)\s*=>\s*\{[^{}]*\}|\{[^{}]*\})?\s*;?/g;
  let match;
  while((match=line.exec(source)))if(match[0].trim())units.push({id:unitId('js',match.index,match.index+match[0].length),axis:'js',start:match.index,end:match.index+match[0].length,kind:'statement',text:match[0],parentId:null,depth:0});
  return units.sort((a,b)=>a.start-b.start||a.end-b.end);
}
function jsUnits(source){
  try{return parserBackedJsUnits(source);}
  catch{return legacyJsUnits(source);}
}

function trimSnapshots(snapshots,currentRevision) {
  while (snapshots.size > MAX_REVISION_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value;
    if (oldest === currentRevision) break;
    snapshots.delete(oldest);
  }
}

export function semanticUnits(axis,source) {
  source=String(source??'');
  if(axis==='html')return htmlUnits(source);
  if(axis==='css')return cssUnits(source);
  if(axis==='js')return jsUnits(source);
  throw new Error('INVALID_AXIS');
}

export function removeUnits(source,units) {
  source=String(source??'');
  const ordered=[...units].map(unit=>{
    const start=Number(unit?.start),end=Number(unit?.end);
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>source.length)throw new Error('INVALID_UNIT_RANGE');
    return {start,end};
  }).sort((a,b)=>a.start-b.start||b.end-a.end);
  const collapsed=[];
  for(const range of ordered){
    const previous=collapsed.at(-1);
    if(!previous){collapsed.push(range);continue;}
    if(range.start>=previous.start&&range.end<=previous.end)continue;
    if(range.start<previous.end)throw new Error('OVERLAPPING_UNIT_RANGES');
    collapsed.push(range);
  }
  let out=source;
  for(const range of collapsed.reverse())out=out.slice(0,range.start)+out.slice(range.end);
  return out;
}

export async function ddminReduce(items, evaluate, { protectedItems=[], maxTrials=100 }={}) {
  const protectedSet = new Set(protectedItems);
  const protectedOrdered = items.filter(x=>protectedSet.has(x));
  let removable = items.filter(x=>!protectedSet.has(x));
  let trials = [];
  let count = 0;
  const run = async candidateRemovable => {
    if (count >= maxTrials) throw new Error('TRIAL_BUDGET_EXHAUSTED');
    count++;
    const kept = items.filter(x=>protectedSet.has(x) || candidateRemovable.includes(x));
    const status = await evaluate(kept);
    trials.push({ keptCount:kept.length, status });
    return status;
  };
  if ((await run(removable)) !== 'FAIL') throw new Error('BASELINE_NOT_FAILING');
  let n = 2;
  while (removable.length >= 1) {
    if (!removable.length) break;
    const size = Math.ceil(removable.length/n);
    let changed = false;
    for (let i=0;i<removable.length;i+=size) {
      const chunk = removable.slice(i,i+size);
      const candidate = removable.filter(x=>!chunk.includes(x));
      if ((await run(candidate)) === 'FAIL') { removable=candidate; n=Math.max(2,n-1); changed=true; break; }
    }
    if (changed) continue;
    if (n >= removable.length) break;
    n = Math.min(removable.length,n*2);
  }
  const keptSet = new Set([...protectedOrdered,...removable]);
  return { items:items.filter(x=>keptSet.has(x)), trials, trialCount:count };
}

function normalizePersistedState(persistedState) {
  if (!persistedState || typeof persistedState !== 'object') return null;
  const revision = Number(persistedState.revision);
  if (!Number.isInteger(revision) || revision < 1 || persistedState.value === undefined) throw new Error('INVALID_PERSISTED_STATE');
  if (!Array.isArray(persistedState.snapshots) || !Array.isArray(persistedState.ledger)) throw new Error('INVALID_PERSISTED_STATE');
  const currentRevision = `r${revision}`;
  const snapshots = new Map();
  for (const entry of persistedState.snapshots) {
    if (!Array.isArray(entry) || entry.length !== 2 || !/^r[1-9]\d*$/.test(String(entry[0]))) throw new Error('INVALID_PERSISTED_STATE');
    const snapshotRevision = Number(String(entry[0]).slice(1));
    if (snapshotRevision > revision) throw new Error('INVALID_PERSISTED_STATE');
    snapshots.set(String(entry[0]), clone(entry[1]));
  }
  if (!snapshots.has(currentRevision)) snapshots.set(currentRevision, clone(persistedState.value));
  trimSnapshots(snapshots,currentRevision);
  return { revision, value:clone(persistedState.value), snapshots, ledger:clone(persistedState.ledger.slice(-MAX_REVISION_LEDGER)) };
}

export function createRevisionStore(initialValue, persistedState=null) {
  const hydrated = normalizePersistedState(persistedState);
  let revision = hydrated?.revision ?? 1;
  let value = hydrated?.value ?? clone(initialValue);
  const snapshots = hydrated?.snapshots ?? new Map([['r1', clone(value)]]);
  const ledger = hydrated?.ledger ?? [];
  const current = () => `r${revision}`;
  const assertRevision = expected => { if (expected !== current()) throw new Error(`STALE_REVISION expected=${expected} current=${current()}`); };
  const inspect = () => ({ revision:current(), value:clone(value), history:clone(ledger) });
  const commit = (nextValue,event={},expectedRevision=current()) => {
    assertRevision(expectedRevision);
    value=clone(nextValue);
    revision++;
    snapshots.set(current(),clone(value));
    trimSnapshots(snapshots,current());
    ledger.push({...event,revision:current(),at:new Date().toISOString()});
    if (ledger.length > MAX_REVISION_LEDGER) ledger.splice(0,ledger.length-MAX_REVISION_LEDGER);
    return inspect();
  };
  const restore = (targetRevision,expectedRevision=current()) => { assertRevision(expectedRevision); if(!snapshots.has(targetRevision)) throw new Error('REVISION_NOT_FOUND'); return commit(snapshots.get(targetRevision),{kind:'restore',from:targetRevision},expectedRevision); };
  const dump = () => ({ version:1, revision, value:clone(value), snapshots:[...snapshots.entries()].map(([rev,snapshot])=>[rev,clone(snapshot)]), ledger:clone(ledger) });
  return { inspect, commit, restore, assertRevision, snapshot:rev=>snapshots.has(rev)?clone(snapshots.get(rev)):undefined, dump };
}

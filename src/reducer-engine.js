const clone = value => JSON.parse(JSON.stringify(value));
const MAX_REVISION_SNAPSHOTS = 32;
const MAX_REVISION_LEDGER = 64;
const HTML_VOID_ELEMENTS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const HTML_RAW_TEXT_ELEMENTS = new Set(['script','style']);

function trimSnapshots(snapshots,currentRevision) {
  while (snapshots.size > MAX_REVISION_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value;
    if (oldest === currentRevision) break;
    snapshots.delete(oldest);
  }
}

function unitId(axis,start,end) { return `${axis}:${start}:${end}`; }
function isHtmlNameStart(char) { return /[A-Za-z]/.test(char||''); }
function isHtmlNameChar(char) { return /[\w:-]/.test(char||''); }

function readHtmlTag(source,start) {
  if (source[start] !== '<') return null;
  if (source.startsWith('<!--',start)) {
    const close=source.indexOf('-->',start+4);
    return {special:true,end:close===-1?source.length:close+3};
  }
  if (source.startsWith('<![CDATA[',start)) {
    const close=source.indexOf(']]>',start+9);
    return {special:true,end:close===-1?source.length:close+3};
  }
  if (source[start+1]==='!' || source[start+1]==='?') {
    let quote=null;
    for(let i=start+2;i<source.length;i++){
      const ch=source[i];
      if(quote){ if(ch===quote)quote=null; continue; }
      if(ch==='"'||ch==="'"){quote=ch;continue;}
      if(ch==='>')return {special:true,end:i+1};
    }
    return {special:true,end:source.length};
  }
  let i=start+1;
  let closing=false;
  if(source[i]==='/'){closing=true;i++;}
  while(/\s/.test(source[i]||''))i++;
  if(!isHtmlNameStart(source[i]))return null;
  const nameStart=i;
  i++;
  while(isHtmlNameChar(source[i]))i++;
  const name=source.slice(nameStart,i).toLowerCase();
  let quote=null;
  for(;i<source.length;i++){
    const ch=source[i];
    if(quote){ if(ch===quote)quote=null; continue; }
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='>'){
      let p=i-1;
      while(p>start&&/\s/.test(source[p]))p--;
      return {special:false,closing,name,selfClosing:!closing&&source[p]==='/',end:i+1};
    }
  }
  return null;
}

function finalizeHierarchicalUnits(axis,source,nodes) {
  const eligible=new Set(nodes.filter(node=>node.closed));
  const hasClosedAncestors=node=>{
    let parent=node.parent;
    while(parent){ if(!eligible.has(parent))return false; parent=parent.parent; }
    return true;
  };
  const kept=nodes.filter(node=>node.closed&&hasClosedAncestors(node));
  const idByNode=new Map(kept.map(node=>[node,unitId(axis,node.start,node.end)]));
  return kept.map(node=>({
    id:idByNode.get(node),axis,start:node.start,end:node.end,kind:node.kind,
    text:source.slice(node.start,node.end),depth:node.depth,
    parentId:node.parent&&idByNode.has(node.parent)?idByNode.get(node.parent):null
  })).sort((a,b)=>a.start-b.start || b.end-a.end || a.kind.localeCompare(b.kind));
}

function htmlSemanticUnits(source) {
  const nodes=[];
  const stack=[];
  const lower=source.toLowerCase();
  let i=0;
  while(i<source.length){
    const raw=stack.at(-1);
    if(raw&&HTML_RAW_TEXT_ELEMENTS.has(raw.name)){
      const closeStart=lower.indexOf(`</${raw.name}`,i);
      if(closeStart===-1)break;
      i=closeStart;
    } else if(source[i]!=='<') { i++; continue; }
    const tag=readHtmlTag(source,i);
    if(!tag){i++;continue;}
    if(tag.special){i=Math.max(i+1,tag.end);continue;}
    if(tag.closing){
      const current=stack.at(-1);
      if(current&&current.name===tag.name){current.end=tag.end;current.closed=true;stack.pop();}
      i=tag.end;continue;
    }
    const parent=stack.at(-1)||null;
    const node={name:tag.name,start:i,end:tag.end,kind:'element',depth:stack.length,parent,closed:false};
    nodes.push(node);
    if(tag.selfClosing||HTML_VOID_ELEMENTS.has(tag.name))node.closed=true;else stack.push(node);
    i=tag.end;
  }
  return finalizeHierarchicalUnits('html',source,nodes);
}

function skipCssComment(source,index,limit=source.length) {
  const close=source.indexOf('*/',index+2);
  return close===-1?limit:Math.min(limit,close+2);
}
function findCssMatchingBrace(source,open,limit=source.length) {
  let depth=0,quote=null;
  for(let i=open;i<limit;i++){
    const ch=source[i];
    if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='/'&&source[i+1]==='*'){i=skipCssComment(source,i,limit)-1;continue;}
    if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return i;
  }
  return -1;
}
function cssTopLevelBlocks(source,start,end,parent,depth,nodes) {
  let segmentStart=start,quote=null;
  for(let i=start;i<end;i++){
    const ch=source[i];
    if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='/'&&source[i+1]==='*'){i=skipCssComment(source,i,end)-1;continue;}
    if(ch===';'){segmentStart=i+1;continue;}
    if(ch!=='{')continue;
    const close=findCssMatchingBrace(source,i,end);
    if(close===-1)break;
    let ruleStart=segmentStart;while(ruleStart<i&&/\s/.test(source[ruleStart]))ruleStart++;
    if(ruleStart<i){const node={start:ruleStart,end:close+1,kind:'rule',depth,parent,closed:true,bodyStart:i+1,bodyEnd:close};nodes.push(node);cssTopLevelBlocks(source,i+1,close,node,depth+1,nodes);}
    i=close;segmentStart=close+1;
  }
}
function cssHasDirectChildRule(node,nodes){return nodes.some(candidate=>candidate.parent===node&&candidate.kind==='rule');}
function cssDeclarationNodes(source,node,nodes) {
  if(cssHasDirectChildRule(node,nodes))return [];
  const declarations=[];
  const start=node.bodyStart,end=node.bodyEnd;
  let segmentStart=start,quote=null,paren=0,bracket=0;
  const emit=segmentEnd=>{
    let a=segmentStart,b=segmentEnd;while(a<b&&/\s/.test(source[a]))a++;while(b>a&&/\s/.test(source[b-1]))b--;
    if(a>=b)return;const text=source.slice(a,b);if(!text.includes(':')||text.trimStart().startsWith('@'))return;
    declarations.push({start:a,end:b,kind:'declaration',depth:node.depth+1,parent:node,closed:true});
  };
  for(let i=start;i<end;i++){
    const ch=source[i];
    if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='/'&&source[i+1]==='*'){i=skipCssComment(source,i,end)-1;continue;}
    if(ch==='('){paren++;continue;}if(ch===')'&&paren){paren--;continue;}if(ch==='['){bracket++;continue;}if(ch===']'&&bracket){bracket--;continue;}
    if(ch===';'&&paren===0&&bracket===0){emit(i+1);segmentStart=i+1;}
  }
  if(segmentStart<end)emit(end);
  return declarations;
}
function cssSemanticUnits(source) {
  const nodes=[];cssTopLevelBlocks(source,0,source.length,null,0,nodes);
  for(const node of [...nodes])nodes.push(...cssDeclarationNodes(source,node,nodes));
  return finalizeHierarchicalUnits('css',source,nodes);
}

export function semanticUnits(axis, source) {
  source=String(source??'');
  if(axis==='html')return htmlSemanticUnits(source);
  if(axis==='css')return cssSemanticUnits(source);
  if(axis==='js'){
    const units=[];const line=/[^\n;{}]+(?:\([^\n{}]*\)\s*=>\s*\{[^{}]*\}|\{[^{}]*\})?\s*;?/g;let m;
    while((m=line.exec(source)))if(m[0].trim())units.push({id:unitId(axis,m.index,m.index+m[0].length),axis,start:m.index,end:m.index+m[0].length,kind:'statement',text:m[0],depth:0,parentId:null});
    return units.sort((a,b)=>a.start-b.start||a.end-b.end);
  }
  throw new Error('INVALID_AXIS');
}

export function removeUnits(source, units) {
  const ordered=[...units].filter(unit=>Number.isInteger(unit?.start)&&Number.isInteger(unit?.end)&&unit.start>=0&&unit.end>=unit.start).sort((a,b)=>a.start-b.start||b.end-a.end);
  const merged=[];
  for(const unit of ordered){const last=merged.at(-1);if(last&&unit.start<=last.end)last.end=Math.max(last.end,unit.end);else merged.push({start:unit.start,end:unit.end});}
  let out=String(source??'');for(const range of merged.reverse())out=out.slice(0,range.start)+out.slice(range.end);return out;
}

export function protectedHierarchyIds(units, explicitIds=[]) {
  const byId=new Map(units.map(unit=>[unit.id,unit]));
  const protectedIds=new Set();
  for(const id of explicitIds){
    let current=byId.get(id);
    if(!current)continue;
    protectedIds.add(current.id);
    while(current.parentId){
      protectedIds.add(current.parentId);
      current=byId.get(current.parentId);
      if(!current)break;
    }
  }
  return protectedIds;
}

function normalizedRemovalRanges(units) {
  const ordered=[...units].sort((a,b)=>a.start-b.start||b.end-a.end);
  const ranges=[];
  for(const unit of ordered){
    const last=ranges.at(-1);
    if(last&&unit.start<=last.end)last.end=Math.max(last.end,unit.end);
    else ranges.push({start:unit.start,end:unit.end});
  }
  return ranges;
}

export function remapUnitAfterRemoval(unit, removedUnits, nextUnits) {
  if(!unit)return null;
  let shift=0;
  for(const range of normalizedRemovalRanges(removedUnits)){
    if(range.end<=unit.start){shift+=range.end-range.start;continue;}
    if(range.start>=unit.end)break;
    return null;
  }
  const start=unit.start-shift,end=unit.end-shift;
  return nextUnits.find(candidate=>candidate.start===start&&candidate.end===end&&candidate.kind===unit.kind&&candidate.text===unit.text)||null;
}

function hasRemovedAncestor(unit,byId,removedIds,additionalIds=null) {
  let current=unit;
  while(current?.parentId){
    if(removedIds.has(current.parentId)||additionalIds?.has(current.parentId))return true;
    current=byId.get(current.parentId);
  }
  return false;
}

export async function hierarchicalReduce(units,evaluateRemovedIds,{protectedItems=[],maxTrials=100}={}) {
  const byId=new Map(units.map(unit=>[unit.id,unit]));
  const explicitIds=protectedItems.map(item=>typeof item==='string'?item:item?.id).filter(Boolean);
  const protectedIds=protectedHierarchyIds(units,explicitIds);
  const removedIds=new Set();
  const trials=[];
  const frontiers=[];
  let trialCount=0;
  const run=async(ids,depth,keptCount)=>{
    if(trialCount>=maxTrials)throw new Error('TRIAL_BUDGET_EXHAUSTED');
    trialCount++;
    const status=await evaluateRemovedIds(new Set(ids));
    trials.push({depth,keptCount,status});
    return status;
  };
  if((await run(removedIds,-1,units.length))!=='FAIL')throw new Error('BASELINE_NOT_FAILING');
  const maxDepth=units.reduce((max,unit)=>Math.max(max,Number.isInteger(unit.depth)?unit.depth:0),0);
  for(let depth=0;depth<=maxDepth;depth++){
    const frontier=units.filter(unit=>(unit.depth||0)===depth&&!removedIds.has(unit.id)&&!hasRemovedAncestor(unit,byId,removedIds));
    const removable=frontier.filter(unit=>!protectedIds.has(unit.id));
    if(!frontier.length)continue;
    let kept=[...removable];
    let n=2;
    while(kept.length>=1){
      const size=Math.ceil(kept.length/n);
      let changed=false;
      for(let i=0;i<kept.length;i+=size){
        const chunk=kept.slice(i,i+size);
        const candidateKept=kept.filter(unit=>!chunk.includes(unit));
        const candidateRemoved=new Set(removedIds);
        for(const unit of removable)if(!candidateKept.includes(unit))candidateRemoved.add(unit.id);
        if((await run(candidateRemoved,depth,candidateKept.length))==='FAIL'){
          kept=candidateKept;n=Math.max(2,n-1);changed=true;break;
        }
      }
      if(changed)continue;
      if(n>=kept.length)break;
      n=Math.min(kept.length,n*2);
    }
    const keptIds=new Set(kept.map(unit=>unit.id));
    const removedThis=removable.filter(unit=>!keptIds.has(unit.id));
    for(const unit of removedThis)removedIds.add(unit.id);
    frontiers.push({depth,candidates:frontier.length,removable:removable.length,removed:removedThis.length,kept:frontier.length-removedThis.length,overlapFree:true});
  }
  return {removedIds,trials,trialCount,frontiers,protectedIds};
}

export async function ddminReduce(items, evaluate, { protectedItems=[], maxTrials=100 }={}) {
  const protectedSet=new Set(protectedItems);const protectedOrdered=items.filter(x=>protectedSet.has(x));let removable=items.filter(x=>!protectedSet.has(x));let trials=[];let count=0;
  const run=async candidateRemovable=>{if(count>=maxTrials)throw new Error('TRIAL_BUDGET_EXHAUSTED');count++;const kept=items.filter(x=>protectedSet.has(x)||candidateRemovable.includes(x));const status=await evaluate(kept);trials.push({keptCount:kept.length,status});return status;};
  if((await run(removable))!=='FAIL')throw new Error('BASELINE_NOT_FAILING');let n=2;
  while(removable.length>=1){if(!removable.length)break;const size=Math.ceil(removable.length/n);let changed=false;for(let i=0;i<removable.length;i+=size){const chunk=removable.slice(i,i+size);const candidate=removable.filter(x=>!chunk.includes(x));if((await run(candidate))==='FAIL'){removable=candidate;n=Math.max(2,n-1);changed=true;break;}}if(changed)continue;if(n>=removable.length)break;n=Math.min(removable.length,n*2);}
  const keptSet=new Set([...protectedOrdered,...removable]);return {items:items.filter(x=>keptSet.has(x)),trials,trialCount:count};
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
    assertRevision(expectedRevision);value=clone(nextValue);revision++;snapshots.set(current(),clone(value));trimSnapshots(snapshots,current());ledger.push({...event,revision:current(),at:new Date().toISOString()});if(ledger.length>MAX_REVISION_LEDGER)ledger.splice(0,ledger.length-MAX_REVISION_LEDGER);return inspect();
  };
  const restore=(targetRevision,expectedRevision=current())=>{assertRevision(expectedRevision);if(!snapshots.has(targetRevision))throw new Error('REVISION_NOT_FOUND');return commit(snapshots.get(targetRevision),{kind:'restore',from:targetRevision},expectedRevision);};
  const dump=()=>({version:1,revision,value:clone(value),snapshots:[...snapshots.entries()].map(([rev,snapshot])=>[rev,clone(snapshot)]),ledger:clone(ledger)});
  return {inspect,commit,restore,assertRevision,snapshot:rev=>snapshots.has(rev)?clone(snapshots.get(rev)):undefined,dump};
}

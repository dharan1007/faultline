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

function unit(axis, source, start, end, kind, depth=0, parentId=null) {
  return { id:`${axis}:${start}:${end}`, axis, start, end, kind, text:source.slice(start,end), depth, parentId };
}

function findTagEnd(source,start){
  let quote=null;
  for(let i=start+1;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(ch==='\\'){i++;continue;}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='>')return i+1;
  }
  return -1;
}

function scanHtml(source){
  const nodes=[];
  const stack=[];
  let cursor=0;
  while(cursor<source.length){
    const lt=source.indexOf('<',cursor);
    if(lt<0)break;
    if(source.startsWith('<!--',lt)){
      const end=source.indexOf('-->',lt+4);
      cursor=end<0?source.length:end+3;
      continue;
    }
    if(source.startsWith('<![CDATA[',lt)){
      const end=source.indexOf(']]>',lt+9);
      cursor=end<0?source.length:end+3;
      continue;
    }
    const tagEnd=findTagEnd(source,lt);
    if(tagEnd<0)break;
    const token=source.slice(lt,tagEnd);
    if(/^<\s*!|^<\s*\?/.test(token)){cursor=tagEnd;continue;}
    const close=/^<\s*\/\s*([A-Za-z][\w:-]*)[^>]*>$/.exec(token);
    if(close){
      const name=close[1].toLowerCase();
      let match=-1;
      for(let i=stack.length-1;i>=0;i--)if(stack[i].name===name){match=i;break;}
      if(match>=0){
        const node=stack[match];
        node.end=tagEnd;
        nodes.push(node);
        stack.splice(match);
      }
      cursor=tagEnd;
      continue;
    }
    const open=/^<\s*([A-Za-z][\w:-]*)\b/.exec(token);
    if(!open){cursor=tagEnd;continue;}
    const name=open[1].toLowerCase();
    const parent=stack.at(-1)||null;
    const isSelfClosing=/\/\s*>$/.test(token);
    const node={start:lt,end:null,name,parent};
    if(HTML_VOID_ELEMENTS.has(name)||isSelfClosing){
      node.end=tagEnd;
      nodes.push(node);
      cursor=tagEnd;
      continue;
    }
    if(HTML_RAW_TEXT_ELEMENTS.has(name)){
      const closeRe=new RegExp(`<\\s*\\/\\s*${name}\\s*>`,'ig');
      closeRe.lastIndex=tagEnd;
      const closing=closeRe.exec(source);
      node.end=closing?closing.index+closing[0].length:tagEnd;
      nodes.push(node);
      cursor=node.end;
      continue;
    }
    stack.push(node);
    cursor=tagEnd;
  }
  const emitted=new Set(nodes);
  const resolveParent=node=>{
    let parent=node.parent;
    while(parent&&!emitted.has(parent))parent=parent.parent;
    return parent||null;
  };
  const depthOf=node=>{
    let depth=0,parent=resolveParent(node),seen=new Set();
    while(parent&&!seen.has(parent)){seen.add(parent);depth++;parent=resolveParent(parent);}
    return depth;
  };
  const ids=new Map(nodes.map(node=>[node,`html:${node.start}:${node.end}`]));
  return nodes.map(node=>unit('html',source,node.start,node.end,'element',depthOf(node),ids.get(resolveParent(node))||null));
}

function skipCssTrivia(source,index,end){
  let i=index;
  while(i<end){
    if(/\s/.test(source[i])){i++;continue;}
    if(source.startsWith('/*',i)){
      const close=source.indexOf('*/',i+2);
      i=close<0?end:Math.min(end,close+2);
      continue;
    }
    break;
  }
  return i;
}

function cssBalancedBlockEnd(source,open,end){
  let depth=1,quote=null,inComment=false;
  for(let i=open+1;i<end;i++){
    const ch=source[i],next=source[i+1];
    if(inComment){if(ch==='*'&&next==='/'){inComment=false;i++;}continue;}
    if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='/'&&next==='*'){inComment=true;i++;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  return -1;
}

function cssPreludeOpen(source,start,end){
  let quote=null,inComment=false,paren=0,bracket=0;
  for(let i=start;i<end;i++){
    const ch=source[i],next=source[i+1];
    if(inComment){if(ch==='*'&&next==='/'){inComment=false;i++;}continue;}
    if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='/'&&next==='*'){inComment=true;i++;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='(')paren++;
    else if(ch===')'&&paren)paren--;
    else if(ch==='[')bracket++;
    else if(ch===']'&&bracket)bracket--;
    else if(ch==='{'&&!paren&&!bracket)return i;
    else if(ch===';'&&!paren&&!bracket)return -(i+1);
  }
  return -0;
}

function declarationRanges(source,start,end){
  const ranges=[];
  let segment=start,quote=null,inComment=false,paren=0,bracket=0,brace=0;
  const push=endExclusive=>{
    let s=segment,e=endExclusive;
    while(s<e&&/\s/.test(source[s]))s++;
    while(e>s&&/\s/.test(source[e-1]))e--;
    if(s<e){
      const text=source.slice(s,e);
      if(text.includes(':'))ranges.push([s,e]);
    }
  };
  for(let i=start;i<end;i++){
    const ch=source[i],next=source[i+1];
    if(inComment){if(ch==='*'&&next==='/'){inComment=false;i++;}continue;}
    if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='/'&&next==='*'){inComment=true;i++;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='(')paren++;
    else if(ch===')'&&paren)paren--;
    else if(ch==='[')bracket++;
    else if(ch===']'&&bracket)bracket--;
    else if(ch==='{')brace++;
    else if(ch==='}'&&brace)brace--;
    else if(ch===';'&&!paren&&!bracket&&!brace){push(i+1);segment=i+1;}
  }
  push(end);
  return ranges;
}

function isNestedAtRule(prelude){
  return /^@(media|supports|layer|container|scope|starting-style|document|keyframes|-\w+-keyframes)\b/i.test(prelude.trim());
}

function scanCssRange(source,start,end,parent=null,depth=0,nodes=[]){
  let cursor=start;
  while(cursor<end){
    cursor=skipCssTrivia(source,cursor,end);
    if(cursor>=end)break;
    const marker=cssPreludeOpen(source,cursor,end);
    if(marker<0){cursor=(-marker);continue;}
    if(marker===0&&source[cursor]!=='{')break;
    const open=marker===0?cursor:marker;
    const close=cssBalancedBlockEnd(source,open,end);
    if(close<0)break;
    const prelude=source.slice(cursor,open).trim();
    if(!prelude){cursor=close+1;continue;}
    const node={start:cursor,end:close+1,parent,depth,kind:'rule'};
    nodes.push(node);
    if(isNestedAtRule(prelude)){
      scanCssRange(source,open+1,close,node,depth+1,nodes);
    }else{
      for(const [declStart,declEnd] of declarationRanges(source,open+1,close))nodes.push({start:declStart,end:declEnd,parent:node,depth:depth+1,kind:'declaration'});
    }
    cursor=close+1;
  }
  return nodes;
}

function scanCss(source){
  const nodes=scanCssRange(source,0,source.length);
  const ids=new Map(nodes.map(node=>[node,`css:${node.start}:${node.end}`]));
  return nodes.map(node=>unit('css',source,node.start,node.end,node.kind,node.depth,ids.get(node.parent)||null));
}

export function semanticUnits(axis, source) {
  source = String(source ?? '');
  let units;
  if (axis === 'html') units=scanHtml(source);
  else if (axis === 'css') units=scanCss(source);
  else if (axis === 'js') {
    units=[];
    const line = /[^\n;{}]+(?:\([^\n{}]*\)\s*=>\s*\{[^{}]*\}|\{[^{}]*\})?\s*;?/g; let m;
    while ((m=line.exec(source))) if (m[0].trim()) units.push(unit('js',source,m.index,m.index+m[0].length,'statement',0,null));
  } else throw new Error('INVALID_AXIS');
  return units.sort((a,b)=>a.start-b.start || b.end-a.end || a.kind.localeCompare(b.kind));
}

export function ancestorClosure(units,pinnedIds=[]) {
  const byId=new Map(units.map(item=>[item.id,item]));
  const protectedIds=new Set();
  for(const pinnedId of pinnedIds){
    let current=byId.get(pinnedId),seen=new Set();
    while(current&&!seen.has(current.id)){
      seen.add(current.id);
      protectedIds.add(current.id);
      current=current.parentId?byId.get(current.parentId):null;
    }
  }
  return protectedIds;
}

export function hierarchyFrontier(units,_protectedIds=new Set(),depth=0) {
  const byId=new Map(units.map(item=>[item.id,item]));
  return units.filter(item=>item.depth===depth&&(!item.parentId||byId.has(item.parentId))).sort((a,b)=>a.start-b.start||b.end-a.end);
}

export function removeUnits(source, units) {
  const ordered=[...units].sort((a,b)=>a.start-b.start||b.end-a.end);
  const ranges=[];
  for(const item of ordered){
    if(!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start<0||item.end<item.start)continue;
    const previous=ranges.at(-1);
    if(previous&&item.start>=previous.start&&item.end<=previous.end)continue;
    if(previous&&item.start<previous.end)previous.end=Math.max(previous.end,item.end);
    else ranges.push({start:item.start,end:item.end});
  }
  let out = String(source ?? '');
  for (const range of ranges.reverse()) out = out.slice(0,range.start)+out.slice(range.end);
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

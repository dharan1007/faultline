import { readFileSync, writeFileSync } from 'node:fs';

const path='src/runtime.js';
let source=readFileSync(path,'utf8');
function replaceOnce(before,after,label){
  const first=source.indexOf(before);
  if(first<0)throw new Error(`PATCH_TARGET_MISSING:${label}`);
  if(source.indexOf(before,first+1)>=0)throw new Error(`PATCH_TARGET_AMBIGUOUS:${label}`);
  source=source.slice(0,first)+after+source.slice(first+before.length);
}

replaceOnce(
"function pinKey(targetAxis,unitId){ return `${targetAxis}|${unitId}`; }",
`function pinKey(targetAxis,unitId){ return \`${'${targetAxis}'}|${'${unitId}'}\`; }
function directPinnedUnitIds(targetAxis){
  const prefix=\`${'${targetAxis}'}|\`;
  return [...pins].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length));
}
function normalizedUnitSignature(unit){
  const text=String(unit?.text??'').trim();
  if(unit?.axis==='html'){
    const open=/^<\\s*[A-Za-z][^>]*>/.exec(text)?.[0];
    return (open||text).replace(/\\s+/g,' ').trim();
  }
  if(unit?.axis==='css'&&unit?.kind==='rule'){
    const brace=text.indexOf('{');
    return (brace>=0?text.slice(0,brace):text).replace(/\\s+/g,' ').trim();
  }
  return text.replace(/\\s+/g,' ').trim();
}
function unitDescriptor(unit,byId){
  const ancestors=[];
  let parent=unit?.parentId?byId.get(unit.parentId):null;
  while(parent){ancestors.unshift(\`${'${parent.kind}'}:${'${normalizedUnitSignature(parent)}'}\`);parent=parent.parentId?byId.get(parent.parentId):null;}
  return {kind:unit.kind,signature:normalizedUnitSignature(unit),ancestors};
}
function descriptorKey(descriptor){return JSON.stringify([descriptor.kind,descriptor.signature,descriptor.ancestors]);}
function capturePinDescriptors(targetAxis,source){
  const units=unitsFor(targetAxis,source),byId=new Map(units.map(unit=>[unit.id,unit]));
  return directPinnedUnitIds(targetAxis).map(id=>{
    const unit=byId.get(id);
    if(!unit)throw new Error('PIN_REMAP_FAILED');
    return unitDescriptor(unit,byId);
  });
}
function resolvePinDescriptors(targetAxis,source,descriptors){
  if(!descriptors.length)return [];
  const units=unitsFor(targetAxis,source),byId=new Map(units.map(unit=>[unit.id,unit]));
  const buckets=new Map();
  for(const unit of units){const key=descriptorKey(unitDescriptor(unit,byId));const bucket=buckets.get(key)||[];bucket.push(unit.id);buckets.set(key,bucket);}
  return descriptors.map(descriptor=>{
    const matches=buckets.get(descriptorKey(descriptor))||[];
    if(matches.length!==1)throw new Error('PIN_REMAP_FAILED');
    return matches[0];
  });
}
function annotatedUnits(targetAxis=axis,source=value()[targetAxis],directIds=directPinnedUnitIds(targetAxis)){
  const raw=unitsFor(targetAxis,source),byId=new Map(raw.map(unit=>[unit.id,unit])),direct=new Set(directIds),protectedAncestors=new Set();
  for(const id of direct){
    let cursor=byId.get(id);
    while(cursor?.parentId){protectedAncestors.add(cursor.parentId);cursor=byId.get(cursor.parentId);}
  }
  return raw.map(unit=>({...unit,pinned:direct.has(unit.id),protectedByDescendant:protectedAncestors.has(unit.id)}));
}
async function hierarchicalReduceSource(targetAxis,source,evaluate,{maxTrials=80}={}){
  const descriptors=capturePinDescriptors(targetAxis,source);
  let trialCount=0,removedCount=0,currentSource=source,passes=[];
  const run=async candidate=>{
    if(trialCount>=maxTrials)throw new Error('TRIAL_BUDGET_EXHAUSTED');
    trialCount++;
    return evaluate(candidate);
  };
  if(await run(currentSource)!=='FAIL')throw new Error('BASELINE_NOT_FAILING');
  for(let depth=0;;depth++){
    const currentDirectIds=resolvePinDescriptors(targetAxis,currentSource,descriptors);
    const all=annotatedUnits(targetAxis,currentSource,currentDirectIds);
    const maxDepth=all.reduce((max,unit)=>Math.max(max,unit.depth||0),-1);
    if(depth>maxDepth)break;
    const frontier=all.filter(unit=>(unit.depth||0)===depth);
    if(!frontier.length)continue;
    const protectedIds=new Set(frontier.filter(unit=>unit.pinned||unit.protectedByDescendant).map(unit=>unit.id));
    const originalSource=currentSource;
    let removable=frontier.filter(unit=>!protectedIds.has(unit.id));
    let n=2;
    while(removable.length>=1){
      const size=Math.ceil(removable.length/n);
      let changed=false;
      for(let i=0;i<removable.length;i+=size){
        const chunk=removable.slice(i,i+size),chunkIds=new Set(chunk.map(unit=>unit.id));
        const candidateRemovable=removable.filter(unit=>!chunkIds.has(unit.id));
        const candidateIds=new Set(candidateRemovable.map(unit=>unit.id));
        const removed=frontier.filter(unit=>!protectedIds.has(unit.id)&&!candidateIds.has(unit.id));
        const candidateSource=removeUnits(originalSource,removed);
        if(await run(candidateSource)==='FAIL'){
          removable=candidateRemovable;
          n=Math.max(2,n-1);
          changed=true;
          break;
        }
      }
      if(changed)continue;
      if(n>=removable.length)break;
      n=Math.min(removable.length,n*2);
    }
    const keptIds=new Set(removable.map(unit=>unit.id));
    const removed=frontier.filter(unit=>!protectedIds.has(unit.id)&&!keptIds.has(unit.id));
    if(removed.length){
      currentSource=removeUnits(originalSource,removed);
      removedCount+=removed.length;
      passes.push({depth,removed:removed.length,before:originalSource.length,after:currentSource.length});
      resolvePinDescriptors(targetAxis,currentSource,descriptors);
    }else passes.push({depth,removed:0,before:originalSource.length,after:originalSource.length});
  }
  return {source:currentSource,trialCount,removedCount,passes,pinIds:resolvePinDescriptors(targetAxis,currentSource,descriptors)};
}`,
'pin hierarchy helpers');

replaceOnce(
`function units({targetAxis=axis}={}){
  if(!['html','css','js'].includes(targetAxis))throw new Error('INVALID_AXIS');
  const s=store.inspect();
  return {revision:s.revision,targetAxis,units:unitsFor(targetAxis,s.value[targetAxis]).map(unit=>({id:unit.id,kind:unit.kind,text:unit.text,pinned:pins.has(pinKey(targetAxis,unit.id))}))};
}`,
`function units({targetAxis=axis}={}){
  if(!['html','css','js'].includes(targetAxis))throw new Error('INVALID_AXIS');
  const s=store.inspect();
  return {revision:s.revision,targetAxis,units:annotatedUnits(targetAxis,s.value[targetAxis]).map(unit=>({id:unit.id,kind:unit.kind,text:unit.text,parentId:unit.parentId,depth:unit.depth,pinned:unit.pinned,protectedByDescendant:unit.protectedByDescendant}))};
}`,
'unit API');

replaceOnce(
"async function probe({expectedRevision=revision(),targetAxis=axis,unitId}, {signal}={}){ const testedRevision=expectedRevision;store.assertRevision(testedRevision);const source=value()[targetAxis];const unit=unitsFor(targetAxis,source).find(u=>u.id===unitId);if(!unit)throw new Error('UNIT_NOT_FOUND');if(pins.has(pinKey(targetAxis,unitId)))throw new Error('UNIT_PINNED');const candidate={...value(),[targetAxis]:removeUnits(source,[unit])};const result=await runCase(candidate,{signal});throwIfAborted(signal);record('probe',result,{axis:targetAxis,unitId,mutated:false,revision:testedRevision});return {...result,mutated:false,testedRevision,canonicalRevision:revision()}; }",
"async function probe({expectedRevision=revision(),targetAxis=axis,unitId}, {signal}={}){ const testedRevision=expectedRevision;store.assertRevision(testedRevision);const source=value()[targetAxis];const unit=annotatedUnits(targetAxis,source).find(u=>u.id===unitId);if(!unit)throw new Error('UNIT_NOT_FOUND');if(unit.pinned||unit.protectedByDescendant)throw new Error('UNIT_PINNED');const candidate={...value(),[targetAxis]:removeUnits(source,[unit])};const result=await runCase(candidate,{signal});throwIfAborted(signal);record('probe',result,{axis:targetAxis,unitId,mutated:false,revision:testedRevision});return {...result,mutated:false,testedRevision,canonicalRevision:revision()}; }",
'probe ancestor protection');

replaceOnce(
`async function reduce({expectedRevision=revision(),targetAxis=axis,maxTrials=80}={}, {signal}={}){
  store.assertRevision(expectedRevision);throwIfAborted(signal);
  const baseline=clone(value());
  const source=baseline[targetAxis], all=unitsFor(targetAxis,source);
  if(!all.length) return {status:'NO_UNITS',before:source.length,after:source.length,reduction:0,trials:0,revision:revision()};
  const protectedItems=all.filter(u=>pins.has(pinKey(targetAxis,u.id)));
  const reduced=await ddminReduce(all,async kept=>{throwIfAborted(signal);const keptIds=new Set(kept.map(u=>u.id));const removed=all.filter(u=>!keptIds.has(u.id));return (await runCase({...baseline,[targetAxis]:removeUnits(source,removed)},{signal})).status;},{protectedItems,maxTrials});
  throwIfAborted(signal);
  const keptIds=new Set(reduced.items.map(u=>u.id));const removed=all.filter(u=>!keptIds.has(u.id));const nextSource=removeUnits(source,removed);const final=await runCase({...baseline,[targetAxis]:nextSource},{signal});
  throwIfAborted(signal);if(final.status!=='FAIL')throw new Error('REDUCTION_LOST_FAILURE');
  const beforeLength=source.length,after=nextSource.length,before=snapshotCanonical();
  const committed=store.commit({...baseline,[targetAxis]:nextSource},{kind:'reduce',axis:targetAxis,trials:reduced.trialCount,removed:removed.length},expectedRevision);
  rememberRevision(committed.revision,{value:clone(committed.value),pins:[...pins]});
  rememberExperiment({kind:'reduce',status:final.status,evidence:final.evidence||{},revision:committed.revision,at:new Date().toISOString(),axis:targetAxis,trials:reduced.trialCount,removed:removed.length,reduction:beforeLength?1-after/beforeLength:0});
  persistMutation(before);render();renderPreview();renderHealth(final.status);
  return {status:final.status,before:beforeLength,after,reduction:beforeLength?1-after/beforeLength:0,trials:reduced.trialCount,removed:removed.length,revision:revision()};
}`,
`async function reduce({expectedRevision=revision(),targetAxis=axis,maxTrials=80}={}, {signal}={}){
  store.assertRevision(expectedRevision);throwIfAborted(signal);
  const baseline=clone(value());
  const source=baseline[targetAxis],all=unitsFor(targetAxis,source);
  if(!all.length)return {status:'NO_UNITS',before:source.length,after:source.length,reduction:0,trials:0,removed:0,passes:0,revision:revision()};
  const pinDescriptors=capturePinDescriptors(targetAxis,source);
  let nextSource,reducedTrialCount,removedCount,passes=[];
  if(targetAxis==='html'||targetAxis==='css'){
    const reduced=await hierarchicalReduceSource(targetAxis,source,async candidateSource=>{throwIfAborted(signal);return (await runCase({...baseline,[targetAxis]:candidateSource},{signal})).status;},{maxTrials});
    nextSource=reduced.source;reducedTrialCount=reduced.trialCount;removedCount=reduced.removedCount;passes=reduced.passes;
  }else{
    const protectedItems=all.filter(unit=>pins.has(pinKey(targetAxis,unit.id)));
    const reduced=await ddminReduce(all,async kept=>{throwIfAborted(signal);const keptIds=new Set(kept.map(unit=>unit.id));const removed=all.filter(unit=>!keptIds.has(unit.id));return (await runCase({...baseline,[targetAxis]:removeUnits(source,removed)},{signal})).status;},{protectedItems,maxTrials});
    const keptIds=new Set(reduced.items.map(unit=>unit.id)),removed=all.filter(unit=>!keptIds.has(unit.id));
    nextSource=removeUnits(source,removed);reducedTrialCount=reduced.trialCount;removedCount=removed.length;
  }
  throwIfAborted(signal);
  const remappedPinIds=resolvePinDescriptors(targetAxis,nextSource,pinDescriptors);
  const final=await runCase({...baseline,[targetAxis]:nextSource},{signal});
  throwIfAborted(signal);if(final.status!=='FAIL')throw new Error('REDUCTION_LOST_FAILURE');
  store.assertRevision(expectedRevision);
  const beforeLength=source.length,after=nextSource.length,before=snapshotCanonical();
  const nextPins=new Set([...pins].filter(key=>!key.startsWith(\`${'${targetAxis}'}|\`)));
  for(const id of remappedPinIds)nextPins.add(pinKey(targetAxis,id));
  pins=nextPins;
  const committed=store.commit({...baseline,[targetAxis]:nextSource},{kind:'reduce',axis:targetAxis,trials:reducedTrialCount,removed:removedCount,passes:passes.length},expectedRevision);
  rememberRevision(committed.revision,{value:clone(committed.value),pins:[...pins]});
  rememberExperiment({kind:'reduce',status:final.status,evidence:final.evidence||{},revision:committed.revision,at:new Date().toISOString(),axis:targetAxis,trials:reducedTrialCount,removed:removedCount,passes:passes.length,reduction:beforeLength?1-after/beforeLength:0});
  persistMutation(before);render();renderPreview();renderHealth(final.status);
  return {status:final.status,before:beforeLength,after,reduction:beforeLength?1-after/beforeLength:0,trials:reducedTrialCount,removed:removedCount,passes:passes.length,revision:revision()};
}`,
'hierarchical reduce');

replaceOnce(
"function renderUnits(){const list=$('units'),units=unitsFor();list.innerHTML='';selectedUnitId=null;for(const unit of units){const row=document.createElement('button');row.type='button';row.className='unit';row.dataset.unitId=unit.id;row.setAttribute('aria-pressed','false');const pinned=pins.has(pinKey(axis,unit.id));row.innerHTML=`<span>${escapeHtml(unit.text.trim().replace(/\\s+/g,' ').slice(0,120))}</span><small>${unit.kind}${pinned?' · pinned':''}</small>`;row.onclick=()=>{document.querySelectorAll('.unit').forEach(x=>x.setAttribute('aria-pressed','false'));row.setAttribute('aria-pressed','true');selectedUnitId=unit.id;$('probe').disabled=false;$('pin').disabled=false;};list.appendChild(row)}$('unit-count').textContent=`${units.length} units`;}",
"function renderUnits(){const list=$('units'),listed=units({targetAxis:axis}).units;list.innerHTML='';selectedUnitId=null;for(const unit of listed){const row=document.createElement('button');row.type='button';row.className='unit';row.dataset.unitId=unit.id;row.dataset.depth=String(unit.depth);row.setAttribute('aria-pressed','false');row.style.paddingInlineStart=`calc(12px + ${Math.min(unit.depth,6)} * 14px)`;const protection=unit.pinned?' · pinned':unit.protectedByDescendant?' · protected by pinned descendant':'';row.innerHTML=`<span>${escapeHtml(unit.text.trim().replace(/\\s+/g,' ').slice(0,120))}</span><small>${unit.kind} · depth ${unit.depth}${protection}</small>`;row.onclick=()=>{document.querySelectorAll('.unit').forEach(x=>x.setAttribute('aria-pressed','false'));row.setAttribute('aria-pressed','true');selectedUnitId=unit.id;$('probe').disabled=unit.pinned||unit.protectedByDescendant;$('pin').disabled=false;};list.appendChild(row)}$('unit-count').textContent=`${listed.length} units`;}",
'unit UI');

replaceOnce(
"['faultline_units','List actionable semantic units and pin state for one canonical source axis.',",
"['faultline_units','List canonical semantic units with hierarchy, direct pin state, and ancestor protection for one source axis.',",
'WebMCP unit description');

writeFileSync(path,source);
console.log('runtime hierarchy patch applied');

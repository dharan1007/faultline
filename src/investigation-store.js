import {canonicalJson,sha256Hex,validateInvestigation} from './investigation-protocol.js';

const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const revisionNumber=revision=>Number(String(revision).slice(1));

export function createInvestigationStore(initial){
  let current=validateInvestigation(initial);
  const snapshots=new Map([[current.revision,clone(current)]]);
  const ledger=[];

  const inspect=()=>clone(current);
  const assertRevision=expected=>{if(expected!==current.revision)throw new Error(`STALE_REVISION expected=${expected} current=${current.revision}`);};
  const advance=(candidate,event)=>{
    const next=validateInvestigation({...clone(candidate),id:current.id,schemaVersion:current.schemaVersion,createdAt:current.createdAt,revision:`r${revisionNumber(current.revision)+1}`,updatedAt:new Date().toISOString()});
    current=next;snapshots.set(current.revision,clone(current));
    ledger.push({...clone(event),revision:current.revision,at:current.updatedAt});
    if(snapshots.size>32){const oldest=snapshots.keys().next().value;if(oldest!==current.revision)snapshots.delete(oldest);}
    if(ledger.length>64)ledger.splice(0,ledger.length-64);
    return inspect();
  };

  const commit=(expectedRevision,mutator,event={})=>{
    assertRevision(expectedRevision);
    if(typeof mutator!=='function')throw new Error('INVALID_INVESTIGATION_MUTATOR');
    const before=inspect();
    const proposed=mutator(clone(before));
    if(!proposed||typeof proposed!=='object')throw new Error('INVALID_INVESTIGATION_MUTATION');
    return advance(proposed,event);
  };

  const appendObservation=(expectedRevision,observation)=>commit(expectedRevision,draft=>{
    if(!observation||typeof observation!=='object'||Array.isArray(observation))throw new Error('INVALID_OBSERVATION');
    if(typeof observation.observationId!=='string'||!observation.observationId)throw new Error('INVALID_OBSERVATION');
    if(draft.observations.some(item=>item.observationId===observation.observationId))throw new Error('DUPLICATE_OBSERVATION_ID');
    const previous=draft.observations.at(-1);
    if(previous&&Number(observation.sequence)<=Number(previous.sequence))throw new Error('INVALID_OBSERVATION_SEQUENCE');
    draft.observations=[...draft.observations,clone(observation)];
    return draft;
  },{kind:'observation_append',observationId:observation?.observationId});

  const restore=(targetRevision,expectedRevision)=>{
    assertRevision(expectedRevision);
    const snapshot=snapshots.get(targetRevision);
    if(!snapshot)throw new Error('REVISION_NOT_FOUND');
    return advance(snapshot,{kind:'restore',from:targetRevision});
  };

  const exportBundle=async()=>{
    const investigation=inspect();
    const serialized=canonicalJson(investigation);
    const sha256=await sha256Hex(serialized);
    return {manifest:{schemaVersion:1,kind:'faultline-investigation',investigationId:investigation.id,revision:investigation.revision,sha256},investigation};
  };

  return {inspect,assertRevision,commit,appendObservation,restore,exportBundle,history:()=>clone(ledger)};
}
